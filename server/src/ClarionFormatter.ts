import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";
import { FormattingOptions } from 'vscode-languageserver';

type StructureToken = Token & {
    type: TokenType.Structure;
};

const logger = LoggerManager.getLogger("Formatter");
logger.setLevel("info");

class ClarionFormatter {
    private tokens: Token[];
    private text: string;
    private lines: string[];
    private indentSize: number = 4;
    private labelLines: Set<number> = new Set();
    private structureIndentMap: Map<number, number> = new Map();
    private executionRanges: { startsAt: number; finishesAt: number }[] = [];
    private statementIndentation: Map<number, number> = new Map();
    private insideExecutionCode: boolean = false;

    constructor(tokens: Token[], text: string, options?: { indentSize?: number, formattingOptions?: FormattingOptions }) {
        this.tokens = tokens;
        this.text = text;
        this.lines = text.split(/\r?\n/);

        if (options?.indentSize !== undefined) {
            this.indentSize = options.indentSize;
        } else if (options?.formattingOptions?.tabSize !== undefined) {
            this.indentSize = options.formattingOptions.tabSize;
            logger.info(`Using editor tab size: ${this.indentSize}`);
        }

        this.identifyExecutionRanges();
        this.identifyLabelLines();
        this.detectMisplacedLabels(); // 🚀 NEW FUNCTION HERE
        // this.calculateIndentation();
    }

    private identifyExecutionRanges(): void {
        this.executionRanges = [];
        for (const token of this.tokens) {
            if (token.subType === TokenType.Procedure || token.subType === TokenType.Routine) {
                let executionStart = token.executionMarker ? token.executionMarker.line + 1 : token.line + 1;
                this.executionRanges.push({
                    startsAt: executionStart,
                    finishesAt: token.finishesAt ?? this.tokens[this.tokens.length - 1]?.line ?? 0
                });
                logger.warn(`📌 Execution Range for ${token.subType === TokenType.Procedure ? 'PROCEDURE' : 'ROUTINE'} '${token.value}': ${executionStart} to ${token.finishesAt ?? this.tokens[this.tokens.length - 1]?.line ?? 0}`);
            }
        }
    }
    private identifyLabelLines(): void {
        const executionCodeSections: Set<number> = new Set();
        const possibleLabels: Set<number> = new Set();
        const processedLines: Set<number> = new Set(); // ✅ Ensure we process only the first token per line

        // ✅ Step 1: Identify execution sections FIRST
        for (const range of this.executionRanges) {
            for (let line = range.startsAt; line <= range.finishesAt; line++) {
                executionCodeSections.add(line);
            }
        }

        // ✅ Step 2: Identify possible labels, but only outside execution sections
        for (const token of this.tokens) {
            if (processedLines.has(token.line)) continue; // 🚀 Skip if line already processed

            // ✅ Skip tokens inside execution range
            if (executionCodeSections.has(token.line)) {
                logger.info(`⏭️ Skipping '${token.value}' at line ${token.line}, inside execution.`);
                continue;
            }

            // ✅ Only process the first token per line
            if (token.type === TokenType.Label || token.type === TokenType.Variable || token.subType === TokenType.Routine || token.type === TokenType.Class) {
                possibleLabels.add(token.line);
                this.labelLines.add(token.line);
                logger.info(`📌 Possible label detected: '${token.value}' at line ${token.line}`);
            }

            // 🚀 Stop processing further tokens on this line
            processedLines.add(token.line);
        }


        // ✅ Step 3: Confirm only valid labels
        // for (const token of this.tokens) {
        //     if (possibleLabels.has(token.line)) {
        //         if (executionCodeSections.has(token.line) && token.subType !== TokenType.Routine) {
        //             this.labelLines.delete(token.line);
        //             logger.info(`🔄 Overriding '${token.value}' at line ${token.line} (inside execution) as a statement`);
        //         } else {
        //             this.labelLines.add(token.line);
        //             logger.info(`✅ Confirmed label at line ${token.line}: ${token.value}`);
        //         }
        //     }
        // }
    }


    private detectMisplacedLabels(): void {
        logger.info("🔍 Detecting misplaced labels...");

        for (const token of this.tokens) {
            // ✅ Only check for misplaced labels
            if (token.type === TokenType.Label && token.start > 0) {
                logger.warn(`🚨 Misplaced label detected: '${token.value}' at Line ${token.line}, Column ${token.start}`);

                // ✅ Add the line to be adjusted
                this.labelLines.delete(token.line); // ❌ Remove as label
                this.statementIndentation.set(token.line, this.indentSize); // ✅ Treat it as a statement instead
            }
        }
    }


    private calculateIndentation(): void {
        const indentStack: { startColumn: number; indentLevel: number }[] = [];
        let structureIndentation: number = 0;

        logger.info("🔍 Starting indentation calculation...");

        for (const token of this.tokens) {
            logger.info(`🔎 Processing Token: '${token.value}' at Line ${token.line}, Column ${token.start}`);

            // ✅ Handle STRUCTURE (e.g., VIEW, WINDOW, SHEET)
            if (token.type === TokenType.Structure) {
                // Find label (if any) on the same line
                let labelToken = this.tokens.find(t => t.line === token.line && t.type === TokenType.Label);
                // ✅ Find where the label ends
                let labelEndColumn = labelToken ? labelToken.start + labelToken.value.length : 0;

                // ✅ Log label detection details
                if (labelToken) {
                    logger.info(`🔍 Label Detection: ${labelToken ? `'${labelToken.value}'` : 'No Label'} at Line ${token.line}, Starts at ${labelToken.start} Ends at Column ${labelEndColumn}`);
                }

                // ✅ Find the next tab stop AFTER the label (ensuring tabSize spacing)
                let structureColumn = labelEndColumn > 0
                    ? Math.ceil((labelEndColumn + 1) / this.indentSize) * this.indentSize  // ✅ Ensure 1 space before aligning
                    : token.start;


                // ✅ Log structure alignment
                logger.info(`📏 Structure '${token.value}' at Line ${token.line} starts at Column ${structureColumn}`);

                // ✅ Child elements align at **next full tab stop after the structure**
                structureIndentation = Math.ceil((structureColumn + this.indentSize) / this.indentSize) * this.indentSize;

                // ✅ Log indentation details
                logger.info(`🔹 Child elements of '${token.value}' will align at Column ${structureIndentation}`);


                // ✅ Store indentation for children
                this.structureIndentMap.set(token.line, structureColumn);
                indentStack.push({ startColumn: structureColumn, indentLevel: structureIndentation });

                logger.info(`📏 Structure '${token.value}' at Line ${token.line} starts at Column ${structureColumn}, children will align at Column ${structureIndentation}`);
            }

            // ✅ Handle END statement (aligns with structure)
            else if (token.type === TokenType.EndStatement) {
                let lastStructure = indentStack.pop();
                if (lastStructure) {
                    structureIndentation = lastStructure.startColumn;
                    this.structureIndentMap.set(token.line, structureIndentation);
                    logger.info(`✅ END at Line ${token.line} aligns with its structure at Column ${structureIndentation}`);
                }
            }

            // ✅ Handle nested elements inside a structure
            else {
                let indentLevel = indentStack.length > 0 ? indentStack[indentStack.length - 1].indentLevel : 0;
                this.structureIndentMap.set(token.line, indentLevel);
                logger.info(`🔹 Statement '${token.value}' at Line ${token.line} indented at Column ${indentLevel}`);
            }
        }

        logger.info("✅ Indentation calculation completed!");
    }
    private isStructure(token: Token): token is StructureToken {
        return token.type === TokenType.Structure;
    }
    

   public format(): string {
    logger.info("📐 Starting inline structure-based formatting...");

    let indentStack: { startColumn: number; indentLevel: number }[] = [];
    let finalIndent = this.indentSize; // 🔹 Minimum indent size

    const formattedLines: string[] = [];

    for (let index = 0; index < this.lines.length; index++) {
        const originalLine = this.lines[index];
        const trimmedLine = originalLine.trimLeft();
        if (trimmedLine.length === 0) {
            formattedLines.push("");
            continue;
        }

        // ✅ Get tokens for this line
        const tokensOnLine = this.tokens.filter(t => t.line === index);
        if (tokensOnLine.length === 0) {
            formattedLines.push(" ".repeat(finalIndent) + trimmedLine);
            continue;
        }

        // ✅ Identify first and second tokens
        const firstToken = tokensOnLine[0];
        const secondToken = tokensOnLine.length > 1 ? tokensOnLine[1] : null;

        let lineIndent = finalIndent;

        // ✅ Labels always stay at column 0
        if (firstToken.type === TokenType.Label) {
            logger.info(`📌 Keeping label '${firstToken.value}' at column 0 on Line ${index}`);

            let labelEndColumn = firstToken.start + firstToken.value.length;

            // ✅ If followed by a structure, indent it correctly
            if (secondToken?.type === TokenType.Structure) {
                let parentIndent = indentStack.length > 0 ? indentStack[indentStack.length - 1].indentLevel : this.indentSize;
                let structureIndent = Math.max(labelEndColumn + this.indentSize, secondToken.maxLabelLength + this.indentSize, parentIndent);

                logger.info(`📏 Formatting STRUCTURE '${secondToken.value}' at Line ${index}, indent = ${structureIndent}`);

                // ✅ Store indentation for nested structures
                indentStack.push({ startColumn: structureIndent, indentLevel: structureIndent + this.indentSize });

                formattedLines.push(
                    firstToken.value + " ".repeat(Math.max(0, structureIndent - labelEndColumn)) + trimmedLine.substring(secondToken.start)
                );
                continue;
            }

            // ✅ If label is followed by a non-structure statement, indent it based on parent
            if (secondToken && !this.isStructure(secondToken)) {
                let parentIndent = indentStack.length > 0 ? indentStack[indentStack.length - 1].indentLevel : this.indentSize;
                let statementIndent = Math.max(labelEndColumn + this.indentSize, parentIndent);

                logger.info(`🔹 Formatting non-structure statement '${secondToken.value}' at Line ${index}, indent = ${statementIndent}`);

                formattedLines.push(
                    firstToken.value + " ".repeat(Math.max(0, statementIndent - labelEndColumn)) + trimmedLine.substring(secondToken.start)
                );
                continue;
            }

            formattedLines.push(trimmedLine);
            continue;
        }

        // ✅ Handle Conditional Continuation (ELSE, ELSIF, OF)
        if (firstToken.type === TokenType.ConditionalContinuation) {
            logger.info(`↩️ Reducing indent for '${firstToken.value}' at Line ${index}`);

            if (indentStack.length > 0) {
                let lastIndent = indentStack.pop();
                if (lastIndent) {
                    lineIndent = Math.max(lastIndent.startColumn, this.indentSize);
                }
            }

            // ✅ Restore the indentation for following lines
            indentStack.push({ startColumn: lineIndent, indentLevel: lineIndent + this.indentSize });
        }

        // ✅ Structures without a label before them
        else if (firstToken.type === TokenType.Structure) {
            // ✅ Ignore structures that start and finish on the same line
            if (firstToken.finishesAt !== undefined && firstToken.finishesAt === index) {
                logger.info(`⏩ Skipping inline structure '${firstToken.value}' on Line ${index}`);
                formattedLines.push(" ".repeat(finalIndent) + trimmedLine);
                continue;
            }

            // ✅ Ensure structure indentation respects parent structures
            let parentIndent = indentStack.length > 0 ? indentStack[indentStack.length - 1].indentLevel : this.indentSize;
            let structureIndent = Math.max(parentIndent, firstToken.maxLabelLength + this.indentSize);

            logger.info(`📏 Formatting STRUCTURE '${firstToken.value}' at Line ${index}, indent = ${structureIndent}`);

            // ✅ Store indentation for child elements
            indentStack.push({ startColumn: structureIndent, indentLevel: structureIndent + this.indentSize });

            lineIndent = structureIndent;
        }

        // ✅ Handle END statement (aligns with its structure)
        else if (firstToken.type === TokenType.EndStatement) {
            let lastStructure = indentStack.pop();
            if (lastStructure) {
                lineIndent = lastStructure.startColumn;
                logger.info(`✅ END at Line ${index} aligns with its structure at Column ${lineIndent}`);
            }
        }

        // ✅ Non-structure tokens inside a Structure (e.g., `KEY`, `FIELD`, etc.)
        else {
            if (indentStack.length > 0) {
                // ✅ Indent non-structure elements one level deeper than their parent structure
                let parentIndent = indentStack[indentStack.length - 1].startColumn;
                lineIndent = parentIndent + this.indentSize;
            } else {
                lineIndent = finalIndent;
            }

            logger.info(`🔹 Token '${firstToken.value}' at Line ${index} indented at Column ${lineIndent}`);
        }

        // ✅ Ensure minimum indentation for all non-labels
        lineIndent = Math.max(lineIndent, this.indentSize);

        // ✅ Format the line using the calculated indentation
        let formattedLine = " ".repeat(lineIndent) + trimmedLine;

        if (formattedLine !== originalLine) {
            logger.info(`✅ Formatting changed for Line ${index}: '${originalLine}' → '${formattedLine}'`);
        }

        formattedLines.push(formattedLine);
    }

    logger.info("📐 Structure-based formatting complete.");
    return formattedLines.join("\r\n");
}

    
    
    
    
  
    
    
    /** ✅ Gets the root structure that a given token belongs to */
    private getRootStructure(token: Token): Token | null {
        let current = token;
        while (current.parent) {
            current = current.parent;
        }
        return current;
    }
    
    



   
    
    









    public formatDocument(): string {
        return this.format();
    }
}

export default ClarionFormatter;
