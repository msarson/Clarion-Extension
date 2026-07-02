/**
 * Parses a Clarion *declaration* line into its data type and (optional)
 * declared value. Used by the tokenizer to enrich Label tokens at column 0
 * with structured `dataType` / `dataValue` metadata, replacing ad-hoc regex
 * scans in providers (e.g. the EQUATE detail string in WordCompletionProvider).
 *
 * Recognised forms (v1 — single line, single parenthesised arg):
 *   MAX_ROWS  EQUATE(100)            → { dataType: 'EQUATE', dataValue: '100' }
 *   Name      STRING(20)             → { dataType: 'STRING', dataValue: '20'  }
 *   Field     LIKE(Cust:Id)          → { dataType: 'LIKE',   dataValue: 'Cust:Id' }
 *   pId       LONG                   → { dataType: 'LONG'                       }
 *   when      DATE                   → { dataType: 'DATE'                       }
 *   MyProc    PROCEDURE,VIRTUAL      → null  (PROCEDURE/FUNCTION are not data types)
 *
 * Out of scope (deferred to Gap P / Gap B):
 *   - `|`-continuation joining
 *   - GROUP/QUEUE/FILE/RECORD treated as composite *types* with field structure
 *
 * GROUP / QUEUE / FILE / RECORD declared inline DO produce a `dataType` entry
 * (so consumers that want to know "what kind of structure does this name
 * declare?" can read it), but no `dataValue` — those structures don't fit a
 * single parenthesised expression.
 */

const SCALAR_TYPE_KEYWORDS = new Set<string>([
    'EQUATE',
    'STRING', 'CSTRING', 'PSTRING', 'ASTRING', 'BSTRING', 'MEMO',
    'LONG', 'ULONG', 'BYTE', 'SHORT', 'USHORT',
    'REAL', 'SREAL',
    'DECIMAL', 'PDECIMAL',
    'DATE', 'TIME',
    'ANY', 'SIGNED', 'UNSIGNED',
    'LIKE',
]);

const STRUCTURE_TYPE_KEYWORDS = new Set<string>([
    'GROUP', 'QUEUE', 'FILE', 'RECORD', 'VIEW', 'CLASS', 'INTERFACE',
]);

export interface DeclaredValue {
    dataType: string;
    dataValue?: string;
}

export class DeclaredValueParser {
    /**
     * Parses a declaration line. Returns null when no recognised data type
     * keyword follows the leading label, or when the leading position has
     * no label at all (blank, comment-only, etc.).
     */
    public static parse(line: string): DeclaredValue | null {
        // Strip trailing line-comment so its contents can't pollute the keyword scan.
        const stripped = this.stripTrailingComment(line);

        // Match: <label-at-col-0> <type-keyword> <rest>
        // Label allows letter/digit/underscore/colon (e.g. CONST:MAX is a legal label).
        const match = stripped.match(
            /^([A-Za-z_][A-Za-z0-9_:]*)\s+([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/
        );
        if (!match) return null;

        const keyword = match[2].toUpperCase();
        const rest = match[3];

        const isScalar = SCALAR_TYPE_KEYWORDS.has(keyword);
        const isStructure = STRUCTURE_TYPE_KEYWORDS.has(keyword);
        if (!isScalar && !isStructure) return null;

        // Pull a directly-following parenthesised argument, if any.
        const value = this.extractLeadingParenArg(rest);

        return value === null
            ? { dataType: keyword }
            : { dataType: keyword, dataValue: value };
    }

    /**
     * Returns true when the given keyword is recognised as a data-type
     * declaration trigger. Useful for caller-side guards.
     */
    public static isDataTypeKeyword(keyword: string): boolean {
        const upper = keyword.toUpperCase();
        return SCALAR_TYPE_KEYWORDS.has(upper) || STRUCTURE_TYPE_KEYWORDS.has(upper);
    }

    /**
     * If `rest` begins (after whitespace) with a `(`, return the depth-balanced
     * inner text. Otherwise null. Handles nested parens (e.g. `LIKE(File:Field)`).
     */
    private static extractLeadingParenArg(rest: string): string | null {
        let i = 0;
        while (i < rest.length && /\s/.test(rest[i])) i++;
        if (i >= rest.length || rest[i] !== '(') return null;

        const start = i;
        let depth = 0;
        for (; i < rest.length; i++) {
            const ch = rest[i];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    return rest.slice(start + 1, i);
                }
            }
        }
        // Unbalanced parens — return everything after the open as best-effort.
        return rest.slice(start + 1);
    }

    /** Strips a Clarion `!`-comment from the end of a logical line. */
    private static stripTrailingComment(line: string): string {
        // A `!` inside a string literal does NOT start a comment. Walk char-by-char,
        // tracking single-quote nesting, and cut at the first unquoted `!`.
        let inString = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === "'") {
                // '' inside a string is an escaped quote, stay in string mode.
                if (inString && line[i + 1] === "'") {
                    i++;
                    continue;
                }
                inString = !inString;
            } else if (ch === '!' && !inString) {
                return line.slice(0, i);
            }
        }
        return line;
    }
}
