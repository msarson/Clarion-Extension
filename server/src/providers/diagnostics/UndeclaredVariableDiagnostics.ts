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
 * v2 sub-feature 1 (commit 626480d): RHS expressions on assignment lines.
 * v2 sub-feature 2 (commit f161c40): IF / WHILE / UNTIL / CASE / OF / OROF /
 * ELSIF condition expressions.
 * v2 sub-feature 3 (this commit): dotted-access shapes — `Obj.Field` checks
 * the leading scope name `Obj` and leaves the member portion alone.
 *
 * Forms still skipped: prefixed (`Cus:Field`), indexed (`arr[i]`),
 * field-equate (`?Ctrl`), and dotted forms whose leading scope contains any
 * of those characters (`Cus:Field.method` still skipped — has a colon).
 *
 * Resolution: a name is considered declared when it appears anywhere in this
 * file as a `TokenType.Label`, or as a `TokenType.Variable` outside any CODE
 * section (covering procedure parameters and structure-shape declarations).
 * Built-in Clarion identifiers (SELF, PARENT, RECORDS, ERRORCODE, …) are
 * always treated as declared — `SELF.Method` doesn't fire because `SELF` is
 * built-in.
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

        // Assignment check: LHS (v1 + v2 sub-feature 3 dotted) + RHS
        // (v2 sub-feature 1) fire when the first significant token on the
        // line resolves to a checkable name shape — bare identifier OR
        // dotted-access scope.
        const first = firstSignificant(lineTokens, 0);
        const lhsCandidate = first ? detectCheckableName(first) : null;
        if (lhsCandidate) {
            const firstIdx = lineTokens.indexOf(first!);
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
                // LHS check (v1 + dotted v2.3): flag the checkable name when undeclared.
                if (!declaredNames.has(lhsCandidate.name.toUpperCase())) {
                    diagnostics.push(makeDiagnostic(first!, lhsCandidate.name, lhsCandidate.length));
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
 * Build the diagnostic for an undeclared name reference. Centralised so LHS,
 * RHS, condition, and dotted-access checks all surface identical text + range
 * shape. For dotted-access shapes the `name` is the leading scope and the
 * `length` is shorter than the token's full value, so the diagnostic range
 * covers only the offending scope name (`Obj` in `Obj.Field.Deeper`).
 */
function makeDiagnostic(token: Token, name: string, length: number): Diagnostic {
    return {
        severity: DiagnosticSeverity.Warning,
        range: {
            start: { line: token.line, character: token.start },
            end: { line: token.line, character: token.start + length }
        },
        message: `'${name}' is not declared in this file.`,
        source: 'clarion',
        code: 'undeclared-variable'
    };
}

/**
 * Decide whether a Variable token is a checkable name reference, returning
 * the `{ name, length }` to use for the declared-name lookup AND the
 * diagnostic range. Returns null if the token is not checkable.
 *
 * Two shapes are checkable:
 *   1. Bare identifier (no `:`, `.`, `[`, `]`, `?`). The whole value IS the
 *      name.
 *   2. Dotted access (`Obj.Field` / `Obj.Field.Deeper`) where the leading
 *      scope is a bare identifier and the value contains no other special
 *      characters. The leading scope is the name; the diagnostic range
 *      covers only that part.
 *
 * Built-in identifiers (SELF, PARENT, …) are non-checkable in either shape —
 * `SELF.Method` doesn't fire because `SELF` is built-in.
 */
interface CheckableName {
    name: string;
    length: number;
}
function detectCheckableName(token: Token): CheckableName | null {
    // Bare-identifier shape — `TokenType.Variable` only. Dotted shapes
    // (`Obj.Field`) tokenise as `TokenType.StructureField` so the dotted
    // branch below also accepts that type.
    if (token.type === TokenType.Variable) {
        if (!containsSpecialChars(token.value)) {
            if (BUILT_IN_IDENTIFIERS.has(token.value.toUpperCase())) return null;
            return { name: token.value, length: token.value.length };
        }
    }

    // Dotted-access shape — must have at least one `.`, no `:`, no brackets,
    // no `?`. The leading part before the first `.` must be a bare
    // identifier (letter/underscore start, then alphanumerics / underscores).
    // Both `TokenType.Variable` (when the tokenizer happened to keep it as
    // Variable) and `TokenType.StructureField` (the typical bucket for
    // `prefix.member` style values) are accepted here. Other token types
    // (Function, Keyword, etc.) are not — those are not name references.
    if (token.type !== TokenType.Variable && token.type !== TokenType.StructureField) {
        return null;
    }
    if (/[:\[\]?]/.test(token.value)) return null;
    const dottedMatch = /^([A-Za-z_][A-Za-z0-9_]*)\./.exec(token.value);
    if (!dottedMatch) return null;
    const scope = dottedMatch[1];
    if (BUILT_IN_IDENTIFIERS.has(scope.toUpperCase())) return null;
    return { name: scope, length: scope.length };
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
        const candidate = detectCheckableName(t);
        if (!candidate) continue;
        if (declaredNames.has(candidate.name.toUpperCase())) continue;
        if (isGluedNumberSuffix(t, document)) continue;
        diagnostics.push(makeDiagnostic(t, candidate.name, candidate.length));
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
 * Detect Variable tokens that are part of a larger expression where the
 * bare-identifier check shouldn't fire. The Clarion tokenizer doesn't always
 * emit composite expressions as a single token — `arr[1].member`,
 * `BogusObj.Field.Deeper`, `?MyButton.Hide`, and numeric suffixes like
 * `1000h` all break apart in subtle ways, leaving small Variable tokens
 * that misleadingly look like name references. Each of those is handled by
 * a different surface signal in the source text, but the discriminator is
 * the SAME: peek at the character immediately to the left of the token's
 * start (and immediately to the right of its end) and skip the token when
 * the surrounding character is one of:
 *
 *   - prev char is a digit  → numeric suffix (`1000h` / `101b` / `17q`).
 *   - prev char is `.`      → dotted-access member continuation
 *                              (`Deeper` in `BogusObj.Field.Deeper` after
 *                              the tokenizer split it).
 *   - prev char is `:`      → prefix-form field after the colon (defensive
 *                              cover for tokenizer edge cases).
 *   - next char is `[`      → indexed-access subject (`arr` in `arr[1]`).
 *   - next char is `:`      → prefix-form prefix (`Cus` in `Cus:Field`).
 *
 * The validator's contract (matching v1 LHS behaviour) is that none of
 * these composite forms should fire diagnostics — they're either valid
 * member / index / field-equate references whose semantics live elsewhere,
 * or they're Clarion literals the tokenizer doesn't understand.
 *
 * Limitation: this rejects `(1)foo`-style expressions where `foo` is a
 * legitimate identifier glued to a closing `)`. Clarion grammar doesn't
 * emit that shape — function calls and indexing both insert delimiters
 * between the closing paren/bracket and any following identifier.
 *
 * Function name kept as `isGluedNumberSuffix` for backward-compat with
 * existing callers; behaviour is now the broader "is this token glued to
 * any non-bare-identifier expression shape" check.
 */
function isGluedNumberSuffix(token: Token, document: TextDocument): boolean {
    const lineEnd = token.start + token.value.length;
    const before = token.start > 0
        ? document.getText({
            start: { line: token.line, character: 0 },
            end: { line: token.line, character: token.start }
        })
        : '';
    const after = document.getText({
        start: { line: token.line, character: lineEnd },
        end: { line: token.line, character: lineEnd + 1 }
    });
    const prevChar = before.length > 0 ? before.charAt(before.length - 1) : '';
    const nextChar = after.length > 0 ? after.charAt(0) : '';

    if (/[0-9]/.test(prevChar)) return true;
    if (prevChar === '.') return true;
    if (prevChar === ':') return true;
    if (nextChar === '[') return true;
    if (nextChar === ':') return true;
    return false;
}
