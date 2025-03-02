import {
    createConnection,
    TextDocuments,
    ProposedFeatures
} from 'vscode-languageserver/node';

import {
    DocumentSymbol,
    DocumentSymbolParams,
    FoldingRange,
    FoldingRangeParams,
    InitializeParams,
    InitializeResult
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionTokenizer, Token } from './ClarionTokenizer';

import LoggerManager from './logger';
import { log } from 'console';
const logger = LoggerManager.getLogger("Server");
logger.setLevel("info");
// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// ✅ Token Cache for Performance



let debounceTimeout: NodeJS.Timeout | null = null;
/**
 * ✅ Retrieves cached tokens or tokenizes the document if not cached.
 */
function getTokens(document: TextDocument): Token[] {
    if (!serverInitialized) {
        logger.warn(`⚠️  [DELAY] Server not initialized yet, delaying tokenization for ${document.uri}`);
        return [];
    }

    logger.info(`🔍  Tokenizing fresh for ${document.uri}`);
    const tokenizer = new ClarionTokenizer(document.getText());
    return tokenizer.tokenize();
}

// ✅ Handle Folding Ranges (Uses Cached Tokens & Caches Results)
connection.onFoldingRanges((params: FoldingRangeParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.warn(`⚠️  [DELAY] Server not initialized yet, delaying folding range request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh folding ranges for: ${document.uri}`);
    const tokens = getTokens(document);
    return clarionFoldingProvider.provideFoldingRanges(tokens);
});




documents.onDidChangeContent(event => {
    if (debounceTimeout) clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(() => {
        const document = event.document;
        
        logger.info(`🔄 [CACHE REFRESH] Document changed: ${document.uri}, recomputing tokens...`);
        
        // 🔍 Recompute tokens (without caching)
        const tokens = getTokens(document);
    }, 300);
});




// ✅ Handle Document Symbols (Uses Cached Tokens & Caches Results)
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    logger.info(`📂  Received onDocumentSymbol request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.warn(`⚠️  [DELAY] Server not initialized yet, delaying document symbol request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh document symbols for: ${document.uri}`);
    const tokens = getTokens(document);
    return clarionDocumentSymbolProvider.provideDocumentSymbols(tokens);
});



// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    logger.info(`🗑️  [CACHE CLEAR] Removed cached data for ${event.document.uri}`);
});

// ✅ Server Initialization
connection.onInitialize((params: InitializeParams): InitializeResult => {
    logger.info("⚡  Received onInitialize request from VS Code.");
    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true
        }
    };
});

let serverInitialized = false;

// ✅ Server Fully Initialized
connection.onInitialized(() => {
    logger.info("✅  Clarion Language Server fully initialized.");
    serverInitialized = true;
});

// ✅ Start Listening
documents.listen(connection);
connection.listen();

logger.info("🟢  Clarion Language Server is now listening for requests.");