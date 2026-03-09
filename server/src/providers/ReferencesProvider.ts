import { Location, Range, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService, SymbolInfo } from '../services/SymbolFinderService';
import { TokenHelper } from '../utils/TokenHelper';
import { ChainedPropertyResolver, ChainedMemberInfo } from '../utils/ChainedPropertyResolver';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ReferencesProvider");
logger.setLevel("info");

/**
 * Provides "Find All References" for Clarion symbols.
 *
 * Two resolution paths:
 *   1. Plain symbol (no dot) — scope-aware variable search (parameter/local/module/global)
 *   2. Member access (has dot, e.g. SELF.Order or mgr.Order) — class member search:
 *      - SELF.Member / SELF.A.B  → resolve via ClassMemberResolver / ChainedPropertyResolver
 *      - localVar.Member         → resolve variable type, then look up member (Tier 2 inference)
 */
export class ReferencesProvider {
    private tokenCache: TokenCache;
    private scopeAnalyzer: ScopeAnalyzer;
    private symbolFinder: SymbolFinderService;
    private memberResolver: ClassMemberResolver;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
        this.memberResolver = new ClassMemberResolver();
    }

    /**
     * Find all references to the symbol at the given position.
     */
    public async provideReferences(
        document: TextDocument,
        position: { line: number; character: number },
        context: { includeDeclaration: boolean }
    ): Promise<Location[] | null> {
        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) return null;

        let word = document.getText(wordRange);
        if (!word || word.length === 0) return null;

        // When cursor lands on any segment of a chained expression (e.g. "Order" in
        // SELF.Order.MainKey, or "Thumb" in SELF.Sort.Thumb), getWordRangeAtPosition
        // may return a partial chain missing the SELF/PARENT anchor.
        // Detect this by checking whether the character immediately before the word
        // is a dot, then walk back to find the SELF/PARENT anchor and reconstruct
        // the full chain (e.g. "Sort.Thumb" → "SELF.Sort.Thumb").
        if (wordRange.start.character > 0) {
            const charBefore = document.getText({
                start: { line: position.line, character: wordRange.start.character - 1 },
                end: { line: position.line, character: wordRange.start.character }
            });
            if (charBefore === '.') {
                const textBeforeDot = document.getText({
                    start: { line: position.line, character: 0 },
                    end: { line: position.line, character: wordRange.start.character - 1 }
                });
                // Match SELF/PARENT anchor with optional intermediate segments
                const anchorMatch = textBeforeDot.match(/\b(SELF|PARENT)(?:\.[A-Za-z0-9_:]+)*$/i);
                if (anchorMatch) {
                    word = anchorMatch[0] + '.' + word;
                    logger.info(`🔗 Reconstructed chained word: "${word}" from middle-segment cursor`);
                } else {
                    // Typed variable access: e.g. INIMgr.Init — pick the nearest identifier before the dot
                    const varMatch = textBeforeDot.match(/\b([A-Za-z_][A-Za-z0-9_]*)$/);
                    if (varMatch) {
                        word = varMatch[1] + '.' + word;
                        logger.info(`🔗 Reconstructed typed-variable word: "${word}" from before-dot identifier`);
                    }
                }
            }
        }

        logger.info(`🔍 Finding references for "${word}" at ${position.line}:${position.character}`);

        // Route to member-access path when word contains a dot
        if (word.includes('.')) {
            return this.provideMemberReferences(word, document, position, context);
        }

        // Check if the cursor is inside a CLASS body BEFORE trying plain symbol search.
        // findSymbol may resolve the word as a different same-named module variable declared
        // before the CLASS, so we must detect CLASS context first.
        const tokens = this.tokenCache.getTokens(document);
        const enclosingClass = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Class &&
            t.line < position.line &&          // CLASS keyword is strictly before cursor line
            t.finishesAt !== undefined &&
            t.finishesAt >= position.line
        );
        if (enclosingClass) {
            const classLine = document.getText({
                start: { line: enclosingClass.line, character: 0 },
                end: { line: enclosingClass.line, character: 999 }
            });
            const moduleMatch = classLine.match(/MODULE\s*\(\s*['"](.+?)['"]\s*\)/i);
            const classModuleFile = moduleMatch?.[1];
            logger.info(`🏛️ "${word}" is inside CLASS body (class=${enclosingClass.label ?? '?'}, module=${classModuleFile ?? 'none'}) — routing to member-access path`);
            return this.provideMemberReferences(`SELF.${word}`, document, position, context, classModuleFile, enclosingClass.label);
        }

        // Plain symbol path
        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position);
        if (!symbolInfo) {
            // Fallback: check if word is a MAP/MODULE-declared procedure (not a variable)
            return this.findProcedureReferences(word, document, tokens, context.includeDeclaration);
        }

        logger.info(`✅ Symbol "${word}" found — scope: ${symbolInfo.scope.type}, declared at ${symbolInfo.location.uri}:${symbolInfo.location.line}`);

        const searchWord = symbolInfo.token.value;
        const filesToSearch = this.getFilesToSearch(symbolInfo, document);

        // When the declaration is in a MEMBER file, also walk MAP INCLUDE files to find
        // the MODULE declaration (e.g. startproc.inc) and add it to the search list.
        if (this.isMemberFile(symbolInfo.location.uri)) {
            const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
            const procedureSubTypes = new Set([
                TokenType.GlobalProcedure, TokenType.MapProcedure,
                TokenType.MethodDeclaration, TokenType.MethodImplementation
            ]);
            const incDecl = await this.findProcedureInMapIncludes(searchWord.toLowerCase(), currentPath, procedureSubTypes);
            if (incDecl && !filesToSearch.includes(incDecl.uri)) {
                filesToSearch.push(incDecl.uri);
            }
        }

        logger.info(`📁 Searching ${filesToSearch.length} file(s) for "${searchWord}"`);

        const locations: Location[] = [];
        for (const fileUri of filesToSearch) {
            const fileLocations = this.findReferencesInFile(fileUri, searchWord, symbolInfo, context.includeDeclaration);
            locations.push(...fileLocations);
        }

        logger.info(`✅ Found ${locations.length} reference(s) to "${searchWord}"`);
        return locations.length > 0 ? locations : null;
    }

    // ─── Member access (SELF.Order, mgr.Order) ───────────────────────────────

    /**
     * Handle Find All References for a dotted member access expression.
     * Resolves the declaring class then searches for all usages of that member.
     */
    private async provideMemberReferences(
        word: string,
        document: TextDocument,
        position: { line: number; character: number },
        context: { includeDeclaration: boolean },
        classModuleFile?: string,
        knownClassName?: string
    ): Promise<Location[] | null> {
        const lastDot = word.lastIndexOf('.');
        const beforeDot = word.substring(0, lastDot);
        const memberName = word.substring(lastDot + 1);

        if (!memberName) return null;

        let declarationFile: string | null = null;
        let declarationLine: number = -1;
        let className: string | null = knownClassName ?? null;

        // --- Resolve the declaring class ---------------------------------
        const isSelfOrParent = /^(self|parent)$/i.test(beforeDot);

        if (isSelfOrParent) {
            const tokens = this.tokenCache.getTokens(document);
            const info = this.memberResolver.findClassMemberInfo(memberName, document, position.line, tokens);
            if (info) {
                declarationFile = info.file;
                declarationLine = info.line;
                className = info.className;
                logger.info(`✅ SELF.${memberName} → class="${info.className}" at ${info.file}:${info.line}`);
            } else {
                logger.info(`⚠️ SELF.${memberName}: class resolution failed, doing best-effort search`);
            }
        } else {
            // Multi-level chain (SELF.A.B), Tier 2 local variable (mgr.Member),
            // or cursor on MethodImplementation line (ClassName.Method PROCEDURE).
            const tokens = this.tokenCache.getTokens(document);

            // Fast path: check if the cursor line IS a MethodImplementation —
            // e.g. "FieldPairsClass.Init PROCEDURE". In that case beforeDot IS the
            // class name; skip variable-type resolution and go straight to member search.
            const implToken = tokens.find(t =>
                t.subType === TokenType.MethodImplementation &&
                t.label &&
                t.line === position.line
            );
            if (implToken && implToken.label) {
                const dotIdx = implToken.label.indexOf('.');
                const implClass = dotIdx > 0 ? implToken.label.substring(0, dotIdx) : null;
                const implMethod = dotIdx > 0 ? implToken.label.substring(dotIdx + 1).toLowerCase() : '';
                if (implClass && implMethod === memberName.toLowerCase()) {
                    // Treat exactly like SELF.Member resolution but with a known class name
                    const info = this.memberResolver.findClassMemberInfo(memberName, document, position.line, tokens);
                    if (info) {
                        declarationFile = info.file;
                        declarationLine = info.line;
                        className = info.className ?? implClass;
                    } else {
                        // findClassMemberInfo failed — CLASS is in an INCLUDE file.
                        // Walk the INCLUDE statements of the current CLW to find the INC
                        // that declares this class, then look up the member there.
                        className = implClass;
                        const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
                        const incUri = await this.findClassDeclarationInIncludes(implClass, currentPath);
                        if (incUri) {
                            const incTokens = this.getTokensForUri(incUri);
                            if (incTokens) {
                                // Find the label token for the member inside the class body
                                const classToken = incTokens.find(t =>
                                    t.type === TokenType.Structure &&
                                    t.subType === TokenType.Class &&
                                    (t.label ?? '').toLowerCase() === implClass.toLowerCase()
                                );
                                if (classToken) {
                                    const memberToken = incTokens.find(t =>
                                        t.type === TokenType.Label &&
                                        t.value.toLowerCase() === memberName.toLowerCase() &&
                                        t.line > classToken.line &&
                                        classToken.finishesAt !== undefined &&
                                        t.line <= classToken.finishesAt
                                    );
                                    if (memberToken) {
                                        declarationFile = incUri;
                                        declarationLine = memberToken.line;
                                    } else {
                                        declarationFile = incUri;
                                    }
                                }
                            }
                        }
                    }
                    logger.info(`✅ MethodImpl cursor: "${implClass}.${memberName}" → class="${className}", decl=${declarationFile ?? 'unknown'}`);
                }
            }

            if (!className) {
                // Normal chain / Tier 2 resolution
                const chainedResolver = new ChainedPropertyResolver();
                const vsPos: Position = { line: position.line, character: position.character };
                let info: ChainedMemberInfo | null = await chainedResolver.resolve(beforeDot, memberName, document, vsPos);

                if (!info) {
                    info = await this.resolveViaVariableType(beforeDot, memberName, document, position);
                }

                if (!info) {
                    const isSelfChain = /^(self|parent)\b/i.test(beforeDot);
                    if (isSelfChain) {
                        logger.info(`⚠️ Chain resolution failed for "${beforeDot}.${memberName}", doing best-effort SELF chain search`);
                    } else {
                        logger.info(`❌ Member "${memberName}" could not be resolved for beforeDot="${beforeDot}"`);
                        return null;
                    }
                } else {
                    declarationFile = info.file;
                    declarationLine = info.line;
                    className = info.className;
                    logger.info(`✅ ${beforeDot}.${memberName} → class="${info.className}" at ${info.file}:${info.line}`);
                }
            }
        }

        // --- Determine files to search -----------------------------------
        // If we resolved a declarationFile (INC) and no classModuleFile was passed in,
        // extract the MODULE('xyz.clw') attribute from the CLASS declaration in that INC.
        // This ensures FieldPairsClass.Init PROCEDURE in ABUTIL.CLW is found even when
        // the chain was resolved dynamically (not via CLASS body detection).
        let effectiveModuleFile = classModuleFile;
        if (!effectiveModuleFile && declarationFile && className) {
            effectiveModuleFile = this.extractModuleFileFromClass(declarationFile, className) ?? undefined;
            if (effectiveModuleFile) {
                logger.info(`📦 Extracted MODULE file "${effectiveModuleFile}" from class "${className}"`);
            }
        }

        const filesToSearch = this.getMemberSearchFiles(document, declarationFile, effectiveModuleFile);

        logger.info(`🔍 Searching ${filesToSearch.length} file(s) for ${className ?? '?'}.${memberName}`);

        // Build class family (declaring class + all subclasses) so that SELF.Member
        // references in subclass method implementations are included.
        const classFamily = className
            ? this.buildClassFamily(className, filesToSearch)
            : undefined;

        // --- Scan files for member usages --------------------------------
        const locations: Location[] = [];

        // When we know the exact declaration location (resolved from INC/CLASS), inject it
        // directly rather than relying on the scanner — the scanner only matches Label tokens
        // inside CLASS bodies, which misses declarations in QUEUE/GROUP/RECORD structures.
        if (context.includeDeclaration && declarationFile && declarationLine >= 0) {
            const memberLen = memberName.length;
            // Find the actual column of the member name on that line
            const declTokens = this.getTokensForUri(declarationFile);
            const declToken = declTokens?.find(t =>
                t.line === declarationLine && t.value.toLowerCase() === memberName.toLowerCase());
            const col = declToken?.start ?? 0;
            locations.push(Location.create(declarationFile,
                Range.create(declarationLine, col, declarationLine, col + memberLen)));
        }

        for (const fileUri of filesToSearch) {
            const hits = this.findMemberReferencesInFile(fileUri, memberName, className ?? undefined, classFamily, beforeDot ?? undefined);
            locations.push(...hits);
        }

        // Optionally strip the declaration itself
        if (!context.includeDeclaration && declarationFile && declarationLine >= 0) {
            const normDecl = declarationFile.toLowerCase();
            return locations.filter(loc =>
                !(loc.uri.toLowerCase() === normDecl && loc.range.start.line === declarationLine)
            );
        }

        logger.info(`✅ Found ${locations.length} member reference(s) to "${memberName}"`);
        // Deduplicate by uri+line (declaration may be found both by direct injection and scanner)
        const seen = new Set<string>();
        const deduped = locations.filter(loc => {
            const key = `${loc.uri}:${loc.range.start.line}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return deduped.length > 0 ? deduped : null;
    }

    /**
     * Tier 2: resolve `variableName.memberName` by looking up the variable's declared type.
     * e.g. `mgr &ViewManager` → type=ViewManager → find `memberName` in ViewManager.
     */
    private async resolveViaVariableType(
        variableName: string,
        memberName: string,
        document: TextDocument,
        position: { line: number; character: number }
    ): Promise<ChainedMemberInfo | null> {
        // Must be a plain identifier (no dots), not SELF/PARENT
        if (variableName.includes('.') || /^(self|parent)$/i.test(variableName)) return null;

        const symbolInfo = await this.symbolFinder.findSymbol(variableName, document, position);
        if (!symbolInfo) return null;

        const typeName = ClassMemberResolver.extractClassName(symbolInfo.type);
        if (!typeName) return null;

        logger.info(`Tier2: "${variableName}" has type "${typeName}", looking up member "${memberName}"`);
        const info = await this.memberResolver.findMemberInNamedStructure(memberName, typeName, document);
        return info ?? null;
    }

    /**
     * Files to search for member references.
     * Always includes: the current document, the declaration file (INC), and all project CLW files.
     * Also adds any MODULE('file.clw') referenced by the enclosing CLASS declaration.
     * Class members (SELF.Order) can be used in any implementation file in the project.
     */
    private getMemberSearchFiles(
        document: TextDocument,
        declarationFile: string | null,
        classModuleFile?: string
    ): string[] {
        const files = new Set<string>();
        files.add(document.uri);
        if (declarationFile) {
            files.add(declarationFile);
        }

        // If the CLASS has a MODULE('xyz.clw') attribute, resolve and add that file.
        // classModuleFile may be either a raw filename ("ABUTIL.CLW") or an already-resolved URI.
        if (classModuleFile) {
            if (classModuleFile.startsWith('file:///')) {
                files.add(classModuleFile);
            } else {
                // Resolve relative to the declaration file first, then document, then redirection
                const context = declarationFile ?? document.uri;
                const resolved = this.resolveModuleFile(classModuleFile, context);
                if (resolved) files.add(resolved);
            }
        }

        // Search all project source files — class members can be used in any CLW
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution?.projects?.length) {
            for (const project of solutionManager.solution.projects) {
                for (const sourceFile of project.sourceFiles) {
                    const fullPath = `${project.path}\\${sourceFile.relativePath}`;
                    const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    files.add(uri);
                }
            }
        }

        const result = Array.from(files);
        logger.info(`📂 Search file list: ${result.map(f => f.split('/').pop()).join(', ')}`);
        return result;
    }

    /**
     * Resolve a MODULE('file.clw') filename to a file URI by searching:
     * 1. Same directory as the source INC file
     * 2. All project search paths via SolutionManager.findFileWithExtension
     */
    private resolveModuleFile(moduleFileName: string, sourceUri: string): string | null {
        try {
            const sourcePath = decodeURIComponent(sourceUri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
            const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('\\'));

            // 1. Same directory as the INC
            const candidate = `${sourceDir}\\${moduleFileName}`;
            if (fs.existsSync(candidate)) {
                return `file:///${candidate.replace(/\\/g, '/')}`;
            }

            // 2. Search via project redirection paths
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution?.projects?.length) {
                const ext = moduleFileName.substring(moduleFileName.lastIndexOf('.'));
                for (const project of solutionManager.solution.projects) {
                    const searchPaths = project.getSearchPaths(ext);
                    for (const searchPath of searchPaths) {
                        const candidate2 = `${searchPath}\\${moduleFileName}`;
                        if (fs.existsSync(candidate2)) {
                            return `file:///${candidate2.replace(/\\/g, '/')}`;
                        }
                    }
                }
            }
        } catch {
            // ignore resolution errors
        }
        return null;
    }

    /**
     * Walk INCLUDE('...') statements in the given CLW file (using redirection paths)
     * and return the URI of the first file that contains a CLASS declaration with
     * the given class name. Returns null if not found.
     */
    private async findClassDeclarationInIncludes(className: string, fromPath: string, visited: Set<string> = new Set()): Promise<string | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const classLower = className.toLowerCase();
        const lines = content.split('\n');
        const solutionManager = SolutionManager.getInstance();
        const fromDir = fromPath.substring(0, fromPath.lastIndexOf('\\'));

        for (const line of lines) {
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;

            const includeFileName = includeMatch[1];

            // Resolve: same dir first, then redirection
            let resolvedPath: string | null = null;
            const candidate = `${fromDir}\\${includeFileName}`;
            if (fs.existsSync(candidate)) {
                resolvedPath = candidate;
            } else if (solutionManager?.solution?.projects?.length) {
                const ext = includeFileName.substring(includeFileName.lastIndexOf('.'));
                for (const project of solutionManager.solution.projects) {
                    for (const sp of project.getSearchPaths(ext)) {
                        const c2 = `${sp}\\${includeFileName}`;
                        if (fs.existsSync(c2)) { resolvedPath = c2; break; }
                    }
                    if (resolvedPath) break;
                }
            }
            if (!resolvedPath) continue;

            const incUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;

            // Check token cache for a CLASS with this label
            const incTokens = this.getTokensForUri(incUri);
            if (incTokens) {
                const found = incTokens.find(t =>
                    t.type === TokenType.Structure &&
                    t.subType === TokenType.Class &&
                    (t.label ?? '').toLowerCase() === classLower
                );
                if (found) return incUri;
            } else {
                // Not cached — scan the raw file for the class name
                try {
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    const rx = new RegExp(`^\\s*${className}\\s+CLASS\\b`, 'im');
                    if (rx.test(incContent)) return incUri;
                } catch { /* ignore */ }
            }
        }
        return null;
    }

    /**
     * in that file and extract the raw MODULE('filename.clw') attribute string.
     * Returns the raw filename (e.g. "ABUTIL.CLW"), not a URI — caller resolves it.
     */
    private extractModuleFileFromClass(declarationFileUri: string, className: string): string | null {
        const tokens = this.getTokensForUri(declarationFileUri);
        if (!tokens) return null;

        const classLower = className.toLowerCase();
        for (const t of tokens) {
            if (t.type === TokenType.Structure && t.subType === TokenType.Class &&
                (t.label ?? '').toLowerCase() === classLower) {
                const fileContent = this.getFileContent(declarationFileUri);
                if (!fileContent) return null;
                const lines = fileContent.split('\n');
                const classLine = lines[t.line] ?? '';
                const moduleMatch = classLine.match(/MODULE\s*\(\s*['"](.+?)['"]\s*\)/i);
                return moduleMatch?.[1] ?? null;
            }
        }
        return null;
    }

    /** Read raw file content for a URI, using TokenCache file map or fs. */
    private getFileContent(fileUri: string): string | null {
        try {
            const path = decodeURIComponent(fileUri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
            return fs.readFileSync(path, 'utf8');
        } catch {
            return null;
        }
    }

    /**
     * by scanning all provided file URIs for CLASS declarations with parent class attributes.
     *
     * In Clarion: `ClassB CLASS(ClassA)` — the token after the CLASS structure token
     * is a `(` delimiter, followed by a Variable token naming the parent class.
     */
    private buildInheritanceMap(fileUris: string[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const uri of fileUris) {
            const tokens = this.getTokensForUri(uri);
            if (!tokens) continue;
            for (let i = 0; i < tokens.length; i++) {
                const t = tokens[i];
                if (t.type === TokenType.Structure && t.subType === TokenType.Class && t.label) {
                    // Look for ( Variable ) immediately after CLASS on the same line
                    const next = tokens[i + 1];
                    const parent = tokens[i + 2];
                    if (next && next.type === TokenType.Delimiter && next.value === '(' &&
                        next.line === t.line &&
                        parent && parent.type === TokenType.Variable &&
                        parent.line === t.line) {
                        map.set(t.label.toLowerCase(), parent.value.toLowerCase());
                    }
                }
            }
        }
        return map;
    }

    /**
     * Given a declaring class name and an inheritance map, return the full set of classes
     * that should be accepted when filtering SELF.Member references: the declaring class
     * itself plus every class that directly or indirectly inherits from it.
     */
    private buildClassFamily(declaringClass: string, fileUris: string[]): Set<string> {
        const inheritanceMap = this.buildInheritanceMap(fileUris);
        const declaringLower = declaringClass.toLowerCase();

        // family starts with the declaring class
        const family = new Set<string>([declaringLower]);

        // Collect all children/descendants (BFS)
        let changed = true;
        while (changed) {
            changed = false;
            for (const [child, parentLower] of inheritanceMap) {
                if (family.has(parentLower) && !family.has(child)) {
                    family.add(child);
                    changed = true;
                }
            }
        }

        if (family.size > 1) {
            logger.info(`🧬 Class family for "${declaringClass}": [${Array.from(family).join(', ')}]`);
        }
        return family;
    }

    /**
     * Find every occurrence of `memberName` used in dot-notation in a single file.
     * When `className` is provided, SELF.Member matches are restricted to method
     * implementations belonging to that class or any of its subclasses (`classFamily`).
     *
     * Token patterns covered:
     *   1. StructureField  "SELF.Order"       — penultimate is SELF/PARENT, filtered by enclosing method class
     *   2. StructureField  "SELF.Sort.Thumb"  — 3+ segments; filtered by chainPrefix when known
     *   3. StructureField  "Order.Something"  — first segment matches (chain continuation token)
     *   4. Variable        "Order"            — terminal access preceded by Delimiter '.' or StructureField
     *   5. Label (col 0)   "Order"            — declaration inside a CLASS body of the right class
     *
     * @param chainPrefix  The full expression before the final member (e.g. "SELF.Sort" for SELF.Sort.Thumb).
     *                     When provided, 3-level chain matches are restricted to this exact prefix,
     *                     preventing false positives from same-named members on different intermediate props.
     */
    private findMemberReferencesInFile(
        fileUri: string,
        memberName: string,
        className?: string,
        classFamily?: Set<string>,
        chainPrefix?: string
    ): Location[] {
        const tokens = this.getTokensForUri(fileUri);
        if (!tokens || tokens.length === 0) return [];

        const memberLower = memberName.toLowerCase();
        const classLower = className?.toLowerCase();
        // Normalize chainPrefix: when it's just SELF/PARENT we don't use it for 3-level filtering
        const chainPrefixLower = chainPrefix && !/^(self|parent)$/i.test(chainPrefix)
            ? chainPrefix.toLowerCase()
            : undefined;
        const locations: Location[] = [];

        // Pre-build method scope map: for each MethodImplementation, record its class name
        // and line range so we can filter SELF.Member matches by class.
        // token.label = "ClassName.MethodName" for MethodImplementation tokens.
        type MethodScope = { classLower: string; startLine: number; endLine: number };
        const methodScopes: MethodScope[] = [];
        if (classLower) {
            for (const t of tokens) {
                if (t.subType === TokenType.MethodImplementation && t.label && t.finishesAt !== undefined) {
                    const dotIdx = t.label.indexOf('.');
                    const methodClass = dotIdx > 0 ? t.label.substring(0, dotIdx).toLowerCase() : '';
                    methodScopes.push({ classLower: methodClass, startLine: t.line, endLine: t.finishesAt });
                }
            }
        }

        /** Returns true if the given line falls inside a method implementation of the target class family. */
        const isInTargetClass = (line: number): boolean => {
            if (!classLower) return true; // no class filter — accept all
            const scope = methodScopes.find(s => line >= s.startLine && line <= s.endLine);
            if (!scope) return false; // not inside any known method
            // Accept if the method's class is the declaring class or any subclass
            return classFamily ? classFamily.has(scope.classLower) : scope.classLower === classLower;
        };

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === TokenType.Comment || token.type === TokenType.String) continue;

            if (token.type === TokenType.StructureField) {
                const parts = token.value.split('.');
                const lastSeg = parts[parts.length - 1].toLowerCase();

                if (lastSeg === memberLower) {
                    const penultimate = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : '';

                    if ((penultimate === 'self' || penultimate === 'parent') && isInTargetClass(token.line)) {
                        // 2-segment: SELF.Member — direct access, filter by enclosing method class
                        locations.push(Location.create(fileUri,
                            Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                         token.line, token.start + token.value.length)));

                    } else if (parts.length >= 3 &&
                               (parts[0].toLowerCase() === 'self' || parts[0].toLowerCase() === 'parent') &&
                               penultimate !== memberLower) {
                        // 3+ segment all-in-one: SELF.X.Member (e.g. SELF.Sort.Thumb tokenized as one token)
                        const prefixOfToken = token.value.substring(0, token.value.lastIndexOf('.')).toLowerCase();
                        if (!chainPrefixLower || prefixOfToken === chainPrefixLower) {
                            locations.push(Location.create(fileUri,
                                Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                             token.line, token.start + token.value.length)));
                        }

                    } else if (parts[0].toLowerCase() !== 'self' && parts[0].toLowerCase() !== 'parent') {
                        // Split chain: tokenizer split "SELF.Sort.Resets.Init" into
                        // StructureField("SELF.Sort") + StructureField("Resets.Init").
                        // Check whether the preceding token on the same line is a SELF-rooted
                        // StructureField whose value + "." + this token's value reconstructs
                        // the expected chainPrefix + "." + memberName.
                        const prev = i > 0 ? tokens[i - 1] : null;
                        if (prev && prev.type === TokenType.StructureField &&
                            prev.line === token.line &&
                            /^(self|parent)\b/i.test(prev.value)) {
                            // Full chain = prev.value + "." + token.value
                            const fullChain = (prev.value + '.' + token.value).toLowerCase();
                            const expectedChain = chainPrefixLower
                                ? chainPrefixLower + '.' + memberLower
                                : null;
                            if (!expectedChain || fullChain === expectedChain) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                                 token.line, token.start + token.value.length)));
                            }
                        } else if (parts.length === 2 && chainPrefixLower &&
                                   parts[0].toLowerCase() === chainPrefixLower) {
                            // Typed variable direct access: e.g. INIMgr.Init
                            // where chainPrefix is the variable name (INIMgr).
                            locations.push(Location.create(fileUri,
                                Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                             token.line, token.start + token.value.length)));
                        }
                    }
                } else {
                    const firstDot = token.value.indexOf('.');
                    const firstSeg = token.value.substring(0, firstDot).toLowerCase();
                    if (firstSeg === memberLower && isInTargetClass(token.line)) {
                        locations.push(Location.create(fileUri,
                            Range.create(token.line, token.start,
                                         token.line, token.start + firstDot)));
                    }
                }
                continue;
            }

            if (token.type === TokenType.Variable && token.value.toLowerCase() === memberLower) {
                const prev = tokens[i - 1];
                if (prev && prev.line === token.line) {
                    if (prev.type === TokenType.Delimiter && prev.value === '.') {
                        // Check for typed variable access first: INIMgr.Init
                        // where the token before the dot is the variable name matching chainPrefixLower.
                        if (chainPrefixLower && i >= 2) {
                            const beforeDotToken = tokens[i - 2];
                            if (beforeDotToken && beforeDotToken.line === token.line &&
                                beforeDotToken.value.toLowerCase() === chainPrefixLower) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                            } else if (isInTargetClass(token.line)) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                            }
                        } else if (isInTargetClass(token.line)) {
                            // Explicit dot: e.g. var.Thumb where var is resolved to the right class
                            locations.push(Location.create(fileUri,
                                Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                        }
                    } else if (prev.type === TokenType.StructureField &&
                               prev.line === token.line &&
                               /^(self|parent)\b/i.test(prev.value) &&
                               !prev.value.toLowerCase().endsWith('.' + memberLower)) {
                        // Implicit dot: StructureField "SELF.Sort" immediately before Variable "Thumb"
                        // (tokenizer splits SELF.Sort.Thumb into StructureField + Variable).
                        // If we know the exact chain prefix, verify the StructureField value matches it.
                        if (!chainPrefixLower || prev.value.toLowerCase() === chainPrefixLower) {
                            locations.push(Location.create(fileUri,
                                Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                        }
                    }
                }
                continue;
            }

            // Member declaration at column 0 — only inside the correct CLASS body
            if (token.type === TokenType.Label && token.start === 0 &&
                token.value.toLowerCase() === memberLower) {
                const enclosingStruct = tokens.slice(0, i).reverse().find(t =>
                    t.type === TokenType.Structure &&
                    t.finishesAt !== undefined &&
                    t.finishesAt >= token.line
                );
                if (enclosingStruct && enclosingStruct.subType === TokenType.Class) {
                    // When className is known, verify the label of the CLASS matches
                    if (!classLower || (enclosingStruct.label ?? '').toLowerCase() === classLower) {
                        locations.push(Location.create(fileUri,
                            Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                    }
                }
            }

            // Procedure implementation: "ClassName.MethodName PROCEDURE" at col 0
            // The PROCEDURE token has subType=MethodImplementation and label="ClassName.MethodName".
            // The method name itself is the Variable token immediately before PROCEDURE on the same line.
            // All overloads of the same method name are included (overload resolution at
            // call sites requires full type inference, so we aggregate them).
            if (token.subType === TokenType.MethodImplementation && token.label) {
                const dotIdx = token.label.indexOf('.');
                if (dotIdx > 0) {
                    const implClass = token.label.substring(0, dotIdx).toLowerCase();
                    const implMethod = token.label.substring(dotIdx + 1).toLowerCase();
                    const inFamily = classFamily ? classFamily.has(implClass) : implClass === classLower;
                    if (implMethod === memberLower && (!classLower || inFamily)) {
                        // The method-name token is the Variable immediately before PROCEDURE on the same line
                        const nameToken = i > 0 && tokens[i - 1].line === token.line &&
                            tokens[i - 1].value.toLowerCase() === implMethod ? tokens[i - 1] : null;
                        if (nameToken) {
                            locations.push(Location.create(fileUri,
                                Range.create(nameToken.line, nameToken.start,
                                             nameToken.line, nameToken.start + nameToken.value.length)));
                        }
                    }
                }
            }
        }

        return locations;
    }

    // ─── Plain symbol helpers ─────────────────────────────────────────────────

    /**
     * Determine the set of file URIs to scan based on the symbol's scope.
     */
    private getFilesToSearch(symbolInfo: SymbolInfo, currentDocument: TextDocument): string[] {
        const scopeType = symbolInfo.scope.type;

        if (scopeType === 'local' || scopeType === 'parameter' || scopeType === 'routine') {
            return [currentDocument.uri];
        }

        if (scopeType === 'module') {
            // A procedure declaration (MAP-level) is program-scoped — its implementation
            // lives in a MEMBER file, so we must search all project files.
            // Detect: declaration file has MEMBER (module scope in a member file)
            //      OR the symbol token's declaration line has a PROCEDURE keyword.
            if (this.isMemberFile(symbolInfo.location.uri) ||
                this.isProcedureDeclaration(symbolInfo.location.uri, symbolInfo.location.line)) {
                // Fall through to global search below
            } else {
                return [symbolInfo.location.uri];
            }
        }

        // Global (or MEMBER-file procedure): all project source files when a solution is loaded
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution?.projects?.length) {
            const allFiles: string[] = [];
            for (const project of solutionManager.solution.projects) {
                for (const sourceFile of project.sourceFiles) {
                    const fullPath = `${project.path}\\${sourceFile.relativePath}`;
                    const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    allFiles.push(uri);
                }
            }
            if (allFiles.length > 0) return allFiles;
        }

        return [currentDocument.uri];
    }

    /**
     * Returns true if the given file URI contains a MEMBER statement,
     * indicating it is a member file of a Clarion program (not a standalone program).
     */
    private isMemberFile(uri: string): boolean {
        try {
            const tokens = this.getTokensForUri(uri);
            return tokens.some(t => t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'MEMBER');
        } catch {
            return false;
        }
    }

    /**
     * Returns true if the given line in the file is a MAP/MODULE procedure declaration
     * (i.e. a PROCEDURE keyword with MapProcedure subType on that line).
     * Used to detect when a 'module'-scoped symbol is actually a procedure that can
     * be called from any MEMBER file in the program.
     */
    private isProcedureDeclaration(uri: string, line: number): boolean {
        try {
            const tokens = this.getTokensForUri(uri);
            return tokens.some(t =>
                t.line === line &&
                t.type === TokenType.Procedure &&
                (t.subType === TokenType.MapProcedure ||
                 t.subType === TokenType.GlobalProcedure ||
                 t.subType === TokenType.MethodDeclaration)
            );
        } catch {
            return false;
        }
    }

    /**
     * Find all matching token locations in a single file for a plain symbol.
     */
    private findReferencesInFile(
        fileUri: string,
        searchWord: string,
        symbolInfo: SymbolInfo,
        includeDeclaration: boolean
    ): Location[] {
        const locations: Location[] = [];
        const searchWordLower = searchWord.toLowerCase();

        try {
            const tokens = this.getTokensForUri(fileUri);
            if (!tokens || tokens.length === 0) return locations;

            const scopeType = symbolInfo.scope.type;
            let startLine = 0;
            let endLine = Number.MAX_SAFE_INTEGER;

            if (scopeType === 'local' || scopeType === 'parameter' || scopeType === 'routine') {
                const scopeToken = symbolInfo.scope.token;
                startLine = scopeToken.line;
                endLine = scopeToken.finishesAt ?? Number.MAX_SAFE_INTEGER;
            }

            const declarationLine = symbolInfo.location.line;
            const declarationUri = symbolInfo.location.uri;

            for (const token of tokens) {
                if (token.line < startLine || token.line > endLine) continue;
                if (token.type === TokenType.Comment || token.type === TokenType.String) continue;

                let matchStart = token.start;
                let matchLength = token.value.length;

                if (token.value.toLowerCase() === searchWordLower) {
                    // Exact match
                } else if (token.type === TokenType.StructureField || token.type === TokenType.Class) {
                    // Object prefix of a StructureField: "st.SetValue" when searching for "st"
                    const dotIndex = token.value.indexOf('.');
                    if (dotIndex > 0 && token.value.substring(0, dotIndex).toLowerCase() === searchWordLower) {
                        matchLength = dotIndex;
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }

                if (!includeDeclaration && fileUri === declarationUri && token.line === declarationLine) continue;

                locations.push(Location.create(
                    fileUri,
                    Range.create(token.line, matchStart, token.line, matchStart + matchLength)
                ));
            }
        } catch (error) {
            logger.error(`❌ Error searching ${fileUri}: ${error instanceof Error ? error.message : String(error)}`);
        }

        return locations;
    }

    /**
     * Given a token array, find the line number of a procedure declaration for `wordLower`.
     *
     * A procedure declaration is identified by a line that contains BOTH:
     *   - A Label/Variable token with value === wordLower (the procedure name label)
     *   - A Procedure keyword token with subType in `procedureSubTypes`
     *
     * Returns the line number, or null if not found.
     */
    private findProcedureLabelLine(
        wordLower: string,
        tokens: Token[],
        procedureSubTypes: Set<TokenType>
    ): number | null {
        // Build a set of lines that have a PROCEDURE keyword with a procedure subType
        const procedureLines = new Set<number>();
        for (const t of tokens) {
            if (t.type === TokenType.Procedure && t.subType !== undefined && procedureSubTypes.has(t.subType)) {
                procedureLines.add(t.line);
            }
        }
        if (procedureLines.size === 0) return null;

        // Find a Label/Variable on a procedure line with value matching wordLower
        for (const t of tokens) {
            if (!procedureLines.has(t.line)) continue;
            if ((t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value.toLowerCase() === wordLower) {
                return t.line;
            }
        }
        return null;
    }

    /**
     * Procedure fallback for Find All References.
     *
     * When `findSymbol` returns null (word is not a variable/parameter), check whether
     * the word is a MAP/MODULE-declared procedure or a GlobalProcedure. If so, search
     * all project source files for references to that procedure name.
     *
     * Detection strategy (in priority order):
     * 1. Any line in current-file tokens where a Label/Variable === word precedes a
     *    PROCEDURE keyword with a procedure subType (GlobalProcedure / MapProcedure / etc.)
     * 2. Same check across all cached project source files
     * 3. Same check after walking MAP INCLUDE files from the current CLW
     */
    private async findProcedureReferences(
        word: string,
        document: TextDocument,
        currentTokens: Token[],
        includeDeclaration: boolean
    ): Promise<Location[] | null> {
        const wordLower = word.toLowerCase();
        const procedureSubTypes = new Set([
            TokenType.GlobalProcedure,
            TokenType.MapProcedure,
            TokenType.MethodDeclaration,
            TokenType.MethodImplementation
        ]);

        // 1. Check current-file tokens
        const localDeclLine = this.findProcedureLabelLine(wordLower, currentTokens, procedureSubTypes);
        let declarationUri: string | null = localDeclLine !== null ? document.uri : null;
        let declarationLine: number = localDeclLine ?? 0;

        if (!declarationUri) {
            // 2. Check all cached project files
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution?.projects?.length) {
                outerLoop: for (const project of solutionManager.solution.projects) {
                    for (const sourceFile of project.sourceFiles) {
                        const fullPath = `${project.path}\\${sourceFile.relativePath}`;
                        const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                        const fileTokens = this.getTokensForUri(uri);
                        const declLine = this.findProcedureLabelLine(wordLower, fileTokens, procedureSubTypes);
                        if (declLine !== null) {
                            declarationUri = uri;
                            declarationLine = declLine;
                            break outerLoop;
                        }
                    }
                }
            }
        }

        // 3. Walk MAP INCLUDE files from current CLW — always, so we can include the INC
        //    declaration site in results even when a project-file implementation was found first.
        const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const incDecl = await this.findProcedureInMapIncludes(wordLower, currentPath, procedureSubTypes);

        if (!declarationUri && incDecl) {
            declarationUri = incDecl.uri;
            declarationLine = incDecl.line;
        }

        if (!declarationUri) {
            logger.info(`❌ No symbol found for "${word}"`);
            return null;
        }

        logger.info(`✅ "${word}" identified as procedure — global search from declaration ${declarationUri}:${declarationLine}`);

        // Build a synthetic SymbolInfo with global scope so getFilesToSearch returns all project files
        const dummyScopeToken: Token = {
            type: TokenType.Variable,
            subType: undefined,
            value: word,
            line: 0,
            start: 0,
            maxLabelLength: 0,
            parent: undefined,
            children: []
        };
        const syntheticInfo: SymbolInfo = {
            token: dummyScopeToken,
            type: 'PROCEDURE',
            scope: { token: dummyScopeToken, type: 'global' },
            location: { uri: declarationUri, line: declarationLine, character: 0 },
            originalWord: word,
            searchWord: word
        };

        // Search all project files, plus any INC file where the MAP/MODULE declaration lives.
        const filesToSearch = this.getFilesToSearch(syntheticInfo, document);
        if (incDecl && !filesToSearch.includes(incDecl.uri)) {
            filesToSearch.push(incDecl.uri);
        }
        logger.info(`📁 Searching ${filesToSearch.length} file(s) for procedure "${word}"`);

        const locations: Location[] = [];
        for (const fileUri of filesToSearch) {
            locations.push(...this.findReferencesInFile(fileUri, word, syntheticInfo, includeDeclaration));
        }

        logger.info(`✅ Found ${locations.length} reference(s) to procedure "${word}"`);
        return locations.length > 0 ? locations : null;
    }

    /**
     * Walk MAP INCLUDE files referenced from the given CLW source file.
     * Returns the URI + line of the first INCLUDE file that declares the word
     * as a MAP/MODULE procedure.
     */
    private async findProcedureInMapIncludes(
        wordLower: string,
        fromPath: string,
        procedureSubTypes: Set<TokenType>,
        visited: Set<string> = new Set()
    ): Promise<{ uri: string; line: number } | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try {
            content = fs.readFileSync(fromPath, 'utf-8');
        } catch {
            return null;
        }

        const fromDir = fromPath.substring(0, fromPath.lastIndexOf('\\'));
        const includePattern = /INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*ONCE)?\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const incFileName = match[1];

            // Resolve via same-dir first, then project redirection
            let incPath: string | null = null;
            const sameDirCandidate = `${fromDir}\\${incFileName}`;
            if (fs.existsSync(sameDirCandidate)) {
                incPath = sameDirCandidate;
            } else {
                const solutionManager = SolutionManager.getInstance();
                if (solutionManager?.solution?.projects?.length) {
                    const ext = incFileName.substring(incFileName.lastIndexOf('.'));
                    for (const project of solutionManager.solution.projects) {
                        const searchPaths = project.getSearchPaths(ext);
                        for (const sp of searchPaths) {
                            const candidate = `${sp}\\${incFileName}`;
                            if (fs.existsSync(candidate)) { incPath = candidate; break; }
                        }
                        if (incPath) break;
                    }
                }
            }

            if (!incPath) continue;

            const incUri = `file:///${incPath.replace(/\\/g, '/')}`;
            const incTokens = this.getTokensForUri(incUri);
            const declLine = this.findProcedureLabelLine(wordLower, incTokens, procedureSubTypes);
            if (declLine !== null) return { uri: incUri, line: declLine };

            // Recurse into nested INCLUDEs
            const nested = await this.findProcedureInMapIncludes(wordLower, incPath, procedureSubTypes, visited);
            if (nested) return nested;
        }

        return null;
    }

    /**
     * Get tokens for a URI — uses the in-memory cache for open documents,
     * falls back to reading and tokenizing from disk for closed files.
     */
    private getTokensForUri(uri: string): Token[] {
        const cached = this.tokenCache.getTokensByUri(uri);
        if (cached) return cached;

        try {
            const filePath = decodeURIComponent(uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
            if (!fs.existsSync(filePath)) return [];

            const content = fs.readFileSync(filePath, 'utf-8');
            const tokenizer = new ClarionTokenizer(content);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return tokens;
        } catch (error) {
            logger.error(`❌ Failed to tokenize ${uri}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
}

