import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("error");
import { serverInitialized } from './server.js';
import { Token, TokenType } from './ClarionTokenizer.js';

const ClarionSymbolKind = {
    Root: SymbolKind.Module,
    Procedure: SymbolKind.Function,
    Routine: SymbolKind.Property,
    Variable: SymbolKind.Variable,
    Table: SymbolKind.Struct,
    TablesGroup: SymbolKind.Namespace,
    Property: SymbolKind.Function,
    Method: SymbolKind.Function,
    Class: SymbolKind.Class
} as const;

const clarionStructureKindMap: Record<string, SymbolKind> = {
    CLASS: SymbolKind.Class,
    WINDOW: SymbolKind.Interface,       // 🧩
    SHEET: SymbolKind.Module,           // 📦
    TAB: SymbolKind.EnumMember,         // #
    GROUP: SymbolKind.Struct,           // 🏗️
    QUEUE: SymbolKind.Array,            // 📚
    REPORT: SymbolKind.File,            // 📄
    JOIN: SymbolKind.Event,             // 🟢
    APPLICATION: SymbolKind.Interface,  // same as WINDOW
    TOOLBAR: SymbolKind.Object,         // 🧱
    MENUBAR: SymbolKind.Object,         // 🧱
    MENU: SymbolKind.Enum,              // 📜
    OPTION: SymbolKind.Constant,         // 🔘
    ROUTINE: SymbolKind.Method
};
export class ClarionDocumentSymbolProvider {
    classSymbolMap: Map<string, DocumentSymbol> = new Map();
    public extractStringContents(rawString: string): string {
        const match = rawString.match(/'([^']+)'/);
        return match ? match[1] : rawString;
    }

    public provideDocumentSymbols(tokens: Token[], documentUri: string): DocumentSymbol[] {
        if (!serverInitialized) {
            logger.warn(`⚠️ Server not initialized, skipping document symbols for: ${documentUri}`);
            return [];
        }
        this.classSymbolMap.clear();
        const symbols: DocumentSymbol[] = [];

        // Enhanced parent stack that tracks finishesAt for each symbol
        const parentStack: Array<{ symbol: DocumentSymbol, finishesAt: number | undefined }> = [];
        let currentStructure: DocumentSymbol | null = null;
        let currentProcedure: DocumentSymbol | null = null;
        let currentClassImplementation: DocumentSymbol | null = null;
        let insideDefinitionBlock = false;
        let lastProcessedLine = -1;
        
        // Track if we have method implementations in the file
        let hasMethodImplementations = false;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const { type, value, line, subType, finishesAt, executionMarker } = token;

            // Check if we've moved to a new line
            if (line > lastProcessedLine) {
                // Check if any structures should be popped based on finishesAt
                this.checkAndPopCompletedStructures(parentStack, line, symbols);

                // Update current structure and procedure references
                currentStructure = parentStack.length > 0 ? parentStack[parentStack.length - 1].symbol : null;

                // Update the procedure reference if the current structure is a procedure
                currentProcedure = currentStructure?.kind === ClarionSymbolKind.Procedure ? currentStructure : null;

                lastProcessedLine = line;
            }

            if (executionMarker?.value.toUpperCase() === "CODE") {
                insideDefinitionBlock = false;
            }

            if (type === TokenType.Structure) {
                this.handleStructureToken(tokens, i, symbols, parentStack, currentStructure);
                currentStructure = parentStack.length > 0 ? parentStack[parentStack.length - 1].symbol : null;
                continue;
            }
            if (type === TokenType.PropertyFunction && value.toUpperCase() === "PROJECT") {
                this.handleProjectToken(tokens, i, symbols, currentStructure, currentProcedure);
                continue;
            }


            if ((subType === TokenType.Procedure || subType === TokenType.Class)) {
                const isImplementation = token.executionMarker?.value.toUpperCase() === "CODE";
                if (isImplementation || token.finishesAt !== undefined) {
                    const result = this.handleProcedureOrClassToken(tokens, i, symbols, currentStructure);
                    
                    // Check if this is a method implementation (e.g., ThisWindow.Init)
                    const isMethodImplementation = (result.procedureSymbol as any)._isMethodImplementation;
                    
                    if (isMethodImplementation) {
                        // For method implementations, we don't change the current procedure
                        // This ensures method implementations don't break procedure scope
                        currentClassImplementation = result.classImplementation;
                    } else {
                        // For regular procedures, update the current procedure and structure
                        currentProcedure = result.procedureSymbol;
                        currentClassImplementation = result.classImplementation;
                        
                        // Add procedure to parent stack with its finishesAt value if available
                        if ((result.procedureSymbol as any)._finishesAt !== undefined) {
                            parentStack.push({
                                symbol: result.procedureSymbol,
                                finishesAt: (result.procedureSymbol as any)._finishesAt
                            });
                            // Update current structure reference
                            currentStructure = result.procedureSymbol;
                        }
                    }

                    insideDefinitionBlock = true;
                } else {
                    this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);

                    // Check if we need to add this procedure definition to the parent stack
                    // This would be the case for procedure definitions with a finishesAt value
                    const procedureDefSymbol = symbols[symbols.length - 1];
                    if ((procedureDefSymbol as any)._finishesAt !== undefined) {
                        parentStack.push({
                            symbol: procedureDefSymbol,
                            finishesAt: (procedureDefSymbol as any)._finishesAt
                        });
                        // Update current structure reference
                        currentStructure = procedureDefSymbol;
                    }
                }
                continue;
            }



            const insideClassOrModule =
                currentStructure?.kind === SymbolKind.Class ||
                currentStructure?.name?.startsWith("MODULE");

            if ((insideDefinitionBlock || insideClassOrModule) &&
                type === TokenType.Keyword &&
                value.toUpperCase() === "PROCEDURE") {

                this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);

                // Check if we need to add this procedure definition to the parent stack
                // This would be the case for procedure definitions with a finishesAt value
                const procedureDefSymbol = symbols[symbols.length - 1];
                if ((procedureDefSymbol as any)._finishesAt !== undefined) {
                    parentStack.push({
                        symbol: procedureDefSymbol,
                        finishesAt: (procedureDefSymbol as any)._finishesAt
                    });
                    // Update current structure reference
                    currentStructure = procedureDefSymbol;
                }

                continue;
            }
            // 🧠 ROUTINE block inside a PROCEDURE or METHOD
            if (type === TokenType.Keyword && value.toUpperCase() === "ROUTINE") {
                const labelToken = tokens[i - 1];
                const routineName = labelToken?.type === TokenType.Label ? labelToken.value : "UnnamedRoutine";
                const endLine = token.finishesAt ?? token.line;
                
                // Create the routine symbol
                const routineSymbol = DocumentSymbol.create(
                    routineName,
                    "Routine",
                    ClarionSymbolKind.Routine,
                    this.getTokenRange(tokens, token.line, endLine),
                    this.getTokenRange(tokens, token.line, endLine),
                    []
                );
                
                // IMPORTANT: Determine the correct parent for this ROUTINE
                // Check if we're between method implementations
                let routineParent: DocumentSymbol | null = null;
                
                // Look ahead to find the next method implementation or procedure
                let nextMethodOrProcedure: Token | null = null;
                let prevMethodOrProcedure: Token | null = null;
                
                // Find the previous method/procedure
                for (let j = i - 1; j >= 0; j--) {
                    const t = tokens[j];
                    if ((t.subType === TokenType.Procedure || t.subType === TokenType.Class) &&
                        (t.executionMarker?.value.toUpperCase() === "CODE" || t.finishesAt !== undefined)) {
                        prevMethodOrProcedure = t;
                        break;
                    }
                }
                
                // Find the next method/procedure
                for (let j = i + 1; j < tokens.length; j++) {
                    const t = tokens[j];
                    if ((t.subType === TokenType.Procedure || t.subType === TokenType.Class) &&
                        (t.executionMarker?.value.toUpperCase() === "CODE" || t.finishesAt !== undefined)) {
                        nextMethodOrProcedure = t;
                        break;
                    }
                }
                
                // If we have a previous method implementation and it's a class method
                if (prevMethodOrProcedure && prevMethodOrProcedure.label?.includes('.')) {
                    // This ROUTINE belongs to the previous class method implementation
                    const className = prevMethodOrProcedure.label.split('.')[0];
                    
                    // Find the class implementation container
                    for (const symbol of symbols) {
                        if (symbol.name === `${className} (Implementation)`) {
                            // Found the class implementation container
                            routineParent = symbol;
                            break;
                        }
                    }
                }
                
                // If we couldn't find a class implementation container, use the current procedure
                if (!routineParent) {
                    routineParent = currentProcedure;
                }
                
                // Add the routine to its parent
                if (routineParent) {
                    routineParent.children!.push(routineSymbol);
                } else {
                    // If we couldn't find a parent, add to top level
                    symbols.push(routineSymbol);
                }
                
                // Add to parent stack
                parentStack.push({
                    symbol: routineSymbol,
                    finishesAt: token.finishesAt
                });
                
                continue;
            }

            if ((type === TokenType.Type || type === TokenType.ReferenceVariable || type === TokenType.Variable) && i > 0) {
                this.handleVariableToken(tokens, i, symbols, currentStructure, currentProcedure);
                continue;
            }

            if (type === TokenType.EndStatement) {
                // We'll handle END statements differently now - they're just markers
                // The actual structure popping happens based on finishesAt lines
                // But we'll still use this to handle cases where finishesAt isn't available
                this.handleEndStatementToken(parentStack, line);
                currentStructure = parentStack.length > 0 ? parentStack[parentStack.length - 1].symbol : null;
                currentProcedure = currentStructure?.kind === ClarionSymbolKind.Procedure ? currentStructure : null;
            }
        }

        // No need for final sorting here since we're sorting as symbols are added
        // This ensures symbols are already in the correct order when VS Code renders the outline


        return symbols;
    }
    private handleProjectToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null,
        currentProcedure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;

        // Extract what's inside the parentheses: PROJECT(INV:Customer)
        let projectValue = "PROJECT";
        const parenStart = tokens[index + 1];
        const parenContent = [];

        let j = index + 2;
        let parenDepth = 1;

        while (j < tokens.length && parenDepth > 0) {
            const t = tokens[j];
            if (t.value === "(") parenDepth++;
            else if (t.value === ")") parenDepth--;

            if (parenDepth > 0) parenContent.push(t.value);
            j++;
        }

        if (parenContent.length > 0) {
            projectValue = parenContent.join("").trim();
        }

        const projectSymbol = DocumentSymbol.create(
            "PROJECT",
            "(" + projectValue + ")",
            SymbolKind.Property,
            this.getTokenRange(tokens, line, line),
            this.getTokenRange(tokens, line, line),
            []
        );

        const target = currentStructure || currentProcedure;
        this.addSymbolToParent(projectSymbol, target, symbols);
    }



    /**
     * Checks if any structures in the parent stack have been completed based on their finishesAt line
     * and pops them from the stack if needed.
     *
     * Special rule: Method implementations (className.MethodName) don't end procedure scope.
     * Procedure scope only ends when another procedure is found that is not a method or EOF.
     */
    private checkAndPopCompletedStructures(
        parentStack: Array<{ symbol: DocumentSymbol, finishesAt: number | undefined }>,
        currentLine: number,
        symbols: DocumentSymbol[]
    ): void {
        // If the stack is empty, nothing to do
        if (parentStack.length === 0) {
            return;
        }
        
        // CRITICAL CHANGE: Never pop the root procedure if it contains method implementations
        // This ensures the root procedure scope is maintained throughout the file
        
        // Find the root procedure in the stack (if any)
        let rootProcedureIndex = -1;
        
        // First, find if there's a root procedure (not a method implementation) in the stack
        for (let i = 0; i < parentStack.length; i++) {
            const entry = parentStack[i];
            const isRootProcedure = entry.symbol.kind === SymbolKind.Function &&
                                   !(entry.symbol as any)._isMethodImplementation &&
                                   !entry.symbol.name.includes('.');
            
            if (isRootProcedure) {
                rootProcedureIndex = i;
                break;
            }
        }
        
        // If we found a root procedure, check if it contains any method implementations
        if (rootProcedureIndex >= 0) {
            // Check if we have any method implementations in the symbols
            let hasMethodImplementations = false;
            
            // Helper function to recursively check for method implementations
            const checkForMethodImplementations = (symbolList: DocumentSymbol[]): boolean => {
                for (const sym of symbolList) {
                    if ((sym as any)._isMethodImplementation || sym.name.includes('.')) {
                        return true;
                    }
                    if (sym.children && sym.children.length > 0) {
                        if (checkForMethodImplementations(sym.children)) {
                            return true;
                        }
                    }
                }
                return false;
            };
            
            hasMethodImplementations = checkForMethodImplementations(symbols);
            
            // If we have method implementations, NEVER pop the root procedure
            if (hasMethodImplementations) {
                // Process the stack, but skip the root procedure
                let i = parentStack.length - 1;
                while (i >= 0) {
                    // Skip the root procedure
                    if (i === rootProcedureIndex) {
                        i--;
                        continue;
                    }
                    
                    const entry = parentStack[i];
                    // Pop if we've passed the finishesAt line
                    if (entry.finishesAt !== undefined && currentLine > entry.finishesAt) {
                        parentStack.splice(i, 1);
                    }
                    i--;
                }
                return;
            }
        }
        
        // Standard case: pop structures based on their finishesAt line
        let i = parentStack.length - 1;
        while (i >= 0) {
            const entry = parentStack[i];
            if (entry.finishesAt !== undefined && currentLine > entry.finishesAt) {
                parentStack.splice(i, 1);
            }
            i--;
        }
    }

    private handleStructureToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        parentStack: Array<{ symbol: DocumentSymbol, finishesAt: number | undefined }>,
        currentStructure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { value, line, finishesAt } = token;

        const foldingOnly = ["IF", "LOOP", "CASE", "BEGIN", "EXECUTE", "ITEMIZE", "BREAK", "ACCEPT"];
        if (foldingOnly.includes(value.toUpperCase())) return;

        if (value.toUpperCase() === "MODULE") {
            const sameLineTokens = tokens.filter(t => t.line === token.line);
            const currentIndex = sameLineTokens.findIndex(t => t === token);

            // Look backwards on the same line for a comma (i.e., inside `CLASS(...)`)
            for (let j = currentIndex - 1; j >= 0; j--) {
                const prev = sameLineTokens[j];
                if (prev.value === ',') {
                    return;
                }
                if (prev.value === '(' || prev.type === TokenType.Structure || prev.type === TokenType.Keyword) {
                    break; // likely not an attribute list
                }
            }
        }

        const labelName = token.label ? token.label : "";// this.findStructureLabelName(tokens, index);
        const upperValue = value.toUpperCase();
        const structureKind = clarionStructureKindMap[upperValue] ?? ClarionSymbolKind.TablesGroup;

        let displayName: string;

        if (upperValue === "JOIN") {
            let joinArgs = "";
            const parenContent: string[] = [];
            let j = index + 2;
            let parenDepth = 1;

            while (j < tokens.length && parenDepth > 0) {
                const t = tokens[j];
                if (t.value === "(") parenDepth++;
                else if (t.value === ")") parenDepth--;

                if (parenDepth > 0) parenContent.push(t.value);
                j++;
            }

            joinArgs = parenContent.join("").trim();
            displayName = `JOIN (${joinArgs})`;
        } else {
            displayName = labelName ? `${value} (${labelName})` : value;
        }

        const structureSymbol = DocumentSymbol.create(
            displayName,
            "",
            structureKind,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            this.getTokenRange(tokens, line, finishesAt ?? line),
            []
        );

        // CLASS support: inject Properties/Methods
        if (upperValue === "CLASS" && labelName) {
            this.classSymbolMap.set(labelName.toUpperCase(), structureSymbol);

            const propsContainer = DocumentSymbol.create(
                "Properties",
                "",
                SymbolKind.Property,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            (propsContainer as any).sortText = "0001";

            const methodsContainer = DocumentSymbol.create(
                "Methods",
                "",
                SymbolKind.Method,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            (methodsContainer as any).sortText = "0002";

            (structureSymbol as any).$clarionProps = propsContainer;
            (structureSymbol as any).$clarionMethods = methodsContainer;

            structureSymbol.children!.push(propsContainer);
            structureSymbol.children!.push(methodsContainer);
        }




        this.addSymbolToParent(structureSymbol, currentStructure, symbols);
        // Push to the parent stack with finishesAt information
        parentStack.push({
            symbol: structureSymbol,
            finishesAt: finishesAt
        });
    }



    private findStructureLabelName(tokens: Token[], index: number): string | null {
        const prevToken = tokens[index - 1];
        let labelName = prevToken?.type === TokenType.Label ? prevToken.value : null;

        if (!labelName) {
            const startIndex = index;
            const maxLookahead = 5;
            for (let j = 1; j <= maxLookahead; j++) {
                const lookahead = tokens[startIndex + j];
                if (!lookahead) break;
                if (lookahead.value === '(') continue;
                if (lookahead.type === TokenType.String) {
                    labelName = this.extractStringContents(lookahead.value);
                    break;
                }
                if ([TokenType.Label, TokenType.Structure, TokenType.Keyword].includes(lookahead.type)) {
                    break;
                }
            }
        }

        return labelName;
    }

    private createStructureSymbol(
        tokens: Token[],
        name: string,
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        return DocumentSymbol.create(
            name,
            "",
            ClarionSymbolKind.TablesGroup,
            this.getTokenRange(tokens, startLine, endLine),
            this.getTokenRange(tokens, startLine, endLine),
            []
        );
    }

    private handleProcedureOrClassToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null
    ): { procedureSymbol: DocumentSymbol, classImplementation: DocumentSymbol | null } {
        const token = tokens[index];
        const { line, finishesAt } = token;
        const prevToken = tokens[index - 1];
        const procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
        const classMatch = procedureName.includes('.') ? procedureName.split('.')[0] : null;

        let container: DocumentSymbol | null = null;
        let classImplementation: DocumentSymbol | null = null;
        
        // IMPORTANT: For method implementations, we need to handle them differently
        // to ensure they don't break procedure scope
        if (classMatch) {
            // This is a method implementation (e.g., ThisWindow.Init)
            
            // Find or create a class implementation container at the top level
            // This ensures method implementations are grouped by class
            for (const symbol of symbols) {
                if (symbol.name === `${classMatch} (Implementation)`) {
                    classImplementation = symbol;
                    break;
                }
            }
            
            if (!classImplementation) {
                // Create a new class implementation container
                classImplementation = DocumentSymbol.create(
                    `${classMatch} (Implementation)`,
                    "Class Method Implementation",
                    SymbolKind.Class,
                    this.getTokenRange(tokens, line, finishesAt ?? line),
                    this.getTokenRange(tokens, line, finishesAt ?? line),
                    []
                );
                
                // Add methods container
                const methodsContainer = DocumentSymbol.create(
                    "Methods",
                    "",
                    SymbolKind.Method,
                    classImplementation.range,
                    classImplementation.selectionRange,
                    []
                );
                
                classImplementation.children!.push(methodsContainer);
                (classImplementation as any).$clarionMethods = methodsContainer;
                
                // Add to top-level symbols
                symbols.push(classImplementation);
            }
            
            // Use the methods container as the parent
            const methodsContainer = (classImplementation as any).$clarionMethods || classImplementation;
            container = methodsContainer;
            
            // Mark this as a method implementation
            (token as any)._isMethodImplementation = true;
        } else {
            // For regular procedures (not class methods), use the current structure
            container = currentStructure;
        }

        // Extract the method name without the class prefix
        const shortName = classMatch ? procedureName.replace(`${classMatch}.`, "") : procedureName;
        const procedureSymbol = this.createProcedureSymbol(
            tokens, shortName, classMatch, line, finishesAt ?? line
        );

        // For method implementations, mark the symbol
        if (classMatch) {
            (procedureSymbol as any)._isMethodImplementation = true;
        }

        // Add the procedure to its container
        if (classMatch) {
            // For method implementations, add directly to the container
            container!.children!.push(procedureSymbol);
        } else {
            // For regular procedures, use addSymbolToParent
            this.addSymbolToParent(procedureSymbol, container, symbols);
        }

        // Add procedure to parent stack with its finishesAt value
        // This ensures procedures are properly scoped and their children are attached correctly
        if (finishesAt !== undefined) {
            // We need to add this to the parentStack in the main method
            // We'll return it and let the caller add it to the stack
            (procedureSymbol as any)._finishesAt = finishesAt;
        }

        return { procedureSymbol, classImplementation };
    }

    private findOrCreateClassImplementation(
        symbols: DocumentSymbol[],
        className: string,
        tokens: Token[],
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        const fullName = `${className} (Implementation)`;

        // First, check if we already have a class implementation container at the top level
        const search = (list: DocumentSymbol[]): DocumentSymbol | null => {
            for (const symbol of list) {
                if (symbol.name === fullName) return symbol;
                const found = search(symbol.children ?? []);
                if (found) return found;
            }
            return null;
        };

        let classImplementation = search(symbols);

        if (!classImplementation) {
            // Create a new class implementation container
            classImplementation = DocumentSymbol.create(
                fullName,
                "Class Method Implementation",
                ClarionSymbolKind.Class,
                this.getTokenRange(tokens, startLine, endLine),
                this.getTokenRange(tokens, startLine, endLine),
                []
            );
            
            // Add methods container for organization
            const methodsContainer = DocumentSymbol.create(
                "Methods",
                "",
                SymbolKind.Method,
                classImplementation.range,
                classImplementation.range,
                []
            );
            (methodsContainer as any).sortText = "0001";
            
            // Store the methods container for easy access
            (classImplementation as any).$clarionMethods = methodsContainer;
            classImplementation.children!.push(methodsContainer);
            
            // Add to top-level symbols
            symbols.push(classImplementation);
        }

        // Update the range to encompass all methods
        if (startLine < classImplementation.range.start.line) {
            classImplementation.range.start.line = startLine;
            classImplementation.selectionRange.start.line = startLine;
        }
        if (endLine > classImplementation.range.end.line) {
            classImplementation.range.end.line = endLine;
            classImplementation.selectionRange.end.line = endLine;
        }

        return classImplementation;
    }



    private createProcedureSymbol(
        tokens: Token[],
        name: string,
        isClassMethod: string | null,
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        const range = this.getTokenRange(tokens, startLine, endLine);
        return DocumentSymbol.create(
            name,
            isClassMethod ? "Method" : "Procedure",
            isClassMethod ? ClarionSymbolKind.Method : ClarionSymbolKind.Procedure,
            range,
            range,
            []
        );
    }
    private handleProcedureDefinitionToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        _currentStructure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line, finishesAt, parent } = token;
        const prevToken = tokens[index - 1];
        const procedureDefName = token.label ? token.label : "UnnamedDefinition";// prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedDefinition";

        // 🔍 Extract the definition detail — e.g. "(string newValue), virtual"
        // 🔍 Extract the definition detail — e.g. "(string newValue), virtual"
        let detail = "";
        let j = index + 1;

        while (j < tokens.length) {
            const t = tokens[j];
            if (t.line !== line) break;
            if (t.type === TokenType.EndStatement || t.type === TokenType.Structure) break;
            detail += t.value;
            j++;
        }

        // 🔧 Strip comment manually if present
        const commentIndex = detail.indexOf("!");
        if (commentIndex !== -1) {
            detail = detail.substring(0, commentIndex);
        }

        detail = detail.trim();


        const procedureDefSymbol = DocumentSymbol.create(
            procedureDefName,
            detail || "()",
            ClarionSymbolKind.Property,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            this.getTokenRange(tokens, line, finishesAt ?? line),
            []
        );

        // Store finishesAt value for procedure definitions if available
        if (finishesAt !== undefined) {
            (procedureDefSymbol as any)._finishesAt = finishesAt;
        }

        // ✅ Prefer attaching to MODULE if that's the current structure
        if (_currentStructure?.name?.startsWith("MODULE")) {
            _currentStructure.children!.push(procedureDefSymbol);
            return;
        }

        // ✅ Otherwise fallback to class method grouping
        const parentSymbol = this.findSymbolForParentToken(parent, symbols, line);
        let methodTarget = parentSymbol;
        if (parentSymbol?.kind === ClarionSymbolKind.Class) {
            methodTarget = parentSymbol.children?.find(c =>
                c.name === "Methods" && c.kind === SymbolKind.Method
            ) ?? parentSymbol;
        }

        this.addSymbolToParent(procedureDefSymbol, methodTarget, symbols);
    }





    private findSymbolForParentToken(
        parentToken: Token | undefined,
        symbols: DocumentSymbol[],
        currentLine: number
    ): DocumentSymbol | null {
        const methodLabel = parentToken?.value ?? '';
        const nameParts = methodLabel.split('.');
        const possibleClassName = nameParts.length > 1 ? nameParts[0].toUpperCase() : null;

        for (const classSymbol of this.classSymbolMap.values()) {
            const className = classSymbol.name.split(' ')[0].toUpperCase();
            const start = classSymbol.range.start.line;
            const end = classSymbol.range.end.line;

            const matchesRange = currentLine >= start && currentLine <= end;
            const matchesName = possibleClassName === className;

            if (matchesRange && (!possibleClassName || matchesName)) {
                return classSymbol;
            }
        }

        logger.warn(`⚠️ Could not match parent for method '${methodLabel}' on line ${currentLine}`);
        return null;
    }




    private handleVariableToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null,
        currentProcedure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;
        const prevToken = tokens[index - 1];

        if (prevToken?.type === TokenType.Label) {
            const typeParts: string[] = [];
            let j = index;
            let parenDepth = 0;
            let started = false;

            while (j < tokens.length) {
                const t = tokens[j];
                const v = t.value;

                // Start on the initial type token
                if (!started && (t.type === TokenType.Type || t.type === TokenType.ReferenceVariable || t.type === TokenType.Variable)) {
                    started = true;
                    typeParts.push(v);
                    j++;

                    // If the next token is not an opening paren, we're done
                    if (tokens[j]?.value !== '(') break;

                    continue;
                }

                // Handle parens
                if (v === '(') parenDepth++;
                if (v === ')') parenDepth--;

                typeParts.push(v);
                j++;

                // Done when closing last paren
                if (started && parenDepth === 0) break;
            }

            const fullType = typeParts.join('').trim();



            const variableSymbol = DocumentSymbol.create(
                prevToken.value,
                fullType,
                ClarionSymbolKind.Variable,
                this.getTokenRange(tokens, prevToken.line, line),
                this.getTokenRange(tokens, prevToken.line, line),
                []
            );


            const target = currentStructure || currentProcedure;
            this.addSymbolToParent(variableSymbol, target, symbols);
        }
    }

    private handleEndStatementToken(
        parentStack: Array<{ symbol: DocumentSymbol, finishesAt: number | undefined }>,
        line: number
    ): void {
        // Only pop structures that don't have a finishesAt value
        // (Those with finishesAt are handled by checkAndPopCompletedStructures)
        if (parentStack.length > 0) {
            const top = parentStack[parentStack.length - 1];

            // If this structure doesn't have a finishesAt value, pop it when END is encountered
            if (top.finishesAt === undefined) {
                parentStack.pop();
            }
            // Otherwise, we'll let checkAndPopCompletedStructures handle it
        }
    }


    private addSymbolToParent(
        symbol: DocumentSymbol,
        parent: DocumentSymbol | null,
        symbols: DocumentSymbol[]
    ): void {
        const container = parent?.name ?? 'TOP LEVEL';

        if (parent) {
            const isVariable = symbol.kind === ClarionSymbolKind.Variable;
            // Check if this is a method - either explicitly marked as Method kind or
            // it's a procedure with "Method" in its detail
            const isMethod = symbol.kind === SymbolKind.Function &&
                            (symbol.name.includes('.') || symbol.detail?.includes("Method"));
            const isClassImplementation = parent.name.includes(" (Implementation)");

            // Set sortText for all symbols based on name
            (symbol as any).sortText = symbol.name.toLowerCase();

            // Handle class properties
            if (isVariable && (parent as any).$clarionProps) {
                const propsContainer = (parent as any).$clarionProps;
                // Add to properties container
                propsContainer.children!.push(symbol);
                // Sort immediately after adding
                this.sortContainerChildren(propsContainer);
            }
            // Handle class methods - either in a regular class or in a class implementation container
            else if (isMethod && ((parent as any).$clarionMethods || isClassImplementation)) {
                let methodsContainer;
                
                if ((parent as any).$clarionMethods) {
                    // Use the dedicated methods container if available
                    methodsContainer = (parent as any).$clarionMethods;
                } else if (isClassImplementation) {
                    // For class implementation containers, find or use the first child as methods container
                    methodsContainer = parent.children!.find(c => c.name === "Methods") || parent;
                } else {
                    // Fallback to parent
                    methodsContainer = parent;
                }
                
                // Add to methods container
                methodsContainer.children!.push(symbol);
                
                // Sort immediately after adding
                if (methodsContainer !== parent) {
                    this.sortContainerChildren(methodsContainer);
                }
            } else {
                // Add to regular parent
                parent.children!.push(symbol);
            }
        } else {
            // Top-level symbol
            symbols.push(symbol);
        }
    }

    /**
     * Sort children of a container alphabetically
     */
    private sortContainerChildren(container: DocumentSymbol): void {
        if (!container.children || container.children.length <= 1) {
            return; // Nothing to sort
        }

        // Sort children alphabetically
        container.children.sort((a: DocumentSymbol, b: DocumentSymbol) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );

        // Update sortText to match the new order
        for (let i = 0; i < container.children.length; i++) {
            const child = container.children[i];
            (child as any).sortText = i.toString().padStart(4, "0");
        }
    }


    private getTokenRange(tokens: Token[], startLine: number, endLine: number): Range {
        const startToken = tokens.find((t: Token) => t.line === startLine);
        const endToken = [...tokens].reverse().find((t: Token) => t.line === endLine);

        // If either token is missing, fallback to line-wide range
        if (!startToken || !endToken) {
            return Range.create(startLine, 0, endLine, 999);  // use large column to include whole line
        }

        return Range.create(
            startToken.line, startToken.start,
            endToken.line, endToken.start + endToken.value.length
        );
    }
}
