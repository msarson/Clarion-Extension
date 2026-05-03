import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';

interface StructureStackItem {
    token: Token;
    structureType: string;
    line: number;
    column: number;
}

interface ConditionalBlockStackItem {
    token: Token;
    blockType: string;   // 'OMIT' or 'COMPILE'
    terminator: string;  // The terminator string to look for
    line: number;
    column: number;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function requiresTerminator(structureType: string): boolean {
    return [
        'IF', 'LOOP', 'CASE', 'EXECUTE', 'BEGIN',
        'GROUP', 'QUEUE', 'RECORD', 'FILE',
        'CLASS', 'INTERFACE', 'MAP', 'MODULE',
        'WINDOW', 'REPORT', 'APPLICATION',
        'SHEET', 'TAB', 'OLE', 'OPTION', 'MENU', 'MENUBAR', 'TOOLBAR'
    ].includes(structureType);
}

function isSingleLineIfThen(tokens: Token[], ifTokenIndex: number): boolean {
    const ifToken = tokens[ifTokenIndex];
    const ifLine = ifToken.line;

    for (let i = ifTokenIndex + 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.line !== ifLine) break;
        if (token.type === TokenType.Operator && token.value === ';') continue;
        if (token.type === TokenType.Keyword && token.value.toUpperCase() === 'THEN') {
            for (let j = i + 1; j < tokens.length; j++) {
                const nextToken = tokens[j];
                if (nextToken.line !== ifLine) break;
                if (nextToken.type === TokenType.EndStatement && nextToken.value.toUpperCase() === 'END') return true;
                if (nextToken.type === TokenType.EndStatement && nextToken.value === '.') return true;
            }
            return false;
        }
    }
    return false;
}

function createUnterminatedStructureDiagnostic(
    structure: StructureStackItem,
    document: TextDocument
): Diagnostic {
    const line = structure.line;
    const lineText = document.getText({ start: { line, character: 0 }, end: { line, character: 1000 } });
    const keywordIndex = lineText.search(/\S/);
    const startPos = { line, character: keywordIndex >= 0 ? keywordIndex : 0 };
    const endPos = { line, character: startPos.character + structure.token.value.length };
    return {
        severity: DiagnosticSeverity.Error,
        range: { start: startPos, end: endPos },
        message: `${structure.structureType} statement is not terminated with END or .`,
        source: 'clarion'
    };
}

function createUnterminatedConditionalBlockDiagnostic(
    block: ConditionalBlockStackItem,
    document: TextDocument
): Diagnostic {
    const line = block.line;
    const lineText = document.getText({ start: { line, character: 0 }, end: { line, character: 1000 } });
    const keywordIndex = lineText.search(/\S/);
    const startPos = { line, character: keywordIndex >= 0 ? keywordIndex : 0 };
    const endPos = { line, character: startPos.character + block.token.value.length };
    return {
        severity: DiagnosticSeverity.Error,
        range: { start: startPos, end: endPos },
        message: `${block.blockType} block is not terminated with terminator string '${block.terminator}'`,
        source: 'clarion'
    };
}

function getConditionalBlockRanges(tokens: Token[], document: TextDocument): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const blockStack: Array<{ line: number; terminator: string }> = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === TokenType.Directive) {
            const directiveType = token.value.toUpperCase();
            if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                let terminatorString: string | null = null;
                for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                    if (tokens[j].type === TokenType.String) {
                        terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                        break;
                    }
                }
                if (terminatorString) {
                    blockStack.push({ line: token.line, terminator: terminatorString });
                }
            }
        }
    }

    const lineCount = document.lineCount;
    for (const block of blockStack) {
        for (let lineNum = block.line + 1; lineNum < lineCount; lineNum++) {
            const lineText = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: 1000 }
            }).trim();
            if (lineText.includes(block.terminator)) {
                ranges.push({ start: block.line, end: lineNum });
                break;
            }
        }
    }

    return ranges;
}

function isInConditionalBlock(line: number, ranges: Array<{ start: number; end: number }>): boolean {
    return ranges.some(range => line > range.start && line <= range.end);
}

// ─── Exported validation functions ───────────────────────────────────────────

export function validateStructureTerminators(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const conditionalRanges = getConditionalBlockRanges(tokens, document);

    for (const token of tokens) {
        if (isInConditionalBlock(token.line, conditionalRanges)) continue;
        if (token.type !== TokenType.Structure) continue;

        const structureType = token.value.toUpperCase();
        if (!requiresTerminator(structureType)) continue;

        if (structureType === 'IF') {
            const tokenIndex = tokens.indexOf(token);
            if (isSingleLineIfThen(tokens, tokenIndex)) continue;
        }

        if (structureType === 'MODULE') {
            const classOnSameLine = tokens.find(t =>
                t.line === token.line &&
                t.value.toUpperCase() === 'CLASS' &&
                t.type === TokenType.Structure
            );
            if (classOnSameLine) continue;
        }

        if (token.finishesAt === undefined || token.finishesAt === null) {
            diagnostics.push(createUnterminatedStructureDiagnostic(
                { token, structureType, line: token.line, column: token.start },
                document
            ));
        }
    }

    return diagnostics;
}

export function validateConditionalBlocks(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const blockStack: ConditionalBlockStackItem[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Directive) {
            const directiveType = token.value.toUpperCase();
            if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                let terminatorString: string | null = null;
                for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                    if (tokens[j].type === TokenType.String) {
                        terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                        break;
                    }
                }
                if (terminatorString) {
                    blockStack.push({
                        token,
                        blockType: directiveType,
                        terminator: terminatorString,
                        line: token.line,
                        column: token.start
                    });
                }
            }
        }

        if (blockStack.length > 0) {
            const shouldCheckLine = i === 0 || tokens[i - 1].line !== token.line;
            if (shouldCheckLine) {
                const lineText = document.getText({
                    start: { line: token.line, character: 0 },
                    end: { line: token.line, character: 1000 }
                }).trim();

                for (let b = blockStack.length - 1; b >= 0; b--) {
                    const block = blockStack[b];
                    if (token.line === block.line) {
                        const fullLineText = document.getText({
                            start: { line: block.line, character: 0 },
                            end: { line: block.line, character: 1000 }
                        });
                        const directiveSubstring = fullLineText.substring(block.column);
                        const parenClose = directiveSubstring.indexOf(')');
                        if (parenClose !== -1) {
                            const lineAfterDirective = fullLineText.substring(block.column + parenClose + 1);
                            if (lineAfterDirective.includes(block.terminator)) {
                                blockStack.splice(b, 1);
                                break;
                            }
                        }
                        continue;
                    }
                    if (lineText.includes(block.terminator)) {
                        blockStack.splice(b, 1);
                        break;
                    }
                }
            }
        }
    }

    // Also check lines that have no tokens (e.g. comment-only lines with "***")
    if (blockStack.length > 0) {
        const lineCount = document.lineCount;
        for (let lineNum = 0; lineNum < lineCount; lineNum++) {
            const lineText = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: 1000 }
            }).trim();

            for (let b = blockStack.length - 1; b >= 0; b--) {
                const block = blockStack[b];
                if (lineNum < block.line) continue;
                if (lineNum === block.line) {
                    const fullLineText = document.getText({
                        start: { line: block.line, character: 0 },
                        end: { line: block.line, character: 1000 }
                    });
                    const directiveSubstring = fullLineText.substring(block.column);
                    const parenClose = directiveSubstring.indexOf(')');
                    if (parenClose !== -1) {
                        const lineAfterDirective = fullLineText.substring(block.column + parenClose + 1);
                        if (!lineAfterDirective.includes(block.terminator)) continue;
                    } else {
                        continue;
                    }
                }
                if (lineText.includes(block.terminator)) {
                    blockStack.splice(b, 1);
                    break;
                }
            }

            if (blockStack.length === 0) break;
        }
    }

    for (const block of blockStack) {
        diagnostics.push(createUnterminatedConditionalBlockDiagnostic(block, document));
    }

    return diagnostics;
}

export function validateFileStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const conditionalRanges = getConditionalBlockRanges(tokens, document);

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (isInConditionalBlock(token.line, conditionalRanges)) continue;

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'FILE') {
            // RECORD presence comes from the parent-child tree (token.children, populated
            // during DocumentStructure.process()). The flagged RECORD child is the only
            // place we ever cared about — no need to re-walk for it.
            const hasRecord = (token.children ?? []).some(c => c.isFileRecord === true);

            // DRIVER is an attribute, not a child structure, so we still need a forward
            // scan for it. Tightened to stop at the FILE declaration line's end, since
            // DRIVER must appear on the same logical line as the FILE keyword (with line
            // continuation tolerated by virtue of the token stream already being flat).
            let hasDriver = false;
            for (let j = i + 1; j < tokens.length; j++) {
                const nextToken = tokens[j];
                const upperValue = nextToken.value.toUpperCase();

                if (upperValue === 'DRIVER') { hasDriver = true; break; }

                if (upperValue === 'END' && nextToken.type === TokenType.EndStatement) break;
                if (nextToken.type === TokenType.Structure && nextToken.start === 0 && nextToken.line > token.line) break;
            }

            if (!hasDriver) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: token.line, character: token.start },
                        end: { line: token.line, character: token.start + token.value.length }
                    },
                    message: 'FILE declaration missing required DRIVER attribute',
                    source: 'clarion'
                });
            }

            if (!hasRecord) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: token.line, character: token.start },
                        end: { line: token.line, character: token.start + token.value.length }
                    },
                    message: 'FILE declaration missing required RECORD section',
                    source: 'clarion'
                });
            }
        }
    }

    return diagnostics;
}

export function validateCaseStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CASE') {
            let hasOf = false;
            let lastOfIndex = -1;

            for (let j = i + 1; j < tokens.length; j++) {
                const nextToken = tokens[j];
                const upperValue = nextToken.value.toUpperCase();

                if (upperValue === 'OF') {
                    hasOf = true;
                    lastOfIndex = j;
                }

                if (upperValue === 'OROF') {
                    if (!hasOf || lastOfIndex === -1) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: { line: nextToken.line, character: nextToken.start },
                                end: { line: nextToken.line, character: nextToken.start + nextToken.value.length }
                            },
                            message: 'OROF must be preceded by an OF clause in CASE structure',
                            source: 'clarion'
                        });
                    }
                }

                if (upperValue === 'END' && nextToken.type === TokenType.EndStatement) break;
                if (nextToken.type === TokenType.Structure && nextToken.line > token.line) break;
            }
        }
    }

    return diagnostics;
}

export function validateExecuteStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'EXECUTE') {
            const expressionToken = i + 1 < tokens.length ? tokens[i + 1] : null;
            if (expressionToken) {
                const expValue = expressionToken.value;
                if (expValue.startsWith("'") || expValue.startsWith('"')) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: { line: expressionToken.line, character: expressionToken.start },
                            end: { line: expressionToken.line, character: expressionToken.start + expValue.length }
                        },
                        message: 'EXECUTE expression should evaluate to a numeric value (found string literal)',
                        source: 'clarion'
                    });
                }
            }
        }
    }

    return diagnostics;
}
