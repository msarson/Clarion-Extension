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

        // When cursor lands on a middle segment of a chained expression
        // (e.g. "Order" in SELF.Order.MainKey), getWordRangeAtPosition returns just
        // the segment because the dot-after check prevents prefix inclusion.
        // Detect this by checking whether the character immediately before the word
        // is a dot, then walk back to find the SELF/PARENT anchor.
        if (!word.includes('.') && wordRange.start.character > 0) {
            const charBefore = document.getText({
                start: { line: position.line, character: wordRange.start.character - 1 },
                end: { line: position.line, character: wordRange.start.character }
            });
            if (charBefore === '.') {
                const textBeforeDot = document.getText({
                    start: { line: position.line, character: 0 },
                    end: { line: position.line, character: wordRange.start.character - 1 }
                });
                // Match the nearest SELF/PARENT anchor and any intermediate segments
                const anchorMatch = textBeforeDot.match(/\b(SELF|PARENT)(?:\.[A-Za-z0-9_:]+)*$/i);
                if (anchorMatch) {
                    word = anchorMatch[0] + '.' + word;
                    logger.info(`🔗 Reconstructed chained word: "${word}" from middle-segment cursor`);
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
            logger.info(`🏛️ "${word}" is inside CLASS body (module=${classModuleFile ?? 'none'}) — routing to member-access path`);
            return this.provideMemberReferences(`SELF.${word}`, document, position, context, classModuleFile);
        }

        // Plain symbol path
        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position);
        if (!symbolInfo) {
            logger.info(`❌ No symbol found for "${word}"`);
            return null;
        }

        logger.info(`✅ Symbol "${word}" found — scope: ${symbolInfo.scope.type}, declared at ${symbolInfo.location.uri}:${symbolInfo.location.line}`);

        const searchWord = symbolInfo.token.value;
        const filesToSearch = this.getFilesToSearch(symbolInfo, document);
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
        classModuleFile?: string
    ): Promise<Location[] | null> {
        const lastDot = word.lastIndexOf('.');
        const beforeDot = word.substring(0, lastDot);
        const memberName = word.substring(lastDot + 1);

        if (!memberName) return null;

        let declarationFile: string | null = null;
        let declarationLine: number = -1;

        // --- Resolve the declaring class ---------------------------------
        const isSelfOrParent = /^(self|parent)$/i.test(beforeDot);

        if (isSelfOrParent) {
            // Single-level SELF.Member / PARENT.Member
            // Use getTokens(document) — not getTokensByUri — so we always get real tokens
            // even when the file has not yet been cached by an open-document event.
            const tokens = this.tokenCache.getTokens(document);
            const info = this.memberResolver.findClassMemberInfo(memberName, document, position.line, tokens);
            if (info) {
                declarationFile = info.file;
                declarationLine = info.line;
                logger.info(`✅ SELF.${memberName} → class="${info.className}" at ${info.file}:${info.line}`);
            } else {
                // Resolution failed (complex class hierarchy / scope issue) but we can still
                // do a best-effort search for any "*.memberName" patterns in the current file.
                logger.info(`⚠️ SELF.${memberName}: class resolution failed, doing best-effort search`);
            }
        } else {
            // Multi-level chain (SELF.A.B) or Tier 2 local variable (mgr.Member)
            const chainedResolver = new ChainedPropertyResolver();
            const vsPos: Position = { line: position.line, character: position.character };
            let info: ChainedMemberInfo | null = await chainedResolver.resolve(beforeDot, memberName, document, vsPos);

            if (!info) {
                // Tier 2: try resolving beforeDot as a typed local/module/global variable
                info = await this.resolveViaVariableType(beforeDot, memberName, document, position);
            }

            if (!info) {
                logger.info(`❌ Member "${memberName}" could not be resolved for beforeDot="${beforeDot}"`);
                return null;
            }
            declarationFile = info.file;
            declarationLine = info.line;
            logger.info(`✅ ${beforeDot}.${memberName} → class="${info.className}" at ${info.file}:${info.line}`);
        }

        // --- Determine files to search -----------------------------------
        const filesToSearch = this.getMemberSearchFiles(document, declarationFile, classModuleFile);

        // --- Scan files for member usages --------------------------------
        const locations: Location[] = [];
        for (const fileUri of filesToSearch) {
            const hits = this.findMemberReferencesInFile(fileUri, memberName);
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
        return locations.length > 0 ? locations : null;
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

        // If the CLASS has a MODULE('xyz.clw') attribute, resolve and add that file
        if (classModuleFile) {
            const resolved = this.resolveModuleFile(classModuleFile, document.uri);
            if (resolved) files.add(resolved);
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

        return Array.from(files);
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
     * Find every occurrence of `memberName` used in dot-notation in a single file.
     * Covers three token patterns:
     *   1. StructureField  "SELF.Order"       — last segment is the member
     *   2. StructureField  "Order.Something"  — first segment after a preceding dot
     *   3. Variable        "Order"            — terminal access preceded by a Delimiter '.'
     *   4. Label (col 0)   "Order"            — the member declaration line in the class body
     */
    private findMemberReferencesInFile(fileUri: string, memberName: string): Location[] {
        const tokens = this.getTokensForUri(fileUri);
        if (!tokens || tokens.length === 0) return [];

        const memberLower = memberName.toLowerCase();
        const locations: Location[] = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === TokenType.Comment || token.type === TokenType.String) continue;

            if (token.type === TokenType.StructureField) {
                const lastDot = token.value.lastIndexOf('.');
                const lastSeg = token.value.substring(lastDot + 1).toLowerCase();

                if (lastSeg === memberLower) {
                    // e.g. "SELF.Order" — highlight the "Order" part
                    locations.push(Location.create(fileUri,
                        Range.create(token.line, token.start + lastDot + 1,
                                     token.line, token.start + token.value.length)));
                } else {
                    const firstDot = token.value.indexOf('.');
                    const firstSeg = token.value.substring(0, firstDot).toLowerCase();
                    if (firstSeg === memberLower) {
                        // e.g. "Order.MainKey" appearing as the second-level token in a chain
                        locations.push(Location.create(fileUri,
                            Range.create(token.line, token.start,
                                         token.line, token.start + firstDot)));
                    }
                }
                continue;
            }

            if (token.type === TokenType.Variable && token.value.toLowerCase() === memberLower) {
                // Terminal access: SELF.Primary.Order where "Order" is a plain Variable after '.'
                const prev = tokens[i - 1];
                if (prev && prev.type === TokenType.Delimiter && prev.value === '.' && prev.line === token.line) {
                    locations.push(Location.create(fileUri,
                        Range.create(token.line, token.start, token.line, token.start + token.value.length)));
                }
                continue;
            }

            // Member declaration in class body (Label at column 0)
            if (token.type === TokenType.Label && token.start === 0 &&
                token.value.toLowerCase() === memberLower) {
                locations.push(Location.create(fileUri,
                    Range.create(token.line, token.start, token.line, token.start + token.value.length)));
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
            return [symbolInfo.location.uri];
        }

        // Global: all project source files when a solution is loaded
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

