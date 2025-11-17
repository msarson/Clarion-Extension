import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from './ClarionTokenizer';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("TokenCache");
logger.setLevel("info");

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
                logger.info(`🟢 Using cached tokens for ${document.uri} (version ${document.version})`);
                return cached.tokens;
            }
            
            // 🚀 PERFORMANCE: Try incremental update if we have cached data
            if (cached && cached.documentText && this.canUseIncrementalUpdate(currentText, cached.documentText)) {
                logger.info(`🚀 Attempting incremental tokenization for ${document.uri}`);
                try {
                    const tokens = this.incrementalTokenize(document, cached, currentText);
                    if (tokens) {
                        logger.info(`✅ Incremental tokenization successful, got ${tokens.length} tokens`);
                        return tokens;
                    }
                } catch (incError) {
                    logger.warn(`⚠️ Incremental tokenization failed, falling back to full tokenization: ${incError instanceof Error ? incError.message : String(incError)}`);
                }
            }

            // Full tokenization
            logger.info(`🟢 Running full tokenizer for ${document.uri} (version ${document.version})`);
            
            try {
                const tokenizer = new ClarionTokenizer(document.getText());
                const tokens = tokenizer.tokenize();
                
                // 🚀 PERFORMANCE: Build line-based cache
                const lineTokens = this.buildLineTokenMap(document, tokens);
                
                this.cache.set(document.uri, { 
                    version: document.version, 
                    tokens,
                    lineTokens,
                    documentText: currentText
                });
                
                logger.info(`✅ [DEBUG] Successfully tokenized ${document.uri}, got ${tokens.length} tokens`);
                return tokens;
            } catch (tokenizeError) {
                logger.error(`❌ [DEBUG] Error tokenizing document: ${tokenizeError instanceof Error ? tokenizeError.message : String(tokenizeError)}`);
                return [];
            }
        } catch (error) {
            logger.error(`❌ [DEBUG] Unexpected error in TokenCache.getTokens: ${error instanceof Error ? error.message : String(error)}`);
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
        const changedLines = this.detectChangedLines(newText, cached.documentText);
        
        if (changedLines.size === 0) {
            logger.info(`🚀 No lines changed, using cached tokens`);
            return cached.tokens;
        }
        
        logger.info(`🚀 Detected ${changedLines.size} changed lines: ${Array.from(changedLines).join(', ')}`);
        
        // Expand to include dependencies
        const linesToRetokenize = this.expandToDependencies(changedLines, cached, document.lineCount);
        
        logger.info(`🚀 Re-tokenizing ${linesToRetokenize.size} lines (including dependencies)`);
        
        // If we need to re-tokenize more than 30% of the document, just do full tokenization
        if (linesToRetokenize.size / document.lineCount > 0.3) {
            logger.info(`🚀 Too many lines changed (${linesToRetokenize.size}/${document.lineCount}), doing full tokenization`);
            return null;
        }
        
        // Build text with only the lines we need to re-tokenize
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
        
        // Tokenize the subset
        const tokenizer = new ClarionTokenizer(linesToTokenize.join('\n'));
        const newTokens = tokenizer.tokenize();
        
        // Adjust line numbers in new tokens
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
        
        // Merge with cached tokens
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
        
        // Update cache
        const lineTokens = this.buildLineTokenMap(document, mergedTokens);
        this.cache.set(document.uri, {
            version: document.version,
            tokens: mergedTokens,
            lineTokens,
            documentText: newText
        });
        
        return mergedTokens;
    }
}