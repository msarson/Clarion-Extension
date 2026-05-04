import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { ViewDescriptorParser } from '../../tokenizer/ViewDescriptorParser';

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

    // Reads `branches[]` populated by Gap G's `populateBranches` pass on each CASE
    // structure. The pass already filters out branches that belong to nested
    // CASE/IF blocks, so OROF-without-preceding-OF detection becomes a simple
    // ordering check on the array.
    for (const token of tokens) {
        if (token.type !== TokenType.Structure) continue;
        if (token.value.toUpperCase() !== 'CASE') continue;
        const branches = token.branches;
        if (!branches || branches.length === 0) continue;

        let sawOf = false;
        for (const branch of branches) {
            if (branch.kind === 'OF') {
                sawOf = true;
            } else if (branch.kind === 'OROF' && !sawOf) {
                const kw = branch.keywordToken;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: kw.line, character: kw.start },
                        end: { line: kw.line, character: kw.start + kw.value.length },
                    },
                    message: 'OROF must be preceded by an OF clause in CASE structure',
                    source: 'clarion'
                });
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

/**
 * Warns when a `VIEW(File)` structure has a `PROJECT(field)` clause naming a
 * field that doesn't exist on the FROM file's RECORD.
 *
 * v1: single-document only. When the FROM file is declared in another file
 * (the typical SV AppGen pattern) the validator skips silently — cross-file
 * resolution is a follow-up. Built on the existing `ViewDescriptorParser`
 * (Gap L) and the `isFileRecord` parent-child marker (Gap M).
 *
 * Gap L follow-up; closes the validation half of issue #7dedd7c8.
 */
export function validateViewProjectFields(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Index in-document FILE structures by their label (uppercase).
    const filesByName = new Map<string, Token>();
    for (const t of tokens) {
        if (t.type === TokenType.Structure && t.value.toUpperCase() === 'FILE' && t.label) {
            filesByName.set(t.label.toUpperCase(), t);
        }
    }
    if (filesByName.size === 0) return diagnostics;

    for (const view of tokens) {
        if (view.type !== TokenType.Structure) continue;
        if (view.value.toUpperCase() !== 'VIEW') continue;
        if (view.finishesAt === undefined) continue;

        // Reconstruct header (VIEW opener line) and body (lines strictly between
        // the opener and END) from the document text — same shape the parser was
        // designed for in DocumentStructure.populateViewDescriptors.
        const headerText = document.getText({
            start: { line: view.line, character: 0 },
            end: { line: view.line + 1, character: 0 }
        });
        const bodyText = view.finishesAt > view.line
            ? document.getText({
                start: { line: view.line + 1, character: 0 },
                end: { line: view.finishesAt, character: 0 }
            })
            : '';

        const desc = ViewDescriptorParser.parse(headerText, bodyText);
        if (!desc.from || desc.projectedFields.length === 0) continue;

        const file = filesByName.get(desc.from.toUpperCase());
        if (!file) continue; // FROM declared in another file — v2 follow-up

        const record = file.children?.find(c => c.isFileRecord === true);
        if (!record) continue; // FILE missing RECORD is reported by validateFileStructures

        // Build the set of valid field names — both bare (Id) and prefix-form
        // (Cus:Id) so PROJECT can address either, matching how the field is
        // typed at the call site (TokenType.Variable / Label / StructurePrefix).
        const validFields = new Set<string>();
        for (const child of record.children ?? []) {
            if (child.type !== TokenType.Label) continue;
            validFields.add(child.value.toUpperCase());
            if (child.structurePrefix) {
                validFields.add(`${child.structurePrefix.toUpperCase()}:${child.value.toUpperCase()}`);
            }
        }
        if (validFields.size === 0) continue;

        for (const fieldToken of collectProjectFieldTokens(tokens, view)) {
            const value = fieldToken.value.toUpperCase();
            if (validFields.has(value)) continue;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: fieldToken.line, character: fieldToken.start },
                    end: { line: fieldToken.line, character: fieldToken.start + fieldToken.value.length }
                },
                message: `'${fieldToken.value}' is not a field on FILE '${file.label}'.`,
                source: 'clarion'
            });
        }
    }

    return diagnostics;
}

/**
 * Walks the body of a VIEW structure and returns every name token that sits
 * inside a PROJECT(...) argument list. Used by validateViewProjectFields to
 * place diagnostic ranges on the offending field token (not the PROJECT
 * keyword) and to ignore non-PROJECT references inside JOIN clauses.
 */
function collectProjectFieldTokens(tokens: Token[], view: Token): Token[] {
    const result: Token[] = [];
    if (view.finishesAt === undefined) return result;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.line <= view.line || t.line >= view.finishesAt) continue;
        if (t.value.toUpperCase() !== 'PROJECT') continue;

        let j = i + 1;
        if (j >= tokens.length || tokens[j].value !== '(') continue;
        j++;
        let depth = 1;
        while (j < tokens.length && depth > 0) {
            const inner = tokens[j];
            if (inner.value === '(') {
                depth++;
            } else if (inner.value === ')') {
                depth--;
                if (depth === 0) break;
            } else if (inner.value !== ',' && inner.type !== TokenType.Comment) {
                if (
                    inner.type === TokenType.StructurePrefix ||
                    inner.type === TokenType.Variable ||
                    inner.type === TokenType.Label ||
                    inner.type === TokenType.StructureField
                ) {
                    result.push(inner);
                }
            }
            j++;
        }
    }
    return result;
}
