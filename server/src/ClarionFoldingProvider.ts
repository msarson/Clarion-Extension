import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer.js";
import logger from "./logger.js";





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
        const structureTokens = this.tokens.filter(t => t.isStructure);
        for (const token of structureTokens) {
            

            logger.info(`🔹 [FoldinfProvider] Found STRUCTURE '${token.value}' at Line ${token.line}`);
            if (token.structureFinishesAt !== undefined && token.line < token.structureFinishesAt) {
                this.foldingRanges.push({
                    startLine: token.line,
                    endLine: token.structureFinishesAt,
                    kind: FoldingRangeKind.Region
                });
    
                logger.info(`✅ [FoldinfProvider] Folded STRUCTURE '${token.value}' from Line ${token.line} to ${token.structureFinishesAt}`);
            } else {
                logger.info(`🚫 [FoldinfProvider] Skipping STRUCTURE '${token.value}' at Line ${token.line} (No valid folding range or same line)`);
            }
        }
    }
    

    /** 🔹 Second pass: Process PROCEDURE, ROUTINE, and REGIONS */
    private foldProceduresAndRegions(): void {
        // ✅ Fold PROCEDURES
        const procedureTokens = this.tokens.filter(t => t.procedureFinishesAt !== undefined);
    
        for (const token of procedureTokens) {
            this.foldingRanges.push({
                startLine: token.line,
                endLine: token.procedureFinishesAt!,
                kind: FoldingRangeKind.Region
            });
    
            logger.info(`✅ [FoldinfProvider] Folded PROCEDURE '${token.value}' from Line ${token.line} to ${token.procedureFinishesAt}`);
        }
    
        // ✅ Fold ROUTINES
        const routineTokens = this.tokens.filter(t => t.routineFinishesAt !== undefined);
    
        for (const token of routineTokens) {
            this.foldingRanges.push({
                startLine: token.line,
                endLine: token.routineFinishesAt!,
                kind: FoldingRangeKind.Region
            });
    
            logger.info(`✅ [FoldinfProvider] Folded ROUTINE '${token.value}' from Line ${token.line} to ${token.routineFinishesAt}`);
        }
    
        // ✅ Fold REGIONS (unchanged)
        let regionStack: { startLine: number; label?: string }[] = [];
    
        for (const token of this.tokens) {
            const upperValue = token.value.toUpperCase();
    
            // ✅ Detect `!region` start
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!REGION")) {
                const labelMatch = token.value.match(/!REGION\s+"?(.*?)"?$/i);
                const label = labelMatch ? labelMatch[1] : undefined;
                regionStack.push({ startLine: token.line, label });
    
                logger.info(`🔹 [FoldinfProvider] Region START detected at Line ${token.line} (${label ?? "No Label"})`);
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
    
                    logger.info(`🔹 [FoldinfProvider] Region END detected from Line ${lastRegion.startLine} to ${token.line}`);
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
    
            logger.warn(`⚠️ [FoldinfProvider] Region END (at EOF) from Line ${lastRegion?.startLine ?? 0} to EOF`);
        }
    }
    
}

export default ClarionFoldingProvider;
