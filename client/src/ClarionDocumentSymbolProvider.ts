import * as vscode from 'vscode';

export class ClarionDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    // Capitalize
    private format(cmd: string): string {
        return cmd.substr(1).toLowerCase().replace(/^\w/, c => c.toUpperCase())
    }

    // based on Clarion6
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        return new Promise((resolve, reject) => {
            let symbols: vscode.DocumentSymbol[] = [];
            let nodes = [symbols]

            let inside_root = false
            let inside_procedure = false
            let inside_routine = false
            let inside_variable = 0

            const symbolkind_root = vscode.SymbolKind.Module
            const symbolkind_procedure = vscode.SymbolKind.Method
            const symbolkind_routine = vscode.SymbolKind.Property
            const symbolkind_variable = vscode.SymbolKind.Variable

            let root_symbol: vscode.DocumentSymbol = null
            let procedure_symbol: vscode.DocumentSymbol = null
            let routine_symbol: vscode.DocumentSymbol = null
            let variable_symbol: vscode.DocumentSymbol = null

            for (var i = 0; i < document.lineCount; i++) {
                var line = document.lineAt(i);
                let trimmedLine = line.text.trimStart()

                if (line.isEmptyOrWhitespace || trimmedLine.startsWith("!"))
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
                            
                            root_symbol = new vscode.DocumentSymbol(
                                name,
                                detail,
                                symbolkind_root,
                                new vscode.Range(line.range.start, document.lineAt(document.lineCount - 1).range.end),//until the last line of the file
                                line.range
                            )

                            nodes[nodes.length - 1].push(root_symbol)
                            nodes.push(root_symbol.children)
                            inside_root = true
                            //continue;
                        }
                    }
                }

                if (inside_variable > 0){
                    if (line.text.startsWith(" ") && (trimmedLine.startsWith(".") || trimmedLine.toLowerCase().startsWith("end"))){
                        inside_variable--
                    }
                    if (inside_variable == 0){
                        // udpate the Variable's range
                        let lastVariable = nodes[nodes.length - 1].pop()
                        lastVariable.range = new vscode.Range(lastVariable.range.start, document.lineAt(line.range.start.line).range.end)
                        nodes[nodes.length - 1].push(lastVariable)
                    }
                }

                // the declaration of PROCEDURE, ROUTINE or VARIABLE has no leading space
                if (!line.text.startsWith(" ") && !trimmedLine.startsWith("!")) {
                    let tokens = line.text.split(/\s+/)
                    if (tokens.length >= 2) {
                        let name = tokens[0]
                        let type = tokens[1]

                        if (type.toLowerCase().startsWith("procedure")) {

                            procedure_symbol = new vscode.DocumentSymbol(
                                name,
                                "",
                                symbolkind_procedure,
                                line.range, line.range
                            )

                            // Since Clarion Procedure has no explicit section end symbol.
                            // When any ongoing Routing or Procedure meet the new Procedure, seal the previous section
                            if (inside_routine) {
                                nodes.pop()
                                inside_routine = false

                                // udpate the previous Routine's range
                                let lastRoutine = nodes[nodes.length - 1].pop()
                                lastRoutine.range = new vscode.Range(lastRoutine.range.start, document.lineAt(line.range.start.line - 1).range.end)
                                nodes[nodes.length - 1].push(lastRoutine)
                            }
                            if (inside_procedure) {
                                nodes.pop()
                                inside_procedure = false

                                // update the previous Procedure's range
                                let lastProcedure = nodes[nodes.length - 1].pop()
                                lastProcedure.range = new vscode.Range(lastProcedure.range.start, document.lineAt(line.range.start.line - 1).range.end)
                                nodes[nodes.length - 1].push(lastProcedure)
                            }

                            nodes[nodes.length - 1].push(procedure_symbol)
                            nodes.push(procedure_symbol.children)
                            inside_procedure = true
                            //continue;
                        }

                        else if (type.toLowerCase().startsWith("routine")) {
                            routine_symbol = new vscode.DocumentSymbol(
                                name,
                                "",
                                symbolkind_routine,
                                line.range, line.range
                            )

                            // Since Clarion Procedure has no explicit section end symbol.
                            // When any ongoing Routing meet the new Procedure, seal the previous section
                            if (inside_routine) {
                                nodes.pop()
                                inside_routine = false

                                // udpate the previous Routine's range
                                let lastRoutine = nodes[nodes.length - 1].pop()
                                lastRoutine.range = new vscode.Range(lastRoutine.range.start, document.lineAt(i - 1).range.end)
                                nodes[nodes.length - 1].push(lastRoutine)
                            }

                            nodes[nodes.length - 1].push(routine_symbol)
                            nodes.push(routine_symbol.children)
                            inside_routine = true
                            //continue;
                        }

                        else { // fall to VARIABLE
                            if (inside_variable == 0) {
                                variable_symbol = new vscode.DocumentSymbol(
                                    name,
                                    "",
                                    symbolkind_variable,
                                    line.range, line.range
                                )

                                nodes[nodes.length - 1].push(variable_symbol)
                            }
                            //continue;
                        }
                    }
                }
            }

            resolve(symbols);
        });
    }
}