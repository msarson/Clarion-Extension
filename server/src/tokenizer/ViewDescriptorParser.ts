/**
 * Parses a Clarion VIEW structure into its structured descriptor:
 *   - `from`: the primary source file (the argument of `VIEW(File)`)
 *   - `projectedFields`: every field listed across all PROJECT(...) clauses
 *     in the body, flattened in declaration order
 *   - `joins`: the JOIN(file) entries with optional INNER/OUTER side
 *
 * Recognised forms (v1):
 *   MyView VIEW(SourceFile)
 *           PROJECT(F1, F2, F3)
 *           JOIN(OtherFile, F1, Other:F1)
 *           INNER JOIN(File3, ...)
 *           END
 *
 * Header text and body text are passed in separately so callers (DocumentStructure)
 * can pre-join multi-line headers via Gap P's `getLogicalLine` and still iterate
 * the body line-by-line. The parser itself is regex-driven and stateless.
 */

export interface ViewDescriptor {
    /** Primary source file — the argument of `VIEW(File)`. Quotes are stripped. */
    from?: string;
    /** Every field named in PROJECT(...) clauses in declaration order. */
    projectedFields: string[];
    /** Each JOIN entry; `side` is 'INNER' when the JOIN carries the ,INNER attribute. */
    joins: { side?: 'INNER'; joinedFile: string }[];
}

export class ViewDescriptorParser {
    /**
     * Parse a VIEW structure into its descriptor. `headerText` should be the
     * (logically-joined) `VIEW(...)` declaration line; `bodyText` should be
     * the (logically-joined) text of all lines strictly between the VIEW
     * opener and its END.
     */
    public static parse(headerText: string, bodyText: string): ViewDescriptor {
        const descriptor: ViewDescriptor = { projectedFields: [], joins: [] };

        // FROM = first comma-or-close-paren-delimited argument of VIEW(...).
        const viewMatch = headerText.match(/\bVIEW\s*\(\s*([^,)]+)/i);
        if (viewMatch) {
            descriptor.from = viewMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }

        // PROJECT(field, field, ...) — flatten every PROJECT clause's argument list.
        const projectRe = /\bPROJECT\s*\(\s*([^)]+)\)/gi;
        let pm: RegExpExecArray | null;
        while ((pm = projectRe.exec(bodyText)) !== null) {
            for (const raw of pm[1].split(',')) {
                const f = raw.trim();
                if (f) descriptor.projectedFields.push(f);
            }
        }

        // JOIN(key, fields...)[,INNER]. INNER is a trailing attribute (Language
        // Reference > View Structures > JOIN); the default is a left outer join and
        // there is no OUTER keyword. `INNER JOIN(` is not Clarion — the compiler
        // answers "Expected a PROJECT statement" (#504, test-programs/ViewJoinTest).
        const joinRe = /\bJOIN\s*\(\s*([^,)]+)[^)]*\)\s*(,\s*INNER\b)?/gi;
        let jm: RegExpExecArray | null;
        while ((jm = joinRe.exec(bodyText)) !== null) {
            const side = jm[2] ? 'INNER' : undefined;
            const joinedFile = jm[1].trim().replace(/^['"]|['"]$/g, '');
            descriptor.joins.push({ side, joinedFile });
        }

        return descriptor;
    }
}
