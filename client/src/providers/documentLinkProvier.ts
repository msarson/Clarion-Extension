import * as vscode from 'vscode';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure

export class ClarionDocumentLinkProvider implements vscode.DocumentLinkProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager; // Initialize the DocumentManager
    }

    provideDocumentLinks(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
        if (_token.isCancellationRequested) {
            // The user canceled the operation
            return Promise.resolve([]);
        }

        return this.documentManager.generateDocumentLinks(document.uri);
    //     const links: vscode.DocumentLink[] = [];
    //     const documentInfo = this.documentManager.getDocumentInfo(document.uri);
    //     if (documentInfo) {
    //         for (const location of documentInfo.statementLocations) {
    //             if (
    //                 (location.statementType === "INCLUDE" || location.statementType === "MODULE") &&
    //                 location.linePosition &&
    //                 location.linePositionEnd
    //             ) {
    //                 try {
    //                     let targetUri = vscode.Uri.file(location.fullFileName);
    //                     if (location.statementType === "INCLUDE" && location.sectionLineLocation) {
    //                         const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
    //                         targetUri = targetUri.with({ fragment: lineQueryParam });
    //                     }
    //                     const statementLink = new vscode.DocumentLink(
    //                         new vscode.Range(location.linePosition, location.linePositionEnd!), // Link range
    //                         targetUri
    //                     );
    //                     links.push(statementLink);
    //                 } catch (error) {
    //                     console.error('Error creating statement link:', error);
    //                 }
    //             }
    //         }
    //     }
    //     return links;
    // }
    }
}
