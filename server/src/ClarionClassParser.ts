
import { StructureNode } from "./clarionStructureExtractor.js";
import { TokenType } from "./ClarionTokenizer.js";
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionClassParser");



/**
 * Parses a Clarion CLASS structure to extract:
 * - Class name
 * - Procedures (methods)
 * - Variables (properties)
 */
class ClarionClassParser {
    private classNode: StructureNode;

    constructor(classNode: StructureNode) {
        this.classNode = classNode;
    }

    /**
     * Extracts the class name.
     */
    public getClassName(): string {
        return this.classNode.name;
    }

    /**
     * Extracts procedures (methods) inside the class.
     */
    public getProcedures(): { name: string; signature: string; start: number }[] {
        const procedures: { name: string; signature: string; start: number }[] = [];

        for (let i = 0; i < this.classNode.tokens.length; i++) {
            const token = this.classNode.tokens[i];

            if (token.type === TokenType.Label) {
                let nextToken = this.classNode.tokens[i + 1];

                if (nextToken && (nextToken.value.toUpperCase() === "PROCEDURE")) {
                    let procedureName = token.value;
                    let signature = "";

                    // ✅ Capture procedure parameters (if any)
                    let j = i + 2;
                    while (j < this.classNode.tokens.length) {
                        let paramToken = this.classNode.tokens[j];

                        if (paramToken.type === TokenType.Comment) {
                            j++;
                            continue;
                        }

                        if (paramToken.type === TokenType.Keyword || paramToken.type === TokenType.Label) {
                            break; // Stop at next declaration
                        }

                        signature += paramToken.value + " ";
                        j++;
                    }

                    procedures.push({
                        name: procedureName,
                        signature: signature.trim(),
                        start: token.line
                    });

                    logger.info(`📌 [METHOD] ${procedureName}(${signature.trim()}) at line ${token.line}`);
                }
            }
        }

        return procedures;
    }

    /**
     * Extracts variables inside the class.
     */
    public getVariables(): { name: string; type: string; start: number }[] {
        const variables: { name: string; type: string; start: number }[] = [];

        for (let i = 0; i < this.classNode.tokens.length; i++) {
            const token = this.classNode.tokens[i];

            if (token.type === TokenType.Variable) {
                let nextToken = this.classNode.tokens[i + 1];

                if (nextToken && nextToken.type === TokenType.Type) {
                    let variableName = token.value;
                    let variableType = nextToken.value;

                    // ✅ Capture additional type information
                    let extraTokens: string[] = [];
                    let j = i + 2;

                    while (j < this.classNode.tokens.length) {
                        let typeDetailToken = this.classNode.tokens[j];

                        if (typeDetailToken.type === TokenType.Comment) {
                            j++;
                            continue;
                        }

                        if (typeDetailToken.type === TokenType.Keyword || typeDetailToken.type === TokenType.Variable) {
                            break; // Stop at next declaration
                        }

                        extraTokens.push(typeDetailToken.value);
                        j++;
                    }

                    if (extraTokens.length > 0) {
                        variableType += " " + extraTokens.join("");
                    }

                    variables.push({
                        name: variableName,
                        type: variableType.trim(),
                        start: token.line
                    });

                    logger.info(`📌 [VARIABLE] ${variableName} - ${variableType.trim()} (Line: ${token.line})`);
                }
            }
        }

        return variables;
    }
}

export default ClarionClassParser;
