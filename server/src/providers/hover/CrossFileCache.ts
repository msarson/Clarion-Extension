import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("CrossFileCache");
logger.setLevel("error");

export interface CachedDocument {
    document: TextDocument;
    tokens: Token[];
    lastModified: number;
}

/**
 * Caches cross-file reads to reduce redundant file I/O operations.
 * Tracks file modification times to invalidate stale cache entries.
 */
export class CrossFileCache {
    private documentCache: Map<string, CachedDocument> = new Map();
    private tokenCache: TokenCache;
    
    constructor(tokenCache: TokenCache) {
        this.tokenCache = tokenCache;
    }
    
    /**
     * Get or load a document from the cache.
     * Checks file modification time and invalidates stale entries.
     */
    async getOrLoadDocument(filePath: string): Promise<{ document: TextDocument; tokens: Token[] } | null> {
        const normalizedPath = path.normalize(filePath);
        
        // Check if file exists
        if (!fs.existsSync(normalizedPath)) {
            logger.warn(`File not found: ${normalizedPath}`);
            return null;
        }
        
        try {
            const stats = fs.statSync(normalizedPath);
            const currentMtime = stats.mtimeMs;
            
            // Check cache
            const cached = this.documentCache.get(normalizedPath);
            if (cached && cached.lastModified === currentMtime) {
                logger.info(`✅ Cache HIT for: ${path.basename(normalizedPath)} (${this.documentCache.size} entries cached)`);
                return {
                    document: cached.document,
                    tokens: cached.tokens
                };
            }
            
            // Cache miss or stale - read file
            logger.info(`❌ Cache MISS for: ${path.basename(normalizedPath)} (reading from disk)`);
            const fileContent = await fs.promises.readFile(normalizedPath, 'utf-8');
            const document = TextDocument.create(
                `file:///${normalizedPath.replace(/\\/g, '/')}`,
                'clarion',
                1,
                fileContent
            );
            const tokens = this.tokenCache.getTokens(document);
            
            // Store in cache
            this.documentCache.set(normalizedPath, {
                document,
                tokens,
                lastModified: currentMtime
            });
            logger.info(`📦 Cached document: ${path.basename(normalizedPath)} (cache size: ${this.documentCache.size})`);
            
            return { document, tokens };
        } catch (error) {
            logger.error(`Error loading document: ${normalizedPath}`, error);
            return null;
        }
    }
    
    /**
     * Invalidate a specific file from the cache
     */
    invalidate(filePath: string): void {
        const normalizedPath = path.normalize(filePath);
        const existed = this.documentCache.delete(normalizedPath);
        if (existed) {
            logger.info(`🗑️ Invalidated cache for: ${path.basename(normalizedPath)} (cache size: ${this.documentCache.size})`);
        }
    }
    
    /**
     * Clear the entire cache
     */
    clear(): void {
        this.documentCache.clear();
        logger.debug('Cache cleared');
    }
    
    /**
     * Get cache statistics
     */
    getStats(): { size: number; entries: string[] } {
        return {
            size: this.documentCache.size,
            entries: Array.from(this.documentCache.keys())
        };
    }
}
