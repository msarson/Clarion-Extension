import * as path from 'path';
import type { SummaryRow } from './SolutionToolbarProvider';

/**
 * #681 — the Clarion Tools pane rows for the settings that change what its Build and Run buttons
 * do. vscode-free; SolutionToolbarProvider places them and handles their commands.
 */

/** Whether the build log is kept (`clarion.build.preserveLogFile`), naming the last one kept. */
export function buildLogRow(keep: boolean, lastLog?: string): SummaryRow {
    const value = !keep ? 'Not kept' : lastLog ? `Kept: ${path.win32.basename(lastLog)}` : 'Kept';
    return { label: 'Build log', value, command: 'buildLogMenu', title: lastLog ?? 'Keep or delete the build log after each build' };
}

export type BuildLogAction = 'open' | 'keep' | 'stopKeeping';

/** What clicking the Build log row offers. */
export function buildLogMenu(keep: boolean, hasLog: boolean): { label: string; action: BuildLogAction }[] {
    const items: { label: string; action: BuildLogAction }[] = [];
    if (hasLog) items.push({ label: 'Open the last build log', action: 'open' });
    items.push(keep
        ? { label: 'Stop keeping build logs', action: 'stopKeeping' }
        : { label: 'Keep build logs', action: 'keep' });
    return items;
}

/** Shown only when `clarion.run.command` replaces the exe Run starts (#679). */
export function runCommandRow(command: string): SummaryRow | undefined {
    if (!command.trim()) return undefined;
    return { label: 'Run', value: 'Custom command', command: 'openRunCommandSetting', title: command };
}

/** The startup project, clickable to change it; Run and Debug start it (#666). */
export function startupRow(name: string | undefined): SummaryRow {
    return { label: 'Startup', value: name ?? 'Not set', command: 'chooseStartupProject', title: 'Change the startup project' };
}

/** Opens Settings on the build settings. */
export function settingsRow(): SummaryRow {
    return { label: 'Settings', value: 'Build…', command: 'openBuildSettings', title: 'Open the Clarion build settings' };
}
