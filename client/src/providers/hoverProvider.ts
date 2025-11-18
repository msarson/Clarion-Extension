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

    private async constructHoverMessage(location: ClarionLocation): Promise<vscode.MarkdownString> {
        const linesToShow = 10;
        const hoverMessage = new vscode.MarkdownString();

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
                    const uri = vscode.Uri.file(location.fullFileName);
                    const commandUri = vscode.Uri.parse(`command:editor.action.goToImplementation`);
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
