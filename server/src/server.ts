import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
   // FoldingRange,
    
    
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

let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize(params => {
    
    connection.onFoldingRanges(params =>
        {
            return getFoldingRanges(params);
        }
    );

    connection.onDocumentSymbol(params =>
        {
            return getDocumentSymbols(params);
        }
    );

    return {
        capabilities: {
           foldingRangeProvider: true,
           documentSymbolProvider: true
        }
    };
});

connection.onInitialized(() => {
   // connection.window.showInformationMessage('Clarion Server Initialized');
});


function getFoldingRanges(params: FoldingRangeParams): FoldingRange[] {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    let clarionFolding: ClarionFoldingRangeProvider = new ClarionFoldingRangeProvider;
    
    return clarionFolding.provideFoldingRanges(document); 
}


function getDocumentSymbols(params: DocumentSymbolParams): DocumentSymbol[] {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    let clarionSymbol: ClarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider;
    
    return clarionSymbol.provideDocumentSymbols(document); 
}

documents.listen(connection);
connection.listen();
