import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from './ClarionTokenizer';
import { DocumentStructure } from './DocumentStructure';
import LoggerManager from './logger';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("TokenCache");
logger.setLevel("error");

/**
 * Line-based token data for incremental updates
 */
interface LineTokenData {
    lineNumber: number;
    lineText: string;
    tokens: Token[];
}

/**
 * Cached token data structure with line-based granularity
 */
interface CachedTokenData {
    version: number;
    tokens: Token[];
    lineTokens: Map<number, LineTokenData>; // 🚀 PERFORMANCE: Line-based cache
    documentText: string; // Track full text for change detection
    structure?: DocumentStructure; // 🚀 PERFORMANCE: Cached structure
    /** #260 — the caller-visible URI (original spelling of the last writer).
     *  The map itself is keyed canonically; consumers that enumerate the cache
     *  (getAllCachedUris) get THIS, so Locations/documents.get() keep working. */
    uri: string;
}

/**
 * TokenCache provides a centralized caching mechanism for document tokens
 * with line-based incremental updates for optimal performance.
 */
export class TokenCache {
    private static instance: TokenCache;
    // #260 — BOTH maps are keyed by canonicalKey(uri) (decoded + lowercased),
    // so `file:///f%3A/…` and `file:///f:/…` — the same physical file reached
    // via VS Code (encoded) vs a disk-walk constructor (plain) — share one
    // entry instead of holding two divergent token sets (#196 disease,
    // cache-key side). The entry stores the last writer's original URI for
    // consumers that enumerate the cache.
    private cache = new Map<string, CachedTokenData>();
    // #188 — parsed tokens for CLOSED files (no live TextDocument), validated
    // by file mtime. Without this, every cross-file consumer (Find-All-
    // References, CodeLens counts) re-read + re-tokenized the same on-disk
    // file from scratch on every call — e.g. a single reference count
    // re-parsed StringTheory.clw ~4-5×. mtime validation guarantees we never
    // serve stale tokens after an external (on-disk) change.
    // #260 — bounded LRU (see closedFileCacheMax): previously grew unbounded
    // for the server's lifetime, across solution switches.
    private closedFileCache = new Map<string, { tokens: Token[]; mtimeMs: number }>();

    /** #260 — max closed-file entries kept. Map preserves insertion order;
     *  hits re-insert (LRU), overflow evicts the oldest. Mutable for tests. */
    public static closedFileCacheMax = 512;

    /** #260 — test/diagnostics visibility into the closed-file cache size. */
    public get closedFileCacheSize(): number {
        return this.closedFileCache.size;
    }

    /**
     * #260 — canonical cache key for a URI: percent-decoded and lowercased so
     * encoding (`f%3A` vs `f:`) and case (Windows paths are case-insensitive)
     * differences collapse to one key. Falls back to lowercased raw input on a
     * malformed escape (same discipline as canonicalLocationKey / #196).
     */
    private static canonicalKey(uri: string): string {
        try {
            return decodeURIComponent(uri).toLowerCase();
        } catch {
            return uri.toLowerCase();
        }
    }

    private constructor() {
        // Private constructor to enforce singleton pattern
    }

    /**
     * Get the singleton instance of TokenCache
     */
    public static getInstance(): TokenCache {
        if (!TokenCache.instance) {
            TokenCache.instance = new TokenCache();
        }
        return TokenCache.instance;
    }

    /**
     * 🚀 FAST PATH: Get cached tokens WITHOUT triggering re-tokenization
     * Use this for interactive features like signature help that need to be instant
     * @param document Document to get tokens for
     * @returns Cached tokens or empty array if not cached
     */
    public getCachedTokens(document: TextDocument): Token[] {
        const cached = this.cache.get(TokenCache.canonicalKey(document.uri));
        if (cached) {
            logger.debug(`⚡ Fast path: returning ${cached.tokens.length} cached tokens for ${document.uri}`);
            return cached.tokens;
        }
        logger.debug(`⚡ Fast path: no cached tokens for ${document.uri}, returning empty array`);
        return [];
    }

    /**
     * Returns the live document text for a cached URI, or null if not cached.
     * Use this to read the editor's in-memory content for open files instead of
     * falling back to readFileSync (which would return stale disk content).
     */
    public getDocumentText(uri: string): string | null {
        return this.cache.get(TokenCache.canonicalKey(uri))?.documentText ?? null;
    }

    /**
     * Get tokens for a document, using cached tokens if available
     * Implements incremental line-based re-tokenization for performance
     * @param document The text document
     * @returns Array of tokens
     */
    public getTokens(document: TextDocument): Token[] {
        const perfStart = performance.now();
        
        try {
            logger.info(`🔍 [DEBUG] TokenCache.getTokens called for: ${document.uri}`);
            logger.info(`🔍 [DEBUG] Document language ID: ${document.languageId}`);
            
            // Skip XML files to prevent crashes
            const fileExt = document.uri.toLowerCase();
            if (fileExt.endsWith('.xml') || fileExt.endsWith('.cwproj')) {
                logger.info(`⚠️ [DEBUG] TokenCache skipping XML file: ${document.uri}`);
                return [];
            }
            
            const cached = this.cache.get(TokenCache.canonicalKey(document.uri));
            const currentText = document.getText();
            
            // 🚀 PERFORMANCE: Check if we can use incremental update
            // #340: version alone is NOT identity — synthetic documents (cross-file
            // loaders create them at version 1) collide with cached entries for a
            // file whose content changed OUTSIDE the editor (appgen regeneration,
            // git, scripted edits), pairing STALE tokens with FRESH content. The
            // entry already carries documentText; a content mismatch falls through
            // to the incremental/full paths below, which handle it correctly.
            if (cached && cached.version === document.version && cached.documentText === currentText) {
                logger.info(`🟢 [TC] Cache HIT v${document.version} tokens=${cached.tokens.length} uri=${document.uri}`);
                return cached.tokens;
            }

            // 🚀 DEBUG: Log incremental check
            if (cached) {
                logger.info(`🔴 [TC] Cache MISS v${document.version} cached.v=${cached.version} uri=${document.uri}`);
            } else {
                logger.info(`🔴 [TC] Cache EMPTY (first tokenize) uri=${document.uri}`);
            }
            
            // 🚀 PERFORMANCE: Try incremental update if we have cached data
            if (cached && cached.documentText && this.canUseIncrementalUpdate(currentText, cached.documentText)) {
                logger.info(`🚀 [PERF] Attempting incremental tokenization for ${document.uri}`);
                const incStart = performance.now();
                try {
                    const tokens = this.incrementalTokenize(document, cached, currentText);
                    if (tokens) {
                        const incTime = performance.now() - incStart;
                        const totalTime = performance.now() - perfStart;
                        logger.perf('Incremental tokenization', {
                            'total_ms': totalTime.toFixed(2),
                            'tokenize_ms': incTime.toFixed(2),
                            'tokens': tokens.length,
                            'uri': document.uri
                        });
                        logger.info(`✅ [PERF] Incremental tokenization successful: ${tokens.length} tokens in ${incTime.toFixed(2)}ms (${totalTime.toFixed(2)}ms total)`);
                        return tokens;
                    }
                } catch (incError) {
                    logger.warn(`⚠️ Incremental tokenization failed, falling back to full tokenization: ${incError instanceof Error ? incError.message : String(incError)}`);
                }
            }

            // Full tokenization
            logger.info(`🟢 [PERF] Running full tokenizer for ${document.uri} (version ${document.version}) - no incremental cache available`);
            const fullStart = performance.now();
            
            try {
                const tokenizer = new ClarionTokenizer(document.getText());
                const tokens = tokenizer.tokenize();
                
                // 🚀 PERFORMANCE: Build line-based cache
                const cacheStart = performance.now();
                const lineTokens = this.buildLineTokenMap(document, tokens);
                const cacheTime = performance.now() - cacheStart;
                
                // ClarionTokenizer.tokenize() already ran DocumentStructure.process() internally.
                // Reuse that instance — do NOT call process() again on the same token array,
                // as a second pass corrupts subType assignments (e.g. MapProcedure explosion).
                const structure = tokenizer.getDocumentStructure() ?? (() => {
                    const s = new DocumentStructure(tokens);
                    s.process();
                    return s;
                })();
                
                // 🚀 PERFORMANCE: Cache the structure to avoid rebuilding it
                this.cache.set(TokenCache.canonicalKey(document.uri), {
                    version: document.version,
                    tokens,
                    lineTokens,
                    documentText: currentText,
                    structure: structure,
                    uri: document.uri
                });
                
                const fullTime = performance.now() - fullStart;
                const totalTime = performance.now() - perfStart;
                
                logger.perf('Full tokenization', {
                    'total_ms': totalTime.toFixed(2),
                    'tokenize_ms': fullTime.toFixed(2),
                    'cache_build_ms': cacheTime.toFixed(2),
                    'tokens': tokens.length
                });
                
                return tokens;
            } catch (tokenizeError) {
                logger.error(`❌ [DEBUG] Error tokenizing document: ${tokenizeError instanceof Error ? tokenizeError.message : String(tokenizeError)}`);
                return [];
            }
        } catch (error) {
            const totalTime = performance.now() - perfStart;
            logger.error(`❌ [DEBUG] Unexpected error in TokenCache.getTokens after ${totalTime.toFixed(2)}ms: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Get the DocumentStructure for a document — the SAME instance the tokenize
     * pipeline built and cached alongside the tokens.
     *
     * #258: this method previously snapshotted the cache entry BEFORE calling
     * getTokens() and then unconditionally re-built + re-processed on any miss —
     * discarding the structure getTokens() had just cached and running the exact
     * "second process() pass on shared tokens" hazard warned about elsewhere in
     * this file. It now re-checks the cache AFTER getTokens() (which populates
     * `structure` on both the full and incremental paths) and only builds fresh
     * as a last-resort fallback, storing it on the LIVE cache entry.
     */
    public getStructure(document: TextDocument): DocumentStructure {
        const perfStart = performance.now();
        const uri = TokenCache.canonicalKey(document.uri);
        const cached = this.cache.get(uri);

        // Fast path: cached structure, current version.
        if (cached && cached.structure && cached.version === document.version) {
            const perfEnd = performance.now();
            logger.perf(`getStructure`, { result: 'cached', time_ms: (perfEnd - perfStart).toFixed(2) });
            return cached.structure;
        }

        // getTokens() tokenizes (full or incremental) and caches the structure it built.
        const tokens = this.getTokens(document);

        // #258: re-fetch — getTokens() replaced/populated the cache entry.
        const refreshed = this.cache.get(uri);
        if (refreshed && refreshed.structure && refreshed.version === document.version) {
            const perfEnd = performance.now();
            logger.perf(`getStructure`, { result: 'built_by_getTokens', time_ms: (perfEnd - perfStart).toFixed(2) });
            return refreshed.structure;
        }

        // Fallback (should be rare — e.g. tokenizer returned no structure): build once
        // and store on the LIVE entry so repeat calls return the same instance.
        logger.info(`Building fallback DocumentStructure for ${uri} (entry=${!!refreshed}, hasStructure=${!!(refreshed?.structure)})`);
        const structure = new DocumentStructure(tokens);
        structure.process();
        if (refreshed) {
            refreshed.structure = structure;
        }

        const perfEnd = performance.now();
        logger.perf(`getStructure`, { result: 'built_new', time_ms: (perfEnd - perfStart).toFixed(2), tokens: tokens.length });

        return structure;
    }

    /**
     * Get all URIs currently held in the cache
     * Used by ReferencesProvider to avoid disk reads for open documents
     */
    public getAllCachedUris(): string[] {
        // #260 — keys are canonical; return the caller-visible original URIs.
        return Array.from(this.cache.values(), v => v.uri);
    }

    /**
     * Get tokens for a URI without a TextDocument (uses cached data only)
     * Returns null if the URI is not in the cache.
     * #260 — keyed canonically, so any spelling (encoding/case) of the same
     * physical file hits the same entry.
     */
    public getTokensByUri(uri: string): Token[] | null {
        const cached = this.cache.get(TokenCache.canonicalKey(uri));
        return cached ? cached.tokens : null;
    }

    /**
     * Historical alias of `getTokensByUri` — #260's canonical keying made the
     * base lookup encoding- AND case-insensitive, so the O(n) cache-walk this
     * method used to do is gone. Kept for its call sites (FAR Tier 6 /
     * `671d7cd8`).
     */
    public getTokensByUriCaseInsensitive(uri: string): Token[] | null {
        return this.getTokensByUri(uri);
    }

    /**
     * Look up a cached document's full source text by URI. Used by FAR's
     * cross-file overloadFilter resolution path (`671d7cd8`) where the cursor's
     * document and the declaration file may differ — the matching loop's
     * declaration-line text needs the declaring file's in-memory text rather
     * than a disk read (which fails for in-memory test fixtures + open-but-
     * unsaved buffers in production). #260: same canonical-key discipline.
     */
    public getDocumentTextByUriCaseInsensitive(uri: string): string | null {
        return this.getDocumentText(uri);
    }

    /**
     * #188 — Get tokens for a URI without a live TextDocument (closed on-disk
     * file). Resolution order:
     *   1. live editor buffer (open file) — always wins, never stale;
     *   2. mtime-validated closed-file cache — reused across calls so a file is
     *      tokenized at most once until it changes on disk;
     *   3. read + tokenize from disk (tokenize() runs DocumentStructure.process()
     *      internally — we do NOT process() again).
     * Returns [] if the file is missing/unreadable.
     */
    public getTokensForClosedFile(uri: string): Token[] {
        const open = this.getTokensByUriCaseInsensitive(uri);
        if (open) return open;

        const filePath = decodeURIComponent(uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        let mtimeMs: number;
        try { mtimeMs = fs.statSync(filePath).mtimeMs; } catch { return []; }

        // #260 — canonical key (decoded + lowercased): encoding variants of the
        // same file share one entry instead of tokenizing twice into divergence.
        const key = TokenCache.canonicalKey(uri);
        const cached = this.closedFileCache.get(key);
        if (cached && cached.mtimeMs === mtimeMs) {
            // LRU touch: re-insert so this entry becomes newest.
            this.closedFileCache.delete(key);
            this.closedFileCache.set(key, cached);
            return cached.tokens;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            // tokenize() builds + runs DocumentStructure.process() internally; a
            // second process() here would be redundant (and double-push children).
            const tokens = new ClarionTokenizer(content).tokenize();
            this.closedFileCache.set(key, { tokens, mtimeMs });
            // #260 — bounded: evict oldest entries past the cap (Map preserves
            // insertion order; hits above re-inserted, so first key = LRU).
            while (this.closedFileCache.size > TokenCache.closedFileCacheMax) {
                const oldest = this.closedFileCache.keys().next().value;
                if (oldest === undefined) break;
                this.closedFileCache.delete(oldest);
            }
            return tokens;
        } catch {
            return [];
        }
    }

    /**
     * Get the cached DocumentStructure for a URI without a TextDocument.
     * Returns null when the URI has no cache entry or the structure has not
     * been built yet. Callers that need a guaranteed structure should use
     * getStructure(document) instead — that path builds on demand.
     */
    public getStructureByUri(uri: string): DocumentStructure | null {
        const cached = this.cache.get(TokenCache.canonicalKey(uri));
        return cached?.structure ?? null;
    }

    /**
     * Clear tokens for a document
     * @param uri The document URI
     */
    public clearTokens(uri: string): void {
        logger.info(`🗑️ Clearing tokens for ${uri}`);
        const key = TokenCache.canonicalKey(uri);
        this.cache.delete(key);
        this.closedFileCache.delete(key); // #188
    }

    /**
     * Clear all cached tokens
     */
    public clearAllTokens(): void {
        logger.info(`🗑️ Clearing all tokens`);
        this.cache.clear();
        this.closedFileCache.clear(); // #188
    }

    /**
     * 🚀 PERFORMANCE: Check if incremental update is feasible
     * Only use incremental if changes are relatively small
     */
    private canUseIncrementalUpdate(newText: string, oldText: string): boolean {
        // Don't use incremental for very different documents
        const lengthDiff = Math.abs(newText.length - oldText.length);
        const maxLength = Math.max(newText.length, oldText.length);
        
        // If more than 20% changed, just re-tokenize everything
        if (lengthDiff / maxLength > 0.2) {
            return false;
        }
        
        return true;
    }

    /**
     * 🚀 PERFORMANCE: Build line-based token map
     */
    private buildLineTokenMap(document: TextDocument, tokens: Token[]): Map<number, LineTokenData> {
        const lineTokens = new Map<number, LineTokenData>();
        
        // 🚀 PERF: Split text ONCE instead of calling document.getText() for each line
        const allText = document.getText();
        const lines = allText.split(/\r?\n/);
        
        // Group tokens by line
        const tokensByLine = new Map<number, Token[]>();
        for (const token of tokens) {
            if (!tokensByLine.has(token.line)) {
                tokensByLine.set(token.line, []);
            }
            tokensByLine.get(token.line)!.push(token);
        }
        
        // Build line data using pre-split lines
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            lineTokens.set(lineNum, {
                lineNumber: lineNum,
                lineText: lines[lineNum],
                tokens: tokensByLine.get(lineNum) || []
            });
        }
        
        return lineTokens;
    }

    /**
     * 🚀 PERFORMANCE: Detect which lines changed
     */
    private detectChangedLines(newText: string, oldText: string): Set<number> {
        const changedLines = new Set<number>();
        const newLines = newText.split(/\r?\n/);
        const oldLines = oldText.split(/\r?\n/);
        
        const maxLines = Math.max(newLines.length, oldLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            if (newLines[i] !== oldLines[i]) {
                changedLines.add(i);
            }
        }
        
        return changedLines;
    }

    /**
     * 🚀 PERFORMANCE: Expand changed lines to include dependencies
     * Multi-line structures and continuations need surrounding lines re-tokenized
     */
    private expandToDependencies(changedLines: Set<number>, cached: CachedTokenData, totalLines: number): Set<number> {
        const expanded = new Set(changedLines);
        
        // CRITICAL: If a PROCEDURE/CLASS/MAP/INTERFACE line changes, we need to re-tokenize
        // everything inside it because child structures depend on parent context
        for (const lineNum of changedLines) {
            const lineData = cached.lineTokens.get(lineNum);
            if (lineData) {
                const lineUpper = lineData.lineText.toUpperCase();
                // Check if this line contains a structure keyword (#247: PROCEDURE ≡ FUNCTION)
                if (lineUpper.includes('PROCEDURE') || lineUpper.includes('FUNCTION') ||
                    lineUpper.includes('CLASS') ||
                    lineUpper.includes('MAP') || lineUpper.includes('INTERFACE') ||
                    lineUpper.includes('MODULE')) {
                    // Find all tokens that are children of this structure
                    // Re-tokenize from this line to the end of the structure
                    for (const token of cached.tokens) {
                        if (token.line === lineNum && token.finishesAt && token.finishesAt > lineNum) {
                            // This is a multi-line structure starting on the changed line
                            // Re-tokenize everything from here to finishesAt
                            for (let line = lineNum; line <= token.finishesAt && line < totalLines; line++) {
                                expanded.add(line);
                            }
                            break;
                        }
                    }
                    
                    // If we didn't find a finishesAt, be conservative and re-tokenize
                    // from this line to the next PROCEDURE/class-level keyword
                    let foundEnd = false;
                    for (let line = lineNum + 1; line < totalLines && line < lineNum + 100; line++) {
                        const nextLineData = cached.lineTokens.get(line);
                        if (nextLineData) {
                            const nextUpper = nextLineData.lineText.trim().toUpperCase();
                            // Stop at next procedure/class or at column 0 keywords that end structures (#247)
                            if (nextUpper.startsWith('PROCEDURE ') || nextUpper.startsWith('FUNCTION ') ||
                                nextUpper.startsWith('CLASS ') ||
                                (nextUpper === 'END' && nextLineData.lineText.trim() === 'END')) {
                                foundEnd = true;
                                break;
                            }
                        }
                        expanded.add(line);
                    }
                }
            }
        }
        
        // Add lines that are part of multi-line structures
        for (const token of cached.tokens) {
            // If this token spans multiple lines and any of those lines changed
            if (token.finishesAt && token.finishesAt > token.line) {
                let affected = false;
                for (let line = token.line; line <= token.finishesAt; line++) {
                    if (changedLines.has(line)) {
                        affected = true;
                        break;
                    }
                }
                
                if (affected) {
                    // Re-tokenize entire structure
                    for (let line = token.line; line <= token.finishesAt; line++) {
                        expanded.add(line);
                    }
                }
            }
        }
        
        // Add line continuations (lines ending with |)
        for (const lineNum of changedLines) {
            // Check previous line for continuation
            if (lineNum > 0) {
                const prevLineData = cached.lineTokens.get(lineNum - 1);
                if (prevLineData && prevLineData.lineText.trim().endsWith('|')) {
                    expanded.add(lineNum - 1);
                }
            }
            
            // Check current and next lines
            const currentLineData = cached.lineTokens.get(lineNum);
            if (currentLineData && currentLineData.lineText.trim().endsWith('|')) {
                if (lineNum + 1 < totalLines) {
                    expanded.add(lineNum + 1);
                }
            }
        }
        
        return expanded;
    }

    /**
     * 🚀 PERFORMANCE: Incrementally re-tokenize only changed lines
     */
    private incrementalTokenize(document: TextDocument, cached: CachedTokenData, newText: string): Token[] | null {
        const perfStart = performance.now();
        
        const detectStart = performance.now();
        const changedLines = this.detectChangedLines(newText, cached.documentText);
        const detectTime = performance.now() - detectStart;
        
        if (changedLines.size === 0) {
            logger.info(`🚀 No lines changed, using cached tokens (${detectTime.toFixed(2)}ms detection)`);
            // #260 — CONVERGE the phantom version bump (identical text, higher
            // version — format-no-op, undo/redo round-trip). Without this the
            // entry's version stayed behind forever, so getStructure()'s
            // version-gated fast path failed on every subsequent call and it
            // rebuilt a fresh structure each time until a real edit landed.
            cached.version = document.version;
            cached.documentText = newText;
            return cached.tokens;
        }
        
        logger.info(`🚀 Detected ${changedLines.size} changed lines in ${detectTime.toFixed(2)}ms: ${Array.from(changedLines).slice(0, 10).join(', ')}${changedLines.size > 10 ? '...' : ''}`);
        
        // Expand to include dependencies
        const expandStart = performance.now();
        const linesToRetokenize = this.expandToDependencies(changedLines, cached, document.lineCount);
        const expandTime = performance.now() - expandStart;
        
        logger.info(`🚀 Re-tokenizing ${linesToRetokenize.size} lines (including dependencies) - expansion took ${expandTime.toFixed(2)}ms`);
        
        // If we need to re-tokenize more than 30% of the document, just do full tokenization
        if (linesToRetokenize.size / document.lineCount > 0.3) {
            logger.info(`🚀 Too many lines changed (${linesToRetokenize.size}/${document.lineCount} = ${((linesToRetokenize.size/document.lineCount)*100).toFixed(1)}%), doing full tokenization`);
            return null;
        }
        
        // Build text with only the lines we need to re-tokenize
        const buildStart = performance.now();
        const linesToTokenize: string[] = [];
        const lineMapping: number[] = []; // Maps tokenized line index to document line number
        
        for (const lineNum of Array.from(linesToRetokenize).sort((a, b) => a - b)) {
            const lineText = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: Number.MAX_SAFE_INTEGER }
            });
            linesToTokenize.push(lineText);
            lineMapping.push(lineNum);
        }
        const buildTime = performance.now() - buildStart;
        
        // Tokenize the subset
        const tokenizeStart = performance.now();
        // skipStructureProcessing=true: partial-line tokens won't have full file context,
        // so don't run process() on them. The full DocumentStructure.process() below on
        // mergedTokens (the complete file) is the single authoritative pass.
        const tokenizer = new ClarionTokenizer(linesToTokenize.join('\n'), 2, true);
        const newTokens = tokenizer.tokenize();
        const tokenizeTime = performance.now() - tokenizeStart;
        
        // Adjust line numbers in new tokens
        const adjustStart = performance.now();
        for (const token of newTokens) {
            token.line = lineMapping[token.line];
            if (token.finishesAt !== undefined) {
                // Find the corresponding original line number
                const finishIndex = token.finishesAt;
                if (finishIndex < lineMapping.length) {
                    token.finishesAt = lineMapping[finishIndex];
                }
            }
        }
        const adjustTime = performance.now() - adjustStart;
        
        // Merge with cached tokens
        const mergeStart = performance.now();
        const mergedTokens: Token[] = [];
        
        // Remove old tokens from changed lines
        for (const token of cached.tokens) {
            if (!linesToRetokenize.has(token.line)) {
                mergedTokens.push(token);
            }
        }
        
        // Add new tokens
        mergedTokens.push(...newTokens);
        
        // Sort by line number
        mergedTokens.sort((a, b) => {
            if (a.line !== b.line) return a.line - b.line;
            return a.start - b.start;
        });
        const mergeTime = performance.now() - mergeStart;
        
        // Process tokens through DocumentStructure to set subtypes (MapProcedure, etc.)
        // This modifies tokens in-place - must be done BEFORE caching
        const processStart = performance.now();
        const structure = new DocumentStructure(mergedTokens);
        structure.process();
        const processTime = performance.now() - processStart;
        
        // Update cache
        const cacheStart = performance.now();
        const lineTokens = this.buildLineTokenMap(document, mergedTokens);
        const cacheTime = performance.now() - cacheStart;
        
        // 🚀 PERFORMANCE: Cache the structure to avoid rebuilding it
        this.cache.set(TokenCache.canonicalKey(document.uri), {
            version: document.version,
            tokens: mergedTokens,
            lineTokens,
            documentText: newText,
            structure: structure,
            uri: document.uri
        });
        
        const totalTime = performance.now() - perfStart;
        const reusedTokens = cached.tokens.length - (cached.tokens.length - mergedTokens.length + newTokens.length);
        const reusedPercent = (reusedTokens / cached.tokens.length) * 100;
        
        logger.perf('Incremental tokenization', {
            'total_ms': totalTime.toFixed(2),
            'changed_lines': changedLines.size,
            'retokenized_lines': linesToRetokenize.size,
            'tokens': mergedTokens.length,
            'reused_pct': reusedPercent.toFixed(1) + '%',
            'detect_ms': detectTime.toFixed(2),
            'expand_ms': expandTime.toFixed(2),
            'build_ms': buildTime.toFixed(2),
            'tokenize_ms': tokenizeTime.toFixed(2),
            'adjust_ms': adjustTime.toFixed(2),
            'merge_ms': mergeTime.toFixed(2),
            'process_ms': processTime.toFixed(2),
            'cache_ms': cacheTime.toFixed(2)
        });
        
        return mergedTokens;
    }
}