/**
 * #563 — one scope rule for the solution settings (`clarion.solutions`,
 * `clarion.currentSolution`, `clarion.configuration`).
 *
 * Mark's multi-root workspace: a configuration pick was written to the first folder's
 * `.vscode/settings.json` and read back resource-less, which in a multi-root workspace returns
 * the `.code-workspace` value and skips folder settings. His workspace file said
 * `Debug|Win32`, so every pick was put back to Debug, and the build followed.
 *
 * The rule:
 *   - READ with the first workspace folder as the resource. That is VS Code's effective value
 *     for a resource-scoped setting: a folder value overrides the workspace-file value, and in
 *     a single-folder window both are the same file.
 *   - WRITE each key back to the scope its effective value came from. A key set nowhere follows
 *     the scope of the solutions list, else the workspace file in a saved workspace, else the
 *     folder.
 *   - #663: a key set in BOTH the folder and the `.code-workspace` file is written to both.
 *     Writing only the folder copy (the one in force) left the workspace file on the old value,
 *     so a task defined there built the old configuration. Each solutions list keeps its own
 *     other entries: only the entry being changed is edited in each.
 *
 * vscode-API-free: `ClarionSettingsStore` is implemented over `WorkspaceConfiguration` in
 * `SettingsStorageManager` and by a fake in the tests.
 */
import { chooseSettingsWriteTarget, configurationName } from './ConfigurationPrecedence';

export type SettingsWriteTarget = 'Workspace' | 'WorkspaceFolder';

/** The Clarion settings section, read through the first workspace folder. */
export interface ClarionSettingsStore {
    /** A `.code-workspace` file is open. */
    readonly hasWorkspaceFile: boolean;
    inspect<T>(key: string): { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined;
    /** The effective value (folder over workspace file). */
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown, target: SettingsWriteTarget): Promise<void>;
}

export interface SolutionSelection {
    solutionFile: string;
    propertiesFile: string;
    version: string;
    configuration: string;
}

/** Solution paths compare case-insensitively and without regard to slash direction. */
export function sameSolutionFile(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) return false;
    const norm = (p: string) => p.replace(/\//g, '\\').toLowerCase();
    return norm(a) === norm(b);
}

/** The scope a write of `key` must go to so that the effective value is the one written. */
export function targetForKey(store: ClarionSettingsStore, key: string): SettingsWriteTarget {
    const own = store.inspect(key);
    if (own?.workspaceFolderValue !== undefined || own?.workspaceValue !== undefined) {
        return chooseSettingsWriteTarget(own, store.hasWorkspaceFile);
    }
    // Nothing set for this key: keep it beside the solutions list, so one file holds the set.
    return chooseSettingsWriteTarget(store.inspect('solutions'), store.hasWorkspaceFile);
}

/**
 * #663 — every scope a write of `key` must reach: both when a workspace file is open and the
 * folder and the workspace file each set it, else the one `targetForKey` picks. Without a
 * workspace file the folder's settings.json is the only file, whatever the scopes report.
 */
export function targetsForKey(store: ClarionSettingsStore, key: string): SettingsWriteTarget[] {
    const own = store.inspect(key);
    if (store.hasWorkspaceFile && own?.workspaceFolderValue !== undefined && own?.workspaceValue !== undefined) {
        return ['WorkspaceFolder', 'Workspace'];
    }
    return [targetForKey(store, key)];
}

/** The value `key` holds in `target` alone. */
function scopeValue<T>(store: ClarionSettingsStore, key: string, target: SettingsWriteTarget): T | undefined {
    const own = store.inspect<T>(key);
    return target === 'WorkspaceFolder' ? own?.workspaceFolderValue : own?.workspaceValue;
}

/** Write `value` to each of `targets`. */
async function writeScopes(store: ClarionSettingsStore, key: string, value: unknown, targets: SettingsWriteTarget[]): Promise<void> {
    for (const target of targets) {
        await store.update(key, value, target);
    }
}

/**
 * Edit the solutions list in each of `targets`, starting from that scope's own list (the
 * effective list when one target and it holds none). `edit` returns undefined to leave a list alone.
 */
async function editSolutionLists(
    store: ClarionSettingsStore,
    targets: SettingsWriteTarget[],
    edit: (solutions: SolutionSelection[]) => SolutionSelection[] | undefined
): Promise<void> {
    for (const target of targets) {
        const own = targets.length > 1
            ? scopeValue<SolutionSelection[]>(store, 'solutions', target) ?? []
            : store.get<SolutionSelection[]>('solutions', []);
        const edited = edit(own.map(s => ({ ...s })));
        if (edited) await store.update('solutions', edited, target);
    }
}

/**
 * The selected solution: the `solutions` entry for `currentSolution`, or the first entry when
 * no current solution is recorded (#104 fallback). Null when there is none, or when
 * `currentSolution` names a solution the list does not hold.
 */
export function readSolutionSelection(store: ClarionSettingsStore): SolutionSelection | null {
    const current = store.get<string>('currentSolution', '');
    const solutions = store.get<SolutionSelection[]>('solutions', []);
    const found = current
        ? solutions.find(s => sameSolutionFile(s.solutionFile, current))
        : solutions[0];
    if (!found) return null;
    return {
        solutionFile: found.solutionFile,
        propertiesFile: found.propertiesFile ?? '',
        version: found.version ?? '',
        configuration: found.configuration || store.get<string>('configuration', ''),
    };
}

/** Record `selection` as the current solution, each key written to its own scope. */
export async function saveSolutionSelection(store: ClarionSettingsStore, selection: SolutionSelection): Promise<void> {
    // Targets first: writing one key must not move where the next one goes.
    const solutionsTargets = targetsForKey(store, 'solutions');
    const currentTargets = targetsForKey(store, 'currentSolution');
    const configurationTargets = targetsForKey(store, 'configuration');

    // Solutions first: a settings-change listener that fires on a later write already sees it.
    await editSolutionLists(store, solutionsTargets, solutions => {
        const idx = solutions.findIndex(s => sameSolutionFile(s.solutionFile, selection.solutionFile));
        if (idx >= 0) {
            // Keep the recorded spelling of the path, so the entry is updated, not duplicated.
            solutions[idx] = { ...selection, solutionFile: solutions[idx].solutionFile };
        } else {
            solutions.push({ ...selection });
        }
        return solutions;
    });
    for (const target of currentTargets) {
        const held = currentTargets.length > 1
            ? scopeValue<string>(store, 'currentSolution', target)
            : store.get<string>('currentSolution', '');
        if (!sameSolutionFile(held, selection.solutionFile)) {
            await store.update('currentSolution', selection.solutionFile, target);
        }
    }
    await writeScopes(store, 'configuration', selection.configuration, configurationTargets);
}

/** Change the configuration of the current solution. */
export async function saveActiveConfiguration(store: ClarionSettingsStore, configuration: string): Promise<void> {
    const solutionsTargets = targetsForKey(store, 'solutions');
    const configurationTargets = targetsForKey(store, 'configuration');

    const current = store.get<string>('currentSolution', '');
    if (current) {
        await editSolutionLists(store, solutionsTargets, solutions => {
            const idx = solutions.findIndex(s => sameSolutionFile(s.solutionFile, current));
            if (idx < 0) return undefined;
            solutions[idx] = { ...solutions[idx], configuration };
            return solutions;
        });
    }
    await writeScopes(store, 'configuration', configuration, configurationTargets);
}

/** Empty a solution setting (`currentSolution`, `configuration`) in every scope that sets it. */
export async function clearSolutionSetting(store: ClarionSettingsStore, key: 'currentSolution' | 'configuration'): Promise<void> {
    await writeScopes(store, key, '', targetsForKey(store, key));
}

/** Drop `solutionFile` from each solutions list that holds it. */
export async function removeSolutionEntry(store: ClarionSettingsStore, solutionFile: string): Promise<boolean> {
    let removed = false;
    await editSolutionLists(store, targetsForKey(store, 'solutions'), solutions => {
        const filtered = solutions.filter(s => !sameSolutionFile(s.solutionFile, solutionFile));
        if (filtered.length === solutions.length) return undefined;
        removed = true;
        return filtered;
    });
    return removed;
}

/**
 * The settings-change handler's check: is the configuration now in settings the one the
 * extension already holds? Then the change is the extension's own write (a pick) and there is
 * nothing to re-derive. Compared by configuration name, so `Debug|Win32` matches `Debug`.
 */
export function isAlreadyApplied(inMemory: string, effective: string): boolean {
    if (!inMemory || !effective) return false;
    return configurationName(inMemory).toLowerCase() === configurationName(effective).toLowerCase();
}

/**
 * A setting the user has given no value in any scope (user settings, workspace file, folder).
 * Only then may the extension seed a default without replacing something the user chose.
 */
export function isUnsetInEveryScope(inspection: { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown } | undefined): boolean {
    return inspection?.globalValue === undefined
        && inspection?.workspaceValue === undefined
        && inspection?.workspaceFolderValue === undefined;
}

/** The Clarion settings that an older build could write into a folder, shadowing the workspace file. */
export const SCOPED_SOLUTION_KEYS = ['solutions', 'currentSolution', 'configuration', 'fileSearchExtensions', 'defaultLookupExtensions'] as const;

/**
 * #587 — keys a folder's settings.json and the .code-workspace file both set to DIFFERENT values.
 * The folder wins for these resource-scoped settings, so the workspace file's value is silently
 * ignored; #563 stopped writing such copies but cannot remove the ones older builds left.
 */
export function shadowedSettingKeys(store: ClarionSettingsStore): string[] {
    if (!store.hasWorkspaceFile) return []; // no workspace file, so nothing can be shadowed
    const shadowed: string[] = [];
    for (const key of SCOPED_SOLUTION_KEYS) {
        const own = store.inspect<unknown>(key);
        if (own?.workspaceFolderValue === undefined || own?.workspaceValue === undefined) continue;
        if (JSON.stringify(own.workspaceFolderValue) !== JSON.stringify(own.workspaceValue)) shadowed.push(key);
    }
    return shadowed;
}

/** #587 — drop the folder copies of `keys`, leaving the workspace file's values in force. */
export async function removeFolderCopies(store: ClarionSettingsStore, keys: readonly string[]): Promise<void> {
    for (const key of keys) {
        await store.update(key, undefined, 'WorkspaceFolder');
    }
}

/**
 * #686 — each disagreement the #669 dialog reports, as a string: the key and both files' values.
 * Keep as is remembers them. They are kept one by one, not as a whole, because the solution load
 * can itself bring one key into agreement (it writes the configuration to both files) while the
 * others still differ, and that must not bring the question back.
 */
export function shadowedSignatures(store: ClarionSettingsStore, keys: readonly string[]): string[] {
    return keys.map(key => {
        const own = store.inspect<unknown>(key);
        return JSON.stringify([key, own?.workspaceFolderValue ?? null, own?.workspaceValue ?? null]);
    });
}

/** #686 — every current disagreement was kept before (a changed value or a new key was not). */
export function allKept(current: readonly string[], kept: readonly string[]): boolean {
    return current.every(signature => kept.includes(signature));
}
