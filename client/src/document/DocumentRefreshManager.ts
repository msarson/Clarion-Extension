import { globalSettings } from '../globals';
import { DocumentManager } from '../documentManager';
import { getAllOpenDocuments } from '../utils/ExtensionHelpers';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("DocumentRefreshManager");

/**
 * Refreshes all open documents by updating their document info in the document manager
 * @param documentManager - The document manager instance to use for updating
 */
export async function refreshOpenDocuments(documentManager: DocumentManager | undefined): Promise<void> {
    const startTime = performance.now();
    logger.info("🔄 Refreshing all open documents...");

    try {
        const defaultLookupExtensions = globalSettings.defaultLookupExtensions;
        logger.info(`🔍 Loaded defaultLookupExtensions: ${JSON.stringify(defaultLookupExtensions)}`);

        // ✅ Fetch ALL open documents using the updated method
        const docsStartTime = performance.now();
        const openDocuments = await getAllOpenDocuments();
        const docsEndTime = performance.now();
        logger.info(`✅ Retrieved ${openDocuments.length} open documents in ${(docsEndTime - docsStartTime).toFixed(2)}ms`);

        if (openDocuments.length === 0) {
            logger.warn("⚠️ No open documents found.");
            return;
        }

        // Process documents in parallel for better performance
        const updatePromises = openDocuments.map(async (document) => {
            try {
                const docStartTime = performance.now();
                // ✅ Ensure the document manager updates the links
                if (documentManager) {
                    await documentManager.updateDocumentInfo(document);
                }
                const docEndTime = performance.now();
                logger.debug(`✅ Updated document ${document.uri.fsPath} in ${(docEndTime - docStartTime).toFixed(2)}ms`);
            } catch (docError) {
                logger.error(`❌ Error updating document ${document.uri.fsPath}: ${docError instanceof Error ? docError.message : String(docError)}`);
            }
        });

        // Wait for all document updates to complete
        await Promise.all(updatePromises);

        const endTime = performance.now();
        logger.info(`✅ Successfully refreshed ${openDocuments.length} open documents in ${(endTime - startTime).toFixed(2)}ms`);
    } catch (error) {
        logger.error(`❌ Error in refreshOpenDocuments: ${error instanceof Error ? error.message : String(error)}`);
    }
}
