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
        let currentIndent = 0;

        for (const token of this.tokens) {
            if (token.type === TokenType.ExecutionMarker && ["CODE", "DATA"].includes(token.value.toUpperCase())) {
                this.insideCodeBlock = true;
                this.codeIndentColumn = this.indentSize;
                logger.info(`📌 ${token.value.toUpperCase()} block starts at line ${token.line}, setting indent to ${this.codeIndentColumn}`);
                continue;
            }

            // ✅ Handle Structures (increase indent)
            // ✅ Handle Structures (increase indent)
            if (token.subType === TokenType.Structure) {
                let baseColumn = token.start; // Default column for the structure

                // ✅ If a label exists on the same line, align structure correctly
                if (this.labelLines.has(token.line)) {
                    const labelToken = this.tokens.find(t => t.line === token.line && t.type === TokenType.Label);
                    if (labelToken) {
                        baseColumn = labelToken.start + labelToken.value.length + this.indentSize;
                        logger.info(`🔹 Adjusting structure '${token.value}' at line ${token.line}, aligning to column ${baseColumn}`);
                    }
                }
                 else if (this.structureStack.length > 0) {
                    baseColumn = this.structureStack[this.structureStack.length - 1].column + this.indentSize;
                }

                this.structureStartColumns.set(token.line, baseColumn);
                this.structureStack.push({ startLine: token.line, column: baseColumn });
                logger.info(`📌 Structure '${token.value}' starts at line ${token.line}, column ${baseColumn}`);
            }


            // ✅ Handle END (decrease indent)
            if (token.type === TokenType.EndStatement) {
                if (this.structureStack.length > 0) {
                    const lastStructure = this.structureStack.pop();
                    if (lastStructure) { // ✅ Ensure lastStructure is defined
                        this.structureEndLines.set(token.line, lastStructure.column);
                        currentIndent = lastStructure.column; // Reset indent level
                        logger.info(`✅ 'END' aligns with structure at column ${lastStructure.column}, line ${token.line}`);
                    }
                } else {
                    logger.warn(`⚠️ Unexpected 'END' at line ${token.line} - No matching structure found.`);
                }

            }

            // ✅ Handle Non-Structure Items Inside Structures (Keys, Fields, etc.)
            if (
                this.structureStack.length > 0 &&
                token.subType !== TokenType.Structure &&
                token.type !== TokenType.EndStatement &&
                !this.structureStartColumns.has(token.line) // 🚨 Ensure we don’t adjust tokens on structured lines
            ) {
                const parentStructure = this.structureStack[this.structureStack.length - 1];

                const correctIndent = parentStructure.column + this.indentSize;
                if (!this.statementIndentation.has(token.line) || this.statementIndentation.get(token.line) !== correctIndent) {
                    this.statementIndentation.set(token.line, correctIndent);
                    logger.info(`🔹 Adjusted indentation for non-structure item '${token.value}' at line ${token.line} to column ${correctIndent}`);
                }
            }





        }
    }



    public format(): string {
        logger.info("📐 Starting structure-based formatting...");
        for (const token of this.tokens) {
            logger.info(`🔍 Token: '${token.value}' at line ${token.line}, start ${token.start}`);
        }

        // 🚨 Forcefully apply formatted indentation
        const formattedLines: string[] = this.lines.map((line, index) => {
            //logger.info(`🔍 Processing line ${index}: '${line}'`);
            const originalLine = line; // Preserve original for debugging
            const trimmedLine = line.trimLeft();
            if (trimmedLine.length === 0) return "";

            logger.info(`🔍 Processing line ${index}: '${trimmedLine}'`);

            let finalIndent = 0; // Default to no indentation

            // ✅ Labels stay at column 1
            if (this.labelLines.has(index)) {
                logger.debug(`📌 Line ${index} is a label, keeping at column 1.`);

                const firstSpaceIndex = trimmedLine.indexOf(" ");

                if (firstSpaceIndex > 0 && firstSpaceIndex < trimmedLine.length - 1) {
                    const labelPart = trimmedLine.substring(0, firstSpaceIndex);
                    const statementPart = trimmedLine.substring(firstSpaceIndex).trimLeft();

                    // ✅ Ensure minimum indent level is respected
                    let statementIndent = Math.max(
                        this.indentSize,  // Minimum indent level
                        this.structureStartColumns.get(index) ?? this.statementIndentation.get(index) ?? this.codeIndentColumn
                    );

                    // ✅ Ensure multi-token statements remain aligned with the structure
                    if (this.structureStartColumns.has(index)) {
                        statementIndent = this.structureStartColumns.get(index) ?? statementIndent;
                        logger.info(`🔹 Adjusting structure alignment for '${labelPart}' at line ${index}, indent: ${statementIndent}`);
                    }

                    
                    let spaceCount = Math.max(0, statementIndent - labelPart.length);
                    if(spaceCount === 0) {
                        spaceCount = statementIndent;
                    }
                    return labelPart + " ".repeat(spaceCount) + statementPart;
                }

                return trimmedLine; // If label is alone, return unchanged
            }










            // ✅ END Statements
            if (this.structureEndLines.has(index)) {
                finalIndent = this.structureEndLines.get(index) ?? 0;
            }
            // ✅ STRUCTURE Declarations
            else if (this.structureStartColumns.has(index)) {
                finalIndent = this.structureStartColumns.get(index) ?? 0;
            }
            // ✅ NON-STRUCTURE Items (Fields, Keys)
            else if (this.statementIndentation.has(index)) {
                finalIndent = this.statementIndentation.get(index) ?? 0;
            }
            // ✅ CODE Block Handling
            else if (this.insideCodeBlock) {
                finalIndent = this.codeIndentColumn;
            }

            // 🔍 Debug Final Indentation Decision
            logger.info(`🔹 Line ${index} Final Indentation: ${finalIndent} spaces`);

            // 🚀 **Force the indentation to actually apply**
            let formattedLine = " ".repeat(finalIndent) + trimmedLine;

            // 🚨 **If the line is the same, log a warning**
            if (formattedLine === originalLine) {
                logger.warn(`⚠️ WARNING: Line ${index} did not change during formatting! Expected indentation: ${finalIndent} spaces.`);
            } else {
                logger.info(`✅ Formatting changed for Line ${index}`);
                logger.info(`🔍 Original: '${originalLine}'`);
                logger.info(`🔍 Formatted: '${formattedLine}'`);
            }

            return formattedLine;
        });

        logger.info("📐 Structure-based formatting complete.");
        return formattedLines.join("\r\n"); // 🚨 Ensure we return the newly formatted text
    }











    public formatDocument(): string {
        return this.format();
    }
}

export default ClarionFormatter;