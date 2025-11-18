import * as vscode from 'vscode';
import * as fs from 'fs';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure
import { ClarionLocation } from './LocationProvider'; // Make sure this import is correct
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("HoverProvider");

/**
 * Provides hover information for Clarion code elements.
 *
 * This provider implements the lazy loading approach for method implementations:
 * - When a user hovers over a method declaration, it first gets the location from DocumentManager
 * - If the location is a method and its implementation hasn't been resolved yet, it calls
 *   resolveMethodImplementation to find the actual implementation on-demand
 * - This defers the expensive implementation lookup until it's actually needed
 * - Once resolved, the implementation details are cached to avoid repeated lookups
 */
export class ClarionHoverProvider implements vscode.HoverProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    async provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.Hover | null> {
        if (_token.isCancellationRequested) {
            return null;
        }

        logger.info(`Hover requested at position ${position.line}:${position.character} in ${document.uri.fsPath}`);
        
        // First, check if this is a label/routine reference (like in GOTO or DO statements)
        const labelInfo = this.detectLabelOrRoutineReference(document, position);
        if (labelInfo) {
            logger.info(`Detected label/routine reference: ${labelInfo.name}`);
            const labelLocation = await this.findLabelOrRoutine(document, labelInfo.name, position.line);
            if (labelLocation) {
                const hoverMessage = await this.constructLabelHoverMessage(document, labelLocation, labelInfo.name);
                return new vscode.Hover(hoverMessage);
            }
        }
        
        // Check if this is a method call (like self.SetLength(...))
        const methodCallInfo = this.detectMethodCall(document, position);
        if (methodCallInfo) {
            logger.info(`Detected method call to ${methodCallInfo.methodName} with ${methodCallInfo.paramCount} parameters`);
            const implementationLocation = await this.findMethodImplementationForCall(document, methodCallInfo.methodName, methodCallInfo.paramCount);
            if (implementationLocation) {
                // Create a ClarionLocation-like object for the method implementation
                const clarionLocation: ClarionLocation = {
                    fullFileName: implementationLocation.uri.fsPath,
                    statementType: "METHOD",
                    sectionLineLocation: implementationLocation.range.start,
                    linePosition: implementationLocation.range.start,
                    methodName: methodCallInfo.methodName,
                    implementationResolved: true
                };
                const hoverMessage = await this.constructHoverMessage(clarionLocation);
                return new vscode.Hover(hoverMessage);
            }
        }
        
        // If not a method call, proceed with existing logic for declarations
        let location = this.documentManager.findLinkAtPosition(document.uri, position);
        if (!location) {
            logger.info(`No location found at position ${position.line}:${position.character}`);
            return null;
        }

        logger.info(`Found location at position: ${location.statementType} to ${location.fullFileName}`);
        
        // For method declarations, lazily resolve the implementation when needed
        if (location.statementType === "METHOD" && !location.implementationResolved) {
            logger.info(`Lazily resolving method implementation for hover: ${location.className}.${location.methodName}`);
            location = await this.documentManager.resolveMethodImplementation(location);
        }
        
        const hoverMessage = await this.constructHoverMessage(location);
        return new vscode.Hover(hoverMessage);
    }

    /**
     * Detects if the cursor is on a method call
     */
    private detectMethodCall(document: vscode.TextDocument, position: vscode.Position): { methodName: string, paramCount: number } | null {
        const lineText = document.lineAt(position.line).text;
        const methodCallRegex = /(\w+)\.(\w+)\s*\((.*?)\)/gi;
        
        methodCallRegex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = methodCallRegex.exec(lineText)) !== null) {
            const callStart = match.index;
            const callEnd = match.index + match[0].length;
            
            if (position.character >= callStart && position.character <= callEnd) {
                const methodName = match[2];
                const paramList = match[3].trim();
                const paramCount = paramList === "" ? 0 : paramList.split(',').length;
                return { methodName, paramCount };
            }
        }
        return null;
    }

    /**
     * Finds the implementation of a method call in the current file
     */
    private async findMethodImplementationForCall(
        document: vscode.TextDocument,
        methodName: string,
        paramCount: number
    ): Promise<vscode.Location | null> {
        logger.info(`Finding implementation for method call ${methodName} with ${paramCount} parameters`);
        
        try {
            const content = document.getText();
            const implementationRegex = new RegExp(
                `(\\w+)\\.${methodName}\\s+(?:procedure|function)\\s*\\(([^)]*)\\)`,
                'gi'
            );
            
            let bestMatch: { line: number, distance: number } | null = null;
            let match: RegExpExecArray | null;
            
            while ((match = implementationRegex.exec(content)) !== null) {
                const params = match[2];
                const implementationParamCount = params.trim() === "" ? 0 : params.split(',').length;
                const matchPos = match.index;
                const lineNumber = content.substring(0, matchPos).split('\n').length - 1;
                const paramDistance = Math.abs(implementationParamCount - paramCount);
                
                if (paramDistance === 0) {
                    logger.info(`Found exact parameter count match at line ${lineNumber}`);
                    return new vscode.Location(
                        document.uri,
                        new vscode.Position(lineNumber, 0)
                    );
                }
                
                if (bestMatch === null || paramDistance < bestMatch.distance) {
                    bestMatch = { line: lineNumber, distance: paramDistance };
                }
            }
            
            if (bestMatch !== null) {
                logger.info(`Using closest parameter count match at line ${bestMatch.line}`);
                return new vscode.Location(
                    document.uri,
                    new vscode.Position(bestMatch.line, 0)
                );
            }
            
            return null;
        } catch (error) {
            logger.error(`Error finding method implementation: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Detects if the cursor is on a label or routine reference (e.g., in GOTO, DO, CYCLE statements)
     */
    private detectLabelOrRoutineReference(document: vscode.TextDocument, position: vscode.Position): { name: string } | null {
        const lineText = document.lineAt(position.line).text;
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return null;
        }
        
        const word = document.getText(wordRange);
        const beforeWord = lineText.substring(0, wordRange.start.character).trim().toUpperCase();
        
        // Check if this is after GOTO, DO, or CYCLE keywords
        if (beforeWord.endsWith('GOTO') || beforeWord.endsWith('DO') || beforeWord.endsWith('CYCLE')) {
            return { name: word };
        }
        
        return null;
    }

    /**
     * Finds a label or routine definition in the document
     */
    private async findLabelOrRoutine(document: vscode.TextDocument, name: string, currentLine: number): Promise<vscode.Location | null> {
        const content = document.getText();
        const lines = content.split('\n');
        
        // Search for labels at column 0
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if line starts at column 0 (no leading whitespace)
            if (line.length > 0 && line[0] !== ' ' && line[0] !== '\t') {
                // Extract the label name (everything before space or end of line)
                const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
                if (match && match[1].toUpperCase() === name.toUpperCase()) {
                    return new vscode.Location(
                        document.uri,
                        new vscode.Position(i, 0)
                    );
                }
            }
        }
        
        return null;
    }

    /**
     * Constructs a hover message for a label or routine
     */
    private async constructLabelHoverMessage(document: vscode.TextDocument, location: vscode.Location, labelName: string): Promise<vscode.MarkdownString> {
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.isTrusted = true;
        
        const lineNumber = location.range.start.line + 1;
        const commandUri = vscode.Uri.parse(`command:editor.action.goToLocations?${encodeURIComponent(JSON.stringify([
            document.uri.toString(),
            location.range.start,
            [],
            'goto'
        ]))}`);
        
        hoverMessage.appendMarkdown(`**Label/Routine: ${labelName}**\n\n`);
        hoverMessage.appendMarkdown(` - Line: [${lineNumber}](${commandUri} "Go to Label (F12)") *(Click or press F12 to navigate)*\n\n`);
        
        try {
            const content = document.getText();
            const lines = content.split('\n');
            const startLine = location.range.start.line;
            
            // Show up to 10 lines starting from the label
            const endLine = Math.min(lines.length, startLine + 10);
            const previewLines = lines.slice(startLine, endLine);
            
            hoverMessage.appendCodeblock(previewLines.join('\n'), 'clarion');
        } catch (error) {
            logger.error(`Error constructing label hover: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return hoverMessage;
    }

    private async constructHoverMessage(location: ClarionLocation): Promise<vscode.MarkdownString> {
        const linesToShow = 10;
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.isTrusted = true; // Enable command links in hover

        logger.info(`Constructing hover message for ${location.statementType} at ${location.fullFileName}`);

        if (location.statementType && location.linePosition) {
            // Case-insensitive comparison for statement types
            const statementType = location.statementType.toUpperCase();
            logger.info(`Statement type: ${statementType}`);
            
            if (statementType === "METHOD") {
                logger.info(`Showing method implementation from: ${location.fullFileName}`);
                hoverMessage.appendMarkdown(`**Method Implementation in: ${location.fullFileName}**\n\n`);
            } else {
                hoverMessage.appendMarkdown(`**${location.statementType}: ${location.fullFileName}**\n\n`);
            }
        }

        try {
            const fileContent = await fs.promises.readFile(location.fullFileName, 'utf8');
            const fileLines = fileContent.split('\n');
            
            let startLine = 0;
            if (location.sectionLineLocation) {
                // Case-insensitive comparison for statement types
                const statementType = (location.statementType || "").toUpperCase();
                if (statementType === "METHOD") {
                    const lineNumber = location.sectionLineLocation.line + 1;
                    const commandUri = vscode.Uri.parse(`command:clarion.goToMethodImplementation?${encodeURIComponent(JSON.stringify([location.fullFileName, location.sectionLineLocation.line, 0]))}`);
                    hoverMessage.appendMarkdown(` - Implementation Line: [${lineNumber}](${commandUri} "Go to Implementation (Ctrl+F12)") *(Click or press Ctrl+F12 to navigate)*\n\n`);
                } else if (statementType === "SECTION") {
                    hoverMessage.appendMarkdown(` - Section Line: ${location.sectionLineLocation.line + 1}\n\n`);
                }
                startLine = location.sectionLineLocation.line;
            }

            // For method implementations, show signature and first 15 lines of implementation
            // Case-insensitive comparison
            if ((location.statementType || "").toUpperCase() === "METHOD") {
                const maxLinesToShow = 15;
                let codeLineIndex = -1;
                let endLine = startLine + maxLinesToShow;
                
                logger.info(`Looking for method implementation starting at line ${startLine}`);
                
                // First, find the CODE statement
                for (let i = startLine; i < Math.min(fileLines.length, startLine + 30); i++) {
                    const trimmedLine = fileLines[i].trim().toUpperCase();
                    if (trimmedLine === 'CODE') {
                        codeLineIndex = i;
                        logger.info(`Found CODE statement at line ${i}`);
                        break;
                    }
                }
                
                // If we found CODE, show up to 15 lines after it
                if (codeLineIndex >= 0) {
                    endLine = Math.min(fileLines.length, codeLineIndex + 1 + maxLinesToShow);
                    
                    // Check for nested method/routine implementations and stop before them
                    for (let i = codeLineIndex + 1; i < endLine; i++) {
                        const trimmedLine = fileLines[i].trim().toUpperCase();
                        // Stop if we encounter another METHOD, ROUTINE, or PROCEDURE definition
                        if (trimmedLine.match(/^[A-Z_][A-Z0-9_]*\s+(PROCEDURE|ROUTINE|METHOD)/)) {
                            endLine = i;
                            logger.info(`Found nested method/routine at line ${i}, stopping before it`);
                            break;
                        }
                    }
                } else {
                    // If no CODE found, just show from start (fallback behavior)
                    endLine = Math.min(fileLines.length, startLine + maxLinesToShow);
                }
                
                const methodContent = fileLines.slice(startLine, endLine).join('\n');
                logger.info(`Showing method content (${endLine - startLine} lines)`);
                hoverMessage.appendCodeblock(methodContent, 'clarion');
            } else {
                // For other types, just show the standard number of lines
                const sectionContent = fileLines.slice(startLine, startLine + linesToShow).join('\n');
                hoverMessage.appendCodeblock(sectionContent, 'clarion');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            hoverMessage.appendMarkdown(`\n\n⚠️ *Error reading file: ${errorMessage}*`);
        }

        return hoverMessage;
    }
}
