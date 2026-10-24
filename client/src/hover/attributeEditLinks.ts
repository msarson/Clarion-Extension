/**
 * #739: the client half of the control card's attribute edit links (#731). Pure and vscode-free.
 *
 * A client that announces `capabilities.experimental.clarionAttributeEditLinks` gets the card's
 * flag names as links:
 *
 *   [NAME](command:clarion.applyAttributeEdit?<encodeURIComponent(JSON.stringify([payload]))> "title")
 *   payload = { e: [{ l, c, el, ec, t, o, s? }] }
 *
 * `l`/`el` are lines relative to the hovered line, `c`/`ec` 0-based columns, `t` the new text and
 * `o` the original text of lines l..el. `s: true` (#743) marks `t` as a VS Code snippet
 * (`,TIP('${1:text}')`); a snippet edit comes alone. All Clarion knowledge (commas, `|`
 * continuations, clashing attributes) is in the server; the client only checks the original text
 * and applies the edits.
 */

export const ATTRIBUTE_EDIT_COMMAND = 'clarion.applyAttributeEdit';

/** The hovered document and position, which the payload's relative lines are counted from. */
export interface AttributeEditAnchor { uri: string; line: number; character: number; }

export interface PlannedEdit { startLine: number; startCharacter: number; endLine: number; endCharacter: number; text: string; snippet?: boolean; }

export type AttributeEditPlan = { edits: PlannedEdit[] } | { refused: 'malformed' | 'changed' };

const LINK_TARGET = new RegExp(`\\(command:${ATTRIBUTE_EDIT_COMMAND.replace(/\./g, '\\.')}\\?([^\\s"]+)`, 'g');

/** encodeURIComponent leaves `(` and `)` alone, and a raw one can end a markdown link early. */
const encodeArgs = (args: unknown[]) => encodeURIComponent(JSON.stringify(args)).replace(/\(/g, '%28').replace(/\)/g, '%29');

/**
 * Adds the hovered position to every edit link's arguments, so the command runs as
 * `(payload, anchor)`. A command link carries nothing else, and the hover can be anywhere.
 */
export function bindAttributeEditLinks(markdown: string, anchor: AttributeEditAnchor): string {
    return markdown.replace(LINK_TARGET, (whole, query: string) => {
        // The target runs to the title's space; with no title it runs into the link's closing
        // parenthesis, and the server's encoding may leave parentheses inside it, so try the
        // longest form that is JSON and give the rest back.
        for (let end = query.length; end > 0; end--) {
            let args: unknown;
            try { args = JSON.parse(decodeURIComponent(query.slice(0, end))); } catch { continue; }
            if (!Array.isArray(args) || args.length !== 1) return whole;
            return `(command:${ATTRIBUTE_EDIT_COMMAND}?${encodeArgs([args[0], anchor])}${query.slice(end)}`;
        }
        return whole;
    });
}

const isIndex = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

/**
 * Resolves a payload against the hovered line. Refuses it whole when it is malformed or when any
 * line it touches no longer reads as it did when the card was built.
 */
export function planAttributeEdit(payload: unknown, anchorLine: number, lineAt: (line: number) => string | undefined): AttributeEditPlan {
    const raw = (payload as { e?: unknown } | null | undefined)?.e;
    if (!Array.isArray(raw) || raw.length === 0) return { refused: 'malformed' };

    const edits: PlannedEdit[] = [];
    let changed = false;
    for (const e of raw as Record<string, unknown>[]) {
        if (!e || typeof e !== 'object') return { refused: 'malformed' };
        const { l, c, el, ec, t, o, s } = e;
        if (s !== undefined && typeof s !== 'boolean') return { refused: 'malformed' };
        if (!Number.isInteger(l) || !Number.isInteger(el) || !isIndex(c) || !isIndex(ec) || typeof t !== 'string') return { refused: 'malformed' };
        const first = (l as number), last = (el as number);
        if (last < first || (last === first && (ec as number) < (c as number))) return { refused: 'malformed' };
        if (!Array.isArray(o) || o.length !== last - first + 1 || o.some(x => typeof x !== 'string')) return { refused: 'malformed' };
        if ((c as number) > o[0].length || (ec as number) > o[o.length - 1].length) return { refused: 'malformed' };
        o.forEach((original: string, i: number) => {
            const line = anchorLine + first + i;
            if (line < 0 || lineAt(line) !== original) changed = true;
        });
        edits.push({ startLine: anchorLine + first, startCharacter: c as number, endLine: anchorLine + last, endCharacter: ec as number, text: t, ...(s ? { snippet: true } : {}) });
    }

    // A snippet is inserted on its own: other edits would move the place it goes.
    if (edits.length > 1 && edits.some(e => e.snippet)) return { refused: 'malformed' };

    // VS Code refuses overlapping edits, and the server never sends them.
    const ordered = [...edits].sort((a, b) => a.startLine - b.startLine || a.startCharacter - b.startCharacter);
    for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1], next = ordered[i];
        if (next.startLine < prev.endLine || (next.startLine === prev.endLine && next.startCharacter < prev.endCharacter)) return { refused: 'malformed' };
    }
    return changed ? { refused: 'changed' } : { edits };
}
