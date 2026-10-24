import * as path from 'path';
import * as fs from 'fs';

/**
 * #762 — where the Open Solution file dialog starts. Without a `defaultUri` VS Code
 * starts in the active editor's folder, so with a source file open it opened in the
 * project's SRC sub-folder. Start at the current solution's folder, else the most recent
 * solution's, else the workspace folder: the first that still exists.
 */
export function solutionDialogStartFolder(
    currentSolutionFile: string | undefined,
    recentSolutionFiles: ReadonlyArray<{ solutionFile: string; lastOpened: Date }>,
    workspaceFolder: string | undefined,
    exists: (p: string) => boolean = fs.existsSync,
): string | undefined {
    const mostRecent = [...recentSolutionFiles].sort((a, b) => b.lastOpened.getTime() - a.lastOpened.getTime())[0];
    const candidates = [
        currentSolutionFile ? path.dirname(currentSolutionFile) : undefined,
        mostRecent ? path.dirname(mostRecent.solutionFile) : undefined,
        workspaceFolder,
    ];
    return candidates.find((c): c is string => !!c && exists(c));
}
