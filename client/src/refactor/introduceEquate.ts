/**
 * #281 — "Introduce EQUATE" pure helpers (vscode-free, unit-tested). The server's
 * IntroduceEquateCodeActionProvider detects the literal and the candidate scopes; the client command
 * uses these to format the declaration and validate the chosen name.
 */

/** A Clarion label: starts with a letter/underscore, may contain letters, digits, `_` and `:`. */
const LABEL = /^[A-Za-z_][A-Za-z0-9_:]*$/;

/** True when `name` is a syntactically valid Clarion EQUATE label. */
export function isValidEquateName(name: string): boolean {
    return LABEL.test(name.trim());
}

/**
 * Format an EQUATE declaration line. The label sits at column 0 (Clarion labels must), the value is
 * inserted verbatim (a string literal keeps its quotes, a number stays as written).
 */
export function formatEquateDeclaration(name: string, value: string): string {
    return `${name.trim()} EQUATE(${value})`;
}
