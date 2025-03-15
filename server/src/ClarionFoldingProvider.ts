import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer.js";
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("FoldingProvider");

class ClarionFoldingProvider {
    private tokens: Token[];
    private foldingRanges: FoldingRange[];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.foldingRanges = [];
    }

    public computeFoldingRanges(): FoldingRange[] {
        this.foldingRanges = [];

        // ✅ Process only top-level structures, procedures, and routines
        const topLevelTokens = this.tokens.filter(t => !t.parent);
        for (const token of topLevelTokens) {
            this.processFolding(token);
        }

        // ✅ Process REGIONS separately
        this.foldRegions();

        return this.foldingRanges;
    }

    /** 🔹 Recursively process structures, procedures, and routines */
    private processFolding(token: Token): void {
        if (!token.finishesAt || token.line >= token.finishesAt) {
            return; // Skip invalid or single-line elements
        }

        let startLine = token.line;

        // ✅ Fold entire PROCEDURE block
        if (token.subType === TokenType.Procedure) {
            this.foldingRanges.push({
                startLine: token.line,
                endLine: token.finishesAt,
                kind: FoldingRangeKind.Region
            });

            logger.info(`✅ [FoldingProvider] Folded entire PROCEDURE '${token.value}' from Line ${token.line} to ${token.finishesAt}`);

            // ✅ Also fold from the `CODE` statement if present
            if (token.executionMarker) {
                startLine = token.executionMarker.line;
                this.foldingRanges.push({
                    startLine,
                    endLine: token.finishesAt,
                    kind: FoldingRangeKind.Region
                });
                logger.info(`✅ [FoldingProvider] PROCEDURE '${token.value}' execution folded from Line ${startLine} to ${token.finishesAt}`);
            }
        }

        // ✅ Fold entire ROUTINE block
        else if (token.subType === TokenType.Routine) {
            this.foldingRanges.push({
                startLine: token.line,
                endLine: token.finishesAt,
                kind: FoldingRangeKind.Region
            });

            logger.info(`✅ [FoldingProvider] Folded entire ROUTINE '${token.value}' from Line ${token.line} to ${token.finishesAt}`);

            // ✅ If the routine has local DATA, fold from DATA or CODE
            if (token.hasLocalData) {
                startLine = token.executionMarker ? token.executionMarker.line : token.line;
                this.foldingRanges.push({
                    startLine,
                    endLine: token.finishesAt,
                    kind: FoldingRangeKind.Region
                });
                logger.info(`✅ [FoldingProvider] ROUTINE '${token.value}' execution folded from Line ${startLine} to ${token.finishesAt}`);
            } 
            // ✅ If inferred CODE, start from the declaration
            else if (token.inferredCode) {
                this.foldingRanges.push({
                    startLine: token.line,
                    endLine: token.finishesAt,
                    kind: FoldingRangeKind.Region
                });
                logger.info(`✅ [FoldingProvider] ROUTINE '${token.value}' with inferred CODE folded from Line ${token.line} to ${token.finishesAt}`);
            }
        }

        // ✅ Handle STRUCTURES (CLASS, MAP, INTERFACE, etc.)
        else if (token.subType === TokenType.Structure) {
            this.foldingRanges.push({
                startLine,
                endLine: token.finishesAt,
                kind: FoldingRangeKind.Region
            });

            logger.info(`✅ [FoldingProvider] Folded STRUCTURE '${token.value}' from Line ${token.line} to ${token.finishesAt}`);
        }

        // ✅ Recursively process children
        if (token.children && token.children.length > 0) {
            for (const child of token.children) {
                this.processFolding(child);
            }
        }
    }

    /** 🔹 Process REGIONS separately */
    private foldRegions(): void {
        let regionStack: { startLine: number; label?: string }[] = [];

        for (const token of this.tokens) {
            const upperValue = token.value.toUpperCase();

            // ✅ Detect `!REGION` start
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!REGION")) {
                const labelMatch = token.value.match(/!REGION\s+"?(.*?)"?$/i);
                const label = labelMatch ? labelMatch[1] : undefined;
                regionStack.push({ startLine: token.line, label });

                logger.info(`🔹 [FoldingProvider] Region START detected at Line ${token.line} (${label ?? "No Label"})`);
            }

            // ✅ Detect `!ENDREGION` and close last opened REGION
            if (token.type === TokenType.Comment && upperValue.trim().startsWith("!ENDREGION")) {
                const lastRegion = regionStack.pop();
                if (lastRegion) {
                    this.foldingRanges.push({
                        startLine: lastRegion.startLine,
                        endLine: token.line,
                        kind: FoldingRangeKind.Region
                    });

                    logger.info(`🔹 [FoldingProvider] Region END detected from Line ${lastRegion.startLine} to ${token.line}`);
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

            logger.warn(`⚠️ [FoldingProvider] Region END (at EOF) from Line ${lastRegion?.startLine ?? 0} to EOF`);
        }
    }
}

export default ClarionFoldingProvider;
