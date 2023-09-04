import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink} from 'vscode';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure

export class ClarionDocumentLinkProvider implements DocumentLinkProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager; // Initialize the DocumentManager
    }

    provideDocumentLinks(document: TextDocument, _token: CancellationToken): ProviderResult<DocumentLink[]> {
        if (_token.isCancellationRequested) {
            // The user canceled the operation
            return Promise.resolve([]);
        }

        return this.documentManager.generateDocumentLinks(document.uri);
    }
}
