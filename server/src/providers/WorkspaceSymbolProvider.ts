import { SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
import * as path from 'path';
import * as fs from 'fs';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from './ClarionDocumentSymbolProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { CancellationToken } from 'vscode-languageserver';
import { cooperativeCheckpoint } from '../utils/cooperativeScan';
import { pathToCanonicalUri } from '../utils/UriUtils';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("WorkspaceSymbolProvider");
logger.setLevel("error");

/** Outline grouping nodes, and the parts of a VIEW: nothing Ctrl+T should list. */
const GROUPING_NODE = /^(?:MAP$|MODULE\b|PROJECT\b|JOIN\b)/i;

/** Kinds whose display text starts with the label: `Label ( LONG p )`, `Label (Routine)`, `Label KEY(...)`. */
const LABEL_FIRST_KINDS: SymbolKind[] = [SymbolKind.Function, SymbolKind.Method, SymbolKind.Key];

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

    public async provideWorkspaceSymbols(query: string, token?: CancellationToken): Promise<SymbolInformation[]> {
        const results: SymbolInformation[] = [];
        const queryLower = query.toLowerCase();
        const seenUris = new Set<string>();
        // #187 — Ctrl+T scans every (uncached) solution file with a full tokenize.
        // Yield the event loop periodically and bail on cancellation (a superseded
        // query) so it doesn't block hover/F12 or run to completion needlessly.
        let scanned = 0;

        // 1. Search all cached documents (open files, recently tokenized)
        for (const uri of this.tokenCache.getAllCachedUris()) {
            if (await cooperativeCheckpoint(scanned++, token)) return results;
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
                    if (await cooperativeCheckpoint(scanned++, token)) return results;
                    const fullPath = path.join(project.path, sourceFile.relativePath);
                    const uri = pathToCanonicalUri(fullPath); // #251: client-facing Locations + cache key matching VS Code's form
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
        parentLabel?: string
    ): void {
        for (const sym of symbols) {
            const label = this.labelOf(sym);
            if (label !== undefined && (!queryLower || label.toLowerCase().includes(queryLower))) {
                results.push(
                    SymbolInformation.create(label, sym.kind, sym.range, uri, parentLabel ?? this.declarationText(sym, label))
                );
            }
            if (sym.children && sym.children.length > 0) {
                this.flattenSymbols(
                    sym.children as ClarionDocumentSymbol[],
                    uri,
                    queryLower,
                    results,
                    label ?? parentLabel
                );
            }
        }
    }

    /**
     * #859 — the label a symbol is searched and listed by. A symbol's own name is the
     * Outline's display text (`GROUP (Label),PRE(X)`, `Label LONG`, `Label ( LONG p )`).
     * A window control has no label, so it keeps its text. Returns undefined for a
     * grouping node, which is not listed.
     */
    private labelOf(sym: ClarionDocumentSymbol): string | undefined {
        if (sym._clarionVarName) return sym._clarionVarName;
        if (/^(?:Functions|Methods)$/.test(sym.name)) return undefined;
        if (LABEL_FIRST_KINDS.includes(sym.kind)) return /^[^\s(]+/.exec(sym.name)?.[0];
        return GROUPING_NODE.test(sym.name) ? undefined : sym.name;
    }

    /** The display text without the label: `GROUP,PRE(X)`, `LONG`, `( LONG p )`. */
    private declarationText(sym: ClarionDocumentSymbol, label: string): string | undefined {
        const bracketed = ` (${label})`;
        const text = sym.name.includes(bracketed)
            ? sym.name.replace(bracketed, '')
            : sym.name.slice(label.length).trim();
        return text || undefined;
    }
}
