import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType, ClarionTokenizer } from './ClarionTokenizer';
import ClarionStructureExtractor from './clarionStructureExtractor';
import ClarionFileParser from './ClarionFileParser';
import ClarionClassParser from './ClarionClassParser';

enum ClarionSymbolKind {
    Root = SymbolKind.Module,
    Procedure = SymbolKind.Method,
    Routine = SymbolKind.Property,
    Variable = SymbolKind.Variable,
    Table = SymbolKind.Struct, // ✅ 'FILE' is a table definition
    TablesGroup = SymbolKind.Namespace // ✅ Represents the "Tables" parent node
}

export class ClarionDocumentSymbolProvider {


    public provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];
        const nodes: DocumentSymbol[][] = [symbols];
    
        // ✅ Tokenize the document
        const tokenizer = new ClarionTokenizer(document.getText());
        const tokens = tokenizer.tokenize();
    
        let insideRoot = false;
        let insideProcedure = false;
        let insideRoutine = false;
        let insideVariable = 0;
    
        for (let i = 0; i < document.lineCount; i++) {
            const currentLineRange = this.getLineRange(document, i);
            const line = document.getText(currentLineRange).replace(/[\r\n]+/g, '');
            const trimmedLine = line.trimStart();
    
            if (!line || trimmedLine.startsWith('!')) continue; // Ignore empty lines and comments
    
            // ✅ Process root if not already set
            if (!insideRoot) {
                const { found, symbol: rootSymbol } = this.tryCreateRootSymbol(trimmedLine, currentLineRange, document, i);
                if (found && rootSymbol) {
                    nodes[nodes.length - 1].push(rootSymbol);
                    nodes.push(rootSymbol.children!);
                    insideRoot = true;
    
                    // ✅ Process FILE symbols FIRST
                    this.getFileSymbols(document, tokens, nodes);
                    this.getClassSymbols(document, tokens, nodes);
                }
            }
        }
    
        // ✅ Now process PROCEDURE, ROUTINE, VARIABLE (After Tables)
        for (let i = 0; i < document.lineCount; i++) {
            const currentLineRange = this.getLineRange(document, i);
            const line = document.getText(currentLineRange).replace(/[\r\n]+/g, '');
            const trimmedLine = line.trimStart();
    
            if (!line || trimmedLine.startsWith('!')) continue; // Ignore empty lines and comments
    
            if (!line.startsWith(' ') && !trimmedLine.startsWith('!') && !trimmedLine.startsWith('?')) {
                const tokens = line.split(/\s+/);
                if (tokens.length >= 2) {
                    const name = tokens[0];
                    const type = tokens[1].toLowerCase();
    
                    if (type.startsWith('procedure')) {
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
    

    private getFileSymbols(document: TextDocument, tokens: Token[], nodes: DocumentSymbol[][]): void {
        const extractor = new ClarionStructureExtractor(tokens);
        const fileStructures = extractor.extractStructures("FILE");
    
        if (fileStructures.length === 0) return;
    
        
    
        // ✅ Create "Tables" parent node
        const tablesParentSymbol = DocumentSymbol.create(
            "Tables",
            "Table Definitions",
            ClarionSymbolKind.TablesGroup as SymbolKind,
            this.getLineRange(document, 0, document.lineCount - 1),
            this.getLineRange(document, 0, document.lineCount - 1),
            []
        );
    
        for (const file of fileStructures) {
            const fileParser = new ClarionFileParser(file);
            const driverType = fileParser.getDriverType();
            const prefix = fileParser.getPrefix();
            const fields = fileParser.getFields();
    
            
    
            const fileSymbol = DocumentSymbol.create(
                fileParser.getFileName(),
                driverType + ' PRE(' + prefix + ')',
                ClarionSymbolKind.Table as SymbolKind,
                this.getLineRange(document, file.start, file.end ?? file.start),
                this.getLineRange(document, file.start, file.end ?? file.start),
                []
            );
    
            // ✅ Add fields as children of the file
            for (const field of fields) {
                
    
                const fieldSymbol = DocumentSymbol.create(
                    field.name,
                    field.type, // ✅ Show field type
                    SymbolKind.Field,
                    this.getLineRange(document, field.start),
                    this.getLineRange(document, field.start),
                    []
                );
    
                fileSymbol.children!.push(fieldSymbol);
            }
    
            tablesParentSymbol.children!.push(fileSymbol);
        }
    
        nodes[0].push(tablesParentSymbol);
    }
    private getClassSymbols(document: TextDocument, tokens: Token[], nodes: DocumentSymbol[][]): void {
        const extractor = new ClarionStructureExtractor(tokens);
        const classStructures = extractor.extractStructures("CLASS");
    
        if (classStructures.length === 0) return;
    
        // ✅ Create "Classes" parent node
        const classesParentSymbol = DocumentSymbol.create(
            "Classes",
            "Class Definitions",
            ClarionSymbolKind.TablesGroup as SymbolKind,
            this.getLineRange(document, 0, document.lineCount - 1),
            this.getLineRange(document, 0, document.lineCount - 1),
            []
        );
    
        for (const clarionClass of classStructures) {
            const classParser = new ClarionClassParser(clarionClass);
            const className = classParser.getClassName();
            const procedures = classParser.getProcedures();
            const variables = classParser.getVariables();
    
            // ✅ Create a symbol for the class itself
            const classSymbol = DocumentSymbol.create(
                className,
                "Class Definition",
                ClarionSymbolKind.Table as SymbolKind,
                this.getLineRange(document, clarionClass.start, clarionClass.end ?? clarionClass.start),
                this.getLineRange(document, clarionClass.start, clarionClass.end ?? clarionClass.start),
                []
            );
    
            // ✅ Add methods (procedures) as children of the class
            for (const procedure of procedures) {
                const procedureSymbol = DocumentSymbol.create(
                    procedure.name,
                    procedure.signature,
                    SymbolKind.Method,
                    this.getLineRange(document, procedure.start),
                    this.getLineRange(document, procedure.start),
                    []
                );
                classSymbol.children!.push(procedureSymbol);
            }
    
            // ✅ Add variables as children of the class
            for (const variable of variables) {
                const variableSymbol = DocumentSymbol.create(
                    variable.name,
                    variable.type,
                    SymbolKind.Variable,
                    this.getLineRange(document, variable.start),
                    this.getLineRange(document, variable.start),
                    []
                );
                classSymbol.children!.push(variableSymbol);
            }
    
            classesParentSymbol.children!.push(classSymbol);
        }
    
        // ✅ Add the "Classes" parent node to the document tree
        nodes[0].push(classesParentSymbol);
    }
    
    
    

    private tryCreateRootSymbol(
        trimmedLine: string,
        currentLineRange: Range,
        document: TextDocument,
        currentLineNum: number
    ): { found: boolean; symbol?: DocumentSymbol } {
        let name = '';
        let detail = '';

        if (!trimmedLine.startsWith('!')) {
            if (trimmedLine.toLowerCase().startsWith('member')) {
                name = 'MEMBER';
            } else if (trimmedLine.toLowerCase().startsWith('program')) {
                name = 'PROGRAM';
            }

            if (name) {
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

    private getLineRange(document: TextDocument, startLineNum: number, endLineNum?: number): Range {
        if (!endLineNum) endLineNum = startLineNum;
        let lastLineText = document.getText(Range.create(endLineNum, 0, endLineNum + 1, 0));
        return Range.create(startLineNum, 0, endLineNum, lastLineText.length);
    }

    private updateLastSymbolRange(
        nodes: DocumentSymbol[][],
        document: TextDocument,
        endLine: number
    ): void {
        const currentNodes = nodes[nodes.length - 1];
        if (currentNodes.length > 0) {
            const lastSymbol = currentNodes.pop()!;
            lastSymbol.range = this.getLineRange(document, lastSymbol.range.start.line, endLine - 1);
            currentNodes.push(lastSymbol);
        }
    }
}
