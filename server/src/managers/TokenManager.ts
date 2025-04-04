import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("TokenManager");
logger.setLevel("error");

/**
 * Manages token caching and retrieval
 */
export class TokenManager {
    private tokenCache: TokenCache;
    private debounceTimeout: NodeJS.Timeout | null = null;
    private parsedDocuments = new Map<string, boolean>(); // Track parsed state per document

    constructor() {
        // Get the token cache instance
        this.tokenCache = TokenCache.getInstance();
    }

    /**
     * Get tokens for a document
     * @param document The document
     * @returns Array of tokens
     */
    public getTokens(document: TextDocument): Token[] {
        try {
            // Log document details for debugging
            logger.info(`🔍 [DEBUG] getTokens called for document: ${document.uri}`);
            logger.info(`🔍 [DEBUG] Document language ID: ${document.languageId}`);
            
            // Skip XML files to prevent crashes
            const fileExt = document.uri.toLowerCase();
            if (fileExt.endsWith('.xml') || fileExt.endsWith('.cwproj')) {
                logger.info(`⚠️ [DEBUG] Skipping tokenization for XML file: ${document.uri}`);
                return [];
            }
            
            // Log before getting tokens
            logger.info(`🔍 [DEBUG] Getting tokens from cache for: ${document.uri}`);
            const tokens = this.tokenCache.getTokens(document);
            logger.info(`🔍 [DEBUG] Successfully got ${tokens.length} tokens for: ${document.uri}`);
            return tokens;
        } catch (error) {
            logger.error(`❌ [DEBUG] Error in getTokens: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Clear tokens for a document
     * @param uri The document URI
     */
    public clearTokens(uri: string): void {
        try {
            this.tokenCache.clearTokens(uri);
        } catch (error) {
            logger.error(`❌ [DEBUG] Error clearing tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle document content changes
     * @param document The document
     */
    public handleDocumentChange(document: TextDocument): void {
        const uri = document.uri;

        // Clear tokens from cache
        logger.info(`🔍 [CRITICAL] Clearing tokens for changed document: ${uri}`);
        try {
            this.tokenCache.clearTokens(uri); // 🔥 Always clear immediately
            logger.info(`🔍 [CRITICAL] Successfully cleared tokens for document: ${uri}`);
        } catch (cacheError) {
            logger.error(`❌ [CRITICAL] Error clearing tokens: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        }

        // Set up debounced token refresh
        if (this.debounceTimeout) {
            logger.info(`🔍 [CRITICAL] Clearing existing debounce timeout for: ${uri}`);
            clearTimeout(this.debounceTimeout);
        }

        logger.info(`🔍 [CRITICAL] Setting up debounced token refresh for: ${uri}`);
        this.debounceTimeout = setTimeout(() => {
            try {
                logger.info(`🔍 [CRITICAL] Debounce timeout triggered, refreshing tokens for: ${uri}`);
                const tokens = this.getTokens(document); // ⬅️ refreshes the cache
                logger.info(`🔍 [CRITICAL] Successfully refreshed tokens after edit: ${uri}, got ${tokens.length} tokens`);
            } catch (tokenError) {
                logger.error(`❌ [CRITICAL] Error refreshing tokens in debounce: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
            }
        }, 300);
    }
}

// Singleton instance
let instance: TokenManager | undefined;

/**
 * Get the TokenManager instance
 * @returns The TokenManager instance
 */
export function getTokenManager(): TokenManager {
    if (!instance) {
        instance = new TokenManager();
    }
    return instance;
}