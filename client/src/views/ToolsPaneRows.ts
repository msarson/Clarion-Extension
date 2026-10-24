import * as path from 'path';

/**
 * #530 — a summary-table row; `command` makes it clickable (posted like a toolbar button), and
 * `arg` (#783) goes with it, as the recent-solution rows send their index.
 */
export interface SummaryRow { label: string; value: string; command?: string; title?: string; arg?: string; }

/** #530 — one `<tr>` of the summary table; here, vscode-free, so the markup can be tested. */
export function renderSummaryRow(r: SummaryRow, esc: (s: string) => string): string {
    const arg = r.arg !== undefined ? ` data-arg="${esc(r.arg)}"` : '';
    const attrs = r.command ? ` data-cmd="${esc(r.command)}"${arg} class="clickable" title="${esc(r.title ?? '')}"` : '';
    return `<tr${attrs}><td class="lbl">${esc(r.label)}</td><td class="val">${esc(r.value)}</td></tr>`;
}

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

/**
 * #783 — every way into a solution, for the pane with none loaded: open one, start one (only with a
 * folder open: the wizard writes into it), or pick a recent one, newest first. A recent row's
 * argument is its index in `recent`, tagged `generation:index` when a generation is given; the
 * provider opens it through resolveRecentClick, against the list of that generation only.
 */
/**
 * #783 — the recent solution a click asks for. The argument is `generation:index`, as rendered;
 * 'stale' when the pane has since shown a newer list (the click came from rows no longer on
 * screen, and the index may now name another solution), undefined when it names nothing.
 */
export function resolveRecentClick<T>(arg: unknown, generation: number, list: T[]): T | 'stale' | undefined {
    const m = typeof arg === 'string' ? /^(\d+):(\d+)$/.exec(arg) : null;
    if (!m) return undefined;
    if (Number(m[1]) !== generation) return 'stale';
    return list[Number(m[2])];
}

export function noSolutionRows(hasFolder: boolean, recent: { solutionFile: string }[], max = 5, generation?: number): SummaryRow[] {
    const rows: SummaryRow[] = [
        { label: 'Open', value: 'Open a solution…', command: 'openSolution', title: 'Open a Clarion solution (.sln)' },
    ];
    if (hasFolder) {
        rows.push({ label: 'New', value: 'New solution…', command: 'newSolution', title: 'Create a solution in this folder' });
    }
    recent.slice(0, max).forEach((ref, i) => rows.push({
        label: i === 0 ? 'Recent' : '',
        value: path.win32.basename(ref.solutionFile, path.win32.extname(ref.solutionFile)),
        command: 'openRecent',
        arg: generation === undefined ? String(i) : `${generation}:${i}`,
        title: ref.solutionFile,
    }));
    return rows;
}

/**
 * #683 — the Clarion version, clickable to run Clarion: Set Version (it replaced the toolbar gear).
 * With a solution open a pick is that solution's version (#677); without one, the default.
 */
export function clarionVersionRow(label: string, solutionOpen: boolean): SummaryRow {
    return {
        label: 'Clarion', value: label, command: 'setActiveVersion',
        title: solutionOpen ? 'Set the Clarion version for this solution' : 'Set the Clarion version',
    };
}
