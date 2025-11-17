import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink, workspace } from 'vscode';
import { DocumentManager } from '../documentManager';
import * as path from 'path';
import LoggerManager from '../logger';
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
        
        // Try to get links from cache or generate new ones
        let links = this.documentManager.generateDocumentLinks(document.uri);
        
        // Filter out METHOD links since they will be handled by the implementation provider
        links = links.filter(link => {
            // Get the position in the document for this link
            const position = link.range.start;
            
            // Find the location at this position to check its metadata
            const location = this.documentManager.findLinkAtPosition(document.uri, position);
            
            // If this is a METHOD type location, filter it out
            if (location && location.statementType === "METHOD") {
                const methodName = location.className && location.methodName
                    ? `${location.className}.${location.methodName}`
                    : "unknown method";
                
                logger.info(`Filtering out method link: ${methodName} -> will be handled by implementation provider`);
                return false;
            }
            
            // Keep all other link types (INCLUDE, MODULE, MEMBER, SECTION, LINK)
            return true;
        });
        
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
