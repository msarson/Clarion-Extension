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

    /** #484 — extensions that are never Clarion source; getTokensForClosedFile returns [] for them. */
    public static readonly NON_SOURCE_EXTENSION =
        /\.(dll|lib|exe|obj|res|pdb|ico|bmp|png|jpg|jpeg|gif|cur|app|dct|tps|tpsx|zip|7z|rar|msi|chm|pdf)$/i;

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
        // #484 — never tokenise a binary. A MODULE('x.dll') in a MAP resolved through
        // the `*.dll` redirection rule to the real DLL, FAR's file set carried it here,
        // and the tokenizer chewed the bytes for 2.5s (20,917 tokens from "346 lines").
        if (TokenCache.NON_SOURCE_EXTENSION.test(filePath)) return [];
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
     * #715 — the lines an edit touched: `first..oldLast` in the old text became
     * `first..newLast` in the new one, and every line after them moved by `delta`.
     * Found from the text the two share at the start and at the end, so an edit that adds
     * or removes lines touches only its own lines (comparing line by line, Enter made every
     * later line look changed). Null when the texts are equal.
     *
     * Where the inserted or deleted text repeats the text beside it, more than one span
     * explains the edit: Enter and an indent typed before a line indented the same way
     * reads as the next line edited if the shared start is taken first. `fromEnd` takes
     * the shared end first, which gives the other reading.
     */
    static editedLines(oldText: string, newText: string, document: TextDocument, oldLineCount: number, fromEnd = false):
        { first: number; oldLast: number; newLast: number; delta: number } | null {
        if (oldText === newText) return null;
        const shorter = Math.min(oldText.length, newText.length);
        const samePrefix = (limit: number) => {
            let n = 0;
            while (n < limit && oldText.charCodeAt(n) === newText.charCodeAt(n)) n++;
            return n;
        };
        const sameSuffix = (limit: number) => {
            let n = 0;
            while (n < limit && oldText.charCodeAt(oldText.length - 1 - n) === newText.charCodeAt(newText.length - 1 - n)) n++;
            return n;
        };
        let prefix: number, suffix: number;
        if (fromEnd) { suffix = sameSuffix(shorter); prefix = samePrefix(shorter - suffix); }
        else { prefix = samePrefix(shorter); suffix = sameSuffix(shorter - prefix); }
        const delta = document.lineCount - oldLineCount;
        const first = document.positionAt(prefix).line;
        const newLast = Math.max(first, document.positionAt(newText.length - suffix).line);
        const oldLast = Math.min(oldLineCount - 1, Math.max(first, newLast - delta));
        return { first, oldLast, newLast, delta };
    }

    /**
     * Both readings of {@link editedLines} together, widened by a line each side (which
     * covers an edit that splits a CRLF): outside it the text is unchanged either way.
     */
    static changedRegion(oldText: string, newText: string, document: TextDocument, oldLineCount: number):
        { first: number; oldLast: number; delta: number } | null {
        const a = TokenCache.editedLines(oldText, newText, document, oldLineCount);
        const b = TokenCache.editedLines(oldText, newText, document, oldLineCount, true);
        if (!a || !b) return null;
        const first = Math.max(0, Math.min(a.first, b.first) - 1);
        const newLast = Math.min(document.lineCount - 1, Math.max(a.newLast, b.newLast) + 1);
        const oldLast = Math.min(oldLineCount - 1, Math.max(first, newLast - a.delta));
        return { first, oldLast, delta: a.delta };
    }

    /**
     * 🔍 Whether an edit may change where structures open or close, so the cached tokens
     * cannot be patched and the next getTokens must tokenize the whole document: a
     * structure keyword, PROCEDURE, CODE, END or a standalone period on an edited line,
     * before or after the edit, or a change of more than 50 characters. Without a cached
     * copy of the document there is nothing to patch, and the answer is false.
     *
     * #715: moved from server.ts and limited to the lines the edit touched. It compared
     * the old and new text line by line, so after Enter every later line counted as
     * edited, nearly every Enter cleared the cache, and the next hover on a 60k-line
     * module waited for a full tokenize. Comparing the patched tokens with a full tokenize
     * over random edits added PROCEDURE and FUNCTION (a new procedure closes what is open
     * before it) and a period in column 0.
     */
    public isStructureAffectingEdit(document: TextDocument): boolean {
        const cached = this.cache.get(TokenCache.canonicalKey(document.uri));
        if (!cached || !cached.documentText) return false;
        const text = document.getText();
        if (Math.abs(text.length - cached.documentText.length) > 50) return true;
        const structural = (line: string) =>
            /\b(IF|CASE|LOOP|CLASS|MAP|GROUP|QUEUE|RECORD|FILE|INTERFACE|MODULE|EXECUTE|BEGIN|ACCEPT|ROUTINE|PROCEDURE|FUNCTION|CODE|END)\b/i.test(line) ||
            /(^|\s)\.\s*(!|$)/.test(line); // a standalone period: a dot after whitespace or in column 0, then a comment or the end
        const oldLine = (l: number) => cached.lineTokens.get(l)?.lineText ?? '';
        // #715 step 1: an OMIT/COMPILE block, its terminator, and a `|` continuation are
        // re-tokenized from scratch whenever an edit touches one.
        const terminators = this.omitTerminators(cached);
        // A line that moves the tokenizer into or out of a CODE section (CODE, DATA, ROUTINE,
        // PROCEDURE) changes how every line after it is read.
        const special = (line: string) => {
            const code = TokenCache.codePart(line);
            return /\b(OMIT|COMPILE)\s*\(/i.test(code) || code.includes('|') ||
                ClarionTokenizer.codeSectionSetBy(line) !== undefined ||
                (terminators.length > 0 && terminators.some(t => line.includes(t)));
        };
        // The line above ends with a continuation, so the edited line is part of its statement.
        const continued = (l: number) => l > 0 && TokenCache.codePart(oldLine(l - 1)).trimEnd().endsWith('|');
        const touchesStructure = (fromEnd: boolean) => {
            const edited = TokenCache.editedLines(cached.documentText, text, document, cached.lineTokens.size, fromEnd);
            if (!edited) return false;
            if (edited.first > 0 && continued(edited.first)) return true; // the edited line continues the one above
            const newLines = TokenCache.lineSlice(document, text, edited.first, edited.newLast);
            if (edited.delta === 0) {
                // Same line count: only the lines whose text differs were edited. Edits in
                // several places between two requests (typing in a burst) make one wide span.
                // A line whose structure is unchanged (a comment typed after END, a condition
                // edited in an IF) changes no structure.
                for (let i = 0; i < newLines.length; i++) {
                    const before = oldLine(edited.first + i);
                    if (newLines[i] === before) continue;
                    if (special(newLines[i]) || special(before)) return true;
                    if (edited.first + i > 0 && continued(edited.first + i)) return true;
                    if (TokenCache.structureSignature(newLines[i]) !== TokenCache.structureSignature(before)) return true;
                }
                return false;
            }
            for (let l = edited.first; l <= edited.oldLast; l++) if (structural(oldLine(l)) || special(oldLine(l))) return true;
            for (const line of newLines) if (structural(line) || special(line)) return true;
            return false;
        };
        // Either reading of the edit is a true account of it, so if one leaves every
        // structural line as it was, no structure changed.
        return touchesStructure(false) && touchesStructure(true);
    }

    /** A line's code: string literals blanked ('' escapes kept inside), the comment removed. */
    static codePart(line: string): string {
        return line.replace(/'([^']|'')*'/g, m => ' '.repeat(m.length)).replace(/!.*$/, '');
    }

    /**
     * #715 step 1 — what on a line can open or close a structure: whether it starts in column 0
     * (a label, or a keyword read as one), the structure keywords in order, and the periods that
     * can terminate one (not a decimal point, not member access). Two versions of a line with the
     * same signature open and close the same structures.
     */
    static structureSignature(line: string): string {
        const code = TokenCache.codePart(line);
        const keywords = code.match(/\b(IF|CASE|LOOP|CLASS|MAP|GROUP|QUEUE|RECORD|FILE|INTERFACE|MODULE|EXECUTE|BEGIN|ACCEPT|ROUTINE|PROCEDURE|FUNCTION|CODE|DATA|END|OF|OROF|ELSE|ELSIF|WHILE|UNTIL|TIMES|TO|BY|THEN|WINDOW|REPORT|VIEW|JOIN|OPTION|SHEET|TAB|MENU|MENUBAR|TOOLBAR|DETAIL|HEADER|FOOTER|FORM|ITEMIZE|OLE|STRUCT)\b/gi) ?? [];
        let periods = 0;
        for (let i = 0; i < code.length; i++) {
            if (code[i] !== '.') continue;
            const prev = code[i - 1] ?? ' ', next = code[i + 1] ?? ' ';
            if (/[0-9]/.test(prev) && /[0-9]/.test(next)) continue; // 1.5
            if (/[A-Za-z_0-9:]/.test(next)) continue;               // Obj.Member
            periods++;
        }
        return `${/^\S/.test(code) ? 'L' : 'I'}|${keywords.join(' ').toUpperCase()}|${periods}`;
    }

    /** The terminator strings of the document's OMIT and COMPILE blocks. */
    private omitTerminatorMemo = new WeakMap<CachedTokenData, string[]>();
    private omitTerminators(cached: CachedTokenData): string[] {
        let found = this.omitTerminatorMemo.get(cached);
        if (!found) {
            found = [];
            for (const m of cached.documentText.matchAll(/\b(?:OMIT|COMPILE)\s*\(\s*'((?:[^']|'')+)'/gi)) {
                if (!found.includes(m[1])) found.push(m[1]);
            }
            this.omitTerminatorMemo.set(cached, found);
        }
        return found;
    }

    /** Lines `first..last` of the document, without line ends: one slice, not a getText per line. */
    static lineSlice(document: TextDocument, text: string, first: number, last: number): string[] {
        if (last < first) return [];
        const start = document.offsetAt({ line: first, character: 0 });
        const end = last + 1 < document.lineCount ? document.offsetAt({ line: last + 1, character: 0 }) : text.length;
        const lines = text.slice(start, end).split(/\r?\n/);
        if (last + 1 < document.lineCount) lines.pop(); // the empty piece after the last line end
        return lines;
    }

    /**
     * #715 — what DocumentStructure.process() derives, made ready for another pass. The
     * extents it sets on every pass are cleared, so a structure whose END the edit removed
     * does not keep its old one. `parent` and `children` only lose the tokens the edit
     * replaced: process() sets some of them only while it classifies a token, and a kept
     * token is classified already, so clearing them whole left a MAP procedure without its
     * MODULE for good. Found by comparing with a full tokenize over random edits.
     */
    static clearDerivedStructure(tokens: Token[], replaced: Set<Token>): void {
        for (const t of tokens) {
            if (t.finishesAt !== undefined) t.finishesAt = undefined;
            if (t.codeFinishesAt !== undefined) t.codeFinishesAt = undefined;
            if (t.declaringProcedureLine !== undefined) t.declaringProcedureLine = undefined;
            if (t.parent !== undefined && replaced.has(t.parent)) t.parent = undefined;
            if (t.executionMarker !== undefined) t.executionMarker = undefined;
            if (t.branches !== undefined) t.branches = undefined;
            if (t.children !== undefined && t.children.some(c => replaced.has(c))) {
                t.children = t.children.filter(c => !replaced.has(c));
            }
        }
    }

    /**
     * A cached token after an edit's lines, moved by the lines the edit added or removed.
     * Its other line fields are derived ones, cleared by clearDerivedStructure and set
     * again by process().
     */
    static shiftLines(token: Token, delta: number): Token {
        token.line += delta;
        return token;
    }

    /**
     * 🚀 PERFORMANCE: Incrementally re-tokenize only changed lines
     */
    private incrementalTokenize(document: TextDocument, cached: CachedTokenData, newText: string): Token[] | null {
        const perfStart = performance.now();

        const detectStart = performance.now();
        const oldLineCount = cached.lineTokens.size;
        const region = TokenCache.changedRegion(cached.documentText, newText, document, oldLineCount);
        const detectTime = performance.now() - detectStart;

        if (!region) {
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
        const { first, oldLast, delta } = region;

        // The old lines the edit touched. With the line count unchanged they are the lines
        // whose text differs, so a burst of typing in several places is several short spans
        // rather than one that runs from the first to the last. With lines added or removed,
        // everything between moves, so it is one span.
        const expandStart = performance.now();
        const lineText = (l: number) => cached.lineTokens.get(l)?.lineText ?? '';
        const changedLines = new Set<number>();
        if (delta === 0) {
            const now = TokenCache.lineSlice(document, newText, first, oldLast);
            for (let i = 0; i < now.length; i++) if (now[i] !== lineText(first + i)) changedLines.add(first + i);
        }
        if (changedLines.size === 0) {
            if ((oldLast - first + 1) / oldLineCount > 0.3) {
                logger.info(`🚀 Edit spans lines ${first}-${oldLast} of ${oldLineCount}, doing full tokenization`);
                return null;
            }
            for (let l = first; l <= oldLast; l++) changedLines.add(l);
        }
        // The spans to re-tokenize: the edited lines themselves. Tokenizing reads one line at a
        // time, and the only state it carries between lines is whether it is inside a CODE
        // section, which each span is started with (below). #715: spans were widened to the
        // enclosing structures and then to the whole procedure, which in a module that is one
        // giant procedure (a generated report designer) was the module, so every edit there
        // fell back to a full tokenize. The structure itself is re-derived by process() below.
        const spans: Array<[number, number]> = [];
        for (const l of [...changedLines].sort((a, b) => a - b)) {
            const last = spans[spans.length - 1];
            if (last && l <= last[1] + 1) last[1] = Math.max(last[1], l);
            else spans.push([l, l]);
        }
        // Lines added or removed: one span from the first to the last, after which every
        // line moves by `delta`.
        if (delta !== 0 && spans.length > 1) spans.splice(0, spans.length, [spans[0][0], spans[spans.length - 1][1]]);
        // Lines before `first` are the same in the old and new text, so read them from the cache.
        const newLineAt = (i: number) => i < first
            ? lineText(i)
            : document.getText({ start: { line: i, character: 0 }, end: { line: i, character: Number.MAX_SAFE_INTEGER } }).replace(/\r?\n$/, '');
        const expandTime = performance.now() - expandStart;
        const retokenizedCount = spans.reduce((n, [lo, hi]) => n + Math.max(0, hi + delta - lo + 1), 0);

        logger.info(`🚀 Re-tokenizing ${retokenizedCount} lines in ${spans.length} span(s) (${delta >= 0 ? '+' : ''}${delta} lines) - expansion took ${expandTime.toFixed(2)}ms`);

        // If we need to re-tokenize more than 30% of the document, just do full tokenization
        if (retokenizedCount / document.lineCount > 0.3) {
            logger.info(`🚀 Too many lines changed (${retokenizedCount}/${document.lineCount} = ${((retokenizedCount/document.lineCount)*100).toFixed(1)}%), doing full tokenization`);
            return null;
        }

        // Tokenize each span on its own, in new line numbers (a span moves only when it is
        // the single span of an edit that added or removed lines, and then only at its end).
        // skipStructureProcessing=true: partial-line tokens won't have full file context,
        // so don't run process() on them. The full DocumentStructure.process() below on
        // mergedTokens (the complete file) is the single authoritative pass.
        const buildStart = performance.now();
        let tokenizeTime = 0;
        const spanTokens: Token[][] = [];
        for (const [lo, hi] of spans) {
            const lines: string[] = [];
            for (let lineNum = lo; lineNum <= Math.min(hi + delta, document.lineCount - 1); lineNum++) {
                lines.push(document.getText({
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: Number.MAX_SAFE_INTEGER }
                }));
            }
            const tokenizeStart = performance.now();
            const inCode = ClarionTokenizer.codeSectionAt(lo, newLineAt);
            const tokens = lines.length > 0 ? new ClarionTokenizer(lines.join('\n'), 2, true, inCode).tokenize() : [];
            tokenizeTime += performance.now() - tokenizeStart;
            for (const token of tokens) {
                token.line += lo;
                if (token.finishesAt !== undefined && token.finishesAt < lines.length) token.finishesAt += lo;
            }
            spanTokens.push(tokens);
        }
        const buildTime = performance.now() - buildStart - tokenizeTime;
        const adjustTime = 0;
        const newTokens = spanTokens.flat();

        // Merge: the cached tokens outside the spans, each span's new tokens in its place, and
        // after an edit that added or removed lines the cached tokens past it moved by `delta`.
        // Everything is in (line, start) order, so no sort. #715: the change used to be found by
        // comparing the old and new text line by line, so Enter shifted every later line, all of
        // them read as changed, and the cache fell back to a full tokenize (1.2 s on 60k lines).
        const mergeStart = performance.now();
        const mergedTokens: Token[] = [];
        const kept: Token[] = [];
        const replaced = new Set<Token>();
        let s = 0;
        const flushSpan = () => { for (const t of spanTokens[s]) mergedTokens.push(t); s++; };
        for (const token of cached.tokens) {
            while (s < spans.length && token.line > spans[s][1]) flushSpan();
            if (s < spans.length && token.line >= spans[s][0]) { replaced.add(token); continue; }
            const t = delta !== 0 && s === spans.length ? TokenCache.shiftLines(token, delta) : token;
            mergedTokens.push(t);
            kept.push(t);
        }
        while (s < spans.length) flushSpan();
        // The kept tokens still carry what the last process() derived; see clearDerivedStructure.
        TokenCache.clearDerivedStructure(kept, replaced);
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
            'changed_lines': oldLast - first + 1,
            'retokenized_lines': retokenizedCount,
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