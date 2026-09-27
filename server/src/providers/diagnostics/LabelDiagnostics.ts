import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';

/**
 * #701 — the words that cannot be a label, as the compiler decides it, not the Language
 * Reference. `test-programs/ReservedWordsTest` builds every word of the help's Reserved Words
 * tables in each place a label can go (global and local data, GROUP field, CLASS property and
 * method, global PROCEDURE, ROUTINE, statement label, parameter, method parameter and local), on
 * Clarion 10 and 12 with identical results:
 *
 *  - these 44 are rejected in every one of those places; as a parameter name each builds alone
 *    or as the last parameter and fails when another parameter follows it (parameters are not
 *    Label tokens, so neither case is checked here);
 *  - the help's first table also lists CODE, DATA, NULL and THROW, which build everywhere;
 *  - CATCH, FINALLY and TRY are reserved in Win32 Clarion too (they were once omitted here as
 *    Clarion.NET-only);
 *  - the help's second table ("may not be the label of any PROCEDURE statement": WINDOW, CLASS,
 *    QUEUE, SELF, PARENT, ...) is not enforced by either compiler: all 27 build as a PROCEDURE's
 *    label, a method, a field and a method's parameter or local, so nothing is reported for them.
 */
const RESERVED = new Set([
    'ACCEPT', 'AND', 'ASSERT', 'BEGIN', 'BREAK', 'BY',
    'CASE', 'CATCH', 'CHOOSE', 'COMPILE', 'CONST',
    'CYCLE', 'DO', 'ELSE', 'ELSIF', 'END',
    'EXECUTE', 'EXIT', 'FINALLY', 'FUNCTION', 'GOTO', 'IF',
    'INCLUDE', 'LOOP', 'MEMBER', 'NEW', 'NOT',
    'OF', 'OMIT', 'OR', 'OROF', 'PRAGMA', 'PROCEDURE',
    'PROGRAM', 'RETURN', 'ROUTINE', 'SECTION', 'THEN',
    'TIMES', 'TO', 'TRY', 'UNTIL', 'WHILE', 'XOR',
]);

/**
 * What makes a column-1 word a label: a declaration follows it — a data type, a structure, a
 * PROCEDURE / FUNCTION / ROUTINE, an EQUATE, LIKE or a `&` reference. A reserved word that
 * STARTS a statement may stand in column 1 (compiler-verified on Clarion 10 and 12: `OF 1`,
 * `IF X = 1`, `END`, `LOOP`, `ELSE`, `RETURN`, `CODE` all build there), and the tokenizer still
 * calls it a Label, so without this every such line was reported. A reserved word declaring a
 * variable of a user-defined type (`If MyType`) is not recognised; no report is better than a
 * wrong one.
 */
const DECLARATION = /^\s+(?:&|(?:BYTE|SHORT|USHORT|LONG|ULONG|SIGNED|UNSIGNED|REAL|SREAL|DECIMAL|PDECIMAL|STRING|CSTRING|PSTRING|ASTRING|BSTRING|USTRING|DATE|TIME|BOOL|ANY|LIKE|BLOB|MEMO|GROUP|QUEUE|CLASS|INTERFACE|FILE|RECORD|KEY|INDEX|VIEW|WINDOW|REPORT|APPLICATION|ITEMIZE|EQUATE|PROCEDURE|FUNCTION|ROUTINE)\b)/i;

/**
 * Validates that Clarion reserved keywords are not used as labels (#69): a reserved word
 * declaring something is an error wherever it stands, inside a structure (a GROUP field, a CLASS
 * method) as much as outside it (#701).
 */
export function validateReservedKeywordLabels(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== TokenType.Label) continue;

        // #372: a reserved word used as the PREFIX of a colon-qualified label
        // (e.g. `Return:NotSet EQUATE(0)`) is a valid label — the keyword is a
        // qualifier, not a standalone label. A keyword-colliding prefix tokenizes
        // as a bare keyword Label immediately followed by ':', so skip any reserved
        // Label whose next source character is ':'.
        if (isColonQualifiedPrefix(token, document)) continue;

        if (RESERVED.has(token.value.toUpperCase()) && declares(token, document)) {
            diagnostics.push(makeDiagnostic(
                token,
                `'${token.value}' is a reserved keyword and cannot be used as a label.`
            ));
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

/** True when a declaration follows the label on its line (see DECLARATION). */
function declares(token: Token, document: TextDocument): boolean {
    const rest = document.getText({
        start: { line: token.line, character: token.start + token.value.length },
        end: { line: token.line + 1, character: 0 },
    });
    return DECLARATION.test(rest);
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
