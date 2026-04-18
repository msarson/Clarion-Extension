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
    private executionRanges: { startsAt: number; finishesAt: number }[] = [];
    private localDataSections: Map<number, { startLine: number; endLine: number; maxLabelLength: number }> = new Map();
    private tokensByLine: Map<number, Token[]> = new Map();

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

        if (text.includes('\t')) {
            logger.warn('⚠️ Input text contains tabs. This may cause alignment issues if token.start values are tab-aware.');
        }

        this.buildTokensByLine();
        this.identifyExecutionRanges();
        this.identifyLocalDataSections();
    }

    private buildTokensByLine(): void {
        for (const token of this.tokens) {
            let list = this.tokensByLine.get(token.line);
            if (!list) {
                list = [];
                this.tokensByLine.set(token.line, list);
            }
            list.push(token);
        }
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
            if (token.type === TokenType.Procedure || token.subType === TokenType.Routine) {
                const executionStart = token.executionMarker ? token.executionMarker.line + 1 : token.line + 1;
                this.executionRanges.push({
                    startsAt: executionStart,
                    finishesAt: token.finishesAt ?? this.tokens[this.tokens.length - 1]?.line ?? 0
                });
            }
        }
    }
    private identifyLocalDataSections(): void {
        for (const token of this.tokens) {
            if (token.type === TokenType.Procedure || token.subType === TokenType.Routine) {
                if (token.executionMarker) {
                    const startLine = token.line + 1;
                    const endLine = token.executionMarker.line - 1;

                    if (endLine >= startLine) {
                        let maxLabelLength = 0;
                        for (let ln = startLine; ln <= endLine; ln++) {
                            const lineTokens = this.tokensByLine.get(ln);
                            if (!lineTokens) continue;
                            const first = lineTokens[0];
                            if (first && (first.type === TokenType.Label || first.type === TokenType.Variable) && first.start === 0) {
                                maxLabelLength = Math.max(maxLabelLength, first.value.length);
                            }
                        }

                        if (maxLabelLength > 0) {
                            this.localDataSections.set(token.line, { startLine, endLine, maxLabelLength });
                        }
                    }
                }
            }
        }
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
            
            // Check if we're in a local data section
            let inLocalDataSection = false;
            let localDataMaxLabel = 0;
            for (const [procLine, section] of this.localDataSections) {
                if (index >= section.startLine && index <= section.endLine) {
                    inLocalDataSection = true;
                    localDataMaxLabel = section.maxLabelLength;
                    break;
                }
            }
            
            // ✅ Get tokens for this line
            const tokensOnLine = this.tokensByLine.get(index) ?? [];
            if (tokensOnLine.length === 0) {
                formattedLines.push(" ".repeat(finalIndent) + trimmedLine);
                continue;
            }

            // ✅ Identify first and second tokens
            const firstToken = tokensOnLine[0];
            const secondToken = tokensOnLine.length > 1 ? tokensOnLine[1] : null;

            let lineIndent = finalIndent;
            
            // ✅ Handle local data section alignment
            if (inLocalDataSection && (firstToken.type === TokenType.Label || firstToken.type === TokenType.Variable)) {
                logger.info(`📋 Formatting local data variable '${firstToken.value}' at line ${index}`);
                
                const labelEnd0 = firstToken.value.length;
                const alignCol0 = snap0(localDataMaxLabel + 1); // Align to next tab stop after longest label
                const spacesToAdd = Math.max(1, alignCol0 - labelEnd0); // At least 1 space
                
                const restOfLine = originalLine.substring(firstToken.start + firstToken.value.length).trimLeft();
                const formattedLine = firstToken.value + " ".repeat(spacesToAdd) + restOfLine;
                
                logger.info(`  Label: '${firstToken.value}' (${labelEnd0} chars), align to col ${alignCol0}, spaces: ${spacesToAdd}`);
                formattedLines.push(formattedLine);
                continue;
            }

            if (firstToken.type === TokenType.Label) {
              logger.info(`📌 Keeping label '${firstToken.value}' at column 0 on Line ${index}`);

              // Find the first token that is not a Label or Variable — this is the actual
              // type/keyword/procedure token. This handles method implementations like
              // "ThisWindow.Init PROCEDURE()" where the tokenizer emits a separate token
              // for "Init" between the Label and the PROCEDURE keyword.
              const contentToken = tokensOnLine.slice(1).find(t =>
                t.type !== TokenType.Label && t.type !== TokenType.Variable
              ) ?? secondToken;

              // Full label text from the original line (preserves dot notation etc.)
              const labelText = contentToken
                ? originalLine.substring(firstToken.start, contentToken.start).trimEnd()
                : firstToken.value;
              const labelStart0 = firstToken.start;
              const labelEnd0   = labelStart0 + labelText.length;

              const parentCol0  = indentStack.length
                ? indentStack[indentStack.length - 1].indentLevel
                : this.indentSize;

              if (contentToken?.type === TokenType.Structure) {
                // Require a full indent gap after label, then snap to grid
                const minAfterLabel0   = labelEnd0 + this.indentSize;
                const nextGridAfterLbl = snap0(minAfterLabel0);

                const maxLabelTarget0 = (contentToken as any).maxLabelLength
                  ? snap0((contentToken as any).maxLabelLength + this.indentSize)
                  : nextGridAfterLbl;

                const structureCol0 = Math.max(nextGridAfterLbl, maxLabelTarget0, parentCol0);

                indentStack.push({ startColumn: structureCol0, indentLevel: structureCol0 + this.indentSize });
                logger.info(`labelEnd0 = ${labelEnd0} - structureCol0 = ${structureCol0}`);
                const spacesToAdd = Math.max(0, structureCol0 - labelEnd0);
                logger.info(`➡️ Aligning structure '${contentToken.value}' after label '${labelText}' at Column ${structureCol0} on Line ${index}`);
                const formattedLine =
                  labelText +
                  " ".repeat(spacesToAdd) +
                  originalLine.substring(contentToken.start);
                logger.info(`Formatted Line ${index}: "${formattedLine}"`);
                formattedLines.push(formattedLine);
                continue;
              }

              if (contentToken && contentToken !== secondToken) {
                // There were intermediate tokens (e.g. "Init" in "ThisWindow.Init PROCEDURE()").
                // Output the full label text + aligned content token.
                const stmtCol0    = Math.max(snap0(labelEnd0 + this.indentSize), parentCol0);
                const spacesToAdd = Math.max(0, stmtCol0 - labelEnd0);
                const formattedLine =
                  labelText +
                  " ".repeat(spacesToAdd) +
                  originalLine.substring(contentToken.start);
                formattedLines.push(formattedLine);
                continue;
              }

              if (secondToken && !this.isStructure(secondToken)) {
                // Non-structure after label: align to the same grid column policy
                const stmtCol0    = Math.max(snap0(labelEnd0 + this.indentSize), parentCol0);
                const spacesToAdd = Math.max(0, stmtCol0 - labelEnd0);
                logger.info(`➡️ Aligning statement '${secondToken.value}' after label '${labelText}' at Column ${stmtCol0} on Line ${index}`);
                const formattedLine =
                  labelText +
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
                // Bug 2 fix: use current stack indent level, not hardcoded minimum
                const currentIndent = indentStack.length ? indentStack[indentStack.length - 1].indentLevel : this.indentSize;
                formattedLines.push(padToCol0(currentIndent) + originalLine.trim());
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
        // Bug 3 fix: detect input EOL and use it for output
        const eol = this.text.includes('\r\n') ? '\r\n' : '\n';
        return formattedLines.join(eol);
    }

    public formatDocument(): string {
        return this.format();
    }
}

export default ClarionFormatter;
