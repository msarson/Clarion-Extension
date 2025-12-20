import { workspace, ExtensionContext, Uri, FileSystemWatcher } from 'vscode';
import { window as vscodeWindow } from 'vscode';
import { globalSettings, globalSolutionFile } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { redirectionService } from '../paths/RedirectionService';
import { DocumentManager } from '../documentManager';
import { refreshSolutionTreeView } from '../views/ViewManager';
import { registerLanguageFeatures } from './LanguageFeatureManager';
import LoggerManager from '../LoggerManager';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("FileWatcherManager");

/**
 * Creates file watchers for solution-specific files
 * @param context - Extension context
 * @param reinitializeEnvironment - Function to reinitialize environment
 * @param documentManager - Document manager instance
 */
export async function createSolutionFileWatchers(
    context: ExtensionContext,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<any>,
    documentManager: DocumentManager | undefined
) {
    // Dispose any existing watchers
    const fileWatchers = context.subscriptions.filter(d => (d as any)._isFileWatcher);
    for (const watcher of fileWatchers) {
        watcher.dispose();
    }

    if (!globalSolutionFile) {
        logger.warn("⚠️ No solution file set, skipping file watcher creation");
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    logger.info(`🔍 Creating file watchers for solution directory: ${solutionDir}`);

    // Create watchers for the solution file itself
    const solutionWatcher = workspace.createFileSystemWatcher(globalSolutionFile);

    // Mark as a file watcher for cleanup
    (solutionWatcher as any)._isFileWatcher = true;

    solutionWatcher.onDidChange(async (uri) => {
        logger.info(`🔄 Solution file changed: ${uri.fsPath}`);
        await handleSolutionFileChange(context, reinitializeEnvironment, documentManager);
    });

    context.subscriptions.push(solutionWatcher);

    // Get the solution cache to access project information
    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (solutionInfo && solutionInfo.projects) {
        // Create watchers for each project file
        for (const project of solutionInfo.projects) {
            const projectFilePath = path.join(project.path, `${project.name}.cwproj`);

            if (fs.existsSync(projectFilePath)) {
                const projectWatcher = workspace.createFileSystemWatcher(projectFilePath);

                // Mark as a file watcher for cleanup
                (projectWatcher as any)._isFileWatcher = true;

                projectWatcher.onDidChange(async (uri) => {
                    logger.info(`🔄 Project file changed: ${uri.fsPath}`);
                    await handleProjectFileChange(context, uri, reinitializeEnvironment, documentManager);
                });

                context.subscriptions.push(projectWatcher);
                logger.info(`✅ Added watcher for project file: ${projectFilePath}`);
            }

            // Create watchers for redirection files in this project
            const projectRedFile = path.join(project.path, globalSettings.redirectionFile);

            if (fs.existsSync(projectRedFile)) {
                const redFileWatcher = workspace.createFileSystemWatcher(projectRedFile);

                // Mark as a file watcher for cleanup
                (redFileWatcher as any)._isFileWatcher = true;

                redFileWatcher.onDidChange(async (uri) => {
                    logger.info(`🔄 Redirection file changed: ${uri.fsPath}`);
                    await handleRedirectionFileChange(context, reinitializeEnvironment, documentManager);
                });

                context.subscriptions.push(redFileWatcher);
                logger.info(`✅ Added watcher for redirection file: ${projectRedFile}`);

                // Get included redirection files from the server
                try {
                    // Get the solution cache to access the server
                    const solutionCache = SolutionCache.getInstance();

                    // Get included redirection files from the server
                    const includedRedFiles = await solutionCache.getIncludedRedirectionFilesFromServer(project.path);

                    // Create watchers for each included redirection file
                    for (const redFile of includedRedFiles) {
                        if (redFile !== projectRedFile && fs.existsSync(redFile)) {
                            const includedRedWatcher = workspace.createFileSystemWatcher(redFile);

                            // Mark as a file watcher for cleanup
                            (includedRedWatcher as any)._isFileWatcher = true;

                            includedRedWatcher.onDidChange(async (uri) => {
                                logger.info(`🔄 Included redirection file changed: ${uri.fsPath}`);
                                await handleRedirectionFileChange(context, reinitializeEnvironment, documentManager);
                            });

                            context.subscriptions.push(includedRedWatcher);
                            logger.info(`✅ Added watcher for included redirection file: ${redFile}`);
                        }
                    }
                } catch (error) {
                    logger.error(`❌ Error getting included redirection files for ${projectRedFile}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
    }

    // Also watch the global redirection file if it exists
    const globalRedFile = path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);

    if (fs.existsSync(globalRedFile)) {
        const globalRedWatcher = workspace.createFileSystemWatcher(globalRedFile);

        // Mark as a file watcher for cleanup
        (globalRedWatcher as any)._isFileWatcher = true;

        globalRedWatcher.onDidChange(async (uri) => {
            logger.info(`🔄 Global redirection file changed: ${uri.fsPath}`);
            await handleRedirectionFileChange(context, reinitializeEnvironment, documentManager);
        });

        context.subscriptions.push(globalRedWatcher);
        logger.info(`✅ Added watcher for global redirection file: ${globalRedFile}`);
    }
}

/**
 * Handles changes to redirection files (.red)
 * Refreshes the solution cache and updates the UI
 */
async function handleRedirectionFileChange(
    context: ExtensionContext,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<any>,
    documentManager: DocumentManager | undefined
) {
    logger.info("🔄 Redirection file changed. Refreshing environment...");

    // Clear the redirection service cache
    redirectionService.clearCache();
    logger.info("✅ Redirection service cache cleared");

    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);

    // Refresh the solution tree view
    await refreshSolutionTreeView();

    // Re-register language features
    registerLanguageFeatures(context, documentManager);

    vscodeWindow.showInformationMessage("Redirection file updated. Solution cache refreshed.");
}

/**
 * Handles changes to solution files (.sln)
 * Refreshes the solution cache and updates the UI
 */
async function handleSolutionFileChange(
    context: ExtensionContext,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<any>,
    documentManager: DocumentManager | undefined
) {
    logger.info("🔄 Solution file changed. Refreshing environment...");

    // If the current solution file is the one that changed, refresh it
    if (globalSolutionFile) {
        // Reinitialize the Solution Cache and Document Manager
        await reinitializeEnvironment(true);

        // Refresh the solution tree view
        await refreshSolutionTreeView();

        // Re-register language features
        registerLanguageFeatures(context, documentManager);

        vscodeWindow.showInformationMessage("Solution file updated. Solution cache refreshed.");
    }
}

/**
 * Handles changes to project files (.cwproj)
 * Refreshes the solution cache and updates the UI
 */
async function handleProjectFileChange(
    context: ExtensionContext,
    uri: Uri,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<any>,
    documentManager: DocumentManager | undefined
) {
    logger.info(`🔄 Project file changed: ${uri.fsPath}. Refreshing environment...`);

    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);

    // Refresh the solution tree view
    await refreshSolutionTreeView();

    // Re-register language features
    registerLanguageFeatures(context, documentManager);

    vscodeWindow.showInformationMessage("Project file updated. Solution cache refreshed.");
}

/**
 * Handles changes to settings
 * Refreshes the solution cache and updates the UI
 */
export async function handleSettingsChange(
    context: ExtensionContext,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<any>,
    documentManager: DocumentManager | undefined
) {
    logger.info("🔄 Updating settings from workspace...");

    // Reinitialize global settings from workspace settings.json
    await globalSettings.initializeFromWorkspace();

    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);

    // Refresh the solution tree view
    await refreshSolutionTreeView();

    // Re-register language features (ensuring links update properly)
    registerLanguageFeatures(context, documentManager);

    vscodeWindow.showInformationMessage("Clarion configuration updated. Solution cache refreshed.");
}


