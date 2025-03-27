import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";

const logger = LoggerManager.getLogger("DocumentStructure");
logger.setLevel("error");

export class DocumentStructure {
    private structureStack: Token[] = [];
    private procedureStack: Token[] = [];
    private routineStack: Token[] = [];
    private foundData: boolean = false;
    private insideClassOrInterfaceOrMapDepth: number = 0;
    private structureIndentMap: Map<Token, number> = new Map();
    private maxLabelWidth: number = 0;

    constructor(private tokens: Token[]) {
        this.maxLabelWidth = this.processLabels();
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
        this.assignMaxLabelLengths();

        // ✅ Step: Re-parent class method implementations
        for (const token of this.tokens) {
            if (token.subType === TokenType.Class) {
                const classNameMatch = token.value.match(/^(\w+)\.(\w+)$/);
                if (classNameMatch) {
                    const [_, classLabel, _methodName] = classNameMatch;

                    // 🔍 Find the CLASS structure with that label
                    const classDef = this.tokens.find(t =>
                        t.type === TokenType.Structure &&
                        t.value.toUpperCase() === "CLASS" &&
                        t.parent?.value === classLabel
                    );

                    // ✅ Reassign method’s parent to the owning PROCEDURE
                    if (classDef && classDef.parent?.subType === TokenType.Procedure) {
                        const owningProc = classDef.parent;

                        token.parent = owningProc;
                        owningProc.children = owningProc.children || [];
                        owningProc.children.push(token);

                        logger.info(`🔁 Bound class method '${token.value}' to owning procedure '${owningProc.value}'`);
                    }
                }
            }
        }
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

            if (!insideExecutionCode && token.start === 0 && token.type !== TokenType.Comment) {
                token.type = TokenType.Label;
                maxLabelWidth = Math.max(maxLabelWidth, token.value.length);
               // logger.info(`📌 Label '${token.value}' detected at Line ${token.line}, forced to column 0.`);

                if (this.structureStack.length > 0) {
                    let parentStructure = this.structureStack[this.structureStack.length - 1];
                    parentStructure.maxLabelLength = Math.max(parentStructure.maxLabelLength || 0, token.value.length);
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
            const sameLine = this.tokens.filter(t => t.line === token.line);
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
    
        token.maxLabelLength = 0;
        this.structureStack.push(token);
    
        const tokenIndex = this.tokens.indexOf(token);
        let lName = "";
        if (tokenIndex > 0) {
            lName = this.tokens[tokenIndex - 1].value;
        }
        logger.info(`🧱 Opened ${token.value} at Line ${token.line} ${lName}`);
    
        if (["CLASS", "MAP", "INTERFACE"].includes(token.value.toUpperCase())) {
            logger.info(`Checking if CLASS is inline`);
            const sameLine = this.tokens.filter(t => t.line === token.line);
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
            } else {
                logger.info('Skipping module line');
                return;
            }
        }
    
        let indentLevel = this.maxLabelWidth;
        this.structureIndentMap.set(token, indentLevel);
    }
    

    private handleEndStatementForStructure(token: Token): void {
        const lastStructure = this.structureStack.pop();
        if (lastStructure) {
            lastStructure.finishesAt = token.line;
            token.start = this.structureIndentMap.get(lastStructure) || 0;
            logger.info(`🔚 Closed ${lastStructure.value} at Line ${token.line}`);
            if (["CLASS", "MAP", "INTERFACE"].includes(lastStructure.value.toUpperCase())) {
                this.insideClassOrInterfaceOrMapDepth = Math.max(0, this.insideClassOrInterfaceOrMapDepth - 1);
            }
        }
    }


    private handleProcedureToken(token: Token, index: number): void {
        if (this.insideClassOrInterfaceOrMapDepth > 0) return;

        const prevToken = this.tokens[index - 1];
        const isMethodImplementation = prevToken && prevToken.type === TokenType.Label && prevToken.value.includes(".");

        // 🧠 Always close the previous procedure/method before starting a new one
        const lastProc = this.procedureStack[this.procedureStack.length - 1];
        if (lastProc && lastProc.subType === (isMethodImplementation ? TokenType.Class : TokenType.Procedure)) {
            this.handleProcedureClosure(token.line - 1);
        }


        token.subType = isMethodImplementation ? TokenType.Class : TokenType.Procedure;
        token.value = prevToken?.value ?? "AnonymousProcedure";

        if (isMethodImplementation) {
            // ⛳ Skip assigning parent — we fix that in post-processing
        } else if (this.structureStack.length > 0) {
            const parent = this.structureStack[this.structureStack.length - 1];
            token.parent = parent;
            parent.children = parent.children || [];
            parent.children.push(token);
        }

        this.procedureStack.push(token);
    }





    private handleRoutineToken(token: Token, index: number): void {
        if (this.procedureStack.length === 0) return;

        this.handleRoutineClosure(token.line - 1);

        let parentProcedure = this.procedureStack[this.procedureStack.length - 1];
        token.parent = parentProcedure;
        parentProcedure.children = parentProcedure.children || [];
        parentProcedure.children.push(token);

        token.subType = TokenType.Routine;
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
