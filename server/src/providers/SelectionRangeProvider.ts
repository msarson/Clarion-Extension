import { Position, Range, SelectionRange } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('SelectionRangeProvider');
logger.setLevel('error');

/** Token types that define scope containers with a start line and finishesAt. */
const CONTAINER_TYPES = new Set([
    TokenType.Structure,
    TokenType.Procedure,
    TokenType.Routine,
]);

/**
 * Builds the innermost-to-outermost chain of `SelectionRange` nodes for a
 * given cursor position.
 *
 * Chain order (innermost first, outer via `.parent`):
 *  1. Current token (if cursor is on a token)
 *  2. Current line
 *  3. Innermost containing structure / procedure / routine
 *  4. … enclosing containers outward …
 *  5. Whole document
 *
 * Exported for unit testing.
 */
export function buildSelectionChain(
    tokens: Token[],
    lines: string[],
    pos: Position
): SelectionRange {
    const { line: cursorLine, character: cursorChar } = pos;

    // ── Find all containers whose span covers cursorLine ──────────────────
    const containers = tokens.filter(t =>
        CONTAINER_TYPES.has(t.type) &&
        t.finishesAt !== undefined &&
        t.line <= cursorLine &&
        t.finishesAt >= cursorLine
    );
    // Sort outermost (smallest line) to innermost (largest line)
    containers.sort((a, b) => a.line - b.line);

    // ── Build chain from outermost inward ─────────────────────────────────
    // Start with the document range (outermost)
    const lastLine = lines.length - 1;
    let outer: SelectionRange = {
        range: Range.create(0, 0, lastLine, lines[lastLine]?.length ?? 0),
    };

    const seen = new Set<string>();
    seen.add(rangeKey(outer.range));

    function push(r: Range, parent: SelectionRange): SelectionRange {
        const key = rangeKey(r);
        if (seen.has(key)) return parent;
        seen.add(key);
        return { range: r, parent };
    }

    // Add each container (outermost first → becomes outer .parent chain)
    for (const container of containers) {
        const endLine = container.finishesAt!;
        const r = Range.create(container.line, 0, endLine, lines[endLine]?.length ?? 0);
        outer = push(r, outer);
    }

    // ── Add current line ──────────────────────────────────────────────────
    const lineText = lines[cursorLine] ?? '';
    let result: SelectionRange = push(
        Range.create(cursorLine, 0, cursorLine, lineText.length),
        outer
    );

    // ── Add current token (if cursor is on one) ───────────────────────────
    const lineTokens = tokens.filter(t => t.line === cursorLine);
    const tok = lineTokens.find(
        t => t.start <= cursorChar && t.start + t.value.length > cursorChar
    );
    if (tok) {
        result = push(
            Range.create(cursorLine, tok.start, cursorLine, tok.start + tok.value.length),
            result
        );
    }

    return result;
}

function rangeKey(r: Range): string {
    return `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;
}

/**
 * LSP SelectionRangeProvider.
 *
 * VS Code calls this for **Shift+Alt+→** (Expand Selection) and
 * **Shift+Alt+←** (Shrink Selection).
 *
 * Closes #71
 */
export class SelectionRangeProvider {

    provideSelectionRanges(document: TextDocument, positions: Position[]): SelectionRange[] {
        const tokens = TokenCache.getInstance().getTokens(document);
        const lines = document.getText().split(/\r?\n/);

        logger.debug(`🔍 [SelectionRange] ${positions.length} position(s) in ${document.uri}`);

        return positions.map(pos => buildSelectionChain(tokens, lines, pos));
    }
}
