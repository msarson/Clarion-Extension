import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from './ClarionTokenizer';
import LoggerManager from './logger';

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
}

/**
 * TokenCache provides a centralized caching mechanism for document tokens
 * with line-based incremental updates for optimal performance.
 */
export class TokenCache {
    private static instance: TokenCache;
    private cache = new Map<string, CachedTokenData>();

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
            
            const cached = this.cache.get(document.uri);
            const currentText = document.getText();
            
            // 🚀 PERFORMANCE: Check if we can use incremental update
            if (cached && cached.version === document.version) {
                const cacheTime = performance.now() - perfStart;
                logger.info(`🟢 Using cached tokens for ${document.uri} (version ${document.version}) - ${cacheTime.toFixed(2)}ms`);
                return cached.tokens;
            }
            
            // 🚀 DEBUG: Log incremental check
            if (cached) {
                logger.info(`🔍 [INCREMENTAL CHECK] cached=${!!cached}, hasDocText=${!!cached.documentText}, canIncremental=${cached.documentText ? this.canUseIncrementalUpdate(currentText, cached.documentText) : false}`);
            } else {
                logger.info(`🔍 [INCREMENTAL CHECK] No cached data available`);
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
                
                this.cache.set(document.uri, { 
                    version: document.version, 
                    tokens,
                    lineTokens,
                    documentText: currentText
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
     * Clear tokens for a document
     * @param uri The document URI
     */
    public clearTokens(uri: string): void {
        logger.info(`🗑️ Clearing tokens for ${uri}`);
        this.cache.delete(uri);
    }

    /**
     * Clear all cached tokens
     */
    public clearAllTokens(): void {
        logger.info(`🗑️ Clearing all tokens`);
        this.cache.clear();
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
        
        // Group tokens by line
        const tokensByLine = new Map<number, Token[]>();
        for (const token of tokens) {
            if (!tokensByLine.has(token.line)) {
                tokensByLine.set(token.line, []);
            }
            tokensByLine.get(token.line)!.push(token);
        }
        
        // Build line data
        for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
            const lineText = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: Number.MAX_SAFE_INTEGER }
            });
            
            lineTokens.set(lineNum, {
                lineNumber: lineNum,
                lineText,
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
                // Check if this line contains a structure keyword
                if (lineUpper.includes('PROCEDURE') || lineUpper.includes('CLASS') || 
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
                            // Stop at next procedure/class or at column 0 keywords that end structures
                            if (nextUpper.startsWith('PROCEDURE ') || nextUpper.startsWith('CLASS ') ||
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
        const tokenizer = new ClarionTokenizer(linesToTokenize.join('\n'));
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
        
        // Update cache
        const cacheStart = performance.now();
        const lineTokens = this.buildLineTokenMap(document, mergedTokens);
        this.cache.set(document.uri, {
            version: document.version,
            tokens: mergedTokens,
            lineTokens,
            documentText: newText
        });
        const cacheTime = performance.now() - cacheStart;
        
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
            'cache_ms': cacheTime.toFixed(2)
        });
        
        return mergedTokens;
    }
}