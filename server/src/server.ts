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

import * as fs from 'fs';
import * as path from 'path';

// ✅ Define Log File Path (stored in extension's server directory)
const logFilePath = path.join(__dirname, 'server-debug.log');

/**
 * ✅ Clears the debug log at the start of the server.
 */
function clearLogFile() {
    try {
        fs.writeFileSync(logFilePath, '');
    } catch (error) {
        console.error(`Error clearing log file: ${error}`);
    }
}

/**
 * ✅ Logs messages to both the file and the VS Code Debug Console.
 */
function logMessage(message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;

    // ✅ Write to file
    fs.appendFileSync(logFilePath, formattedMessage);

    // ✅ Send to VS Code Debug Console
    connection.console.log(`[Server] ${message}`);
}

// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider(logMessage);
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// ✅ Clear the log file at server startup
clearLogFile();
logMessage("Clarion Language Server Initialized.");

connection.onInitialize((params: InitializeParams) => {
    logMessage("Received onInitialize request from VS Code.");

    // ✅ Handle Folding Ranges
    connection.onFoldingRanges((params: FoldingRangeParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        logMessage(`Processing folding ranges for: ${params.textDocument.uri}`);
        return clarionFoldingProvider.provideFoldingRanges(document);
    });

    // ✅ Handle Document Symbols
    connection.onDocumentSymbol((params: DocumentSymbolParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        logMessage(`Processing document symbols for: ${params.textDocument.uri}`);
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
    logMessage("Clarion Language Server fully initialized.");
});

documents.listen(connection);
connection.listen();

logMessage("Clarion Language Server is now listening for requests.");
