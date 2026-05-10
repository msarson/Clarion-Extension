import { Location, Range, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService, SymbolInfo } from '../services/SymbolFinderService';
import { TokenHelper } from '../utils/TokenHelper';
import { ChainedPropertyResolver, ChainedMemberInfo } from '../utils/ChainedPropertyResolver';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { CallSiteArgumentClassifier, ClassifierContext } from '../utils/CallSiteArgumentClassifier';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { isAttributeKeyword } from '../utils/AttributeKeywords';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { getLocalMapScope, LocalMapScope } from '../utils/LocalMapScopeHelper';
import { buildIncDirsToScan } from './incDirsScope';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ReferencesProvider");
logger.setLevel("error");

type OverloadFilter = {
    minArgs: number;
    maxArgs: number;
    declarationLine: number;
    declarationFileNorm: string;
    /** Cursor's declaration signature (line text). Plain-symbol path uses this
     *  with `MethodOverloadResolver.signaturesMatch` for type-aware decl-on-decl
     *  filtering (fe254d6f). Optional — dot-access path doesn't populate it; its
     *  filter remains arity-only via minArgs/maxArgs. */
    declSignature?: string;
};

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
    private overloadResolver: MethodOverloadResolver;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
        this.memberResolver = new ClassMemberResolver();
        this.overloadResolver = new MethodOverloadResolver();
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

        // Don't search references for words inside comments or after line-continuation markers
        const tokens = this.tokenCache.getTokens(document);
        if (TokenHelper.isPositionInComment(tokens, position.line, position.character)) {
            return null;
        }

        // Attribute keywords (ONCE, PRIVATE, VIRTUAL, DERIVED, etc.) are not symbols
        if (isAttributeKeyword(word)) {
            logger.info(`⏭️ [FAR] Skipping attribute keyword "${word}" — not a referenceable symbol`);
            return null;
        }

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

        logger.error(`🔍 [FAR] Finding references for "${word}" at ${position.line}:${position.character} in ${path.basename(decodeURIComponent(document.uri))}`);

        // Get full line text — used for pattern-based routing before symbol resolution
        const fullLine = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        }).trimEnd();

        // ── Route A: 3-part method implementation (Class.Interface.Method PROCEDURE) ──
        // Must run before word.includes('.') to intercept the dot-prefixed word.
        const threePartImplMatch = fullLine.match(/^(\w+)\.(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)/i);
        if (threePartImplMatch) {
            const [, clsName, ifacePart, methPart] = threePartImplMatch;
            const ifaceStart = clsName.length + 1;
            const ifaceEnd   = ifaceStart + ifacePart.length;
            const methStart  = ifaceEnd + 1;
            const methEnd    = methStart + methPart.length;

            if (position.character >= methStart && position.character <= methEnd) {
                logger.error(`🔌 [FAR] Route A — 3-part impl, cursor on method "${methPart}" (iface=${ifacePart})`);
                return this.provideInterfaceMethodReferences(methPart, ifacePart, document, context.includeDeclaration);
            }
            if (position.character >= ifaceStart && position.character <= ifaceEnd) {
                logger.error(`🔌 [FAR] Route A — 3-part impl, cursor on interface name "${ifacePart}"`);
                return this.provideImplementsReferences(ifacePart, document);
            }
        }

        // ── Route B: cursor on interface name inside IMPLEMENTS(IfaceName) ──
        const implementsRe = /\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi;
        let implementsM: RegExpExecArray | null;
        while ((implementsM = implementsRe.exec(fullLine)) !== null) {
            const ifaceName = implementsM[1];
            const nameStart = implementsM.index + implementsM[0].indexOf(ifaceName);
            const nameEnd   = nameStart + ifaceName.length;
            if (position.character >= nameStart && position.character <= nameEnd) {
                logger.error(`🔌 [FAR] Route B — IMPLEMENTS(${ifaceName}), routing to IMPLEMENTS references`);
                return this.provideImplementsReferences(ifaceName, document);
            }
        }

        // Route to member-access path when word contains a dot
        if (word.includes('.')) {
            return this.provideMemberReferences(word, document, position, context);
        }

        // Check if the cursor is inside a CLASS body BEFORE trying plain symbol search.
        // findSymbol may resolve the word as a different same-named module variable declared
        // before the CLASS, so we must detect CLASS context first.
        // (tokens already retrieved above for the comment guard)
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
            logger.error(`🏛️ [FAR] Route: CLASS body (class=${enclosingClass.label ?? '?'}, module=${classModuleFile ?? 'none'}) → member-access path`);
            return this.provideMemberReferences(`SELF.${word}`, document, position, context, classModuleFile, enclosingClass.label);
        }

        // Check if cursor is on a MethodImplementation line for a locally-declared class.
        // e.g. "MetroForm.TakeAccepted PROCEDURE()" where MetroForm has no MODULE attribute.
        // findSymbol would resolve TakeAccepted to the base-class INC, causing a full-solution
        // scan — intercept here and redirect to the local-class member path instead.
        const methodImplToken = tokens.find(t =>
            t.subType === TokenType.MethodImplementation &&
            t.label !== undefined &&
            t.line === position.line
        );
        if (methodImplToken?.label) {
            const dotIdx = methodImplToken.label.indexOf('.');
            const implClassName = dotIdx > 0 ? methodImplToken.label.substring(0, dotIdx) : null;
            if (implClassName && this.isClassDeclaredInDocument(implClassName, document)) {
                const classToken = tokens.find(t =>
                    t.type === TokenType.Structure &&
                    t.subType === TokenType.Class &&
                    (t.label ?? '').toLowerCase() === implClassName.toLowerCase()
                );
                const classLine = classToken ? document.getText({
                    start: { line: classToken.line, character: 0 },
                    end: { line: classToken.line, character: 999 }
                }) : '';
                if (!/MODULE\s*\(\s*['"]/i.test(classLine)) {
                    logger.error(`🏛️ [FAR] Route: MethodImpl of local class "${implClassName}" → restricting to current file`);
                    return this.provideMemberReferences(`SELF.${word}`, document, position, context, undefined, implClassName);
                }
            }
        }

        // Check if cursor is inside an INTERFACE body — find all implementations + call sites
        const enclosingInterface = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.line < position.line &&
            t.finishesAt !== undefined &&
            t.finishesAt >= position.line
        );
        if (enclosingInterface) {
            logger.error(`🔌 [FAR] Route: INTERFACE body (iface=${enclosingInterface.label ?? '?'}) → interface-method path`);
            return this.provideInterfaceMethodReferences(word, enclosingInterface.label ?? word, document, context.includeDeclaration);
        }

        // ── Route C: cursor on interface name IN the declaration line itself ──
        // e.g. "WindowComponent" in "WindowComponent  INTERFACE,TYPE"
        // The enclosingInterface check above requires t.line < position.line, so the
        // declaration line itself falls through here — detect it explicitly.
        const ifaceDeclToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.line === position.line
        );
        if (ifaceDeclToken && ifaceDeclToken.label) {
            const ifaceLabelLower = ifaceDeclToken.label.toLowerCase();
            if (word.toLowerCase() === ifaceLabelLower) {
                logger.error(`🔌 [FAR] Route C — INTERFACE declaration name "${word}" → IMPLEMENTS references`);
                return this.provideImplementsReferences(ifaceDeclToken.label, document);
            }
        }

        // ── Route D: CLASS TYPE name — always global, never scope-limited ──
        // Must run before findSymbol to prevent parameter/local scope limiting.
        const classTypeRef = await this.findClassTypeReferences(word, document, context.includeDeclaration);
        if (classTypeRef !== null) return classTypeRef;

        // Plain symbol path
        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position);
        if (!symbolInfo) {
            // Fallback: check if word is a MAP/MODULE-declared procedure (not a variable)
            return this.findProcedureReferences(word, document, tokens, context.includeDeclaration);
        }

        const searchWord = symbolInfo.token.value;
        const filesToSearch = this.getFilesToSearch(symbolInfo, document);

        // Build OverloadFilter for procedure / method declarations to distinguish
        // overloads (fe254d6f). When the cursor is on an overloaded procedure decl,
        // sibling decls + impls with non-matching signatures are filtered from the
        // result. Type-aware via `MethodOverloadResolver.signaturesMatch` (5f7478dc).
        const overloadFilter = this.buildPlainSymbolOverloadFilter(symbolInfo, document);

        logger.error(`[FAR] Plain symbol "${searchWord}" — scope: ${symbolInfo.scope.type}, declared at ${path.basename(decodeURIComponent(symbolInfo.location.uri))}:${symbolInfo.location.line}`);

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

        logger.error(`[FAR] Searching ${filesToSearch.length} file(s) for "${searchWord}":\n` +
            filesToSearch.map(f => `  ${path.basename(decodeURIComponent(f))}`).join('\n'));

        // For structure field scope, collect all PRE prefixes that map to this field
        const fieldPrefixes = symbolInfo.scope.type === 'field'
            ? this.collectFieldPrefixes(symbolInfo, document)
            : undefined;

        if (fieldPrefixes && fieldPrefixes.size > 0) {
            logger.info(`🔑 Field prefixes for "${searchWord}": ${[...fieldPrefixes].join(', ')}`);
        }

        const locations: Location[] = [];
        // CLASS labels declared inside a procedure have method implementations outside the
        // procedure scope (e.g. ThisWindow.Init PROCEDURE).  Detect this case and expand
        // the token search to the full file while still only searching the current file.
        const isClassLabelDecl = symbolInfo.scope.type === 'local' &&
            symbolInfo.token.type === TokenType.Label &&
            tokens.some(t =>
                t.line === symbolInfo.token.line &&
                t.type === TokenType.Structure &&
                t.subType === TokenType.Class
            );
        for (const fileUri of filesToSearch) {
            const fileLocations = this.findReferencesInFile(fileUri, searchWord, symbolInfo, context.includeDeclaration, fieldPrefixes, isClassLabelDecl, overloadFilter, document);
            locations.push(...fileLocations);
        }

        logger.error(`[FAR] ✅ ${locations.length} reference(s) found for "${searchWord}"`);
        return locations.length > 0 ? locations : null;
    }

    // ─── Member access (SELF.Order, mgr.Order) ───────────────────────────────

    /**
     * Handle Find All References for a method declared inside an INTERFACE body.
     * Finds: the declaration, 3-part implementations (Class.IFace.Method), VIRTUAL declarations
     * in implementing classes, and call sites across all project files.
     */
    private async provideInterfaceMethodReferences(
        methodName: string,
        ifaceName: string,
        document: TextDocument,
        includeDeclaration: boolean
    ): Promise<Location[] | null> {
        const methodLower = methodName.toLowerCase();
        const ifaceLower = ifaceName.toLowerCase();
        const locations: Location[] = [];

        // Collect all files to search: project files + current file
        const filesToSearch: string[] = [document.uri];
        const sm = SolutionManager.getInstance();
        if (sm?.solution?.projects?.length) {
            for (const project of sm.solution.projects) {
                for (const sf of project.sourceFiles) {
                    const fullPath = path.isAbsolute(sf.relativePath) ? sf.relativePath : path.join(project.path, sf.relativePath);
                    const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    if (!filesToSearch.includes(uri)) filesToSearch.push(uri);
                }
            }
        }

        // When no solution is loaded (e.g. browsing LibSrc directly), find MODULE files
        // by scanning the current file's tokens for CLASS ... IMPLEMENTS(ifaceName) MODULE('x.clw')
        if (!sm?.solution?.projects?.length) {
            const docTokens = this.getTokensForUri(document.uri);
            const docContent = document.uri === document.uri ? document.getText() : (this.getFileContent(document.uri) ?? '');
            const docLines = docContent.split('\n');
            for (const t of docTokens) {
                if (t.type === TokenType.Structure && t.subType === TokenType.Class) {
                    const ln = docLines[t.line] ?? '';
                    if (/\bIMPLEMENTS\s*\(\s*\w+\s*\)/i.test(ln)) {
                        const moduleMatch = ln.match(/MODULE\s*\(\s*['"](.+?)['"]\s*\)/i);
                        if (moduleMatch) {
                            const resolved = this.resolveModuleFile(moduleMatch[1], document.uri);
                            if (resolved && !filesToSearch.includes(resolved)) {
                                filesToSearch.push(resolved);
                            }
                        }
                    }
                }
            }
        }

        // Scan `.inc` files via the canonical 3-layer chain (sibling +
        // RED-derived dirs from each project + libsrc) for:
        //   (a) classes that IMPLEMENTS(ifaceName) with a MODULE declaration → add those CLW files
        //   (b) the INC that DECLARES the interface itself (ifaceName INTERFACE) → add that INC
        // This covers both: starting from the interface declaration AND starting from an implementation.
        // RED-derived layer added by 8f1965c3 (audit follow-up Q1).
        const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const dirsToScan = buildIncDirsToScan(currentFilePath, sm);
        const implementsRe = new RegExp(`\\bIMPLEMENTS\\s*\\(\\s*${ifaceName}\\s*\\)`, 'i');
        const ifaceDeclRe  = new RegExp(`^[ \\t]*${ifaceName}[ \\t]+INTERFACE\\b`, 'im');
        for (const dir of dirsToScan) {
            let dirEntries: string[];
            try { dirEntries = fs.readdirSync(dir); } catch { continue; }
            for (const fname of dirEntries) {
                if (!fname.toLowerCase().endsWith('.inc')) continue;
                const incPath = path.join(dir, fname);
                const incUri = `file:///${incPath.replace(/\\/g, '/')}`;
                let incContent: string;
                try { incContent = fs.readFileSync(incPath, 'utf8'); } catch { continue; }

                // (a) IMPLEMENTS — add the MODULE CLW file
                if (implementsRe.test(incContent)) {
                    const moduleRe = /MODULE\s*\(\s*['"](.+?)['"]\s*\)/gi;
                    let m: RegExpExecArray | null;
                    while ((m = moduleRe.exec(incContent)) !== null) {
                        const resolved = this.resolveModuleFile(m[1], incUri);
                        if (resolved && !filesToSearch.includes(resolved)) {
                            filesToSearch.push(resolved);
                            logger.error(`[FAR] Found implementor via LibSrc scan: ${path.basename(decodeURIComponent(resolved))} (from ${fname})`);
                        }
                    }
                }

                // (b) INTERFACE declaration — add the INC itself so the InterfaceMethod token is found
                if (!filesToSearch.includes(incUri) && ifaceDeclRe.test(incContent)) {
                    filesToSearch.push(incUri);
                    logger.error(`[FAR] Found interface declaration in: ${fname}`);
                }
            }
        }

        logger.error(`[FAR] Interface method "${methodName}" (${ifaceName}) — searching ${filesToSearch.length} file(s)` +
            (sm?.solution?.projects?.length ? ` [solution: ${sm.solution.projects.length} project(s)]` : ' [no solution — using current file + MODULE fallback]') + ':\n' +
            filesToSearch.map(f => `  ${path.basename(decodeURIComponent(f))}`).join('\n'));

        // Pre-build set of class names that implement this interface, per-file (keyed by fileUri)
        // so MethodDeclaration filtering is fast and accurate.
        const implementingClassesByFile = new Map<string, Set<string>>();
        for (const fileUri of filesToSearch) {
            const ft = this.getTokensForUri(fileUri);
            if (!ft || ft.length === 0) continue;
            const fileContent = fileUri === document.uri
                ? document.getText()
                : (this.getFileContent(fileUri) ?? '');
            const fileLines = fileContent.split('\n');
            const implementors = new Set<string>();
            for (const t of ft) {
                if (t.type === TokenType.Structure && t.subType === TokenType.Class && t.label) {
                    const ln = fileLines[t.line] ?? '';
                    const implRe = /\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi;
                    let m: RegExpExecArray | null;
                    while ((m = implRe.exec(ln)) !== null) {
                        if (m[1].toLowerCase() === ifaceLower) {
                            implementors.add(t.label.toLowerCase());
                        }
                    }
                }
            }
            implementingClassesByFile.set(fileUri, implementors);
        }

        for (const fileUri of filesToSearch) {
            const fileTokens = this.getTokensForUri(fileUri);
            if (!fileTokens || fileTokens.length === 0) continue;

            for (const token of fileTokens) {
                if (token.type === TokenType.Comment || token.type === TokenType.String) continue;
                const labelLower = (token.label ?? '').toLowerCase();

                // InterfaceMethod declaration: report at the label (Variable) position on same line
                if (token.subType === TokenType.InterfaceMethod && labelLower === methodLower) {
                    if (includeDeclaration) {
                        // Find the preceding Variable/Label token on this line for exact position
                        const labelTok = fileTokens.find(t2 => t2.line === token.line && t2.value.toLowerCase() === methodLower);
                        const col = labelTok ? labelTok.start : token.start;
                        locations.push(Location.create(fileUri, Range.create(token.line, col, token.line, col + methodName.length)));
                    }
                    continue;
                }

                // MethodImplementation: only 3-part (Class.IFace.Method) where IFace matches exactly
                if (token.subType === TokenType.MethodImplementation) {
                    const parts = labelLower.split('.');
                    if (parts.length === 3 && parts[1] === ifaceLower && parts[2] === methodLower) {
                        // Point at the method-name segment, not the PROCEDURE keyword
                        const dotPos = (token.label ?? '').lastIndexOf('.');
                        const methodCol = dotPos >= 0 ? dotPos + 1 : token.start;
                        locations.push(Location.create(fileUri, Range.create(token.line, methodCol, token.line, methodCol + methodName.length)));
                        continue;
                    }
                }

                // MethodDeclaration (VIRTUAL) in a CLASS body — only if the enclosing class
                // implements this interface (prevents false positives from same-named methods
                // in unrelated classes).
                if (token.subType === TokenType.MethodDeclaration && labelLower === methodLower) {
                    const implementors = implementingClassesByFile.get(fileUri) ?? new Set<string>();
                    const parentClass = (token.parent?.label ?? '').toLowerCase();
                    if (implementors.has(parentClass)) {
                        const labelTok = fileTokens.find(t2 => t2.line === token.line && t2.value.toLowerCase() === methodLower);
                        const col = labelTok ? labelTok.start : token.start;
                        locations.push(Location.create(fileUri, Range.create(token.line, col, token.line, col + methodName.length)));
                    }
                }
            }
        }

        logger.error(`✅ [FAR] Interface method "${methodName}" — ${locations.length} reference(s) found`);

        // ── Call sites: varName.MethodName() where varName &IfaceName ──
        for (const fileUri of filesToSearch) {
            const ft = this.getTokensForUri(fileUri);
            if (!ft || ft.length === 0) continue;
            const varNames = this.collectInterfaceVarNames(ft, ifaceName);
            for (const varName of varNames) {
                const callHits = this.findMemberReferencesInFile(fileUri, methodName, undefined, undefined, varName, undefined, false);
                locations.push(...callHits);
            }
        }

        // Deduplicate by uri+line
        const seen = new Set<string>();
        const deduped = locations.filter(loc => {
            const key = `${loc.uri}:${loc.range.start.line}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        logger.error(`✅ [FAR] Interface method "${methodName}" — ${deduped.length} reference(s) after call-site scan`);
        return deduped.length > 0 ? deduped : null;
    }

    /**
     * Find all IMPLEMENTS(IfaceName) references to a given interface across all project files.
     * Also includes the INTERFACE declaration itself.
     */
    private async provideImplementsReferences(
        ifaceName: string,
        document: TextDocument
    ): Promise<Location[] | null> {
        const ifaceLower = ifaceName.toLowerCase();
        const locations: Location[] = [];

        // Collect all files to search
        const filesToSearch: string[] = [document.uri];
        const sm = SolutionManager.getInstance();
        if (sm?.solution?.projects?.length) {
            for (const project of sm.solution.projects) {
                for (const sf of project.sourceFiles) {
                    const fullPath = path.isAbsolute(sf.relativePath) ? sf.relativePath : path.join(project.path, sf.relativePath);
                    const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    if (!filesToSearch.includes(uri)) filesToSearch.push(uri);
                }
            }
        }

        logger.error(`[FAR] IMPLEMENTS("${ifaceName}") — searching ${filesToSearch.length} file(s)` +
            (sm?.solution?.projects?.length ? ` [solution: ${sm.solution.projects.length} project(s)]` : ' [no solution]') + ':\n' +
            filesToSearch.map(f => `  ${path.basename(decodeURIComponent(f))}`).join('\n'));

        for (const fileUri of filesToSearch) {
            const fileTokens = this.getTokensForUri(fileUri);
            if (!fileTokens || fileTokens.length === 0) continue;

            // For the current document use its in-memory text; for other files read from disk
            let fileContent: string | null = null;
            const getLines = (): string[] => {
                if (!fileContent) {
                    if (fileUri === document.uri) {
                        fileContent = document.getText();
                    } else {
                        try { fileContent = fs.readFileSync(decodeURIComponent(fileUri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\'), 'utf8'); } catch { fileContent = ''; }
                    }
                }
                return fileContent!.split('\n');
            };

            for (const token of fileTokens) {
                // INTERFACE declaration itself
                if (token.type === TokenType.Structure &&
                    token.subType === TokenType.Interface &&
                    (token.label ?? '').toLowerCase() === ifaceLower) {
                    locations.push(Location.create(fileUri, Range.create(token.line, 0, token.line, 0)));
                    continue;
                }

                // CLASS token that IMPLEMENTS this interface: check the line text
                if (token.type === TokenType.Structure &&
                    token.subType === TokenType.Class) {
                    const lines = getLines();
                    const ln = lines[token.line] ?? '';
                    const implRe = /\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi;
                    let m: RegExpExecArray | null;
                    while ((m = implRe.exec(ln)) !== null) {
                        if (m[1].toLowerCase() === ifaceLower) {
                            const nameStart = m.index + m[0].indexOf(m[1]);
                            locations.push(Location.create(fileUri, Range.create(token.line, nameStart, token.line, nameStart + m[1].length)));
                        }
                    }
                }
            }
        }

        logger.error(`✅ [FAR] IMPLEMENTS "${ifaceName}" — ${locations.length} reference(s) found`);
        return locations.length > 0 ? locations : null;
    }

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

        // Count call args at cursor position for overload-specific resolution
        const cursorLineText = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: 10000 }
        });
        const callArgCount = this.memberResolver.countParametersInCall(cursorLineText, memberName);
        logger.info(`📊 Call arg count at cursor: ${callArgCount} for "${memberName}"`);

        let declarationFile: string | null = null;
        let declarationLine: number = -1;
        let className: string | null = knownClassName ?? null;

        // --- Resolve the declaring class ---------------------------------
        const isSelfOrParent = /^(self|parent)$/i.test(beforeDot);

        if (isSelfOrParent) {
            const tokens = this.tokenCache.getTokens(document);
            const info = this.memberResolver.findClassMemberInfo(memberName, document, position.line, tokens, callArgCount);
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
                    const info = this.memberResolver.findClassMemberInfo(memberName, document, position.line, tokens, callArgCount);
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
                    info = await this.resolveViaVariableType(beforeDot, memberName, document, position, callArgCount);
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

        // When a CLASS is declared in the current document with no MODULE attribute,
        // all implementations are in the same file — but cross-procedure callers
        // can live in sibling MEMBER files. Restricting to `[document.uri]` blocks
        // those callers (Eve test 2 RED). Widening to all project files would scan
        // thousands of files and hang on large solutions.
        //
        // P2b track-(a) fix (task 10ea5a80): use FRG to widen to MEMBER siblings
        // (and reverse-includes) when available; fall through to project scan only
        // when FRG is empty (test fixtures without graph setup).
        const isLocalClass = !effectiveModuleFile && !!className &&
            this.isClassDeclaredInDocument(className, document);
        if (isLocalClass) {
            logger.error(`📌 [FAR] "${className}" is a local class — widening search to MEMBER siblings + reverse-includes`);
        }

        const filesToSearch = isLocalClass
            ? this.getLocalClassSearchFiles(document)
            : this.getMemberSearchFiles(document, declarationFile, effectiveModuleFile);

        logger.info(`🔍 Searching ${filesToSearch.length} file(s) for ${className ?? '?'}.${memberName}`);

        // Build overload filter: capture both arity range AND cursor decl signature.
        // - arity range: used by call-site filters (existing behavior pre-fe254d6f).
        // - declSignature: used for type-aware decl-on-decl filtering via
        //   `MethodOverloadResolver.signaturesMatch` (fe254d6f Phase A B-extension).
        //
        // Resolution order:
        //   1. Use resolved declarationFile + declarationLine when available (existing path).
        //   2. Fallback: when class-body cursor route is taken and declarationFile didn't
        //      resolve (findClassMemberInfo failed), use the cursor's own document + position
        //      line — the cursor IS on the decl in the class-body route.
        let overloadFilter: OverloadFilter | undefined;
        let filterDeclFile: string | null = null;
        let filterDeclLine: number = -1;
        if (declarationFile && declarationLine >= 0) {
            filterDeclFile = declarationFile;
            filterDeclLine = declarationLine;
        } else if (knownClassName) {
            // Class-body / MethodImpl-of-local-class fallback — cursor IS the decl.
            filterDeclFile = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            filterDeclLine = position.line;
        }
        if (filterDeclFile && filterDeclLine >= 0) {
            // Try in-memory document text first if cursor file matches; fall back to disk.
            let declLineText: string | null = null;
            const declFileNorm = filterDeclFile.replace(/\\/g, '/').toLowerCase();
            const docFsPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''));
            if (docFsPath.replace(/\\/g, '/').toLowerCase() === declFileNorm) {
                declLineText = document.getText().split(/\r?\n/)[filterDeclLine] ?? null;
            }
            if (!declLineText) {
                declLineText = ClassMemberResolver.getDeclarationLineText(filterDeclFile, filterDeclLine);
            }
            if (declLineText && /\bPROCEDURE\b/i.test(declLineText)) {
                const maxArgs = this.memberResolver.countParametersInDeclaration(declLineText);
                const defaultCount = ClarionPatterns.countDefaultParams(declLineText);
                const minArgs = maxArgs - defaultCount;
                overloadFilter = {
                    minArgs,
                    maxArgs,
                    declarationLine: filterDeclLine,
                    declarationFileNorm: filterDeclFile.toLowerCase(),
                    declSignature: declLineText.trim()
                };
                logger.info(`🎯 Overload filter: args ${minArgs}–${maxArgs}, sig="${overloadFilter.declSignature}" (decl at line ${filterDeclLine})`);
            }
        }

        // P2b track-(b): gather all sibling overload signatures for type-aware
        // call-site overload picking inside the matching loop. Empty / single-entry
        // means no type-aware filtering needed (matching loop short-circuits).
        const candidateOverloads = (className && filterDeclFile)
            ? this.gatherClassMemberOverloads(className, memberName, filterDeclFile, document)
            : [];

        // Build class family (declaring class + all subclasses) so that SELF.Member
        // references in subclass method implementations are included.
        const classFamily = className
            ? this.buildClassFamily(className, filesToSearch)
            : undefined;

        // Phase B+ Tier 6 — load global scope from PROGRAM file via FRG so the
        // matching loop can resolve receivers declared at PROGRAM level. Loaded
        // ONCE per match and shared across every file in `filesToSearch`. Empty
        // map when there's no resolvable PROGRAM file (e.g. cursor file IS the
        // PROGRAM, or FRG not built — module scope of cursor file then carries
        // anything the global lookup would have caught anyway).
        const globalScope = this.loadGlobalScopeForCursor(document) ?? undefined;

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
            const hits = this.findMemberReferencesInFile(fileUri, memberName, className ?? undefined, classFamily, beforeDot ?? undefined, overloadFilter, context.includeDeclaration, document, candidateOverloads, globalScope);
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
        position: { line: number; character: number },
        callArgCount?: number
    ): Promise<ChainedMemberInfo | null> {
        // Must be a plain identifier (no dots), not SELF/PARENT
        if (variableName.includes('.') || /^(self|parent)$/i.test(variableName)) return null;

        const symbolInfo = await this.symbolFinder.findSymbol(variableName, document, position);
        if (!symbolInfo) return null;

        const typeName = ClassMemberResolver.extractClassName(symbolInfo.type);
        if (!typeName) return null;

        logger.info(`Tier2: "${variableName}" has type "${typeName}", looking up member "${memberName}"`);
        const info = await this.memberResolver.findMemberInNamedStructure(memberName, typeName, document, callArgCount);
        return info ?? null;
    }

    /**
     * Files to search for member references.
     * Always includes: the current document, the declaration file (INC), and all project CLW files.
     * Also adds any MODULE('file.clw') referenced by the enclosing CLASS declaration.
     * Class members (SELF.Order) can be used in any implementation file in the project.
     */
    /**
     * P2b track-(b) + Phase B+ — file-level variable-type index covering Clarion's
     * scope tiers per `project_clarion_scope_model.md`:
     *
     *   Tier 2 (procedure parameters)        — folded into procScopes via Token.parameters
     *   Tier 3 (procedure local data)        — col-0 Labels within proc finishesAt
     *   Tier 4 (CLASS member data via SELF)  — when proc is a methodImpl, classFields populated
     *   Tier 5 (module data)                 — col-0 Labels OUTSIDE any procedure scope
     *
     * Tier 1 (Routine Local data) is deferred to follow-up task 9142af9f — needs
     * own-name-scope shadowing semantics that warrant separate test coverage.
     *
     * Tier 6 (global data) is built per-file too but loaded SEPARATELY via
     * `loadGlobalScope(programFileUri)` — the PROGRAM file may differ from the
     * cursor's MEMBER file, so the matching loop loads it once per match and
     * passes it into `lookupVarTypeAtLine`.
     */
    private buildFileVarTypeIndex(tokens: Token[]): {
        procScopes: Array<{
            startLine: number;
            endLine: number;
            varTypes: Map<string, string>;
            classFields?: Map<string, string>;
            enclosingClassLower?: string;
        }>;
        moduleScope: Map<string, string>;
    } {
        const procScopes: Array<{
            startLine: number;
            endLine: number;
            varTypes: Map<string, string>;
            classFields?: Map<string, string>;
            enclosingClassLower?: string;
        }> = [];
        const moduleScope = new Map<string, string>();

        const tokensByLine = new Map<number, Token[]>();
        for (const t of tokens) {
            const arr = tokensByLine.get(t.line);
            if (arr) arr.push(t); else tokensByLine.set(t.line, [t]);
        }

        // Pre-compute procedure line ranges so we can identify "outside-any-procedure"
        // lines for the module-scope walk (Tier 5).
        const procRanges: Array<{ start: number; end: number }> = [];
        for (const procToken of tokens) {
            if (procToken.type === TokenType.Procedure &&
                (procToken.subType === TokenType.GlobalProcedure ||
                 procToken.subType === TokenType.MethodImplementation) &&
                procToken.finishesAt !== undefined && procToken.finishesAt > procToken.line) {
                procRanges.push({ start: procToken.line, end: procToken.finishesAt });
            }
        }
        const isInsideAnyProcedure = (line: number) =>
            procRanges.some(r => line >= r.start && line <= r.end);

        // Tier 5 — Module scope: col-0 Labels OUTSIDE any procedure scope.
        for (const t of tokens) {
            if (t.type !== TokenType.Label || t.start !== 0 || !t.label) continue;
            if (isInsideAnyProcedure(t.line)) continue;
            const lineTokens = tokensByLine.get(t.line);
            if (!lineTokens) continue;
            this.captureLabelType(t, lineTokens, moduleScope);
        }

        // Per-procedure scope build (Tiers 2 + 3 + optional Tier 4 for methods).
        for (const procToken of tokens) {
            if (procToken.type !== TokenType.Procedure ||
                (procToken.subType !== TokenType.GlobalProcedure &&
                 procToken.subType !== TokenType.MethodImplementation) ||
                procToken.finishesAt === undefined || procToken.finishesAt <= procToken.line) {
                continue;
            }
            const startLine = procToken.line;
            const endLine = procToken.finishesAt;
            const varTypes = new Map<string, string>();

            // Tier 2 — Procedure parameters from tokenizer's structured parameters list.
            if (procToken.parameters) {
                for (const p of procToken.parameters) {
                    if (p.name) {
                        // Strip pass-by-ref decoration from type for downstream comparisons.
                        const cleanType = p.type ? p.type.replace(/^[*&]\s*/, '') : '';
                        varTypes.set(p.name.toLowerCase(), cleanType);
                    }
                }
            }

            // Tier 3 — Procedure local data: col-0 Labels within (startLine, endLine).
            for (let line = startLine + 1; line <= endLine; line++) {
                const lineTokens = tokensByLine.get(line);
                if (!lineTokens) continue;
                for (let k = 0; k < lineTokens.length; k++) {
                    const cand = lineTokens[k];
                    if (cand.type !== TokenType.Label || cand.start !== 0 || !cand.label) continue;
                    this.captureLabelType(cand, lineTokens, varTypes);
                }
            }

            // Tier 4 — CLASS member data via SELF (only for methodImpls).
            // procToken.label for methodImpl is "ClassName.MethodName" → split on '.'
            // → look up the CLASS structure → walk its data members.
            let classFields: Map<string, string> | undefined;
            let enclosingClassLower: string | undefined;
            if (procToken.subType === TokenType.MethodImplementation && procToken.label) {
                const dotIdx = procToken.label.indexOf('.');
                if (dotIdx > 0) {
                    enclosingClassLower = procToken.label.substring(0, dotIdx).toLowerCase();
                    classFields = this.gatherClassDataMembers(enclosingClassLower, tokens, tokensByLine);
                }
            }

            procScopes.push({ startLine, endLine, varTypes, classFields, enclosingClassLower });
        }

        return { procScopes, moduleScope };
    }

    /**
     * Helper for `buildFileVarTypeIndex`: extract the declared-type of a column-0
     * Label by inspecting the next significant token on the same line. Mutates
     * `target` map.
     */
    private captureLabelType(label: Token, lineTokens: Token[], target: Map<string, string>): void {
        const idx = lineTokens.indexOf(label);
        if (idx < 0 || idx + 1 >= lineTokens.length) return;
        const next = lineTokens[idx + 1];
        if (!label.label) return;
        const nameLower = label.label.toLowerCase();

        // Class-typed (`inst MyClass`), Type-keyword (`count LONG`), Reference (`mgr &MyClass`).
        if (next.type === TokenType.Type ||
            next.type === TokenType.Variable ||
            next.type === TokenType.Label) {
            target.set(nameLower, next.value);
        } else if (next.type === TokenType.ReferenceVariable) {
            const stripped = next.value.startsWith('&') ? next.value.slice(1) : next.value;
            target.set(nameLower, stripped);
        } else if (label.dataType) {
            target.set(nameLower, label.dataType);
        }
    }

    /**
     * Helper for `buildFileVarTypeIndex` Tier 4 — walks the named CLASS structure's
     * data members (col-0 Labels inside the class body, EXCLUDING method declarations).
     */
    private gatherClassDataMembers(
        classNameLower: string,
        tokens: Token[],
        tokensByLine: Map<number, Token[]>
    ): Map<string, string> {
        const fields = new Map<string, string>();
        for (const t of tokens) {
            if (t.type === TokenType.Structure && t.subType === TokenType.Class &&
                t.label?.toLowerCase() === classNameLower &&
                t.finishesAt !== undefined && t.finishesAt > t.line) {
                for (let line = t.line + 1; line < t.finishesAt; line++) {
                    const lineTokens = tokensByLine.get(line);
                    if (!lineTokens) continue;
                    for (let k = 0; k < lineTokens.length; k++) {
                        const cand = lineTokens[k];
                        if (cand.type !== TokenType.Label || cand.start !== 0 || !cand.label) continue;
                        // Skip method declarations — fields only.
                        const next = lineTokens[k + 1];
                        if (next && next.type === TokenType.Procedure) continue;
                        this.captureLabelType(cand, lineTokens, fields);
                    }
                }
            }
        }
        return fields;
    }

    /**
     * Tier 6 — load module-level variables from a different file (typically the
     * PROGRAM file, when the cursor's file is a MEMBER). Reuses the same module-scope
     * walk as `buildFileVarTypeIndex`. Returns empty map if the file can't be loaded.
     */
    private loadGlobalScopeFromProgramFile(programFileUri: string): Map<string, string> {
        const tokens = this.getTokensForUri(programFileUri);
        if (!tokens || tokens.length === 0) return new Map();
        return this.buildFileVarTypeIndex(tokens).moduleScope;
    }

    /**
     * Tier 6 entry point — resolve the PROGRAM file for the cursor's MEMBER (via FRG)
     * and load its module-scope vars. Returns null when the cursor file IS the PROGRAM,
     * when FRG isn't built, or when the PROGRAM file can't be located. Callers treat
     * null as "no global scope to consult" — module scope of the cursor file already
     * covers anything that would have been caught by global lookup in those cases.
     */
    private loadGlobalScopeForCursor(document: TextDocument): Map<string, string> | null {
        const graph = FileRelationshipGraph.getInstance();
        if (!graph.isBuilt) return null;
        const docFsPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
            .replace(/\//g, '\\');
        const programFsPath = graph.getProgramFile(docFsPath);
        if (!programFsPath) return null;
        // FRG normalizes paths to lowercase forward-slash; rebuild URI accordingly.
        const programUri = 'file:///' + programFsPath.replace(/\\/g, '/');
        // Skip if cursor IS the PROGRAM — module scope of cursor file already covers it.
        if (programUri.toLowerCase() === document.uri.toLowerCase()) return null;
        return this.loadGlobalScopeFromProgramFile(programUri);
    }

    /**
     * P2b track-(b) — variable-type lookup at a source line + key.
     *
     * Walks the tier chain in Clarion's resolution priority order:
     *   1. (deferred — Routine Local data, task 9142af9f)
     *   2. Procedure parameters + 3. Procedure Local data (both in `procScope.varTypes`)
     *   4. CLASS member data via SELF (only consulted when `key` starts with "self.")
     *   5. Module data (`moduleScope`)
     *   6. Global data (`globalScope` from PROGRAM file)
     *
     * `key` is one of:
     *   - plain identifier (`'inst'`) → searched against varTypes / moduleScope / globalScope
     *   - SELF-prefixed (`'self.receiver'`) → searched against the procedure's classFields
     */
    private lookupVarTypeAtLine(
        index: {
            procScopes: Array<{
                startLine: number;
                endLine: number;
                varTypes: Map<string, string>;
                classFields?: Map<string, string>;
                enclosingClassLower?: string;
            }>;
            moduleScope: Map<string, string>;
        },
        globalScope: Map<string, string> | null,
        line: number,
        key: string
    ): string | undefined {
        const scope = index.procScopes.find(s => line >= s.startLine && line <= s.endLine);

        // SELF.field path — Tier 4 only.
        if (key.startsWith('self.')) {
            const fieldNameLower = key.slice('self.'.length);
            return scope?.classFields?.get(fieldNameLower);
        }

        // Plain identifier path — Tiers 2/3 → 5 → 6.
        if (scope) {
            const local = scope.varTypes.get(key);
            if (local) return local;
        }
        const moduleHit = index.moduleScope.get(key);
        if (moduleHit) return moduleHit;
        return globalScope?.get(key);
    }

    /**
     * P2b track-(b) — gather all overload declarations for `className.memberName`
     * from the file containing the class declaration. Used by the matching loop
     * to type-discriminate call sites against the cursor's decl line.
     */
    private gatherClassMemberOverloads(
        className: string,
        memberName: string,
        declFileNorm: string,
        document: TextDocument
    ): Array<{ signature: string; declarationLine: number }> {
        const result: Array<{ signature: string; declarationLine: number }> = [];
        const docFsNorm = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
            .replace(/\//g, '\\').toLowerCase();

        let lookupTokens: Token[] | null = null;
        let getLineText: (line: number) => string;
        if (declFileNorm === docFsNorm) {
            lookupTokens = this.tokenCache.getTokens(document);
            const docLines = document.getText().split(/\r?\n/);
            getLineText = (line) => docLines[line] ?? '';
        } else {
            const declUri = 'file:///' + declFileNorm.replace(/\\/g, '/');
            lookupTokens = this.getTokensForUri(declUri);
            getLineText = (line) => ClassMemberResolver.getDeclarationLineText(declFileNorm, line) ?? '';
        }
        if (!lookupTokens || lookupTokens.length === 0) return result;

        const classNameLower = className.toLowerCase();
        const memberLower = memberName.toLowerCase();

        for (const t of lookupTokens) {
            if (t.type === TokenType.Structure && t.subType === TokenType.Class &&
                t.label?.toLowerCase() === classNameLower && t.children) {
                for (const child of t.children) {
                    if (child.subType === TokenType.MethodDeclaration &&
                        child.label?.toLowerCase() === memberLower) {
                        const sig = getLineText(child.line).trim();
                        if (sig && /\bPROCEDURE\b/i.test(sig)) {
                            result.push({ signature: sig, declarationLine: child.line });
                        }
                    }
                }
            }
        }
        return result;
    }

    private getLocalClassSearchFiles(document: TextDocument): string[] {
        const files = new Set<string>([document.uri]);
        const docFsPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');

        const graph = FileRelationshipGraph.getInstance();
        if (graph.isBuilt) {
            // (1) MEMBER siblings: files sharing the same PROGRAM('main') parent.
            const programFile = graph.getProgramFile(docFsPath);
            if (programFile) {
                for (const memberFsPath of graph.getMemberFiles(programFile)) {
                    files.add('file:///' + memberFsPath);
                }
            }
            // (2) Reverse-includes: anyone explicitly INCLUDEing the cursor's file.
            const visited = new Set<string>();
            const queue: string[] = [docFsPath];
            while (queue.length > 0) {
                const current = queue.shift()!;
                const norm = current.toLowerCase().replace(/\\/g, '/');
                if (visited.has(norm)) continue;
                visited.add(norm);
                for (const edge of graph.getReverseIncludes(current)) {
                    files.add('file:///' + edge.fromFile);
                    queue.push(edge.fromFile);
                }
            }
            if (files.size > 1) {
                logger.info(`[FRG] getLocalClassSearchFiles: widened to ${files.size} file(s) via MEMBER siblings + reverse includes`);
                return Array.from(files);
            }
            // FRG built but yielded nothing useful — fall through to project scan.
        }

        // Graph not ready or returned no widening — fall back to scanning all project files.
        // This is the path test 2's MultiFileFARFixture exercises (FRG not seeded).
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution?.projects?.length) {
            for (const project of solutionManager.solution.projects) {
                for (const sourceFile of project.sourceFiles) {
                    const fullPath = path.isAbsolute(sourceFile.relativePath)
                        ? sourceFile.relativePath
                        : path.join(project.path, sourceFile.relativePath);
                    files.add(`file:///${fullPath.replace(/\\/g, '/')}`);
                }
            }
        }

        const result = Array.from(files);
        logger.info(`📂 [local-class] search files: ${result.length}`);
        return result;
    }

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

        // Use the FileRelationshipGraph to narrow the search: find all files that
        // transitively include the class's declaration file (INC), rather than scanning
        // every project source file. This is a BFS over reverse INCLUDE edges.
        const graph = FileRelationshipGraph.getInstance();
        if (graph.isBuilt && declarationFile) {
            const fsPath = decodeURIComponent(declarationFile.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            const visited = new Set<string>();
            const queue: string[] = [fsPath];

            while (queue.length > 0) {
                const current = queue.shift()!;
                const normCurrent = current.toLowerCase().replace(/\\/g, '/');
                if (visited.has(normCurrent)) continue;
                visited.add(normCurrent);

                const reverseEdges = graph.getReverseIncludes(current);
                for (const edge of reverseEdges) {
                    // edge.fromFile is already normalized (lowercase forward-slash, no file://)
                    const fromUri = 'file:///' + edge.fromFile;
                    files.add(fromUri);
                    queue.push(edge.fromFile);
                }
            }

            if (files.size > 2) {
                logger.info(`[FRG] getMemberSearchFiles: narrowed to ${files.size} file(s) via reverse includes`);
                return Array.from(files);
            }
            // If graph gave us nothing useful (only document + declarationFile), fall through to full scan
        }

        // Graph not ready or returned no additional files — fall back to scanning all project files
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution?.projects?.length) {
            for (const project of solutionManager.solution.projects) {
                for (const sourceFile of project.sourceFiles) {
                    const fullPath = path.isAbsolute(sourceFile.relativePath) ? sourceFile.relativePath : path.join(project.path, sourceFile.relativePath);
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
     * Returns true when the named CLASS is declared inside the current document's
     * token tree (i.e. it is a "local" class, not imported from an INC file).
     * Used to avoid scanning the entire solution for classes that can only be
     * referenced within the declaring file.
     */
    private isClassDeclaredInDocument(className: string, document: TextDocument): boolean {
        const tokens = this.tokenCache.getTokens(document);
        const nameLower = className.toLowerCase();
        return tokens.some(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Class &&
            (t.label ?? '').toLowerCase() === nameLower
        );
    }

    /**
     * Counts call arguments from the token stream starting after a given token index.
     * Looks for '(' on the same line, then counts top-level commas until matching ')'.
     * Returns -1 if no parentheses found (property access, not a call).
     * Returns 0 if empty parens found.
     */
    private countCallArgsFromTokens(tokens: Token[], afterIndex: number): number {
        const callLine = tokens[afterIndex].line;
        let j = afterIndex + 1;
        while (j < tokens.length && tokens[j].line === callLine) {
            const t = tokens[j];
            if (t.type === TokenType.Delimiter && t.value === '(') {
                let depth = 1;
                let commas = 0;
                let hasContent = false;
                j++;
                while (j < tokens.length && depth > 0) {
                    const inner = tokens[j];
                    if (inner.type === TokenType.Delimiter) {
                        if (inner.value === '(') depth++;
                        else if (inner.value === ')') {
                            depth--;
                        } else if (inner.value === ',' && depth === 1) {
                            commas++;
                        }
                    } else if (inner.type !== TokenType.Comment) {
                        hasContent = true;
                    }
                    j++;
                }
                return (hasContent || commas > 0) ? commas + 1 : 0;
            }
            if (t.type !== TokenType.Comment) break;
            j++;
        }
        return -1;
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
        chainPrefix?: string,
        overloadFilter?: OverloadFilter,
        includeDeclaration: boolean = true,
        currentDocument?: TextDocument,
        candidateOverloads?: Array<{ signature: string; declarationLine: number }>,
        globalScope?: Map<string, string>
    ): Location[] {
        const tokens = this.getTokensForUri(fileUri);
        if (!tokens || tokens.length === 0) return [];

        // P2b track-(b) + Phase B+: file-level variable-type index covering Tiers 2-5.
        // Tier 6 (global) is loaded externally and passed as `globalScope`.
        const fileVarIndex = this.buildFileVarTypeIndex(tokens);
        const effectiveGlobalScope = globalScope ?? null;

        // P2b track-(b): classifier + resolver for type-aware overload filtering.
        // Only instantiated once per file; cheap stateless objects.
        const argClassifier = new CallSiteArgumentClassifier();
        const overloadResolver = new MethodOverloadResolver();
        const classifierCtx: ClassifierContext = {
            resolveSymbolType: (name, line) =>
                this.lookupVarTypeAtLine(fileVarIndex, effectiveGlobalScope, line, name.toLowerCase())
        };

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

        // Read file lines once for overload-filtered MethodImplementation param checking.
        // Use in-memory document text when fileUri matches currentDocument; otherwise
        // fall back to disk read (fe254d6f Phase A B-extension — necessary for in-memory
        // test fixtures + matches the plain-symbol path's findReferencesInFile pattern).
        let fileLines: string[] | null = null;
        if (overloadFilter) {
            if (currentDocument && currentDocument.uri === fileUri) {
                fileLines = currentDocument.getText().split(/\r?\n/);
            } else {
                try {
                    const filePath = decodeURIComponent(fileUri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
                    fileLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
                } catch { fileLines = null; }
            }
        }
        const fileUriNorm = fileUri.toLowerCase();

        /** Checks if a given arg count is compatible with the overload filter's range. */
        const isCompatibleArgCount = (argCount: number): boolean => {
            if (!overloadFilter) return true;
            if (argCount < 0) return true; // no parens = property access, always include
            return argCount >= overloadFilter.minArgs && argCount <= overloadFilter.maxArgs;
        };

        // P2b track-(b): type-aware call-site filter. Composes the existing arity check
        // with the call-site argument classifier + overload-by-args resolver. Skips the
        // type pick when there's only one candidate overload (nothing to disambiguate).
        // Match-all fallback (silent-failure-pushback bias per Mark pick (b)) means an
        // ambiguous call site is INCLUDED in results — false-positive over false-negative
        // for F2-rename safety.
        const isCompatibleCallSite = (callIdx: number): boolean => {
            const argCount = this.countCallArgsFromTokens(tokens, callIdx);
            if (!isCompatibleArgCount(argCount)) return false;
            if (!candidateOverloads || candidateOverloads.length <= 1) return true;
            if (argCount < 0) return true; // property access, no overload pick
            const args = argClassifier.classifyArguments(tokens, callIdx, classifierCtx);
            if (!args) return true;
            const result = overloadResolver.findOverloadByArgClassifications(
                args,
                candidateOverloads.map(c => c.signature)
            );
            if (result.matchedAll || result.matchedIndex < 0) return true; // conservative
            if (!overloadFilter) return true;
            return candidateOverloads[result.matchedIndex].declarationLine === overloadFilter.declarationLine;
        };

        /** Checks if a declaration line is the matched overload's declaration. */
        const isMatchedDeclaration = (line: number, fileNorm: string): boolean => {
            if (!overloadFilter) return true;
            return line === overloadFilter.declarationLine && fileNorm === overloadFilter.declarationFileNorm;
        };

        // Pre-build the set of lines that are MethodImplementation headers for the target class.
        // When !includeDeclaration, any token that lands on these lines is part of a declaration
        // and must be excluded — even if pattern-matched by another branch (e.g. StructureField).
        const implHeaderLines: Set<number> = !includeDeclaration && classLower
            ? new Set(tokens
                .filter(t => t.subType === TokenType.MethodImplementation && t.label &&
                             t.label.substring(0, t.label.lastIndexOf('.')).toLowerCase() === classLower)
                .map(t => t.line))
            : new Set<number>();

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === TokenType.Comment || token.type === TokenType.String) continue;

            if (token.type === TokenType.StructureField) {
                const parts = token.value.split('.');
                const lastSeg = parts[parts.length - 1].toLowerCase();

                if (lastSeg === memberLower) {
                    const penultimate = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : '';

                    if ((penultimate === 'self' || penultimate === 'parent') && isInTargetClass(token.line)) {
                        // PARENT.Member inside the TARGET class's own method calls the *parent's*
                        // implementation — that is NOT a reference to the target class's method.
                        // Only include PARENT.Member when we are inside a SUBCLASS method.
                        if (penultimate === 'parent' && classLower) {
                            const scope = methodScopes.find(s => token.line >= s.startLine && token.line <= s.endLine);
                            if (scope && scope.classLower === classLower) {
                                continue; // skip: calling grandparent, not target class
                            }
                        }
                        // 2-segment: SELF.Member — direct access, filter by enclosing method class
                        if (isCompatibleCallSite(i)) {
                            locations.push(Location.create(fileUri,
                                Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                             token.line, token.start + token.value.length)));
                        }

                    } else if (parts.length >= 3 &&
                               (parts[0].toLowerCase() === 'self' || parts[0].toLowerCase() === 'parent') &&
                               penultimate !== memberLower) {
                        // 3+ segment all-in-one: SELF.X.Member (e.g. SELF.Sort.Thumb tokenized as one token)
                        const prefixOfToken = token.value.substring(0, token.value.lastIndexOf('.')).toLowerCase();
                        if (!chainPrefixLower || prefixOfToken === chainPrefixLower) {
                            if (isCompatibleCallSite(i)) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                                 token.line, token.start + token.value.length)));
                            }
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
                                if (isCompatibleCallSite(i)) {
                                    locations.push(Location.create(fileUri,
                                        Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                                     token.line, token.start + token.value.length)));
                                }
                            }
                        } else if (parts.length === 2 && chainPrefixLower &&
                                   parts[0].toLowerCase() === chainPrefixLower) {
                            // Typed variable direct access: e.g. INIMgr.Init
                            // where chainPrefix is the variable name (INIMgr).
                            if (!includeDeclaration && implHeaderLines.has(token.line)) continue; // impl header line
                            if (isCompatibleCallSite(i)) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                                 token.line, token.start + token.value.length)));
                            }
                        } else if (parts.length === 2 && !chainPrefixLower && classLower) {
                            // P2b track-(b): no chainPrefix from cursor side (cursor is on
                            // the class-body decl, not a call site). Recognize var.member
                            // calls where var's declared type is in the target class family.
                            // Resolves cross-procedure callers like `inst.Append('x')` where
                            // `inst MyClass` is declared at any of: parameter / procedure-local /
                            // module / global scope (Tiers 2/3/5/6).
                            const varNameLower = parts[0].toLowerCase();
                            const varType = this.lookupVarTypeAtLine(
                                fileVarIndex, effectiveGlobalScope, token.line, varNameLower);
                            if (varType) {
                                const varTypeBase = varType.toLowerCase().split('(')[0].trim();
                                const matchesFamily = classFamily ? classFamily.has(varTypeBase) : varTypeBase === classLower;
                                if (matchesFamily) {
                                    if (!includeDeclaration && implHeaderLines.has(token.line)) continue;
                                    if (isCompatibleCallSite(i)) {
                                        locations.push(Location.create(fileUri,
                                            Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                                         token.line, token.start + token.value.length)));
                                    }
                                }
                            }
                        } else if (parts.length === 3 && !chainPrefixLower && classLower &&
                                   parts[0].toLowerCase() === 'self') {
                            // Phase B+ Tier 4: SELF.field.method receiver (cursor on class-body decl,
                            // call site is `SELF.someInst.Append(...)` from inside a method body).
                            // Look up the field via the enclosing class's data members.
                            const fieldKey = 'self.' + parts[1].toLowerCase();
                            const fieldType = this.lookupVarTypeAtLine(
                                fileVarIndex, effectiveGlobalScope, token.line, fieldKey);
                            if (fieldType) {
                                const fieldTypeBase = fieldType.toLowerCase().split('(')[0].trim();
                                const matchesFamily = classFamily ? classFamily.has(fieldTypeBase) : fieldTypeBase === classLower;
                                if (matchesFamily) {
                                    if (!includeDeclaration && implHeaderLines.has(token.line)) continue;
                                    if (isCompatibleCallSite(i)) {
                                        locations.push(Location.create(fileUri,
                                            Range.create(token.line, token.start + token.value.lastIndexOf('.') + 1,
                                                         token.line, token.start + token.value.length)));
                                    }
                                }
                            }
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

            // Phase B+ Tier 4 — SELF.field.method receiver tokenizes as
            // StructureField("SELF.X") + Function("Method"). Catch the Function-token
            // path here when no chainPrefix propagates from the cursor side. Look up
            // X via the enclosing class's data members and confirm type matches family.
            if ((token.type === TokenType.Function || token.type === TokenType.Variable) &&
                token.value.toLowerCase() === memberLower &&
                !chainPrefixLower && classLower) {
                const prev = i > 0 ? tokens[i - 1] : null;
                if (prev && prev.type === TokenType.StructureField && prev.line === token.line) {
                    const prevParts = prev.value.split('.');
                    if (prevParts.length === 2 && prevParts[0].toLowerCase() === 'self') {
                        const fieldKey = 'self.' + prevParts[1].toLowerCase();
                        const fieldType = this.lookupVarTypeAtLine(
                            fileVarIndex, effectiveGlobalScope, token.line, fieldKey);
                        if (fieldType) {
                            const fieldTypeBase = fieldType.toLowerCase().split('(')[0].trim();
                            const matchesFamily = classFamily ? classFamily.has(fieldTypeBase) : fieldTypeBase === classLower;
                            if (matchesFamily) {
                                if (!includeDeclaration && implHeaderLines.has(token.line)) continue;
                                if (isCompatibleCallSite(i)) {
                                    locations.push(Location.create(fileUri,
                                        Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                                    continue;
                                }
                            }
                        }
                    }
                }
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
                                if (isCompatibleCallSite(i)) {
                                    locations.push(Location.create(fileUri,
                                        Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                                }
                            } else if (isInTargetClass(token.line)) {
                                const preDot = i >= 2 ? tokens[i - 2] : undefined;
                                if (preDot && /^parent$/i.test(preDot.value) && classLower) {
                                    // PARENT.Member: only include from subclass methods, not from
                                    // the declaring class itself (that would be a grandparent call).
                                    const scope = methodScopes.find(s => token.line >= s.startLine && token.line <= s.endLine);
                                    if (!scope || scope.classLower !== classLower) {
                                        if (isCompatibleCallSite(i)) {
                                            locations.push(Location.create(fileUri,
                                                Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                                        }
                                    }
                                } else if (isCompatibleCallSite(i)) {
                                    locations.push(Location.create(fileUri,
                                        Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                                }
                            }
                        } else if (isInTargetClass(token.line)) {
                            // Explicit dot: e.g. var.Thumb where var is resolved to the right class
                            const preDot = i >= 2 ? tokens[i - 2] : undefined;
                            if (preDot && /^parent$/i.test(preDot.value) && classLower) {
                                const scope = methodScopes.find(s => token.line >= s.startLine && token.line <= s.endLine);
                                if (!scope || scope.classLower !== classLower) {
                                    if (isCompatibleCallSite(i)) {
                                        locations.push(Location.create(fileUri,
                                            Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                                    }
                                }
                            } else if (isCompatibleCallSite(i)) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                            }
                        }
                    } else if (prev.type === TokenType.StructureField &&
                               prev.line === token.line &&
                               /^(self|parent)\b/i.test(prev.value) &&
                               !prev.value.toLowerCase().endsWith('.' + memberLower)) {
                        // Implicit dot: StructureField "SELF.Sort" immediately before Variable "Thumb"
                        // (tokenizer splits SELF.Sort.Thumb into StructureField + Variable).
                        // If we know the exact chain prefix, verify the StructureField value matches it.
                        if (!chainPrefixLower || prev.value.toLowerCase() === chainPrefixLower) {
                            if (isCompatibleCallSite(i)) {
                                locations.push(Location.create(fileUri,
                                    Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                            }
                        }
                    }
                }
                continue;
            }

            // Member declaration at column 0 — only inside the correct CLASS body
            if (token.type === TokenType.Label && token.start === 0 &&
                token.value.toLowerCase() === memberLower) {
                if (!includeDeclaration) continue; // skip CLASS body declarations when not wanted
                const enclosingStruct = tokens.slice(0, i).reverse().find(t =>
                    t.type === TokenType.Structure &&
                    t.finishesAt !== undefined &&
                    t.finishesAt >= token.line
                );
                if (enclosingStruct && enclosingStruct.subType === TokenType.Class) {
                    // When className is known, verify the label of the CLASS matches
                    if (!classLower || (enclosingStruct.label ?? '').toLowerCase() === classLower) {
                        // Type-aware overload distinction (fe254d6f Phase A B-extension):
                        // when the cursor's decl signature is known, only include this
                        // candidate decl when its signature matches via signaturesMatch.
                        // Falls back to line/file equality (existing isMatchedDeclaration
                        // semantics) when no signature is captured.
                        let isSigMatch = isMatchedDeclaration(token.line, fileUriNorm);
                        if (overloadFilter?.declSignature && fileLines) {
                            const candidateSig = fileLines[token.line]?.trim() ?? '';
                            isSigMatch = candidateSig.length > 0 &&
                                this.overloadResolver.signaturesMatch(overloadFilter.declSignature, candidateSig);
                        }
                        if (isSigMatch) {
                            locations.push(Location.create(fileUri,
                                Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                        }
                    }
                }
            }

            // Procedure implementation: "ClassName.MethodName PROCEDURE" at col 0
            // The PROCEDURE token has subType=MethodImplementation and label="ClassName.MethodName".
            // The method name itself is the Variable token immediately before PROCEDURE on the same line.
            // Post-fe254d6f: only the matching-signature impl is included when overloadFilter
            // carries declSignature; falls back to arity-only filtering otherwise. Pre-fe254d6f
            // aggregated all overloads — that was the bug Mark reported for stringtheory.inc:415.
            if (token.subType === TokenType.MethodImplementation && token.label) {
                if (!includeDeclaration) continue; // skip implementation headers when not wanted
                const dotIdx = token.label.indexOf('.');
                if (dotIdx > 0) {
                    const implClass = token.label.substring(0, dotIdx).toLowerCase();
                    const implMethod = token.label.substring(dotIdx + 1).toLowerCase();
                    const inFamily = classFamily ? classFamily.has(implClass) : implClass === classLower;
                    if (implMethod === memberLower && (!classLower || inFamily)) {
                        // Filter by overload (fe254d6f Phase A B-extension): when the
                        // cursor's decl signature is known, prefer type-aware
                        // signaturesMatch; fall back to arity range when only minArgs/
                        // maxArgs are populated (e.g. dot-access path's pre-fe254d6f
                        // arity-only filter for non-procedure callers).
                        if (overloadFilter && fileLines) {
                            const implLineText = fileLines[token.line] ?? '';
                            if (overloadFilter.declSignature) {
                                const candidateSig = implLineText.trim();
                                if (!candidateSig ||
                                    !this.overloadResolver.signaturesMatch(overloadFilter.declSignature, candidateSig)) {
                                    continue; // wrong overload (type-aware check)
                                }
                            } else {
                                const implParamCount = this.memberResolver.countParametersInDeclaration(implLineText);
                                if (implParamCount < overloadFilter.minArgs || implParamCount > overloadFilter.maxArgs) {
                                    continue; // wrong overload (arity-only check)
                                }
                            }
                        }
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
     * Build an OverloadFilter for the plain-symbol path when the symbol is a
     * procedure/method/global procedure declaration. Captures the cursor's
     * declaration signature so `findReferencesInFile` can use
     * `MethodOverloadResolver.signaturesMatch` (5f7478dc) for type-aware
     * decl-on-decl filtering — siblings of the same name with different
     * signatures are filtered out (fe254d6f).
     *
     * Returns undefined when the declaration line text doesn't match the
     * PROCEDURE shape (no overload distinction needed for non-procedure symbols).
     */
    private buildPlainSymbolOverloadFilter(symbolInfo: SymbolInfo, document?: TextDocument): OverloadFilter | undefined {
        // Read the declaration line from the in-memory TextDocument when possible
        // (declaration is in the same file as the cursor); fall back to disk read.
        let declLineText: string | null = null;
        if (document && document.uri === symbolInfo.location.uri) {
            const docLines = document.getText().split(/\r?\n/);
            declLineText = docLines[symbolInfo.location.line] ?? null;
        }
        if (!declLineText) {
            const declFile = decodeURIComponent(symbolInfo.location.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            declLineText = ClassMemberResolver.getDeclarationLineText(declFile, symbolInfo.location.line);
        }
        if (!declLineText || !/\bPROCEDURE\b/i.test(declLineText)) return undefined;

        const maxArgs = this.memberResolver.countParametersInDeclaration(declLineText);
        const defaultCount = ClarionPatterns.countDefaultParams(declLineText);
        const minArgs = maxArgs - defaultCount;
        const filter: OverloadFilter = {
            minArgs,
            maxArgs,
            declarationLine: symbolInfo.location.line,
            declarationFileNorm: symbolInfo.location.uri.toLowerCase(),
            declSignature: declLineText.trim()
        };
        logger.error(`🎯 [FAR] Plain-symbol OverloadFilter: args ${minArgs}–${maxArgs}, sig="${filter.declSignature}"`);
        return filter;
    }

    /**
     * Determine the set of file URIs to scan based on the symbol's scope.
     */
    private getFilesToSearch(symbolInfo: SymbolInfo, currentDocument: TextDocument): string[] {
        const scopeType = symbolInfo.scope.type;

        if (scopeType === 'local' || scopeType === 'parameter' || scopeType === 'routine') {
            logger.error(`[FAR] Scope="${scopeType}" → searching only current file`);
            return [currentDocument.uri];
        }

        if (scopeType === 'module') {
            // Module-level MAP procedures (type='PROCEDURE') are only available within the current
            // MEMBER module — do not expand to project-wide search.
            if (symbolInfo.type === 'PROCEDURE') {
                // Use FRG to also include MODULE implementation files from the declaring file.
                // For a MAP-declared procedure, its implementation lives in a MODULE target file.
                const declaringFilePath = decodeURIComponent(symbolInfo.location.uri.replace(/^file:\/\/\//i, ''))
                    .replace(/\\/g, '/').toLowerCase();
                const graph = FileRelationshipGraph.getInstance();
                const implFiles: string[] = [symbolInfo.location.uri];

                if (graph.isBuilt) {
                    const moduleEdges = graph.getForwardEdges(declaringFilePath)
                        .filter(e => e.type === 'MODULE');
                    for (const edge of moduleEdges) {
                        const implUri = `file:///${edge.toFile}`;
                        if (!implFiles.includes(implUri)) {
                            implFiles.push(implUri);
                        }
                    }
                }

                logger.error(`[FAR] Scope="module" (MAP procedure) → searching ${implFiles.length} file(s): declaring + MODULE targets`);
                return implFiles;
            }
            const isMember = this.isMemberFile(symbolInfo.location.uri);
            const isProcDecl = this.isProcedureDeclaration(symbolInfo.location.uri, symbolInfo.location.line);
            logger.error(`[FAR] Scope="module": isMemberFile=${isMember}, isProcedureDeclaration=${isProcDecl}`);
            if (!isMember && isProcDecl) {
                // Non-MEMBER file procedure declaration at module level (PROGRAM file MAP entry) —
                // fall through to global search so all call sites are found.
            } else {
                // MEMBER-file module symbols are visible only within that MEMBER module.
                // PROGRAM-file module-level data (non-procedure) also stays local.
                logger.error(`[FAR] Scope="module" → searching only declaring file: ${path.basename(decodeURIComponent(symbolInfo.location.uri))}`);
                return [symbolInfo.location.uri];
            }
        }

        // Global (or MEMBER-file procedure): all project source files when a solution is loaded
        const solutionManager = SolutionManager.getInstance();
        const alwaysInclude = new Set<string>([
            currentDocument.uri,
            symbolInfo.location.uri  // always search the declaration file
        ]);
        // Track basenames already covered by alwaysInclude to avoid searching
        // redirection-resolved duplicates (e.g. C:\Clarion\...\ZipClassTesting.clw
        // when F:\Playground\ZipTest\ZipClassTesting.clw is already included)
        const alwaysIncludeNames = new Set<string>(
            [...alwaysInclude].map(u => path.basename(decodeURIComponent(u)).toLowerCase())
        );

        if (solutionManager?.solution?.projects?.length) {
            const allFiles: string[] = [...alwaysInclude];

            // Scope search to the project that declares the symbol.
            // Global symbols are visible only within their own program unit (project) —
            // searching all 40 projects for a symbol declared in project X is wrong.
            const declPath = decodeURIComponent(symbolInfo.location.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            const declProject = solutionManager.findProjectForFile(path.basename(declPath));

            if (declProject) {
                for (const sourceFile of declProject.sourceFiles) {
                    const fullPath = path.isAbsolute(sourceFile.relativePath) ? sourceFile.relativePath : path.join(declProject.path, sourceFile.relativePath);
                    const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    const basename = path.basename(fullPath).toLowerCase();
                    if (!alwaysInclude.has(uri) && !alwaysIncludeNames.has(basename)) {
                        allFiles.push(uri);
                    }
                }
                logger.error(`[FAR] Scope="${scopeType}" → project "${declProject.name}", ${allFiles.length} file(s) to search`);
                return allFiles;
            }

            // Fallback: declaration not in any known project source list (e.g. INCLUDE-only symbol).
            // Search all project files so cross-project INCLUDE references are found.
            for (const project of solutionManager.solution.projects) {
                for (const sourceFile of project.sourceFiles) {
                    const fullPath = path.isAbsolute(sourceFile.relativePath) ? sourceFile.relativePath : path.join(project.path, sourceFile.relativePath);
                    const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    const basename = path.basename(fullPath).toLowerCase();
                    if (!alwaysInclude.has(uri) && !alwaysIncludeNames.has(basename)) {
                        allFiles.push(uri);
                    }
                }
            }
            logger.error(`[FAR] Scope="${scopeType}" → global (no declaring project found), solution has ${solutionManager.solution.projects.length} project(s), ${allFiles.length} file(s) to search`);
            return allFiles;
        }

        logger.error(`[FAR] Scope="${scopeType}" → global but NO solution loaded, searching ${[...alwaysInclude].length} file(s)`);

        return [...alwaysInclude];
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
                TokenHelper.isProcedureOrFunction(t) &&
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
        includeDeclaration: boolean,
        fieldPrefixes?: Set<string>,
        ignoreLineScope?: boolean,
        overloadFilter?: OverloadFilter,
        currentDocument?: TextDocument
    ): Location[] {
        const locations: Location[] = [];
        const searchWordLower = searchWord.toLowerCase();

        try {
            const tokens = this.getTokensForUri(fileUri);
            if (!tokens || tokens.length === 0) return locations;

            // For overload distinction (fe254d6f): pre-build the set of lines
            // that are procedure declarations / implementations + lazily-loaded
            // file-line text for signature lookup. Used to classify each match
            // as "decl/impl line" (filter via signaturesMatch) vs "call site"
            // (no per-match filter — call-site type-aware filtering is P2b).
            const procedureSubTypesForFilter = new Set<TokenType>([
                TokenType.GlobalProcedure,
                TokenType.MapProcedure,
                TokenType.MethodDeclaration,
                TokenType.MethodImplementation
            ]);
            const procedureDeclLines: Set<number> = new Set();
            if (overloadFilter) {
                for (const t of tokens) {
                    if (TokenHelper.isProcedureOrFunction(t) &&
                        t.subType !== undefined &&
                        procedureSubTypesForFilter.has(t.subType)) {
                        procedureDeclLines.add(t.line);
                    }
                }
            }
            // Lazily-loaded line text array for signaturesMatch lookups.
            // Tries in-memory document first when fileUri matches the current
            // document; falls back to disk read.
            let candidateFileLines: string[] | null = null;
            const getCandidateFileLines = (): string[] | null => {
                if (candidateFileLines !== null) return candidateFileLines;
                if (currentDocument && currentDocument.uri === fileUri) {
                    candidateFileLines = currentDocument.getText().split(/\r?\n/);
                    return candidateFileLines;
                }
                try {
                    const filePath = decodeURIComponent(fileUri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
                    candidateFileLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
                } catch {
                    candidateFileLines = null;
                }
                return candidateFileLines;
            };

            const scopeType = symbolInfo.scope.type;
            let startLine = 0;
            let endLine = Number.MAX_SAFE_INTEGER;

            if (!ignoreLineScope && (scopeType === 'local' || scopeType === 'parameter' || scopeType === 'routine')) {
                // Local MAP procedures (type='PROCEDURE') are callable from method implementations
                // of locally-defined classes, which live outside the parent procedure's line range.
                // Skip the line-range restriction so those call sites are found.
                const isLocalProcDecl = scopeType === 'local' && symbolInfo.type === 'PROCEDURE';
                if (!isLocalProcDecl) {
                    const scopeToken = symbolInfo.scope.token;
                    startLine = scopeToken.line;
                    endLine = scopeToken.finishesAt ?? Number.MAX_SAFE_INTEGER;
                }
            }

            // Build valid line ranges: base scope range + any locally-declared class method impl ranges.
            // Locally-declared classes (e.g. ThisWindow CLASS(WindowManager) declared inside a procedure)
            // have their method implementations outside the parent procedure's finishesAt, so we extend
            // the search to include those implementation bodies.
            let validLineRanges: Array<[number, number]> = [[startLine, endLine]];

            if (startLine > 0 || endLine < Number.MAX_SAFE_INTEGER) {
                const scopeToken = symbolInfo.scope.token;
                if (TokenHelper.isProcedureOrFunction(scopeToken)) {
                    // Collect locally-declared CLASS names from the data section of the parent procedure.
                    // Data section is between the procedure line and the CODE execution marker.
                    const dataEndLine = scopeToken.executionMarker?.line ?? endLine;
                    const localClassNames = new Set<string>();
                    for (const t of tokens) {
                        if (t.type === TokenType.Structure &&
                            t.subType === TokenType.Class &&
                            t.line > startLine && t.line < dataEndLine &&
                            t.label) {
                            localClassNames.add(t.label.toLowerCase());
                        }
                    }

                    if (localClassNames.size > 0) {
                        for (const t of tokens) {
                            if (TokenHelper.isProcedureOrFunction(t) &&
                                t.subType === TokenType.MethodImplementation &&
                                t.label &&
                                t.line > endLine) {
                                // Method impl labels are 2-part (ClassName.MethodName) for locally-declared
                                // class methods. Extract the class name from the first segment.
                                const dotIdx = t.label.indexOf('.');
                                const implClassName = dotIdx > 0
                                    ? t.label.substring(0, dotIdx).toLowerCase()
                                    : '';
                                if (implClassName && localClassNames.has(implClassName)) {
                                    // Guard against cross-contamination: if another GlobalProcedure starts
                                    // between our scope end and this impl, the impl belongs to that later
                                    // procedure, not to our scope procedure.
                                    const hasInterveningProc = tokens.some(tp =>
                                        TokenHelper.isProcedureOrFunction(tp) &&
                                        tp.subType === TokenType.GlobalProcedure &&
                                        tp.line > endLine && tp.line < t.line
                                    );
                                    if (!hasInterveningProc) {
                                        validLineRanges.push([t.line, t.finishesAt ?? Number.MAX_SAFE_INTEGER]);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            const declarationLine = symbolInfo.location.line;
            const declarationUri = symbolInfo.location.uri;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (!validLineRanges.some(([s, e]) => token.line >= s && token.line <= e)) continue;
                if (token.type === TokenType.Comment || token.type === TokenType.String) continue;

                let matchStart = token.start;
                let matchLength = token.value.length;

                if (token.value.toLowerCase() === searchWordLower) {
                    // Exact match — for field scope, skip other structure field declarations
                    // (col-0 Label with a parent Structure) that are not the declaration line itself
                    if (scopeType === 'field' &&
                        token.start === 0 &&
                        token.parent !== undefined &&
                        !(fileUri === declarationUri && token.line === declarationLine)) {
                        continue;
                    }
                } else if (token.type === TokenType.ReferenceVariable &&
                           token.value.toLowerCase() === '&' + searchWordLower) {
                    // &TypeName reference-variable declaration: e.g. "Behavior &StandardBehavior,PRIVATE"
                    matchStart = token.start + 1; // skip the leading '&'
                    matchLength = searchWord.length;
                } else if (scopeType === 'field' && (token.type === TokenType.StructureField || token.type === TokenType.Class)) {
                    // Field reference via dot-notation: "QZipF.version" when searching for "version"
                    const dotIndex = token.value.lastIndexOf('.');
                    if (dotIndex >= 0 && token.value.substring(dotIndex + 1).toLowerCase() === searchWordLower) {
                        matchStart = token.start + dotIndex + 1;
                        matchLength = searchWord.length;
                    } else {
                        continue;
                    }
                } else if (scopeType === 'field' && fieldPrefixes && fieldPrefixes.size > 0) {
                    // PRE:field notation — e.g. "QDir:version" where QDir is PRE() of the queue
                    const colonIndex = token.value.lastIndexOf(':');
                    if (colonIndex > 0) {
                        const prefix = token.value.substring(0, colonIndex);
                        const field = token.value.substring(colonIndex + 1);
                        if (field.toLowerCase() === searchWordLower && fieldPrefixes.has(prefix.toLowerCase())) {
                            matchStart = token.start + colonIndex + 1;
                            matchLength = searchWord.length;
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }
                } else if (token.type === TokenType.StructureField || token.type === TokenType.Class) {
                    // Object prefix of a StructureField: "st.SetValue" when searching for "st"
                    const dotIndex = token.value.indexOf('.');
                    if (dotIndex > 0 && token.value.substring(0, dotIndex).toLowerCase() === searchWordLower) {
                        matchLength = dotIndex;
                    } else {
                        continue;
                    }
                } else if (token.label?.toLowerCase() === searchWordLower &&
                           token.value.toLowerCase() !== searchWordLower &&
                           !TokenHelper.isProcedureOrFunction(token) &&
                           token.type !== TokenType.Structure) {
                    // MAP shorthand / structure label: the Structure/Procedure token itself carries
                    // label="ZipQueueType" but the Label token on the same line already matches.
                    matchLength = token.label!.length;
                } else {
                    continue;
                }

                if (!includeDeclaration && fileUri === declarationUri && token.line === declarationLine) continue;

                // OverloadFilter: skip wrong-overload decl/impl matches via type-aware
                // signaturesMatch (fe254d6f). Bare references with no parens AND
                // call-site matches pass through (call-site type-aware filtering is
                // P2b out-of-scope; arity-only filtering on call sites kept as best-effort).
                if (overloadFilter && overloadFilter.declSignature && procedureDeclLines.has(token.line)) {
                    const lines = getCandidateFileLines();
                    const candidateSig = lines?.[token.line]?.trim();
                    if (!candidateSig || !this.overloadResolver.signaturesMatch(overloadFilter.declSignature, candidateSig)) {
                        continue;
                    }
                }

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
     * Collect all PRE prefixes that reference fields of the same structure as the given field.
     *
     * Strategy:
     * 1. The field token itself may carry structurePrefix (from DocumentStructure).
     * 2. Also find variables in the current file (and searched files) declared as the
     *    same queue/group type (parent structure label) and collect their prefixes.
     *
     * Returns a Set of lowercase prefix strings (e.g. {"qdir", "qzipf"}).
     */
    private collectFieldPrefixes(symbolInfo: SymbolInfo, document: TextDocument): Set<string> {
        const prefixes = new Set<string>();

        // 1. Direct prefix from the field token (set by DocumentStructure/StructureProcessor)
        const directPrefix = symbolInfo.token.structurePrefix;
        if (directPrefix) {
            prefixes.add(directPrefix.toLowerCase());
        }

        // 2. The parent structure token's prefix
        const parentStructureToken = symbolInfo.scope.token; // set to fieldToken.parent! in findStructureField
        if (parentStructureToken?.structurePrefix) {
            prefixes.add(parentStructureToken.structurePrefix.toLowerCase());
        }

        // 3. Find any variables declared as the same structure type (e.g. QZipF QUEUE(ZipQueueType))
        //    and collect their prefixes too. Search declaration file tokens.
        try {
            const declTokens = this.getTokensForUri(symbolInfo.location.uri);
            const parentLabel = parentStructureToken?.label?.toLowerCase();

            for (const t of declTokens) {
                if (t.type === TokenType.Structure && t.structurePrefix && t.label && parentLabel) {
                    // Match variables whose type references the parent structure label
                    if (t.label.toLowerCase() === parentLabel || t.structurePrefix.toLowerCase() === parentLabel) {
                        prefixes.add(t.structurePrefix.toLowerCase());
                    }
                }
            }
        } catch {
            // ignore
        }

        return prefixes;
    }

    /**
     * Find a col-0 Label token matching wordLower — used for type/structure definitions
     * like QUEUE, GROUP, CLASS, FILE that aren't procedures.
     * Skips tokens that are children of a Structure (those are fields, not standalone labels).
     */
    private findLabelDeclarationLine(wordLower: string, tokens: Token[]): number | null {
        for (const t of tokens) {
            if (t.start === 0 &&
                t.parent === undefined &&   // exclude structure fields
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value.toLowerCase() === wordLower) {
                return t.line;
            }
        }
        return null;
    }

    /**
     * Walk all INCLUDE files reachable from the given source file and find a
     * col-0 Label declaration matching wordLower.
     */
    private async findLabelInIncludes(
        wordLower: string,
        fromPath: string,
        visited: Set<string> = new Set()
    ): Promise<{ uri: string; line: number } | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf-8'); } catch { return null; }

        const fromDir = fromPath.substring(0, fromPath.lastIndexOf('\\'));
        const includePattern = /INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*ONCE)?\s*\)/gi;
        let match: RegExpExecArray | null;
        while ((match = includePattern.exec(content)) !== null) {
            const incFileName = match[1];
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
            const line = this.findLabelDeclarationLine(wordLower, incTokens);
            if (line !== null) return { uri: incUri, line };
            const nested = await this.findLabelInIncludes(wordLower, incPath, visited);
            if (nested) return nested;
        }
        return null;
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
            if (TokenHelper.isProcedureOrFunction(t) && t.subType !== undefined && procedureSubTypes.has(t.subType)) {
                procedureLines.add(t.line);
            }
        }

        // Find a Label/Variable on a procedure line with value matching wordLower
        // (handles explicit syntax: "WindowsZipTest  PROCEDURE()")
        for (const t of tokens) {
            if (!procedureLines.has(t.line)) continue;
            if ((t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value.toLowerCase() === wordLower) {
                return t.line;
            }
        }

        // Also handle MAP shorthand syntax where the token itself carries the subType:
        //   Pattern 1 (single token): value="WindowsZipTest()", label="WindowsZipTest", subType=MapProcedure
        //   Pattern 2 (separate tokens): value="WindowsZipTest", label="WindowsZipTest", subType=MapProcedure
        // (same logic DocumentStructure uses in findProceduresInMap)
        for (const t of tokens) {
            if (t.subType !== undefined && procedureSubTypes.has(t.subType) &&
                t.label?.toLowerCase() === wordLower) {
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
    private async findClassTypeReferences(
        word: string,
        document: TextDocument,
        includeDeclaration: boolean
    ): Promise<Location[] | null> {
        // Check if the word is a known CLASS type via the class definition indexer
        const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
        const projectPath = SolutionManager.getInstance()?.getProjectPathForFile(fromPath) ?? path.dirname(fromPath);
        try {
            const sdi = StructureDeclarationIndexer.getInstance();
            await sdi.getOrBuildIndex(projectPath);
            const definitions = sdi.find(word, projectPath);
            if (definitions.length === 0) return null;
        } catch {
            return null;
        }

        // It IS a class type — do a global search using the procedure-reference machinery
        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);
        return this.findProcedureReferences(word, document, tokens, includeDeclaration);
    }

    private async findProcedureReferences(
        word: string,
        document: TextDocument,
        currentTokens: Token[],
        includeDeclaration: boolean
    ): Promise<Location[] | null> {
        // If the current file is a local-MAP implementation target, restrict search
        // to only files reachable via that same procedure-local MAP scope.
        const localScope = getLocalMapScope(document.uri);
        if (localScope?.containingProcedure) {
            return this.findLocalMapProcedureReferences(word, document, includeDeclaration, localScope);
        }

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
                        const fullPath = path.isAbsolute(sourceFile.relativePath) ? sourceFile.relativePath : path.join(project.path, sourceFile.relativePath);
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
            // 4. Last resort: find any col-0 Label declaration across project + INCLUDE files
            //    This handles type names (ZipQueueType, MyClass, etc.) that are structure
            //    definitions rather than procedures.
            const labelLine = this.findLabelDeclarationLine(wordLower, currentTokens);
            if (labelLine !== null) {
                declarationUri = document.uri;
                declarationLine = labelLine;
            } else {
                // Search project files
                const solutionManager = SolutionManager.getInstance();
                if (solutionManager?.solution?.projects?.length) {
                    outerLoop2: for (const project of solutionManager.solution.projects) {
                        for (const sourceFile of project.sourceFiles) {
                            const fullPath = path.isAbsolute(sourceFile.relativePath) ? sourceFile.relativePath : path.join(project.path, sourceFile.relativePath);
                            const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                            const fileTokens = this.getTokensForUri(uri);
                            const ll = this.findLabelDeclarationLine(wordLower, fileTokens);
                            if (ll !== null) { declarationUri = uri; declarationLine = ll; break outerLoop2; }
                        }
                    }
                }
                // Also walk INCLUDE files
                if (!declarationUri) {
                    const incDecl2 = await this.findLabelInIncludes(wordLower, currentPath);
                    if (incDecl2) { declarationUri = incDecl2.uri; declarationLine = incDecl2.line; }
                }
            }
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

        // Build OverloadFilter from the resolved declaration so siblings of the same
        // name with different signatures are filtered via signaturesMatch (fe254d6f).
        const overloadFilter = this.buildPlainSymbolOverloadFilter(syntheticInfo, document);

        const locations: Location[] = [];
        for (const fileUri of filesToSearch) {
            locations.push(...this.findReferencesInFile(fileUri, word, syntheticInfo, includeDeclaration, undefined, undefined, overloadFilter, document));
        }

        logger.info(`✅ Found ${locations.length} reference(s) to procedure "${word}"`);
        return locations.length > 0 ? locations : null;
    }

    /**
     * References search restricted to files reachable from a procedure-local MAP.
     * Called when the current implementation file is the target of a MODULE declared
     * inside a procedure body — only files sharing that same local-MAP scope are searched.
     */
    private findLocalMapProcedureReferences(
        word: string,
        document: TextDocument,
        includeDeclaration: boolean,
        localScope: LocalMapScope
    ): Location[] | null {
        const graph = FileRelationshipGraph.getInstance();
        const declaringUri = `file:///${localScope.declaringFile}`;
        const filesToSearch = new Set<string>([declaringUri, document.uri]);

        if (graph.isBuilt) {
            graph.getForwardEdges(localScope.declaringFile)
                .filter(e => e.type === 'MODULE' &&
                    e.containingProcedure?.toUpperCase() === localScope.containingProcedure!.toUpperCase())
                .forEach(e => filesToSearch.add(`file:///${e.toFile}`));
        }

        const dummyToken: Token = {
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
            token: dummyToken,
            type: 'PROCEDURE',
            scope: { token: dummyToken, type: 'global' },
            location: { uri: declaringUri, line: 0, character: 0 },
            originalWord: word,
            searchWord: word
        };

        const locations: Location[] = [];
        for (const fileUri of filesToSearch) {
            locations.push(...this.findReferencesInFile(fileUri, word, syntheticInfo, includeDeclaration));
        }

        logger.info(`✅ [LocalMAP] Found ${locations.length} reference(s) to "${word}" (local to ${localScope.containingProcedure}), searched ${filesToSearch.size} file(s)`);
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

    /**
     * Returns the names of all variables declared as &IfaceName in the given token list.
     * Used by provideInterfaceMethodReferences to find call sites like conn.MethodName().
     */
    private collectInterfaceVarNames(tokens: Token[], ifaceName: string): string[] {
        const ifaceLower = ifaceName.toLowerCase();
        const varNames: string[] = [];
        for (let i = 0; i < tokens.length - 1; i++) {
            const t = tokens[i];
            const next = tokens[i + 1];
            if (t.type === TokenType.Label && next.type === TokenType.ReferenceVariable) {
                const refType = next.value.replace(/^&\s*/, '').toLowerCase();
                if (refType === ifaceLower) {
                    varNames.push(t.value);
                }
            }
        }
        return varNames;
    }
}

