import { SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
import * as path from 'path';
import * as fs from 'fs';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from './ClarionDocumentSymbolProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("WorkspaceSymbolProvider");
logger.setLevel("error");

/**
 * Provides Workspace Symbol Search (Ctrl+T) — returns SymbolInformation[] for
 * all procedure/class/structure symbols across all cached and project source files.
 *
 * Resolution order:
 *   1. All URIs currently in TokenCache (open/recently-seen files)
 *   2. All project source files from SolutionManager (for closed files)
 */
export class WorkspaceSymbolProvider {
    private tokenCache: TokenCache;
    private symbolProvider: ClarionDocumentSymbolProvider;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        this.symbolProvider = new ClarionDocumentSymbolProvider();
    }

    public async provideWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
        const results: SymbolInformation[] = [];
        const queryLower = query.toLowerCase();
        const seenUris = new Set<string>();

        // 1. Search all cached documents (open files, recently tokenized)
        for (const uri of this.tokenCache.getAllCachedUris()) {
            seenUris.add(uri);
            const tokens = this.tokenCache.getTokensByUri(uri);
            if (!tokens) continue;
            this.collectSymbols(tokens, uri, queryLower, results);
        }

        // 2. Search project source files not already in cache
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution) {
            for (const project of solutionManager.solution.projects) {
                for (const sourceFile of project.sourceFiles) {
                    const fullPath = path.join(project.path, sourceFile.relativePath);
                    const uri = 'file:///' + fullPath.replace(/\\/g, '/');
                    if (seenUris.has(uri)) continue;
                    seenUris.add(uri);

                    try {
                        if (!fs.existsSync(fullPath)) continue;
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const doc = TextDocument.create(uri, 'clarion', 1, content);
                        const tokens = this.tokenCache.getTokens(doc);
                        this.collectSymbols(tokens, uri, queryLower, results);
                    } catch {
                        // Skip unreadable files
                    }
                }
            }
        }

        return results;
    }

    private collectSymbols(
        tokens: any[],
        uri: string,
        queryLower: string,
        results: SymbolInformation[]
    ): void {
        const docSymbols = this.symbolProvider.provideDocumentSymbols(tokens, uri);
        this.flattenSymbols(docSymbols, uri, queryLower, results);
    }

    private flattenSymbols(
        symbols: ClarionDocumentSymbol[],
        uri: string,
        queryLower: string,
        results: SymbolInformation[],
        containerName?: string
    ): void {
        for (const sym of symbols) {
            if (!queryLower || sym.name.toLowerCase().includes(queryLower)) {
                results.push(
                    SymbolInformation.create(sym.name, sym.kind, sym.range, uri, containerName)
                );
            }
            if (sym.children && sym.children.length > 0) {
                this.flattenSymbols(
                    sym.children as ClarionDocumentSymbol[],
                    uri,
                    queryLower,
                    results,
                    sym.name
                );
            }
        }
    }
}
