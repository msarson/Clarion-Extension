import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
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

        // ✅ Step 1: Fold STRUCTURES first
        this.foldStructures();

        // ✅ Step 2: Process PROCEDURE, ROUTINE, and REGIONS after structures
        this.foldProceduresAndRegions();

        return this.foldingRanges;
    }

    /** 🔹 First pass: Process structures for folding */
    private foldStructures(): void {
        // ✅ Step 1: Filter only structure tokens
        const structureTokens = this.tokens.filter(t => t.isStructure);
    
        for (const token of structureTokens) {
            if (token.structureFinishesAt !== undefined) {
                this.foldingRanges.push({
                    startLine: token.line,
                    endLine: token.structureFinishesAt,
                    kind: FoldingRangeKind.Region
                });
    
                logger.debug(`✅ [DEBUG] Folded STRUCTURE '${token.value}' from Line ${token.line} to ${token.structureFinishesAt}`);
            }
        }
    }
    

    /** 🔹 Second pass: Process PROCEDURE, ROUTINE, and REGIONS */
    private foldProceduresAndRegions(): void {
        let openProcedure: { startLine: number } | null = null;
        let openRoutine: { startLine: number } | null = null;
        let insideClassOrInterfaceOrMap = false;
        let regionStack: { startLine: number; label?: string }[] = [];

        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const upperValue = token.value.toUpperCase();

            // ✅ Ignore if token was already processed as part of a structure
            if (token.isStructure) continue;

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
    }
}

export default ClarionFoldingProvider;
