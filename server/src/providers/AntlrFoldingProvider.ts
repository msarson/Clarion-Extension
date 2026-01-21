import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CharStream, CommonTokenStream, ParserRuleContext, PredictionMode } from 'antlr4ng';
import { ClarionLexer } from '../generated/ClarionLexer';
import { ClarionParser, ProcedureImplementationContext, MapSectionContext, 
         CodeSectionContext, IfStatementContext, LoopStatementContext, 
         CaseStatementContext, ExecuteStatementContext, WindowDeclarationContext, GroupDeclarationContext,
         QueueDeclarationContext, FileDeclarationContext, ClassDeclarationContext,
         RoutineDeclarationContext, RecordDeclarationContext, ViewDeclarationContext,
         ApplicationDeclarationContext, ModuleReferenceContext,
         DoStatementContext, WindowControlsContext, TabControlContext, SheetControlContext,
         GroupControlContext, OptionControlContext, OleControlContext,
         MenubarDeclarationContext, MenuDeclarationContext, MenuItemDeclarationContext,
         ElsifClauseContext, ElseClauseContext } from '../generated/ClarionParser';
import LoggerManager from '../logger';
import { ClarionPreprocessor } from '../utils/ClarionPreprocessor';

const logger = LoggerManager.getLogger("AntlrFoldingProvider");
logger.setLevel("debug");

// Cache parse trees per document to avoid re-parsing
interface ParseTreeCache {
    version: number;
    tree: ParserRuleContext;
    timestamp: number;
}

const parseTreeCache = new Map<string, ParseTreeCache>();
const CACHE_MAX_AGE = 5000; // 5 seconds

/**
 * ANTLR-based folding provider
 * Uses the ANTLR parser to provide accurate folding ranges based on grammar structure
 */
export class AntlrFoldingProvider {
    private document: TextDocument;

    constructor(document: TextDocument) {
        this.document = document;
    }

    /**
     * Compute folding ranges using ANTLR parser
     */
    public async computeFoldingRanges(): Promise<FoldingRange[]> {
        const perfStart = performance.now();
        
        try {
            const text = this.document.getText();
            const uri = this.document.uri;
            const version = this.document.version;
            
            // TEMP: Always reparse during debugging
            parseTreeCache.delete(uri);
            
            // Check cache first
            const cached = parseTreeCache.get(uri);
            const now = Date.now();
            
            let tree: ParserRuleContext;
            
            if (cached && cached.version === version && (now - cached.timestamp) < CACHE_MAX_AGE) {
                // Use cached parse tree
                tree = cached.tree;
                logger.info(`✅ Using cached parse tree for ${uri.substring(uri.lastIndexOf('/') + 1)}`);
            } else {
                // Parse and cache
                const text = this.document.getText();
                
                // PREPROCESSING: Handle COMPILE/OMIT blocks before parsing
                // These blocks have dynamic terminators that can't be parsed by CFG
                const preprocessResult = ClarionPreprocessor.preprocess(text);
                const textToParse = preprocessResult.transformedText;
                
                if (preprocessResult.blocksProcessed > 0) {
                    logger.debug(`🔄 Preprocessed ${preprocessResult.blocksProcessed} COMPILE/OMIT blocks (${preprocessResult.linesRemoved} lines replaced)`);
                }
                
                const inputStream = CharStream.fromString(textToParse);
                const lexer = new ClarionLexer(inputStream);
                const tokenStream = new CommonTokenStream(lexer);
                const parser = new ClarionParser(tokenStream);
                
                // Two-stage parsing: Try fast SLL mode first, fall back to LL if needed
                // TEMPORARILY DISABLED: SLL mode has issues with some constructs (ambiguous labels)
                const useSLL = false;  // TODO: Re-enable when grammar ambiguities are resolved
                
                try {
                    if (useSLL) {
                        // SLL + LL two-stage parsing
                        const sllErrors: Array<{line: number, col: number, msg: string}> = [];
                        
                        parser.removeErrorListeners();
                        parser.addErrorListener({
                            syntaxError: (recognizer, offendingSymbol, line, charPositionInLine, msg) => {
                                sllErrors.push({line, col: charPositionInLine, msg});
                            },
                            reportAmbiguity: () => {},
                            reportAttemptingFullContext: () => {},
                            reportContextSensitivity: () => {}
                        });
                        
                        parser.interpreter.predictionMode = PredictionMode.SLL;
                        
                        // Try SLL mode first (faster)
                        tree = parser.compilationUnit();
                        
                        // If SLL had errors, retry with LL for better error recovery
                        if (sllErrors.length > 0) {
                            logger.debug(`⚠️ SLL mode had ${sllErrors.length} error(s), retrying with LL mode for better recovery`);
                            sllErrors.slice(0, 3).forEach(err => {
                                logger.debug(`   • Line ${err.line}:${err.col} - ${err.msg}`);
                            });
                            if (sllErrors.length > 3) {
                                logger.debug(`   • ... and ${sllErrors.length - 3} more errors`);
                            }
                            tokenStream.seek(0);
                            parser.reset();
                            
                            // Track LL errors too for debugging
                            const llErrors: Array<{line: number, col: number, msg: string}> = [];
                            parser.removeErrorListeners();
                            parser.addErrorListener({
                                syntaxError: (recognizer, offendingSymbol, line, charPositionInLine, msg) => {
                                    llErrors.push({line, col: charPositionInLine, msg});
                                },
                                reportAmbiguity: () => {},
                                reportAttemptingFullContext: () => {},
                                reportContextSensitivity: () => {}
                            });
                            
                            parser.interpreter.predictionMode = PredictionMode.LL;
                            tree = parser.compilationUnit();
                            
                            if (llErrors.length > 0) {
                                logger.debug(`⚠️ LL mode also had ${llErrors.length} error(s):`);
                                llErrors.slice(0, 3).forEach(err => {
                                    logger.debug(`   • Line ${err.line}:${err.col} - ${err.msg}`);
                                });
                            } else {
                                logger.debug(`✅ LL mode succeeded without errors`);
                            }
                        } else {
                            logger.debug(`✨ SLL mode succeeded without errors`);
                        }
                    } else {
                        // Use LL mode directly (SLL disabled)
                        parser.removeErrorListeners();  // Remove default error listeners
                        parser.interpreter.predictionMode = PredictionMode.LL;
                        tree = parser.compilationUnit();
                        logger.debug(`📊 Using LL mode (SLL temporarily disabled)`);
                    }
                } catch (e) {
                    // Fallback to LL mode on exception
                    logger.debug(`⚠️ Parser exception, using LL mode`);
                    tokenStream.seek(0);
                    parser.reset();
                    parser.removeErrorListeners();
                    parser.interpreter.predictionMode = PredictionMode.LL;
                    tree = parser.compilationUnit();
                }
                
                // Ensure tree was created
                if (!tree) {
                    throw new Error("Failed to create parse tree");
                }
                
                // Store in cache
                parseTreeCache.set(uri, {
                    version,
                    tree,
                    timestamp: now
                });
                
                logger.info(`📦 Cached parse tree for ${uri.substring(uri.lastIndexOf('/') + 1)}`);
            }
            
            // Collect folding ranges from parse tree
            const ranges: FoldingRange[] = [];
            this.collectFoldingRanges(tree, ranges);
            
            const perfEnd = performance.now();
            
            // Log last fold range for debugging
            if (ranges.length > 0) {
                const lastRange = ranges[ranges.length - 1];
                logger.info(`ANTLR Folding: Computed ${ranges.length} ranges in ${(perfEnd - perfStart).toFixed(2)}ms (last fold: lines ${lastRange.startLine + 1}-${lastRange.endLine + 1})`);
            } else {
                logger.info(`ANTLR Folding: Computed ${ranges.length} ranges in ${(perfEnd - perfStart).toFixed(2)}ms`);
            }
            
            return ranges;
            
        } catch (error) {
            logger.error(`ANTLR Folding error: ${error}`);
            return [];
        }
    }

    /**
     * Recursively collect folding ranges from parse tree
     * Error-resilient: continues processing even if individual nodes fail
     */
    private collectFoldingRanges(ctx: ParserRuleContext, ranges: FoldingRange[]): void {
        try {
            // Check if this context should create a folding range
            const range = this.createFoldingRange(ctx);
            if (range) {
                ranges.push(range);
            }
        } catch (error) {
            // Log error but continue processing
            logger.warn(`Error creating fold range for ${ctx.constructor.name}: ${error}`);
        }

        // Recursively process children - even if parent failed
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child instanceof ParserRuleContext) {
                    try {
                        this.collectFoldingRanges(child, ranges);
                    } catch (error) {
                        // Log error but continue with other children
                        logger.warn(`Error processing child ${child.constructor.name}: ${error}`);
                    }
                }
            }
        }
    }

    /**
     * Create a folding range for specific parse tree contexts
     * Returns null for invalid or single-line contexts
     */
    private createFoldingRange(ctx: ParserRuleContext): FoldingRange | null {
        // Guard: Ensure start and stop tokens exist
        if (!ctx.start || !ctx.stop) {
            return null;
        }

        // Guard: Ensure line numbers are valid (can be undefined for error nodes)
        if (typeof ctx.start.line !== 'number' || typeof ctx.stop.line !== 'number') {
            logger.warn(`Invalid line numbers in ${ctx.constructor.name}: start=${ctx.start.line}, stop=${ctx.stop.line}`);
            return null;
        }

        const startLine = ctx.start.line - 1; // Convert to 0-based
        const endLine = ctx.stop.line - 1;     // Convert to 0-based

        // Guard: Skip if line numbers are invalid (can happen with empty optional rules or error recovery)
        if (endLine < startLine || startLine < 0 || endLine < 0) {
            // logger.debug(`  -> Skipped (invalid lines): startLine=${startLine}, endLine=${endLine}`);
            return null;
        }

        // WORKAROUND for parser ambiguity with single-line IF statements
        // TODO: Fix the grammar to properly distinguish between:
        //   - Single-line: "IF condition THEN statement." (DOT terminates immediately)
        //   - Multi-line:  "IF condition THEN\n  statements...\n." (DOT after multiple statements)
        // The issue: statementList is greedy and consumes statements across lines until finding DOT/END
        // Current behavior: Parser sees "IF x THEN y." and continues to next line, choosing the first
        //                   DOT it finds (e.g., in "self.Method") as the IF terminator
        if (ctx instanceof IfStatementContext) {
            // If IF starts on one line but terminator DOT is on a different line, check if there's 
            // a DOT on the IF line itself (indicating single-line IF where parser chose wrong DOT)
            if (ctx.stop.type === 4 && ctx.stop.line > ctx.start.line) {  // 4 is DOT
                const ifLineText = this.document.getText({
                    start: { line: startLine, character: 0 },
                    end: { line: startLine + 1, character: 0 }
                });
                
                // If the IF line contains THEN and ends with DOT (possibly followed by comment), skip fold
                if (/THEN/i.test(ifLineText) && /\.\s*(?:!.*)?[\r\n]*$/.test(ifLineText)) {
                    logger.debug(`  -> Skipped (single-line IF with DOT on same line, parser chose wrong DOT)`);
                    return null;
                }
            }
        }

        // Only create folding range if it spans multiple lines
        if (endLine <= startLine) {
            // logger.debug(`  -> Skipped (single line): startLine=${startLine}, endLine=${endLine}`);
            return null;
        }

        let kind: FoldingRangeKind | undefined = undefined;

        // Determine folding kind based on context type
        if (ctx instanceof ProcedureImplementationContext) {
            logger.debug(`PROCEDURE: start line=${ctx.start?.line} col=${ctx.start?.column} (${ctx.start?.text}), stop line=${ctx.stop?.line} col=${ctx.stop?.column} (${ctx.stop?.text}, type=${ctx.stop?.type}), startLine=${startLine}, endLine=${endLine}`);
            if (endLine > startLine) {
                logger.debug(`  -> Creating fold: startLine=${startLine}, endLine=${endLine}`);
                return { startLine, endLine };
            } else {
                logger.debug(`  -> Skipped (endLine ${endLine} <= startLine ${startLine})`);
                return null;
            }
        }
        else if (ctx instanceof RoutineDeclarationContext) {
            logger.debug(`ROUTINE: start line=${ctx.start?.line} col=${ctx.start?.column} (${ctx.start?.text}), stop line=${ctx.stop?.line} col=${ctx.stop?.column} (${ctx.stop?.text}, type=${ctx.stop?.type}), startLine=${startLine}, endLine=${endLine}`);
            if (endLine > startLine) {
                logger.debug(`  -> Creating fold: startLine=${startLine}, endLine=${endLine}`);
                return { startLine, endLine };
            } else {
                logger.debug(`  -> Skipped (endLine ${endLine} <= startLine ${startLine})`);
                return null;
            }
        }
        else if (ctx instanceof MapSectionContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof CodeSectionContext) {
            logger.debug(`CODE SECTION: start line=${ctx.start?.line} col=${ctx.start?.column} (${ctx.start?.text}), stop line=${ctx.stop?.line} col=${ctx.stop?.column} (${ctx.stop?.text}, type=${ctx.stop?.type}), startLine=${startLine}, endLine=${endLine}`);
            if (endLine > startLine) {
                logger.debug(`  -> Creating fold: startLine=${startLine}, endLine=${endLine}`);
                return { startLine, endLine };
            } else {
                logger.debug(`  -> Skipped (endLine ${endLine} <= startLine ${startLine})`);
                return null;
            }
        }
        else if (ctx instanceof IfStatementContext) {
            logger.debug(`IF STATEMENT: start line=${ctx.start.line} col=${ctx.start.column} (${ctx.start.text}), stop line=${ctx.stop.line} col=${ctx.stop.column} (${ctx.stop.text}, type=${ctx.stop.type}), startLine=${startLine}, endLine=${endLine}`);
            logger.debug(`  -> Creating fold: startLine=${startLine}, endLine=${endLine}`);
            return { startLine, endLine };
        }
        else if (ctx instanceof ElsifClauseContext) {
            // ELSIF shares the END with its parent IF statement
            // Find the parent IF and use its end line
            const parentIf = ctx.parent as IfStatementContext;
            if (parentIf && parentIf.stop) {
                const elsifEndLine = parentIf.stop.line - 1; // Convert to 0-based
                if (elsifEndLine > startLine) {
                    return { startLine, endLine: elsifEndLine };
                }
            }
            return null;
        }
        else if (ctx instanceof ElseClauseContext) {
            // ELSE shares the END with its parent IF statement
            // Find the parent IF and use its end line
            const parentIf = ctx.parent as IfStatementContext;
            if (parentIf && parentIf.stop) {
                const elseEndLine = parentIf.stop.line - 1; // Convert to 0-based
                if (elseEndLine > startLine) {
                    return { startLine, endLine: elseEndLine };
                }
            }
            return null;
        }
        else if (ctx instanceof LoopStatementContext) {
            logger.debug(`LOOP STATEMENT: start line=${ctx.start?.line} col=${ctx.start?.column} (${ctx.start?.text}), stop line=${ctx.stop?.line} col=${ctx.stop?.column} (${ctx.stop?.text}, type=${ctx.stop?.type}), startLine=${startLine}, endLine=${endLine}`);
            if (endLine > startLine) {
                logger.debug(`  -> Creating fold: startLine=${startLine}, endLine=${endLine}`);
                return { startLine, endLine };
            } else {
                logger.debug(`  -> Skipped (endLine ${endLine} <= startLine ${startLine})`);
                return null;
            }
        }
        else if (ctx instanceof CaseStatementContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof ExecuteStatementContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof DoStatementContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof WindowDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof ApplicationDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof WindowControlsContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof GroupDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof QueueDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof FileDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof RecordDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof ViewDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof ClassDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof ModuleReferenceContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof TabControlContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof SheetControlContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof GroupControlContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof OptionControlContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof OleControlContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof MenubarDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof MenuDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof MenuItemDeclarationContext) {
            return { startLine, endLine };
        }

        // Add more context types as needed
        // Could also handle: RECORD, VIEW, REPORT, METHOD, MODULE, etc.

        return null;
    }
    
    /**
     * Invalidate cache for a document
     */
    public static invalidateCache(uri: string): void {
        parseTreeCache.delete(uri);
        logger.info(`🗑️  Invalidated parse tree cache for ${uri.substring(uri.lastIndexOf('/') + 1)}`);
    }
    
    /**
     * Clear all caches
     */
    public static clearCache(): void {
        parseTreeCache.clear();
        logger.info('🗑️  Cleared all parse tree caches');
    }

    /**
     * Get statistics about the folding ranges
     */
    public async getFoldingStatistics(): Promise<{ total: number; byType: Map<string, number> }> {
        const ranges = await this.computeFoldingRanges();
        const byType = new Map<string, number>();
        
        // Could categorize by parsing the document again and tracking context types
        // For now just return total count
        
        return {
            total: ranges.length,
            byType
        };
    }
}
