import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer.js";
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("FoldingProvider");
logger.setLevel("error");
class ClarionFoldingProvider {
    private tokens: Token[];
    private foldingRanges: FoldingRange[];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.foldingRanges = [];
    }

    public computeFoldingRanges(): FoldingRange[] {
        const perfStart = performance.now();
        this.foldingRanges = [];
    
        // 🚀 PERFORMANCE: Filter once and collect regions in same pass
        const foldableTokens: Token[] = [];
        const regionComments: Token[] = [];
        
        for (const t of this.tokens) {
            // Collect foldable tokens
            if (t.subType === TokenType.Procedure ||
                t.subType === TokenType.Structure ||
                t.subType === TokenType.Routine ||
                t.subType === TokenType.Class ||
                t.subType === TokenType.MapProcedure ||
                t.subType === TokenType.InterfaceMethod ||
                t.subType === TokenType.MethodDeclaration ||
                t.subType === TokenType.MethodImplementation ||
                t.subType === TokenType.GlobalProcedure) {
                foldableTokens.push(t);
            }
            
            // Collect region comments
            if (t.type === TokenType.Comment) {
                const upperValue = t.value.toUpperCase().trim();
                if (upperValue.startsWith("!REGION") || upperValue.startsWith("!ENDREGION")) {
                    regionComments.push(t);
                }
            }
        }
        
        const filterTime = performance.now() - perfStart;
        logger.perf('Folding: filter', { time_ms: filterTime.toFixed(2), foldable: foldableTokens.length, regions: regionComments.length });
        
    
        // 🔍 Infer missing finishesAt for PROCEDUREs
        for (let i = 0; i < foldableTokens.length; i++) {
            const token = foldableTokens[i];
    
            if (token.subType === TokenType.Procedure && token.finishesAt == null) {
                this.inferProcedureEnd(token, foldableTokens);
            }
        }

        for (const t of foldableTokens) {
            const subTypeName = t.subType !== undefined ? TokenType[t.subType] : TokenType[t.type];
            logger.info(`[DEBUG] Foldable: ${t.value} (${subTypeName}) Line ${t.line}–${t.finishesAt}`);

        }
        
    
        // 🧩 Process folds for all structures/procedures/routines
        for (const token of foldableTokens) {
            this.processFolding(token);
        }
    
        // ✅ Process REGIONS using pre-filtered comments
        this.foldRegionsOptimized(regionComments);
    
        logger.info(`📏 [FOLDING] Returning ${this.foldingRanges.length} ranges`);
        return this.foldingRanges;
    }
    
    private inferProcedureEnd(token: Token, procedures: Token[]): void {
        const index = procedures.indexOf(token);
    
        for (let j = index + 1; j < procedures.length; j++) {
            const next = procedures[j];
            if (next.subType === TokenType.Procedure && next.line > token.line) {
                token.finishesAt = next.line - 1;
                return;
            }
        }
    
        // 📌 Fallback to EOF if no next procedure found
        const lastLine = this.tokens[this.tokens.length - 1]?.line ?? token.line;
        token.finishesAt = lastLine;
    
        logger.info(`📌 [FoldingProvider] Inferred finishesAt for '${token.value}' as Line ${token.finishesAt}`);
    }
    

    private processFolding(token: Token): void {
        if (!token.finishesAt || token.line >= token.finishesAt) {
            return; // Skip invalid or single-line elements
        }
    
        // Only fold these subtypes:
        const foldableSubTypes = [
            TokenType.Procedure,
            TokenType.GlobalProcedure,
            TokenType.MethodImplementation,
            TokenType.Routine,
            TokenType.Class,
            TokenType.Structure
        ];
    
        if (token.subType === undefined || !foldableSubTypes.includes(token.subType)) {
            return;
        }
    
        let startLine = token.line;
    
        this.foldingRanges.push({
            startLine,
            endLine: token.finishesAt,
            kind: FoldingRangeKind.Region
        });
    
        logger.info(`✅ [FoldingProvider] Folded '${token.value}' (${TokenType[token.subType]}) from Line ${token.line} to ${token.finishesAt}`);
    
        // ✅ Fold CODE block if applicable
        if (
            (token.subType === TokenType.Procedure ||
             token.subType === TokenType.GlobalProcedure ||
             token.subType === TokenType.MethodImplementation ||
             token.subType === TokenType.Routine) &&
            token.executionMarker
        ) {
            startLine = token.executionMarker.line;
    
            this.foldingRanges.push({
                startLine,
                endLine: token.finishesAt,
                kind: FoldingRangeKind.Region
            });
    
            logger.info(`✅ [FoldingProvider] Execution fold for '${token.value}' from Line ${startLine} to ${token.finishesAt}`);
        }
    
        // ✅ Extra fold if routine has local DATA
        if (token.subType === TokenType.Routine && token.hasLocalData) {
            startLine = token.executionMarker ? token.executionMarker.line : token.line;
    
            this.foldingRanges.push({
                startLine,
                endLine: token.finishesAt,
                kind: FoldingRangeKind.Region
            });
    
            logger.info(`✅ [FoldingProvider] ROUTINE '${token.value}' with local DATA folded from Line ${startLine} to ${token.finishesAt}`);
        }
    
        // ✅ Extra fold if routine has inferred CODE (even without DATA)
        if (token.subType === TokenType.Routine && token.inferredCode) {
            this.foldingRanges.push({
                startLine: token.line,
                endLine: token.finishesAt,
                kind: FoldingRangeKind.Region
            });
    
            logger.info(`✅ [FoldingProvider] ROUTINE '${token.value}' with inferred CODE folded from Line ${token.line} to ${token.finishesAt}`);
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
    
    /** 🔹 Process REGIONS using pre-filtered comment tokens (optimized) */
    private foldRegionsOptimized(regionComments: Token[]): void {
        let regionStack: { startLine: number; label?: string }[] = [];

        for (const token of regionComments) {
            const upperValue = token.value.toUpperCase().trim();

            // ✅ Detect `!REGION` start
            if (upperValue.startsWith("!REGION")) {
                const labelMatch = token.value.match(/!REGION\s+"?(.*?)"?$/i);
                const label = labelMatch ? labelMatch[1] : undefined;
                regionStack.push({ startLine: token.line, label });

                logger.info(`🔹 [FoldingProvider] Region START detected at Line ${token.line} (${label ?? "No Label"})`);
            }

            // ✅ Detect `!ENDREGION` and close last opened REGION
            if (upperValue.startsWith("!ENDREGION")) {
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

            logger.warn(`⚠️ [FoldingProvider] Auto-closed Region at EOF from Line ${lastRegion?.startLine}`);
        }
    }
}

export default ClarionFoldingProvider;
