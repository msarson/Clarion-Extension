import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink } from 'vscode';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure
import { Logger } from '../UtilityClasses/Logger';

export class ClarionDocumentLinkProvider implements DocumentLinkProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager; // Initialize the DocumentManager
    }

    provideDocumentLinks(document: TextDocument, _token: CancellationToken): ProviderResult<DocumentLink[]> {
        if (_token.isCancellationRequested) {
            return Promise.resolve([]); // If the user cancels, return an empty array.
        }

        Logger.info(`Generating links for: ${document.uri.fsPath}`); // Debugging log

        return Promise.resolve(this.documentManager.generateDocumentLinks(document.uri));
    }
}
