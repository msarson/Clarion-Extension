import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";

const logger = LoggerManager.getLogger("DocumentAST");
logger.setLevel("error");

export class ASTNode {
    constructor(
        public type: string,
        public name: string,
        public start: number,
        public end: number = -1,
        public children: ASTNode[] = [],
        public parent: ASTNode | null = null
    ) {}
}

export class DocumentAST {
    private root: ASTNode;
    private currentParent: ASTNode;
    private nodeStack: ASTNode[] = [];

    constructor(private tokens: Token[]) {
        this.root = new ASTNode("Root", "Document", 0);
        this.currentParent = this.root;
        this.buildAST();
        this.finalizeEndPositions();
    }

    private buildAST(): void {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];

            if (token.type === TokenType.Structure) {
                this.handleStructure(token);
            } else if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROCEDURE") {
                this.handleProcedure(token, i);
            } else if (token.type === TokenType.Keyword && token.value.toUpperCase() === "ROUTINE") {
                this.handleRoutine(token, i);
            } else if (token.type === TokenType.ClassLabel) {
                this.handleClassMethod(token, i);
            } else if (token.type === TokenType.EndStatement) {
                this.handleEndStatement(token);
            }
        }
    }

    private handleStructure(token: Token): void {
        const structureNode = new ASTNode(token.value, token.value, token.line, -1, [], this.currentParent);
        this.currentParent.children.push(structureNode);
        this.nodeStack.push(structureNode);
        this.currentParent = structureNode;
    }

    private handleProcedure(token: Token, index: number): void {
        let prevToken = this.tokens[index - 1];
    
        // If the previous token is a label, use it as the procedure name
        let procedureName = prevToken && prevToken.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
    
        // Check if we are inside a class (i.e., this is a method)
        let classParent = this.findNearestClassParent();
        if (classParent && classParent.type === "CLASS") {
            logger.info(`🔍 Identified '${procedureName}' as a method inside class '${classParent.name}'.`);
    
            let existingMethod = classParent.children.find(child => child.name === procedureName && child.type === "Method");
            if (existingMethod) {
                existingMethod.start = token.line;
                existingMethod.end = this.findEndOfBlock(index);
                this.currentParent = existingMethod;
                this.nodeStack.push(existingMethod);
                return;
            }
    
            // Otherwise, create a new method node
            const methodNode = new ASTNode("Method", procedureName, token.line, this.findEndOfBlock(index), [], classParent);
            classParent.children.push(methodNode);
            this.nodeStack.push(methodNode);
            this.currentParent = methodNode;
            return;
        }
    
        // Standalone procedure
        logger.info(`🔍 Identified '${procedureName}' as a standalone procedure.`);
    
        const procedureNode = new ASTNode("Procedure", procedureName, token.line, this.findEndOfBlock(index), [], this.root);
        this.root.children.push(procedureNode);
        this.nodeStack.push(procedureNode);
        this.currentParent = procedureNode;
    }
    
    
    

    private handleRoutine(token: Token, index: number): void {
        let prevToken = this.tokens[index - 1];
        let routineName = prevToken && prevToken.type === TokenType.Label ? prevToken.value : "UnnamedRoutine";

        let procedureParent = this.findNearestProcedureParent();
        if (procedureParent.type !== "Procedure") {
            logger.warn(`⚠️ Routine '${routineName}' at line ${token.line} is outside of a procedure!`);
            return;
        }

        const routineNode = new ASTNode("Routine", routineName, token.line, this.findEndOfBlock(index), [], procedureParent);
        procedureParent.children.push(routineNode);
        this.nodeStack.push(routineNode);
        this.currentParent = routineNode;
    }

    private handleClassMethod(token: Token, index: number): void {
        let prevToken = this.tokens[index - 1];
        let methodName = prevToken && prevToken.type === TokenType.Label ? prevToken.value : token.value;
    
        // Ensure the method follows `ClassName.MethodName` format
        if (!methodName.includes(".")) {
            logger.warn(`⚠️ Ignoring non-method token '${methodName}' at line ${token.line}`);
            return;
        }
    
        // Ensure it's followed by `PROCEDURE`
        let nextToken = this.tokens[index + 1];
        if (!nextToken || nextToken.type !== TokenType.Keyword || nextToken.value.toUpperCase() !== "PROCEDURE") {
            logger.warn(`⚠️ Ignoring '${methodName}' at line ${token.line} - Not a valid PROCEDURE`);
            return;
        }
    
        // Find the nearest class parent
        let classParent = this.findNearestClassParent();
        if (classParent.type !== "CLASS") {
            logger.warn(`⚠️ Method '${methodName}' detected outside of a class!`);
        }
    
        // Ensure we're not treating standalone procedures as methods
        if (this.currentParent.type === "Procedure") {
            logger.warn(`⚠️ '${methodName}' is incorrectly detected as a method inside a procedure. Adjusting.`);
            return;
        }
    
        const methodNode = new ASTNode("Method", methodName, token.line, this.findEndOfBlock(index), [], classParent);
        classParent.children.push(methodNode);
        this.nodeStack.push(methodNode);
        this.currentParent = methodNode;
    }
    

    private handleEndStatement(token: Token): void {
        if (this.nodeStack.length > 0) {
            let lastNode = this.nodeStack.pop();
    
            if (lastNode) {
                lastNode.end = token.line; // Set the correct end line
    
                // Ensure we return to the correct parent
                this.currentParent = lastNode.parent || this.root;
            }
        }
    }
    

    private findNearestProcedureParent(): ASTNode {
        let parent = this.currentParent;
        while (parent && parent.type !== "Procedure") {
            parent = parent.parent!;
        }
        return parent || this.root;
    }

    private findNearestClassParent(): ASTNode {
        let parent = this.currentParent;
        while (parent && parent.type !== "CLASS") {
            parent = parent.parent!;
        }
        return parent || this.root;
    }

    /**
     * Finds the end line for a given token by looking for the next procedure, routine, or structure.
     */
    private findEndOfBlock(startIndex: number): number {
        let depth = 0;
    
        for (let i = startIndex + 1; i < this.tokens.length; i++) {
            let token = this.tokens[i];
    
            // Ignore line continuations—they do not contribute to block depth
            if (token.type === TokenType.LineContinuation) {
                continue;
            }
    
            // Increase depth for block structures
            if (token.type === TokenType.Structure && ["IF", "CASE", "LOOP"].includes(token.value.toUpperCase())) {
                depth++;
            }
    
            // Decrease depth when encountering an `END`
            if (token.type === TokenType.EndStatement) {
                depth--;
                if (depth === 0) return token.line;  // Block fully closed
            }
    
            // If we hit a new `PROCEDURE` or `ROUTINE`, the previous block ended
            if (token.type === TokenType.Keyword && ["PROCEDURE", "ROUTINE"].includes(token.value.toUpperCase())) {
                return this.tokens[i - 1]?.line ?? token.line;
            }
        }
    
        // Default to last token if no clear end
        return this.tokens[this.tokens.length - 1]?.line ?? -1;
    }
    
    
    
    /**
     * Ensures all unclosed nodes are given an appropriate `end` value.
     */
    private finalizeEndPositions(): void {
        for (let node of this.nodeStack) {
            if (node.end === -1) {
                node.end = this.tokens[this.tokens.length - 1]?.line ?? -1;
            }
        }
    }

    public getAST(): ASTNode {
        return this.root;
    }
}
