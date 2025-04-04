import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("info");
import { serverInitialized } from './server.js';
import { Token, TokenType } from './ClarionTokenizer.js';

const ClarionSymbolKind = {
    Root: SymbolKind.Module,
    Procedure: SymbolKind.Function,
    Routine: SymbolKind.Method,  // Changed from Property to Method for better icon
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
    SHEET: SymbolKind.Namespace,           // 📦
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

        // CRITICAL FIX: Track the last method implementation to ensure variables are properly attached
        let lastMethodImplementation: DocumentSymbol | null = null;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const { type, value, line, subType, finishesAt, executionMarker } = token;

            // Check if we've moved to a new line
            if (line > lastProcessedLine) {
                // Check if any structures should be popped based on finishesAt
                this.checkAndPopCompletedStructures(parentStack, line, symbols, tokens);

                // CRITICAL FIX: Check if we need to reset lastMethodImplementation
                // This happens when a new global procedure is encountered
                if ((token as any)._resetLastMethodImplementation) {
                    lastMethodImplementation = null;
                    delete (token as any)._resetLastMethodImplementation;
                }

                // Update current structure and procedure references
                currentStructure = parentStack.length > 0 ? parentStack[parentStack.length - 1].symbol : null;

                // Update the procedure reference if the current structure is a procedure
                currentProcedure = currentStructure?.kind === ClarionSymbolKind.Procedure ? currentStructure : null;

                // CRITICAL FIX: If we don't have a current procedure but we have a last method implementation,
                // use that as the current procedure for variables
                if (!currentProcedure && lastMethodImplementation) {
                    currentProcedure = lastMethodImplementation;
                }

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
                this.handleProjectToken(tokens, i, symbols, currentProcedure, currentStructure);

                continue;
            }


            if ((subType === TokenType.Procedure || subType === TokenType.Class ||
                subType === TokenType.GlobalProcedure || subType === TokenType.MethodImplementation ||
                subType === TokenType.InterfaceMethod)) {

                const isImplementation = token.executionMarker?.value.toUpperCase() === "CODE";
                if (isImplementation || token.finishesAt !== undefined) {
                    // CRITICAL FIX: Pass the correct subType to handleProcedureOrClassToken
                    // This ensures GlobalProcedure tokens are properly handled
                    const result = this.handleProcedureOrClassToken(tokens, i, symbols, currentStructure, token.subType || subType);

                    // Check if this is a method implementation (e.g., ThisWindow.Init)
                    const isMethodImplementation = (result.procedureSymbol as any)._isMethodImplementation;

                    if (isMethodImplementation) {
                        // CRITICAL FIX: For method implementations, we DO need to update currentProcedure
                        // This ensures variables defined inside the method are attached to it
                        currentProcedure = result.procedureSymbol;
                        currentClassImplementation = result.classImplementation;

                        // CRITICAL FIX: Track the last method implementation
                        lastMethodImplementation = result.procedureSymbol;

                        // Add method implementation to parent stack with its finishesAt value if available
                        if ((result.procedureSymbol as any)._finishesAt !== undefined) {
                            parentStack.push({
                                symbol: result.procedureSymbol,
                                finishesAt: (result.procedureSymbol as any)._finishesAt
                            });
                            currentStructure = result.procedureSymbol;
                        }
                    } else {
                        // For regular procedures, update the current procedure and structure
                        currentProcedure = result.procedureSymbol;
                        currentClassImplementation = result.classImplementation;

                        // CRITICAL FIX: Reset lastMethodImplementation when a new global procedure is encountered
                        if ((result.procedureSymbol as any)._isGlobalProcedure) {
                            lastMethodImplementation = null;
                        }

                        // Add procedure to parent stack with its finishesAt value if available
                        if ((result.procedureSymbol as any)._finishesAt !== undefined) {
                            parentStack.push({
                                symbol: result.procedureSymbol,
                                finishesAt: (result.procedureSymbol as any)._finishesAt
                            });
                            currentStructure = result.procedureSymbol;
                        }
                    }

                    insideDefinitionBlock = true;
                } else {
                    const procedureDefSymbol = this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);

                    // Check if we need to add this procedure definition to the parent stack
                    // This would be the case for procedure definitions with a finishesAt value
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
            const sub = token.subType as TokenType;
            // CRITICAL FIX: Also check for method declarations
            if ((insideDefinitionBlock || insideClassOrModule) &&
                (
                    (type === TokenType.Keyword && value.toUpperCase() === "PROCEDURE") ||
                    sub === TokenType.MethodDeclaration ||
                    sub === TokenType.InterfaceMethod ||
                    sub === TokenType.MapProcedure
                )) {


                // Pass the token's subType to handleProcedureDefinitionToken
                const procedureDefSymbol = this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);

                // Check if we need to add this procedure definition to the parent stack
                // This would be the case for procedure definitions with a finishesAt value
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

                // CRITICAL FIX: Check if this is a special routine with :: in the name
                const isSpecialRoutine = routineName.includes("::");

                // Create the routine symbol with (Routine) suffix in the name
                const routineSymbol = DocumentSymbol.create(
                    `${routineName} (Routine)`,
                    "",  // Empty detail since we're including it in the name
                    ClarionSymbolKind.Routine,
                    this.getTokenRange(tokens, token.line, endLine),
                    this.getTokenRange(tokens, token.line, endLine),
                    []
                );

                // Mark special routines
                if (isSpecialRoutine) {
                    (routineSymbol as any)._isSpecialRoutine = true;
                }

                // CRITICAL FIX: Determine the correct parent for this ROUTINE
                // First, check if we're inside a procedure
                let routineParent: DocumentSymbol | null = currentProcedure;

                // If we're not inside a procedure, check if we're inside a method implementation
                if (!routineParent) {
                    // Look for the most recent method implementation
                    for (let j = i - 1; j >= 0; j--) {
                        const t = tokens[j];
                        if ((t.subType === TokenType.MethodImplementation ||
                            (t.type === TokenType.Procedure && t.label?.includes('.'))) &&
                            t.executionMarker?.value.toUpperCase() === "CODE") {

                            // Find the method implementation symbol
                            const methodName = t.label || "";
                            const className = methodName.split('.')[0];

                            // Find the class implementation container
                            for (const symbol of symbols) {
                                if (symbol.name === `${className} (Implementation)`) {
                                    // Look for the method in the Methods container
                                    const methodsContainer = symbol.children?.find(c => c.name === "Methods");
                                    if (methodsContainer) {
                                        routineParent = methodsContainer;
                                        break;
                                    }
                                }
                            }

                            break;
                        }
                    }
                }

                // Add the routine to its parent
                if (routineParent) {
                    routineParent.children!.push(routineSymbol);
                } else {
                    // If we couldn't find a parent, add to top level
                    symbols.push(routineSymbol);
                }

                // CRITICAL FIX: Only add special routines to the parent stack
                // This prevents variables from being incorrectly attached to empty routines
                if (isSpecialRoutine || token.finishesAt) {
                    parentStack.push({
                        symbol: routineSymbol,
                        finishesAt: token.finishesAt
                    });
                }

                continue;
            }

            if ((type === TokenType.Type || type === TokenType.ReferenceVariable || type === TokenType.Variable) && i > 0) {
                this.handleVariableToken(tokens, i, symbols, currentProcedure, currentStructure, lastMethodImplementation);

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
        logger.info("🧠 Full symbol tree:");
        logger.info(JSON.stringify(symbols, null, 2));

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
     *
     * Global procedures should contain everything defined after them until another global procedure or EOF.
     */
    private checkAndPopCompletedStructures(
        parentStack: Array<{ symbol: DocumentSymbol, finishesAt: number | undefined }>,
        currentLine: number,
        symbols: DocumentSymbol[],
        tokens: Token[]
    ): void {
        // CRITICAL FIX: Reset lastMethodImplementation when a new global procedure is encountered
        // This is a reference to the class property that needs to be updated
        let resetLastMethodImplementation = false;
        // If the stack is empty, nothing to do
        if (parentStack.length === 0) {
            return;
        }

        // Find all global procedures, special routines, and method implementations in the stack
        let globalProcedureIndices: number[] = [];
        let specialRoutineIndices: number[] = [];
        let methodImplementationIndices: number[] = [];
        let currentGlobalProcedureIndex = -1;

        // First, identify all special types in the stack
        for (let i = 0; i < parentStack.length; i++) {
            const entry = parentStack[i];

            // Check if this is a global procedure
            const isGlobalProcedure = entry.symbol.kind === SymbolKind.Function &&
                ((entry.symbol as any)._isGlobalProcedure === true ||
                    (entry.symbol.kind === SymbolKind.Function &&
                        !(entry.symbol as any)._isMethodImplementation &&
                        !entry.symbol.name.includes('.')));

            // Check if this is a special routine
            const isSpecialRoutine = entry.symbol.kind === ClarionSymbolKind.Routine &&
                (entry.symbol as any)._isSpecialRoutine;

            // Check if this is a method implementation
            const isMethodImplementation = (entry.symbol as any)._isMethodImplementation === true;

            if (isGlobalProcedure) {
                globalProcedureIndices.push(i);
                currentGlobalProcedureIndex = i; // Track the most recent global procedure
            }

            if (isSpecialRoutine) {
                specialRoutineIndices.push(i);
            }

            if (isMethodImplementation) {
                methodImplementationIndices.push(i);
            }
        }

        // Check if we're at the end of the file
        const isEndOfFile = currentLine === tokens[tokens.length - 1].line;

        // Check if we're at a new global procedure
        let isAtNewGlobalProcedure = false;
        let newGlobalProcedureToken: Token | null = null;

        // Look for a global procedure token at the current line
        for (const token of tokens) {
            if (token.line === currentLine &&
                (token.subType === TokenType.GlobalProcedure ||
                    (token as any)._isGlobalProcedure === true)) {
                isAtNewGlobalProcedure = true;
                newGlobalProcedureToken = token;
                break;
            }
        }

        // If we're at a new global procedure, pop the current global procedure
        // This ensures that when we encounter a new global procedure, we end the scope of the previous one
        if (isAtNewGlobalProcedure && currentGlobalProcedureIndex !== -1) {
            // Pop the current global procedure and everything after it
            parentStack.splice(currentGlobalProcedureIndex);

            // CRITICAL FIX: Mark that we need to reset lastMethodImplementation
            resetLastMethodImplementation = true;
            return;
        }

        // If we have method implementations, handle them specially
        let hasMethodImplementations = false;
        const checkForMethodImplementations = (symbolList: DocumentSymbol[]): boolean => {
            for (const sym of symbolList) {
                if ((sym as any)._isMethodImplementation ||
                    (sym.name.includes(' (Implementation)') && sym.kind === SymbolKind.Class)) {
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

        // If we have method implementations and global procedures, keep the global procedures
        // This ensures global procedures contain method implementations
        if (hasMethodImplementations && globalProcedureIndices.length > 0) {
            // Process the stack, but skip all global procedures
            let i = parentStack.length - 1;
            while (i >= 0) {
                // Skip global procedures
                if (globalProcedureIndices.includes(i)) {
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

        // Standard case: pop structures based on their finishesAt line
        let i = parentStack.length - 1;
        while (i >= 0) {
            const entry = parentStack[i];

            // Always pop special routines when we reach their finishesAt line
            const isSpecialRoutine = entry.symbol.kind === ClarionSymbolKind.Routine &&
                (entry.symbol as any)._isSpecialRoutine;

            // Don't pop the last method implementation if we're at the end of the file
            const isLastMethodImplementation = isEndOfFile &&
                methodImplementationIndices.length > 0 &&
                methodImplementationIndices[methodImplementationIndices.length - 1] === i;

            // Don't pop global procedures unless we're at a new global procedure or EOF
            const isGlobalProcedure = globalProcedureIndices.includes(i);
            const shouldPopGlobalProcedure = isGlobalProcedure &&
                (isAtNewGlobalProcedure || (isEndOfFile && i !== currentGlobalProcedureIndex));

            if (((entry.finishesAt !== undefined && currentLine > entry.finishesAt) ||
                isSpecialRoutine || shouldPopGlobalProcedure) &&
                !isLastMethodImplementation &&
                !(isGlobalProcedure && !shouldPopGlobalProcedure)) {
                parentStack.splice(i, 1);
            }
            i--;
        }

        // CRITICAL FIX: If we detected a new global procedure, reset lastMethodImplementation
        if (resetLastMethodImplementation) {
            // We need to communicate this back to the main method
            // Since we can't directly modify lastMethodImplementation here (it's in the parent scope)
            // We'll add a property to the first token in the current line
            for (const token of tokens) {
                if (token.line === currentLine) {
                    (token as any)._resetLastMethodImplementation = true;
                    break;
                }
            }
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
        } else if (upperValue === "MODULE") {
            // Extract file path from MODULE('filepath') if present
            let filePath = "";
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
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

                filePath = parenContent.join("").trim();
                // Remove quotes if present
                filePath = this.extractStringContents(filePath);
                displayName = labelName ? `MODULE('${filePath}') (${labelName})` : `MODULE('${filePath}')`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
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
        // INTERFACE support: no need for Properties/Methods containers
        else if (upperValue === "INTERFACE" && labelName) {
            this.classSymbolMap.set(labelName.toUpperCase(), structureSymbol);

            // For interfaces, we don't need to add Properties/Methods containers
            // since interfaces only declare methods
            // Just mark it as an interface for reference
            (structureSymbol as any)._isInterface = true;
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
        currentStructure: DocumentSymbol | null,
        subType: TokenType | undefined = undefined
    ): { procedureSymbol: DocumentSymbol, classImplementation: DocumentSymbol | null } {
        const token = tokens[index];
        const { line, finishesAt } = token;
        const prevToken = tokens[index - 1];
        const procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
        const classMatch = procedureName.includes('.') ? procedureName.split('.')[0] : null;

        let container: DocumentSymbol | null = null;
        let classImplementation: DocumentSymbol | null = null;

        // IMPORTANT: For method implementations, we need to handle them differently
        // to ensure they don't break procedure scope and improve breadcrumb navigation
        if (classMatch) {
            // This is a method implementation (e.g., ThisWindow.Init)
            // Find or create a class implementation container
            classImplementation = this.findOrCreateClassImplementation(
                symbols, classMatch, tokens, line, finishesAt ?? line
            );

            // Use the methods container as the parent
            const methodsContainer = (classImplementation as any).$clarionMethods || classImplementation;
            container = methodsContainer;

            // Mark this as a method implementation
            (token as any)._isMethodImplementation = true;
        } else {
            // For regular procedures (not class methods), use the current structure
            // CRITICAL FIX: Always promote GlobalProcedure to top-level
            if (token.subType === TokenType.GlobalProcedure || subType === TokenType.GlobalProcedure) {
                container = null; // <-- promotes it to top-level

                // Mark this as a global procedure so we can identify it later
                (token as any)._isGlobalProcedure = true;
            } else {
                container = currentStructure;
            }
        }

        // Extract the method name without the class prefix
        const shortName = classMatch ? procedureName.replace(`${classMatch}.`, "") : procedureName;

        // Extract just the parameters for all procedures (without the PROCEDURE keyword)
        // Extract just the parameters for all procedures (without the PROCEDURE keyword)
        let paramsOnly = "";
        let parenDepth = 0;
        let foundOpen = false;
        let j = index + 1;

        while (j < tokens.length) {
            const t = tokens[j];

            // Stop if we're on a new line and haven't opened the parens
            if (!foundOpen && t.line !== token.line) break;

            if (t.value === "(") {
                parenDepth++;
                foundOpen = true;
            } else if (t.value === ")") {
                parenDepth--;
            }

            if (foundOpen) {
                paramsOnly += t.value + " ";

                if (parenDepth === 0 && t.value === ")") {
                    break;
                }
            }

            j++;
        }

        paramsOnly = paramsOnly.trim();

        // Defensive fallback
        if (!paramsOnly || !paramsOnly.endsWith(")")) {
            paramsOnly = "()";
        }

        // Include just the parameters in the name for all procedures
        const displayName = `${shortName} ${paramsOnly}`;

        const procedureSymbol = this.createProcedureSymbol(
            tokens, displayName, classMatch, line, finishesAt ?? line, token.subType || subType
        );

        // For method implementations, mark the symbol
        if (classMatch) {
            (procedureSymbol as any)._isMethodImplementation = true;

            // CRITICAL FIX: Also set the subType to MethodImplementation
            // This ensures it's properly identified throughout the code
            procedureSymbol.detail = "";  // Empty detail since we're including it in the name
        } else if (token.subType === TokenType.GlobalProcedure || subType === TokenType.GlobalProcedure) {
            // Mark global procedures
            (procedureSymbol as any)._isGlobalProcedure = true;
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

        // First, check if we already have a class implementation container
        let classImplementation: DocumentSymbol | null = null;

        // Look for existing class implementation in symbols
        const findClassImplementation = (symbolList: DocumentSymbol[]): DocumentSymbol | null => {
            for (const symbol of symbolList) {
                if (symbol.name === fullName) {
                    return symbol;
                }

                // Also check children (for global procedures that might contain class implementations)
                if (symbol.children && symbol.children.length > 0) {
                    const found = findClassImplementation(symbol.children);
                    if (found) return found;
                }
            }
            return null;
        };

        classImplementation = findClassImplementation(symbols);

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

            // Find the most recent global procedure to attach this class implementation to
            let mostRecentGlobalProcedure: DocumentSymbol | null = null;

            for (const symbol of symbols) {
                if (symbol.kind === SymbolKind.Function &&
                    (symbol as any)._isGlobalProcedure === true) {
                    mostRecentGlobalProcedure = symbol;
                }
            }

            // If we found a global procedure, add the class implementation as its child
            if (mostRecentGlobalProcedure) {
                mostRecentGlobalProcedure.children!.push(classImplementation);
            } else {
                // Otherwise add to top-level symbols
                symbols.push(classImplementation);
            }
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
        endLine: number,
        subType?: TokenType
    ): DocumentSymbol {
        const range = this.getTokenRange(tokens, startLine, endLine);

        // Improve breadcrumb navigation by providing better context
        let displayName = name;
        let detail = "";

        // For method implementations, keep the full name including parameters
        if (isClassMethod) {
            // Keep the full name with parameters for better visibility
            displayName = name;
            detail = "";  // Empty detail since we're including it in the name
        } else {
            // For global procedures, provide context in the detail
            detail = this.describeSubType(subType);

            // If it's a global procedure, add that context to the detail
            if (subType === TokenType.GlobalProcedure) {
                detail = detail ? `${detail} (Global)` : "Global Procedure";
            }
        }

        return DocumentSymbol.create(
            displayName,
            detail,
            this.mapSubTypeToSymbolKind(subType),
            range,
            // Use a more precise selection range for better navigation
            this.getTokenRange(tokens, startLine, startLine),
            []
        );
    }

    private handleProcedureDefinitionToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null
    ): DocumentSymbol {

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
            if (t.value === "(" || t.value === ")") {
                detail += t.value;
            }
            else {
                detail += t.value + " ";
            }
            j++;
        }

        // 🔧 Strip comment manually if present
        const commentIndex = detail.indexOf("!");
        if (commentIndex !== -1) {
            detail = detail.substring(0, commentIndex);
        }

        detail = detail.trim();

        // CRITICAL FIX: Use the appropriate symbol kind based on the token's subType
        let symbolKind = ClarionSymbolKind.Property;

        // Check if this is a method declaration
        if (token.subType === TokenType.MethodDeclaration ||
            token.subType === TokenType.InterfaceMethod ||
            token.subType === TokenType.MapProcedure) {
            symbolKind = ClarionSymbolKind.Method;
        }

        // Format the detail to show the full procedure declaration
        const formattedDetail = detail ? `PROCEDURE${detail}` : "PROCEDURE()";

        // Improve breadcrumb navigation by separating name and detail
        // Include just the parameters in the display name (without the PROCEDURE keyword)
        const displayName = `${procedureDefName} ${detail}`;

        const procedureDefSymbol = DocumentSymbol.create(
            displayName,
            formattedDetail,  // Move the procedure details to the detail field for better breadcrumb
            symbolKind,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            // Use a more precise selection range for better navigation
            this.getTokenRange(tokens, line, line),
            []
        );

        // Mark method declarations
        if (token.subType === TokenType.MethodDeclaration) {
            (procedureDefSymbol as any)._isMethodDeclaration = true;
        }

        // Store finishesAt value for procedure definitions if available
        if (finishesAt !== undefined) {
            (procedureDefSymbol as any)._finishesAt = finishesAt;
        }

        // ✅ Prefer attaching to MODULE if that's the current structure
        if (currentStructure?.name?.startsWith("MODULE")) {
            currentStructure.children!.push(procedureDefSymbol);
            return procedureDefSymbol;
        }

        // ✅ Otherwise fallback to class/interface method grouping
        const parentSymbol = this.findSymbolForParentToken(parent, symbols, line);
        let methodTarget = parentSymbol;

        // CRITICAL FIX: Handle interface methods differently
        if (parentSymbol?.kind === ClarionSymbolKind.Class && !(parentSymbol as any)._isInterface) {
            // For classes, use the Methods container
            methodTarget = parentSymbol.children?.find(c =>
                c.name === "Methods" && c.kind === SymbolKind.Method
            ) ?? parentSymbol;
        }
        // For interfaces, use the interface directly as the target
        // No need for a Methods container

        this.addSymbolToParent(procedureDefSymbol, methodTarget, symbols);
        return procedureDefSymbol;
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
        currentProcedure: DocumentSymbol | null,
        lastMethodImplementation: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;
        const prevToken = tokens[index - 1];

        if (prevToken?.type === TokenType.Label) {
            // CRITICAL FIX: Capture the entire line for variable types
            // This ensures we get the full type definition including attributes
            let fullType = "";
            let j = index;

            // Process to the end of the line or until a comment
            while (j < tokens.length) {
                const t = tokens[j];

                // Stop at the end of the line or a comment
                if (t.line !== line || t.type === TokenType.Comment) {
                    break;
                }

                // Add the token value to the type
                fullType += t.value;// + " ";
                j++;
            }

            // Clean up the type
            fullType = fullType.trim();

            // Remove any trailing comments
            const commentIndex = fullType.indexOf("!");
            if (commentIndex !== -1) {
                fullType = fullType.substring(0, commentIndex).trim();
            }
            fullType = fullType.trim();
            // CRITICAL FIX: Include the variable type in the name
            // This ensures it's displayed in the outline view
            const displayName = `${prevToken.value} ${fullType}`;

            const variableSymbol = DocumentSymbol.create(
                displayName,  // Include the variable type in the name
                "",  // Empty detail since we're including it in the name
                ClarionSymbolKind.Variable,
                this.getTokenRange(tokens, prevToken.line, line),
                this.getTokenRange(tokens, prevToken.line, line),
                []
            );

            // CRITICAL FIX: Prioritize currentProcedure over currentStructure
            // This ensures variables are attached to the method implementation they're defined in
            let target: DocumentSymbol | null = null;

            if (currentProcedure) {
                // If we're in a procedure, attach to it
                target = currentProcedure;
            } else if (lastMethodImplementation) {
                // If we're not in a procedure but we have a last method implementation,
                // use that as the target for variables
                target = lastMethodImplementation;
            } else if (currentStructure) {
                // Don't attach to special routines
                if (currentStructure.kind === ClarionSymbolKind.Routine &&
                    (currentStructure as any)._isSpecialRoutine) {
                    // Skip special routines and look for a better parent

                    // First, try to find a global procedure in the symbols
                    for (const symbol of symbols) {
                        if (symbol.kind === SymbolKind.Function &&
                            (symbol as any)._isGlobalProcedure === true) {
                            target = symbol;
                            break;
                        }
                    }

                    // If no global procedure, try any procedure
                    if (!target) {
                        for (const symbol of symbols) {
                            if (symbol.kind === SymbolKind.Function) {
                                target = symbol;
                                break;
                            }
                        }
                    }

                    // If we still don't have a target, use the top level
                    if (!target) {
                        symbols.push(variableSymbol);
                        return;
                    }
                } else {
                    // Otherwise, attach to the current structure
                    target = currentStructure;
                }
            } else {
                // If no current structure or procedure, look for the most recent global procedure
                let mostRecentGlobalProcedure: DocumentSymbol | null = null;

                // Find the most recent global procedure by looking at all top-level symbols
                for (const symbol of symbols) {
                    if (symbol.kind === SymbolKind.Function &&
                        (symbol as any)._isGlobalProcedure === true) {
                        mostRecentGlobalProcedure = symbol;
                    }
                }

                if (mostRecentGlobalProcedure) {
                    target = mostRecentGlobalProcedure;
                }
            }

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
        const isVariable = symbol.kind === ClarionSymbolKind.Variable;

        // Check if this is a method - either explicitly marked as Method kind or
        // it's a procedure with "Method" in its detail
        const isMethod = symbol.kind === SymbolKind.Function &&
            (symbol.name.includes('.') || symbol.detail?.includes("Method"));

        // CRITICAL FIX: Also check if this is a method declaration
        const isMethodDeclaration = symbol.kind === ClarionSymbolKind.Method ||
            (symbol as any)._isMethodDeclaration === true;

        const isClassImplementation = parent?.name.includes(" (Implementation)");
        const isMethodImplementation = (parent as any)?._isMethodImplementation === true;

        // CRITICAL FIX: Set sortText for all symbols based on name
        // For variables with types, use just the variable name for sorting
        let sortName = symbol.name;
        if (isVariable && symbol.name.includes('  ')) {
            // Extract just the variable name for sorting
            sortName = symbol.name.split('  ')[0];
        }

        (symbol as any).sortText = sortName.toLowerCase();

        // Enhance breadcrumb navigation by improving symbol details
        if (!symbol.detail && parent) {
            // Add context information to the detail for better breadcrumb navigation
            if (isMethod || isMethodDeclaration) {
                if (!symbol.detail) {
                    symbol.detail = `in ${parent.name}`;
                }
            } else if (isVariable) {
                // For variables, add the parent context if not already present
                if (!symbol.detail && parent.name) {
                    symbol.detail = `in ${parent.name}`;
                }
            }
        }

        if (parent) {
            // CRITICAL FIX: Check if parent is a method implementation
            // If so, add variables directly to it, not to a properties container
            if (isVariable && isMethodImplementation) {
                // Variables in method implementations go directly into the method
                parent.children!.push(symbol);
            }
            // Handle class properties (but not for method implementations)
            else if (isVariable && (parent as any).$clarionProps && !isMethodImplementation) {
                const propsContainer = (parent as any).$clarionProps;
                propsContainer.children!.push(symbol);
                this.sortContainerChildren(propsContainer);
            }

            // Handle methods (in class or class implementation containers)
            else if ((isMethod || isMethodDeclaration) &&
                ((parent as any).$clarionMethods || isClassImplementation)) {
                let methodsContainer;

                if ((parent as any).$clarionMethods) {
                    methodsContainer = (parent as any).$clarionMethods;
                } else if (isClassImplementation) {
                    methodsContainer = parent.children!.find(c => c.name === "Methods") || parent;
                } else {
                    methodsContainer = parent;
                }

                methodsContainer.children!.push(symbol);
                if (methodsContainer !== parent) {
                    this.sortContainerChildren(methodsContainer);
                }
            }
            // CRITICAL FIX: Handle interface methods
            else if ((isMethod || isMethodDeclaration) && (parent as any)._isInterface) {
                // For interfaces, add methods directly to the interface
                // No need for a Methods container
                parent.children!.push(symbol);
                this.sortContainerChildren(parent);
            }

            // Regular symbols go straight into parent
            else {
                parent.children!.push(symbol);
            }
        } else {
            // No parent — this becomes a top-level node
            symbols.push(symbol);

            // For top-level symbols, ensure they have appropriate detail
            if (!symbol.detail) {
                if (isMethod || symbol.kind === ClarionSymbolKind.Procedure) {
                    symbol.detail = "Global Procedure";
                }
            }
        }
    }

    /**
     * Sort children of a container alphabetically
     */
    private sortContainerChildren(container: DocumentSymbol): void {
        if (!container.children || container.children.length <= 1) {
            return; // Nothing to sort
        }

        // CRITICAL FIX: Sort children alphabetically, but for variables with types,
        // use just the variable name for sorting
        container.children.sort((a: DocumentSymbol, b: DocumentSymbol) => {
            let aName = a.name;
            let bName = b.name;

            // For variables with types, extract just the variable name for sorting
            if (a.kind === ClarionSymbolKind.Variable && aName.includes('  ')) {
                aName = aName.split('  ')[0];
            }

            if (b.kind === ClarionSymbolKind.Variable && bName.includes('  ')) {
                bName = bName.split('  ')[0];
            }

            return aName.localeCompare(bName, undefined, { sensitivity: "base" });
        });

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
    private mapSubTypeToSymbolKind(subType?: TokenType): SymbolKind {
        switch (subType) {
            case TokenType.MethodImplementation:
            case TokenType.MethodDeclaration:
            case TokenType.InterfaceMethod:
            case TokenType.MapProcedure:
                // CRITICAL FIX: Ensure method declarations are consistently treated as methods
                return ClarionSymbolKind.Method;
            case TokenType.GlobalProcedure:
            case TokenType.Procedure:
                return ClarionSymbolKind.Procedure;
            case TokenType.Routine:
                return ClarionSymbolKind.Routine;
            default:
                return ClarionSymbolKind.Procedure;
        }
    }

    private describeSubType(subType?: TokenType): string {
        switch (subType) {
            case TokenType.MethodImplementation: return "Method (Implementation)";
            case TokenType.MethodDeclaration: return "Method (Declaration)";
            case TokenType.InterfaceMethod: return "Interface Method";
            case TokenType.MapProcedure: return "MAP Method";
            case TokenType.GlobalProcedure: return "Procedure";
            case TokenType.Procedure: return "Procedure";
            case TokenType.Routine: return "Routine";
            default: return "Procedure";
        }
    }

}
