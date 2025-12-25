import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink, workspace } from 'vscode';
import { DocumentManager } from '../documentManager';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { globalSettings } from '../globals';

const logger = LoggerManager.getLogger("DocumentLinkProvider");
logger.setLevel("error");

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
        
        // Check if we already have document info and if the document has changed
        const normalizedUri = document.uri.toString().toLowerCase();
        const cacheStats = this.documentManager.getCacheStats();
        const hasDocumentInfo = this.documentManager.getDocumentInfo(document.uri) !== undefined;
        
        // Only update document info if it doesn't exist yet
        if (!hasDocumentInfo) {
            logger.info(`📄 No document info found, updating document info for: ${document.uri.fsPath}`);
            await this.documentManager.updateDocumentInfo(document);
        }
        
        // Get document links (METHOD links are not generated, only INCLUDE, MODULE, MEMBER, SECTION, LINK)
        const links = this.documentManager.generateDocumentLinks(document.uri);
        
        logger.info(`✅ Generated ${links.length} links for ${document.uri.fsPath}`);
        
        // Log details of all links for debugging
        links.forEach((link, index) => {
            logger.info(`🔍 Link ${index + 1}:`);
            logger.info(`  - Target: ${link.target?.fsPath || 'unknown'}`);
            logger.info(`  - Range: ${link.range.start.line}:${link.range.start.character}-${link.range.end.line}:${link.range.end.character}`);
            logger.info(`  - Tooltip: ${link.tooltip || 'none'}`);
        });
        
        return links;
    }
}
