/**
 * Pure decision policy for #146 + #104 contracts. Lives in its own file (no
 * vscode-API dependency) so unit tests can import the helper directly without
 * dragging in the workspace/ExtensionContext surface that `globals.ts` does
 * at module load time.
 *
 * Consumed by `globals.ts:initializeFromWorkspace`. Tested by
 * `client/src/test/SolutionAutoReopen.test.ts`.
 */

/**
 * Minimal shape of a solutions[] entry that the fallback policy reads.
 * Defined locally (instead of importing from `globals`) to keep this module
 * vscode-API-free. The real `ClarionSolutionSettings` interface (in
 * `globals.ts`) is structurally compatible.
 */
export interface SolutionFallbackEntry {
    solutionFile: string;
}

/**
 * WorkspaceState key (#146): set to `true` by `closeClarionSolution` when the
 * user explicitly closes a solution. Consumed (cleared) by
 * `initializeFromWorkspace` on the next activation — if `true`, the #104
 * `solutions[0]` fallback is suppressed so the closed solution does NOT
 * auto-reopen.
 */
export const SOLUTION_EXPLICITLY_CLOSED_KEY = "clarion.solutionExplicitlyClosed";

/**
 * Should `initializeFromWorkspace` fall back to `clarion.solutions[0]` when
 * `clarion.currentSolution` is empty (the #104 fallback)?
 *
 * Returns `true` only when:
 *   - `currentSolution` is empty (no explicit selection)
 *   - `solutions[]` has at least one entry
 *   - `explicitlyClosed` is `false` (user did NOT explicitly close — the
 *     #146 contract)
 */
export function shouldUseSolutionFallback(
    currentSolution: string,
    solutions: ReadonlyArray<SolutionFallbackEntry>,
    explicitlyClosed: boolean
): boolean {
    if (currentSolution) return false;
    if (explicitlyClosed) return false;
    if (solutions.length === 0) return false;
    return true;
}
