import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("error");
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
    ROUTINE: SymbolKind.Method,
    VIEW: SymbolKind.Array,             // 📋
    FILE: SymbolKind.File,              // 📁
    BUTTON: SymbolKind.Boolean,         // 🔘
    LIST: SymbolKind.Array,             // 📋
    ITEM: SymbolKind.EnumMember,        // #
    STRING: SymbolKind.String           // 📝
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
        
        // 🚀 PERFORMANCE: Build token index by line to avoid O(n²) lookups
        const perfIndexStart = performance.now();
        const tokensByLine = new Map<number, Token[]>();
        for (const token of tokens) {
            if (!tokensByLine.has(token.line)) {
                tokensByLine.set(token.line, []);
            }
            tokensByLine.get(token.line)!.push(token);
        }
        const perfIndexTime = performance.now() - perfIndexStart;
        logger.perf('Symbol: build index', { time_ms: perfIndexTime.toFixed(2), lines: tokensByLine.size });
        
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
                this.checkAndPopCompletedStructures(parentStack, line, symbols, tokens, tokensByLine);

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
                
                // Special handling for MAP and MODULE structures
                if (value.toUpperCase() === "MAP" || value.toUpperCase() === "MODULE") {
                    // Look ahead for procedure declarations inside this structure
                    let j = i + 1;
                    let endFound = false;
                    
                    while (j < tokens.length && !endFound) {
                        const nextToken = tokens[j];
                        
                        // Stop if we hit an END statement for this structure
                        if (nextToken.type === TokenType.EndStatement &&
                            nextToken.line > line &&
                            !tokens.slice(i+1, j).some(t => t.type === TokenType.Structure)) {
                            endFound = true;
                            break;
                        }
                        
                        // If we find a procedure declaration with PROCEDURE keyword, mark it
                        if (nextToken.type === TokenType.Keyword &&
                            nextToken.value.toUpperCase() === "PROCEDURE") {
                            // Mark this as a MAP/MODULE procedure
                            nextToken.subType = TokenType.MapProcedure;
                            logger.info(`Marked procedure at line ${nextToken.line} as MAP/MODULE procedure`);
                        }
                        // Special case for MAP: Look for procedure declarations without PROCEDURE keyword
                        // Format: ProcedureName(parameters),returnType
                        else if (nextToken.type === TokenType.Label &&
                                j + 1 < tokens.length &&
                                tokens[j + 1].value === "(") {
                            // This looks like a procedure declaration in shorthand MAP syntax
                            nextToken.subType = TokenType.MapProcedure;
                            logger.info(`Marked shorthand procedure ${nextToken.value} at line ${nextToken.line} as MAP/MODULE procedure`);
                        }
                        
                        j++;
                    }
                }
                
                continue;
            }

            if (type === TokenType.WindowElement) {
                this.handleWindowElementToken(tokens, i, symbols, currentProcedure, currentStructure);
                continue;
            }
            if (type === TokenType.PropertyFunction && value.toUpperCase() === "PROJECT") {
                this.handleProjectToken(tokens, i, symbols, currentProcedure, currentStructure);
                continue;
            }
            if (type === TokenType.Keyword && value.toUpperCase() === "KEY") {
                this.handleKeyToken(tokens, i, symbols, currentProcedure, currentStructure);
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
                currentStructure?.name?.startsWith("MODULE") ||
                currentStructure?.name?.startsWith("MAP");
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

        // Create a more descriptive display name that shows the field being projected
        const displayName = `PROJECT(${projectValue})`;

        const projectSymbol = DocumentSymbol.create(
            displayName,
            "", // Empty detail since we're including it in the name
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
        tokens: Token[],
        tokensByLine: Map<number, Token[]>
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

        // 🚀 PERFORMANCE: Use indexed lookup instead of looping through all tokens
        const lineTokens = tokensByLine.get(currentLine) || [];
        for (const token of lineTokens) {
            if (token.subType === TokenType.GlobalProcedure ||
                (token as any)._isGlobalProcedure === true) {
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
        // Handle UI controls that are one-liners (no END statement)
        // BUTTON is now handled by WindowElement token type
        const oneLineControls: string[] = [];
        const isOneLineControl = oneLineControls.includes(value.toUpperCase());


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
        } else if (upperValue === "TAB") {
            // Extract tab name from TAB('Tracking') syntax
            let tabName = "";
            let useParam = "";

            // First, look for the tab name in parentheses
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

                tabName = parenContent.join("").trim();
                // Remove quotes if present
                tabName = this.extractStringContents(tabName);

                // Now look for USE parameter after the tab name
                // Search for USE token after the TAB declaration
                while (j < tokens.length) {
                    const t = tokens[j];

                    // Stop if we hit a new line or another structure
                    if (t.line !== line && t.line !== line + 1) break;
                    if (t.type === TokenType.Structure && t !== token) break;

                    // Look for USE token
                    if (t.value.toUpperCase() === "USE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                        // Extract the USE parameter
                        const useContent: string[] = [];
                        let k = j + 2;
                        let useParenDepth = 1;

                        while (k < tokens.length && useParenDepth > 0) {
                            const useToken = tokens[k];
                            if (useToken.value === "(") useParenDepth++;
                            else if (useToken.value === ")") useParenDepth--;

                            if (useParenDepth > 0) useContent.push(useToken.value);
                            k++;
                        }

                        useParam = useContent.join("").trim();
                        break;
                    }

                    j++;
                }

                // Create a display name with the tab name and USE parameter
                if (tabName && useParam) {
                    displayName = `TAB('${tabName}') USE(${useParam})`;
                } else if (tabName) {
                    displayName = `TAB('${tabName}')`;
                } else {
                    displayName = labelName ? `${value} (${labelName})` : value;
                }
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "MENU") {
            // For MENU elements like: MENU('&File'),USE(?FileMenu)
            let menuText = "";
            let useParam = "";

            // First, look for the menu text in parentheses
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

                menuText = parenContent.join("").trim();
                // Remove quotes if present
                menuText = this.extractStringContents(menuText);

                // Now look for USE parameter after the menu text
                // Search for USE token after the MENU declaration
                while (j < tokens.length) {
                    const t = tokens[j];

                    // Stop if we hit a new line or another structure
                    if (t.line !== line && t.line !== line + 1) break;
                    if (t.type === TokenType.Structure && t !== token) break;

                    // Look for USE token
                    if (t.value.toUpperCase() === "USE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                        // Extract the USE parameter
                        const useContent: string[] = [];
                        let k = j + 2;
                        let useParenDepth = 1;

                        while (k < tokens.length && useParenDepth > 0) {
                            const useToken = tokens[k];
                            if (useToken.value === "(") useParenDepth++;
                            else if (useToken.value === ")") useParenDepth--;

                            if (useParenDepth > 0) useContent.push(useToken.value);
                            k++;
                        }

                        useParam = useContent.join("").trim();
                        break;
                    }

                    j++;
                }

                // Create a display name with the menu text and USE parameter
                if (menuText && useParam) {
                    displayName = `MENU('${menuText}') USE(${useParam})`;
                } else if (menuText) {
                    displayName = `MENU('${menuText}')`;
                } else {
                    displayName = labelName ? `${value} (${labelName})` : value;
                }
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "SHEET") {
            // For SHEET elements like: SHEET,AT(0,0,758,387),USE(?WindowSheet),NOSHEET,WIZARD
            let useParam = "";

            // Look for the USE attribute in the tokens following the SHEET token
            let j = index + 1;

            // Continue until we hit a new line or another structure
            while (j < tokens.length) {
                const t = tokens[j];

                // Stop if we hit a new line or another structure
                if (t.line !== line && t.line !== line + 1) break;
                if (t.type === TokenType.Structure && t !== token) break;

                // Look for USE token
                if (t.value.toUpperCase() === "USE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                    // Extract the USE parameter
                    const useContent: string[] = [];
                    let k = j + 2;
                    let useParenDepth = 1;

                    while (k < tokens.length && useParenDepth > 0) {
                        const useToken = tokens[k];
                        if (useToken.value === "(") useParenDepth++;
                        else if (useToken.value === ")") useParenDepth--;

                        if (useParenDepth > 0) useContent.push(useToken.value);
                        k++;
                    }

                    useParam = useContent.join("").trim();
                    break;
                }

                j++;
            }

            // Create a display name with the USE parameter
            if (useParam) {
                displayName = `SHEET USE(${useParam})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "OLE") {
            // For OLE elements like: OLE,AT(3,2,753,229),USE(?SchedulerControl),COMPATIBILITY(021H)
            let useParam = "";

            // Look for the USE attribute in the tokens following the OLE token
            let j = index + 1;

            // Continue until we hit a new line or another structure
            while (j < tokens.length) {
                const t = tokens[j];

                // Stop if we hit a new line or another structure
                if (t.line !== line && t.line !== line + 1) break;
                if (t.type === TokenType.Structure && t !== token) break;

                // Look for USE token
                if (t.value.toUpperCase() === "USE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                    // Extract the USE parameter
                    const useContent: string[] = [];
                    let k = j + 2;
                    let useParenDepth = 1;

                    while (k < tokens.length && useParenDepth > 0) {
                        const useToken = tokens[k];
                        if (useToken.value === "(") useParenDepth++;
                        else if (useToken.value === ")") useParenDepth--;

                        if (useParenDepth > 0) useContent.push(useToken.value);
                        k++;
                    }

                    useParam = useContent.join("").trim();
                    break;
                }

                j++;
            }

            // Create a display name with the USE parameter
            if (useParam) {
                displayName = `OLE USE(${useParam})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "MENUBAR") {
            // For MENUBAR elements like: MENUBAR,USE(?Menubar)
            let useParam = "";

            // Look for the USE attribute in the tokens following the MENUBAR token
            let j = index + 1;

            // Continue until we hit a new line or another structure
            while (j < tokens.length) {
                const t = tokens[j];

                // Stop if we hit a new line or another structure
                if (t.line !== line && t.line !== line + 1) break;
                if (t.type === TokenType.Structure && t !== token) break;

                // Look for USE token
                if (t.value.toUpperCase() === "USE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                    // Extract the USE parameter
                    const useContent: string[] = [];
                    let k = j + 2;
                    let useParenDepth = 1;

                    while (k < tokens.length && useParenDepth > 0) {
                        const useToken = tokens[k];
                        if (useToken.value === "(") useParenDepth++;
                        else if (useToken.value === ")") useParenDepth--;

                        if (useParenDepth > 0) useContent.push(useToken.value);
                        k++;
                    }

                    useParam = useContent.join("").trim();
                    break;
                }

                j++;
            }

            // Create a display name with the USE parameter
            if (useParam) {
                displayName = `MENUBAR USE(${useParam})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "WINDOW" || upperValue === "APPLICATION") {
            // For WINDOW elements like: WINDOW('Accura scheduling'),AT(,,759,389),FONT('Segoe UI',8,,FONT:regular),RESIZE,ALRT(CtrlZ)
            // or APPLICATION elements which are similar
            let title = "";

            // Look for the title in parentheses
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

                title = parenContent.join("").trim();
                // Remove quotes if present
                title = this.extractStringContents(title);

                // Create a display name with the title and label
                if (title) {
                    displayName = labelName ?
                        `${value}('${title}') (${labelName})` :
                        `${value}('${title}')`;
                } else {
                    displayName = labelName ? `${value} (${labelName})` : value;
                }
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "VIEW") {
            // For VIEW elements like: VIEW(Entries)
            let viewFile = "";

            // Look for the file name in parentheses
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

                viewFile = parenContent.join("").trim();

                // Create a display name with the view file
                if (viewFile) {
                    displayName = labelName ?
                        `${value}(${viewFile}) (${labelName})` :
                        `${value}(${viewFile})`;
                } else {
                    displayName = labelName ? `${value} (${labelName})` : value;
                }
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "FILE") {
            // For FILE elements like: FILE,DRIVER('TOPSPEED'),PRE(SHI),CREATE,BINDABLE,THREAD
            let driverValue = "";
            let preValue = "";

            // Look for DRIVER and PRE attributes in the tokens following the FILE token
            let j = index + 1;

            // Continue until we hit a new line or another structure
            while (j < tokens.length) {
                const t = tokens[j];

                // Stop if we hit a new line or another structure
                if (t.line !== line && t.line !== line + 1) break;
                if (t.type === TokenType.Structure && t !== token) break;

                // Look for DRIVER token
                if (t.value.toUpperCase() === "DRIVER" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                    // Extract the DRIVER parameter
                    const driverContent: string[] = [];
                    let k = j + 2;
                    let driverParenDepth = 1;

                    while (k < tokens.length && driverParenDepth > 0) {
                        const driverToken = tokens[k];
                        if (driverToken.value === "(") driverParenDepth++;
                        else if (driverToken.value === ")") driverParenDepth--;

                        if (driverParenDepth > 0) driverContent.push(driverToken.value);
                        k++;
                    }

                    driverValue = driverContent.join("").trim();
                    // Remove quotes if present
                    driverValue = this.extractStringContents(driverValue);
                }

                // Look for PRE token
                if (t.value.toUpperCase() === "PRE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                    // Extract the PRE parameter
                    const preContent: string[] = [];
                    let k = j + 2;
                    let preParenDepth = 1;

                    while (k < tokens.length && preParenDepth > 0) {
                        const preToken = tokens[k];
                        if (preToken.value === "(") preParenDepth++;
                        else if (preToken.value === ")") preParenDepth--;

                        if (preParenDepth > 0) preContent.push(preToken.value);
                        k++;
                    }

                    preValue = preContent.join("").trim();
                }

                j++;
            }

            // Create a display name with the DRIVER and PRE values
            let displayParts = [];

            if (labelName) {
                displayParts.push(`FILE (${labelName})`);
            } else {
                displayParts.push("FILE");
            }

            if (driverValue) {
                displayParts.push(driverValue);
            }

            if (preValue) {
                displayParts.push(`PRE(${preValue})`);
            }

            displayName = displayParts.join(",");
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
        // MAP support: add Functions container to organize MAP procedures
        else if (upperValue === "MAP") {
            const functionsContainer = DocumentSymbol.create(
                "Functions",
                "",
                SymbolKind.Function,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            (functionsContainer as any).sortText = "0001";

            // Store the functions container for easy access
            (structureSymbol as any).$clarionFunctions = functionsContainer;
            structureSymbol.children!.push(functionsContainer);
        }
        // MODULE support: add Functions container to organize MODULE procedures
        else if (upperValue === "MODULE") {
            const functionsContainer = DocumentSymbol.create(
                "Functions",
                "",
                SymbolKind.Function,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            (functionsContainer as any).sortText = "0001";

            // Store the functions container for easy access
            (structureSymbol as any).$clarionFunctions = functionsContainer;
            structureSymbol.children!.push(functionsContainer);
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
        const methodName = classMatch ? procedureName.replace(`${classMatch}.`, "") : procedureName;

        let container: DocumentSymbol | null = null;
        let classImplementation: DocumentSymbol | null = null;

        // IMPORTANT: For method implementations, we need to handle them differently
        if (classMatch) {
            // This is a method implementation (e.g., ThisWindow.Init)
            // First, try to find the class definition in the symbols
            const classDefinition = this.findClassDefinition(symbols, classMatch);
            
            if (classDefinition) {
                // If we found the class definition, look for the method declaration
                const methodsContainer = classDefinition.children?.find(c => c.name === "Methods");
                
                if (methodsContainer) {
                    // Look for the method declaration by name (without parameters)
                    const methodDeclaration = methodsContainer.children?.find(m => {
                        // Extract just the method name without parameters
                        const mName = m.name.split(' ')[0];
                        return mName === methodName;
                    });
                    
                    if (methodDeclaration) {
                        // We found the method declaration, use it as the container
                        container = methodDeclaration;
                        
                        // Mark this as a method implementation
                        (token as any)._isMethodImplementation = true;
                        
                        // We don't need to create a class implementation container
                        classImplementation = null;
                    } else {
                        // Method declaration not found, fall back to the old behavior
                        classImplementation = this.findOrCreateClassImplementation(
                            symbols, classMatch, tokens, line, finishesAt ?? line
                        );
                        
                        // Use the methods container as the parent
                        const implMethodsContainer = (classImplementation as any).$clarionMethods || classImplementation;
                        container = implMethodsContainer;
                        
                        // Mark this as a method implementation
                        (token as any)._isMethodImplementation = true;
                    }
                } else {
                    // Methods container not found, fall back to the old behavior
                    classImplementation = this.findOrCreateClassImplementation(
                        symbols, classMatch, tokens, line, finishesAt ?? line
                    );
                    
                    // Use the methods container as the parent
                    const implMethodsContainer = (classImplementation as any).$clarionMethods || classImplementation;
                    container = implMethodsContainer;
                    
                    // Mark this as a method implementation
                    (token as any)._isMethodImplementation = true;
                }
            } else {
                // Class definition not found, fall back to the old behavior
                classImplementation = this.findOrCreateClassImplementation(
                    symbols, classMatch, tokens, line, finishesAt ?? line
                );
                
                // Use the methods container as the parent
                const implMethodsContainer = (classImplementation as any).$clarionMethods || classImplementation;
                container = implMethodsContainer;
                
                // Mark this as a method implementation
                (token as any)._isMethodImplementation = true;
            }
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
        const displayName = `${methodName} ${paramsOnly}`;

        const procedureSymbol = this.createProcedureSymbol(
            tokens, displayName, classMatch, line, finishesAt ?? line, token.subType || subType
        );

        // For method implementations, mark the symbol
        if (classMatch) {
            (procedureSymbol as any)._isMethodImplementation = true;
            
            // If this is a method implementation and we found the declaration,
            // set the detail to "Implementation" to distinguish it
            if (container && container !== (classImplementation as any)?.$clarionMethods) {
                procedureSymbol.detail = "Implementation";
            } else {
                procedureSymbol.detail = "";  // Empty detail since we're including it in the name
            }
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
    
    /**
     * Find a class definition symbol by name
     */
    private findClassDefinition(symbols: DocumentSymbol[], className: string): DocumentSymbol | null {
        // First check the class symbol map
        const classSymbol = this.classSymbolMap.get(className.toUpperCase());
        if (classSymbol) {
            return classSymbol;
        }
        
        // If not found in the map, search through all symbols recursively
        const findInSymbols = (symbolList: DocumentSymbol[]): DocumentSymbol | null => {
            for (const symbol of symbolList) {
                // Check if this is a class with the matching name
                if (symbol.kind === SymbolKind.Class) {
                    const symbolName = symbol.name.split(' ')[0]; // Get name without any suffix
                    if (symbolName.toUpperCase() === className.toUpperCase()) {
                        return symbol;
                    }
                }
                
                // Check children recursively
                if (symbol.children && symbol.children.length > 0) {
                    const found = findInSymbols(symbol.children);
                    if (found) return found;
                }
            }
            return null;
        };
        
        return findInSymbols(symbols);
    }

    private findOrCreateClassImplementation(
        symbols: DocumentSymbol[],
        className: string,
        tokens: Token[],
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        // First, try to find the class definition
        const classDefinition = this.findClassDefinition(symbols, className);
        
        // If we found the class definition, use it instead of creating a separate implementation container
        if (classDefinition) {
            // Make sure the class has a Methods container
            let methodsContainer = classDefinition.children?.find(c => c.name === "Methods");
            
            if (!methodsContainer) {
                // Create a Methods container if it doesn't exist
                methodsContainer = DocumentSymbol.create(
                    "Methods",
                    "",
                    SymbolKind.Method,
                    classDefinition.range,
                    classDefinition.range,
                    []
                );
                (methodsContainer as any).sortText = "0002";
                classDefinition.children!.push(methodsContainer);
                (classDefinition as any).$clarionMethods = methodsContainer;
            }
            
            // Update the range to encompass the implementation
            if (startLine < classDefinition.range.start.line) {
                classDefinition.range.start.line = startLine;
                classDefinition.selectionRange.start.line = startLine;
            }
            if (endLine > classDefinition.range.end.line) {
                classDefinition.range.end.line = endLine;
                classDefinition.selectionRange.end.line = endLine;
            }
            
            return classDefinition;
        }
        
        // If no class definition was found, fall back to the original implementation
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
        // Mark MAP procedures for special handling
        const isMapProcedure = currentStructure?.name?.startsWith("MAP") ||
                               currentStructure?.name === "Functions";
                                
        // Mark MODULE procedures for special handling
        const isModuleProcedure = currentStructure?.name?.startsWith("MODULE") ||
                                  currentStructure?.name === "Functions";

        const token = tokens[index];
        const { line, finishesAt, parent } = token;
        const prevToken = tokens[index - 1];
        
        // Handle both standard procedure declarations and MAP shorthand syntax
        let procedureDefName;
        
        if (token.subType === TokenType.MapProcedure) {
            // This is a MAP shorthand procedure declaration (without PROCEDURE keyword)
            // Use token.label which was set in DocumentStructure.processShorthandProcedures
            procedureDefName = token.label || token.value;
        } else {
            // Standard procedure declaration with PROCEDURE keyword
            procedureDefName = token.label ? token.label : "UnnamedDefinition";
        }

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

        // For MAP shorthand syntax, we need to extract the full definition from the token value
        let fullDefinition = "";
        
        if (token.subType === TokenType.MapProcedure) {
            // For MAP shorthand syntax, extract everything after the procedure name
            // This includes parameters, return type, and any other attributes
            if (token.value && token.value.includes("(")) {
                // Extract everything from the opening parenthesis onwards
                const startIndex = token.value.indexOf("(");
                fullDefinition = token.value.substring(startIndex);
            } else {
                // Fallback to the detail if we can't extract from token.value
                fullDefinition = detail ? detail : "()";
            }
        } else {
            // For standard syntax, use the detail
            fullDefinition = detail ? detail : "()";
        }

        // Improve breadcrumb navigation by separating name and detail
        // Include the full definition in the display name
        const displayName = `${procedureDefName} ${fullDefinition}`;

        const procedureDefSymbol = DocumentSymbol.create(
            displayName,
            "Declaration",  // Mark as Declaration to distinguish from Implementation
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
        
        // Mark MAP procedures
        if (isMapProcedure || token.subType === TokenType.MapProcedure) {
            (procedureDefSymbol as any)._isMapProcedure = true;
        }

        // Store finishesAt value for procedure definitions if available
        if (finishesAt !== undefined) {
            (procedureDefSymbol as any)._finishesAt = finishesAt;
        }

        // ✅ Prefer attaching to MODULE or MAP if that's the current structure
        if (currentStructure?.name?.startsWith("MODULE") ||
            currentStructure?.name === "Functions") {
            
            // If we're already in the Functions container, add directly to it
            if (currentStructure?.name === "Functions") {
                currentStructure.children!.push(procedureDefSymbol);
            }
            // Otherwise, use the Functions container if available
            else if ((currentStructure as any).$clarionFunctions) {
                (currentStructure as any).$clarionFunctions.children!.push(procedureDefSymbol);
            } else {
                currentStructure.children!.push(procedureDefSymbol);
            }
            return procedureDefSymbol;
        } else if (currentStructure?.name?.startsWith("MAP") ||
                  currentStructure?.name === "Functions") {
            
            // If we're already in the Functions container, add directly to it
            if (currentStructure?.name === "Functions") {
                currentStructure.children!.push(procedureDefSymbol);
            }
            // Otherwise, use the Functions container if available
            else if ((currentStructure as any).$clarionFunctions) {
                (currentStructure as any).$clarionFunctions.children!.push(procedureDefSymbol);
            } else {
                currentStructure.children!.push(procedureDefSymbol);
            }
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

    /**
     * Handle KEY tokens to extract key field and options
     */
    private handleKeyToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentProcedure: DocumentSymbol | null,
        currentStructure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;
        const prevToken = tokens[index - 1];
        const labelName = prevToken?.type === TokenType.Label ? prevToken.value : null;

        // Extract what's inside the parentheses: KEY(SHI:ShipperCode)
        let keyField = "";
        const keyOptions: string[] = [];

        // Look for the key field in parentheses
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

            keyField = parenContent.join("").trim();

            // Now collect all options after the key field until end of line or another structure
            while (j < tokens.length) {
                const t = tokens[j];

                // Stop if we hit a new line or another structure
                if (t.line !== line) break;
                if (t.type === TokenType.Structure) break;

                // Skip commas
                if (t.value !== ",") {
                    keyOptions.push(t.value);
                }

                j++;
            }
        }

        // Create a display name with the key field and options
        let displayParts = [];

        if (labelName) {
            displayParts.push(`KEY(${labelName})`);
        } else {
            displayParts.push("KEY");
        }

        if (keyField) {
            displayParts.push(`(${keyField})`);
        }

        if (keyOptions.length > 0) {
            displayParts.push(keyOptions.join(","));
        }

        const displayName = displayParts.join(",");

        const keySymbol = DocumentSymbol.create(
            displayName,
            "",  // Empty detail since we're including it in the name
            SymbolKind.Key,
            this.getTokenRange(tokens, line, line),
            this.getTokenRange(tokens, line, line),
            []
        );

        const target = currentStructure || currentProcedure;
        this.addSymbolToParent(keySymbol, target, symbols);
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

        // Check if this is a MAP procedure
        const isMapProcedure = symbol.kind === SymbolKind.Function &&
            (symbol as any)._isMapProcedure === true;

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
            // Handle MAP and MODULE procedures
            else if (isMapProcedure ||
                    (symbol.kind === SymbolKind.Function &&
                     (parent?.name?.startsWith("MAP") || parent?.name?.startsWith("MODULE")))) {
                // For MAP and MODULE, use the Functions container if available
                if ((parent as any).$clarionFunctions) {
                    (parent as any).$clarionFunctions.children!.push(symbol);
                    this.sortContainerChildren((parent as any).$clarionFunctions);
                } else {
                    parent.children!.push(symbol);
                }
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

    /**
     * Handle window element tokens (BUTTON, LIST, ITEM)
     */
    private handleWindowElementToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentProcedure: DocumentSymbol | null,
        currentStructure: DocumentSymbol | null
    ): void {
        logger.debug(`Processing window element at line ${tokens[index].line}: ${tokens[index].value}`);
        const token = tokens[index];
        const { value, line } = token;
        const upperValue = value.toUpperCase();

        // --- helpers ---------------------------------------------------------------
        const lastNonWhitespaceTokenOnLine = (ln: number): Token | undefined => {
            for (let i = tokens.length - 1; i >= 0; i--) {
                const t = tokens[i];
                if (t.line < ln) break;                // gone past the line
                if (t.line === ln && t.value.trim() !== "") return t;
            }
            return undefined;
        };

        const lineContinues = (ln: number): boolean => {
            const last = lastNonWhitespaceTokenOnLine(ln);
            return !!last && last.value === "|";
        };

        // Allow inner scanners to move to the next line only if the *previous* line continued.
        const advanceOrBreakAtEOL = (currentLineRef: { value: number }, nextToken: Token): boolean => {
            if (nextToken.line === currentLineRef.value) return true; // same line, ok
            if (lineContinues(currentLineRef.value)) {
                currentLineRef.value = nextToken.line; // allowed to cross due to '|'
                return true;
            }
            return false; // not allowed to cross line
        };

        // ---------------------------------------------------------------------------

        // Determine the appropriate symbol kind based on the element type
        let symbolKind: SymbolKind;
        switch (upperValue) {
            case "BUTTON": symbolKind = SymbolKind.Boolean; break;
            case "LIST": symbolKind = SymbolKind.Array; break;
            case "ITEM": symbolKind = SymbolKind.EnumMember; break;
            case "STRING": symbolKind = SymbolKind.String; break;
            case "ENTRY": symbolKind = SymbolKind.Variable; break;
            case "PROMPT": symbolKind = SymbolKind.String; break;
            case "RADIO": symbolKind = SymbolKind.Boolean; break;
            case "CHECK": symbolKind = SymbolKind.Boolean; break;
            case "SLIDER": symbolKind = SymbolKind.Number; break;
            case "SPIN": symbolKind = SymbolKind.Number; break;
            default: symbolKind = SymbolKind.Object;
        }

        // Extract element text from parentheses if present
        let elementText = "";
        let useParam = "";

        // Check if there's a parenthesis after the element (BUTTON will have one, LIST might not)
        let j = index + 1;

        // Skip any whitespace (same line only)
        while (j < tokens.length && tokens[j].line === line && tokens[j].value.trim() === "") {
            j++;
        }

        // If we find an opening parenthesis, extract the content
        if (j < tokens.length && tokens[j].line === line && tokens[j].value === "(") {
            const parenContent: string[] = [];
            let k = j + 1;
            let parenDepth = 1;
            const curLine = { value: line };

            // Extract only the content inside the first set of parentheses
            while (k < tokens.length && parenDepth > 0) {
                const parenToken = tokens[k];

                // Respect EOL unless the previous line ends with '|'
                if (!advanceOrBreakAtEOL(curLine, parenToken)) break;

                // Track parenthesis depth
                if (parenToken.value === "(") parenDepth++;
                else if (parenToken.value === ")") parenDepth--;

                // Only add tokens while we're inside the parentheses
                if (parenDepth > 0) {
                    // Stop at a comma - this is usually a separator between parameters
                    if (parenToken.value === ",") break;
                    parenContent.push(parenToken.value);
                } else {
                    // ✅ we just closed the first paren pair
                    break;
                }


                k++;
            }

            elementText = parenContent.join("").trim();
            logger.debug(`  - Extracted element text: "${elementText}"`);

            // Update j to continue after the closing parenthesis (or what we managed to parse)
            j = k;
        }

        // Now look for USE and AT parameters
        let atParam = "";

        while (j < tokens.length) {
            const t = tokens[j];

            // Stop if we hit a new line (outer sweep respects continuations only inside specific scanners)
            if (t.line !== line) break;

            // Stop if we hit an END token or another structure token
            if (t.value.toUpperCase() === "END" ||
                (t.type === TokenType.Structure && t !== token)) {
                break;
            }

            // Look for USE token
            // Look for USE token
            if (t.value.toUpperCase() === "USE" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                const useContent: string[] = [];
                let k = j + 2;
                let useParenDepth = 1;
                const curLine = { value: line };

                while (k < tokens.length && useParenDepth > 0) {
                    const useToken = tokens[k];

                    // Respect EOL unless the previous line ended with '|'
                    if (!advanceOrBreakAtEOL(curLine, useToken)) break;

                    // Track parenthesis depth
                    if (useToken.value === "(") useParenDepth++;
                    else if (useToken.value === ")") useParenDepth--;

                    // Only add tokens while we're inside the parentheses
                    if (useParenDepth > 0) {
                        useContent.push(useToken.value);
                    }
                    k++;
                }

                useParam = useContent.join("").trim();
                logger.debug(`  - Extracted USE parameter: "${useParam}"`);
                j = k;
                continue;
            }


            // Look for AT token
            if (t.value.toUpperCase() === "AT" && j + 1 < tokens.length && tokens[j + 1].value === "(") {
                const atContent: string[] = [];
                let k = j + 2;
                let atParenDepth = 1;
                const curLine = { value: line };

                while (k < tokens.length && atParenDepth > 0) {
                    const atToken = tokens[k];

                    // Respect EOL unless previous line continues with '|'
                    if (!advanceOrBreakAtEOL(curLine, atToken)) break;

                    if (atToken.value === "(") atParenDepth++;
                    else if (atToken.value === ")") atParenDepth--;

                    if (atParenDepth > 0) atContent.push(atToken.value);
                    k++;
                }

                atParam = atContent.join("").trim();
                logger.debug(`  - Extracted AT parameter: "${atParam}"`);
                j = k;
                continue;
            }

            // Stop if we hit a comma followed by another window element
            if (t.value === "," && j + 1 < tokens.length &&
                tokens[j + 1].type === TokenType.WindowElement) {
                break;
            }

            j++;
        }

        // Create a display name and detail for the element
        let displayName: string;
        let detail: string = "";

        // For ENTRY and GROUP elements, simplify the display
        // if (upperValue === "ENTRY" || upperValue === "GROUP") {
        //     displayName = `${upperValue}`;

        //     // Only include element text and USE parameter in the detail
        //     if (elementText && useParam) {
        //         detail = `(${elementText}) USE(${useParam})`;
        //     } else if (elementText) {
        //         detail = `(${elementText})`;
        //     } else if (useParam) {
        //         detail = `USE(${useParam})`;
        //     }
        // } else {
        // For other elements, use the standard approach
        if (elementText) {
            displayName = `${upperValue}(${elementText})`;
        } else {
            displayName = upperValue;
        }

        if (useParam) {
            detail = `USE(${useParam})`;
        }
        // }

        logger.debug(`  - Final display name: "${displayName}"`);
        logger.debug(`  - Final detail: "${detail}"`);

        const elementSymbol = DocumentSymbol.create(
            displayName,
            detail,  // detail field
            symbolKind,
            this.getTokenRange(tokens, line, line),
            this.getTokenRange(tokens, line, line),
            []
        );

        const target = currentStructure || currentProcedure;
        this.addSymbolToParent(elementSymbol, target, symbols);
    }


}

