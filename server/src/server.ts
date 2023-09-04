import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
} from 'vscode-languageserver/node';


import {
    DocumentSymbol,
    DocumentSymbolParams,
    FoldingRange,
    FoldingRangeParams
} from 'vscode-languageserver-protocol'

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
//import { ClarionDefinitionProvider } from './ClarionDefinitionProvider'; // Import your definition provider

const clarionFoldingProvider = new ClarionFoldingRangeProvider();
//const clarionDefinitionProvider = new ClarionDefinitionProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider;
let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize(params => {

    const settings = params.initializationOptions?.settings;
    connection.onFoldingRanges(params => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }

        return clarionFoldingProvider.provideFoldingRanges(document);
    }
    );

    connection.onDocumentSymbol(params => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }
        
    
        return clarionDocumentSymbolProvider.provideDocumentSymbols(document);
        
    }
    );

    
    // connection.onDefinition(params => {
    //     const document = documents.get(params.textDocument.uri);
    //     if (!document) {
    //         return null;
    //     }
    //     return clarionDefinitionProvider.handleDefinitionRequest(params, document);
    // });

    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true
            //,
            //definitionProvider: true // Enable your definition provider
        }
    };
});

connection.onInitialized(() => {
    // connection.window.showInformationMessage('Clarion Server Initialized');
});

documents.listen(connection);
connection.listen();
