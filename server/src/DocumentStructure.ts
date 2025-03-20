import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";

const logger = LoggerManager.getLogger("DocumentStructure");
logger.setLevel("error");

export class DocumentStructure {
    private structureStack: Token[] = [];
    private procedureStack: { token: Token; label: string }[] = [];

    private routineStack: { token: Token; label: string }[] = [];
    private insideRoutine: Token | null = null;
    private foundData: boolean = false;
    private insideClassOrInterfaceOrMapDepth: number = 0;
    private structureIndentMap: Map<Token, number> = new Map();
    private maxLabelWidth: number = 0;

    constructor(private tokens: Token[]) {
        this.maxLabelWidth = this.processLabels(); // ✅ Process labels at initialization
    }

    /** 🚀 Process token relationships and update tokens */
    public process(): void {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];

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
                }
            } else if (token.type === TokenType.Structure) {
                this.handleStructureToken(token);
            } else if (token.type === TokenType.EndStatement) {
                this.handleEndStatementForStructure(token);
            }
        }

        this.closeRemainingProcedures();
        this.assignMaxLabelLengths(); // ✅ Restore the function to ensure labels align correctly
    }

    /** ✅ Handles Execution Markers (DATA and CODE) */
    /** ✅ Handles Execution Markers (DATA and CODE) */
    private handleExecutionMarker(token: Token): void {
        if (token.value.toUpperCase() === "DATA") {
            if (this.insideRoutine) {
                this.insideRoutine.hasLocalData = true;
                this.foundData = true;
            } else if (this.procedureStack.length > 0) {
                let parentProcedure = this.procedureStack[this.procedureStack.length - 1];
                parentProcedure.token.hasLocalData = true;
                this.foundData = true;
            }
        }

        if (token.value.toUpperCase() === "CODE") {
            let targetProcedure: Token | null = null;

            if (this.procedureStack.length > 0) {
                targetProcedure = this.procedureStack[this.procedureStack.length - 1].token;
            } else if (this.insideRoutine) {
                targetProcedure = this.insideRoutine;
            }

            if (targetProcedure) {
                targetProcedure.executionMarker = token;
                logger.info(`🚀 CODE execution marker set for PROCEDURE '${targetProcedure.value}' at Line ${token.line}`);
            } else {
                logger.warn(`⚠️ CODE statement found at Line ${token.line}, but no valid procedure or routine to assign it to.`);
            }
        }
    }



    /** ✅ Process Labels, but only if outside execution code */
    private processLabels(): number {
        let maxLabelWidth = 0;

        for (const token of this.tokens) {
            const insideExecutionCode = this.insideRoutine !== null || this.procedureStack.length > 0;

            // ✅ Only process labels if outside execution code
            if (!insideExecutionCode && token.start === 0 && token.type !== TokenType.Comment) {
                if (token.type !== TokenType.Label && token.type !== TokenType.ClassLabel) {
                    token.type = TokenType.Label;
                } else {
                    token.subType = token.type;
                }
                maxLabelWidth = Math.max(maxLabelWidth, token.value.length);
                logger.info(`📌 Label '${token.value}' detected at Line ${token.line}, forced to column 0.`);

                // ✅ Assign label to the nearest enclosing structure
                if (this.structureStack.length > 0) {
                    let parentStructure = this.structureStack[this.structureStack.length - 1];
                    parentStructure.maxLabelLength = Math.max(parentStructure.maxLabelLength || 0, token.value.length);
                }
            }
        }

        return maxLabelWidth;
    }


    private assignMaxLabelLengths(): void {
        logger.info("📜 STRUCTURE MAP BEFORE PROCESSING:");

        for (const token of this.tokens) {
            if (token.type === TokenType.Structure) {
                logger.info(`🔹 ${token.value} (Line: ${token.line}) | Parent: ${token.parent?.value || "None"} | Execution Marker: ${token.parent?.executionMarker?.line ?? "No"} | Children: ${token.children?.length || 0}`);
            }
        }

        for (const token of this.tokens) {
            if (token.type !== TokenType.Structure) continue;

            // ✅ Ignore nested structures – only compute maxLabelLength for top-level ones
            if (token.parent && token.parent.type === TokenType.Structure) {
                logger.info(`⏩ Skipping '${token.value}' (Nested Structure) at Line ${token.line}`);
                continue;
            }

            // ✅ Ensure Procedures and Routines are NOT treated as structures
            if (token.subType === TokenType.Procedure || token.subType === TokenType.Routine) {
                logger.info(`⏩ Skipping '${token.value}' (Procedure/Routine) at Line ${token.line}`);
                continue;
            }

            // ✅ Retrieve execution marker from parent (if available)
            const executionMarkerLine = token.parent?.executionMarker?.line ?? null;

            // ✅ If this token appears *after* an execution marker, it's inside execution code
            if (executionMarkerLine !== null && token.line > executionMarkerLine) {
                logger.info(`⏩ Ignoring '${token.value}' inside execution code at Line ${token.line} (CODE starts at ${executionMarkerLine})`);
                token.maxLabelLength = 0;
                continue;
            }

            // ✅ Start maxLabelLength calculation from 0
            let maxLabelLength = 0;
            logger.info(`🔍 Checking '${token.value}' (Line ${token.line}) - Initial maxLabelLength: ${maxLabelLength}`);

            // ✅ Find the topmost label for this structure (on the same line)
            const topLabel = this.tokens.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.ClassLabel) &&
                t.line === token.line &&
                t.start === 0 // Ensure it's a proper column 0 label
            );

            // ✅ If structure has its own label, consider its length first
            if (topLabel) {
                maxLabelLength = topLabel.value.length;
                logger.info(`📌 Structure's own label '${topLabel.value}' sets baseline: ${maxLabelLength}`);
            }

            // ✅ Find **all tokens inside this structure** that could have labels
            let structureTokens = this.tokens.filter(
                t => t.parent === token
            );

            if (structureTokens.length === 0 && !topLabel) {
                logger.info(`📌 No child tokens found for '${token.value}' at Line ${token.line}`);
            }

            for (const childToken of structureTokens) {
                if (childToken.type === TokenType.Label || childToken.type === TokenType.ClassLabel) {
                    logger.info(`📌 Label '${childToken.value}' contributes: ${childToken.value.length} (Line ${childToken.line})`);
                    maxLabelLength = Math.max(maxLabelLength, childToken.value.length);
                }
            }

            // ✅ Ensure we account for **KEYs, FIELDS, or other non-structure elements**
            let inlineLabels = this.tokens.filter(t =>
                t.line > token.line &&  // ✅ Must be inside the structure
                t.start === 0 &&        // ✅ Must be at column 0
                (t.type === TokenType.Label || t.type === TokenType.ClassLabel) &&  // ✅ Check for both label types
                t.parent === token // ✅ Must belong to this structure
            );

            for (const label of inlineLabels) {
                logger.info(`📌 Inline Label '${label.value}' contributes: ${label.value.length} (Line ${label.line})`);
                maxLabelLength = Math.max(maxLabelLength, label.value.length);
            }

            // ✅ Store max label length ONLY for **top-level structures**
            token.maxLabelLength = maxLabelLength;
            logger.info(`📏 Final maxLabelLength for '${token.value}' (Line ${token.line}) is ${maxLabelLength}`);
        }
    }








    /** ✅ Handles STRUCTURES (CLASS, MAP, INTERFACE, etc.) */
    private handleStructureToken(token: Token): void {
        token.subType = TokenType.Structure;
        token.maxLabelLength = 0; // Initialize max label length for this structure
        this.structureStack.push(token);

        if (["CLASS", "MAP", "INTERFACE"].includes(token.value.toUpperCase())) {
            this.insideClassOrInterfaceOrMapDepth++;
        }

        // ✅ Store indentation for this structure
        let indentLevel = this.maxLabelWidth;
        this.structureIndentMap.set(token, indentLevel);
    }

    /** ✅ Handles END statements */
    private handleEndStatementForStructure(token: Token): void {
        const lastStructure = this.structureStack.pop();
        if (lastStructure) {
            lastStructure.finishesAt = token.line;
            token.start = this.structureIndentMap.get(lastStructure) || 0;

            if (["CLASS", "MAP", "INTERFACE"].includes(lastStructure.value.toUpperCase())) {
                this.insideClassOrInterfaceOrMapDepth = Math.max(0, this.insideClassOrInterfaceOrMapDepth - 1);
            }
        }
    }

    private handleProcedureToken(token: Token, index: number): void {

        if (this.insideClassOrInterfaceOrMapDepth > 0) return;

        let prevToken = this.tokens[index - 1];
        let associatedLabel = prevToken &&
            (prevToken.type === TokenType.Label || prevToken.type === TokenType.ClassLabel)
            ? prevToken.value
            : 'Unknown Label';


        logger.info(`🔍 PROCEDURE '${token.value}' (Label: '${associatedLabel}') detected at Line ${token.line}`);

        // ✅ Close previous procedure before opening a new one
        this.handleProcedureClosure(token.line - 1);

        // ✅ Assign parent-child relationship (if inside a structure)
        if (this.structureStack.length > 0) {
            let parent = this.structureStack[this.structureStack.length - 1];
            token.parent = parent;
            parent.children = parent.children || [];
            parent.children.push(token);
        }

        token.subType = TokenType.Procedure;
        this.procedureStack.push({ token, label: associatedLabel });
    }


    /** ✅ Handles ROUTINE declarations */
    private handleRoutineToken(token: Token, index: number): void {
        if (this.procedureStack.length === 0) return;
        let prevToken = this.tokens[index - 1];
        let associatedLabel = prevToken &&
            (prevToken.type === TokenType.Label || prevToken.type === TokenType.ClassLabel)
            ? prevToken.value
            : 'Unknown Label';
        // ✅ Close previous routine before opening a new one
        this.handleRoutineClosure(token.line - 1);

        // ✅ Assign parent-child relationship (inside a procedure)
        let parentProcedure = this.procedureStack[this.procedureStack.length - 1].token;
        token.parent = parentProcedure;
        parentProcedure.children = parentProcedure.children || [];
        parentProcedure.children.push(token);

        this.insideRoutine = token;
        this.foundData = false;
        token.subType = TokenType.Routine;
        this.routineStack.push({ token, label: associatedLabel });
    }

    /** ✅ Closes previous PROCEDUREs */
    private handleProcedureClosure(endLine: number): void {
        if (this.procedureStack.length > 0) {
            const lastProcedure = this.procedureStack.pop();
            if (lastProcedure) {
                lastProcedure.token.finishesAt = endLine;

                // Fetch the corresponding label from the stored tokens (if available)


                logger.info(`✅ PROCEDURE '${lastProcedure.token.value}' (Label: '${lastProcedure.label}') closed at Line ${lastProcedure.token.finishesAt}`);
            }
        }

        while (this.routineStack.length > 0) {
            this.handleRoutineClosure(endLine);
        }
    }


    /** ✅ Closes previous ROUTINEs */
    private handleRoutineClosure(endLine: number): void {
        if (this.routineStack.length > 0) {
            const lastRoutine = this.routineStack.pop();
            if (lastRoutine) {
                lastRoutine.token.finishesAt = endLine;
                logger.info(`✅ ROUTINE '${lastRoutine.token.value}' closed at Line ${lastRoutine.token.finishesAt}`);
            }
        }
    }

    /** ✅ Closes any remaining open PROCEDUREs and ROUTINEs */
    public closeRemainingProcedures(): void {
        while (this.procedureStack.length > 0) {
            const lastProcedure = this.procedureStack.pop();
            if (lastProcedure) {
                lastProcedure.token.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] PROCEDURE '${lastProcedure.token.value} ${lastProcedure.label}'  closed at Line ${lastProcedure.token.finishesAt}`);
            }
        }

        while (this.routineStack.length > 0) {
            const lastRoutine = this.routineStack.pop();
            if (lastRoutine) {
                lastRoutine.token.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] ROUTINE '${lastRoutine.token.value} ${lastRoutine.label}' closed at Line ${lastRoutine.token.finishesAt}`);
            }
        }
    }
}
