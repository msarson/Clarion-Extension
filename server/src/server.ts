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

// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {

    // ✅ Handle Folding Ranges
    connection.onFoldingRanges((params: FoldingRangeParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        return clarionFoldingProvider.provideFoldingRanges(document);
    });

    // ✅ Handle Document Symbols
    connection.onDocumentSymbol((params: DocumentSymbolParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

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
    // connection.window.showInformationMessage('Clarion Server Initialized');
});

documents.listen(connection);
connection.listen();
