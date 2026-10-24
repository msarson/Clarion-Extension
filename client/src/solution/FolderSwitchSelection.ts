import { PathUtils } from '../PathUtils';
import { ConfigurationSources, explicitConfigurationFor } from '../utils/ConfigurationPrecedence';

/**
 * #780 — what a folder switch must carry for the restarted window to load the solution. The
 * switch used to record the solution with no Clarion version; the restarted window found it,
 * could not load it (#498) and stayed a plain folder until the user picked it a second time.
 * Pure (no vscode API) so the decision is unit-testable; the pickers live in SmartSolutionOpener.
 */
export interface SwitchSelection { propertiesFile: string; version: string; configuration: string }
export interface RememberedSelection { solutionFile: string; propertiesFile?: string; version?: string; configuration?: string }

/**
 * The remembered selection for `solutionPath` when it can still load, else undefined: the user
 * picks before the switch. Never borrows another solution's selection.
 */
export function rememberedSelectionForSwitch(
    solutionPath: string,
    remembered: RememberedSelection[],
    loadable: (solutionPath: string, propertiesFile: string, version: string) => boolean
): SwitchSelection | undefined {
    const entry = remembered.find(r => PathUtils.equalPath(r.solutionFile, solutionPath));
    if (!entry?.propertiesFile || !entry.version) return undefined;
    if (!loadable(solutionPath, entry.propertiesFile, entry.version)) return undefined;
    return { propertiesFile: entry.propertiesFile, version: entry.version, configuration: entry.configuration ?? '' };
}

export interface FolderSwitchConfigurationInput {
    solutionPath: string;
    /** A folder is open: the settings read are that folder's, not the target's. */
    folderOpen: boolean;
    /** The plain `clarion.configuration` as read now. */
    settingValue: string | null | undefined;
    solutions: ReadonlyArray<{ solutionFile?: string; configuration?: string }>;
    slnCache: string | null | undefined;
    /** The configuration the solution history remembers for the target. */
    remembered: string | undefined;
    available: string[];
}

/**
 * The configuration sources for a folder switch, chosen while the old folder is still open. Its
 * plain `clarion.configuration` belongs to another solution, so only a `clarion.solutions[]`
 * entry for the target counts as the user's choice; with no folder open the plain setting is the
 * user-level one and counts.
 */
export function folderSwitchConfigurationSources(input: FolderSwitchConfigurationInput): ConfigurationSources {
    return {
        explicit: explicitConfigurationFor(input.solutionPath, input.folderOpen ? null : input.settingValue, input.solutions),
        slnCache: input.slnCache,
        history: input.remembered,
        available: input.available,
    };
}
