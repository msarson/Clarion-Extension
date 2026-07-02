/**
 * Parses the header line of a WINDOW / APPLICATION / REPORT declaration into
 * a structured WindowDescriptor. Used by `DocumentStructure.populateWindowDescriptors()`
 * to capture the title, geometry, MDI mode, icon, and other attributes once,
 * so providers don't re-scan the header text on every hover/completion.
 *
 * Input is the joined *logical* line (line-continuation `|` already collapsed
 * by `DocumentStructure.getLogicalLine`). The parser ignores everything before
 * the WINDOW / APPLICATION / REPORT keyword and reads the comma-separated
 * attributes that follow.
 *
 * Recognised attributes (case-insensitive):
 *   TITLE('...')      → title (raw text inside the outer quotes)
 *   AT(x,y,w,h)       → at (numeric tuple when all four args are integers)
 *   AT(<expr>...)     → at (raw expression string when args aren't all numeric)
 *   ICON('...')       → icon
 *   MDI               → mdi=true (parent MDI window)
 *   MDI(parent)       → mdi=true, mdiChild=true (child of a named MDI parent)
 *   SYSTEM            → systemMenu=true
 *   STATUS / STATUS(...) → statusBar=true
 *
 * Any other attribute name (e.g. RESIZE, GRAY, CENTERED, TOOLBAR) is recorded
 * verbatim in `attributes`.
 */

export interface WindowDescriptor {
    title?: string;
    at?: { x: number; y: number; w: number; h: number } | string;
    mdi: boolean;
    mdiChild: boolean;
    icon?: string;
    systemMenu: boolean;
    statusBar: boolean;
    attributes: string[];
}

const CONTAINER_KEYWORD = /\b(WINDOW|APPLICATION|REPORT)\b/i;

function emptyDescriptor(): WindowDescriptor {
    return {
        mdi: false,
        mdiChild: false,
        systemMenu: false,
        statusBar: false,
        attributes: [],
    };
}

export class WindowDescriptorParser {
    /**
     * Parses a logical header line. Returns an empty descriptor when the line
     * has no recognised container keyword (still useful — callers can detect
     * this and skip).
     */
    public static parse(joinedHeader: string): WindowDescriptor {
        const desc = emptyDescriptor();
        const kw = joinedHeader.match(CONTAINER_KEYWORD);
        if (!kw) return desc;

        let tail = joinedHeader.slice((kw.index ?? 0) + kw[0].length).trimStart();

        // Clarion shorthand: `WINDOW('Title')` (and APPLICATION/REPORT) puts the
        // title in implicit position right after the keyword, before any comma-
        // separated attribute clauses. If `tail` starts with `(`, lift the
        // parenthesised arg as the implicit title and continue past it.
        if (tail.startsWith('(')) {
            const arg = this.extractFromOpenParen(tail);
            if (arg) {
                desc.title = this.unquoteFirstString(arg.body.trim());
                tail = tail.slice(arg.consumed);
            }
        }

        // Each comma-separated attribute may itself contain `(...)` with commas;
        // use a depth-aware splitter to keep them intact.
        for (const raw of this.splitAtTopLevelCommas(tail)) {
            const trimmed = raw.trim();
            if (trimmed === '') continue;
            // Strip a leading comma if the splitter left one (we splitting includes
            // the leading separator if the keyword sits flush against the comma).
            const cleaned = trimmed.replace(/^,\s*/, '').trim();
            if (cleaned === '') continue;
            this.applyAttribute(cleaned, desc);
        }

        return desc;
    }

    /**
     * Given a string starting with `(`, returns the contents (between the
     * matching `)`) and the number of characters consumed. Returns null when
     * the opening paren has no match.
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

    /**
     * Splits a string at depth-0 commas, preserving nested `(...)`.
     */
    private static splitAtTopLevelCommas(s: string): string[] {
        const out: string[] = [];
        let depth = 0;
        let buf = '';
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) {
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
     * Recognises and stamps a single attribute clause onto the descriptor.
     */
    private static applyAttribute(clause: string, desc: WindowDescriptor): void {
        // Pull keyword + optional (...) tail
        const match = clause.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\(([\s\S]*)\))?\s*$/);
        if (!match) return;
        const keyword = match[1].toUpperCase();
        const argsText = match[3];
        const hasArgs = match[2] !== undefined;

        switch (keyword) {
            case 'TITLE':
                if (hasArgs) {
                    desc.title = this.unquoteFirstString(argsText.trim());
                }
                return;
            case 'AT':
                if (hasArgs) {
                    desc.at = this.parseAtArgs(argsText);
                }
                return;
            case 'ICON':
                if (hasArgs) {
                    desc.icon = this.unquoteFirstString(argsText.trim());
                }
                return;
            case 'MDI':
                desc.mdi = true;
                if (hasArgs && argsText.trim() !== '') {
                    desc.mdiChild = true;
                }
                return;
            case 'SYSTEM':
                desc.systemMenu = true;
                return;
            case 'STATUS':
                desc.statusBar = true;
                return;
            default:
                desc.attributes.push(keyword);
                return;
        }
    }

    /**
     * `AT(x,y,w,h)` → numeric tuple when all four are integers; otherwise the
     * raw arg text (e.g. `0,0,?Wnd:W,?Wnd:H`).
     */
    private static parseAtArgs(argsText: string): { x: number; y: number; w: number; h: number } | string {
        const trimmed = argsText.trim();
        if (trimmed === '') return trimmed;

        const parts = this.splitAtTopLevelCommas(trimmed).map(p => p.trim());
        if (parts.length === 4) {
            const nums = parts.map(p => /^-?\d+$/.test(p) ? Number(p) : NaN);
            if (nums.every(n => !Number.isNaN(n))) {
                return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
            }
        }
        return trimmed;
    }

    /**
     * Returns the contents of the first single-quoted Clarion string in `text`,
     * with `''` doubled-quote escapes collapsed to a single quote.
     */
    private static unquoteFirstString(text: string): string {
        if (text.startsWith("'")) {
            // Walk characters, allow doubled '' inside.
            let out = '';
            let i = 1;
            while (i < text.length) {
                const ch = text[i];
                if (ch === "'") {
                    if (text[i + 1] === "'") { out += "'"; i += 2; continue; }
                    return out;
                }
                out += ch;
                i++;
            }
            return out;
        }
        return text;
    }
}
