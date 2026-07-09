import { Hover, MarkupKind } from 'vscode-languageserver/node';

/**
 * #301 — hover UX during startup. While the solution/indexes are still building, hover
 * resolution legitimately fails for symbols that WILL resolve once ready; returning null makes
 * VS Code's "Loading…" placeholder silently vanish, which reads as "this symbol has no hover".
 * During that window an unresolved hover gets a lightweight "still indexing" message instead.
 * Once the pipelines are ready, unresolved hovers stay null as usual — no noise.
 */
export interface HoverReadinessState {
    serverInitialized: boolean;
    solutionAnnounced: boolean;
    solutionPipelineReady: boolean;
    sdiPipelineReady: boolean;
}

export function buildIndexingHover(): Hover {
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: '⏳ Clarion is still indexing the solution — hover information will be available shortly.'
        }
    };
}

export function initializingHoverFallback(resolved: Hover | null, state: HoverReadinessState): Hover | null {
    if (resolved) return resolved;
    const stillInitializing =
        !state.serverInitialized ||
        (state.solutionAnnounced && (!state.solutionPipelineReady || !state.sdiPipelineReady));
    return stillInitializing ? buildIndexingHover() : null;
}
