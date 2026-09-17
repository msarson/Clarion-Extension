/**
 * #530 — which build configuration wins, and where a change is written back.
 *
 * Pure decision points, no vscode API, in the pattern of `decideConfiguration`
 * (#437) so they can be tested without the editor.
 *
 * Background (Mark's multi-root workspace): the Clarion IDE's `.sln.cache` records
 * the configuration the IDE last built with. Applying it ahead of the user's own
 * setting meant "Config: Release" whatever the settings said. And settings were read
 * resource-less (the `.code-workspace` file in multi-root) but written to the first
 * folder's `.vscode/settings.json`, so a change through the picker never landed
 * where the setting lived.
 */

export interface ConfigurationSources {
    /** `clarion.configuration`, or the matching `clarion.solutions[]` entry, for this solution. */
    explicit?: string | null;
    /** `<_SolutionProjectConfiguration>` from the IDE's `.sln.cache` (full `Config|Platform`). */
    slnCache?: string | null;
    /** The global solution history's remembered configuration. */
    history?: string | null;
    /** What the .sln declares — name-only (`Debug`) or full (`Debug|Win32`) forms. */
    available: string[];
}

export type ConfigurationSource = 'explicit' | 'sln.cache' | 'history' | 'only' | 'prompt';

export interface ConfigurationChoice {
    /** The chosen entry, in the form `available` uses; null when the caller must ask. */
    configuration: string | null;
    source: ConfigurationSource;
}

/** The configuration name without its platform: `Debug|Win32` → `Debug`. */
export function configurationName(value: string): string {
    return value.split('|')[0].trim();
}

/**
 * The entry of `available` that `value` denotes, matched on the configuration name
 * (platform ignored, case-insensitive), in the form `available` uses. Null when the
 * solution declares no such configuration.
 */
export function normalizeConfigurationTo(value: string | null | undefined, available: string[]): string | null {
    if (!value) return null;
    const wanted = configurationName(value).toLowerCase();
    if (!wanted) return null;
    return available.find(a => configurationName(a).toLowerCase() === wanted) ?? null;
}

/**
 * Precedence: an explicit setting, then the IDE's `.sln.cache`, then the history —
 * each only when the solution actually declares it — then the sole configuration
 * when there is just one, else ask.
 */
export function chooseConfiguration(sources: ConfigurationSources): ConfigurationChoice {
    const { available } = sources;
    const explicit = normalizeConfigurationTo(sources.explicit, available);
    if (explicit) return { configuration: explicit, source: 'explicit' };
    const cached = normalizeConfigurationTo(sources.slnCache, available);
    if (cached) return { configuration: cached, source: 'sln.cache' };
    const remembered = normalizeConfigurationTo(sources.history, available);
    if (remembered) return { configuration: remembered, source: 'history' };
    if (available.length === 1) return { configuration: available[0], source: 'only' };
    return { configuration: null, source: 'prompt' };
}

/**
 * The user's own configuration for `solutionFile`: its `clarion.solutions[]` entry
 * first, else the plain `clarion.configuration`; null when neither is set.
 */
export function explicitConfigurationFor(
    solutionFile: string,
    settingValue: string | null | undefined,
    solutions: ReadonlyArray<{ solutionFile?: string; configuration?: string }>
): string | null {
    const key = solutionFile.replace(/\//g, '\\').toLowerCase();
    const entry = solutions.find(s => (s.solutionFile ?? '').replace(/\//g, '\\').toLowerCase() === key);
    if (entry?.configuration) return entry.configuration;
    return settingValue || null;
}

export type SettingsWriteTarget = 'WorkspaceFolder' | 'Workspace';

/**
 * Where a Clarion setting should be written back: the scope it was read from.
 * `inspection` is `WorkspaceConfiguration.inspect()`'s result for the key; a folder
 * value outranks a workspace-file value in VS Code, so it is treated as the owner.
 * With nothing set yet, a saved workspace (`.code-workspace`, multi-root or not)
 * takes the workspace file and a plain folder takes its `.vscode/settings.json`.
 */
export function chooseSettingsWriteTarget(
    inspection: { workspaceFolderValue?: unknown; workspaceValue?: unknown } | undefined,
    hasWorkspaceFile: boolean
): SettingsWriteTarget {
    if (inspection?.workspaceFolderValue !== undefined) return 'WorkspaceFolder';
    if (inspection?.workspaceValue !== undefined) return 'Workspace';
    return hasWorkspaceFile ? 'Workspace' : 'WorkspaceFolder';
}
