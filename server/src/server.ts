import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    Hover,
    HoverParams,
    MarkupKind
} from 'vscode-languageserver/node';

import {
    DocumentSymbol,
    DocumentSymbolParams,
    FoldingRange,
    FoldingRangeParams,
    InitializeParams
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';

const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();
let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Store folding ranges for hover lookups
const storedFoldingRanges: Map<string, FoldingRange[]> = new Map();

connection.onInitialize((params: InitializeParams) => {
    connection.onFoldingRanges((params: FoldingRangeParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        const foldingRanges = clarionFoldingProvider.provideFoldingRanges(document);
        storedFoldingRanges.set(params.textDocument.uri, foldingRanges);
        return foldingRanges;
    });

    connection.onDocumentSymbol((params: DocumentSymbolParams) => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];

        return clarionDocumentSymbolProvider.provideDocumentSymbols(document);
    });

    connection.onHover((params: HoverParams): Hover | null => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return null;

        const position = params.position;
        const foldingRanges = storedFoldingRanges.get(params.textDocument.uri) || [];

        // Check if the position is inside a folded range
        const range = foldingRanges.find(fr => fr.startLine <= position.line && fr.endLine >= position.line);
        if (!range) return null;

        // Extract folded content
        const foldedText = document.getText({
            start: { line: range.startLine, character: 0 },
            end: { line: range.endLine, character: Number.MAX_SAFE_INTEGER }
        });

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`clarion\n${foldedText}\n\`\`\``
            }
        };
    });

    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true,
            hoverProvider: true // ✅ Enables server-side hover for folded regions
        }
    };
});

connection.onInitialized(() => {
    // connection.window.showInformationMessage('Clarion Server Initialized');
});

documents.listen(connection);
connection.listen();
