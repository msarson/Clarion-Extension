import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("CompletionProvider");
logger.setLevel("error");

export class CompletionProvider {
    
    /**
     * Provides completion items for Clarion language structures
     */
    public provideCompletionItems(
        document: TextDocument,
        position: { line: number; character: number }
    ): CompletionItem[] {
        // Check if we're on a blank line or at end of IF/LOOP/CASE line
        const currentLine = document.getText({
            start: { line: position.line, character: 0 },
            end: position
        });

        // Check previous line if current line is empty/whitespace
        const isPreviousLineCheck = /^\s*$/.test(currentLine) && position.line > 0;
        
        if (isPreviousLineCheck) {
            // Get previous line
            const prevLine = document.getText({
                start: { line: position.line - 1, character: 0 },
                end: { line: position.line, character: 0 }
            }).trimEnd();
            
            const indent = this.getIndentation(prevLine);
            
            // Check if previous line was IF
            const ifMatch = /^\s*IF\s+.+$/i.test(prevLine);
            if (ifMatch) {
                return this.createIfCompletions(indent, true);
            }

            // Check if previous line was LOOP
            const loopMatch = /^\s*LOOP\s*$/i.test(prevLine);
            if (loopMatch) {
                return this.createLoopCompletions(indent, true);
            }

            // Check if previous line was CASE
            const caseMatch = /^\s*CASE\s+.+$/i.test(prevLine);
            if (caseMatch) {
                return this.createCaseCompletions(indent, true);
            }
        } else {
            // On same line as IF/LOOP/CASE - traditional trigger
            const indent = this.getIndentation(currentLine);
            
            // Check if line starts with IF (case-insensitive)
            const ifMatch = /^\s*IF\s+\S/i.test(currentLine);
            if (ifMatch) {
                return this.createIfCompletions(indent, false);
            }

            // Check if line starts with LOOP (case-insensitive)
            const loopMatch = /^\s*LOOP\s*$/i.test(currentLine);
            if (loopMatch) {
                return this.createLoopCompletions(indent, false);
            }

            // Check if line starts with CASE (case-insensitive)
            const caseMatch = /^\s*CASE\s+\S/i.test(currentLine);
            if (caseMatch) {
                return this.createCaseCompletions(indent, false);
            }
        }

        return [];
    }

    /**
     * Get the indentation string from a line
     */
    private getIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    /**
     * Create IF structure completions
     * @param indent The indentation of the IF line
     * @param afterNewline True if cursor is on line after IF
     */
    private createIfCompletions(indent: string, afterNewline: boolean): CompletionItem[] {
        const items: CompletionItem[] = [];

        if (afterNewline) {
            // Cursor is already on next line, VS Code has handled indent
            // Just insert body placeholder + END/ELSE
            items.push({
                label: 'Complete IF structure',
                kind: CompletionItemKind.Snippet,
                detail: 'Add END terminator',
                documentation: 'Insert IF...END structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `$0\n${indent}END`,
                preselect: true
            });

            items.push({
                label: 'Complete IF...ELSE structure',
                kind: CompletionItemKind.Snippet,
                detail: 'Add ELSE and END',
                documentation: 'Insert IF...ELSE...END structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `$1\n${indent}ELSE\n$0\n${indent}END`
            });
        } else {
            // On same line as IF - add THEN + structure
            items.push({
                label: 'Add THEN + END',
                kind: CompletionItemKind.Snippet,
                detail: 'IF condition THEN\n  statements\nEND',
                documentation: 'Insert THEN keyword and END terminator',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: ` THEN$0\n${indent}END`
            });

            items.push({
                label: 'Add THEN + ELSE + END',
                kind: CompletionItemKind.Snippet,
                detail: 'IF condition THEN\n  statements\nELSE\n  statements\nEND',
                documentation: 'Insert THEN keyword with ELSE and END',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: ` THEN$1\n${indent}ELSE\n$0\n${indent}END`
            });
        }

        return items;
    }

    /**
     * Create LOOP structure completions
     * @param indent The indentation of the LOOP line  
     * @param afterNewline True if cursor is on line after LOOP
     */
    private createLoopCompletions(indent: string, afterNewline: boolean): CompletionItem[] {
        const items: CompletionItem[] = [];

        if (afterNewline) {
            // Cursor already on next line
            items.push({
                label: 'Complete LOOP with END',
                kind: CompletionItemKind.Snippet,
                detail: 'Add END terminator',
                documentation: 'Insert LOOP...END structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `$0\n${indent}END`,
                preselect: true
            });

            items.push({
                label: 'Complete LOOP with WHILE',
                kind: CompletionItemKind.Snippet,
                detail: 'Add WHILE condition',
                documentation: 'Insert LOOP...WHILE structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `$1\n${indent}WHILE $0`
            });

            items.push({
                label: 'Complete LOOP with UNTIL',
                kind: CompletionItemKind.Snippet,
                detail: 'Add UNTIL condition',
                documentation: 'Insert LOOP...UNTIL structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `$1\n${indent}UNTIL $0`
            });
        } else {
            // On same line - not typical for LOOP
            items.push({
                label: 'Add structure',
                kind: CompletionItemKind.Snippet,
                detail: 'Complete LOOP',
                documentation: 'Complete LOOP structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `$0\n${indent}END`
            });
        }

        return items;
    }

    /**
     * Create CASE structure completions
     * @param indent The indentation of the CASE line
     * @param afterNewline True if cursor is on line after CASE
     */
    private createCaseCompletions(indent: string, afterNewline: boolean): CompletionItem[] {
        const items: CompletionItem[] = [];

        if (afterNewline) {
            // Cursor already on next line
            items.push({
                label: 'Complete CASE with OF',
                kind: CompletionItemKind.Snippet,
                detail: 'Add OF clause',
                documentation: 'Insert CASE...OF...END structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `${indent}OF $1\n$0\n${indent}END`,
                preselect: true
            });

            items.push({
                label: 'Complete CASE with OF...ELSE',
                kind: CompletionItemKind.Snippet,
                detail: 'Add OF and ELSE clauses',
                documentation: 'Insert CASE...OF...ELSE...END structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `${indent}OF $1\n$2\n${indent}ELSE\n$0\n${indent}END`
            });
        } else {
            // On same line - not typical for CASE
            items.push({
                label: 'Add OF clause',
                kind: CompletionItemKind.Snippet,
                detail: 'Complete CASE',
                documentation: 'Complete CASE structure',
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: `\n${indent}OF $1\n$0\n${indent}END`
            });
        }

        return items;
    }
}
