import {
    createConnection,
    TextDocuments,
    ProposedFeatures
} from 'vscode-languageserver/node';

import {
    DocumentSymbolParams,
    FoldingRangeParams,
    InitializeParams
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';

import logger from './logger';




/**
 * ✅ Clears the debug log at the start of the server.
 */


// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);



connection.onInitialize((params: InitializeParams) => {
    logger.info("Received onInitialize request from VS Code.");

    // ✅ Handle Folding Ranges
    connection.onFoldingRanges((params: FoldingRangeParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        logger.info(`Processing folding ranges for: ${params.textDocument.uri}`);
        return clarionFoldingProvider.provideFoldingRanges(document);
    });

    // ✅ Handle Document Symbols
    connection.onDocumentSymbol((params: DocumentSymbolParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        logger.debug(`Processing document symbols for: ${params.textDocument.uri}`);
        return clarionDocumentSymbolProvider.provideDocumentSymbols(document);
    });

    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true
        }
    };
});

// ✅ Initialize and Listen
connection.onInitialized(() => {
    logger.info("Clarion Language Server fully initialized.");
});

documents.listen(connection);
connection.listen();

logger.info("Clarion Language Server is now listening for requests.");
