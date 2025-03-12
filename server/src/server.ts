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
    InitializeResult
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionTokenizer, Token } from './ClarionTokenizer';

import LoggerManager from './logger';
import ClarionFormatter from './ClarionFormatter';
const logger = LoggerManager.getLogger("Server");
 logger.setLevel("error");
// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);


export let globalClarionSettings: any = {};

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

// ✅ Handle Document Formatting (Uses Cached Tokens & Caches Results)
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.warn(`⚠️  [DELAY] Server not initialized yet, delaying formatting request for ${document.uri}`);
        return [];
    }

    logger.info(`📝  Formatting document: ${document.uri}`);

    // 🔍 Tokenize document
    const tokens = getTokens(document);

    // ✨ Format using the ClarionFormatter
    const formatter = new ClarionFormatter(tokens, document.getText());
    const formattedText = formatter.formatDocument();

    // 🚨 Debug: Log the differences between old and new text
    const originalText = document.getText();
    if (originalText === formattedText) {
        logger.warn(`⚠️ WARNING: No changes detected in formatting. VS Code might ignore the formatting request.`);
    } else {
        logger.info(`✅ Changes detected, applying formatting.`);
        
        // 🔍 Detailed character-by-character diff
        for (let i = 0; i < Math.max(originalText.length, formattedText.length); i++) {
            const originalChar = originalText.charCodeAt(i) || "EOF";
            const formattedChar = formattedText.charCodeAt(i) || "EOF";
    
            if (originalChar !== formattedChar) {
                logger.warn(`🔍 [Mismatch] Index ${i}: Original='${originalText[i] || "EOF"}' (${originalChar}), Formatted='${formattedText[i] || "EOF"}' (${formattedChar})`);
            }
        }
    }
    

    // Convert the formatted text to a TextEdit
    return [{
        range: {
            start: { line: 0, character: 0 },
            end: { line: document.lineCount - 1, character: document.getText().length }
        },
        newText: formattedText
    }];
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
    return clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, document.uri);
});



// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    logger.info(`🗑️  [CACHE CLEAR] Removed cached data for ${event.document.uri}`);
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