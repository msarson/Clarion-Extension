/**
 * Parses a Clarion PROCEDURE/FUNCTION declaration's parameter list into a
 * structured ProcedureParameter[].
 *
 * Input is the raw declaration *line* (or joined logical line, with line
 * continuations already collapsed by the caller). The parser locates the
 * outermost `(...)` group following PROCEDURE / FUNCTION, splits at depth-0
 * commas (respecting nested parens and angle brackets), and decodes each
 * parameter into:
 *
 *   { name, type, typeArg?, byRef, optional, default? }
 *
 * Conventions (out of scope: PASS/OMIT — those are overload-resolution-time):
 *   *Type Name        → byRef = true
 *   <Type Name>       → optional = true (entire param wrapped in angle brackets)
 *   Type(arg) Name    → typeArg = "arg"
 *   Type Name = expr  → default = "expr"
 *   LIKE(File:Field)  → type = "LIKE", typeArg = "File:Field"
 */

export interface ProcedureParameter {
    name: string;
    type: string;
    typeArg?: string;
    byRef: boolean;
    optional: boolean;
    default?: string;
}

const PROCEDURE_KEYWORD = /\b(PROCEDURE|FUNCTION)\b/i;

export class ProcedureParameterParser {
    /**
     * Returns the parsed parameter list for a procedure declaration line.
     * Returns an empty array when the line has no `(...)` group, or when the
     * group is empty (`PROCEDURE()`).
     */
    public static parse(line: string): ProcedureParameter[] {
        const paramListText = this.extractParenContents(line);
        if (paramListText === null) return [];
        const trimmed = paramListText.trim();
        if (trimmed === '') return [];

        const rawParams = this.splitParams(trimmed);
        const result: ProcedureParameter[] = [];
        for (const raw of rawParams) {
            const parsed = this.parseOne(raw.trim());
            if (parsed) result.push(parsed);
        }
        return result;
    }

    /**
     * Locates the outermost `(...)` group that follows the PROCEDURE/FUNCTION
     * keyword and returns its contents. Counts depth so nested parens like
     * `STRING(20)` and `LIKE(File:Field)` are preserved inside the result.
     * Returns null when no such group is found.
     */
    private static extractParenContents(line: string): string | null {
        const kw = line.match(PROCEDURE_KEYWORD);
        if (!kw) return null;
        const startSearch = (kw.index ?? 0) + kw[0].length;

        // Find the first `(` after the keyword
        let openIdx = -1;
        for (let i = startSearch; i < line.length; i++) {
            const ch = line[i];
            if (ch === '(') { openIdx = i; break; }
            if (!/\s/.test(ch)) {
                // Anything other than whitespace before the paren means there's no param list.
                // e.g. `PROCEDURE,VIRTUAL` (no signature).
                return null;
            }
        }
        if (openIdx === -1) return null;

        let depth = 0;
        for (let i = openIdx; i < line.length; i++) {
            const ch = line[i];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    return line.slice(openIdx + 1, i);
                }
            }
        }
        // Unbalanced — return everything after the open paren as best-effort.
        return line.slice(openIdx + 1);
    }

    /**
     * Splits the parameter list at depth-0 commas. Skips commas inside `(...)`
     * and inside `<...>` so `STRING(20),LONG` and `<LONG x>,STRING y` split
     * correctly.
     */
    private static splitParams(paramList: string): string[] {
        const out: string[] = [];
        let depth = 0;
        let angle = 0;
        let buf = '';
        for (let i = 0; i < paramList.length; i++) {
            const ch = paramList[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === '<') angle++;
            else if (ch === '>') angle--;
            else if (ch === ',' && depth === 0 && angle === 0) {
                out.push(buf);
                buf = '';
                continue;
            }
            buf += ch;
        }
        if (buf.trim() !== '' || out.length > 0) out.push(buf);
        return out;
    }

    /**
     * Decodes a single trimmed parameter expression. Returns null when no
     * recognizable shape is present (e.g. blank trailing comma).
     */
    private static parseOne(raw: string): ProcedureParameter | null {
        if (raw === '') return null;

        let working = raw;
        let optional = false;

        // <...>  optional wrapper
        if (working.startsWith('<') && working.endsWith('>')) {
            optional = true;
            working = working.slice(1, -1).trim();
            if (working === '') return null;
        }

        // Default value: split on first '=' at depth 0 outside any nested parens
        let defaultValue: string | undefined;
        const eqIdx = this.findTopLevelEquals(working);
        if (eqIdx >= 0) {
            defaultValue = working.slice(eqIdx + 1).trim();
            working = working.slice(0, eqIdx).trim();
        }

        // Leading byRef marker
        let byRef = false;
        if (working.startsWith('*')) {
            byRef = true;
            working = working.slice(1).trim();
        }

        // Now `working` should be: TYPE [(typeArg)] [NAME]
        // Type is the first identifier (or LIKE keyword).
        const typeMatch = working.match(/^([A-Za-z_][A-Za-z0-9_:]*)/);
        if (!typeMatch) {
            return {
                name: '',
                type: working,
                byRef,
                optional,
                default: defaultValue,
            };
        }
        const type = typeMatch[1];
        let rest = working.slice(typeMatch[0].length).trim();

        // Optional type argument: `(...)` directly after the type
        let typeArg: string | undefined;
        if (rest.startsWith('(')) {
            const argText = this.extractFromOpenParen(rest);
            if (argText !== null) {
                typeArg = argText.body;
                rest = rest.slice(argText.consumed).trim();
            }
        }

        // Remainder is the parameter name (first identifier)
        const nameMatch = rest.match(/^([A-Za-z_][A-Za-z0-9_:]*)/);
        const name = nameMatch ? nameMatch[1] : '';

        return {
            name,
            type,
            ...(typeArg !== undefined ? { typeArg } : {}),
            byRef,
            optional,
            ...(defaultValue !== undefined ? { default: defaultValue } : {}),
        };
    }

    /**
     * Finds the first '=' character at outer depth (not inside parens or angle
     * brackets). Returns -1 when no such '=' exists.
     */
    private static findTopLevelEquals(s: string): number {
        let depth = 0;
        let angle = 0;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === '<') angle++;
            else if (ch === '>') angle--;
            else if (ch === '=' && depth === 0 && angle === 0) {
                // Skip == (equality) just in case — defaults use single `=`
                if (s[i + 1] === '=') { i++; continue; }
                return i;
            }
        }
        return -1;
    }

    /**
     * Given a string starting with '(', returns the contents (between the
     * matching ')') and the number of characters consumed (including both
     * parens). Returns null when the opening paren has no match.
     */
    private static extractFromOpenParen(s: string): { body: string; consumed: number } | null {
        if (s[0] !== '(') return null;
        let depth = 0;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    return { body: s.slice(1, i), consumed: i + 1 };
                }
            }
        }
        return null;
    }
}
