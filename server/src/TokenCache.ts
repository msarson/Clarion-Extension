import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from './ClarionTokenizer';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("TokenCache");
logger.setLevel("info");

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
        const cached = this.cache.get(document.uri);
        if (cached && cached.version === document.version) {
            logger.info(`🟢 Using cached tokens for ${document.uri} (version ${document.version})`);
            return cached.tokens;
        }

        logger.info(`🟢 Running tokenizer for ${document.uri} (version ${document.version})`);
        const tokenizer = new ClarionTokenizer(document.getText());
        const tokens = tokenizer.tokenize();
        this.cache.set(document.uri, { version: document.version, tokens });
        return tokens;
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