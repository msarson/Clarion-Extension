import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from '../generated/ClarionLexer';
import { ClarionParser, ProcedureDeclarationContext, MapSectionContext, 
         CodeSectionContext, IfStatementContext, LoopStatementContext, 
         CaseStatementContext, WindowDeclarationContext, GroupDeclarationContext,
         QueueDeclarationContext, FileDeclarationContext, ClassDeclarationContext,
         RoutineDeclarationContext, RecordDeclarationContext, ViewDeclarationContext,
         ApplicationDeclarationContext, MethodDeclarationContext, ModuleReferenceContext,
         DoStatementContext, WindowControlsContext, TabControlContext, SheetControlContext } from '../generated/ClarionParser';
import { ParserRuleContext } from 'antlr4ng';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("AntlrFoldingProvider");
logger.setLevel("info");

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
            
            // Create ANTLR lexer and parser
            const inputStream = CharStream.fromString(text);
            const lexer = new ClarionLexer(inputStream);
            const tokenStream = new CommonTokenStream(lexer);
            const parser = new ClarionParser(tokenStream);
            
            // Disable error console output
            parser.removeErrorListeners();
            
            // Parse the document
            const tree = parser.compilationUnit();
            
            // Collect folding ranges from parse tree
            const ranges: FoldingRange[] = [];
            this.collectFoldingRanges(tree, ranges);
            
            const perfEnd = performance.now();
            logger.info(`ANTLR Folding: Computed ${ranges.length} ranges in ${(perfEnd - perfStart).toFixed(2)}ms`);
            
            return ranges;
            
        } catch (error) {
            logger.error(`ANTLR Folding error: ${error}`);
            return [];
        }
    }

    /**
     * Recursively collect folding ranges from parse tree
     */
    private collectFoldingRanges(ctx: ParserRuleContext, ranges: FoldingRange[]): void {
        // Check if this context should create a folding range
        const range = this.createFoldingRange(ctx);
        if (range) {
            ranges.push(range);
        }

        // Recursively process children
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child instanceof ParserRuleContext) {
                    this.collectFoldingRanges(child, ranges);
                }
            }
        }
    }

    /**
     * Create a folding range for specific parse tree contexts
     */
    private createFoldingRange(ctx: ParserRuleContext): FoldingRange | null {
        if (!ctx.start || !ctx.stop) {
            return null;
        }

        const startLine = ctx.start.line - 1; // Convert to 0-based
        const endLine = ctx.stop.line - 1;     // Convert to 0-based

        // Only create folding range if it spans multiple lines
        if (endLine <= startLine) {
            return null;
        }

        let kind: FoldingRangeKind | undefined = undefined;

        // Determine folding kind based on context type
        if (ctx instanceof ProcedureDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof RoutineDeclarationContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof MapSectionContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof CodeSectionContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof IfStatementContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof LoopStatementContext) {
            return { startLine, endLine };
        }
        else if (ctx instanceof CaseStatementContext) {
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
        else if (ctx instanceof MethodDeclarationContext) {
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

        // Add more context types as needed
        // Could also handle: RECORD, VIEW, REPORT, METHOD, MODULE, etc.

        return null;
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
