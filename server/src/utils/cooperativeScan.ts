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
