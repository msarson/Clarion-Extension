import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from './ClarionTokenizer';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("TokenCache");
logger.setLevel("error");

/**
 * Cached token data structure
 */
interface CachedTokenData {
    version: number;
    tokens: Token[];
}

/**
 * TokenCache provides a centralized caching mechanism for document tokens
 * to avoid redundant tokenization operations across the extension.
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
            if (cached && cached.version === document.version) {
                logger.info(`🟢 Using cached tokens for ${document.uri} (version ${document.version})`);
                return cached.tokens;
            }

            logger.info(`🟢 Running tokenizer for ${document.uri} (version ${document.version})`);
            
            try {
                const tokenizer = new ClarionTokenizer(document.getText());
                const tokens = tokenizer.tokenize();
                this.cache.set(document.uri, { version: document.version, tokens });
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
}