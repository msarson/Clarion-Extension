import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("Formatter");
logger.setLevel("info");

class ClarionFormatter {
    private tokens: Token[];
    private text: string;
    private lines: string[];
    private indentSize: number = 4;
    private labelLines: Set<number> = new Set();
    private structureStartColumns: Map<number, number> = new Map();
    private structureEndLines: Map<number, number> = new Map();
    private statementIndentation: Map<number, number> = new Map();
    private lastStatementColumn: Map<number, number> = new Map(); // Track the last statement's column per parent structure

    constructor(tokens: Token[], text: string, options?: { indentSize?: number }) {
        this.tokens = tokens;
        this.text = text;
        this.lines = text.split(/\r?\n/);

        if (options?.indentSize) {
            this.indentSize = options.indentSize;
        }

        this.identifyLabelLines();
        this.calculateStructureIndentation();
    }

    /**
     * Identify all lines that contain labels to ensure they stay at column 1
     */
    private identifyLabelLines(): void {
        for (const token of this.tokens) {
            if (token.type === TokenType.Label) {
                this.labelLines.add(token.line);
                logger.info(`📌 Identified label at line ${token.line}: ${token.value}`);
            }
        }
    }

    /**
     * Calculate structure indentation and store alignment rules
     */
    private calculateStructureIndentation(): void {
        let structureStack: { startLine: number; column: number }[] = [];
        let procedureStack: { startLine: number; column: number }[] = [];
        let routineStack: { startLine: number; column: number }[] = [];
        let insideCodeBlock = false;
        let codeIndentation = 0;
        this.lastStatementColumn = new Map<number, number>(); // Ensure this is initialized
    
        for (const token of this.tokens) {
            // ✅ Handle STRUCTURE (WINDOW, SHEET, CLASS, etc.)
            if (token.subType === TokenType.Structure) {
                let baseColumn = token.start;
    
                // Adjust indentation based on previous statement within the same structure
                if (structureStack.length > 0) {
                    const parentStructure = structureStack[structureStack.length - 1];
                    const lastStatementCol = this.lastStatementColumn.get(parentStructure.startLine) ?? parentStructure.column;
                    baseColumn = Math.min(baseColumn, lastStatementCol);
                }
    
                this.structureStartColumns.set(token.line, baseColumn);
                structureStack.push({ startLine: token.line, column: baseColumn });
    
                logger.info(`📌 Structure '${token.value}' starts at line ${token.line}, column ${baseColumn}`);
            }
    
            // ✅ Handle END statements
            if (token.type === TokenType.EndStatement) {
                const lastStructure = structureStack.pop();
                if (lastStructure) {
                    this.structureEndLines.set(token.line, lastStructure.column);
                    logger.info(`✅ 'END' aligns with structure at column ${lastStructure.column}, line ${token.line}`);
                }
            }
    
            // ✅ Handle PROCEDURE indentation
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROCEDURE") {
                let procedureColumn = this.indentSize;
                procedureStack.push({ startLine: token.line, column: procedureColumn });
                this.statementIndentation.set(token.line, procedureColumn);
                logger.info(`📌 PROCEDURE starts at line ${token.line}, indenting to ${procedureColumn}`);
            }
    
            // ✅ Handle ROUTINE indentation
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "ROUTINE") {
                let routineColumn = (procedureStack.length > 0) 
                    ? procedureStack[procedureStack.length - 1].column + this.indentSize 
                    : this.indentSize;
    
                routineStack.push({ startLine: token.line, column: routineColumn });
                this.statementIndentation.set(token.line, routineColumn);
                logger.info(`📌 ROUTINE starts at line ${token.line}, indenting to ${routineColumn}`);
            }
    
            // ✅ Handle CODE block inside PROCEDURE or ROUTINE
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "CODE") {
                if (routineStack.length > 0) {
                    // If inside a ROUTINE, CODE indentation should align under the ROUTINE
                    codeIndentation = routineStack[routineStack.length - 1].column + this.indentSize;
                } else if (procedureStack.length > 0) {
                    // If inside a PROCEDURE, align CODE normally
                    codeIndentation = procedureStack[procedureStack.length - 1].column + this.indentSize;
                } else {
                    codeIndentation = this.indentSize;
                }
    
                insideCodeBlock = true;
                this.statementIndentation.set(token.line, codeIndentation);
                logger.info(`📌 CODE block starts at line ${token.line}, indenting to column ${codeIndentation}`);
            }
    
            // ✅ Handle exiting a CODE block when encountering a new PROCEDURE or ROUTINE
            if (insideCodeBlock && (token.type === TokenType.Keyword && 
                (token.value.toUpperCase() === "PROCEDURE" || token.value.toUpperCase() === "ROUTINE"))) {
                insideCodeBlock = false;
                logger.info(`✅ CODE block ends at line ${token.line}, resetting indentation`);
            }
    
            // ✅ Handle DATA inside ROUTINE
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "DATA") {
                let dataIndentation = (routineStack.length > 0) 
                    ? routineStack[routineStack.length - 1].column + this.indentSize 
                    : this.indentSize;
    
                this.statementIndentation.set(token.line, dataIndentation);
                logger.info(`📌 DATA block starts at line ${token.line}, indenting to column ${dataIndentation}`);
            }
    
            // ✅ Handle Statements inside STRUCTURES, CODE, ROUTINE, or PROCEDURE
            if (
                (structureStack.length > 0 || insideCodeBlock || routineStack.length > 0 || procedureStack.length > 0) &&
                token.subType !== TokenType.Structure &&
                token.type !== TokenType.EndStatement &&
                token.type !== TokenType.Keyword // Skip handling DATA and CODE since they have separate logic
            ) {
                let parentColumn = insideCodeBlock
                    ? codeIndentation  // If inside CODE, use its base indentation
                    : (routineStack.length > 0) 
                        ? routineStack[routineStack.length - 1].column
                        : (procedureStack.length > 0) 
                            ? procedureStack[procedureStack.length - 1].column
                            : structureStack.length > 0 
                                ? structureStack[structureStack.length - 1].column 
                                : 0;
    
                let statementColumn = parentColumn + this.indentSize;
                this.statementIndentation.set(token.line, statementColumn);
                this.lastStatementColumn.set(token.line, statementColumn); // Track last statement position
    
                logger.info(`🔹 Statement at line ${token.line} indented to column ${statementColumn}`);
            }
        }
    }
    
    
    

    /**
     * Format the source text by applying proper indentation to structures
     * @returns The formatted text
     */
    public format(): string {
        logger.info("📐 Starting structure-based formatting...");

        const formattedLines = this.lines.map((line, index) => {
            const trimmedLine = line.trimLeft();
            if (trimmedLine.length === 0) return ''; // Keep empty lines as-is

            if (this.labelLines.has(index)) {
                return trimmedLine; // Labels stay at column 1
            }

            if (this.structureEndLines.has(index)) {
                const startColumn = this.structureEndLines.get(index) ?? 0;
                return ' '.repeat(startColumn) + trimmedLine;
            }

            if (this.structureStartColumns.has(index)) {
                const baseIndent = this.structureStartColumns.get(index) ?? 0;
                return ' '.repeat(baseIndent) + trimmedLine;
            }

            if (this.statementIndentation.has(index)) {
                const statementIndent = this.statementIndentation.get(index) ?? 0;
                return ' '.repeat(statementIndent) + trimmedLine;
            }

            // Default to no extra indentation if it's not recognized
            return trimmedLine;
        });

        logger.info("📐 Structure-based formatting complete.");
        return formattedLines.join('\n');
    }

    /**
     * Format a document (alias for format() to maintain consistent API)
     * @returns The formatted text
     */
    public formatDocument(): string {
        return this.format();
    }
}

export default ClarionFormatter;
