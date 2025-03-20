import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";

const logger = LoggerManager.getLogger("ExecutionRangeProvider");
logger.setLevel("info");

export class ExecutionRangeProvider {
    private executionRanges: { from: number; to: number }[] = [];
    private procedures: {
        name: string;
        fullRange: { from: number; to: number };
        executionRange: { from: number; to: number }
    }[] = [];
    private nonExecutionTokens: Token[] = [];
    private documentLineCount: number = 0;

    constructor(private tokens: Token[], documentLineCount: number) {
        this.documentLineCount = documentLineCount; // Store total lines in document
        this.buildExecutionRanges();
        this.collectNonExecutionTokens();
    }

    /** ✅ Builds execution and procedure full ranges */
    private buildExecutionRanges(): void {
        this.executionRanges = [];
        this.procedures = [];

        for (const token of this.tokens) {
            if (token.subType === TokenType.Procedure || token.subType === TokenType.Routine) {
                let procedureName = token.value || "UnnamedProcedure";
                const fullStart = token.line;
                const fullEnd = token.finishesAt ?? fullStart;

                let executionStart = fullStart;
                let executionEnd = fullEnd;

                if (token.executionMarker) {
                    executionStart = token.executionMarker.line;
                    executionEnd = token.finishesAt ?? executionStart;
                    this.executionRanges.push({ from: executionStart, to: executionEnd });
                }

                this.procedures.push({
                    name: procedureName,
                    fullRange: { from: fullStart, to: fullEnd },
                    executionRange: { from: executionStart, to: executionEnd }
                });

                logger.info(`📌 Procedure '${procedureName}' Full Range: ${fullStart}-${fullEnd}, Execution: ${executionStart}-${executionEnd}`);
            }
        }
    }

    /** ✅ Collects tokens that fall inside non-execution ranges */
    private collectNonExecutionTokens(): void {
        const nonExecutionRanges = this.getNonExecutionRanges();
        this.nonExecutionTokens = this.tokens.filter(token =>
            nonExecutionRanges.some(range => token.line >= range.from && token.line <= range.to)
        );
    }

    /** ✅ Returns execution, non-execution ranges, full procedure details, and non-execution tokens */
    public getExecutionAnalysis(): {
        execution: { from: number; to: number }[],
        nonExecution: { from: number; to: number }[],
        nonExecutionTokens: Token[],
        procedures: {
            name: string;
            fullRange: { from: number; to: number };
            executionRange: { from: number; to: number }
        }[]
    } {
        return {
            execution: this.executionRanges,
            nonExecution: this.getNonExecutionRanges(),
            nonExecutionTokens: this.nonExecutionTokens,
            procedures: this.procedures
        };
    }

    /** ✅ Computes non-execution ranges */
    private getNonExecutionRanges(): { from: number; to: number }[] {
        const nonExecutionRanges: { from: number; to: number }[] = [];

        if (this.executionRanges.length === 0) {
            return [{ from: 0, to: this.documentLineCount }];
        }

        let currentStart = 0;

        for (const range of this.executionRanges) {
            if (currentStart < range.from) {
                nonExecutionRanges.push({ from: currentStart, to: range.from - 1 });
            }
            currentStart = range.to + 1;
        }

        if (currentStart <= this.documentLineCount) {
            nonExecutionRanges.push({ from: currentStart, to: this.documentLineCount });
        }

        return nonExecutionRanges;
    }

    /** ✅ Checks if a given line is inside execution code */
    public isInsideExecution(line: number): boolean {
        return this.executionRanges.some(range => line >= range.from && line <= range.to);
    }
    /** ✅ Checks if a given line is inside a non-execution range */
    public isInsideNonExecution(line: number): boolean {
        return this.getNonExecutionRanges().some(range => line >= range.from && line <= range.to);
    }

}
