import * as vscode from 'vscode';
import * as fs from 'fs';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure
import { ClarionLocation } from './LocationProvider'; // Make sure this import is correct
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("HoverProvider");
logger.setLevel("info");

/**
 * Provides hover information for Clarion code elements (client-side).
 *
 * This provider handles non-semantic navigation hovers:
 * - File/include/module navigation (INCLUDE, MODULE, LINK statements)
 * - Routine/label references (e.g., in DO statements)
 *
 * Semantic symbol hovers (methods, procedures, variables, parameters) are deferred
 * to the server-side hover provider, which has complete semantic context (tokens,
 * DocumentStructure, finishesAt, method overload resolution, etc.).
 */
export class ClarionHoverProvider implements vscode.HoverProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    async provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.Hover | null | undefined> {
        if (_token.isCancellationRequested) {
            return null;
        }

        logger.info(`Hover requested at position ${position.line}:${position.character} in ${document.uri.fsPath}`);
        
        // First, check if this is a routine reference (in DO statements)
        const labelInfo = this.detectLabelOrRoutineReference(document, position);
        if (labelInfo) {
            logger.info(`Detected routine reference: ${labelInfo.name}`);
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
            
            // For method calls, defer to server hover which shows declaration info
            // Just return undefined so server handles it - server has the complete signature with return type
            logger.info(`Deferring method call hover to server for complete declaration info`);
            return undefined;
        }
        
        // Check if we're on a method/procedure declaration or implementation
        let location = this.documentManager.findLinkAtPosition(document.uri, position);
        if (!location) {
            logger.info(`No location found at position ${position.line}:${position.character} - deferring to server`);
            return undefined; // Let server handle variable/parameter hovers
        }

        logger.info(`Found location at position: ${location.statementType} to ${location.fullFileName}`);
        
        // CONSOLIDATION: Defer to server for all semantic symbols (method/procedure declarations)
        // Server has complete semantic context (tokens, DocumentStructure, finishesAt, etc.)
        if (location.statementType === "METHOD" || location.statementType === "MAPPROCEDURE") {
            logger.info(`Deferring ${location.statementType} hover to server (semantic symbol)`);
            return undefined;
        }
        
        // Only handle non-semantic navigation (INCLUDE, MODULE, etc.)
        const hoverMessage = await this.constructHoverMessage(location);
        return new vscode.Hover(hoverMessage);
    }

    /**
     * Detects if the cursor is on a method call (specifically on the method name, not parameters)
     */
    private detectMethodCall(document: vscode.TextDocument, position: vscode.Position): { methodName: string, paramCount: number } | null {
        const lineText = document.lineAt(position.line).text;
        const methodCallRegex = /(\w+)\.(\w+)\s*\((.*?)\)/gi;
        
        methodCallRegex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = methodCallRegex.exec(lineText)) !== null) {
            const methodName = match[2];
            const methodNameStart = match.index + match[1].length + 1; // +1 for the dot
            const methodNameEnd = methodNameStart + methodName.length;
            
            // Only trigger if cursor is specifically on the method name
            if (position.character >= methodNameStart && position.character <= methodNameEnd) {
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
     * Detects if the cursor is on a routine reference (in DO statements)
     */
    private detectLabelOrRoutineReference(document: vscode.TextDocument, position: vscode.Position): { name: string } | null {
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
     * Finds a routine definition in the document (labels at column 0)
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
     * Constructs a hover message for a routine
     */
    private async constructLabelHoverMessage(document: vscode.TextDocument, location: vscode.Location, labelName: string): Promise<vscode.MarkdownString> {
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.isTrusted = true;
        
        const lineNumber = location.range.start.line + 1;
        // Use the clarion.goToMethodImplementation command which takes filePath and line number
        const commandUri = vscode.Uri.parse(`command:clarion.goToMethodImplementation?${encodeURIComponent(JSON.stringify([
            document.uri.fsPath,
            location.range.start.line,
            0
        ]))}`);
        
        hoverMessage.appendMarkdown(`**Routine: ${labelName}**\n\n`);
        hoverMessage.appendMarkdown(` - Line: [${lineNumber}](${commandUri} "Go to Routine (F12)") *(Click or press F12 to navigate)*\n\n`);
        
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

    private async constructHoverMessage(location: ClarionLocation, declarationInfo?: { signature: string; file: string; line: number } | null): Promise<vscode.MarkdownString> {
        const linesToShow = 10;
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.isTrusted = true; // Enable command links in hover

        logger.info(`Constructing hover message for ${location.statementType} at ${location.fullFileName}`);

        if (location.statementType && location.linePosition) {
            // Case-insensitive comparison for statement types
            const statementType = location.statementType.toUpperCase();
            logger.info(`Statement type: ${statementType}`);
            
            if (statementType === "METHOD" || statementType === "MAPPROCEDURE") {
                const typeLabel = statementType === "MAPPROCEDURE" ? "Procedure" : "Method";
                logger.info(`Showing ${typeLabel.toLowerCase()} implementation from: ${location.fullFileName}`);
                
                // Show signature first if available
                if (declarationInfo) {
                    hoverMessage.appendMarkdown(`**${typeLabel} Signature:**\n\n`);
                    hoverMessage.appendCodeblock(declarationInfo.signature, 'clarion');
                    hoverMessage.appendMarkdown(`\n---\n\n`);
                }
                
                hoverMessage.appendMarkdown(`**Implementation in: ${location.fullFileName}**\n\n`);
            } else {
                hoverMessage.appendMarkdown(`**${location.statementType}: ${location.fullFileName}**\n\n`);
            }
        }

        try {
            // Try to get content from open editor first (for unsaved changes), fallback to disk
            let fileContent: string;
            const openDoc = vscode.workspace.textDocuments.find(doc =>
                doc.uri.toString().toLowerCase() === vscode.Uri.file(location.fullFileName).toString().toLowerCase()
            );
            
            if (openDoc) {
                logger.info(`Reading hover content from open editor: ${location.fullFileName}`);
                fileContent = openDoc.getText();
            } else {
                logger.info(`Reading hover content from disk: ${location.fullFileName}`);
                fileContent = await fs.promises.readFile(location.fullFileName, 'utf8');
            }
            
            const fileLines = fileContent.split('\n');
            
            // For method and MAP procedure declarations, check if implementation was resolved
            if ((location.statementType || "").toUpperCase() === "METHOD" || (location.statementType || "").toUpperCase() === "MAPPROCEDURE") {
                if (!location.sectionLineLocation) {
                    // Implementation not found - show message
                    hoverMessage.appendMarkdown(`\n\n⚠️ *Implementation not found*`);
                    return hoverMessage;
                }
            }
            
            let startLine = 0;
            if (location.sectionLineLocation) {
                // Case-insensitive comparison for statement types
                const statementType = (location.statementType || "").toUpperCase();
                if (statementType === "METHOD" || statementType === "MAPPROCEDURE") {
                    const lineNumber = location.sectionLineLocation.line + 1;
                    const commandUri = vscode.Uri.parse(`command:clarion.goToMethodImplementation?${encodeURIComponent(JSON.stringify([location.fullFileName, location.sectionLineLocation.line, 0]))}`);
                    hoverMessage.appendMarkdown(` - Implementation Line: [${lineNumber}](${commandUri} "Go to Implementation (Ctrl+F12)") *(Click or press Ctrl+F12 to navigate)*\n\n`);
                } else if (statementType === "SECTION") {
                    hoverMessage.appendMarkdown(` - Section Line: ${location.sectionLineLocation.line + 1}\n\n`);
                }
                startLine = location.sectionLineLocation.line;
            }

            // For method and procedure implementations, show signature and first 3 lines of implementation
            // Case-insensitive comparison
            if ((location.statementType || "").toUpperCase() === "METHOD" || (location.statementType || "").toUpperCase() === "MAPPROCEDURE") {
                const maxLinesToShow = 3;  // Reduced to 3 to show both client and server hover info
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
                        const line = fileLines[i];
                        const trimmedLine = line.trim().toUpperCase();
                        
                        // Stop if we encounter another PROCEDURE/ROUTINE implementation
                        // These start at column 0 or with minimal indentation (not inside the current procedure)
                        // Match: "MyProc PROCEDURE" or "Class.Method PROCEDURE" or "Label ROUTINE"
                        if (line.match(/^[A-Za-z_][A-Za-z0-9_.:]*\s+(PROCEDURE|ROUTINE)\b/i)) {
                            endLine = i;
                            logger.info(`Found another procedure/routine implementation at line ${i}, stopping before it`);
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
                // For other types (INCLUDE with SECTION, etc.), show lines until next SECTION
                let endLine = startLine + linesToShow;
                
                // Check if this is an INCLUDE with a section - if so, stop at the next SECTION
                const statementTypeUpper = (location.statementType || "").toUpperCase();
                if (statementTypeUpper === "INCLUDE" && location.sectionLineLocation) {
                    // We're showing an INCLUDE'd section, find where it ends
                    for (let i = startLine + 1; i < Math.min(fileLines.length, startLine + 100); i++) {
                        const trimmedLine = fileLines[i].trim().toUpperCase();
                        // Stop at next SECTION directive
                        if (trimmedLine.startsWith('SECTION(')) {
                            endLine = i;
                            logger.info(`Found next SECTION at line ${i}, stopping before it`);
                            break;
                        }
                    }
                    // Don't go beyond 30 lines even if no SECTION found
                    endLine = Math.min(endLine, startLine + 30);
                }
                
                const sectionContent = fileLines.slice(startLine, endLine).join('\n');
                hoverMessage.appendCodeblock(sectionContent, 'clarion');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            hoverMessage.appendMarkdown(`\n\n⚠️ *Error reading file: ${errorMessage}*`);
        }

        return hoverMessage;
    }
}
