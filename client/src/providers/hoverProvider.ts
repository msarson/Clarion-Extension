import * as vscode from 'vscode';
import * as fs from 'fs';
import { DocumentManager } from '../documentManager'; // Adjust the import path based on your project structure
import { ClarionLocation } from '../UtilityClasses/LocationProvider'; // Make sure this import is correct
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
        if (location) {
            const hoverMessage = this.constructHoverMessage(location);

            return new vscode.Hover(hoverMessage);
        }

        return null;
    }

    private constructHoverMessage(location: ClarionLocation): vscode.MarkdownString {
        const linesToShow = 10;
        const fileContent = fs.readFileSync(location.fullFileName, 'utf8');

        const hoverMessage = new vscode.MarkdownString();
        if (location.statementType && location.linePosition) {
            hoverMessage.appendMarkdown(`   **${location.statementType}: ${location.fullFileName}**`);
        }
        if (location.statementType === "SECTION" && location.sectionLineLocation)  {
            hoverMessage.appendMarkdown(` - Section Line: ${location.sectionLineLocation.line + 1}`);
            hoverMessage.appendMarkdown(`\n\n`);
            const sectionStartLine = location.sectionLineLocation.line;
            const sectionContent = fileContent.split('\n').slice(sectionStartLine).join('\n');
            hoverMessage.appendCodeblock(sectionContent, 'clarion');
        } else {
            const firstFewLines = fileContent.split('\n').slice(0, linesToShow).join('\n');
            hoverMessage.appendMarkdown('\n\n');
            hoverMessage.appendCodeblock(firstFewLines, 'clarion');
        }


        return hoverMessage;
    }
}
