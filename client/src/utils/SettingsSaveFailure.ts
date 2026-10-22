import * as path from 'path';

/**
 * #767 — the notice for a solution whose settings VS Code refused to write. VS Code refuses a
 * folder-settings write when the folder's .vscode\settings.json has an error (or unsaved
 * changes), and its message says so without naming the file.
 */
export interface SettingsSaveFailureNotice {
    message: string;
    /** The folder's settings.json, when it exists: the notice offers to open it. */
    settingsFile?: string;
}

export function settingsSaveFailureNotice(
    solutionFile: string,
    folder: string | undefined,
    vsCodeMessage: string,
    exists: (p: string) => boolean
): SettingsSaveFailureNotice {
    const candidate = folder ? path.join(folder, '.vscode', 'settings.json') : undefined;
    const settingsFile = candidate && exists(candidate) ? candidate : undefined;
    const fix = settingsFile ? `Check ${settingsFile} for an error. ` : '';
    return {
        message: `"${path.basename(solutionFile)}" is open for this session, but its Clarion settings couldn't be saved, ` +
            `so you'll be asked for them again next time. ${fix}VS Code said: ${vsCodeMessage}`,
        settingsFile,
    };
}
