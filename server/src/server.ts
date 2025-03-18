import {
    createConnection,
    TextDocuments,
    ProposedFeatures
} from 'vscode-languageserver/node';

import {
    DocumentFormattingParams,
    DocumentSymbol,
    DocumentSymbolParams,
    FoldingRange,
    FoldingRangeParams,
    InitializeParams,
    InitializeResult,
    TextEdit,
    Range,
    Position
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionTokenizer, Token } from './ClarionTokenizer';

import LoggerManager from './logger';
import ClarionFormatter from './ClarionFormatter';

import { LexEnum } from './LexEnum';
const logger = LoggerManager.getLogger("Server");
logger.setLevel("info");
// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
// ✅ Global Token Cache
const tokenCache = new Map<string, Token[]>();

export let globalClarionSettings: any = {};

// ✅ Token Cache for Performance



let debounceTimeout: NodeJS.Timeout | null = null;
/**
 * ✅ Retrieves cached tokens or tokenizes the document if not cached.
 */
const parsedDocuments = new Map<string, boolean>(); // Track parsed state per document

function getTokens(document: TextDocument): Token[] {
    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying tokenization for ${document.uri}`);
        return [];
    }

    logger.info(`🔍 Checking token cache for ${document.uri}`);

    // ✅ Always log tokenization results, even if cached
    if (tokenCache.has(document.uri)) {
        logger.info(`🟢 Using cached NEW tokenizer results for ${document.uri}`);

        // 🚀 Print cached tokens before returning

        return tokenCache.get(document.uri) || []; // Return standard tokenizer’s cached tokens
    }

    logger.info(`🟢 Running tokenizer for ${document.uri}`);



    // ✅ Run the standard tokenizer (ClarionTokenizer) and cache its results
    const tokenizer = new ClarionTokenizer(document.getText());
    const tokens = tokenizer.tokenize();
    tokenCache.set(document.uri, tokens);

    return tokens;
}



// ✅ Handle Folding Ranges (Uses Cached Tokens & Caches Results)
connection.onFoldingRanges((params: FoldingRangeParams) => {
    logger.info(`📂  Received onFoldingRanges request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying folding range request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh folding ranges for: ${document.uri}`);

    const tokens = getTokens(document);  // ✅ No need for async/wrapping in Promise.resolve
    return clarionFoldingProvider.provideFoldingRanges(tokens);
});


// ✅ Handle Content Changes (Recompute Tokens)
documents.onDidChangeContent(event => {
    if (debounceTimeout) clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(() => {
        const document = event.document;

        logger.info(`🔄 [CACHE REFRESH] Document changed: ${document.uri}, recomputing tokens...`);

        // ✅ Recompute tokens and cache the result
        getTokens(document);
    }, 300);
});

// ✅ Handle Document Formatting (Uses Cached Tokens & Caches Results)
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    logger.info(`📐 Received onDocumentFormatting request for: ${params.textDocument.uri}`) ;
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    try {
        // ✅ Use getTokens() instead of manually tokenizing
        const tokens = getTokens(document);

        const formatter = new ClarionFormatter(tokens, text, {
            formattingOptions: params.options
        });

        const formattedText = formatter.format();
        if (formattedText !== text) {
            return [TextEdit.replace(
                Range.create(Position.create(0, 0), Position.create(document.lineCount, 0)),
                formattedText
            )];
        }
        return [];
    } catch (error) {
        logger.error(`❌ Error formatting document: ${error}`);
        return [];
    }
});


connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    logger.info(`📂  Received onDocumentSymbol request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying document symbol request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh document symbols for: ${document.uri}`);
    tokenCache.delete(document.uri);
    const tokens = getTokens(document);  // ✅ No need for async
    return clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, document.uri);
});


// ✅ Handle Save (Ensure Cached Tokens Are Up-To-Date)
documents.onDidSave(event => {
    const document = event.document;

    logger.info(`💾 [SAVE] Document saved: ${document.uri}, ensuring tokens are fresh...`);

    // ✅ Refresh token cache after save
    getTokens(document);
});

// ✅ Clear Cache When Document Closes
// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    logger.info(`🗑️  [CACHE CLEAR] Removing cached data for ${event.document.uri}`);

    // ✅ Remove tokens from both caches to free memory
    tokenCache.delete(event.document.uri);
});

// ✅ Server Initialization
connection.onInitialize((params: InitializeParams): InitializeResult => {
    logger.info("⚡  Received onInitialize request from VS Code.");
    globalClarionSettings = params.initializationOptions || {};
    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: true
        }
    };
});

export let serverInitialized = false;

// ✅ Server Fully Initialized
connection.onInitialized(() => {
    logger.info("✅  Clarion Language Server fully initialized.");
    serverInitialized = true;
});

// ✅ Start Listening
documents.listen(connection);
connection.listen();

logger.info("🟢  Clarion Language Server is now listening for requests.");