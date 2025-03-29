import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink, workspace } from 'vscode';
import { DocumentManager } from '../documentManager';
import * as path from 'path';
import LoggerManager from '../logger';
import { globalSettings } from '../globals';

const logger = LoggerManager.getLogger("DocumentLinkProvider");

export class ClarionDocumentLinkProvider implements DocumentLinkProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    async provideDocumentLinks(document: TextDocument, _token: CancellationToken): Promise<DocumentLink[]> {
        if (_token.isCancellationRequested) {
            return [];
        }
        
        // Check if this is a Clarion file
        const fileExt = path.extname(document.uri.fsPath).toLowerCase();
        const lookupExtensions = globalSettings.defaultLookupExtensions;
        const isClarionFile = lookupExtensions.some(ext => ext.toLowerCase() === fileExt) ||
                              document.uri.fsPath.toLowerCase().endsWith('.clw');
        
        if (!isClarionFile) {
            logger.info(`⚠️ Skipping non-Clarion file: ${document.uri.fsPath}`);
            return [];
        }
        
        logger.info(`🔗 Generating links for document: ${document.uri.fsPath}`);
        
        // Ensure document info is updated before generating links
        await this.documentManager.updateDocumentInfo(document);
        
        const links = this.documentManager.generateDocumentLinks(document.uri);
        
        logger.info(`✅ Generated ${links.length} links for ${document.uri.fsPath}`);
        
        // Log a sample of the links for debugging
        if (links.length > 0) {
            const sample = links[0];
            logger.info(`🔍 Sample link: ${sample.target?.fsPath || 'unknown'}`);
        }
        
        return links;
    }
}
