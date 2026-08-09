/**
 * Pure, vscode-free helpers for locating where a Clarion source line turns into a
 * comment, and for filtering prefix-highlight matches so they never fall inside a
 * comment.
 *
 * Clarion comment rules honoured here:
 *   - `!` begins a comment that runs to end of line.
 *   - `|` (line-continuation) likewise makes the remainder of the physical line a
 *     comment, matching the TextMate grammar's `(!|\|).*` comment rule.
 *   - Neither `!` nor `|` starts a comment when it sits inside a single-quoted
 *     string literal; Clarion escapes a quote by doubling it (`''`).
 */

/**
 * Index of the first character that begins a comment on `line`, or -1 if the line
 * has no comment. String literals are skipped so a `!`/`|` inside `'...'` is not
 * mistaken for a comment start.
 */
export function firstCommentIndex(line: string): number {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inString) {
            if (ch === "'") {
                // A doubled '' is an escaped quote — stay inside the string.
                if (line[i + 1] === "'") {
                    i++;
                    continue;
                }
                inString = false;
            }
            continue;
        }
        if (ch === "'") {
            inString = true;
            continue;
        }
        if (ch === '!' || ch === '|') {
            return i;
        }
    }
    return -1;
}

export interface PrefixMatch {
    prefix: string;
    identifier: string;
    start: number;
    end: number;
}

/**
 * Run `regex` (a global `\b(prefix):(ident)\b` matcher) over a single line and
 * return only the matches that start before any comment on that line. The regex's
 * `lastIndex` is reset on entry so the same cached regex can be reused per line.
 */
export function findPrefixMatchesOutsideComments(line: string, regex: RegExp): PrefixMatch[] {
    const commentAt = firstCommentIndex(line);
    const results: PrefixMatch[] = [];

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
        const start = match.index;
        // Anything at or past the comment start is inside the comment — skip it.
        if (commentAt !== -1 && start >= commentAt) {
            continue;
        }
        results.push({
            prefix: match[1],
            identifier: match[2],
            start,
            end: start + match[0].length,
        });
    }

    return results;
}
