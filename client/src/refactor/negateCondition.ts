/**
 * #279 — "Negate condition" (CodeRush-style): flip the logical sense of a Clarion conditional.
 *
 * Two pure, vscode-free halves:
 *   - {@link negateExpression} negates a bare boolean expression (operator flip / `~` wrap / unwrap);
 *   - {@link extractCondition} locates the condition span inside an IF/ELSIF/LOOP WHILE/LOOP UNTIL line.
 *
 * The command/code-action layer wires these to the editor.
 */

/** Comparison operators and their negations, longest-first so two-char ops match before one-char. */
const COMPARISONS: Array<{ op: string; neg: string }> = [
    { op: '<>', neg: '=' },
    { op: '>=', neg: '<' },
    { op: '<=', neg: '>' },
    { op: '~=', neg: '=' },   // ~= is a Clarion synonym for <> (not-equal); negates to =
    { op: '=',  neg: '<>' },
    { op: '<',  neg: '>=' },
    { op: '>',  neg: '<=' },
];

const BOOLEAN_WORD = /\b(AND|OR|XOR)\b/i;
/** Binary operators that make an expression a compound (arithmetic/concat/comparison/boolean). */
const ARITHMETIC_CHARS = new Set(['+', '-', '*', '/', '&', '%']);

/**
 * Walk `expr`, invoking `visit` for each character with its parenthesis depth and whether it is
 * inside a Clarion single-quoted string (with `''` treated as an escaped quote). Lets the operator
 * scans ignore parenthesised sub-expressions and string contents.
 */
function scan(expr: string, visit: (ch: string, i: number, depth: number, inString: boolean) => void): void {
    let depth = 0;
    let inString = false;
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (inString) {
            if (ch === "'") {
                if (expr[i + 1] === "'") { i++; continue; } // escaped quote
                inString = false;
            }
            continue;
        }
        if (ch === "'") { inString = true; continue; }
        if (ch === '(') { visit(ch, i, depth, false); depth++; continue; }
        if (ch === ')') { depth = Math.max(0, depth - 1); visit(ch, i, depth, false); continue; }
        visit(ch, i, depth, false);
    }
}

/** True when the whole `expr` is a single parenthesised group, e.g. `(a AND b)`. */
function isFullyParenthesised(expr: string): boolean {
    if (!expr.startsWith('(') || !expr.endsWith(')')) return false;
    let depth = 0;
    let inString = false;
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (inString) { if (ch === "'") { if (expr[i + 1] === "'") { i++; } else { inString = false; } } continue; }
        if (ch === "'") { inString = true; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0 && i !== expr.length - 1) return false; }
    }
    return true;
}

function hasTopLevelBoolean(expr: string): boolean {
    // Test AND/OR/XOR as words at depth 0, outside strings.
    let found = false;
    // Rebuild a depth-0, string-masked view so \b word matching is reliable.
    let masked = '';
    scan(expr, (ch, _i, depth) => { masked += depth === 0 ? ch : ' '; });
    found = BOOLEAN_WORD.test(masked);
    return found;
}

/** Index/length of the first top-level comparison operator, or null. */
function findTopLevelComparison(expr: string): { start: number; op: string; neg: string } | null {
    let masked = '';
    scan(expr, (ch, _i, depth) => { masked += depth === 0 ? ch : '\0'; });
    for (let i = 0; i < masked.length; i++) {
        for (const c of COMPARISONS) {
            if (masked.startsWith(c.op, i)) {
                return { start: i, op: c.op, neg: c.neg };
            }
        }
    }
    return null;
}

/** True when `expr` has no top-level binary operator (a single value/identifier/call/group). */
function isAtom(expr: string): boolean {
    if (hasTopLevelBoolean(expr)) return false;
    if (findTopLevelComparison(expr) !== null) return false;
    let hasArithmetic = false;
    scan(expr, (ch, i, depth) => {
        if (depth !== 0) return;
        if (ARITHMETIC_CHARS.has(ch) && i > 0) hasArithmetic = true; // ignore a leading unary +/-
    });
    return !hasArithmetic;
}

/**
 * Negate a bare boolean expression:
 *   - a whole-expression `~(...)` unwraps; a `~atom` unwraps;
 *   - a single top-level comparison flips its operator;
 *   - a bare atom gains a `~`;
 *   - anything compound is wrapped in `~(...)`.
 */
export function negateExpression(raw: string): string {
    const expr = raw.trim();
    if (!expr) return expr;

    if (expr.startsWith('~')) {
        const rest = expr.slice(1).trim();
        if (isFullyParenthesised(rest)) {
            return rest.slice(1, -1).trim();
        }
        if (isAtom(rest)) {
            return rest;
        }
        // ~compound (e.g. `~a AND b`) — fall through and wrap the whole expression.
    }

    if (!hasTopLevelBoolean(expr)) {
        const cmp = findTopLevelComparison(expr);
        if (cmp) {
            return expr.slice(0, cmp.start) + cmp.neg + expr.slice(cmp.start + cmp.op.length);
        }
    }

    if (isAtom(expr) && !expr.startsWith('~')) {
        return '~' + expr;
    }

    return `~(${expr})`;
}

export interface ConditionSpan {
    /** The matched keyword, normalised: `IF` | `ELSIF` | `LOOP WHILE` | `LOOP UNTIL`. */
    keyword: string;
    /** The condition text (trimmed). */
    condition: string;
    /** Column of the first character of `condition` within the line. */
    start: number;
    /** Column just past the last character of `condition`. */
    end: number;
}

const CONDITION_KEYWORD = /^(\s*)(LOOP\s+WHILE|LOOP\s+UNTIL|ELSIF|IF)\b\s*/i;

/**
 * Locate the condition inside a conditional line. Returns null when the line is not an
 * IF / ELSIF / LOOP WHILE / LOOP UNTIL, or carries no condition (e.g. a bare `LOOP`).
 * Trailing `THEN …` (single-line IF) and `! comment` (outside strings) are excluded.
 */
export function extractCondition(lineText: string): ConditionSpan | null {
    const m = CONDITION_KEYWORD.exec(lineText);
    if (!m) return null;
    const keyword = m[2].replace(/\s+/g, ' ').toUpperCase();

    let conditionStart = m[0].length;
    let conditionEnd = lineText.length;

    // Cut a trailing comment (`!` outside a string).
    scan(lineText.slice(conditionStart), (ch, i) => {
        if (ch === '!' && conditionEnd === lineText.length) {
            conditionEnd = conditionStart + i;
        }
    });

    // Cut a trailing `THEN …` (single-line IF/ELSIF), matched at depth 0 outside strings.
    let masked = '';
    scan(lineText.slice(conditionStart, conditionEnd), (ch, _i, depth) => { masked += depth === 0 ? ch : ' '; });
    const thenMatch = /\bTHEN\b/i.exec(masked);
    if (thenMatch) {
        conditionEnd = conditionStart + thenMatch.index;
    }

    // Trim surrounding whitespace, reporting the tightened span.
    const rawSlice = lineText.slice(conditionStart, conditionEnd);
    const leading = rawSlice.length - rawSlice.trimStart().length;
    const condition = rawSlice.trim();
    if (condition === '') return null;
    const start = conditionStart + leading;
    return { keyword, condition, start, end: start + condition.length };
}
