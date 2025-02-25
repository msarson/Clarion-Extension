import { DocumentSymbol, FoldingRange, FoldingRangeKind, TextDocument } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer";

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
            // ✅ Detect STRUCTURE start (push to stack)
            if (token.type === TokenType.Structure) {

                // ✅ Check if END or "." appears on the same line → If so, DO NOT push it to the stack
                const nextToken = this.tokens[i + 1];
                if (nextToken && nextToken.line === token.line && (nextToken.value === "END" || nextToken.value === ".")) {
                    continue; // ✅ Skip pushing this structure
                }

                structureStack.push({ type: upperValue, startLine: token.line });

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
                    }
                }
            }

            // ✅ Detect `!region` start
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!REGION")) {

                const labelMatch = token.value.match(/!REGION\s+"?(.*?)"?$/i);
                const label = labelMatch ? labelMatch[1] : undefined;
                regionStack.push({ startLine: token.line, label });
            }

            // ✅ Detect `!endregion` and close last opened REGION
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!ENDREGION")) {
                const lastRegion = regionStack.pop();
                if (lastRegion) {
                    this.foldingRanges.push({
                        startLine: lastRegion.startLine,
                        endLine: token.line,
                        kind: FoldingRangeKind.Region
                    });
                }
            }

            // ✅ Detect `!region` start
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!REGION")) {

                const labelMatch = token.value.match(/!REGION\s+"?(.*?)"?$/i);
                const label = labelMatch ? labelMatch[1] : undefined;
                regionStack.push({ startLine: token.line, label });
            }

            // ✅ Detect `!endregion` and close last opened REGION
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!ENDREGION")) {
                const lastRegion = regionStack.pop();
                if (lastRegion) {
                    this.foldingRanges.push({
                        startLine: lastRegion.startLine,
                        endLine: token.line,
                        kind: FoldingRangeKind.Region
                    });
                }
            }

            // ✅ Detect PROCEDURE start
            if (token.type === TokenType.Keyword && upperValue === "PROCEDURE") {
                if (insideClassOrInterfaceOrMap) continue;

                if (openProcedure) {
                    this.foldingRanges.push({
                        startLine: openProcedure.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openProcedure = null;
                }

                if (openRoutine) {
                    this.foldingRanges.push({
                        startLine: openRoutine.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openRoutine = null;
                }

                openProcedure = { startLine: token.line };
            }

            // ✅ Detect ROUTINE start
            if (token.type === TokenType.Keyword && upperValue === "ROUTINE") {
                if (openProcedure) {
                    this.foldingRanges.push({
                        startLine: openProcedure.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openProcedure = null;
                }

                if (openRoutine) {
                    this.foldingRanges.push({
                        startLine: openRoutine.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                }

                openRoutine = { startLine: token.line };
            }
        }

        // ✅ Close any remaining open REGIONS at EOF
        while (regionStack.length > 0) {
            const lastRegion = regionStack.pop();
            this.foldingRanges.push({
                startLine: lastRegion?.startLine ?? 0,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }

        // ✅ Close any remaining open STRUCTURES at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            this.foldingRanges.push({
                startLine: lastStructure?.startLine ?? 0,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }

        while (regionStack.length > 0) {
            const lastRegion = regionStack.pop();
            this.foldingRanges.push({
                startLine: lastRegion?.startLine ?? 0,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }

        // ✅ Close any remaining open PROCEDURE or ROUTINE at EOF
        if (openProcedure) {
            this.foldingRanges.push({
                startLine: openProcedure.startLine,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }
        if (openRoutine) {
            this.foldingRanges.push({
                startLine: openRoutine.startLine,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }

        return this.foldingRanges;
    }
   
    
}

export default ClarionFoldingProvider;
