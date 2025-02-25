import { DocumentSymbol, FoldingRange, FoldingRangeKind, TextDocument } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer";
import logger from "./logger";  // ✅ Import logger

class ClarionFoldingProvider {
    private tokens: Token[];
    private foldingRanges: FoldingRange[];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.foldingRanges = [];
    }

    public computeFoldingRanges(): FoldingRange[] {

        this.foldingRanges = [];

        let structureStack: { type: string; startLine: number }[] = [];
        let openProcedure: { startLine: number } | null = null;
        let openRoutine: { startLine: number } | null = null;
        let insideClassOrInterfaceOrMap = false;
        let regionStack: { startLine: number; label?: string }[] = [];

        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const upperValue = token.value.toUpperCase();

            // ✅ Detect STRUCTURE start (push to stack)
            if (token.type === TokenType.Structure) {

                // ✅ Check if END or "." appears on the same line → If so, DO NOT push it to the stack
                const nextToken = this.tokens[i + 1];
                if (nextToken && nextToken.line === token.line && (nextToken.value === "END" || nextToken.value === ".")) {
                    continue; // ✅ Skip pushing this structure
                }

                structureStack.push({ type: upperValue, startLine: token.line });

                logger.debug(`🔍 [DEBUG] Structure START detected: '${upperValue}' at Line ${token.line}`);

                if (["CLASS", "INTERFACE", "MAP"].includes(upperValue)) {
                    insideClassOrInterfaceOrMap = true;
                }
            }

            // ✅ Detect END and close the last opened STRUCTURE
            if ((token.type === TokenType.Keyword && upperValue === "END") || token.value === ".") {
                if (structureStack.length > 0) {
                    const lastStructure = structureStack.pop();
                    if (lastStructure) {
                        this.foldingRanges.push({
                            startLine: lastStructure.startLine,
                            endLine: token.line,
                            kind: FoldingRangeKind.Region
                        });

                        logger.debug(`✅ [DEBUG] Structure END detected: '${lastStructure.type}' from Line ${lastStructure.startLine} to ${token.line}`);

                        if (["CLASS", "INTERFACE", "MAP"].includes(lastStructure.type)) {
                            insideClassOrInterfaceOrMap = false;
                        }
                    }
                }
            }

            // ✅ Detect `.` as an alternate structure terminator
            if (token.type === TokenType.Delimiter && token.value === ".") {
                if (structureStack.length > 0) {
                    const lastStructure = structureStack.pop();
                    if (lastStructure) {
                        this.foldingRanges.push({
                            startLine: lastStructure.startLine,
                            endLine: token.line,
                            kind: FoldingRangeKind.Region
                        });

                        logger.debug(`✅ [DEBUG] Structure END detected (with '.'): '${lastStructure.type}' from Line ${lastStructure.startLine} to ${token.line}`);
                    }
                }
            }
        }

        // ✅ Close any remaining open STRUCTURES at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            if (lastStructure) {
                this.foldingRanges.push({
                    startLine: lastStructure.startLine,
                    endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                    kind: FoldingRangeKind.Region
                });

                logger.debug(`⚠️ [DEBUG] Structure END (at EOF): '${lastStructure.type}' from Line ${lastStructure.startLine} to EOF`);
            }
        }

        return this.foldingRanges;
    }
}

export default ClarionFoldingProvider;
