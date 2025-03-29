import * as vscode from 'vscode';
import * as fs from 'fs';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure
import { ClarionLocation } from './LocationProvider'; // Make sure this import is correct

export class ClarionHoverProvider implements vscode.HoverProvider {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    async provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.Hover | null> {
        if (_token.isCancellationRequested) {
            return null;
        }

        const location = this.documentManager.findLinkAtPosition(document.uri, position);
        if (!location) {
            return null;
        }

        const hoverMessage = await this.constructHoverMessage(location);
        return new vscode.Hover(hoverMessage);
    }

    private async constructHoverMessage(location: ClarionLocation): Promise<vscode.MarkdownString> {
        const linesToShow = 10;
        const hoverMessage = new vscode.MarkdownString();

        if (location.statementType && location.linePosition) {
            hoverMessage.appendMarkdown(`**${location.statementType}: ${location.fullFileName}**\n\n`);
        }

        try {
            const fileContent = await fs.promises.readFile(location.fullFileName, 'utf8');
            const fileLines = fileContent.split('\n');
            
            let startLine = 0;
            if (location.statementType === "SECTION" && location.sectionLineLocation) {
                hoverMessage.appendMarkdown(` - Section Line: ${location.sectionLineLocation.line + 1}\n\n`);
                startLine = location.sectionLineLocation.line;
            }

            const sectionContent = fileLines.slice(startLine, startLine + linesToShow).join('\n');
            hoverMessage.appendCodeblock(sectionContent, 'clarion');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            hoverMessage.appendMarkdown(`\n\n⚠️ *Error reading file: ${errorMessage}*`);
        }

        return hoverMessage;
    }
}
