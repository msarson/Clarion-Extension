import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export class ClarionDocumentSymbolProvider {

    // Capitalize
    private format(cmd: string): string {
        return cmd.substr(1).toLowerCase().replace(/^\w/, c => c.toUpperCase())
    }

    // based on Clarion6
    public provideDocumentSymbols(
        document: TextDocument): DocumentSymbol[] {

            let symbols: DocumentSymbol[] = [];
            let nodes = [symbols]

            let inside_root = false
            let inside_procedure = false
            let inside_routine = false
            let inside_variable = 0

            const symbolkind_root = SymbolKind.Module
            const symbolkind_procedure = SymbolKind.Method
            const symbolkind_routine = SymbolKind.Property
            const symbolkind_variable = SymbolKind.Variable

            let root_symbol: DocumentSymbol = null
            let procedure_symbol: DocumentSymbol = null
            let routine_symbol: DocumentSymbol = null
            let variable_symbol: DocumentSymbol = null

            for (var i = 0; i < document.lineCount; i++) {
                var currentLineRange = Range.create(i,0,i+1,0)
                var line = document.getText(currentLineRange)
                let trimmedLine = line.trimStart()
                // string.isNullOrEmpty
                // https://codereview.stackexchange.com/a/5710
                if (!line || trimmedLine.startsWith("!"))
                    continue;

                if (!inside_root) {
                    // ROOT could be:
                    // "   MEMBER('FOO.clw')                                     !App=FOO"
                    // "   PROGRAM "
                    let name: string = undefined
                    let detail: string = undefined
                    if (!trimmedLine.startsWith("!")) {
                        if (trimmedLine.toLowerCase().startsWith("member")) {
                            name = "MEMBER"
                        }
                        else if (trimmedLine.toLowerCase().startsWith("program")) {
                            name = "PROGRAM"
                        }
                        if (name.length > 0) {
                            let bracketStart = trimmedLine.indexOf("(")
                            let bracketEnd = trimmedLine.indexOf(")")
                            if (0 < bracketStart && bracketStart < bracketEnd) {
                                detail = trimmedLine.slice(bracketStart + 1, bracketEnd).trim();
                            }
                            
                            root_symbol = DocumentSymbol.create(
                                name,
                                detail,
                                symbolkind_root,
                                Range.create(i,0, document.lineCount,0),//until the last line of the file
                                currentLineRange,
                                []
                            )

                            nodes[nodes.length - 1].push(root_symbol)
                            nodes.push(root_symbol.children)
                            inside_root = true
                            //continue;
                        }
                    }
                }

                if (inside_variable > 0){
                    if (line.startsWith(" ") && (trimmedLine.startsWith(".") || trimmedLine.toLowerCase().startsWith("end"))){
                        inside_variable--
                    }
                    if (inside_variable == 0){
                        // udpate the Variable's range
                        let lastVariable = nodes[nodes.length - 1].pop()
                        lastVariable.range = Range.create(lastVariable.range.start, currentLineRange.end)
                        nodes[nodes.length - 1].push(lastVariable)
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
                                symbolkind_procedure,
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
                                lastRoutine.range = Range.create(lastRoutine.range.start, currentLineRange.end)
                                nodes[nodes.length - 1].push(lastRoutine)
                            }
                            if (inside_procedure) {
                                nodes.pop()
                                inside_procedure = false

                                // update the previous Procedure's range
                                let lastProcedure = nodes[nodes.length - 1].pop()
                                lastProcedure.range = Range.create(lastProcedure.range.start, currentLineRange.end)
                                nodes[nodes.length - 1].push(lastProcedure)
                            }

                            nodes[nodes.length - 1].push(procedure_symbol)
                            nodes.push(procedure_symbol.children)
                            inside_procedure = true
                            //continue;
                        }

                        else if (type.toLowerCase().startsWith("routine")) {
                            routine_symbol = DocumentSymbol.create(
                                name,
                                "",
                                symbolkind_routine,
                                currentLineRange,
                                currentLineRange,
                                []
                            )

                            // Since Clarion Procedure has no explicit section end symbol.
                            // When any ongoing Routing meet the new Procedure, seal the previous section
                            if (inside_routine) {
                                nodes.pop()
                                inside_routine = false

                                // udpate the previous Routine's range
                                let lastRoutine = nodes[nodes.length - 1].pop()
                                lastRoutine.range = Range.create(lastRoutine.range.start, currentLineRange.end)
                                nodes[nodes.length - 1].push(lastRoutine)
                            }

                            nodes[nodes.length - 1].push(routine_symbol)
                            nodes.push(routine_symbol.children)
                            inside_routine = true
                            //continue;
                        }

                        else { // fall to VARIABLE
                            if (inside_variable == 0) {
                                variable_symbol = DocumentSymbol.create(
                                    name,
                                    "",
                                    symbolkind_variable,
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