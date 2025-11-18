import { DefinitionProvider, TextDocument, Position, CancellationToken, ProviderResult, Location, Uri, Definition, LocationLink } from 'vscode';
import { DocumentManager } from '../documentManager';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("DefinitionProvider");
logger.setLevel("error");

/**
 * Provides "Go to Definition" functionality for Clarion class methods.
 * 
 * This provider leverages the same lazy loading approach as the ImplementationProvider:
 * - When a user triggers "Go to Definition" on a method declaration, it gets the location from DocumentManager
 * - If the location is a method, it calls resolveMethodImplementation to find the actual implementation on-demand
 * - This defers the expensive implementation lookup until it's actually needed
 * - Once resolved, the implementation details are cached to avoid repeated lookups
 * 
 * Note: This provider only handles class methods, not other Clarion symbols.
 * Other symbol types are handled by the server-side DefinitionProvider.
 */
export class ClarionDefinitionProvider implements DefinitionProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    provideDefinition(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): ProviderResult<Definition | LocationLink[]> {
        return this._provideDefinition(document, position, token);
    }

    private async _provideDefinition(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<Definition | null | undefined> {
        if (token.isCancellationRequested) {
            return undefined;
        }

        logger.info(`Definition requested at position ${position.line}:${position.character} in ${document.uri.fsPath}`);
        
        // Find the link at the current position
        const location = this.documentManager.findLinkAtPosition(document.uri, position);
        if (!location) {
            logger.info(`No location found at position ${position.line}:${position.character} - deferring to server`);
            return undefined; // Return undefined to let server-side provider handle it
        }

        logger.info(`Found location at position: ${location.statementType} to ${location.fullFileName}`);
        
        // Only handle METHOD type locations
        if (location.statementType !== "METHOD") {
            logger.info(`Location is not a method declaration (type: ${location.statementType}) - deferring to server`);
            return undefined; // Return undefined to let server-side provider handle it
        }
        
        try {
            // Resolve the method implementation using the same logic as ImplementationProvider
            const resolvedLocation = await this.documentManager.resolveMethodImplementation(location);
            
            // Check if we successfully resolved the implementation
            if (!resolvedLocation.sectionLineLocation) {
                logger.info(`Could not resolve implementation for ${resolvedLocation.className}.${resolvedLocation.methodName}`);
                return null;
            }
            
            logger.info(`Resolved implementation for ${resolvedLocation.className}.${resolvedLocation.methodName} at ${resolvedLocation.fullFileName}:${resolvedLocation.sectionLineLocation.line}`);
            
            // Create a Location object for the implementation
            return new Location(
                Uri.file(resolvedLocation.fullFileName),
                resolvedLocation.sectionLineLocation
            );
        } catch (error) {
            logger.error(`Error resolving definition: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
