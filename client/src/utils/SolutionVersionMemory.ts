/**
 * Pure record-manipulation helpers for #141 L3 solutionVersionMemory.
 * Lives in its own file (no vscode-API dependency) so unit tests can
 * import directly without the workspace/ExtensionContext surface.
 *
 * Storage shape: `Record<solutionPath, versionEntryName>`, persisted on
 * `ExtensionContext.globalState` under `SOLUTION_VERSION_MEMORY_KEY`.
 *
 * Layer-isolation contract (per #141 Q4 three-layer model):
 *   - L1 (Default): User-scope settings.json — `clarion.activeVersion`
 *   - L2 (Effective active): in-memory per VSCode instance
 *   - **L3 (Solution memory):** globalState, cross-instance shared,
 *     keyed by solution path. THIS MODULE.
 *
 * Functions here MUST NOT touch L1 or L2 — record-shape only.
 * Persistence is done by callers via `ExtensionContext.globalState`.
 */

export const SOLUTION_VERSION_MEMORY_KEY = "clarion.solutionVersionMemory";

/**
 * Solution-path → version-entry-name. `solutionPath` is the absolute
 * filesystem path (lowercased for case-insensitive matching on Windows
 * is the caller's responsibility — we treat keys verbatim here).
 */
export type SolutionVersionMemoryRecord = Record<string, string>;

/**
 * Read the recorded version for a solution path. Returns `undefined`
 * when the solution has no recorded version (first-time-seen).
 */
export function getRecordedVersion(
    record: SolutionVersionMemoryRecord | undefined,
    solutionPath: string
): string | undefined {
    if (!record) return undefined;
    return record[solutionPath];
}

/**
 * Return a new record with the recorded version for `solutionPath`
 * set to `version`. Immutable — does not mutate the input record.
 * Caller persists the returned record via globalState.update.
 */
export function withRecordedVersion(
    record: SolutionVersionMemoryRecord | undefined,
    solutionPath: string,
    version: string
): SolutionVersionMemoryRecord {
    return { ...(record ?? {}), [solutionPath]: version };
}

/**
 * Return a new record with the recorded version for `solutionPath`
 * removed. No-op if the solution has no recorded version. Immutable.
 */
export function withoutRecordedVersion(
    record: SolutionVersionMemoryRecord | undefined,
    solutionPath: string
): SolutionVersionMemoryRecord {
    if (!record || !(solutionPath in record)) return record ?? {};
    const next = { ...record };
    delete next[solutionPath];
    return next;
}
