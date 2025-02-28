import {
    createConnection,
    TextDocuments,
    ProposedFeatures
} from 'vscode-languageserver/node';

import {
    DocumentSymbolParams,
    FoldingRangeParams,
    InitializeParams,
    InitializeResult
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionTokenizer, Token } from './ClarionTokenizer';

import logger from './logger';

// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// ✅ Token Cache for Performance
const tokenCache: Map<string, Token[]> = new Map();

/**
 * ✅ Retrieves cached tokens or tokenizes the document if not cached.
 */
function getCachedTokens(document: TextDocument): Token[] {
    logger.warn(`🔍 [CACHE CHECK] Checking for cached tokens for ${document.uri} ${!tokenCache.has(document.uri)}`);
    if (!tokenCache.has(document.uri)) {
        logger.warn(`🔍 [CACHE MISS] Tokenizing ${document.uri}`);
        const tokenizer = new ClarionTokenizer(document.getText());
        const tokens = tokenizer.tokenize();
        tokenCache.set(document.uri, tokens);
    } else {
        logger.warn(`✅ [CACHE HIT] Using cached tokens for ${document.uri}`);
    }
    return tokenCache.get(document.uri)!;
}

// ✅ Handle Folding Ranges (Uses Cached Tokens)
connection.onFoldingRanges((params: FoldingRangeParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    logger.warn(`📂 Processing folding ranges for: ${params.textDocument.uri}`);

    const tokens = getCachedTokens(document);
    return clarionFoldingProvider.provideFoldingRanges(tokens);
});

// ✅ Handle Document Symbols (Uses Cached Tokens)
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    logger.warn(`📂 Processing document symbols for: ${params.textDocument.uri}`);

    const tokens = getCachedTokens(document);
    return clarionDocumentSymbolProvider.provideDocumentSymbols(tokens);
});

// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    tokenCache.delete(event.document.uri);
    logger.info(`🗑️ [CACHE CLEAR] Removed cached tokens for ${event.document.uri}`);
});

// ✅ Server Initialization
connection.onInitialize((params: InitializeParams): InitializeResult => {
    logger.info("⚡ Received onInitialize request from VS Code.");
    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true
        }
    };
});

// ✅ Server Fully Initialized
connection.onInitialized(() => {
    logger.info("✅ Clarion Language Server fully initialized.");
});

// ✅ Start Listening
documents.listen(connection);
connection.listen();

logger.info("🟢 Clarion Language Server is now listening for requests.");
