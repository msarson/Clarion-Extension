import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

import LoggerManager from '../logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("error"); // PERF: Only log errors to reduce overhead
import { serverInitialized } from '../serverState';
import { Token, TokenType } from '../ClarionTokenizer.js';
import { HierarchyManager } from './utils/HierarchyManager';
import { SymbolFinder } from './utils/SymbolFinder';

/**
 * Extended DocumentSymbol with Clarion-specific metadata
 */
export interface ClarionDocumentSymbol extends DocumentSymbol {
    // Procedure/Method flags
    _isMethodImplementation?: boolean;
    _isMethodDeclaration?: boolean;
    _isGlobalProcedure?: boolean;
    _isSpecialRoutine?: boolean;
    _isInterface?: boolean;
    _isMapProcedure?: boolean;
    _finishesAt?: number;
    
    // Structure metadata
    _clarionPrefix?: string;
    _clarionLabel?: string;
    
    // Variable metadata
    _clarionType?: string;
    _clarionVarName?: string;
    _isPartOfStructure?: boolean;
    _structurePrefix?: string;
    _structureName?: string;
    _possibleReferences?: string[];
    
    // Container references
    $clarionProps?: ClarionDocumentSymbol;
    $clarionMethods?: ClarionDocumentSymbol;
    $clarionFunctions?: ClarionDocumentSymbol;
    
    // Sorting
    sortText?: string;
    
    // Override children to use our type
    children?: ClarionDocumentSymbol[];
}

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
    classSymbolMap: Map<string, ClarionDocumentSymbol> = new Map();
    // 🚀 PERFORMANCE: Store tokensByLine as instance variable to avoid passing it everywhere
    private tokensByLine: Map<number, Token[]> = new Map();
    
    public extractStringContents(rawString: string): string {
        const match = rawString.match(/'([^']+)'/);
        return match ? match[1] : rawString;
    }

    /**
     * Extract content from parentheses starting at the given token index.
     * Returns the content and the index after the closing parenthesis.
     */
    private extractParenContent(tokens: Token[], startIndex: number): { content: string, nextIndex: number } {
        const parenContent: string[] = [];
        let j = startIndex;
        let parenDepth = 1;

        while (j < tokens.length && parenDepth > 0) {
            const t = tokens[j];
            if (t.value === "(") parenDepth++;
            else if (t.value === ")") parenDepth--;

            if (parenDepth > 0) parenContent.push(t.value);
            j++;
        }

        return {
            content: parenContent.join("").trim(),
            nextIndex: j
        };
    }

    /**
     * Check if a token value is a procedure attribute keyword (not a procedure name)
     * These are keywords that appear in MAP procedure declarations but are not procedure names
     */
    private isAttributeKeyword(value: string): boolean {
        const attributeKeywords = [
            'DLL', 'NAME', 'RAW', 'PASCAL', 'PROC', 'C',
            'PRIVATE', 'PROTECTED', 'PUBLIC',
            'VIRTUAL', 'DERIVED'
        ];
        return attributeKeywords.includes(value.toUpperCase());
    }

    /**
     * Create a Clarion document symbol (wrapper around DocumentSymbol.create with proper typing)
     */
    private createSymbol(
        name: string,
        detail: string,
        kind: SymbolKind,
        range: Range,
        selectionRange: Range,
        children: ClarionDocumentSymbol[]
    ): ClarionDocumentSymbol {
        return DocumentSymbol.create(name, detail, kind, range, selectionRange, children) as ClarionDocumentSymbol;
    }

    /**
     * Extract a specific attribute (like USE, DRIVER, PRE, AT) from tokens.
     * Returns the attribute content and the index after parsing.
     */
    private extractAttribute(
        tokens: Token[],
        startIndex: number,
        attributeName: string,
        line: number,
        sourceToken: Token
    ): { value: string, nextIndex: number } {
        let j = startIndex;

        while (j < tokens.length) {
            const t = tokens[j];

            // Stop if we hit a new line or another structure
            if (t.line !== line && t.line !== line + 1) break;
            if (t.type === TokenType.Structure && t !== sourceToken) break;

            // Look for the attribute token
            if (t.value.toUpperCase() === attributeName.toUpperCase() && 
                j + 1 < tokens.length && 
                tokens[j + 1].value === "(") {
                const result = this.extractParenContent(tokens, j + 2);
                return {
                    value: result.content,
                    nextIndex: result.nextIndex
                };
            }

            j++;
        }

        return { value: "", nextIndex: j };
    }

    public provideDocumentSymbols(tokens: Token[], documentUri: string): ClarionDocumentSymbol[] {
        if (!serverInitialized) {
            logger.warn(`⚠️ Server not initialized, skipping document symbols for: ${documentUri}`);
            return [];
        }
        
        // 🚀 PERFORMANCE: Build token index by line to avoid O(n²) lookups
        const perfIndexStart = performance.now();
        this.tokensByLine.clear();
        for (const token of tokens) {
            if (!this.tokensByLine.has(token.line)) {
                this.tokensByLine.set(token.line, []);
            }
            this.tokensByLine.get(token.line)!.push(token);
        }
        const perfIndexTime = performance.now() - perfIndexStart;
        logger.perf('Symbol: build index', { time_ms: perfIndexTime.toFixed(2), lines: this.tokensByLine.size });
        
        this.classSymbolMap.clear();
        const symbols: ClarionDocumentSymbol[] = [];

        // Enhanced parent stack that tracks finishesAt for each symbol
        const parentStack: Array<{ symbol: ClarionDocumentSymbol, finishesAt: number | undefined }> = [];
        let currentStructure: ClarionDocumentSymbol | null = null;
        let currentProcedure: ClarionDocumentSymbol | null = null;
        let currentClassImplementation: ClarionDocumentSymbol | null = null;
        let insideDefinitionBlock = false;
        let lastProcessedLine = -1;
        let pastCodeStatement = false; // Track if we're past CODE (no more variables allowed)

        // 🚀 PERFORMANCE: Track method implementations incrementally instead of scanning tree repeatedly
        let hasMethodImplementations = false;

        // CRITICAL FIX: Track the last method implementation to ensure variables are properly attached
        let lastMethodImplementation: ClarionDocumentSymbol | null = null;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const { type, value, line, subType, finishesAt, executionMarker } = token;

            // Check if we've moved to a new line
            if (line > lastProcessedLine) {
                // Check if any structures should be popped based on finishesAt
                const result = HierarchyManager.checkAndPopCompletedStructures(
                    parentStack, 
                    line, 
                    tokens, 
                    this.tokensByLine, 
                    hasMethodImplementations
                );

                // CRITICAL FIX: Check if we need to reset lastMethodImplementation
                // This happens when a new global procedure is encountered
                if (result.shouldResetLastMethodImplementation) {
                    lastMethodImplementation = null;
                }

                // Update current structure and procedure references
                currentStructure = HierarchyManager.getCurrentParent(parentStack);

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

            // Check if current token is CODE execution marker - stop variable processing
            if (type === TokenType.ExecutionMarker && value.toUpperCase() === "CODE") {
                pastCodeStatement = true;
                
                // For method implementations, just clear currentProcedure
                // Don't skip - we need to process subsequent tokens normally
                if (currentProcedure && currentProcedure._isMethodImplementation) {
                    currentProcedure = null;
                }
                // For global procedures, don't clear currentProcedure as they may have routines
            }

            // Check if current token is DATA execution marker - allow variable processing for routines
            if (type === TokenType.ExecutionMarker && value.toUpperCase() === "DATA") {
                pastCodeStatement = false;
            }

            if (type === TokenType.Structure) {
                this.handleStructureToken(tokens, i, symbols, parentStack, currentStructure, this.tokensByLine);
                currentStructure = HierarchyManager.getCurrentParent(parentStack);
                
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
                        // Can be Label token (column 0), Function token (no space), or Variable token (indented with space)
                        // BUT exclude attribute keywords: dll, name, raw, pascal, proc, etc.
                        else if ((nextToken.type === TokenType.Label || 
                                 nextToken.type === TokenType.Function ||
                                 nextToken.type === TokenType.Variable) &&
                                j + 1 < tokens.length &&
                                tokens[j + 1].value === "(" &&
                                nextToken.value.toUpperCase() !== "MODULE" &&
                                nextToken.value.toUpperCase() !== "MAP" &&
                                !this.isAttributeKeyword(nextToken.value)) {
                            // This looks like a procedure declaration in shorthand MAP syntax
                            nextToken.subType = TokenType.MapProcedure;
                            // CRITICAL: Set token.label to just the procedure name (nextToken.value is already just the name)
                            nextToken.label = nextToken.value;
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
                subType === TokenType.InterfaceMethod || subType === TokenType.MapProcedure)) {

                const isImplementation = token.executionMarker?.value.toUpperCase() === "CODE";
                if (isImplementation || token.finishesAt !== undefined) {
                    // CRITICAL FIX: Before processing a new method implementation, FORCE pop all methods from stack
                    // Don't wait for checkAndPopCompletedStructures - do it NOW
                    if ((token.subType === TokenType.MethodImplementation || subType === TokenType.MethodImplementation)) {
                        // FORCE remove ALL method implementations from the stack
                        for (let si = parentStack.length - 1; si >= 0; si--) {
                            if (parentStack[si].symbol._isMethodImplementation) {
                                parentStack.splice(si, 1);
                            }
                        }
                        
                        // Update currentStructure to remove stale references
                        currentStructure = HierarchyManager.getCurrentParent(parentStack);
                    }
                    
                    // Now process the new procedure/method
                    const result = this.handleProcedureOrClassToken(tokens, i, symbols, currentStructure, token.subType || subType);

                    // Check if this is a method implementation (e.g., ThisWindow.Init)
                    const isMethodImplementation = result.procedureSymbol._isMethodImplementation;

                    if (isMethodImplementation) {
                        // 🚀 PERFORMANCE: Set flag to avoid recursive tree scanning later
                        hasMethodImplementations = true;
                        
                        // CRITICAL FIX: For method implementations, we DO need to update currentProcedure
                        // This ensures variables defined inside the method are attached to it
                        currentProcedure = result.procedureSymbol;
                        currentClassImplementation = result.classImplementation;

                        // CRITICAL FIX: Track the last method implementation
                        lastMethodImplementation = result.procedureSymbol;

                        // Add method implementation to parent stack with its finishesAt value
                        // This ensures structures/routines inside are properly nested
                        if (result.procedureSymbol._finishesAt !== undefined) {
                            HierarchyManager.pushToStack(parentStack, result.procedureSymbol, result.procedureSymbol._finishesAt);
                            currentStructure = result.procedureSymbol;
                        }
                    } else {
                        // For regular procedures, update the current procedure and structure
                        currentProcedure = result.procedureSymbol;
                        currentClassImplementation = result.classImplementation;

                        // CRITICAL FIX: Reset lastMethodImplementation when a new global procedure is encountered
                        if (result.procedureSymbol._isGlobalProcedure) {
                            lastMethodImplementation = null;
                        }

                        // Add procedure to parent stack with its finishesAt value if available
                        if (result.procedureSymbol._finishesAt !== undefined) {
                            HierarchyManager.pushToStack(parentStack, result.procedureSymbol, result.procedureSymbol._finishesAt);
                            currentStructure = result.procedureSymbol;
                        }
                    }

                    // Skip tokens that were already processed (parameters on the procedure line)
                    i = result.lastTokenIndex;

                    // Reset pastCodeStatement flag when entering new procedure/method
                    pastCodeStatement = false;

                    insideDefinitionBlock = true;
                } else {
                    const procedureDefSymbol = this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);

                    // Check if we need to add this procedure definition to the parent stack
                    // This would be the case for procedure definitions with a finishesAt value
                    if (procedureDefSymbol._finishesAt !== undefined) {
                        HierarchyManager.pushToStack(parentStack, procedureDefSymbol, procedureDefSymbol._finishesAt);
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
                if (procedureDefSymbol._finishesAt !== undefined) {
                    HierarchyManager.pushToStack(parentStack, procedureDefSymbol, procedureDefSymbol._finishesAt);
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
                const routineSymbol = this.createSymbol(
                    `${routineName} (Routine)`,
                    "",  // Empty detail since we're including it in the name
                    ClarionSymbolKind.Routine,
                    this.getTokenRange(tokens, token.line, endLine),
                    this.getTokenRange(tokens, token.line, endLine),
                    []
                );

                // Mark special routines
                if (isSpecialRoutine) {
                    routineSymbol._isSpecialRoutine = true;
                }

                // CRITICAL FIX: Determine the correct parent for this ROUTINE
                // Get the current parent from the stack (don't rely on currentProcedure which might be stale)
                let routineParent: ClarionDocumentSymbol | null = HierarchyManager.getCurrentParent(parentStack);

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
                    HierarchyManager.pushToStack(parentStack, routineSymbol, token.finishesAt);
                }

                // Reset pastCodeStatement if this routine has local data (DATA section)
                // Variables are allowed between DATA and CODE in routines
                if (token.hasLocalData) {
                    pastCodeStatement = false;
                }

                continue;
            }

            // Handle variable declarations - check for Type tokens (BYTE, LONG, etc) and TypeAnnotation (STRING(255), CSTRING(100), etc)
            // Also check for FunctionArgumentParameter which the tokenizer uses for parametrized types like CSTRING(1024)
            // CRITICAL: Don't process variables after CODE statement
            if (!pastCodeStatement && (type === TokenType.Type || type === TokenType.TypeAnnotation || type === TokenType.ReferenceVariable || type === TokenType.Variable || type === TokenType.FunctionArgumentParameter) && i > 0) {
                logger.info(`✅ SymbolProvider: Calling handleVariableToken for token index=${i}, type=${type}, value="${token.value}", line=${token.line}`);
                this.handleVariableToken(tokens, i, symbols, currentStructure, currentProcedure, lastMethodImplementation);

                continue;
            }

            if (type === TokenType.EndStatement) {
                // We'll handle END statements differently now - they're just markers
                // The actual structure popping happens based on finishesAt lines
                // But we'll still use this to handle cases where finishesAt isn't available
                this.handleEndStatementToken(parentStack, line);
                currentStructure = HierarchyManager.getCurrentParent(parentStack);
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
        symbols: ClarionDocumentSymbol[],
        currentStructure: ClarionDocumentSymbol | null,
        currentProcedure: ClarionDocumentSymbol | null
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

        const projectSymbol = this.createSymbol(
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

    private handleStructureToken(
        tokens: Token[],
        index: number,
        symbols: ClarionDocumentSymbol[],
        parentStack: Array<{ symbol: ClarionDocumentSymbol, finishesAt: number | undefined }>,
        currentStructure: ClarionDocumentSymbol | null,
        tokensByLine: Map<number, Token[]>
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
            // 🚀 PERFORMANCE: Use indexed lookup instead of filter
            const sameLineTokens = tokensByLine.get(token.line) || [];
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
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
                const result = this.extractParenContent(tokens, index + 2);
                displayName = `JOIN (${result.content})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "MODULE") {
            // Extract file path from MODULE('filepath') if present
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
                const result = this.extractParenContent(tokens, index + 2);
                const filePath = this.extractStringContents(result.content);
                displayName = labelName ? `MODULE('${filePath}') (${labelName})` : `MODULE('${filePath}')`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "TAB") {
            // Extract tab name from TAB('Tracking') syntax
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
                const parenResult = this.extractParenContent(tokens, index + 2);
                const tabName = this.extractStringContents(parenResult.content);
                
                // Look for USE parameter after the tab name
                const useResult = this.extractAttribute(tokens, parenResult.nextIndex, "USE", line, token);
                
                // Create a display name with the tab name and USE parameter
                if (tabName && useResult.value) {
                    displayName = `TAB('${tabName}') USE(${useResult.value})`;
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
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
                const parenResult = this.extractParenContent(tokens, index + 2);
                const menuText = this.extractStringContents(parenResult.content);
                
                // Look for USE parameter after the menu text
                const useResult = this.extractAttribute(tokens, parenResult.nextIndex, "USE", line, token);
                
                // Create a display name with the menu text and USE parameter
                if (menuText && useResult.value) {
                    displayName = `MENU('${menuText}') USE(${useResult.value})`;
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
            const useResult = this.extractAttribute(tokens, index + 1, "USE", line, token);
            
            // Create a display name with the USE parameter
            if (useResult.value) {
                displayName = `SHEET USE(${useResult.value})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "OLE") {
            // For OLE elements like: OLE,AT(3,2,753,229),USE(?SchedulerControl),COMPATIBILITY(021H)
            const useResult = this.extractAttribute(tokens, index + 1, "USE", line, token);
            
            // Create a display name with the USE parameter
            if (useResult.value) {
                displayName = `OLE USE(${useResult.value})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "MENUBAR") {
            // For MENUBAR elements like: MENUBAR,USE(?Menubar)
            const useResult = this.extractAttribute(tokens, index + 1, "USE", line, token);
            
            // Create a display name with the USE parameter
            if (useResult.value) {
                displayName = `MENUBAR USE(${useResult.value})`;
            } else {
                displayName = labelName ? `${value} (${labelName})` : value;
            }
        } else if (upperValue === "WINDOW" || upperValue === "APPLICATION") {
            // For WINDOW elements like: WINDOW('Accura scheduling'),AT(,,759,389),FONT('Segoe UI',8,,FONT:regular),RESIZE,ALRT(CtrlZ)
            // or APPLICATION elements which are similar
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
                const parenResult = this.extractParenContent(tokens, index + 2);
                const title = this.extractStringContents(parenResult.content);
                
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
            const nextToken = tokens[index + 1];
            if (nextToken && nextToken.value === "(") {
                const parenResult = this.extractParenContent(tokens, index + 2);
                const viewFile = parenResult.content;
                
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
        } else if (upperValue === "FILE" || upperValue === "GROUP" || upperValue === "QUEUE") {
            // For FILE/GROUP/QUEUE elements like: FILE,DRIVER('TOPSPEED'),PRE(SHI),CREATE,BINDABLE,THREAD
            const driverResult = upperValue === "FILE" ? 
                this.extractAttribute(tokens, index + 1, "DRIVER", line, token) : 
                { value: "", nextIndex: index + 1 };
            const preResult = this.extractAttribute(tokens, index + 1, "PRE", line, token);
            
            // For GROUP: extract OVER and DIM attributes
            const overResult = upperValue === "GROUP" ? 
                this.extractAttribute(tokens, index + 1, "OVER", line, token) : 
                { value: "", nextIndex: index + 1 };
            const dimResult = this.extractAttribute(tokens, index + 1, "DIM", line, token);
            
            const driverValue = driverResult.value ? this.extractStringContents(driverResult.value) : "";
            const preValue = preResult.value;
            const overValue = overResult.value;
            const dimValue = dimResult.value;

            // Create a display name with the DRIVER, PRE, OVER, and DIM values
            let displayParts = [];

            if (labelName) {
                displayParts.push(`${upperValue} (${labelName})`);
            } else {
                displayParts.push(upperValue);
            }

            if (driverValue) {
                displayParts.push(driverValue);
            }

            if (preValue) {
                displayParts.push(`PRE(${preValue})`);
            }
            
            if (overValue) {
                displayParts.push(`OVER(${overValue})`);
            }
            
            if (dimValue) {
                displayParts.push(`DIM(${dimValue})`);
            }

            displayName = displayParts.join(",");
        } else {
            displayName = labelName ? `${value} (${labelName})` : value;
        }

        const structureSymbol = this.createSymbol(
            displayName,
            "",
            structureKind,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            this.getTokenRange(tokens, line, finishesAt ?? line),
            []
        );
        
        // Store metadata for structures that might have prefixes and labels
        if (upperValue === "FILE" || upperValue === "GROUP" || upperValue === "QUEUE") {
            const preResult = this.extractAttribute(tokens, index + 1, "PRE", line, token);
            
            if (preResult.value) {
                structureSymbol._clarionPrefix = preResult.value;
            }
            if (labelName) {
                structureSymbol._clarionLabel = labelName;
            }
        }

        // CLASS support: inject Properties/Methods
        if (upperValue === "CLASS" && labelName) {
            this.classSymbolMap.set(labelName.toUpperCase(), structureSymbol);

            const propsContainer = this.createSymbol(
                "Properties",
                "",
                SymbolKind.Property,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            propsContainer.sortText = "0001";

            const methodsContainer = this.createSymbol(
                "Methods",
                "",
                SymbolKind.Method,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            methodsContainer.sortText = "0002";

            structureSymbol.$clarionProps = propsContainer;
            structureSymbol.$clarionMethods = methodsContainer;

            structureSymbol.children!.push(propsContainer);
            structureSymbol.children!.push(methodsContainer);
        }
        // INTERFACE support: no need for Properties/Methods containers
        else if (upperValue === "INTERFACE" && labelName) {
            this.classSymbolMap.set(labelName.toUpperCase(), structureSymbol);

            // For interfaces, we don't need to add Properties/Methods containers
            // since interfaces only declare methods
            // Just mark it as an interface for reference
            structureSymbol._isInterface = true;
        }
        // FILE support: add KEY/INDEX/RECORD as children for better structure view
        else if (upperValue === "FILE") {
            // Look ahead to find KEY, INDEX, MEMO, BLOB, and RECORD
            for (let j = index + 1; j < tokens.length && tokens[j].line <= (finishesAt ?? line); j++) {
                const childToken = tokens[j];
                const childValue = childToken.value.toUpperCase();
                
                // Add KEY as child
                if (childValue === "KEY") {
                    const keyContent = this.extractParenContent(tokens, j + 2);
                    const keySymbol = this.createSymbol(
                        `KEY(${keyContent.content})`,
                        "",
                        SymbolKind.Key,
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        []
                    );
                    structureSymbol.children!.push(keySymbol);
                }
                // Add INDEX as child
                else if (childValue === "INDEX") {
                    const indexContent = this.extractParenContent(tokens, j + 2);
                    const indexSymbol = this.createSymbol(
                        `INDEX(${indexContent.content})`,
                        "",
                        SymbolKind.Field,
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        []
                    );
                    structureSymbol.children!.push(indexSymbol);
                }
                // Add RECORD as container
                else if (childValue === "RECORD") {
                    // Find the END of RECORD
                    let recordEndLine = childToken.line;
                    for (let k = j + 1; k < tokens.length; k++) {
                        if (tokens[k].value.toUpperCase() === "END" && 
                            tokens[k].type === TokenType.EndStatement) {
                            recordEndLine = tokens[k].line;
                            break;
                        }
                    }
                    
                    const recordSymbol = this.createSymbol(
                        "RECORD",
                        "",
                        SymbolKind.Struct,
                        this.getTokenRange(tokens, childToken.line, recordEndLine),
                        this.getTokenRange(tokens, childToken.line, recordEndLine),
                        []
                    );
                    
                    // Look for MEMO/BLOB fields within RECORD
                    for (let k = j + 1; k < tokens.length && tokens[k].line < recordEndLine; k++) {
                        const fieldToken = tokens[k];
                        const fieldValue = fieldToken.value.toUpperCase();
                        
                        if (fieldValue === "MEMO") {
                            const memoContent = this.extractParenContent(tokens, k + 1);
                            const fieldLabel = tokens[k - 1]?.value || "MEMO";
                            const memoSymbol = this.createSymbol(
                                `${fieldLabel} MEMO(${memoContent.content})`,
                                "",
                                SymbolKind.String,  // 📝 MEMO gets string icon
                                this.getTokenRange(tokens, fieldToken.line, fieldToken.line),
                                this.getTokenRange(tokens, fieldToken.line, fieldToken.line),
                                []
                            );
                            recordSymbol.children!.push(memoSymbol);
                        }
                        else if (fieldValue === "BLOB") {
                            const fieldLabel = tokens[k - 1]?.value || "BLOB";
                            const blobSymbol = this.createSymbol(
                                `${fieldLabel} BLOB`,
                                "",
                                SymbolKind.Object,  // 🧱 BLOB gets object icon
                                this.getTokenRange(tokens, fieldToken.line, fieldToken.line),
                                this.getTokenRange(tokens, fieldToken.line, fieldToken.line),
                                []
                            );
                            recordSymbol.children!.push(blobSymbol);
                        }
                    }
                    
                    structureSymbol.children!.push(recordSymbol);
                }
            }
        }
        // VIEW support: add JOIN hierarchy and PROJECT fields for better structure view
        else if (upperValue === "VIEW") {
            // Look ahead to find JOIN and PROJECT
            let nestLevel = 0;
            let currentJoinSymbol: ClarionDocumentSymbol | null = null;
            let joinStack: ClarionDocumentSymbol[] = [];
            
            for (let j = index + 1; j < tokens.length && tokens[j].line <= (finishesAt ?? line); j++) {
                const childToken = tokens[j];
                const childValue = childToken.value.toUpperCase();
                
                // Handle PROJECT
                if (childValue === "PROJECT") {
                    const projectContent = this.extractParenContent(tokens, j + 2);
                    const projectSymbol = this.createSymbol(
                        `PROJECT(${projectContent.content})`,
                        "",
                        SymbolKind.Field,
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        []
                    );
                    
                    // Add to current JOIN or to VIEW root
                    if (currentJoinSymbol) {
                        currentJoinSymbol.children!.push(projectSymbol);
                    } else {
                        structureSymbol.children!.push(projectSymbol);
                    }
                }
                // Handle JOIN
                else if (childValue === "JOIN") {
                    const joinContent = this.extractParenContent(tokens, j + 2);
                    const joinSymbol = this.createSymbol(
                        `JOIN(${joinContent.content})`,
                        "",
                        SymbolKind.Event,  // 🟢 JOIN gets event icon
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        this.getTokenRange(tokens, childToken.line, childToken.line),
                        []
                    );
                    
                    // Add to parent JOIN or VIEW root
                    if (currentJoinSymbol) {
                        currentJoinSymbol.children!.push(joinSymbol);
                        joinStack.push(currentJoinSymbol);
                    } else {
                        structureSymbol.children!.push(joinSymbol);
                    }
                    
                    currentJoinSymbol = joinSymbol;
                    nestLevel++;
                }
                // Handle END for JOIN
                else if (childValue === "END" && nestLevel > 0) {
                    nestLevel--;
                    if (joinStack.length > 0) {
                        currentJoinSymbol = joinStack.pop()!;
                    } else {
                        currentJoinSymbol = null;
                    }
                }
            }
        }
        // MAP support: add Functions container to organize MAP procedures
        else if (upperValue === "MAP") {
            const functionsContainer = this.createSymbol(
                "Functions",
                "",
                SymbolKind.Function,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            functionsContainer.sortText = "0001";

            // Store the functions container for easy access
            structureSymbol.$clarionFunctions = functionsContainer;
            structureSymbol.children!.push(functionsContainer);
        }
        // MODULE support: add Functions container to organize MODULE procedures
        else if (upperValue === "MODULE") {
            const functionsContainer = this.createSymbol(
                "Functions",
                "",
                SymbolKind.Function,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            functionsContainer.sortText = "0001";

            // Store the functions container for easy access
            structureSymbol.$clarionFunctions = functionsContainer;
            structureSymbol.children!.push(functionsContainer);
        }

        this.addSymbolToParent(structureSymbol, currentStructure, symbols);
        // Push to the parent stack with finishesAt information
        HierarchyManager.pushToStack(parentStack, structureSymbol, finishesAt);
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
    ): ClarionDocumentSymbol {
        return this.createSymbol(
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
        symbols: ClarionDocumentSymbol[],
        currentStructure: ClarionDocumentSymbol | null,
        subType: TokenType | undefined = undefined
    ): { procedureSymbol: ClarionDocumentSymbol, classImplementation: ClarionDocumentSymbol | null, lastTokenIndex: number } {
        const token = tokens[index];
        const { line, finishesAt } = token;
        const prevToken = tokens[index - 1];
        
        // FIXED: Check token.label first (tokenizer stores it there), fallback to prevToken
        const procedureName = token.label || (prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure");
        const classMatch = procedureName.includes('.') ? procedureName.split('.')[0] : null;
        const methodName = classMatch ? procedureName.replace(`${classMatch}.`, "") : procedureName;

        let container: DocumentSymbol | null = null;
        let classImplementation: ClarionDocumentSymbol | null = null;

        // IMPORTANT: For method implementations, we need to handle them differently
        // Use token.subType instead of dot-notation check for consistency with tokenizer
        if (token.subType === TokenType.MethodImplementation || subType === TokenType.MethodImplementation) {
            // This is a method implementation (e.g., ThisWindow.Init)
            // Verify that classMatch is valid (tokenizer should have ensured procedure name contains a dot)
            if (!classMatch) {
                // Safety fallback: if no classMatch but tokenizer says it's a method implementation,
                // treat it as a global procedure instead
                container = null;
                (token as any)._isGlobalProcedure = true;
            } else {
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
                            const implMethodsContainer = classImplementation.$clarionMethods || classImplementation;
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
                        const implMethodsContainer = classImplementation.$clarionMethods || classImplementation;
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
                    const implMethodsContainer = classImplementation.$clarionMethods || classImplementation;
                    container = implMethodsContainer;
                    
                    // Mark this as a method implementation
                    (token as any)._isMethodImplementation = true;
                }
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
        if (token.subType === TokenType.MethodImplementation || subType === TokenType.MethodImplementation) {
            procedureSymbol._isMethodImplementation = true;
            
            // If this is a method implementation and we found the declaration,
            // set the detail to "Implementation" to distinguish it
            if (container && container !== (classImplementation as any)?.$clarionMethods) {
                procedureSymbol.detail = "Implementation";
            } else {
                procedureSymbol.detail = "";  // Empty detail since we're including it in the name
            }
        } else if (token.subType === TokenType.GlobalProcedure || subType === TokenType.GlobalProcedure) {
            // Mark global procedures
            procedureSymbol._isGlobalProcedure = true;
        }

        // Add the procedure to its container
        if (token.subType === TokenType.MethodImplementation || subType === TokenType.MethodImplementation) {
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
            procedureSymbol._finishesAt = finishesAt;
        }

        return { procedureSymbol, classImplementation, lastTokenIndex: j };
    }
    
    /**
     * Find a class definition symbol by name
     */
    private findClassDefinition(symbols: ClarionDocumentSymbol[], className: string): ClarionDocumentSymbol | null {
        return SymbolFinder.findClassDefinition(symbols, className, this.classSymbolMap);
    }

    private findOrCreateClassImplementation(
        symbols: ClarionDocumentSymbol[],
        className: string,
        tokens: Token[],
        startLine: number,
        endLine: number
    ): ClarionDocumentSymbol {
        // First, try to find the class definition
        const classDefinition = this.findClassDefinition(symbols, className);
        
        // If we found the class definition, use it instead of creating a separate implementation container
        if (classDefinition) {
            // Make sure the class has a Methods container
            let methodsContainer = classDefinition.children?.find(c => c.name === "Methods");
            
            if (!methodsContainer) {
                // Create a Methods container if it doesn't exist
                methodsContainer = this.createSymbol(
                    "Methods",
                    "",
                    SymbolKind.Method,
                    classDefinition.range,
                    classDefinition.range,
                    []
                );
                methodsContainer.sortText = "0002";
                classDefinition.children!.push(methodsContainer);
                classDefinition.$clarionMethods = methodsContainer;
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
        let classImplementation: ClarionDocumentSymbol | null = null;

        classImplementation = SymbolFinder.findClassImplementation(symbols, className);

        if (!classImplementation) {
            // Create a new class implementation container
            classImplementation = this.createSymbol(
                fullName,
                "Class Method Implementation",
                ClarionSymbolKind.Class,
                this.getTokenRange(tokens, startLine, endLine),
                this.getTokenRange(tokens, startLine, endLine),
                []
            );

            // Add methods container for organization
            const methodsContainer = this.createSymbol(
                "Methods",
                "",
                SymbolKind.Method,
                classImplementation.range,
                classImplementation.range,
                []
            );
            methodsContainer.sortText = "0001";

            // Store the methods container for easy access
            classImplementation.$clarionMethods = methodsContainer;
            classImplementation.children!.push(methodsContainer);

            // FIXED: Class implementation containers should ALWAYS be root-level
            // Never nest them under procedures
            symbols.push(classImplementation);
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
    ): ClarionDocumentSymbol {
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

        return this.createSymbol(
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
        symbols: ClarionDocumentSymbol[],
        currentStructure: ClarionDocumentSymbol | null
    ): ClarionDocumentSymbol {
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

        // The name should be just the procedure name
        // The detail should contain the signature/definition
        const procedureDefSymbol = this.createSymbol(
            procedureDefName,
            fullDefinition,  // Use signature as detail
            symbolKind,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            // Use a more precise selection range for better navigation
            this.getTokenRange(tokens, line, line),
            []
        );

        // Mark method declarations
        if (token.subType === TokenType.MethodDeclaration) {
            procedureDefSymbol._isMethodDeclaration = true;
        }
        
        // Mark MAP procedures
        if (isMapProcedure || token.subType === TokenType.MapProcedure) {
            procedureDefSymbol._isMapProcedure = true;
        }

        // Store finishesAt value for procedure definitions if available
        if (finishesAt !== undefined) {
            procedureDefSymbol._finishesAt = finishesAt;
        }

        // ✅ Prefer attaching to MODULE or MAP if that's the current structure
        if (currentStructure?.name?.startsWith("MODULE") ||
            currentStructure?.name === "Functions") {
            
            // If we're already in the Functions container, add directly to it
            if (currentStructure?.name === "Functions") {
                currentStructure.children!.push(procedureDefSymbol);
            }
            // Otherwise, use the Functions container if available
            else if (currentStructure.$clarionFunctions) {
                currentStructure.$clarionFunctions.children!.push(procedureDefSymbol);
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
            else if (currentStructure.$clarionFunctions) {
                currentStructure.$clarionFunctions.children!.push(procedureDefSymbol);
            } else {
                currentStructure.children!.push(procedureDefSymbol);
            }
            return procedureDefSymbol;
        }

        // ✅ Otherwise fallback to class/interface method grouping
        const parentSymbol = this.findSymbolForParentToken(parent, symbols, line);
        let methodTarget = parentSymbol;

        // CRITICAL FIX: Handle interface methods differently
        if (parentSymbol?.kind === ClarionSymbolKind.Class && !parentSymbol._isInterface) {
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
        symbols: ClarionDocumentSymbol[],
        currentLine: number
    ): ClarionDocumentSymbol | null {
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
        symbols: ClarionDocumentSymbol[],
        currentStructure: ClarionDocumentSymbol | null,
        currentProcedure: ClarionDocumentSymbol | null,
        lastMethodImplementation: ClarionDocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;
        const prevToken = tokens[index - 1];

        logger.info(`🔍 handleVariableToken called: index=${index}, token=${token.value}, type=${token.type}, line=${line}`);
        logger.info(`   prevToken: ${prevToken ? `type=${prevToken.type}, value="${prevToken.value}"` : 'null'}`);

        // CRITICAL FIX: Skip if we're inside a PROCEDURE declaration's parameter list
        // Check if there's a PROCEDURE keyword on the same line before this token
        let foundProcedureKeyword = false;
        logger.info(`   🔍 Searching backwards for PROCEDURE keyword on line ${line}`);
        for (let k = index - 1; k >= 0; k--) {
            const t = tokens[k];
            logger.info(`      - Token ${k}: line=${t.line}, type=${t.type}, value="${t.value}"`);
            if (t.line !== line) {
                logger.info(`      - Different line, stopping search`);
                break; // Different line, stop searching
            }
            // FIXED: Check for TokenType.Procedure, not TokenType.Keyword
            if (t.type === TokenType.Procedure || 
                (t.type === TokenType.Keyword && t.value.toUpperCase() === 'PROCEDURE')) {
                logger.info(`      - ✅ Found PROCEDURE keyword!`);
                foundProcedureKeyword = true;
                break;
            }
        }
        
        if (foundProcedureKeyword) {
            logger.info(`   ⚠️ Skipping - this token is part of a PROCEDURE declaration`);
            return;
        }
        logger.info(`   ℹ️ No PROCEDURE keyword found, proceeding with variable parsing`);

        // Handle Label or StructurePrefix tokens (variable names)
        // TokenType.Label (25), TokenType.StructurePrefix (41), TokenType.Variable (5)
        if (prevToken && (prevToken.type === TokenType.Label || 
                          prevToken.type === TokenType.StructurePrefix || 
                          prevToken.type === TokenType.Variable)) {
            logger.info(`   ✅ Previous token is Label or StructurePrefix - processing variable declaration`);
            
            // CRITICAL FIX: Handle prefixed labels (e.g., LOC:SMTPbccAddress)
            // If prevToken is a StructurePrefix, we need to look back one more token to get the full label
            let variableName = prevToken.value;
            let variableStartToken = prevToken;
            
            // Check if there's a label/variable token before the StructurePrefix
            if (prevToken.type === TokenType.StructurePrefix && index >= 2) {
                const prevPrevToken = tokens[index - 2];
                if (prevPrevToken.line === line && 
                    (prevPrevToken.type === TokenType.Label || prevPrevToken.type === TokenType.Variable)) {
                    // This is a prefixed label like LOC:SMTPbccAddress
                    variableName = prevPrevToken.value + prevToken.value;
                    variableStartToken = prevPrevToken;
                    logger.info(`   🔍 Detected prefixed label: "${variableName}"`);
                }
            }
            
            logger.info(`   📝 Variable name: "${variableName}"`);
            // CRITICAL FIX: Capture the entire line for variable types
            // This ensures we get the full type definition including attributes
            let fullType = "";
            let j = index;

            logger.info(`   🔍 Collecting type tokens starting from index ${j}`);
            // Process to the end of the line or until a comment
            while (j < tokens.length) {
                const t = tokens[j];

                logger.info(`     - Token ${j}: type=${t.type}, value="${t.value}", line=${t.line}`);
                // Stop at the end of the line or a comment
                if (t.line !== line || t.type === TokenType.Comment) {
                    logger.info(`     - Stopping: line mismatch or comment`);
                    break;
                }

                // Skip label tokens (don't include the variable name in the type)
                if (t.type === TokenType.Label || t.type === TokenType.StructurePrefix || t.type === TokenType.Variable) {
                    logger.info(`     - Skipping label/variable token`);
                    j++;
                    continue;
                }

                // Add the token value to the type
                fullType += t.value;
                logger.info(`     - fullType now: "${fullType}"`);
                j++;
            }
            logger.info(`   ✅ Final fullType: "${fullType}"`);

            // Clean up the type
            fullType = fullType.trim();

            // Remove any trailing comments
            const commentIndex = fullType.indexOf("!");
            if (commentIndex !== -1) {
                fullType = fullType.substring(0, commentIndex).trim();
            }
            fullType = fullType.trim();
            
            // Create proper detail with parent context
            let detail = "";
            if (currentProcedure) {
                detail = `in ${currentProcedure.name}`;
            } else if (lastMethodImplementation) {
                detail = `in ${lastMethodImplementation.name}`;
            } else if (currentStructure) {
                detail = `in ${currentStructure.name}`;
            }

            // Create the symbol name with variable name and type
            const symbolName = `${variableName} ${fullType}`;
            
            logger.info(`   📝 Creating variable symbol: name="${symbolName}", detail="${detail}"`);

            const variableSymbol = this.createSymbol(
                symbolName,  // Variable name with type
                detail,  // Context in detail
                ClarionSymbolKind.Variable,
                this.getTokenRange(tokens, variableStartToken.line, line),
                this.getTokenRange(tokens, variableStartToken.line, line),
                []
            );
            
            // Store the type separately for hover provider to use
            variableSymbol._clarionType = fullType;
            variableSymbol._clarionVarName = variableName;
            
            // Use the prefix directly from the token if available
            if (prevToken && prevToken.structurePrefix) {
                // If the token already has a prefix, use it directly
                variableSymbol._isPartOfStructure = true;
                variableSymbol._structurePrefix = prevToken.structurePrefix;
                
                // Build possible reference patterns (case-insensitive)
                const possibleReferences: string[] = [];
                
                // Pattern 1: PREFIX:FieldName
                possibleReferences.push(`${prevToken.structurePrefix.toUpperCase()}:${variableName.toUpperCase()}`);
                
                // Pattern 2: StructureName.FieldName (if we have a current structure with a label)
                if (currentStructure) {
                    const structureLabel = currentStructure._clarionLabel;
                    if (structureLabel) {
                        possibleReferences.push(`${structureLabel.toUpperCase()}.${variableName.toUpperCase()}`);
                        variableSymbol._structureName = structureLabel;
                    }
                }
                
                variableSymbol._possibleReferences = possibleReferences;
                
                logger.info(`   🔍 Variable has direct prefix "${prevToken.structurePrefix}" from token`);
                logger.info(`   📋 PREFIX: Possible references: ${possibleReferences.join(', ')}`);
            }
            // Fallback to structure-based prefix if token doesn't have one
            else if (currentStructure) {
                const structurePrefix = currentStructure._clarionPrefix;
                const structureLabel = currentStructure._clarionLabel;
                
                if (structurePrefix || structureLabel) {
                    variableSymbol._isPartOfStructure = true;
                    variableSymbol._structureName = structureLabel;
                    variableSymbol._structurePrefix = structurePrefix;
                    
                    // Build possible reference patterns (case-insensitive)
                    const possibleReferences: string[] = [];
                    
                    // Pattern 1: PREFIX:FieldName (if prefix exists)
                    if (structurePrefix) {
                        possibleReferences.push(`${structurePrefix.toUpperCase()}:${variableName.toUpperCase()}`);
                    }
                    
                    // Pattern 2: StructureName.FieldName (if label exists)
                    if (structureLabel) {
                        possibleReferences.push(`${structureLabel.toUpperCase()}.${variableName.toUpperCase()}`);
                    }
                    
                    variableSymbol._possibleReferences = possibleReferences;
                    
                    logger.info(`   🔍 Variable is part of structure "${structureLabel || 'unnamed'}" with prefix "${structurePrefix || 'none'}"`);
                    logger.info(`   📋 PREFIX: Possible references: ${possibleReferences.join(', ')}`);
                }
            }

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
                    currentStructure._isSpecialRoutine) {
                    // Skip special routines and look for a better parent

                    // First, try to find a global procedure in the symbols
                    for (const symbol of symbols) {
                        if (symbol.kind === SymbolKind.Function &&
                            symbol._isGlobalProcedure === true) {
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
                        symbol._isGlobalProcedure === true) {
                        mostRecentGlobalProcedure = symbol;
                    }
                }

                if (mostRecentGlobalProcedure) {
                    target = mostRecentGlobalProcedure;
                }
            }

            this.addSymbolToParent(variableSymbol, target, symbols);
        } else {
            logger.info(`   ❌ Previous token is NOT Label or StructurePrefix - skipping (prevToken type=${prevToken?.type})`);
        }
    }

    private handleEndStatementToken(
        parentStack: Array<{ symbol: ClarionDocumentSymbol, finishesAt: number | undefined }>,
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
        symbols: ClarionDocumentSymbol[],
        currentProcedure: ClarionDocumentSymbol | null,
        currentStructure: ClarionDocumentSymbol | null
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

        const keySymbol = this.createSymbol(
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
        symbol: ClarionDocumentSymbol,
        parent: ClarionDocumentSymbol | null,
        symbols: ClarionDocumentSymbol[]
    ): void {
        const isVariable = symbol.kind === ClarionSymbolKind.Variable;

        // Check if this is a method - either explicitly marked as Method kind or
        // it's a procedure with "Method" in its detail
        const isMethod = symbol.kind === SymbolKind.Function &&
            (symbol.name.includes('.') || symbol.detail?.includes("Method"));

        // CRITICAL FIX: Also check if this is a method declaration
        const isMethodDeclaration = symbol.kind === ClarionSymbolKind.Method ||
            symbol._isMethodDeclaration === true;

        // Check if this is a MAP procedure
        const isMapProcedure = symbol.kind === SymbolKind.Function &&
            symbol._isMapProcedure === true;

        const isClassImplementation = parent?.name.includes(" (Implementation)");
        const isMethodImplementation = (parent as any)?._isMethodImplementation === true;

        // CRITICAL FIX: Set sortText for all symbols based on name
        // For variables with types, use just the variable name for sorting
        let sortName = symbol.name;
        if (isVariable && symbol.name.includes('  ')) {
            // Extract just the variable name for sorting
            sortName = symbol.name.split('  ')[0];
        }

        symbol.sortText = sortName.toLowerCase();

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
            else if (isVariable && parent.$clarionProps && !isMethodImplementation) {
                const propsContainer = parent.$clarionProps;
                propsContainer.children!.push(symbol);
                this.sortContainerChildren(propsContainer);
            }

            // Handle methods (in class or class implementation containers)
            else if ((isMethod || isMethodDeclaration) &&
                (parent.$clarionMethods || isClassImplementation)) {
                let methodsContainer;

                if (parent.$clarionMethods) {
                    methodsContainer = parent.$clarionMethods;
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
            else if ((isMethod || isMethodDeclaration) && parent._isInterface) {
                // For interfaces, add methods directly to the interface
                // No need for a Methods container
                parent.children!.push(symbol);
                this.sortContainerChildren(parent);
            }
            // Handle MAP and MODULE procedures
            else if (isMapProcedure ||
                    (symbol.kind === SymbolKind.Function &&
                     !symbol.name.startsWith("MODULE") &&  // Don't treat MODULE structure as a function
                     !symbol.name.startsWith("MAP") &&      // Don't treat MAP structure as a function
                     (parent?.name?.startsWith("MAP") || parent?.name?.startsWith("MODULE")))) {
                // For MAP and MODULE, use the Functions container if available
                if (parent.$clarionFunctions) {
                    parent.$clarionFunctions.children!.push(symbol);
                    this.sortContainerChildren(parent.$clarionFunctions);
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
    private sortContainerChildren(container: ClarionDocumentSymbol): void {
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
            child.sortText = i.toString().padStart(4, "0");
        }
    }


    private getTokenRange(tokens: Token[], startLine: number, endLine: number): Range {
        // 🚀 PERFORMANCE: Use indexed lookup instead of find/reverse
        const startLineTokens = this.tokensByLine.get(startLine) || [];
        const endLineTokens = this.tokensByLine.get(endLine) || [];
        
        const startToken = startLineTokens[0]; // First token on line
        const endToken = endLineTokens[endLineTokens.length - 1]; // Last token on line

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
        symbols: ClarionDocumentSymbol[],
        currentProcedure: ClarionDocumentSymbol | null,
        currentStructure: ClarionDocumentSymbol | null
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

        const elementSymbol = this.createSymbol(
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

