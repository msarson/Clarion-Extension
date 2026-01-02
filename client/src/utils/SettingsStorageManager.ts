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

            // Save individual settings
            await config.update('solutionFile', solutionFile, target);
            logger.info(`✅ Saved solutionFile`);
            await config.update('propertiesFile', propertiesFile, target);
            logger.info(`✅ Saved propertiesFile`);
            await config.update('version', version, target);
            logger.info(`✅ Saved version`);
            await config.update('configuration', configuration, target);
            logger.info(`✅ Saved configuration`);
            await config.update('currentSolution', solutionFile, target);
            logger.info(`✅ Saved currentSolution`);

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
