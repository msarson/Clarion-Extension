import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';

enum ClarionSymbolKind {
    Root = SymbolKind.Module,
    Procedure = SymbolKind.Method,
    Routine = SymbolKind.Property,
    Variable = SymbolKind.Variable
}

/**
 * Provides document symbols for Clarion files.
 */
export class ClarionDocumentSymbolProvider {

    // Capitalize
    private format(cmd: string): string {
        return cmd.slice(1).toLowerCase().replace(/^\w/, c => c.toUpperCase())
    }


    /**
     * Returns a Range object that covers the specified lines in the given TextDocument.
     * @param document The TextDocument to get the range from.
     * @param startLineNum The line number to start the range from.
     * @param endLineNum The line number to end the range at. If not provided, the range will only cover the startLineNum.
     * @returns A Range object that covers the specified lines in the given TextDocument.
     */
    private getLineRange(document: TextDocument, startLineNum: number, endLineNum?: number): Range {
        if (!endLineNum) { endLineNum = startLineNum }
        let lastLineText = document.getText(Range.create(endLineNum, 0, endLineNum + 1, 0))  // the text may contains 'CRLF'
        return Range.create(startLineNum, 0, endLineNum, lastLineText.length) // the lastLineText may overhead by containing 'CRLF', but it is still okay if the Range definition is slightly larger than actual text
    }

    // based on Clarion6. Feel free to update the code with new Clarion versions
    /**
     * Provides an array of DocumentSymbol for the given TextDocument.
     * @param document The TextDocument to provide DocumentSymbols for.
     * @returns An array of DocumentSymbol.
     */
    public provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];
        const nodes: DocumentSymbol[][] = [symbols];

        let insideRoot = false;
        let insideProcedure = false;
        let insideRoutine = false;
        let insideVariable = 0;

        for (let i = 0; i < document.lineCount; i++) {
            const currentLineRange = this.getLineRange(document, i);
            const line = document.getText(currentLineRange).replace(/[\r\n]+/g, '');
            const trimmedLine = line.trimStart();

            if (!line || trimmedLine.startsWith('!')) {
                continue;
            }

            // Process root if not already done.
            if (!insideRoot) {
                const { found, symbol: rootSymbol } = this.tryCreateRootSymbol(trimmedLine, currentLineRange, document, i);
                if (found && rootSymbol) {
                    nodes[nodes.length - 1].push(rootSymbol);
                    nodes.push(rootSymbol.children!);
                    insideRoot = true;
                }
            }

            // Process variable block ending.
            if (insideVariable > 0) {
                if (
                    line.startsWith(' ') &&
                    (trimmedLine.startsWith('.') || trimmedLine.toLowerCase().startsWith('end'))
                ) {
                    insideVariable--;
                }
                if (insideVariable === 0) {
                    this.updateLastSymbolRange(nodes, document, currentLineRange.start.line);
                }
            }

            // Process declarations: Procedure, Routine or Variable.
            if (!line.startsWith(' ') && !trimmedLine.startsWith('!') && !trimmedLine.startsWith('?')) {
                const tokens = line.split(/\s+/);
                if (tokens.length >= 2) {
                    const name = tokens[0];
                    const type = tokens[1].toLowerCase();

                    if (type.startsWith('procedure')) {
                        // Seal any ongoing routine or procedure.
                        if (insideRoutine) {
                            nodes.pop();
                            insideRoutine = false;
                            this.updateLastSymbolRange(nodes, document, currentLineRange.start.line);
                        }
                        if (insideProcedure) {
                            nodes.pop();
                            insideProcedure = false;
                            this.updateLastSymbolRange(nodes, document, currentLineRange.start.line);
                        }

                        const procSymbol = DocumentSymbol.create(
                            name,
                            '',
                            ClarionSymbolKind.Procedure as SymbolKind,
                            currentLineRange,
                            currentLineRange,
                            []
                        );
                        nodes[nodes.length - 1].push(procSymbol);
                        nodes.push(procSymbol.children!);
                        insideProcedure = true;
                    } else if (type.startsWith('routine')) {
                        if (insideRoutine) {
                            nodes.pop();
                            insideRoutine = false;
                            this.updateLastSymbolRange(nodes, document, currentLineRange.start.line);
                        }
                        const routSymbol = DocumentSymbol.create(
                            name,
                            '',
                            ClarionSymbolKind.Routine as SymbolKind,
                            currentLineRange,
                            currentLineRange,
                            []
                        );
                        nodes[nodes.length - 1].push(routSymbol);
                        nodes.push(routSymbol.children!);
                        insideRoutine = true;
                    } else {
                        // Treat any other as VARIABLE.
                        // For VARIABLE, update when a block is ending.
                        if (insideVariable === 0) {
                            const varSymbol = DocumentSymbol.create(
                                name,
                                '',
                                ClarionSymbolKind.Variable as SymbolKind,
                                currentLineRange,
                                currentLineRange,
                                []
                            );
                            nodes[nodes.length - 1].push(varSymbol);
                        }
                    }
                }
            }
        }

        return symbols;
    }

    private tryCreateRootSymbol(
        trimmedLine: string,
        currentLineRange: Range,
        document: TextDocument,
        currentLineNum: number
    ): { found: boolean; symbol?: DocumentSymbol } {
        let name = '';
        let detail = '';

        // Identify the root symbol by checking for "member(...)" or "program".
        if (!trimmedLine.startsWith('!')) {
            if (trimmedLine.toLowerCase().startsWith('member')) {
                name = 'MEMBER';
            } else if (trimmedLine.toLowerCase().startsWith('program')) {
                name = 'PROGRAM';
            }
            if (name) {
                const bracketStart = trimmedLine.indexOf('(');
                const bracketEnd = trimmedLine.indexOf(')');
                if (bracketStart > 0 && bracketStart < bracketEnd) {
                    detail = trimmedLine.slice(bracketStart + 1, bracketEnd).trim();
                }
                // Root range extends from the current line to the end of document.
                const rootRange = this.getLineRange(document, currentLineNum, document.lineCount);
                const rootSymbol = DocumentSymbol.create(
                    name,
                    detail,
                    ClarionSymbolKind.Root as SymbolKind,
                    rootRange,
                    currentLineRange,
                    []
                );
                return { found: true, symbol: rootSymbol };
            }
        }
        return { found: false };
    }

    private updateLastSymbolRange(
        nodes: DocumentSymbol[][],
        document: TextDocument,
        endLine: number
    ): void {
        const currentNodes = nodes[nodes.length - 1];
        if (currentNodes.length > 0) {
            const lastSymbol = currentNodes.pop()!;
            // Update the symbol's range to end at the line before the current one.
            lastSymbol.range = this.getLineRange(document, lastSymbol.range.start.line, endLine - 1);
            currentNodes.push(lastSymbol);
        }
    }
}