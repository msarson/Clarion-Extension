import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer.js";
import { TextDocument } from 'vscode-languageserver-textdocument';
import { OmitCompileDetector } from './utils/OmitCompileDetector';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("FoldingProvider");
logger.setLevel("error");
class ClarionFoldingProvider {
    private tokens: Token[];
    private foldingRanges: FoldingRange[];
    private inferenceUsedCount: number = 0;
    private readonly MAX_FOLDING_RANGES = 10000; // Safety limit
    private processedTokens: Set<Token> = new Set(); // Prevent circular references
    private document: TextDocument | undefined;

    constructor(tokens: Token[], document?: TextDocument) {
        this.tokens = tokens;
        this.foldingRanges = [];
        this.document = document;
    }

    public computeFoldingRanges(): FoldingRange[] {
        const perfStart = performance.now();
        this.foldingRanges = [];
        this.inferenceUsedCount = 0; // Reset counter for this computation
        this.processedTokens.clear(); // Reset processed tokens set
    
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
        // NOTE: finishesAt is the preferred boundary for folding (set by DocumentStructure).
        // Inference exists as a fallback to support incomplete/malformed code and editor-time states.
        for (let i = 0; i < foldableTokens.length; i++) {
            const token = foldableTokens[i];
    
            if (token.subType === TokenType.Procedure && token.finishesAt == null) {
                this.inferProcedureEnd(token, foldableTokens);
                this.inferenceUsedCount++;
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
    
        // ✅ Process COMPILE/OMIT directive blocks
        if (this.document) {
            this.foldCompileBlocks();
        }
    
        // Log aggregate inference fallback usage at debug level
        if (this.inferenceUsedCount > 0) {
            logger.debug(`FoldingProvider: finishesAt missing for ${this.inferenceUsedCount} structures; inference fallback used`);
        }
        
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
        // Prevent circular references and excessive ranges
        if (this.processedTokens.has(token)) {
            logger.warn(`⚠️ [FoldingProvider] Circular reference detected for token: ${token.value} at line ${token.line}`);
            return;
        }
        
        if (this.foldingRanges.length >= this.MAX_FOLDING_RANGES) {
            logger.warn(`⚠️ [FoldingProvider] Maximum folding ranges (${this.MAX_FOLDING_RANGES}) reached, stopping processing`);
            return;
        }
        
        this.processedTokens.add(token);
        
        if (!token.finishesAt || token.line >= token.finishesAt) {
            return; // Skip invalid or single-line elements
        }
        
        // Skip single-line control flow with continuation (e.g., IF x THEN | \n statement.)
        // These can span many physical lines but are logically single-line
        if (token.isSingleLineWithContinuation) {
            return; // Skip single-line with continuation
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
    
        // ✅ Recursively process children (with safety checks)
        if (token.children && token.children.length > 0) {
            if (token.children.length > 1000) {
                logger.warn(`⚠️ [FoldingProvider] Token '${token.value}' has ${token.children.length} children - skipping to prevent explosion`);
                return;
            }
            
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

    /** 🔹 Process COMPILE/OMIT directive blocks */
    private foldCompileBlocks(): void {
        if (!this.document) {
            return;
        }

        const blocks = OmitCompileDetector.findDirectiveBlocks(this.tokens, this.document);
        
        for (const block of blocks) {
            // Only create fold if block has an end line
            if (block.endLine !== null) {
                this.foldingRanges.push({
                    startLine: block.startLine,
                    endLine: block.endLine,
                    kind: FoldingRangeKind.Region
                });

                logger.info(`🔹 [FoldingProvider] ${block.type} block folded from Line ${block.startLine} to ${block.endLine}`);
            } else {
                // Block extends to EOF
                const lastLine = this.tokens[this.tokens.length - 1]?.line ?? block.startLine;
                this.foldingRanges.push({
                    startLine: block.startLine,
                    endLine: lastLine,
                    kind: FoldingRangeKind.Region
                });

                logger.warn(`⚠️ [FoldingProvider] Unterminated ${block.type} block folded from Line ${block.startLine} to EOF (Line ${lastLine})`);
            }
        }
    }
}

export default ClarionFoldingProvider;
