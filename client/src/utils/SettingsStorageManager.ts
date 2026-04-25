import { workspace, ConfigurationTarget, window, WorkspaceFolder } from 'vscode';
import LoggerManager from './LoggerManager';
import { ClarionSolutionSettings } from '../globals';
import * as path from 'path';

const logger = LoggerManager.getLogger("SettingsStorageManager");
logger.setLevel("error"); // Production: Only log errors

export class SettingsStorageManager {
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

            // Ensure .vscode directory exists
            const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
            const vscodeDir = path.join(workspaceFolder, '.vscode');
            const fs = require('fs');
            
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
                logger.info(`✅ Created .vscode directory: ${vscodeDir}`);
            }

            // Always use WorkspaceFolder target (saves to .vscode/settings.json)
            const target = ConfigurationTarget.WorkspaceFolder;
            const config = workspace.getConfiguration('clarion', workspace.workspaceFolders[0].uri);
            
            logger.info(`💾 Saving settings to .vscode/settings.json in ${workspaceFolder}`);
            logger.info(`   Target: WorkspaceFolder (${ConfigurationTarget.WorkspaceFolder})`);
            logger.info(`   Settings to save:
                - solutionFile: ${solutionFile}
                - propertiesFile: ${propertiesFile}
                - version: ${version}
                - configuration: ${configuration}`);

            // Update solutions array FIRST before saving individual settings
            // This prevents the configuration change event from reading stale data
            await this.updateSolutionsArray(solutionFile, propertiesFile, version, configuration);

            // Save currentSolution BEFORE configuration so that when the
            // onDidChangeConfiguration event fires (triggered by the 'configuration' write),
            // initializeFromWorkspace() reads the correct new solution — not the old one.
            await config.update('currentSolution', solutionFile, target);
            logger.info(`✅ Saved currentSolution`);

            // Save configuration (still needed as a standalone key so onDidChangeConfiguration fires)
            await config.update('configuration', configuration, target);
            logger.info(`✅ Saved configuration`);

            // Remove legacy individual keys that are now fully covered by the solutions array
            for (const legacyKey of ['solutionFile', 'propertiesFile', 'version'] as const) {
                const inspection = config.inspect(legacyKey);
                if (inspection?.workspaceFolderValue !== undefined) {
                    await config.update(legacyKey, undefined, target);
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
     * Updates the configuration of the active solution in the solutions array,
     * and writes the standalone clarion.configuration key (so onDidChangeConfiguration fires).
     * Call this whenever the user changes the build configuration.
     */
    static async updateActiveConfiguration(configuration: string): Promise<void> {
        const workspaceFolder = workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const config = workspace.getConfiguration('clarion', workspaceFolder.uri);
        const currentSolution = config.get<string>('currentSolution', '');
        const solutions = config.get<ClarionSolutionSettings[]>('solutions', []);

        const idx = currentSolution
            ? solutions.findIndex(s => s.solutionFile === currentSolution)
            : -1;

        if (idx >= 0) {
            solutions[idx] = { ...solutions[idx], configuration };
            await config.update('solutions', solutions, ConfigurationTarget.WorkspaceFolder);
        }

        await config.update('configuration', configuration, ConfigurationTarget.WorkspaceFolder);
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

        const config = workspace.getConfiguration('clarion', workspaceFolder.uri);
        const solutions = config.get<ClarionSolutionSettings[]>('solutions', []);
        const filtered = solutions.filter(s => s.solutionFile.toLowerCase() !== solutionFile.toLowerCase());

        if (filtered.length !== solutions.length) {
            await config.update('solutions', filtered, ConfigurationTarget.WorkspaceFolder);
            logger.info(`✅ Removed missing solution from solutions array: ${solutionFile}`);
        }

        const currentSolution = config.get<string>('currentSolution', '');
        if (currentSolution.toLowerCase() === solutionFile.toLowerCase()) {
            await config.update('currentSolution', '', ConfigurationTarget.WorkspaceFolder);
            logger.info(`✅ Cleared currentSolution`);
        }

        const storedSolutionFile = config.get<string>('solutionFile', '');
        if (storedSolutionFile.toLowerCase() === solutionFile.toLowerCase()) {
            await config.update('solutionFile', '', ConfigurationTarget.WorkspaceFolder);
            await config.update('propertiesFile', '', ConfigurationTarget.WorkspaceFolder);
            await config.update('version', '', ConfigurationTarget.WorkspaceFolder);
            await config.update('configuration', '', ConfigurationTarget.WorkspaceFolder);
            logger.info(`✅ Cleared legacy solutionFile/propertiesFile/version/configuration settings`);
        }
    }

    /**
     * Updates the solutions array in folder settings
     */
    private static async updateSolutionsArray(
        solutionFile: string,
        propertiesFile: string,
        version: string,
        configuration: string
    ): Promise<void> {
        if (!solutionFile) return;

        const workspaceFolder = workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const config = workspace.getConfiguration("clarion", workspaceFolder.uri);
        const solutions = config.get<ClarionSolutionSettings[]>("solutions", []);

        const solutionIndex = solutions.findIndex(s => s.solutionFile === solutionFile);

        if (solutionIndex >= 0) {
            // Update existing solution
            solutions[solutionIndex] = {
                solutionFile,
                propertiesFile,
                version,
                configuration
            };
        } else {
            // Add new solution
            solutions.push({
                solutionFile,
                propertiesFile,
                version,
                configuration
            });
        }

        await config.update("solutions", solutions, ConfigurationTarget.WorkspaceFolder);
        logger.info(`✅ Updated solutions array (${solutions.length} solutions)`);
    }
}
