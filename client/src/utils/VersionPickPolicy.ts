/**
 * What a Clarion version picked through Set Version changes. vscode-free, so it is unit-testable.
 *
 *   - 'session-only'           no solution is loaded: the pick is the session's effective version.
 *   - 'unchanged'              the solution is loaded and the pick is the version it already uses.
 *   - 'save-and-reinitialize'  the solution is loaded and the pick is another version.
 */
export type VersionPickEffect = 'session-only' | 'unchanged' | 'save-and-reinitialize';

export interface VersionPick {
    /** A solution was loaded (remembered and ready) before the picker opened. */
    solutionLoaded: boolean;
    previousVersion: string;
    previousPropertiesFile: string;
    pickedVersion: string;
    pickedPropertiesFile: string;
}

const sameName = (a: string, b: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
const samePath = (a: string, b: string) =>
    (a ?? '').replace(/\//g, '\\').trim().toLowerCase() === (b ?? '').replace(/\//g, '\\').trim().toLowerCase();

/**
 * #573 — with a solution loaded, another version is saved as the solution's version and the
 * solution reinitialized, so the language server rebuilds against the new install (#568) and a
 * restart keeps it. Held in memory only, the pick moved build and run (which read the in-memory
 * paths) while the editor kept resolving through the old install.
 */
export function versionPickEffect(pick: VersionPick): VersionPickEffect {
    if (!pick.solutionLoaded) return 'session-only';
    if (sameName(pick.pickedVersion, pick.previousVersion) && samePath(pick.pickedPropertiesFile, pick.previousPropertiesFile)) {
        return 'unchanged';
    }
    return 'save-and-reinitialize';
}
