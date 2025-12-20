import { ImplementationProvider, TextDocument, Position, CancellationToken, ProviderResult, Location, Uri, Definition, LocationLink } from 'vscode';
import { DocumentManager } from '../documentManager';
import LoggerManager from '../LoggerManager';
import { isInsideMapBlock } from '../../../common/clarionUtils';

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
        logger.info('ClarionImplementationProvider.provideImplementation called');
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
        
        // First, check if this is a routine reference (in DO statements)
        const routineInfo = this.detectRoutineReference(document, position);
        if (routineInfo) {
            logger.info(`Detected routine reference to ${routineInfo.name}`);
            return this.findRoutineImplementation(document, routineInfo.name);
        }
        
        // Check if this is a method call
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

        logger.info(`Found location at position: ${location.statementType} - className="${location.className || 'none'}", methodName="${location.methodName || 'none'}"`);
        logger.info(`  File: ${location.fullFileName}`);
        
        // Handle both METHOD (class methods) and MAPPROCEDURE (MAP procedure declarations)
        if (location.statementType !== "METHOD" && location.statementType !== "MAPPROCEDURE") {
            logger.info(`Location is not a method or MAP procedure declaration (type: ${location.statementType}), returning null`);
            return null;
        }
        
        try {
            // For MAP procedures, find the implementation in the same file
            if (location.statementType === "MAPPROCEDURE") {
                logger.info(`Searching for MAP procedure implementation: ${location.methodName}`);
                return this.findMapProcedureImplementation(document, location.methodName || '');
            }
            
            // For class methods, resolve the method implementation
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

    /**
     * Detects if the cursor is on a routine reference (in DO statements)
     */
    private detectRoutineReference(document: TextDocument, position: Position): { name: string } | null {
        const lineText = document.lineAt(position.line).text;
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return null;
        }
        
        const word = document.getText(wordRange);
        const beforeWord = lineText.substring(0, wordRange.start.character).trim().toUpperCase();
        
        // Check if this is after DO keyword
        if (beforeWord.endsWith('DO')) {
            return { name: word };
        }
        
        return null;
    }

    /**
     * Finds a routine implementation in the document (labels at column 0 followed by ROUTINE)
     */
    private findRoutineImplementation(document: TextDocument, name: string): Location | null {
        const content = document.getText();
        const lines = content.split('\n');
        
        // Search for routine at column 0
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if line starts at column 0 (no leading whitespace)
            if (line.length > 0 && line[0] !== ' ' && line[0] !== '\t') {
                // Extract the label name (everything before space or end of line)
                const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+ROUTINE/i);
                if (match && match[1].toUpperCase() === name.toUpperCase()) {
                    return new Location(
                        document.uri,
                        new Position(i, 0)
                    );
                }
            }
        }
        
        return null;
    }

    /**
     * Finds a MAP procedure implementation in the document
     * MAP procedures are implemented at column 0 with PROCEDURE keyword
     * Skips MAP...END blocks which contain forward declarations, not implementations
     */
    private findMapProcedureImplementation(document: TextDocument, procName: string): Location | null {
        const content = document.getText();
        const lines = content.split('\n');
        
        logger.info(`Searching for MAP procedure implementation: ${procName}`);
        
        // Strip class prefix if present (e.g., "WindowPreview.TextLineCount" -> "TextLineCount")
        // MAP declarations may include class prefix, but implementations do not
        const simpleProcName = procName.includes('.') ? procName.split('.').pop()! : procName;
        logger.info(`Searching for implementation (simple name): ${simpleProcName}`);
        
        // Search for procedure implementation
        // Implementations can have leading whitespace
        let currentPosition = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip empty lines
            if (line.trim().length === 0) {
                currentPosition += line.length + 1; // +1 for newline
                continue;
            }
            
            // Match: ProcName PROCEDURE or ProcName.MethodName PROCEDURE
            // Allow leading whitespace for indented implementations
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_\.]*)\s+PROCEDURE/i);
            if (match) {
                const foundName = match[1];
                const simpleFoundName = foundName.includes('.') ? foundName.split('.').pop()! : foundName;
                
                // Check if this is inside a MAP block (forward declaration)
                if (isInsideMapBlock(content, currentPosition)) {
                    logger.info(`Found PROCEDURE at line ${i}: ${foundName} (simple: ${simpleFoundName}) - SKIPPING (inside MAP block)`);
                    currentPosition += line.length + 1;
                    continue;
                }
                
                logger.info(`Found PROCEDURE at line ${i}: ${foundName} (simple: ${simpleFoundName})`);
                
                // Case-insensitive comparison using simple names (without class prefix)
                if (simpleFoundName.toUpperCase() === simpleProcName.toUpperCase()) {
                    logger.info(`✅ Match found for ${procName} at line ${i}`);
                    return new Location(
                        document.uri,
                        new Position(i, 0)
                    );
                }
            }
            
            currentPosition += line.length + 1; // +1 for newline
        }
        
        logger.info(`❌ No implementation found for MAP procedure ${procName}`);
        return null;
    }
}