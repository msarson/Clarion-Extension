import { Token } from '../tokenizer/TokenTypes';

/**
 * #711 — the index of the first token whose line is greater than `line`, by binary search. Token
 * arrays are in document order, so a structure's tokens are found by jumping to its first line
 * instead of scanning from the top of the document — which made several per-structure passes
 * quadratic in the document's size.
 */
/**
 * #711 — the tokens of each line, in document order, built in one pass. Replaces
 * `tokens.filter(t => t.line === n)` inside a loop over the tokens, which is quadratic.
 */
export function tokensByLine(tokens: Token[]): Map<number, Token[]> {
    const byLine = new Map<number, Token[]>();
    for (const t of tokens) {
        const list = byLine.get(t.line);
        if (list) list.push(t); else byLine.set(t.line, [t]);
    }
    return byLine;
}

/** #711 — a per-line flag, true inside any of the inclusive `ranges` (clamped to `lineCount`). */
export function linesInRanges(ranges: { start: number; end: number }[], lineCount: number): Uint8Array {
    const flags = new Uint8Array(lineCount);
    for (const r of ranges) {
        for (let l = Math.max(0, r.start); l <= r.end && l < lineCount; l++) flags[l] = 1;
    }
    return flags;
}

export function firstTokenAfterLine(tokens: Token[], line: number): number {
    let lo = 0;
    let hi = tokens.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (tokens[mid].line <= line) lo = mid + 1; else hi = mid;
    }
    return lo;
}

/**
 * #711 — the tokens on one line, from a per-line index built once per token array. Hover asks
 * "what is on the cursor's line" a dozen times per request; each asking walked every token in the
 * document. A cached array is never mutated after it is handed out (an edit builds a new one), so the
 * index lives as long as the array; the length check catches an array that grew anyway.
 */
const lineIndexes = new WeakMap<Token[], { length: number; byLine: Map<number, Token[]> }>();
const NONE: Token[] = [];
export function tokensOnLine(tokens: Token[], line: number): Token[] {
    let idx = lineIndexes.get(tokens);
    if (!idx || idx.length !== tokens.length) {
        idx = { length: tokens.length, byLine: tokensByLine(tokens) };
        lineIndexes.set(tokens, idx);
    }
    return idx.byLine.get(line) ?? NONE;
}
