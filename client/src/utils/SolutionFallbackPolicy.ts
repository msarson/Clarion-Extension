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

/**
 * Why a solution is being closed:
 *   - 'user'   — the user ran "Close Solution"; the closed state should stick
 *                across restarts (the #146 sticky-until-explicit-open contract).
 *   - 'switch' — an internal close performed while opening/switching to another
 *                solution; the close is immediately followed by an open.
 */
export type SolutionCloseReason = 'user' | 'switch';

/**
 * #183 — should a close operation set the sticky `SOLUTION_EXPLICITLY_CLOSED_KEY`
 * flag? Only a user-initiated close should; an internal 'switch' close must NOT,
 * or the subsequent open ends with the flag stuck `true` and
 * `initializeFromWorkspace` suppresses auto-reopen on the next restart.
 *
 * Defaults to `'user'` so callers that omit the reason keep the conservative
 * (sticky) #146 behaviour.
 */
export function shouldMarkExplicitlyClosed(reason: SolutionCloseReason = 'user'): boolean {
    return reason === 'user';
}

/**
 * #169/#104 — should `ActivationManager.setupFolderDependentFeatures` attempt to
 * restore the last solution from `GlobalSolutionHistory` (the cross-folder-switch
 * auto-open path)?
 *
 * Returns `true` only when:
 *   - `explicitlyClosed` is `false` — a user "Close Solution" suppresses
 *     auto-restore across restarts (#146/#169; the parallel of
 *     {@link shouldUseSolutionFallback}'s flag guard, which the #169 regression
 *     was missing on this code path);
 *   - `globalSolutionFile` is empty — workspace settings don't already define a
 *     solution (if they do, that path handles the load; history isn't needed);
 *   - a workspace folder is open — history is keyed by folder path (#104, the
 *     after-folder-switch restore).
 */
export function shouldRestoreSolutionFromHistory(
    explicitlyClosed: boolean,
    globalSolutionFile: string,
    hasWorkspaceFolder: boolean
): boolean {
    if (explicitlyClosed) return false;
    if (globalSolutionFile) return false;
    return hasWorkspaceFolder;
}
