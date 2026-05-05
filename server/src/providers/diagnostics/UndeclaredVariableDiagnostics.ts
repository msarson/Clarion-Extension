import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenHelper } from '../../utils/TokenHelper';
import LoggerManager from '../../logger';

// Inherit the default log level (debug in dev, error in release per
// LoggingConfig). The `[#62]` breadcrumbs below use logger.info so dev users
// running this extension via F5 can see them in the Clarion Language Server
// output channel; release users won't see them (no extra noise). Promote to
// error level temporarily when chasing a regression on the validator path.
const logger = LoggerManager.getLogger('UndeclaredVariableDiagnostics');

/**
 * Issue #62 — opt-in diagnostic for identifiers used in code that don't
 * resolve to any declaration in the current file.
 *
 * Conservative by design: false-positive trust is critical for diagnostics.
 * Cross-file global resolution is out of scope; if a name isn't declared in
 * the current document the diagnostic fires, so users with cross-file globals
 * should keep the feature off.
 *
 * v1 (commit a8a8e3e): bare-identifier LHS of assignments only.
 * v2 (task 4a2ddc24): expanded to RHS expressions on assignment lines —
 * `MyVar = BogusName + 1` flags `BogusName` too. Multi-line `|` continuation
 * is a follow-up. Conditions (IF/WHILE/CASE) and dotted-access shapes are
 * separate v2 sub-features in adjacent commits.
 *
 * Forms intentionally still skipped: prefixed (`Cus:Field`), dotted
 * (`obj.member` — sub-feature 3 will narrow this), indexed (`arr[i]`),
 * field-equate (`?Ctrl`).
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

// Condition-introducing keywords. Each marks the start of an expression
// whose Variable references should be checked against `declaredNames`.
// `THEN` is treated as a stop-token rather than a condition keyword — it
// terminates the IF / ELSIF condition portion and any tokens after it on
// the same line belong to the trailing single-line statement (deferred).
const CONDITION_KEYWORDS = new Set([
    'IF', 'ELSIF', 'WHILE', 'UNTIL', 'CASE', 'OF', 'OROF',
]);

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
            TokenHelper.isProcedureOrFunction(t) &&
            (t.subType === TokenType.GlobalProcedure ||
                t.subType === TokenType.MethodImplementation);
        const isRoutine = t.type === TokenType.Routine;
        if (!isProc && !isRoutine) continue;
        if (t.executionMarker === undefined || t.finishesAt === undefined) continue;
        codeRanges.push({ codeStart: t.executionMarker.line, end: t.finishesAt });
    }
    if (codeRanges.length === 0) {
        // #62 mode-C breadcrumb: validator ran but found no procedure/function
        // implementations with both executionMarker and finishesAt set. The
        // declared-name set + diagnostic loop is skipped, so no findings are
        // produced. If this fires for a file the user thinks SHOULD have
        // diagnostics, the suspect is `DocumentStructure.process()` not
        // populating those fields for the file's procedure shape (e.g. the
        // all-in-one PROGRAM layout where inline procedures sit AFTER the
        // PROGRAM's main CODE marker).
        logger.info(`[#62] early-exit: 0 code ranges in ${tokens.length} tokens — no procedure/function/routine impl with executionMarker+finishesAt — uri=${document.uri}`);
        return diagnostics;
    }

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

        // Assignment check: LHS (v1) + RHS (v2 sub-feature 1) only fire when
        // the first significant token on the line is a bare Variable.
        const first = firstSignificant(lineTokens, 0);
        if (first &&
            first.type === TokenType.Variable &&
            !containsSpecialChars(first.value) &&
            !BUILT_IN_IDENTIFIERS.has(first.value.toUpperCase())
        ) {
            const firstIdx = lineTokens.indexOf(first);
            const next = firstSignificant(lineTokens, firstIdx + 1);
            let rhsStartIdx = -1;
            if (next && next.value === '=') {
                rhsStartIdx = lineTokens.indexOf(next) + 1;
            } else if (next && COMPOUND_LEADERS.has(next.value)) {
                const after = firstSignificant(lineTokens, lineTokens.indexOf(next) + 1);
                if (after && after.value === '=' && after.line === next.line) {
                    rhsStartIdx = lineTokens.indexOf(after) + 1;
                }
            }
            if (rhsStartIdx >= 0) {
                // LHS check (v1): flag the leading bare-identifier when undeclared.
                if (!declaredNames.has(first.value.toUpperCase())) {
                    diagnostics.push(makeDiagnostic(first));
                }
                // RHS check (v2 sub-feature 1): walk every name token after the
                // assignment operator. Function calls tokenise as
                // `TokenType.Function`, not Variable, so they're skipped
                // automatically — call-site validation lives elsewhere.
                for (const rhsDiag of collectUndeclaredInRange(lineTokens, rhsStartIdx, declaredNames, document)) {
                    diagnostics.push(rhsDiag);
                }
            }
        }

        // Condition check (v2 sub-feature 2): on every line, look for the
        // first occurrence of a condition-introducing keyword (IF / ELSIF /
        // WHILE / UNTIL / CASE / OF / OROF). From that token forward, walk
        // Variable tokens with the same filter as the assignment RHS check,
        // stopping at THEN (so single-line `IF cond THEN stmt.` doesn't
        // bleed into the trailing statement — that's a separate concern).
        for (const condDiag of collectUndeclaredInConditions(lineTokens, declaredNames, document)) {
            diagnostics.push(condDiag);
        }
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

/**
 * Build the diagnostic for an undeclared bare-identifier reference. Centralised
 * so LHS, RHS, condition, and dotted-access checks all surface identical text
 * + range shape — the offending name, ranged on its token.
 */
function makeDiagnostic(token: Token): Diagnostic {
    return {
        severity: DiagnosticSeverity.Warning,
        range: {
            start: { line: token.line, character: token.start },
            end: { line: token.line, character: token.start + token.value.length }
        },
        message: `'${token.value}' is not declared in this file.`,
        source: 'clarion',
        code: 'undeclared-variable'
    };
}

/**
 * Walk a slice of `lineTokens` (`fromIdx` to end) and produce a diagnostic for
 * every `TokenType.Variable` token that fails the same declared-name test as
 * the LHS check. Used by the v2 RHS / conditions / dotted-access extensions.
 *
 * Filter set is intentionally identical to the LHS check:
 *   - skip comments;
 *   - skip non-Variable tokens (Function calls, Keywords, operators, literals);
 *   - skip tokens whose value contains `:.\[\]?` (prefix / dotted / indexed /
 *     field-equate forms) — sub-feature 3 narrows the dotted case;
 *   - skip built-in identifiers (SELF, PARENT, …);
 *   - skip declared names;
 *   - skip Variable tokens that sit IMMEDIATELY adjacent to a preceding
 *     `TokenType.Number` token. The Clarion tokenizer doesn't recognise hex
 *     (`1000h`), binary (`101b`), or octal (`17q`) numeric suffixes — it
 *     splits them into a Number token and a 1-char Variable token glued
 *     against it. The validator treats that glued Variable as part of the
 *     number literal, not a name reference. Otherwise tests like
 *     `pAdr = 1000h` (valid Clarion hex assignment) trip the RHS check on
 *     the `h`. Adjacency = no whitespace gap between the tokens.
 *
 * Each surviving Variable token produces one diagnostic.
 */
function collectUndeclaredInRange(
    lineTokens: Token[],
    fromIdx: number,
    declaredNames: Set<string>,
    document: TextDocument
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (let i = fromIdx; i < lineTokens.length; i++) {
        const t = lineTokens[i];
        if (t.type === TokenType.Comment) continue;
        if (t.type !== TokenType.Variable) continue;
        if (containsSpecialChars(t.value)) continue;
        if (BUILT_IN_IDENTIFIERS.has(t.value.toUpperCase())) continue;
        if (declaredNames.has(t.value.toUpperCase())) continue;
        if (isGluedNumberSuffix(t, document)) continue;
        diagnostics.push(makeDiagnostic(t));
    }
    return diagnostics;
}

/**
 * v2 sub-feature 2: scan a line for condition-introducing keywords (IF /
 * ELSIF / WHILE / UNTIL / CASE / OF / OROF) and collect undeclared bare-
 * identifier references that appear in the condition expression.
 *
 * Stops at the first `THEN` keyword on the line — `IF cond THEN stmt.` is
 * a single-line conditional where the trailing `stmt` is a separate
 * statement; flagging it here would double-count once the trailing-statement
 * check ships separately.
 *
 * Multiple condition keywords on the same line (e.g. `LOOP WHILE x > 0`)
 * fire from the EARLIEST keyword position so the WHILE/UNTIL condition is
 * scanned even when LOOP appears first; LOOP itself isn't a condition
 * keyword. The scan range still terminates at THEN if THEN appears on the
 * line.
 *
 * Reuses `collectUndeclaredInRange`'s filter (Variable + non-special-char +
 * non-builtin + non-declared + non-glued-numeric-suffix).
 */
function collectUndeclaredInConditions(
    lineTokens: Token[],
    declaredNames: Set<string>,
    document: TextDocument
): Diagnostic[] {
    // Find the earliest condition keyword on the line (skipping comments).
    // Structural keywords (IF / CASE / LOOP-with-WHILE-or-UNTIL) tokenise as
    // `TokenType.Structure` (they have an `END`). Branch keywords (ELSIF / OF /
    // OROF / WHILE / UNTIL) tokenise as `TokenType.ConditionalContinuation` or
    // `TokenType.Keyword`. The match is by VALUE — type is widened to whichever
    // bucket the tokenizer uses for these names. THEN is always a Keyword.
    let condIdx = -1;
    let thenIdx = -1;
    for (let i = 0; i < lineTokens.length; i++) {
        const t = lineTokens[i];
        if (t.type === TokenType.Comment) continue;
        const upper = t.value.toUpperCase();
        if (condIdx === -1 && CONDITION_KEYWORDS.has(upper)) {
            condIdx = i;
        }
        if (upper === 'THEN' && thenIdx === -1) {
            thenIdx = i;
        }
    }
    if (condIdx === -1) return [];

    const fromIdx = condIdx + 1;
    if (thenIdx === -1 || thenIdx <= condIdx) {
        return collectUndeclaredInRange(lineTokens, fromIdx, declaredNames, document);
    }
    // Scan only the range [condIdx+1, thenIdx). Slice + helper handles it.
    const slice = lineTokens.slice(0, thenIdx);
    return collectUndeclaredInRange(slice, fromIdx, declaredNames, document);
}

/**
 * Detect Variable tokens that are actually trailing characters of a numeric
 * literal (Clarion hex / binary / octal suffix patterns: `1000h`, `101b`,
 * `17q`, `377o`).
 *
 * The tokenizer doesn't recognise these suffixes — for `pAdr = 1000h` it
 * silently drops the `1000` Number token entirely and emits `h` as a
 * `TokenType.Variable` at the position the suffix sits. The token-stream
 * adjacency check therefore can't fire (no Number token to compare against).
 *
 * Workaround: peek at the source text immediately to the left of the
 * Variable token's start column on the same line. If that character is a
 * decimal digit (with no whitespace between), treat the Variable as a
 * glued numeric suffix and skip it. Real identifier references are always
 * separated from preceding numbers by whitespace, an operator, a comma,
 * or a paren.
 *
 * Limitation: this rejects `(1)foo`-style expressions where `foo` is a
 * legitimate identifier glued to a closing `)`. Clarion grammar doesn't
 * emit that shape — function calls and indexing both insert delimiters
 * between the closing paren/bracket and any following identifier.
 */
function isGluedNumberSuffix(token: Token, document: TextDocument): boolean {
    if (token.start <= 0) return false;
    const lineText = document.getText({
        start: { line: token.line, character: 0 },
        end: { line: token.line, character: token.start }
    });
    if (lineText.length === 0) return false;
    const prevChar = lineText.charAt(lineText.length - 1);
    return /[0-9]/.test(prevChar);
}
