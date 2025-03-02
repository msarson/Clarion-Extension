import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink } from 'vscode';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure
import LoggerManager from '../logger';
const logger = LoggerManager.getLogger("DocumentLinkProvider");


export class ClarionDocumentLinkProvider implements DocumentLinkProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager; // Initialize the DocumentManager
    }

    async provideDocumentLinks(document: TextDocument, _token: CancellationToken): Promise<DocumentLink[]> {
        if (_token.isCancellationRequested) {
            return []; // Return an empty array if the operation was cancelled
        }
    
        logger.info(`🔗 Generating links for document: ${document.uri.fsPath}`);
    
        return this.documentManager.generateDocumentLinks(document.uri);
    }
    
}
