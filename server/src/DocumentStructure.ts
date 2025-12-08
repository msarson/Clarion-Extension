import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";

const logger = LoggerManager.getLogger("DocumentStructure");
logger.setLevel("error"); // TEMP: Enable for debugging method implementations

export class DocumentStructure {
    private structureStack: Token[] = [];
    private procedureStack: Token[] = [];
    private routineStack: Token[] = [];
    private foundData: boolean = false;
    private insideClassOrInterfaceOrMapDepth: number = 0;
    private structureIndentMap: Map<Token, number> = new Map();
    private maxLabelWidth: number = 0;

    // 🚀 PERFORMANCE: Index structures for O(1) lookups
    private labelIndex: Map<string, Token> = new Map();
    private procedureIndex: Map<string, Token> = new Map();
    private tokensByLine: Map<number, Token[]> = new Map();
    private structuresByType: Map<string, Token[]> = new Map();

    constructor(private tokens: Token[], private lines?: string[]) {
        // 🚀 PERFORMANCE: Build indexes first for fast lookups
        this.buildIndexes();
        this.maxLabelWidth = this.processLabels();
    }

    /**
     * 🚀 PERFORMANCE: Build index structures for fast lookups
     */
    private buildIndexes(): void {
        const perfStart = performance.now();
        
        // Index tokens by line for fast line-based lookups
        for (const token of this.tokens) {
            if (!this.tokensByLine.has(token.line)) {
                this.tokensByLine.set(token.line, []);
            }
            this.tokensByLine.get(token.line)!.push(token);
            
            // Index labels
            if (token.type === TokenType.Label && token.label) {
                this.labelIndex.set(token.label.toUpperCase(), token);
            }
            
            // Index structures by type
            if (token.type === TokenType.Structure) {
                const structType = token.value.toUpperCase();
                if (!this.structuresByType.has(structType)) {
                    this.structuresByType.set(structType, []);
                }
                this.structuresByType.get(structType)!.push(token);
            }
        }
        
        const indexTime = performance.now() - perfStart;
        logger.perf('Built indexes', {
            'time_ms': indexTime.toFixed(2),
            'tokens': this.tokens.length,
            'labels': this.labelIndex.size,
            'lines': this.tokensByLine.size,
            'struct_types': this.structuresByType.size
        });
    }

    public process(): void {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
    
            // ✅ Always prioritize structure tokens first
            if (token.type === TokenType.Keyword || token.type === TokenType.ExecutionMarker) {
                switch (token.value.toUpperCase()) {
                    case "PROCEDURE":
                        this.handleProcedureToken(token, i);
                        break;
                    case "ROUTINE":
                        this.handleRoutineToken(token, i);
                        break;
                    case "CODE":
                    case "DATA":
                        this.handleExecutionMarker(token);
                        break;
                    case "WHILE":
                    case "UNTIL":
                        // Check if this WHILE/UNTIL terminates a LOOP
                        this.handleLoopTerminator(token, i);
                        break;
                }
            } else if (token.type === TokenType.Structure) {
                this.handleStructureToken(token);
            } else if (token.type === TokenType.EndStatement) {
                this.handleEndStatementForStructure(token);
            } else if (token.type === TokenType.Label && token.start === 0 && this.structureStack.length > 0) {
                // Add label tokens as children of their parent structure (for GROUP/QUEUE/RECORD fields)
                const parentStructure = this.structureStack[this.structureStack.length - 1];
                const structureTypes = ["RECORD", "GROUP", "QUEUE", "FILE", "VIEW", "WINDOW", "REPORT"];
                if (structureTypes.includes(parentStructure.value.toUpperCase())) {
                    parentStructure.children = parentStructure.children || [];
                    parentStructure.children.push(token);
                    token.parent = parentStructure;
                    logger.info(`📌 Added field '${token.value}' as child of structure '${parentStructure.value}'`);
                }
            }
            
        }
        
        // Close any procedures that are still open at the end of the file
        this.closeRemainingProcedures();
        this.assignMaxLabelLengths();
    }
    
    private handleExecutionMarker(token: Token): void {
        const currentProcedure = this.procedureStack[this.procedureStack.length - 1] ?? null;
        const currentRoutine = this.routineStack[this.routineStack.length - 1] ?? null;

        if (token.value.toUpperCase() === "DATA") {
            if (currentRoutine) {
                currentRoutine.hasLocalData = true;
                this.foundData = true;
            } else if (currentProcedure) {
                currentProcedure.hasLocalData = true;
                this.foundData = true;
            }
        }

        if (token.value.toUpperCase() === "CODE") {
            if (currentRoutine) {
                currentRoutine.executionMarker = token;
                logger.info(`🚀 CODE execution marker set for ROUTINE '${currentRoutine.value}' at Line ${token.line}`);
            } else if (currentProcedure) {
                currentProcedure.executionMarker = token;
                logger.info(`🚀 CODE execution marker set for PROCEDURE '${currentProcedure.value}' at Line ${token.line}`);
            } else {
                logger.warn(`⚠️ CODE statement found at Line ${token.line}, but no valid procedure or routine to assign it to.`);
            }
        }
    }

    private processLabels(): number {
        let maxLabelWidth = 0;

        for (const token of this.tokens) {
            const insideExecutionCode = this.procedureStack.length > 0;

            if (!insideExecutionCode && token.start === 0 && 
                token.type !== TokenType.Comment && 
                token.type !== TokenType.Directive && 
                token.value !== '?') {
                token.type = TokenType.Label;
                token.label = token.value;
                maxLabelWidth = Math.max(maxLabelWidth, token.value.length);
                logger.info(`📌 Label '${token.value}' detected at Line ${token.line}, structureStack.length=${this.structureStack.length}`);

                if (this.structureStack.length > 0) {
                    let parentStructure = this.structureStack[this.structureStack.length - 1];
                    logger.info(`📌 Parent structure: '${parentStructure.value}' at line ${parentStructure.line}`);
                    parentStructure.maxLabelLength = Math.max(parentStructure.maxLabelLength || 0, token.value.length);

                    // ✅ If we're inside a structure that can have fields, mark this as a structure field
                    // This includes RECORD, GROUP, QUEUE, FILE, etc.
                    const structureTypes = ["RECORD", "GROUP", "QUEUE", "FILE", "VIEW", "WINDOW", "REPORT"];
                    if (structureTypes.includes(parentStructure.value.toUpperCase())) {
                        token.isStructureField = true;
                        token.structureParent = parentStructure;
                        
                        // ✅ Add field as child of the parent structure
                        parentStructure.children = parentStructure.children || [];
                        parentStructure.children.push(token);
                        logger.info(`📌 Added field '${token.value}' as child of structure '${parentStructure.value}'`);

                        // Find the label of the parent structure (if any)
                        // 🚀 PERFORMANCE: Use tokensByLine index instead of indexOf
                        const lineTokens = this.tokensByLine.get(parentStructure.line);
                        if (lineTokens) {
                            const structIndex = lineTokens.indexOf(parentStructure);
                            if (structIndex > 0) {
                                // Check if the token before the structure is a label
                                const prevToken = lineTokens[structIndex - 1];
                                if (prevToken && prevToken.type === TokenType.Label) {
                                    // Set the nestedLabel property to the parent structure's label
                                    token.nestedLabel = prevToken.value;
                                    logger.info(`📌 Field '${token.value}' has nested label '${prevToken.value}'`);
                                }
                            }
                        }

                        // Check for a prefix in the structure hierarchy
                        let prefixFound = false;

                        // First check the immediate parent structure
                        if (parentStructure.structurePrefix) {
                            // Set the structurePrefix property on the label token
                            token.structurePrefix = parentStructure.structurePrefix;
                            logger.info(`📌 Field '${token.value}' associated with prefix '${parentStructure.structurePrefix}'`);
                            prefixFound = true;
                        }

                        // If no prefix found and we're in a nested structure, look up the structure stack
                        if (!prefixFound && parentStructure.parent) {
                            // Start from the parent's parent and go up the chain
                            let currentParent: Token | undefined = parentStructure.parent;

                            // Traverse up the parent chain
                            while (currentParent) {
                                if (currentParent.type === TokenType.Structure && currentParent.structurePrefix) {
                                    // Found a prefix in an ancestor structure
                                    token.structurePrefix = currentParent.structurePrefix;
                                    logger.info(`📌 Field '${token.value}' inherited prefix '${currentParent.structurePrefix}' from ancestor structure`);
                                    prefixFound = true;
                                    break;
                                }
                                // Move to the next parent in the chain
                                currentParent = currentParent.parent;
                            }
                        }
                    }
                }
            }
        }

        return maxLabelWidth;
    }

    private assignMaxLabelLengths(): void {
        for (const token of this.tokens) {
            if (token.type !== TokenType.Structure) continue;

            if (token.parent && token.parent.type === TokenType.Structure) continue;
            if (token.subType === TokenType.Procedure || token.subType === TokenType.Routine) continue;

            const executionMarkerLine = token.parent?.executionMarker?.line ?? null;
            if (executionMarkerLine !== null && token.line > executionMarkerLine) {
                token.maxLabelLength = 0;
                continue;
            }

            let maxLabelLength = 0;

            const topLabel = this.tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === token.line &&
                t.start === 0
            );

            if (topLabel) {
                maxLabelLength = topLabel.value.length;
            }

            let structureTokens = this.tokens.filter(t => t.parent === token);
            for (const childToken of structureTokens) {
                if (childToken.type === TokenType.Label) {
                    maxLabelLength = Math.max(maxLabelLength, childToken.value.length);
                }
            }

            let inlineLabels = this.tokens.filter(t =>
                t.line > token.line &&
                t.start === 0 &&
                t.type === TokenType.Label &&
                t.parent === token
            );

            for (const label of inlineLabels) {
                maxLabelLength = Math.max(maxLabelLength, label.value.length);
            }

            token.maxLabelLength = maxLabelLength;
        }
    }

    private handleStructureToken(token: Token): void {
        if (!token.subType) {
            token.subType = TokenType.Structure;
        }

        // 🛑 Special handling: Skip MODULE structures that are part of CLASS attribute list
        if (token.value.toUpperCase() === "MODULE") {
            // 🚀 PERFORMANCE: Use tokensByLine index
            const sameLine = this.tokensByLine.get(token.line) || [];
            const currentIndex = sameLine.findIndex(t => t === token);

            for (let j = currentIndex - 1; j >= 0; j--) {
                const prev = sameLine[j];
                if (prev.value === ',') {
                    logger.info(`📛 Skipping MODULE at line ${token.line} – part of CLASS attribute list`);
                    return;
                }
                if (prev.value === '(' || prev.type === TokenType.Structure || prev.type === TokenType.Keyword) {
                    break;
                }
            }
        }
        
        // 🛑 Special handling: Skip TOOLBAR when it's inside a function call like SELF.AddItem(Toolbar)
        if (token.value.toUpperCase() === "TOOLBAR") {
            // 🚀 PERFORMANCE: Use tokensByLine index
            const sameLine = this.tokensByLine.get(token.line) || [];
            const currentIndex = sameLine.findIndex(t => t === token);
            
            // Check if TOOLBAR is inside parentheses
            let insideParentheses = false;
            let parenDepth = 0;
            
            for (let j = 0; j < sameLine.length; j++) {
                const t = sameLine[j];
                if (t.value === '(') parenDepth++;
                if (t.value === ')') parenDepth--;
                
                if (j === currentIndex && parenDepth > 0) {
                    insideParentheses = true;
                    break;
                }
            }
            
            if (insideParentheses) {
                logger.info(`📛 Skipping TOOLBAR at line ${token.line} – inside function call`);
                token.type = TokenType.Variable; // Change to variable instead
                return;
            }
        }

        // ✅ Check if structure ends on the same line (single-line declaration)
        // Examples: "AnswerDateTime GROUP(DateTimeType)." or "MyGroup GROUP;END"
        const sameLine = this.tokensByLine.get(token.line) || [];
        const structureIndex = sameLine.indexOf(token);
        let endsOnSameLine = false;
        
        // Check source text for period (since periods may not be tokenized)
        if (this.lines && token.line >= 0 && token.line < this.lines.length) {
            const lineText = this.lines[token.line];
            
            // Check if line ends with period (after trimming whitespace)
            if (lineText.trim().endsWith('.')) {
                endsOnSameLine = true;
                token.finishesAt = token.line;
            }
        }
        
        // Also check tokens for period or END (fallback if source text not available)
        if (!endsOnSameLine) {
            for (let i = structureIndex + 1; i < sameLine.length; i++) {
                const t = sameLine[i];
                
                // Found period terminator
                if (t.value === '.') {
                    endsOnSameLine = true;
                    token.finishesAt = token.line;
                    break;
                }
                
                // Found END keyword
                if (t.type === TokenType.EndStatement || t.value.toUpperCase() === 'END') {
                    endsOnSameLine = true;
                    token.finishesAt = token.line;
                    break;
                }
            }
        }
        
        // If structure ends on same line, don't push to stack (no folding needed)
        if (endsOnSameLine) {
            return;
        }
        
        // ✅ Special handling: MODULE inside CLASS/INTERFACE doesn't get pushed to stack
        // It doesn't need its own END - the CLASS/INTERFACE END terminates it
        if (token.value.toUpperCase() === 'MODULE' && this.structureStack.length > 0) {
            const parentStructure = this.structureStack[this.structureStack.length - 1];
            const parentType = parentStructure.value.toUpperCase();
            
            if (parentType === 'CLASS' || parentType === 'INTERFACE') {
                // MODULE inside CLASS/INTERFACE - don't push to stack, just set parent relationship
                token.parent = parentStructure;
                parentStructure.children = parentStructure.children || [];
                parentStructure.children.push(token);
                // Set finishesAt to the parent's finishesAt (will be set when parent closes)
                // For now, we'll set it in handleEndStatementForStructure
                logger.info(`📌 MODULE inside ${parentType} at Line ${token.line} - not pushing to stack`);
                return;
            }
        }

        token.maxLabelLength = 0;
        this.structureStack.push(token);

        // Add parent-child relationship with current procedure or structure
        // Special case: MODULE inside MAP should be child of MAP, not the containing procedure
        const isModuleInMap = token.value.toUpperCase() === 'MODULE' && 
                              this.structureStack.length > 1 &&
                              this.structureStack[this.structureStack.length - 2].value.toUpperCase() === 'MAP';
        
        if (isModuleInMap || this.structureStack.length > 1) {
            // Prioritize structure stack (nested structures or MODULE in MAP)
            const parentStructure = this.structureStack[this.structureStack.length - 2];
            token.parent = parentStructure;
            parentStructure.children = parentStructure.children || [];
            parentStructure.children.push(token);
            logger.info(`🔗 Structure ${token.value} at Line ${token.line} parented to structure ${parentStructure.value}`);
        } else if (this.procedureStack.length > 0) {
            // Fall back to procedure parent only if no structure parent exists
            const parentProcedure = this.procedureStack[this.procedureStack.length - 1];
            token.parent = parentProcedure;
            parentProcedure.children = parentProcedure.children || [];
            parentProcedure.children.push(token);
            logger.info(`🔗 Structure ${token.value} at Line ${token.line} parented to procedure ${parentProcedure.value}`);
        }

        // 🚀 PERFORMANCE: Use tokensByLine to find previous token
        const lineTokens = this.tokensByLine.get(token.line) || [];
        const tokenIndex = lineTokens.indexOf(token);
        if (tokenIndex > 0) {
            const prevToken = lineTokens[tokenIndex - 1];
            if (prevToken.type === TokenType.Label) {
                token.label = prevToken.value;
            }
        }
        logger.info(`🧱 Opened ${token.value} at Line ${token.line} ${token.label}`);

        // ✅ Extract structure prefix if present (PRE)
        // Look for PRE attribute in the same line or next few lines
        // This works for all structure types (FILE, QUEUE, GROUP, RECORD, etc.)
        // 🚀 PERFORMANCE: Search only in relevant lines
        const searchEndLine = Math.min(token.line + 20, this.tokens[this.tokens.length - 1]?.line || token.line);
        
        prefixSearch: for (let line = token.line; line <= searchEndLine; line++) {
            const tokensInLine = this.tokensByLine.get(line) || [];
            
            for (let idx = 0; idx < tokensInLine.length; idx++) {
                const t = tokensInLine[idx];

                // If we hit an END statement or another structure, stop searching
                if (t.type === TokenType.EndStatement ||
                    (t.type === TokenType.Structure && t !== token)) {
                    break prefixSearch;
                }

                // Look for PRE attribute
                if (t.value.toUpperCase() === "PRE") {
                    // Check if PRE is followed by parentheses with a prefix
                    if (idx + 1 < tokensInLine.length && tokensInLine[idx + 1].value === "(") {
                        let prefixValue = "";
                        let j = idx + 2;

                        // Extract the prefix value inside the parentheses
                        while (j < tokensInLine.length && tokensInLine[j].value !== ")") {
                            prefixValue += tokensInLine[j].value;
                            j++;
                        }

                        if (prefixValue) {
                            token.structurePrefix = prefixValue;
                            logger.info(`📌 Found structure prefix: ${prefixValue} for ${token.value} at Line ${token.line}`);
                        }
                    }
                    break prefixSearch;
                }
            }
        }

        if (["CLASS", "MAP", "INTERFACE", "MODULE"].includes(token.value.toUpperCase())) {
            logger.info(`Checking if ${token.value.toUpperCase()} is inline`);
            // 🚀 PERFORMANCE: Use tokensByLine index
            const sameLine = this.tokensByLine.get(token.line) || [];
            logger.info(`Same line tokens: ${sameLine.map(t => t.value).join(", ")}`);
            const currentIndex = sameLine.findIndex(t => t === token);
            let isInlineAttribute = false;

            for (let j = currentIndex - 1; j >= 0; j--) {
                const prev = sameLine[j];
                if (prev.value === ',') {
                    isInlineAttribute = true;
                    break;
                }
                if (prev.value === '(' || prev.type === TokenType.Structure || prev.type === TokenType.Keyword) {
                    break;
                }
            }

            logger.info(`Is inline attribute: ${isInlineAttribute}`);

            if (!isInlineAttribute) {
                this.insideClassOrInterfaceOrMapDepth++;
                // Store the structure type in the token's value
                // We'll use this later to identify the type of structure
                logger.info(`Inside ${token.value.toUpperCase()} structure, depth: ${this.insideClassOrInterfaceOrMapDepth}`);
                
                // Special handling for MAP structure: look for shorthand procedure declarations
                if (token.value.toUpperCase() === "MAP") {
                    this.processShorthandProcedures(token);
                }
            } else {
                logger.info('Skipping inline attribute');
                return;
            }
        }

        let indentLevel = this.maxLabelWidth;
        this.structureIndentMap.set(token, indentLevel);
    }

    /**
     * Process shorthand procedure declarations in MAP structures
     * In MAP structures, procedures can be declared without the PROCEDURE keyword
     * Format: ProcedureName(parameters),returnType
     *
     * In shorthand syntax, the entire declaration is in a single token:
     * e.g., "Dos2DriverPipe(Long pOpCode, long pClaFCB, long pVarList),long,name(LongName)"
     */
    private processShorthandProcedures(mapToken: Token): void {
        const mapIndex = this.tokens.indexOf(mapToken);
        if (mapIndex === -1) return;
        
        // Find the END statement for this MAP
        let endIndex = -1;
        let depth = 1;
        
        for (let i = mapIndex + 1; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            if (token.type === TokenType.Structure) {
                depth++;
            } else if (token.type === TokenType.EndStatement) {
                depth--;
                if (depth === 0) {
                    endIndex = i;
                    break;
                }
            }
            
            // Look for tokens that contain an opening parenthesis
            // In shorthand syntax, the procedure name and opening parenthesis are in the same token
            if (token.value.includes("(") && token.value !== "(" && !token.value.toLowerCase().startsWith("module") && ! token.value.startsWith("!")) {
                // This looks like a shorthand procedure declaration
                token.subType = TokenType.MapProcedure;
                token.parent = mapToken;
                mapToken.children = mapToken.children || [];
                mapToken.children.push(token);
                
                // Extract the procedure name (everything before the opening parenthesis)
                const procName = token.value.split("(")[0].trim();
                
                // CRITICAL FIX: Set the token's label to the procedure name
                // This ensures it will be displayed correctly in the outline view
                token.label = procName;
                
                logger.info(`📌 Found MAP shorthand procedure: ${procName} at line ${token.line}`);
            }
        }
    }

    private handleLoopTerminator(token: Token, index: number): void {
        // WHILE or UNTIL can terminate a LOOP if:
        // 1. It's not at the beginning of the LOOP (LOOP WHILE... or LOOP UNTIL...)
        // 2. There's a LOOP on the structure stack
        
        // Check if there's a LOOP in the structure stack
        const loopIndex = this.structureStack.findIndex(s => s.value.toUpperCase() === 'LOOP');
        if (loopIndex === -1) {
            // No LOOP to terminate - this must be LOOP WHILE/UNTIL (at the start)
            return;
        }
        
        const loopStructure = this.structureStack[loopIndex];
        
        // Check if this WHILE/UNTIL is on the same line as the LOOP
        // If so, it's the opening condition, not a terminator
        if (loopStructure.line === token.line) {
            return;
        }
        
        // This WHILE/UNTIL terminates the LOOP
        // Pop everything from the stack until we get to (and including) the LOOP
        while (this.structureStack.length > loopIndex) {
            const poppedStructure = this.structureStack.pop()!;
            poppedStructure.finishesAt = token.line;
            logger.info(`🔚 Closed ${poppedStructure.value} at Line ${token.line} (terminated by ${token.value.toUpperCase()})`);
        }
    }

    private handleEndStatementForStructure(token: Token): void {
        // ✅ Check if this END/period is an inline terminator
        // If there's a structure keyword on the same line, this END/period terminates that structure, not the stack
        const sameLine = this.tokensByLine.get(token.line) || [];
        const structureOnSameLine = sameLine.find(t => 
            t.type === TokenType.Structure && t !== token
        );
        
        if (structureOnSameLine) {
            // This is an inline terminator - don't pop from stack
            logger.info(`🔚 Inline terminator '${token.value}' at Line ${token.line} for '${structureOnSameLine.value}' (not popping stack)`);
            return;
        }
        
        // This END/period terminates a structure from the stack
        const lastStructure = this.structureStack.pop();
        if (lastStructure) {
            lastStructure.finishesAt = token.line;
            token.start = this.structureIndentMap.get(lastStructure) || 0;
            logger.info(`🔚 Closed ${lastStructure.value} at Line ${token.line}`);
            if (["CLASS", "MAP", "INTERFACE", "MODULE"].includes(lastStructure.value.toUpperCase())) {
                this.insideClassOrInterfaceOrMapDepth = Math.max(0, this.insideClassOrInterfaceOrMapDepth - 1);
                logger.info(`Exiting ${lastStructure.value.toUpperCase()} structure, depth: ${this.insideClassOrInterfaceOrMapDepth}`);
            }
        }
    }

    private handleProcedureInsideDefinition(token: Token, index: number): void {
        const prevToken = this.tokens[index - 1];
        if (prevToken?.type === TokenType.Label) {
            token.label = prevToken.value;
         //   token.subType = TokenType.Procedure; // optional but useful
            logger.info(`📌 Found method definition '${token.label}' at line ${token.line} inside CLASS/MAP`);
        }
    }

    private handleProcedureToken(token: Token, index: number): void {
        const prevToken = this.tokens[index - 1];
    
        // 🧠 Determine token type based on context
        if (this.insideClassOrInterfaceOrMapDepth > 0) {
            // It's a declaration inside CLASS, MAP, INTERFACE, or MODULE
            const parent = this.structureStack[this.structureStack.length - 1];
            const parentType = parent?.value.toUpperCase();
            token.label = prevToken?.value ?? "AnonymousMethod";
        
            token.type = TokenType.Procedure; // ✅ Always keep as Procedure
            if (parentType === "CLASS") {
                token.subType = TokenType.MethodDeclaration;
            } else if (parentType === "MAP") {
                token.subType = TokenType.MapProcedure;
                logger.info(`📌 Found MAP procedure: ${token.label}`);
            } else if (parentType === "MODULE") {
                token.subType = TokenType.MapProcedure; // Use same type for MODULE procedures
                logger.info(`📌 Found MODULE procedure: ${token.label}`);
            } else if (parentType === "INTERFACE") {
                token.subType = TokenType.InterfaceMethod;
            } else {
                token.subType = TokenType.MethodDeclaration; // fallback
            }
        
            token.parent = parent;
            parent.children = parent.children || [];
            parent.children.push(token);
        
            logger.info(`📌 Declared ${TokenType[token.subType]} '${token.label}' inside ${parentType} at line ${token.line}`);
            return;
        }
        
        // Only close the previous procedure if we're not inside a CLASS/MAP/INTERFACE
        const lastProc = this.procedureStack[this.procedureStack.length - 1];
        if (lastProc) {
            this.handleProcedureClosure(token.line - 1);
        }
        
        // Check for method implementation: Look for pattern like "ClassName.MethodName PROCEDURE"
        // This could be tokenized as: Label(ClassName) + Variable(MethodName) + Keyword(PROCEDURE)
        // Or in some cases: Label(ClassName.MethodName) + Keyword(PROCEDURE)
        let isMethodImpl = false;
        let fullProcedureName = prevToken?.value ?? "AnonymousProcedure";
        
        // Check if prevToken is a label or variable that might be part of a method name
        if (prevToken?.type === TokenType.Label || prevToken?.type === TokenType.Variable) {
            // Look back one more token to see if there's a class name
            const tokenBeforePrev = index >= 2 ? this.tokens[index - 2] : null;
            if (tokenBeforePrev?.type === TokenType.Label && tokenBeforePrev.line === token.line) {
                // We have: Label + (Label|Variable) + PROCEDURE on same line
                // This is likely: ClassName.MethodName PROCEDURE
                fullProcedureName = `${tokenBeforePrev.value}.${prevToken.value}`;
                isMethodImpl = true;
            } else if (prevToken.value.includes(".")) {
                // The previous token itself contains a dot (entire name in one token)
                fullProcedureName = prevToken.value;
                isMethodImpl = true;
            }
        }
        
        token.label = fullProcedureName;
        token.type = TokenType.Procedure; // ✅ Always keep as Procedure
        token.subType = isMethodImpl ? TokenType.MethodImplementation : TokenType.GlobalProcedure;
        
        // Skip assigning parent for method implementations — handled in postprocessing
        if (!isMethodImpl && this.structureStack.length > 0) {
            const parent = this.structureStack[this.structureStack.length - 1];
            token.parent = parent;
            parent.children = parent.children || [];
            parent.children.push(token);
        }
        
        this.procedureStack.push(token);
        
        logger.info(`📌 Registered ${TokenType[token.subType]} '${token.label}' at line ${token.line}`);
    }

    private handleRoutineToken(token: Token, index: number): void {
        if (this.procedureStack.length === 0) return;

        this.handleRoutineClosure(token.line - 1);

        let parentProcedure = this.procedureStack[this.procedureStack.length - 1];
        token.parent = parentProcedure;
        parentProcedure.children = parentProcedure.children || [];
        parentProcedure.children.push(token);

        token.subType = TokenType.Routine;
        const prevToken = this.tokens[index - 1];
        token.label = prevToken?.value ?? "AnonymousRoutine";

        this.routineStack.push(token);
        this.foundData = false;
    }

    private handleProcedureClosure(endLine: number): void {
        const lastProcedure = this.procedureStack.pop();
        if (lastProcedure) {
            logger.info(`📤 Closed ${lastProcedure.subType} ${lastProcedure.value} at line ${endLine}`);
            lastProcedure.finishesAt = endLine;
        }

        while (this.routineStack.length > 0) {
            this.handleRoutineClosure(endLine);
        }
    }

    private handleRoutineClosure(endLine: number): void {
        if (this.routineStack.length > 0) {
            const lastRoutine = this.routineStack.pop();
            if (lastRoutine) {
                lastRoutine.finishesAt = endLine;
            }
        }
    }

    public closeRemainingProcedures(): void {
        while (this.procedureStack.length > 0) {
            const lastProcedure = this.procedureStack.pop();
            if (lastProcedure) {
                lastProcedure.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] PROCEDURE '${lastProcedure.value}' closed at Line ${lastProcedure.finishesAt}`);
            }
        }

        while (this.routineStack.length > 0) {
            const lastRoutine = this.routineStack.pop();
            if (lastRoutine) {
                lastRoutine.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] ROUTINE '${lastRoutine.value}' closed at Line ${lastRoutine.finishesAt}`);
            }
        }
    }
}
