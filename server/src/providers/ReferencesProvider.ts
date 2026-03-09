import { Location, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService, SymbolInfo } from '../services/SymbolFinderService';
import { TokenHelper } from '../utils/TokenHelper';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ReferencesProvider");
logger.setLevel("error");

/**
 * Provides "Find All References" for Clarion symbols.
 *
 * Search scope is determined by the declaration's scope level:
 *   parameter / local / routine  → current file only, within procedure boundaries
 *   module                       → declaring file only
 *   global                       → all project source files (requires solution)
 */
export class ReferencesProvider {
    private tokenCache: TokenCache;
    private scopeAnalyzer: ScopeAnalyzer;
    private symbolFinder: SymbolFinderService;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
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

        const word = document.getText(wordRange);
        if (!word || word.length === 0) return null;

        logger.info(`🔍 Finding references for "${word}" at ${position.line}:${position.character}`);

        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position);
        if (!symbolInfo) {
            logger.info(`❌ No symbol found for "${word}"`);
            return null;
        }

        logger.info(`✅ Symbol "${word}" found — scope: ${symbolInfo.scope.type}, declared at ${symbolInfo.location.uri}:${symbolInfo.location.line}`);

        // The actual name to match across files (use the declaration token's value)
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

    /**
     * Determine the set of file URIs to scan based on the symbol's scope.
     */
    private getFilesToSearch(symbolInfo: SymbolInfo, currentDocument: TextDocument): string[] {
        const scopeType = symbolInfo.scope.type;

        // Narrow scopes: search only the current file (procedure boundaries applied later)
        if (scopeType === 'local' || scopeType === 'parameter' || scopeType === 'routine') {
            return [currentDocument.uri];
        }

        // Module-local: only the declaring file
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

        // Fallback: just the current file
        return [currentDocument.uri];
    }

    /**
     * Find all matching token locations in a single file.
     * Applies procedure-boundary constraints for narrow-scope symbols.
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

            // For narrow scopes, constrain to the containing procedure's line range
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

                // Ignore comments and string literals — not real references
                if (token.type === TokenType.Comment || token.type === TokenType.String) continue;

                let matchStart = token.start;
                let matchLength = token.value.length;

                if (token.value.toLowerCase() === searchWordLower) {
                    // Exact match (Variable, Label, etc.)
                } else if (
                    token.type === TokenType.StructureField ||
                    token.type === TokenType.Class
                ) {
                    // StructureField tokens combine object+field: "st.SetValue"
                    // Check if the prefix (before the dot) is the symbol we're looking for
                    const dotIndex = token.value.indexOf('.');
                    if (dotIndex > 0 && token.value.substring(0, dotIndex).toLowerCase() === searchWordLower) {
                        matchLength = dotIndex; // highlight only the object prefix
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }

                // Optionally exclude the declaration itself
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
        // Fast path: document is open and cached
        const cached = this.tokenCache.getTokensByUri(uri);
        if (cached) return cached;

        // Slow path: read from disk
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
