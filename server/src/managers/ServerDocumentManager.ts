import {
    TextDocuments,
    TextDocumentChangeEvent,
    TextDocumentWillSaveEvent,
    TextDocumentSaveReason
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { getTokenManager } from '../managers/TokenManager';

const logger = LoggerManager.getLogger("ServerDocumentManager");
logger.setLevel("error");

/**
 * Manages document-related operations
 */
export class ServerDocumentManager {
    private documents: TextDocuments<TextDocument>;

    constructor() {
        // Create the text documents manager
        this.documents = new TextDocuments(TextDocument);
        
        // Set up document event handlers
        this.setupDocumentHandlers();
    }

    /**
     * Get the documents instance
     * @returns The documents
     */
    public getDocuments(): TextDocuments<TextDocument> {
        return this.documents;
    }

    /**
     * Get a document by URI
     * @param uri The document URI
     * @returns The document or undefined if not found
     */
    public getDocument(uri: string): TextDocument | undefined {
        return this.documents.get(uri);
    }

    /**
     * Set up document event handlers
     */
    private setupDocumentHandlers(): void {
        // Handle document open
        this.documents.onDidOpen((event) => {
            try {
                const document = event.document;
                const uri = document.uri;
                
                // Log all document details
                logger.info(`📂 [CRITICAL] Document opened: ${uri}`);
                logger.info(`📂 [CRITICAL] Document details:
                    - URI: ${uri}
                    - Language ID: ${document.languageId}
                    - Version: ${document.version}
                    - Line Count: ${document.lineCount}
                    - Content Length: ${document.getText().length}
                    - First 100 chars: ${document.getText().substring(0, 100).replace(/\n/g, '\\n')}
                `);
                
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [CRITICAL] XML file detected: ${uri}`);
                    logger.info(`🔍 [CRITICAL] XML file content (first 200 chars): ${document.getText().substring(0, 200).replace(/\n/g, '\\n')}`);
                    
                    // Try to parse the XML to see if it's valid
                    try {
                        // Just check if it starts with XML declaration or a root element
                        const content = document.getText();
                        if (content.trim().startsWith('<?xml') || content.trim().startsWith('<')) {
                            logger.info(`🔍 [CRITICAL] File appears to be valid XML: ${uri}`);
                        } else {
                            logger.warn(`⚠️ [CRITICAL] File doesn't appear to be valid XML despite extension: ${uri}`);
                        }
                    } catch (xmlError) {
                        logger.error(`❌ [CRITICAL] Error checking XML content: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
                    }
                }
            } catch (error) {
                logger.error(`❌ [CRITICAL] Error in onDidOpen: ${error instanceof Error ? error.message : String(error)}`);
                logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
            }
        });

        // Handle document content changes
        this.documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
            try {
                const document = event.document;
                const uri = document.uri;
                
                // Log all document details
                logger.info(`📝 [CRITICAL] Document content changed: ${uri}`);
                logger.info(`📝 [CRITICAL] Document details:
                    - URI: ${uri}
                    - Language ID: ${document.languageId}
                    - Version: ${document.version}
                    - Line Count: ${document.lineCount}
                    - Content Length: ${document.getText().length}
                    - First 100 chars: ${document.getText().substring(0, 100).replace(/\n/g, '\\n')}
                `);
                
                // Skip XML files
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [CRITICAL] XML file content changed: ${uri}`);
                    logger.info(`🔍 [CRITICAL] XML file content (first 200 chars): ${document.getText().substring(0, 200).replace(/\n/g, '\\n')}`);
                    return;
                }

                // Get the token manager and handle token updates
                const tokenManager = getTokenManager();
                if (tokenManager) {
                    tokenManager.handleDocumentChange(document);
                }
            } catch (error) {
                logger.error(`❌ [CRITICAL] Error in onDidChangeContent: ${error instanceof Error ? error.message : String(error)}`);
                logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
            }
        });

        // Handle document save
        this.documents.onDidSave((event) => {
            try {
                const document = event.document;
                const uri = document.uri;
                
                // Log all document details
                logger.info(`💾 [CRITICAL] Document saved: ${uri}`);
                logger.info(`💾 [CRITICAL] Document details:
                    - URI: ${uri}
                    - Language ID: ${document.languageId}
                    - Version: ${document.version}
                    - Line Count: ${document.lineCount}
                    - Content Length: ${document.getText().length}
                    - First 100 chars: ${document.getText().substring(0, 100).replace(/\n/g, '\\n')}
                `);
                
                // Skip XML files
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [CRITICAL] XML file saved: ${uri}`);
                    logger.info(`🔍 [CRITICAL] XML file content (first 200 chars): ${document.getText().substring(0, 200).replace(/\n/g, '\\n')}`);
                    return;
                }
                
                // Ensure tokens are up-to-date
                logger.info(`🔍 [CRITICAL] Refreshing tokens for saved document: ${uri}`);
                try {
                    const tokenManager = getTokenManager();
                    if (tokenManager) {
                        const tokens = tokenManager.getTokens(document);
                        logger.info(`🔍 [CRITICAL] Successfully refreshed tokens for saved document: ${uri}, got ${tokens.length} tokens`);
                    }
                } catch (tokenError) {
                    logger.error(`❌ [CRITICAL] Error getting tokens for saved document: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
                }
            } catch (error) {
                logger.error(`❌ [CRITICAL] Error in onDidSave: ${error instanceof Error ? error.message : String(error)}`);
                logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
            }
        });

        // Handle document close
        this.documents.onDidClose((event) => {
            try {
                const document = event.document;
                const uri = document.uri;
                
                // Log all document details
                logger.info(`🗑️ [CRITICAL] Document closed: ${uri}`);
                logger.info(`🗑️ [CRITICAL] Document details:
                    - URI: ${uri}
                    - Language ID: ${document.languageId}
                    - Version: ${document.version}
                    - Line Count: ${document.lineCount}
                `);
                
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [CRITICAL] XML file closed: ${uri}`);
                }
                
                // Always clear tokens for any document type
                logger.info(`🔍 [CRITICAL] Clearing tokens for document: ${uri}`);
                try {
                    const tokenManager = getTokenManager();
                    if (tokenManager) {
                        tokenManager.clearTokens(uri);
                        logger.info(`🔍 [CRITICAL] Successfully cleared tokens for document: ${uri}`);
                    }
                } catch (cacheError) {
                    logger.error(`❌ [CRITICAL] Error clearing tokens: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
                }
            } catch (error) {
                logger.error(`❌ [CRITICAL] Error in onDidClose: ${error instanceof Error ? error.message : String(error)}`);
                logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
            }
        });
    }
}

// Singleton instance
let instance: ServerDocumentManager | undefined;

/**
 * Get the ServerDocumentManager instance
 * @returns The ServerDocumentManager instance
 */
export function getServerDocumentManager(): ServerDocumentManager {
    if (!instance) {
        instance = new ServerDocumentManager();
    }
    return instance;
}