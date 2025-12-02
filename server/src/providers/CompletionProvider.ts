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
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: position
        });

        // Get the indentation of the current line (where IF/LOOP/CASE is)
        const indent = this.getIndentation(line);
        
        // Check if line starts with IF (case-insensitive)
        const ifMatch = /^\s*IF\s+\S/i.test(line);
        if (ifMatch) {
            return this.createIfCompletions(indent);
        }

        // Check if line starts with LOOP (case-insensitive)
        const loopMatch = /^\s*LOOP\s*$/i.test(line);
        if (loopMatch) {
            return this.createLoopCompletions(indent);
        }

        // Check if line starts with CASE (case-insensitive)
        const caseMatch = /^\s*CASE\s+\S/i.test(line);
        if (caseMatch) {
            return this.createCaseCompletions(indent);
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
     */
    private createIfCompletions(indent: string): CompletionItem[] {
        const items: CompletionItem[] = [];

        // IF...END (without THEN) - simple approach: just add body + END
        items.push({
            label: 'Complete IF structure (no THEN)',
            kind: CompletionItemKind.Snippet,
            detail: 'IF condition\n  statements\nEND',
            documentation: 'Insert IF structure without THEN keyword',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n\${0:statements}\n${indent}END`,
            preselect: true,
            command: {
                title: 'Trigger Suggest',
                command: 'editor.action.triggerSuggest'
            }
        });

        // IF...THEN...END
        items.push({
            label: 'Complete IF structure (with THEN)',
            kind: CompletionItemKind.Snippet,
            detail: 'IF condition THEN\n  statements\nEND',
            documentation: 'Insert IF structure with THEN keyword',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: ` THEN\n\${0:statements}\n${indent}END`
        });

        // IF...ELSE...END (without THEN)
        items.push({
            label: 'Complete IF...ELSE structure (no THEN)',
            kind: CompletionItemKind.Snippet,
            detail: 'IF condition\n  statements\nELSE\n  statements\nEND',
            documentation: 'Insert IF...ELSE structure without THEN keyword',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n\${1:statements}\n${indent}ELSE\n\${0:statements}\n${indent}END`
        });

        // IF...THEN...ELSE...END
        items.push({
            label: 'Complete IF...ELSE structure (with THEN)',
            kind: CompletionItemKind.Snippet,
            detail: 'IF condition THEN\n  statements\nELSE\n  statements\nEND',
            documentation: 'Insert IF...ELSE structure with THEN keyword',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: ` THEN\n\${1:statements}\n${indent}ELSE\n\${0:statements}\n${indent}END`
        });

        return items;
    }

    /**
     * Create LOOP structure completions
     */
    private createLoopCompletions(indent: string): CompletionItem[] {
        const items: CompletionItem[] = [];

        // LOOP...END
        items.push({
            label: 'Complete LOOP structure',
            kind: CompletionItemKind.Snippet,
            detail: 'LOOP\n  statements\nEND',
            documentation: 'Insert LOOP...END structure',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n\${0:statements}\n${indent}END`,
            preselect: true
        });

        // LOOP...WHILE
        items.push({
            label: 'Complete LOOP...WHILE structure',
            kind: CompletionItemKind.Snippet,
            detail: 'LOOP\n  statements\nWHILE condition',
            documentation: 'Insert LOOP with WHILE terminator',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n\${1:statements}\n${indent}WHILE \${0:condition}`
        });

        // LOOP...UNTIL
        items.push({
            label: 'Complete LOOP...UNTIL structure',
            kind: CompletionItemKind.Snippet,
            detail: 'LOOP\n  statements\nUNTIL condition',
            documentation: 'Insert LOOP with UNTIL terminator',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n\${1:statements}\n${indent}UNTIL \${0:condition}`
        });

        return items;
    }

    /**
     * Create CASE structure completions
     */
    private createCaseCompletions(indent: string): CompletionItem[] {
        const items: CompletionItem[] = [];

        // CASE...OF...END
        items.push({
            label: 'Complete CASE structure',
            kind: CompletionItemKind.Snippet,
            detail: 'CASE condition\nOF value\n  statements\nEND',
            documentation: 'Insert CASE...OF...END structure',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n${indent}OF \${1:value}\n\${0:statements}\n${indent}END`,
            preselect: true
        });

        // CASE...OF...ELSE...END
        items.push({
            label: 'Complete CASE...ELSE structure',
            kind: CompletionItemKind.Snippet,
            detail: 'CASE condition\nOF value\n  statements\nELSE\n  statements\nEND',
            documentation: 'Insert CASE...OF...ELSE...END structure',
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `\n${indent}OF \${1:value}\n\${2:statements}\n${indent}ELSE\n\${0:statements}\n${indent}END`
        });

        return items;
    }
}
