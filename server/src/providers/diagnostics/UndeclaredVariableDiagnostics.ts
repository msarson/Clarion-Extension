import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger('UndeclaredVariableDiagnostics');
// Default to error so the per-call breadcrumb stays quiet; users diagnosing
// "isn't firing?" reports can crank the Clarion log level to info to surface
// the `[#62]` trace below.
logger.setLevel('error');

/**
 * Issue #62 v1 — opt-in diagnostic for assignments whose LEFT-HAND SIDE is an
 * identifier that doesn't resolve to any declaration in the current file.
 *
 * Conservative by design: false-positive trust is critical for diagnostics.
 * v1 only checks bare-identifier LHS of assignments — prefixed (`Cus:Field`),
 * dotted (`obj.member`), indexed (`arr[i]`), and field-equate (`?Ctrl`) forms
 * are intentionally left untouched. Cross-file global resolution is also out
 * of scope; if a name isn't declared in the current document the diagnostic
 * fires, so users with cross-file globals should keep the feature off.
 *
 * Resolution: a name is considered declared when it appears anywhere in this
 * file as a `TokenType.Label`, or as a `TokenType.Variable` outside any CODE
 * section (covering procedure parameters and structure-shape declarations).
 * Built-in Clarion identifiers (SELF, PARENT, RECORDS, ERRORCODE, …) are
 * always treated as declared.
 *
 * Gate: `serverSettings.undeclaredVariablesEnabled`. Caller short-circuits.
 */

// Augmented-assignment leaders. Clarion tokenises `+=` as two adjacent
// Operator tokens `+` then `=`; we accept these by peeking past the leader.
const COMPOUND_LEADERS = new Set(['+', '-', '*', '/', '&', '%']);

// Identifiers that the runtime / language always provides — never warn on
// these even if the document doesn't declare them locally.
const BUILT_IN_IDENTIFIERS = new Set([
    'SELF', 'PARENT', 'NULL', 'TRUE', 'FALSE',
    'RECORDS', 'ERRORCODE', 'ERROR', 'ERRORFILE', 'ERRORLINE',
    'POINTER', 'POSITION', 'SIZE',
]);

interface ScopeRange {
    /** Line of the procedure's CODE / DATA execution marker. */
    codeStart: number;
    /** Line where the procedure / routine ends. */
    end: number;
}

export function validateUndeclaredVariables(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    if (tokens.length === 0) return diagnostics;

    // Searchable diagnostic breadcrumb for "is this firing?" reports — set
    // Clarion log level to info to see it. Tag `[#62]` is intentional.
    const startLen = tokens.length;

    // Collect every procedure / method / routine that has a known code marker
    // and end line. We only flag identifiers that sit strictly inside a code
    // section, and we use the same ranges to decide whether a Variable token
    // is "outside CODE" (treated as a declaration source).
    const codeRanges: ScopeRange[] = [];
    for (const t of tokens) {
        const isProc =
            t.type === TokenType.Procedure &&
            (t.subType === TokenType.GlobalProcedure ||
                t.subType === TokenType.MethodImplementation);
        const isRoutine = t.type === TokenType.Routine;
        if (!isProc && !isRoutine) continue;
        if (t.executionMarker === undefined || t.finishesAt === undefined) continue;
        codeRanges.push({ codeStart: t.executionMarker.line, end: t.finishesAt });
    }
    if (codeRanges.length === 0) return diagnostics;

    const isInsideCode = (line: number): boolean =>
        codeRanges.some(r => line > r.codeStart && line <= r.end);

    // "Declared somewhere in the file" set — generous on purpose. Better to
    // miss a real typo than to scream at a valid identifier.
    const declaredNames = new Set<string>();
    for (const t of tokens) {
        if (t.type === TokenType.Label && t.value) {
            declaredNames.add(t.value.toUpperCase());
        } else if (t.type === TokenType.Variable && t.value && !isInsideCode(t.line)) {
            // Procedure parameters and structure-shape Variable references
            // that live in the data section (e.g. inside PROCEDURE(...) or
            // GROUP/QUEUE/RECORD declarations) — treat them as declarations.
            declaredNames.add(t.value.toUpperCase());
        }
    }
    if (declaredNames.size === 0) return diagnostics;

    // Group tokens by line for first-token-on-line lookups.
    const tokensByLine = new Map<number, Token[]>();
    for (const t of tokens) {
        let bucket = tokensByLine.get(t.line);
        if (!bucket) {
            bucket = [];
            tokensByLine.set(t.line, bucket);
        }
        bucket.push(t);
    }

    for (const [line, lineTokens] of tokensByLine) {
        if (!isInsideCode(line)) continue;

        const first = firstSignificant(lineTokens, 0);
        if (!first) continue;
        if (first.type !== TokenType.Variable) continue;
        if (containsSpecialChars(first.value)) continue;
        if (BUILT_IN_IDENTIFIERS.has(first.value.toUpperCase())) continue;

        const firstIdx = lineTokens.indexOf(first);
        const next = firstSignificant(lineTokens, firstIdx + 1);
        if (!next) continue;

        let isAssignment = false;
        if (next.value === '=') {
            isAssignment = true;
        } else if (COMPOUND_LEADERS.has(next.value)) {
            const after = firstSignificant(lineTokens, lineTokens.indexOf(next) + 1);
            if (after && after.value === '=' && after.line === next.line) {
                isAssignment = true;
            }
        }
        if (!isAssignment) continue;

        if (declaredNames.has(first.value.toUpperCase())) continue;

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: first.line, character: first.start },
                end: { line: first.line, character: first.start + first.value.length }
            },
            message: `'${first.value}' is not declared in this file.`,
            source: 'clarion',
            code: 'undeclared-variable'
        });
    }

    logger.info(`[#62] scanned ${startLen} tokens, ${codeRanges.length} code ranges, ${diagnostics.length} diagnostics`);
    return diagnostics;
}

function firstSignificant(lineTokens: Token[], fromIndex: number): Token | undefined {
    for (let i = fromIndex; i < lineTokens.length; i++) {
        const t = lineTokens[i];
        if (t.type !== TokenType.Comment) return t;
    }
    return undefined;
}

function containsSpecialChars(value: string): boolean {
    // Skip prefixed (Cus:Field), dotted (obj.member), indexed (arr[i]), and
    // field-equate (?Ctrl) forms. These have member / scope / runtime
    // semantics that the LHS-only v1 deliberately doesn't try to validate.
    return /[:.\[\]?]/.test(value);
}
