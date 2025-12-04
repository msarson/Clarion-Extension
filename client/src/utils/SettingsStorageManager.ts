import { workspace, ConfigurationTarget, window, WorkspaceFolder } from 'vscode';
import LoggerManager from '../logger';
import { ClarionSolutionSettings } from '../globals';
import * as path from 'path';

const logger = LoggerManager.getLogger("SettingsStorageManager");

export enum StorageLocation {
    WorkspaceFolder = 'WorkspaceFolder', // .vscode/settings.json
    Workspace = 'Workspace',             // .code-workspace file
}

export class SettingsStorageManager {
    /**
     * Determines the best storage location based on current workspace setup
     */
    static determineStorageLocation(): StorageLocation {
        // If we have a workspace file, use it
        if (workspace.workspaceFile) {
            logger.info("✅ Using Workspace storage (workspace file exists)");
            return StorageLocation.Workspace;
        }

        // If we have workspace folders, use folder-level settings
        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            logger.info("✅ Using WorkspaceFolder storage (no workspace file)");
            return StorageLocation.WorkspaceFolder;
        }

        // Fallback to workspace (will prompt user if needed)
        logger.warn("⚠️ No workspace or folders found, defaulting to Workspace storage");
        return StorageLocation.Workspace;
    }

    /**
     * Saves Clarion solution settings to the appropriate location
     */
    static async saveSolutionSettings(
        solutionFile: string,
        propertiesFile: string,
        version: string,
        configuration: string
    ): Promise<boolean> {
        try {
            // For folders (not workspaces), we need to ensure .vscode directory exists
            if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0 && !workspace.workspaceFile) {
                const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
                const vscodeDir = path.join(workspaceFolder, '.vscode');
                const fs = require('fs');
                
                // Create .vscode directory if it doesn't exist
                if (!fs.existsSync(vscodeDir)) {
                    fs.mkdirSync(vscodeDir, { recursive: true });
                    logger.info(`✅ Created .vscode directory: ${vscodeDir}`);
                }
            }

            // Get the workspace folder URI for the configuration scope
            const workspaceFolder = workspace.workspaceFolders?.[0];
            
            // Determine target based on workspace setup
            let target: ConfigurationTarget;
            let config: any;
            
            if (workspace.workspaceFile) {
                // We have a .code-workspace file - save to Workspace level
                target = ConfigurationTarget.Workspace;
                config = workspace.getConfiguration('clarion');
                logger.info(`💾 Detected workspace file, using Workspace target`);
            } else if (workspaceFolder) {
                // We only have folders - save to WorkspaceFolder level
                target = ConfigurationTarget.WorkspaceFolder;
                // IMPORTANT: When using WorkspaceFolder, we need to get config with the folder URI
                config = workspace.getConfiguration('clarion', workspaceFolder.uri);
                logger.info(`💾 Detected folder setup, using WorkspaceFolder target`);
                logger.info(`   Folder: ${workspaceFolder.uri.fsPath}`);
            } else {
                // Fallback - no workspace at all
                target = ConfigurationTarget.Workspace;
                config = workspace.getConfiguration('clarion');
                logger.warn(`⚠️ No workspace file or folders, defaulting to Workspace target`);
            }

            logger.info(`💾 Saving settings to ${target === ConfigurationTarget.WorkspaceFolder ? 'WorkspaceFolder' : 'Workspace'}`);

            // Save individual settings with proper scope
            await config.update('solutionFile', solutionFile, target);
            await config.update('propertiesFile', propertiesFile, target);
            await config.update('version', version, target);
            await config.update('configuration', configuration, target);
            await config.update('currentSolution', solutionFile, target);

            // Update solutions array
            await this.updateSolutionsArray(solutionFile, propertiesFile, version, configuration);

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
     * Updates the solutions array (always at workspace level)
     */
    private static async updateSolutionsArray(
        solutionFile: string,
        propertiesFile: string,
        version: string,
        configuration: string
    ): Promise<void> {
        if (!solutionFile) return;

        // Get config with proper scope
        const workspaceFolder = workspace.workspaceFolders?.[0];
        const config = workspaceFolder 
            ? workspace.getConfiguration("clarion", workspaceFolder.uri)
            : workspace.getConfiguration("clarion");
            
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

        // Determine target based on workspace setup
        const target = workspace.workspaceFile 
            ? ConfigurationTarget.Workspace 
            : (workspaceFolder ? ConfigurationTarget.WorkspaceFolder : ConfigurationTarget.Workspace);

        await config.update("solutions", solutions, target);
        logger.info(`✅ Updated solutions array (${solutions.length} solutions)`);
    }

    /**
     * Checks if we should suggest creating a workspace
     * Returns true if:
     * 1. No workspace file exists
     * 2. Multiple solution configurations detected in folder settings
     */
    static async shouldSuggestWorkspace(): Promise<boolean> {
        // Already have workspace file
        if (workspace.workspaceFile) {
            return false;
        }

        // Check if we have multiple solution settings in folder config
        const config = workspace.getConfiguration("clarion");
        const solutions = config.inspect<ClarionSolutionSettings[]>("solutions");

        // Check workspace folder value
        const folderSolutions = solutions?.workspaceFolderValue || [];
        
        if (folderSolutions.length > 1) {
            logger.info("ℹ️ Multiple solutions detected in folder settings - suggesting workspace");
            return true;
        }

        return false;
    }

    /**
     * Migrates settings from folder level to workspace level
     */
    static async migrateToWorkspace(): Promise<boolean> {
        try {
            const config = workspace.getConfiguration("clarion");

            // Get current folder-level settings
            const solutionFile = config.inspect<string>("solutionFile")?.workspaceFolderValue || "";
            const propertiesFile = config.inspect<string>("propertiesFile")?.workspaceFolderValue || "";
            const version = config.inspect<string>("version")?.workspaceFolderValue || "";
            const configuration = config.inspect<string>("configuration")?.workspaceFolderValue || "";
            const solutions = config.inspect<ClarionSolutionSettings[]>("solutions")?.workspaceFolderValue || [];

            // Save to workspace level
            await config.update('clarion.solutionFile', solutionFile, ConfigurationTarget.Workspace);
            await config.update('clarion.propertiesFile', propertiesFile, ConfigurationTarget.Workspace);
            await config.update('clarion.version', version, ConfigurationTarget.Workspace);
            await config.update('clarion.configuration', configuration, ConfigurationTarget.Workspace);
            await config.update('clarion.currentSolution', solutionFile, ConfigurationTarget.Workspace);
            await config.update('clarion.solutions', solutions, ConfigurationTarget.Workspace);

            // Clear folder-level settings (optional - keeps them as fallback)
            // await config.update('clarion.solutionFile', undefined, ConfigurationTarget.WorkspaceFolder);
            // ...etc

            logger.info("✅ Successfully migrated settings to workspace");
            return true;
        } catch (error) {
            logger.error("❌ Error migrating settings to workspace:", error);
            return false;
        }
    }

    /**
     * Creates a workspace file if it doesn't exist
     */
    static async createWorkspaceFile(solutionPath: string): Promise<boolean> {
        try {
            const solutionDir = path.dirname(solutionPath);
            const solutionName = path.basename(solutionPath, '.sln');
            const workspacePath = path.join(solutionDir, `${solutionName}.code-workspace`);

            // Check if workspace already exists
            const fs = require('fs');
            if (fs.existsSync(workspacePath)) {
                logger.info(`ℹ️ Workspace file already exists: ${workspacePath}`);
                return true;
            }

            // Create workspace content
            const workspaceContent = {
                folders: [
                    { path: solutionDir }
                ],
                settings: {}
            };

            fs.writeFileSync(workspacePath, JSON.stringify(workspaceContent, null, 2));
            logger.info(`✅ Created workspace file: ${workspacePath}`);

            // Ask user if they want to open the workspace
            const choice = await window.showInformationMessage(
                `Workspace created: ${path.basename(workspacePath)}. Open it now?`,
                "Open Workspace",
                "Continue Without Opening"
            );

            if (choice === "Open Workspace") {
                const Uri = require('vscode').Uri;
                await require('vscode').commands.executeCommand('vscode.openFolder', Uri.file(workspacePath));
            }

            return true;
        } catch (error) {
            logger.error("❌ Error creating workspace file:", error);
            return false;
        }
    }
}
