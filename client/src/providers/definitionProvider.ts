import { DefinitionProvider, TextDocument, Position, CancellationToken, ProviderResult, Location, Uri, Definition, LocationLink } from 'vscode';
import { DocumentManager } from '../documentManager';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("DefinitionProvider");
logger.setLevel("info");

/**
 * Provides "Go to Definition" functionality for Clarion class methods and MAP procedures.
 * 
 * This provider works bidirectionally:
 * 
 * 1. FORWARD (Declaration → Implementation):
 *    - When on a MAP or CLASS declaration, jumps to the implementation
 *    - Uses DocumentManager to find cached declarations
 *    - Resolves implementation on-demand (lazy loading)
 * 
 * 2. REVERSE (Implementation → Declaration):
 *    - When on a PROCEDURE implementation, jumps back to MAP declaration
 *    - Searches for MAP block in the same file
 *    - Matches procedure name to find declaration
 * 
 * Note: This provider handles MAP procedures and CLASS methods.
 * Other symbol types (variables, parameters, etc.) are handled by the server-side DefinitionProvider.
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
        
        // First, check if we're on a PROCEDURE implementation line
        // If so, look for the MAP declaration (reverse direction: implementation → declaration)
        const implementationLocation = this.findMapDeclarationFromImplementation(document, position);
        if (implementationLocation) {
            return implementationLocation;
        }
        
        // Otherwise, find the link at the current position (forward direction: declaration → implementation)
        const location = this.documentManager.findLinkAtPosition(document.uri, position);
        if (!location) {
            logger.info(`No location found at position ${position.line}:${position.character} - deferring to server`);
            return undefined; // Return undefined to let server-side provider handle it
        }

        logger.info(`Found location at position: ${location.statementType} to ${location.fullFileName}`);
        
        // Only handle METHOD and MAPPROCEDURE type locations
        if (location.statementType !== "METHOD" && location.statementType !== "MAPPROCEDURE") {
            logger.info(`Location is not a method/procedure declaration (type: ${location.statementType}) - deferring to server`);
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
    
    /**
     * Check if we're on a PROCEDURE implementation and find its MAP declaration
     * This handles the reverse direction: from implementation back to declaration
     */
    private findMapDeclarationFromImplementation(document: TextDocument, position: Position): Location | null {
        const line = document.lineAt(position.line);
        const lineText = line.text;
        
        // Match: ProcName PROCEDURE(...) or Class.MethodName PROCEDURE(...)
        // Allow leading whitespace for indented implementations
        const procMatch = lineText.match(/^\s*([A-Za-z_][A-Za-z0-9_\.]*)\s+PROCEDURE/i);
        if (!procMatch) {
            return null; // Not on a PROCEDURE line
        }
        
        const fullName = procMatch[1];
        const simpleName = fullName.includes('.') ? fullName.split('.').pop()! : fullName;
        
        logger.info(`Detected PROCEDURE implementation: ${fullName} (simple: ${simpleName})`);
        
        // Search for MAP declaration
        const mapDeclaration = this.findMapDeclaration(document, simpleName);
        if (mapDeclaration) {
            logger.info(`Found MAP declaration for ${simpleName} at line ${mapDeclaration.line}`);
            return new Location(document.uri, mapDeclaration);
        }
        
        logger.info(`No MAP declaration found for ${simpleName}`);
        return null;
    }
    
    /**
     * Search for a MAP procedure declaration
     */
    private findMapDeclaration(document: TextDocument, procName: string): Position | null {
        const content = document.getText();
        const lines = content.split('\n');
        
        // Find MAP blocks
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            
            // Found a MAP block
            if (line === 'MAP') {
                logger.info(`Found MAP block at line ${i}`);
                
                // Search within MAP block for the procedure
                for (let j = i + 1; j < lines.length; j++) {
                    const mapLine = lines[j].trim();
                    
                    // End of MAP block
                    if (mapLine.toUpperCase() === 'END') {
                        logger.info(`End of MAP block at line ${j}`);
                        break;
                    }
                    
                    // Match procedure declaration: ProcName(...)
                    const declMatch = mapLine.match(/^([A-Za-z_][A-Za-z0-9_\.]*)\s*\(/i);
                    if (declMatch) {
                        const declName = declMatch[1];
                        const simpleDeclName = declName.includes('.') ? declName.split('.').pop()! : declName;
                        
                        if (simpleDeclName.toUpperCase() === procName.toUpperCase()) {
                            logger.info(`Found matching MAP declaration: ${declName} at line ${j}`);
                            return new Position(j, 0);
                        }
                    }
                }
            }
        }
        
        return null;
    }
}
