import { ImplementationProvider, TextDocument, Position, CancellationToken, ProviderResult, Location, Uri, Definition, LocationLink } from 'vscode';
import { DocumentManager } from '../documentManager';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ImplementationProvider");
logger.setLevel("error");

/**
 * Provides "Go to Implementation" functionality for Clarion method declarations.
 * 
 * This provider leverages the lazy loading approach for method implementations:
 * - When a user triggers "Go to Implementation" on a method declaration, it gets the location from DocumentManager
 * - If the location is a method, it calls resolveMethodImplementation to find the actual implementation on-demand
 * - This defers the expensive implementation lookup until it's actually needed
 * - Once resolved, the implementation details are cached to avoid repeated lookups
 */
export class ClarionImplementationProvider implements ImplementationProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    /**
     * Finds the implementation of a method call in the current file
     *
     * @param document - The document containing the method call
     * @param methodName - The name of the method being called
     * @param paramCount - The number of parameters in the call
     * @returns The location of the implementation or null if not found
     */
    private async findMethodImplementationForCall(
        document: TextDocument,
        methodName: string,
        paramCount: number
    ): Promise<Definition | null> {
        logger.info(`Finding implementation for method call ${methodName} with ${paramCount} parameters`);
        
        try {
            const content = document.getText();
            const lines = content.split('\n');
            
            // Look for class implementations in the current file
            // Pattern: ClassName.MethodName PROCEDURE(param1, param2, ...)
            const implementationRegex = new RegExp(
                `(\\w+)\\.${methodName}\\s+(?:procedure|function)\\s*\\(([^)]*)\\)`,
                'gi'
            );
            
            let bestMatch: { line: number, distance: number } | null = null;
            let match: RegExpExecArray | null;
            
            while ((match = implementationRegex.exec(content)) !== null) {
                const className = match[1];
                const params = match[2];
                
                // Count parameters in the implementation
                const implementationParamCount = params.trim() === "" ? 0 : params.split(',').length;
                
                // Calculate line number
                const matchPos = match.index;
                const lineNumber = content.substring(0, matchPos).split('\n').length - 1;
                
                logger.info(`Found potential implementation: ${className}.${methodName} with ${implementationParamCount} parameters at line ${lineNumber}`);
                
                // Calculate how close this implementation's parameter count is to the call's parameter count
                const paramDistance = Math.abs(implementationParamCount - paramCount);
                
                // If this is an exact match, use it immediately
                if (paramDistance === 0) {
                    logger.info(`Found exact parameter count match at line ${lineNumber}`);
                    return new Location(
                        document.uri,
                        new Position(lineNumber, 0)
                    );
                }
                
                // Otherwise, keep track of the closest match
                if (bestMatch === null || paramDistance < bestMatch.distance) {
                    bestMatch = { line: lineNumber, distance: paramDistance };
                }
            }
            
            // If we found a close match, use it
            if (bestMatch !== null) {
                logger.info(`Using closest parameter count match at line ${bestMatch.line} (distance: ${bestMatch.distance})`);
                return new Location(
                    document.uri,
                    new Position(bestMatch.line, 0)
                );
            }
            
            logger.info(`No implementation found for ${methodName} with ${paramCount} parameters`);
            return null;
        } catch (error) {
            logger.error(`Error finding method implementation: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Counts the number of parameters in a method call
     *
     * @param document - The document containing the method call
     * @param position - The position of the cursor
     * @returns The number of parameters or null if not a method call
     */
    private countMethodCallParameters(document: TextDocument, position: Position): { methodName: string, paramCount: number } | null {
        // Get the line text
        const lineText = document.lineAt(position.line).text;
        
        // Look for a method call pattern like SELF.SomeMethod(param1, param2)
        // This regex captures the method name and the parameter list
        const methodCallRegex = /(\w+)\.(\w+)\s*\((.*?)\)/gi;
        
        // Reset the regex to start from the beginning
        methodCallRegex.lastIndex = 0;
        
        let match: RegExpExecArray | null;
        while ((match = methodCallRegex.exec(lineText)) !== null) {
            // Check if the cursor position is within this method call
            const callStart = match.index;
            const callEnd = match.index + match[0].length;
            
            if (position.character >= callStart && position.character <= callEnd) {
                const objectName = match[1];
                const methodName = match[2];
                const paramList = match[3].trim();
                
                // Count parameters by splitting by commas, but handle empty parameter list
                const paramCount = paramList === "" ? 0 : paramList.split(',').length;
                
                logger.info(`Found method call: ${objectName}.${methodName} with ${paramCount} parameters`);
                return { methodName, paramCount };
            }
        }
        
        return null;
    }

    provideImplementation(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): ProviderResult<Definition | LocationLink[]> {
        return this._provideImplementation(document, position, token);
    }

    private async _provideImplementation(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<Definition | null> {
        if (token.isCancellationRequested) {
            return null;
        }

        logger.info(`Implementation requested at position ${position.line}:${position.character} in ${document.uri.fsPath}`);
        
        // First, check if this is a method call
        const methodCall = this.countMethodCallParameters(document, position);
        if (methodCall) {
            logger.info(`Detected method call to ${methodCall.methodName} with ${methodCall.paramCount} parameters`);
            
            // Find the implementation of the method call
            return this.findMethodImplementationForCall(document, methodCall.methodName, methodCall.paramCount);
        }
        
        // If not a method call, proceed with the existing logic for method declarations
        const location = this.documentManager.findLinkAtPosition(document.uri, position);
        if (!location) {
            logger.info(`No location found at position ${position.line}:${position.character}`);
            return null;
        }

        logger.info(`Found location at position: ${location.statementType} to ${location.fullFileName}`);
        
        // Only handle METHOD type locations
        if (location.statementType !== "METHOD") {
            logger.info(`Location is not a method declaration (type: ${location.statementType})`);
            return null;
        }
        
        try {
            // Resolve the method implementation
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
            logger.error(`Error resolving implementation: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}