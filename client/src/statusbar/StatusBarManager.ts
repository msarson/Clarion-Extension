import { window, workspace, StatusBarItem, StatusBarAlignment } from 'vscode';
import { globalSolutionFile, getClarionConfigTarget } from '../globals';
import { SolutionCache } from '../SolutionCache';
import LoggerManager from '../LoggerManager';

const logger = LoggerManager.getLogger("StatusBarManager");

/**
 * Status bar items for Clarion extension
 */
let configStatusBarItem: StatusBarItem;
let buildProjectStatusBarItem: StatusBarItem;

/**
 * Updates the configuration status bar with the current Clarion configuration
 * Creates the status bar item if it doesn't exist
 * @param configuration - The configuration name to display (e.g., "Debug", "Release")
 */
export async function updateConfigurationStatusBar(configuration: string): Promise<void> {
    if (!configStatusBarItem) {
        configStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        configStatusBarItem.command = 'clarion.setConfiguration'; // ✅ Clicking will open the config picker
    }

    configStatusBarItem.text = `$(gear) Clarion: ${configuration}`;
    configStatusBarItem.tooltip = "Click to change Clarion configuration";
    configStatusBarItem.show();

    // ✅ Ensure the setting is updated
    const currentConfig = workspace.getConfiguration().get<string>("clarion.configuration");

    if (currentConfig !== configuration) {
        logger.info(`🔄 Updating folder configuration: clarion.configuration = ${configuration}`);
        const target = getClarionConfigTarget();
        if (target && workspace.workspaceFolders) {
            const config = workspace.getConfiguration("clarion", workspace.workspaceFolders[0].uri);
            await config.update("configuration", configuration, target);
        }
    }
}

/**
 * Updates the build project status bar based on the active editor
 * Shows which project(s) the current file belongs to
 * Hides if no solution is open or no active editor
 */
export async function updateBuildProjectStatusBar(): Promise<void> {
    // Only proceed if we have a solution open
    if (!globalSolutionFile) {
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        return;
    }

    // Check if there's an active editor
    const activeEditor = window.activeTextEditor;
    if (!activeEditor) {
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        return;
    }

    // Get the file path of the active editor
    const filePath = activeEditor.document.uri.fsPath;
    
    // Get the SolutionCache instance
    const solutionCache = SolutionCache.getInstance();
    
    // Find all projects the file belongs to
    const projects = solutionCache.findProjectsForFile(filePath);
    
    // Create the status bar item if it doesn't exist
    if (!buildProjectStatusBarItem) {
        buildProjectStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 99); // Position it to the right of the configuration status bar
        buildProjectStatusBarItem.command = 'clarion.buildCurrentProject';
    }
    
    if (projects.length === 1) {
        // If we found exactly one project, show "Build [project name]"
        buildProjectStatusBarItem.text = `$(play) Build ${projects[0].name}`;
        buildProjectStatusBarItem.tooltip = `Build project ${projects[0].name}`;
        buildProjectStatusBarItem.show();
    } else if (projects.length > 1) {
        // If the file is in multiple projects, show "Build (Multiple Projects...)"
        buildProjectStatusBarItem.text = `$(play) Build (Multiple Projects...)`;
        buildProjectStatusBarItem.tooltip = `File is in multiple projects. Click to select which to build.`;
        buildProjectStatusBarItem.show();
    } else {
        // If no project was found, show "Build Solution" instead
        buildProjectStatusBarItem.text = `$(play) Build Solution`;
        buildProjectStatusBarItem.tooltip = `Build the entire solution`;
        buildProjectStatusBarItem.show();
    }
}

/**
 * Hides the configuration status bar item
 */
export function hideConfigurationStatusBar(): void {
    if (configStatusBarItem) {
        configStatusBarItem.hide();
    }
}

/**
 * Hides the build project status bar item
 */
export function hideBuildProjectStatusBar(): void {
    if (buildProjectStatusBarItem) {
        buildProjectStatusBarItem.hide();
    }
}

/**
 * Disposes both status bar items
 * Call this during extension deactivation
 */
export function disposeStatusBars(): void {
    if (configStatusBarItem) {
        configStatusBarItem.dispose();
    }
    if (buildProjectStatusBarItem) {
        buildProjectStatusBarItem.dispose();
    }
}
