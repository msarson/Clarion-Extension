import { CancellationToken } from 'vscode-languageserver';

/**
 * #187 — cooperative-scanning helper for heavy synchronous loops on the single
 * LSP event loop (solution-wide file scans, include-chain walks, etc.).
 *
 * Call once per iteration with a monotonically increasing counter. Every
 * `every` iterations it yields the event loop (via `setImmediate`) so interactive
 * requests (hover / F12 / completion / Ctrl+T) interleave instead of stalling
 * behind the scan. It also returns `true` when the request's `CancellationToken`
 * has been cancelled (e.g. a superseded query), so the caller can bail early:
 *
 *   for (let i = 0; i < files.length; i++) {
 *       if (await cooperativeCheckpoint(i, token)) return partialOrEmpty;
 *       ...heavy per-file work...
 *   }
 *
 * Mirrors the batch+yield pattern already used by
 * `StructureDeclarationIndexer.buildIndex`.
 */
export async function cooperativeCheckpoint(
    iteration: number,
    token?: CancellationToken,
    every = 25
): Promise<boolean> {
    if (iteration > 0 && iteration % every === 0) {
        await new Promise<void>(resolve => setImmediate(resolve));
    }
    return token?.isCancellationRequested ?? false;
}

/**
 * #297 — time-based variant for loops whose per-iteration cost varies wildly (a dot-call
 * resolution can be a cache hit or a 200ms cross-file walk, so a count-based checkpoint
 * can't bound the stall). Returns an awaitable that yields the event loop whenever more
 * than `budgetMs` has elapsed since the last yield:
 *
 *   const timeSlice = makeTimeSlicer();
 *   for (...) { await timeSlice(); ...heavy work... }
 */
export function makeTimeSlicer(budgetMs = 25): () => Promise<void> {
    let lastYield = Date.now();
    return async () => {
        if (Date.now() - lastYield >= budgetMs) {
            await new Promise<void>(resolve => setImmediate(resolve));
            lastYield = Date.now();
        }
    };
}
