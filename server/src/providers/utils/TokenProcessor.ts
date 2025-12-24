import { Token } from "../../ClarionTokenizer";
import LoggerManager from "../../logger";

const logger = LoggerManager.getLogger("TokenProcessor");
logger.setLevel("error"); // PERF: Only log errors to reduce overhead

export class TokenProcessor {
    /**
     * Find all tokens within a specific line range
     */
    static findTokensInRange(
        tokens: Token[],
        startLine: number,
        endLine: number
    ): Token[] {
        return tokens.filter(
            (t) => t.line >= startLine && t.line <= endLine
        );
    }

    /**
     * Find the first token of a specific type
     */
    static findFirstTokenOfType(
        tokens: Token[],
        type: number,
        startLine?: number
    ): Token | undefined {
        return tokens.find(
            (t) => t.type === type && (startLine === undefined || t.line >= startLine)
        );
    }

    /**
     * Find all tokens of a specific type
     */
    static findAllTokensOfType(
        tokens: Token[],
        type: number,
        startLine?: number,
        endLine?: number
    ): Token[] {
        return tokens.filter(
            (t) =>
                t.type === type &&
                (startLine === undefined || t.line >= startLine) &&
                (endLine === undefined || t.line <= endLine)
        );
    }

    /**
     * Extract class name from a method token
     * e.g., "StringTheory.Append" -> "StringTheory"
     */
    static extractClassNameFromMethod(methodName: string): string | null {
        const dotIndex = methodName.indexOf(".");
        if (dotIndex > 0) {
            return methodName.substring(0, dotIndex).toUpperCase();
        }
        return null;
    }

    /**
     * Extract method name from a qualified method token
     * e.g., "StringTheory.Append" -> "Append"
     */
    static extractMethodName(qualifiedName: string): string {
        const dotIndex = qualifiedName.indexOf(".");
        if (dotIndex > 0) {
            return qualifiedName.substring(dotIndex + 1);
        }
        return qualifiedName;
    }

    /**
     * Check if a token represents a class method implementation
     */
    static isClassMethodImplementation(token: Token): boolean {
        return token.value.includes(".");
    }

    /**
     * Get the line range for a symbol based on its token and finishesAt
     */
    static getSymbolRange(
        token: Token,
        finishesAt: number
    ): { startLine: number; endLine: number } {
        return {
            startLine: token.line,
            endLine: finishesAt > 0 ? finishesAt : token.line,
        };
    }

    /**
     * Find the end line of a structure (looks for matching END keyword)
     */
    static findStructureEnd(
        tokens: Token[],
        startLine: number,
        structureType: number
    ): number {
        let depth = 1;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.line <= startLine) continue;

            // If we find another structure of the same type, increase depth
            if (token.type === structureType) {
                depth++;
            }
            // If we find an END keyword, decrease depth
            else if (token.type === 6 /* TokenType.Keyword */ && token.value.toUpperCase() === "END") {
                depth--;
                if (depth === 0) {
                    return token.line;
                }
            }
        }
        return startLine; // Fallback
    }
}
