import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';

/**
 * Keywords that are fully reserved in Clarion — they may NOT be used as a label
 * for any purpose (variable, structure, or procedure).
 * Source: Clarion Language Reference, "Reserved Words" table.
 * Note: THROW, TRY, CATCH, FINALLY are Clarion.NET (Clarion#) keywords only — they
 * appear in the reserved words list in error. The Win32 Clarion compiler allows them
 * as labels (SoftVelocity's own ABFile.inc uses Throw as a CLASS method). Omitted.
 */
const FULLY_RESERVED = new Set([
    'ACCEPT', 'AND', 'ASSERT', 'BEGIN', 'BREAK', 'BY',
    'CASE', 'CHOOSE', 'COMPILE', 'CONST',
    'CYCLE', 'DO', 'ELSE', 'ELSIF', 'END',
    'EXECUTE', 'EXIT', 'FUNCTION', 'GOTO', 'IF',
    'INCLUDE', 'LOOP', 'MEMBER', 'NEW', 'NOT', 'NULL',
    'OF', 'OMIT', 'OR', 'OROF', 'PRAGMA', 'PROCEDURE',
    'PROGRAM', 'RETURN', 'ROUTINE', 'SECTION', 'THEN',
    'TIMES', 'TO', 'UNTIL', 'WHILE', 'XOR',
]);

/**
 * Keywords that may be labels for data structures or executable statements,
 * but NOT for PROCEDURE or FUNCTION declarations.
 * Source: Clarion Language Reference, "Reserved Words" table.
 *
 * CODE and DATA are execution-marker keywords — valid standalone at col 0,
 * and valid as method/field names inside a structure (e.g. CLASS), but
 * invalid as the label of a global PROCEDURE/FUNCTION declaration.
 */
const STRUCTURE_ONLY = new Set([
    'APPLICATION', 'CLASS', 'CODE', 'DATA', 'DETAIL', 'FILE', 'FOOTER',
    'FORM', 'GROUP', 'HEADER', 'ITEM', 'ITEMIZE',
    'JOIN', 'MAP', 'MENU', 'MENUBAR', 'MODULE',
    'OLE', 'OPTION', 'QUEUE', 'PARENT', 'RECORD',
    'REPORT', 'SELF', 'SHEET', 'TAB', 'TOOLBAR',
    'VIEW', 'WINDOW',
]);

/**
 * Validates that Clarion reserved keywords are not used as labels.
 *
 * Two cases are checked:
 *  1. A Label token whose value is fully reserved → always an error,
 *     UNLESS the label appears inside a structure (CLASS/GROUP/QUEUE etc.),
 *     where keywords are valid as field or method names.
 *  2. A Label token whose value is structure-only AND the next token on the
 *     same line is PROCEDURE or FUNCTION → error, UNLESS the label is inside
 *     a structure definition (e.g. a method declaration inside CLASS).
 *
 * Closes #69
 */
export function validateReservedKeywordLabels(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== TokenType.Label) continue;

        const upper = token.value.toUpperCase();

        // #372: a reserved word used as the PREFIX of a colon-qualified label
        // (e.g. `Return:NotSet EQUATE(0)`) is a valid label — the keyword is a
        // qualifier, not a standalone label. A keyword-colliding prefix tokenizes
        // as a bare keyword Label immediately followed by ':', so skip any reserved
        // Label whose next source character is ':'.
        if (isColonQualifiedPrefix(token, document)) continue;

        if (FULLY_RESERVED.has(upper)) {
            // Reserved words are valid as field names and method names inside structures
            // (e.g. `Code LONG` inside GROUP, or `Code PROCEDURE()` inside CLASS)
            if (findEnclosingStructure(tokens, i)) continue;
            diagnostics.push(makeDiagnostic(
                token,
                `'${token.value}' is a reserved keyword and cannot be used as a label.`
            ));
            continue;
        }

        if (STRUCTURE_ONLY.has(upper)) {
            // Find the next non-Comment token on the same line
            const nextToken = findNextOnLine(tokens, i + 1, token.line);
            if (nextToken && isProcedureKeyword(nextToken)) {
                // Structure keywords are valid method names inside CLASS/INTERFACE
                // (e.g. `Join PROCEDURE()` inside a CLASS)
                if (findEnclosingStructure(tokens, i)) continue;
                diagnostics.push(makeDiagnostic(
                    token,
                    `'${token.value}' cannot be the label of a PROCEDURE or FUNCTION declaration.`
                ));
            }
        }
    }

    return diagnostics;
}

/**
 * True when this token is the prefix segment of a colon-qualified label — i.e.
 * the next source character after the token is ':'. A reserved keyword in that
 * position (e.g. `Return` in `Return:NotSet`) is a valid label qualifier, not a
 * standalone label. (#372 — a keyword-colliding prefix tokenizes as a bare
 * keyword Label + ':' rather than a single `prefix:suffix` Label, so this reads
 * the source directly instead of relying on adjacent-token shape.)
 */
function isColonQualifiedPrefix(token: Token, document: TextDocument): boolean {
    const after = token.start + token.value.length;
    const nextChar = document.getText({
        start: { line: token.line, character: after },
        end: { line: token.line, character: after + 1 },
    });
    return nextChar === ':';
}

function findNextOnLine(tokens: Token[], from: number, line: number): Token | undefined {
    for (let i = from; i < tokens.length; i++) {
        if (tokens[i].line !== line) return undefined;
        if (tokens[i].type !== TokenType.Comment) return tokens[i];
    }
    return undefined;
}

/**
 * Scans backward from labelIndex to find the innermost open Structure token
 * that contains the label's line. Uses finishesAt to determine if a structure
 * is still open at the label's position.
 */
function findEnclosingStructure(tokens: Token[], labelIndex: number): Token | undefined {
    const labelLine = tokens[labelIndex].line;
    for (let j = labelIndex - 1; j >= 0; j--) {
        const t = tokens[j];
        if (t.type !== TokenType.Structure) continue;
        // finishesAt undefined means the structure hasn't been closed yet
        if (t.finishesAt === undefined || t.finishesAt >= labelLine) {
            return t;
        }
        // This structure closed before our label — keep scanning outward
    }
    return undefined;
}

function isProcedureKeyword(token: Token): boolean {
    const v = token.value.toUpperCase();
    return v === 'PROCEDURE' || v === 'FUNCTION';
}

function makeDiagnostic(token: Token, message: string): Diagnostic {
    return {
        severity: DiagnosticSeverity.Error,
        range: {
            start: { line: token.line, character: token.start },
            end: { line: token.line, character: token.start + token.value.length },
        },
        message,
        source: 'clarion',
    };
}
