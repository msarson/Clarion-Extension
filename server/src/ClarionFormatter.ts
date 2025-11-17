import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";
import { FormattingOptions } from 'vscode-languageserver';

type StructureToken = Token & {
    type: TokenType.Structure;
};

const logger = LoggerManager.getLogger("Formatter");
logger.setLevel("error");

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

        // Check if input text contains tabs
        if (text.includes('\t')) {
            logger.warn('⚠️ Input text contains tabs. This may cause alignment issues if token.start values are tab-aware.');
        }

        this.identifyExecutionRanges();
        this.identifyLabelLines();
        this.detectMisplacedLabels(); // 🚀 NEW FUNCTION HERE
        // this.calculateIndentation();
    }

    /**
     * Expands tabs to spaces in a string
     * @param text The text to expand tabs in
     * @param tabSize The size of a tab in spaces
     * @returns The text with tabs expanded to spaces
     */
    private expandTabs(text: string, tabSize: number = this.indentSize): string {
        return text.replace(/\t/g, ' '.repeat(tabSize));
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

        // 0-based snap to VS Code tab grid (0,4,8,... for indentSize=4)
        const snap0 = (col0: number) =>
          col0 + ((this.indentSize - (col0 % this.indentSize)) % this.indentSize);

        // Render helper: produce spaces so the next char is at 0-based column col0
        const padToCol0 = (col0: number) => " ".repeat(Math.max(0, col0));

        let indentStack: { startColumn: number; indentLevel: number }[] = [];
        let finalIndent = this.indentSize; // 🔹 Minimum indent size

        const formattedLines: string[] = [];

        for (let index = 0; index < this.lines.length; index++) {
            const originalLine = this.lines[index];
            
            // Check if line contains tabs and log a warning
            if (originalLine.includes('\t')) {
                logger.warn(`⚠️ Line ${index} contains tabs. This may cause alignment issues.`);
                logger.info(`Original line with tabs: "${originalLine.replace(/\t/g, '\\t')}"`);
            }
            
            // Trim both leading and trailing spaces to avoid preserving trailing spaces
            const trimmedLine = originalLine.trim();
            if (trimmedLine.length === 0) {
                formattedLines.push("");
                continue;
            }
            
            // For logging purposes, also track the left-trimmed version to maintain token positions
            const leftTrimmedLine = originalLine.trimLeft();

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

            if (firstToken.type === TokenType.Label) {
              logger.info(`📌 Keeping label '${firstToken.value}' at column 0 on Line ${index}`);

              // 0-based label positions
              const labelStart0 = firstToken.start;                              // 0-based
              const labelEnd0   = labelStart0 + firstToken.value.length;         // 0-based

              const parentCol0  = indentStack.length
                ? indentStack[indentStack.length - 1].indentLevel                // 0-based
                : this.indentSize;                                               // minimum 0-based indent

              if (secondToken?.type === TokenType.Structure) {
                // Require a full indent gap after label, then snap to grid
                const minAfterLabel0   = labelEnd0 + this.indentSize;            // e.g., 24 + 4 = 28
                const nextGridAfterLbl = snap0(minAfterLabel0);                  // e.g., -> 28

                // If maxLabelLength policy is present, snap that too (+indentSize if desired)
                const maxLabelTarget0 = (secondToken as any).maxLabelLength
                  ? snap0((secondToken as any).maxLabelLength + this.indentSize)
                  : nextGridAfterLbl;

                const structureCol0 = Math.max(nextGridAfterLbl, maxLabelTarget0, parentCol0); // 0-based

                // Push EXACT opener column (0-based); children will use +indentSize, END will pop to this
                indentStack.push({ startColumn: structureCol0, indentLevel: structureCol0 + this.indentSize });
                logger.info(`labelEnd0 = ${labelEnd0} - structureCol0 = ${structureCol0}`);
                const spacesToAdd = Math.max(0, structureCol0 - labelEnd0);      // 0-based delta from label end
                logger.info(`➡️ Aligning structure '${secondToken.value}' after label '${firstToken.value}' at Column ${structureCol0} on Line ${index}`);
                const formattedLine =
                  firstToken.value +
                  " ".repeat(spacesToAdd) +
                  originalLine.substring(secondToken.start); // token.start is 0-based index into original
                logger.info(`Formatted Line ${index}: "${formattedLine}"`);
                formattedLines.push(formattedLine);
                continue;
              }

              if (secondToken && !this.isStructure(secondToken)) {
                // Non-structure after label: align to the same grid column policy
                const stmtCol0    = Math.max(snap0(labelEnd0 + this.indentSize), parentCol0);
                const spacesToAdd = Math.max(0, stmtCol0 - labelEnd0);
                logger.info(`➡️ Aligning statement '${secondToken.value}' after label '${firstToken.value}' at Column ${stmtCol0} on Line ${index}`);
                const formattedLine =
                  firstToken.value +
                  " ".repeat(spacesToAdd) +
                  originalLine.substring(secondToken.start);

                formattedLines.push(formattedLine);
                continue;
              }

              // Label-only line: keep as trimmed (no trailing spaces)
              formattedLines.push(originalLine.trim());
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

            else if (firstToken.type === TokenType.Structure) {
              if (firstToken.finishesAt !== undefined && firstToken.finishesAt === index) {
                logger.info(`⏩ Skipping inline structure '${firstToken.value}' on Line ${index}`);
                formattedLines.push(padToCol0(this.indentSize) + originalLine.trim()); // minimal indent
                continue;
              }

              const parentCol0 = indentStack.length
                ? indentStack[indentStack.length - 1].indentLevel
                : this.indentSize;

              // Align unlabeled structure to a grid target (e.g. after global longest label, if provided)
              const targetCol0 = firstToken.maxLabelLength
                ? snap0(firstToken.maxLabelLength + this.indentSize)
                : parentCol0;

              const structureCol0 = Math.max(parentCol0, targetCol0);

              indentStack.push({ startColumn: structureCol0, indentLevel: structureCol0 + this.indentSize });
              lineIndent = structureCol0; // 0-based
            }

            else if (firstToken.type === TokenType.EndStatement) {
              const last = indentStack.pop();
              if (last) {
                lineIndent = last.startColumn; // 0-based; END aligns with opener
                logger.info(`✅ END at Line ${index} aligns with opener at column ${lineIndent}`);
              }
            }

            else {
              if (indentStack.length > 0) {
                const parentCol0 = indentStack[indentStack.length - 1].startColumn; // 0-based
                lineIndent = parentCol0 + this.indentSize;                          // 0-based child column
                logger.info(`🔍 Child '${firstToken.value}' at column ${lineIndent} (parent ${parentCol0} + ${this.indentSize})`);
              } else {
                lineIndent = this.indentSize; // minimal 0-based indent
              }
            }

            lineIndent = Math.max(lineIndent, this.indentSize); // still 0-based
            const formattedLine = padToCol0(lineIndent) + originalLine.trim();
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
