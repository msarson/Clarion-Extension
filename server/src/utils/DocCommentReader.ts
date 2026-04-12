/**
 * Reads and parses Clarion !!! XML doc comments for hover display.
 * 
 * Clarion doc comment format:
 *   !!!<summary>Description of the member.</summary>
 *   !!!<param name="x">Description of parameter x.</param>
 *   !!!<returns>What is returned.</returns>
 *   !!!<remarks>Additional notes.</remarks>
 *   MyProc PROCEDURE(Type x), RETURNTYPE
 * 
 * Rules:
 *   - !!! (triple bang) = doc comment line; !!!! (quadruple bang) = regular comment (not doc)
 *   - Multi-line: each continuation starts with !!!
 *   - Fallback: inline ! comment on the same line as the declaration
 *   - Definition wins: if both declaration and implementation have !!! comments,
 *     the implementation's comment takes precedence (callers handle this by passing
 *     impl location and letting it override the declaration result)
 */

export interface DocComment {
    summary?: string;
    params: { name: string; description: string }[];
    returns?: string;
    remarks?: string;
}

export class DocCommentReader {
    private static readonly DOC_PREFIX = '!!!';
    private static readonly NON_DOC_PREFIX = '!!!!';

    /**
     * Reads !!! doc comments immediately above the given declaration line.
     * Falls back to an inline ! comment on the declaration line itself.
     * Returns null if no documentation is found.
     */
    static read(fileLines: string[], declarationLine: number): DocComment | null {
        if (declarationLine < 0 || declarationLine >= fileLines.length) {
            return null;
        }

        const bangLines: string[] = [];

        for (let i = declarationLine - 1; i >= 0; i--) {
            const trimmed = fileLines[i].trim();

            if (trimmed.startsWith(this.NON_DOC_PREFIX)) {
                break; // !!!! is a regular comment — terminates the doc block
            }

            if (trimmed.startsWith(this.DOC_PREFIX)) {
                bangLines.unshift(trimmed.substring(3)); // strip !!! and prepend (reverse-order fix)
            } else if (trimmed === '' || trimmed === '!' || trimmed === '!!') {
                break; // blank line or empty comment separator — stop scanning
            } else {
                break; // any other content (code or substantive comment) — stop
            }
        }

        if (bangLines.length > 0) {
            const result = this.parseXml(bangLines.join(' '));
            if (result.summary || result.params.length > 0 || result.returns || result.remarks) {
                return result;
            }
        }

        // Fallback: inline ! comment on the declaration line (e.g., "MyProc PROCEDURE() ! does X")
        // Only match single ! or !! — not !!! (which would have been caught above)
        const declLine = fileLines[declarationLine] || '';
        const inlineMatch = declLine.match(/![^!](.+)$/);
        if (inlineMatch) {
            const text = inlineMatch[1].trim();
            if (text) {
                return { summary: text, params: [] };
            }
        }

        return null;
    }

    /**
     * Formats a DocComment as markdown for use in hover content.
     */
    static toMarkdown(doc: DocComment): string {
        const lines: string[] = [];

        if (doc.summary) {
            lines.push(doc.summary);
        }

        if (doc.params.length > 0) {
            if (lines.length > 0) lines.push('');
            lines.push('**Parameters:**');
            for (const param of doc.params) {
                lines.push(`- \`${param.name}\` — ${param.description}`);
            }
        }

        if (doc.returns) {
            if (lines.length > 0) lines.push('');
            lines.push(`**Returns:** ${doc.returns}`);
        }

        if (doc.remarks) {
            if (lines.length > 0) lines.push('');
            lines.push(`*${doc.remarks}*`);
        }

        return lines.join('\n');
    }

    private static parseXml(xml: string): DocComment {
        const result: DocComment = { params: [] };

        try {
            const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
            if (summaryMatch) {
                result.summary = summaryMatch[1].trim();
            }

            const paramRegex = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g;
            let paramMatch: RegExpExecArray | null;
            while ((paramMatch = paramRegex.exec(xml)) !== null) {
                result.params.push({
                    name: paramMatch[1],
                    description: paramMatch[2].trim()
                });
            }

            const returnsMatch = xml.match(/<returns>([\s\S]*?)<\/returns>/);
            if (returnsMatch) {
                result.returns = returnsMatch[1].trim();
            }

            const remarksMatch = xml.match(/<remarks>([\s\S]*?)<\/remarks>/);
            if (remarksMatch) {
                result.remarks = remarksMatch[1].trim();
            }
        } catch {
            // Return whatever was parsed so far on error
        }

        return result;
    }
}
