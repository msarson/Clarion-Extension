import { workspace, ConfigurationTarget, window, WorkspaceFolder, ExtensionContext, WorkspaceConfiguration } from 'vscode';
import { ClarionSettingsStore, SettingsWriteTarget, saveActiveConfiguration, saveSolutionSelection, sameSolutionFile, targetForKey } from './SolutionSettingsScope';
import LoggerManager from './LoggerManager';
import { ClarionSolutionSettings } from '../globals';
import {
    SOLUTION_VERSION_MEMORY_KEY,
    SolutionVersionMemoryRecord,
    getRecordedVersion,
    withRecordedVersion,
    withoutRecordedVersion,
} from './SolutionVersionMemory';
import * as path from 'path';

const logger = LoggerManager.getLogger("SettingsStorageManager");
logger.setLevel("error"); // Production: Only log errors

export class SettingsStorageManager {
    /**
     * #141 B1 — L1 (Default version) write. User-scope settings.json:
     * `clarion.activeVersion` + `clarion.activePropertiesFile`. Fires ONLY
     * on explicit "Set as default" picker action (B2) + Q5 first-time-install
     * auto-set + Q7 no-solution-mode manual version switch.
     *
     * Layer isolation contract: this method writes settings.json ONLY. Does
     * NOT touch L2 in-memory (globalSettings.* / globalClarionVersion) or L3
     * (`solutionVersionMemory`). Cross-instance propagation is handled by
     * VS Code's `onDidChangeConfiguration` for the L1 key — but per Q4,
     * other instances' L2 effective active versions stay put.
     */
    static async setDefaultVersion(version: string, propertiesFile: string): Promise<boolean> {
        try {
            const config = workspace.getConfiguration('clarion');
            await config.update('activeVersion', version, ConfigurationTarget.Global);
            await config.update('activePropertiesFile', propertiesFile, ConfigurationTarget.Global);
            logger.info(`✅ Set default Clarion version (L1, User scope): ${version} → ${propertiesFile}`);
            return true;
        } catch (error) {
            logger.error("❌ Error setting default version (L1):", error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            window.showErrorMessage(`Failed to set default Clarion version: ${errorMsg}`);
            return false;
        }
    }

    /**
     * #141 B1 — L2 (Effective active version) write. Per-VSCode-instance
     * in-memory state. Updates `globalSettings.libsrcPaths`/`redirectionPath`/
     * `macros` from the parsed properties file.
     *
     * Delegates to `globals.setActiveClarionVersion` (which under B1 became
     * L2-only — no longer writes to settings.json). Thin wrapper here for API
     * symmetry with `setDefaultVersion`; co-located so callers see the layer-
     * boundary clearly.
     *
     * Layer isolation contract: this method writes in-memory state ONLY.
     * Does NOT touch L1 (settings.json) or L3 (`solutionVersionMemory`).
     */
    static async setEffectiveActiveVersion(version: string, propertiesFile: string): Promise<boolean> {
        // Late-bind via dynamic import to avoid a hard circular dep at module
        // load time (globals.ts imports SettingsStorageManager too).
        const { setActiveClarionVersion } = await import('../globals');
        return await setActiveClarionVersion(version, propertiesFile);
    }

    /**
     * #141 B1 — L3 (Per-solution memory) read. Returns the recorded version
     * entry-name for `solutionPath` if any has been written, otherwise
     * `undefined` (solution is first-time-seen).
     *
     * Reads from `ExtensionContext.globalState` under
     * `SOLUTION_VERSION_MEMORY_KEY`. Pure record-shape manipulation lives
     * in `./SolutionVersionMemory.ts` (vscode-free helpers).
     */
    static getSolutionVersion(context: ExtensionContext, solutionPath: string): string | undefined {
        const record = context.globalState.get<SolutionVersionMemoryRecord>(SOLUTION_VERSION_MEMORY_KEY);
        return getRecordedVersion(record, solutionPath);
    }

    /**
     * #141 B1 — L3 (Per-solution memory) write. Records `version` as the
     * last-used version for `solutionPath`. Immutable record update via
     * `withRecordedVersion`; persists the new record back to globalState.
     *
     * Layer isolation contract: writes globalState ONLY. Does NOT touch L1
     * (settings.json) or L2 (in-memory effective active).
     */
    static async setSolutionVersion(
        context: ExtensionContext,
        solutionPath: string,
        version: string
    ): Promise<void> {
        const existing = context.globalState.get<SolutionVersionMemoryRecord>(SOLUTION_VERSION_MEMORY_KEY);
        const updated = withRecordedVersion(existing, solutionPath, version);
        await context.globalState.update(SOLUTION_VERSION_MEMORY_KEY, updated);
        logger.info(`✅ Recorded solution version (L3): ${solutionPath} → ${version}`);
    }

    /**
     * #141 B1 — L3 clear. Removes the recorded version for a specific
     * solution path (e.g. if the solution file no longer exists on disk).
     * No-op if the solution has no recorded version.
     */
    static async clearSolutionVersion(
        context: ExtensionContext,
        solutionPath: string
    ): Promise<void> {
        const existing = context.globalState.get<SolutionVersionMemoryRecord>(SOLUTION_VERSION_MEMORY_KEY);
        const updated = withoutRecordedVersion(existing, solutionPath);
        await context.globalState.update(SOLUTION_VERSION_MEMORY_KEY, updated);
        logger.info(`✅ Cleared solution version (L3): ${solutionPath}`);
    }

    /**
     * @deprecated #141 B1 — kept for back-compat during migration; new code
     * should call `setDefaultVersion` (L1 write) or `setEffectiveActiveVersion`
     * (L2 write) explicitly to make the layer boundary visible at call sites.
     *
     * Currently still writes L1 (same shape as `setDefaultVersion`) so
     * existing `globals.ts` migration code can keep calling this until
     * migrated. New call sites added in B1 / B2 / B3 should pick the explicit
     * setter that matches the intent.
     */
    static async saveActiveVersion(version: string, propertiesFile: string): Promise<boolean> {
        return await SettingsStorageManager.setDefaultVersion(version, propertiesFile);
    }

    /**
     * Saves Clarion solution settings to folder-level settings (.vscode/settings.json)
     */
    static async saveSolutionSettings(
        solutionFile: string,
        propertiesFile: string,
        version: string,
        configuration: string
    ): Promise<boolean> {
        try {
            // ⚠️ CANNOT save settings without a folder
            if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
                logger.warn(`⚠️ Cannot save solution settings: No folder open`);
                return false;
            }

            const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
            const store = SettingsStorageManager.clarionSettings();

            // #563 — each key goes back to the scope its effective value came from (#530 did this
            // for configuration/currentSolution only; the solutions list always went to the folder
            // while every reader read the workspace file). Ensure .vscode exists only when a key
            // is actually headed for the folder.
            const headedForFolder = ['solutions', 'currentSolution', 'configuration']
                .some(key => targetForKey(store, key) === 'WorkspaceFolder');
            if (headedForFolder) {
                const vscodeDir = path.join(workspaceFolder, '.vscode');
                const fs = require('fs');
                if (!fs.existsSync(vscodeDir)) {
                    fs.mkdirSync(vscodeDir, { recursive: true });
                    logger.info(`✅ Created .vscode directory: ${vscodeDir}`);
                }
            }

            logger.info(`💾 Saving settings (solutions → ${targetForKey(store, 'solutions')}, currentSolution → ${targetForKey(store, 'currentSolution')}, configuration → ${targetForKey(store, 'configuration')})`);
            logger.info(`   Settings to save:
                - solutionFile: ${solutionFile}
                - propertiesFile: ${propertiesFile}
                - version: ${version}
                - configuration: ${configuration}`);

            // Solutions list first, then currentSolution, then configuration: a settings-change
            // listener firing on any of the later writes already reads the new selection.
            await saveSolutionSelection(store, { solutionFile, propertiesFile, version, configuration });
            logger.info(`✅ Saved solutions, currentSolution and configuration`);

            // Remove legacy individual keys that are now fully covered by the solutions array
            const config = workspace.getConfiguration('clarion', workspace.workspaceFolders[0].uri);
            for (const legacyKey of ['solutionFile', 'propertiesFile', 'version'] as const) {
                const inspection = config.inspect(legacyKey);
                if (inspection?.workspaceFolderValue !== undefined) {
                    await config.update(legacyKey, undefined, ConfigurationTarget.WorkspaceFolder);
                }
            }

            logger.info(`✅ Saved settings successfully:
                - solutionFile: ${solutionFile}
                - propertiesFile: ${propertiesFile}
                - version: ${version}
                - configuration: ${configuration}`);

            return true;
        } catch (error) {
            logger.error("❌ Error saving solution settings:", error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            window.showErrorMessage(`Failed to save solution settings: ${errorMsg}`);
            return false;
        }
    }

    /**
     * #563 — the Clarion settings section as one scope-aware store, read through the first
     * workspace folder (VS Code's effective value: folder over workspace file). A
     * `WorkspaceConfiguration` is a snapshot, so every read fetches it again: a write made
     * earlier in the same save must be visible to the next read.
     */
    static clarionSettings(): ClarionSettingsStore {
        const resource = () => workspace.workspaceFolders?.[0]?.uri;
        const section = () => workspace.getConfiguration('clarion', resource());
        return {
            hasWorkspaceFile: workspace.workspaceFile !== undefined,
            inspect: <T>(key: string) => section().inspect<T>(key),
            get: <T>(key: string, fallback: T) => section().get<T>(key, fallback),
            update: async (key: string, value: unknown, target: SettingsWriteTarget) => {
                // With no folder open there is no folder scope to write to.
                const vsTarget = target === 'WorkspaceFolder' && resource()
                    ? ConfigurationTarget.WorkspaceFolder
                    : ConfigurationTarget.Workspace;
                await section().update(key, value, vsTarget);
            },
        };
    }

    /**
     * Updates the configuration of the active solution in the solutions array and writes the
     * standalone `clarion.configuration` key, each to the scope it lives in (#563).
     * Call this whenever the user changes the build configuration.
     */
    static async updateActiveConfiguration(configuration: string): Promise<void> {
        if (!workspace.workspaceFolders?.[0]) return;
        await saveActiveConfiguration(SettingsStorageManager.clarionSettings(), configuration);
        logger.info(`✅ Updated active configuration to: ${configuration}`);
    }

    /**
     * Silently removes a solution (that no longer exists on disk) from all workspace settings.
     * Clears the solutions array entry, currentSolution, solutionFile, propertiesFile, version,
     * and configuration if they belong to the missing solution.
     */
    static async removeMissingSolution(solutionFile: string): Promise<void> {
        const workspaceFolder = workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const store = SettingsStorageManager.clarionSettings();
        const solutions = store.get<ClarionSolutionSettings[]>('solutions', []);
        const filtered = solutions.filter(s => !sameSolutionFile(s.solutionFile, solutionFile));

        if (filtered.length !== solutions.length) {
            await store.update('solutions', filtered, targetForKey(store, 'solutions'));
            logger.info(`✅ Removed missing solution from solutions array: ${solutionFile}`);
        }

        if (sameSolutionFile(store.get<string>('currentSolution', ''), solutionFile)) {
            await store.update('currentSolution', '', targetForKey(store, 'currentSolution'));
            logger.info(`✅ Cleared currentSolution`);
        }

        // Legacy pre-solutions-array keys only ever lived in folder settings.
        const config = workspace.getConfiguration('clarion', workspaceFolder.uri);
        const storedSolutionFile = config.get<string>('solutionFile', '');
        if (storedSolutionFile.toLowerCase() === solutionFile.toLowerCase()) {
            await config.update('solutionFile', '', ConfigurationTarget.WorkspaceFolder);
            await config.update('propertiesFile', '', ConfigurationTarget.WorkspaceFolder);
            await config.update('version', '', ConfigurationTarget.WorkspaceFolder);
            await store.update('configuration', '', targetForKey(store, 'configuration'));
            logger.info(`✅ Cleared legacy solutionFile/propertiesFile/version/configuration settings`);
        }
    }
}
