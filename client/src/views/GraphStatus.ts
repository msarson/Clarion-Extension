/** The language server's report on the file graph it builds for the solution. */
export interface GraphStatus {
    status: 'building' | 'built';
    /** Source files that resolved to a path on disk and entered the graph. */
    fileCount?: number;
    edgeCount?: number;
    durationMs?: number;
    /** #434 — every source file the solution declares, resolved or not. */
    sourceFileCount?: number;
    /**
     * #434 — declared source files that could not be resolved to a path and are
     * therefore absent from the graph. Non-zero means the graph is incomplete
     * and the features built on it will silently return nothing for those files.
     */
    unresolvedCount?: number;
}

/** How the graph is described, and whether it is built (so its unresolved references can be listed). */
export function graphStatusText(status: GraphStatus): { text: string; built: boolean } {
    if (status.status === 'building') {
        return { text: `Building… (${status.fileCount ?? 0} files)`, built: false };
    }
    const files = status.fileCount ?? 0;
    const edges = status.edgeCount ?? 0;
    const time = status.durationMs !== undefined ? ` ${status.durationMs}ms` : '';
    // #434 — "built" said nothing about completeness, so a graph missing most of the solution
    // looked identical to a healthy one. Only mention it when something is actually missing.
    const unresolved = status.unresolvedCount ?? 0;
    const total = status.sourceFileCount;
    const missing = unresolved > 0 ? `, ⚠️ ${unresolved}${total ? ` of ${total}` : ''} unresolved` : '';
    return { text: `${files} files, ${edges} edges${time}${missing}`, built: true };
}
