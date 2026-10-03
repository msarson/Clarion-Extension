/**
 * #623 (#609 phase 3, step B) — the one reading of a `CLASS(Parent)` derivation attribute.
 *
 * Eight regex literals used to answer this, and they disagreed on whether a colon is legal in the
 * parent's NAME. `MyOwn:Base` is an ordinary Clarion label, but `\w` stops at the colon, so six of
 * them resolved no parent at all while SelfParentClassResolver and ReferencesProvider read it
 * correctly — hovering a bare `PARENT` named the class while `PARENT.Method` resolved to nothing.
 *
 * A Clarion label is a letter or underscore followed by letters, digits, underscores and colons,
 * and that is the only character class any of this should use.
 */

/** A Clarion label, colons included. */
const LABEL = '[A-Za-z_][A-Za-z0-9_:]*';

/** Structures that can carry a derivation/type argument in parentheses. */
export type DerivableKeyword = 'CLASS' | 'QUEUE' | 'GROUP' | 'INTERFACE';

/**
 * The parent named by a `CLASS(Parent)` attribute on `line`, or null when the line carries none.
 *
 * `keywords` restricts which structure keyword is accepted — a caller resolving class inheritance
 * passes CLASS alone, while one walking typed QUEUE/GROUP declarations passes those too. The
 * match is deliberately unanchored: callers hold a line they already know declares the structure
 * they care about, and the label may sit anywhere before the keyword.
 */
export function extractParentName(
    line: string,
    keywords: readonly DerivableKeyword[] = ['CLASS']
): string | null {
    const kw = keywords.join('|');
    const m = line.match(new RegExp(`\\b(?:${kw})\\s*\\(\\s*(${LABEL})\\s*\\)`, 'i'));
    return m ? m[1] : null;
}

/** Escapes a class name for safe interpolation into a RegExp. */
function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The parent of `className` as declared in `text`, or null when `text` holds no declaration of it.
 *
 * This is the "quick scan of what is open" tier. It answers only from the text given, so a caller
 * must fall back to the include chain or the declaration index when it returns null — a class
 * declared in an .inc has no CLASS line in the .clw being edited, which is the normal case for
 * generated and hand-written Clarion alike.
 *
 * The class name is escaped before interpolation; the two copies this replaces did not escape it.
 */
export function findParentInText(className: string, text: string): string | null {
    const pattern = new RegExp(`^${escapeForRegExp(className)}\\s+CLASS\\s*\\(\\s*(${LABEL})\\s*\\)`, 'i');
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(pattern);
        if (m) return m[1];
    }
    return null;
}

/**
 * The declaration line of `className` in `text`, or null. Used where a caller needs the whole line
 * (to read MODULE()/LINK() or the TYPE attribute) rather than only the parent's name.
 */
export function findClassDeclarationLine(className: string, text: string): string | null {
    const pattern = new RegExp(`^${escapeForRegExp(className)}\\s+CLASS\\b`, 'i');
    for (const line of text.split(/\r?\n/)) {
        if (pattern.test(line)) return line;
    }
    return null;
}
