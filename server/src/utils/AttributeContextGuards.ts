import { Token, TokenType } from '../ClarionTokenizer';

/**
 * Shared guards for distinguishing a genuine Clarion attribute application
 * (e.g. the `FILTER` in a VIEW declaration) from an unrelated variable/field
 * whose name happens to match an attribute keyword (e.g. the `Filter` GROUP in
 * `USE(Filter.Type)`). Used by both AttributeDiagnostics (should this fire a
 * warning?) and HoverRouter (should this show the attribute's doc card?) so the
 * two providers can't drift into disagreeing about the same token.
 */

/**
 * True when the token at `tokenStart` is the SUFFIX of a dotted member-access
 * chain, e.g. the `Type` in `SELF.Sectors.Type`. In this position it's an
 * identifier being accessed, not a Clarion attribute application.
 */
export function isDotSuffix(lineText: string, tokenStart: number): boolean {
    return tokenStart > 0 && lineText[tokenStart - 1] === '.';
}

/**
 * True when the token at `tokenStart` is the BASE of a dotted member-access
 * chain, e.g. the `Filter` in `Filter.Contact[1]`. Clarion attributes are never
 * themselves written as `KEYWORD.member`, so a following `.` means this token is
 * a variable/field reference, not an attribute application.
 *
 * The `.` must be followed by an identifier character to count. In Clarion `.`
 * is ALSO the END-shorthand terminator (`BUTTON('OK'),AT(1,1),USE(?Ok).` closes
 * the enclosing structure), and a bare terminator directly after an attribute
 * is NOT member access — treating it as such silently suppressed a genuine
 * diagnostic/hover on the last attribute of a period-terminated declaration.
 */
export function isDotBase(lineText: string, tokenStart: number, tokenLength: number): boolean {
    const dotIndex = tokenStart + tokenLength;
    if (lineText[dotIndex] !== '.') return false;
    const afterDot = lineText[dotIndex + 1];
    return afterDot !== undefined && /[A-Za-z_]/.test(afterDot);
}

const MAX_PAREN_WALK_STEPS = 500;

/**
 * True when the token at `tokenIndex` sits inside the argument parentheses of a
 * PRECEDING attribute in the same control/structure declaration (e.g. the
 * `Filter` in `USE(Filter)`, with no dotted suffix at all), rather than being a
 * top-level, comma-separated attribute of the control itself.
 *
 * Walks backward from `tokenIndex` counting parens: a `)` opens a nested pair
 * (depth++), a matching `(` closes it (depth--); an unmatched `(` (encountered
 * while depth is 0) means the token lives inside that paren's argument list.
 * The walk stops as soon as it reaches `anchorToken` (identified by line+start,
 * since it is not necessarily the same array/object instance as `tokens`) —
 * everything between the anchor and the target token is that declaration's own
 * attribute list, so nothing outside this span needs to be considered.
 *
 * Bounded to MAX_PAREN_WALK_STEPS as a defensive fallback: if `anchorToken` is
 * never found (e.g. an unexpected token-stream shape), fail safe by returning
 * false (not nested) so callers fall back to their pre-existing behavior rather
 * than silently suppressing a real warning or a real attribute hover.
 */
export function isNestedInsideAttributeArgs(tokens: Token[], tokenIndex: number, anchorToken: Token): boolean {
    let depth = 0;
    let steps = 0;
    for (let j = tokenIndex - 1; j >= 0 && steps < MAX_PAREN_WALK_STEPS; j--, steps++) {
        const t = tokens[j];
        if (t.line === anchorToken.line && t.start === anchorToken.start && t.value === anchorToken.value) {
            return false; // reached the anchor keyword itself — nothing left to be nested in
        }
        if (t.value === ')') {
            depth++;
        } else if (t.value === '(') {
            if (depth === 0) return true; // unmatched '(' before the anchor → nested
            depth--;
        }
    }
    return false;
}

/**
 * True when the token at this line/character position is itself the LABEL of
 * its own declaration — e.g. the `Name` in `Name LONG`, or the `Create` field
 * declared inside a CLASS body — rather than a reference to something else.
 *
 * A declaration label can never legitimately BE an attribute application or a
 * builtin function call: those are things a name is used WITH, not something
 * a name-being-declared can itself be. So this holds regardless of which
 * attribute/builtin/keyword the label's text happens to collide with, and
 * regardless of dotting/nesting/declaration-context — unlike the other guards
 * here, it needs no case-by-case reasoning about surrounding syntax.
 *
 * Without this, `handleAttribute`'s declaration-context check (which asks "is
 * this line inside a GROUP/QUEUE/CLASS/control declaration", not "is this
 * word the thing being declared") let a genuine field named e.g. `Create`
 * inside a CLASS body show the CREATE attribute's card instead of its own
 * declaration; `handleBuiltin`'s bare-constant fallback had no context check
 * at all and did the same for any declaration anywhere, e.g. `Name LONG`.
 */
export function isDeclarationLabel(tokens: Token[], line: number, character: number): boolean {
    const token = tokens.find(t =>
        t.line === line &&
        character >= t.start &&
        character <= t.start + t.value.length);
    return token?.type === TokenType.Label;
}

/**
 * Words fully owned by HoverRouter.handleSpecialKeywords' MODULE/HIDE/DISABLE/
 * TYPE branches (each is BOTH an attribute/keyword/data-type AND a builtin).
 * Those branches make the authoritative call for every case: genuine
 * attribute usage, genuine builtin call, AND "neither, fall through to
 * variable resolution". Every OTHER hover resolver that might also
 * independently recognize one of these names by coincidence (handleKeyword,
 * handleBuiltin, SymbolHoverResolver's data-type lookup, ...) must defer to
 * that decision — checking this set and returning null keeps a downstream
 * resolver from silently overruling it and reintroducing the same false
 * positive one step later.
 */
export const HANDLED_BY_SPECIAL_KEYWORDS = new Set(['MODULE', 'HIDE', 'DISABLE', 'TYPE']);
