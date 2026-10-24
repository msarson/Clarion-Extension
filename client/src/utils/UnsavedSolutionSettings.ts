import * as path from 'path';
import { PathUtils } from '../PathUtils';
import type { SolutionReference } from './GlobalSolutionHistory';

/**
 * #768 — when VS Code refuses to write a folder's settings.json (#767), the solution's
 * selection lives only in the extension's own history (`GlobalSolutionHistory`), flagged
 * `settingsUnsaved`. These are the pure rules for keeping and finding it.
 */

/**
 * An updated history entry. An add that leaves out the properties file, version,
 * configuration or flag keeps what was stored: callers that know only the solution and
 * folder (the cross-folder switch, the solution list) used to wipe them.
 */
export function mergeReference(existing: SolutionReference | undefined, next: SolutionReference): SolutionReference {
    if (!existing) return next;
    return {
        ...next,
        propertiesFile: next.propertiesFile ?? existing.propertiesFile,
        version: next.version ?? existing.version,
        configuration: next.configuration ?? existing.configuration,
        settingsUnsaved: next.settingsUnsaved ?? existing.settingsUnsaved,
    };
}

/** Clarion is Windows-only: compare paths the Windows way, whatever runs the tests. */
function isInFolder(file: string, folder: string): boolean {
    const rel = path.win32.relative(folder, file);
    return rel.length > 0 && !rel.startsWith('..') && !path.win32.isAbsolute(rel);
}

function hasSettings(ref: SolutionReference): ref is SolutionReference & { propertiesFile: string; version: string } {
    return ref.settingsUnsaved === true && !!ref.propertiesFile && !!ref.version;
}

/**
 * The solution to reopen in `folderPath` at startup when its settings name none: the most
 * recent flagged entry (history is most-recent-first) whose solution lies in the folder
 * and still exists.
 */
export function unsavedSolutionForFolder(
    references: SolutionReference[],
    folderPath: string,
    exists: (p: string) => boolean
): SolutionReference | undefined {
    return references.find(ref => hasSettings(ref) && isInFolder(ref.solutionFile, folderPath) && exists(ref.solutionFile));
}

/** The flagged selection for a solution being opened whose folder settings have no entry. */
export function unsavedSettingsForSolution(
    references: SolutionReference[],
    solutionFile: string
): { propertiesFile: string; version: string; configuration: string } | undefined {
    const ref = references.find(r => PathUtils.equalPath(r.solutionFile, solutionFile));
    if (!ref || !hasSettings(ref)) return undefined;
    return { propertiesFile: ref.propertiesFile, version: ref.version, configuration: ref.configuration ?? '' };
}
