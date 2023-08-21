import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

enum ClarionSymbolKind {
    Root = SymbolKind.Module,
    Procedure = SymbolKind.Method,
    Routine = SymbolKind.Property,
    Variable = SymbolKind.Variable
}

export class ClarionDocumentSymbolProvider {

    // Capitalize
    private format(cmd: string): string {
        return cmd.substr(1).toLowerCase().replace(/^\w/, c => c.toUpperCase())
    }


    private getLineRange(document: TextDocument, startLineNum: number, endLineNum?: number): Range {
        if (!endLineNum) { endLineNum = startLineNum }
        let lastLineText = document.getText(Range.create(endLineNum, 0, endLineNum + 1, 0))  // the text may contains 'CRLF'
        return Range.create(startLineNum, 0, endLineNum, lastLineText.length) // the lastLineText may overhead by containing 'CRLF', but it is still okay if the Range definition is slightly larger than actual text
    }

    // based on Clarion6. Feel free to update the code with new Clarion versions
    public provideDocumentSymbols(
        document: TextDocument): DocumentSymbol[] {

        let symbols: DocumentSymbol[] = [];
        let nodes = [symbols]

        let inside_root = false
        let inside_procedure = false
        let inside_routine = false
        let inside_variable = 0



        let root_symbol: DocumentSymbol | null
        let procedure_symbol: DocumentSymbol | null
        let routine_symbol: DocumentSymbol | null
        let variable_symbol: DocumentSymbol | null

        for (var i = 0; i < document.lineCount; i++) {
            var currentLineRange = this.getLineRange(document, i)
            var line = document.getText(currentLineRange).replace(/[\r\n]+/g, '')   // remove the annoying CRLF
            let trimmedLine = line.trimStart()
            // string.isNullOrEmpty
            // https://codereview.stackexchange.com/a/5710
            if (!line || trimmedLine.startsWith("!"))
                continue;

            if (!inside_root) {
                // ROOT could be:
                // "   MEMBER('FOO.clw')                                     !App=FOO"
                // "   PROGRAM "
                let name: string = ""
                let detail: string = ""
                if (!trimmedLine.startsWith("!")) {
                    if (trimmedLine.toLowerCase().startsWith("member")) {
                        name = "MEMBER"
                    }
                    else if (trimmedLine.toLowerCase().startsWith("program")) {
                        name = "PROGRAM"
                    }
                    if (name && name.length > 0) {
                        let bracketStart = trimmedLine.indexOf("(")
                        let bracketEnd = trimmedLine.indexOf(")")
                        if (0 < bracketStart && bracketStart < bracketEnd) {
                            detail = trimmedLine.slice(bracketStart + 1, bracketEnd).trim();
                        }
                        const emptyChildren: DocumentSymbol[] = [];
                        root_symbol = DocumentSymbol.create(
                            name,
                            detail,
                            ClarionSymbolKind.Root as SymbolKind,
                            this.getLineRange(document, i, document.lineCount),   // till the last line of the file
                            currentLineRange,
                            emptyChildren
                        )

                        nodes[nodes.length - 1].push(root_symbol)
                        nodes.push(root_symbol.children!)
                        inside_root = true
                        //continue;
                    }
                }
            }

            if (inside_variable > 0) {
                if (line.startsWith(" ") && (trimmedLine.startsWith(".") || trimmedLine.toLowerCase().startsWith("end"))) {
                    inside_variable--
                }
                if (inside_variable == 0) {
                    // udpate the Variable's range
                    let lastVariable = nodes[nodes.length - 1].pop()
                    if(lastVariable != null) {
                        lastVariable.range = this.getLineRange(document, lastVariable.range.start.line, currentLineRange.start.line - 1)
                        nodes[nodes.length - 1].push(lastVariable)
                    }
                }
            }

            // the declaration of PROCEDURE, ROUTINE or VARIABLE has no leading space
            if (!line.startsWith(" ") && !trimmedLine.startsWith("!")) {
                let tokens = line.split(/\s+/)
                if (tokens.length >= 2) {
                    let name = tokens[0]
                    let type = tokens[1]

                    if (type.toLowerCase().startsWith("procedure")) {

                        procedure_symbol = DocumentSymbol.create(
                            name,
                            "",
                            ClarionSymbolKind.Procedure as SymbolKind,
                            currentLineRange,
                            currentLineRange,
                            []
                        )

                        // Since Clarion Procedure has no explicit section end symbol.
                        // When any ongoing Routing or Procedure meet the new Procedure, seal the previous section
                        if (inside_routine) {
                            nodes.pop()
                            inside_routine = false

                            // udpate the previous Routine's range
                            let lastRoutine = nodes[nodes.length - 1].pop()
                            if(lastRoutine != null) {
                                lastRoutine.range = this.getLineRange(document, lastRoutine.range.start.line, currentLineRange.start.line - 1)
                                nodes[nodes.length - 1].push(lastRoutine)
                            }
                        }
                        if (inside_procedure) {
                            nodes.pop()
                            inside_procedure = false

                            // update the previous Procedure's range
                            let lastProcedure = nodes[nodes.length - 1].pop()
                            if(lastProcedure != null) {
                                lastProcedure.range = this.getLineRange(document, lastProcedure.range.start.line, currentLineRange.start.line - 1)
                                nodes[nodes.length - 1].push(lastProcedure)
                            }
                        }

                        nodes[nodes.length - 1].push(procedure_symbol)
                        nodes.push(procedure_symbol.children!)
                        inside_procedure = true
                        //continue;
                    }

                    else if (type.toLowerCase().startsWith("routine")) {
                        const emptyChildren: DocumentSymbol[] = [];
                        routine_symbol = DocumentSymbol.create(
                            name,
                            "",
                            ClarionSymbolKind.Routine as SymbolKind,
                            currentLineRange,
                            currentLineRange,
                            emptyChildren
                        )

                        // Since Clarion Procedure has no explicit section end symbol.
                        // When any ongoing Routing meet the new Procedure, seal the previous section
                        if (inside_routine) {
                            nodes.pop()
                            inside_routine = false

                            // udpate the previous Routine's range
                            let lastRoutine = nodes[nodes.length - 1].pop()
                            if(lastRoutine != null) {
                                lastRoutine.range = this.getLineRange(document, lastRoutine.range.start.line, currentLineRange.start.line - 1)
                                nodes[nodes.length - 1].push(lastRoutine)
                            }
                        }

                        nodes[nodes.length - 1].push(routine_symbol)
                        if(routine_symbol.children == null) {
                            nodes.push(routine_symbol.children!)
                            inside_routine = true
                        }
                        //continue;
                    }

                    else { // fall to VARIABLE
                        if (inside_variable == 0) {
                            variable_symbol = DocumentSymbol.create(
                                name,
                                "",
                                ClarionSymbolKind.Variable as SymbolKind,
                                currentLineRange,
                                currentLineRange,
                                []
                            )

                            nodes[nodes.length - 1].push(variable_symbol)
                        }
                        //continue;
                    }
                }
            }
        }
        return symbols
    }
}