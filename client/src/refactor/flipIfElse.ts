/**
 * #278 — "Flip IF/ELSE" (CodeRush "Reverse Conditional"): on an `IF … ELSE … END`, negate the
 * condition and swap the two branches — handy when the `ELSE` is the common / early path.
 *
 * Pure and vscode-free: {@link flipIfElse} takes the document's lines plus the cursor line (which
 * must sit on the block-form `IF`), finds the matching top-level `ELSE` and `END` by textual depth
 * tracking, and returns the rewritten block. The negation reuses {@link negateExpression} from the
 * Negate-condition refactor, so the two agree on operator flips and `~(…)` wrapping.
 *
 * It deliberately returns null (offering nothing — the Negate-condition action still covers the
 * bare IF line) when the shape is not a clean two-branch flip: no `ELSE`, an `ELSIF` in the chain,
 * a single-line `IF … THEN …`, or an unterminated / malformed block.
 */
import { extractCondition, negateExpression } from './negateCondition';

/** Block-form structure keywords that open a nesting level (each closes with its own `END`). */
const BLOCK_OPENERS = new Set(['IF', 'LOOP', 'CASE', 'EXECUTE', 'BEGIN']);

/** All structural keywords we classify on, so we can tell a keyword from a leading label. */
const STRUCT_KEYWORDS = new Set([...BLOCK_OPENERS, 'END', 'ELSE', 'ELSIF']);

/** Replace Clarion single-quoted string contents (incl. `''` escapes) with spaces. */
function maskStrings(s: string): string {
    let out = '';
    let inString = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (ch === "'") {
                if (s[i + 1] === "'") { out += '  '; i++; continue; } // escaped quote
                inString = false;
            }
            out += ' ';
            continue;
        }
        if (ch === "'") { inString = true; out += ' '; continue; }
        out += ch;
    }
    return out;
}

/**
 * The leading structural keyword of a line, upper-cased, or '' for a comment / blank / plain
 * statement. A label may precede a structure keyword (`MyLoop LOOP …`); since a label can't be a
 * reserved word, we take whichever of the first two tokens is a known structural keyword, else the
 * first token. Trailing punctuation (`.`, `;`, `,`) and comments are ignored.
 */
function firstKeyword(line: string): string {
    const masked = maskStrings(line);
    const commentAt = masked.indexOf('!');
    const code = (commentAt === -1 ? masked : masked.slice(0, commentAt)).replace(/;.*$/, '');
    const trimmed = code.trim();
    if (trimmed === '') return '';
    const tokens = trimmed.split(/\s+/);
    const t0 = (tokens[0] ?? '').toUpperCase().replace(/[.,;].*$/, '');
    if (STRUCT_KEYWORDS.has(t0)) return t0;
    const t1 = (tokens[1] ?? '').toUpperCase().replace(/[.,;].*$/, '');
    if (STRUCT_KEYWORDS.has(t1)) return t1; // labelled structure, e.g. `MyLoop LOOP`
    return t0;
}

/** True when the line closes a structure: a leading `END`, or a bare `.` terminator line. */
function isCloser(line: string): boolean {
    const kw = firstKeyword(line);
    if (kw === 'END') return true;
    const masked = maskStrings(line);
    const commentAt = masked.indexOf('!');
    const code = (commentAt === -1 ? masked : masked.slice(0, commentAt)).trim();
    return code === '.';
}

/** True when `line` is a single-line IF (`IF … THEN <statement>`) rather than a block header. */
function isSingleLineIf(line: string): boolean {
    const masked = maskStrings(line);
    const m = /\bTHEN\b/i.exec(masked);
    if (!m) return false;
    let after = line.slice(m.index + 'THEN'.length);
    const commentAt = maskStrings(after).indexOf('!');
    if (commentAt !== -1) after = after.slice(0, commentAt);
    return after.trim().length > 0;
}

export interface FlipIfElseResult {
    /** First line of the block to replace (= the cursor's IF line). */
    startLine: number;
    /** Last line of the block to replace (the matching `END`), inclusive. */
    endLine: number;
    /** Replacement text for lines `[startLine, endLine]`, one entry per line. */
    newLines: string[];
}

/**
 * If `cursorLine` is a block-form `IF … ELSE … END`, return the flipped block (condition negated,
 * branches swapped); otherwise null.
 */
export function flipIfElse(lines: string[], cursorLine: number): FlipIfElseResult | null {
    if (cursorLine < 0 || cursorLine >= lines.length) return null;
    const ifLine = lines[cursorLine];

    const span = extractCondition(ifLine);
    if (!span || span.keyword !== 'IF') return null;
    if (isSingleLineIf(ifLine)) return null;

    // Walk forward tracking nesting depth (our IF opens depth 1). The ELSE/END we act on are the
    // ones seen at depth 1; nested structures live at depth ≥ 2 and are stepped over.
    let depth = 1;
    let elseLine = -1;
    let endLine = -1;
    for (let i = cursorLine + 1; i < lines.length; i++) {
        const line = lines[i];
        const kw = firstKeyword(line);

        if (isCloser(line)) {
            depth--;
            if (depth === 0) { endLine = i; break; }
            continue;
        }
        if (depth === 1 && kw === 'ELSIF') return null; // not a simple two-branch flip
        if (depth === 1 && kw === 'ELSE') {
            if (elseLine !== -1) return null;            // malformed: a second top-level ELSE
            elseLine = i;
            continue;
        }
        if (BLOCK_OPENERS.has(kw)) {
            if (kw === 'IF' && isSingleLineIf(line)) continue; // single-line IF opens no block
            depth++;
        }
    }

    if (endLine === -1 || elseLine === -1) return null;

    const branchA = lines.slice(cursorLine + 1, elseLine);
    const branchB = lines.slice(elseLine + 1, endLine);
    const negated = negateExpression(span.condition);
    const newIf = ifLine.slice(0, span.start) + negated + ifLine.slice(span.end);

    return {
        startLine: cursorLine,
        endLine,
        newLines: [newIf, ...branchB, lines[elseLine], ...branchA, lines[endLine]],
    };
}
