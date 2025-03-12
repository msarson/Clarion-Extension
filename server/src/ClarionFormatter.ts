import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";

const logger = LoggerManager.getLogger("Formatter");
logger.setLevel("info");

class ClarionFormatter {
    private tokens: Token[];
    private text: string;
    private lines: string[];
    private indentSize: number = 2;
    private labelLines: Set<number> = new Set();
    private structureStartColumns: Map<number, number> = new Map();
    private structureEndLines: Map<number, number> = new Map();
    private statementIndentation: Map<number, number> = new Map();
    private insideCodeBlock: boolean = false;
    private codeIndentColumn: number = 2;
    private structureStack: { startLine: number; column: number }[] = [];

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

    private identifyLabelLines(): void {
        for (const token of this.tokens) {
            if (token.type === TokenType.Label) {
                this.labelLines.add(token.line);
                logger.info(`📌 Identified label at line ${token.line}: ${token.value}`);
            }
        }
    }

    private calculateStructureIndentation(): void {
        for (const token of this.tokens) {
            if (token.type === TokenType.ExecutionMarker && ["CODE", "DATA"].includes(token.value.toUpperCase())) {
                this.insideCodeBlock = true;
                this.codeIndentColumn = this.indentSize;
                logger.info(`📌 ${token.value.toUpperCase()} block starts at line ${token.line}, setting indent to ${this.codeIndentColumn}`);
                continue;
            }
    
            if (token.subType === TokenType.Structure) {
                const baseColumn = this.structureStack.length > 0 
                    ? this.structureStack[this.structureStack.length - 1].column + this.indentSize 
                    : token.start;
    
                this.structureStartColumns.set(token.line, baseColumn);
                this.structureStack.push({ startLine: token.line, column: baseColumn });
                logger.info(`📌 Structure '${token.value}' starts at line ${token.line}, column ${baseColumn}`);
            }
    
            if (token.type === TokenType.ConditionalContinuation) {
                // Align ELSE/ELSIF with the previous IF
                if (this.structureStack.length > 0) {
                    const parentStructure = this.structureStack[this.structureStack.length - 1];
                    this.structureStartColumns.set(token.line, parentStructure.column);
                    logger.info(`📌 ELSE/ELSIF at line ${token.line} aligned with IF at column ${parentStructure.column}`);
                }
            }
    
            if (token.type === TokenType.EndStatement) {
                const lastStructure = this.structureStack.pop();
                if (lastStructure) {
                    this.structureEndLines.set(token.line, lastStructure.column);
                    logger.info(`✅ 'END' aligns with structure at column ${lastStructure.column}, line ${token.line}`);
                }
            }
    
            if (this.structureStack.length > 0 && token.subType !== TokenType.Structure && token.type !== TokenType.EndStatement) {
                const parentStructure = this.structureStack[this.structureStack.length - 1];
                const statementColumn = parentStructure.column + this.indentSize;
                this.statementIndentation.set(token.line, statementColumn);
                logger.info(`🔹 Statement at line ${token.line} indented to column ${statementColumn}`);
            }
        }
    }
    

    public format(): string {
        logger.info("📐 Starting structure-based formatting...");
        
        const formattedLines = this.lines.map((line, index) => {
            const trimmedLine = line.trimLeft();
            if (trimmedLine.length === 0) return "";
            
            if (this.labelLines.has(index)) {
                return trimmedLine;
            }
            
            if (this.structureEndLines.has(index)) {
                const startColumn = this.structureEndLines.get(index) ?? 0;
                return " ".repeat(startColumn) + trimmedLine;
            }
            
            if (this.structureStartColumns.has(index)) {
                const baseIndent = this.structureStartColumns.get(index) ?? 0;
            
                // ✅ Ensure ELSE/ELSIF align with IF
                if (this.tokens[index]?.type === TokenType.ConditionalContinuation) {
                    return " ".repeat(baseIndent) + trimmedLine;
                }
            
                return " ".repeat(baseIndent) + trimmedLine;
            }
            
            // ✅ Handle statements inside ELSE/ELSIF
            if (this.statementIndentation.has(index)) {
                const statementIndent = this.statementIndentation.get(index) ?? 0;
                return " ".repeat(statementIndent) + trimmedLine;
            }
            
            
            if (this.insideCodeBlock) {
                return " ".repeat(this.codeIndentColumn) + trimmedLine;
            }
            
            return trimmedLine;
        });
        
        logger.info("📐 Structure-based formatting complete.");
        return formattedLines.join("\n");
    }

    public formatDocument(): string {
        return this.format();
    }
}

export default ClarionFormatter;