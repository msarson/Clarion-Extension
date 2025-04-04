import { ExtensionContext, workspace, Disposable } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';
import { globalSettings, globalSolutionFile } from '../globals';
import { SolutionCache } from '../SolutionCache';

const logger = LoggerManager.getLogger("FileWatcherManager");
logger.setLevel("error");

export class FileWatcherManager {
    /**
     * Create file watchers for solution-specific files
     * @param context Extension context
     */
    public async createSolutionFileWatchers(context: ExtensionContext): Promise<void> {
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
            await this.handleSolutionFileChange(context);
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
                        await this.handleProjectFileChange(context, uri);
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
                        await this.handleRedirectionFileChange(context);
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
                                    await this.handleRedirectionFileChange(context);
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
                await this.handleRedirectionFileChange(context);
            });

            context.subscriptions.push(globalRedWatcher);
            logger.info(`✅ Added watcher for global redirection file: ${globalRedFile}`);
        }
    }

    /**
     * Handles changes to redirection files (.red)
     * Refreshes the solution cache and updates the UI
     */
    private async handleRedirectionFileChange(context: ExtensionContext) {
        logger.info("🔄 Redirection file changed. Refreshing environment...");

        // Emit an event that will be handled by the extension
        this.emitFileChangeEvent('redirection', context);
    }

    /**
     * Handles changes to solution files (.sln)
     * Refreshes the solution cache and updates the UI
     */
    private async handleSolutionFileChange(context: ExtensionContext) {
        logger.info("🔄 Solution file changed. Refreshing environment...");

        // If the current solution file is the one that changed, refresh it
        if (globalSolutionFile) {
            // Emit an event that will be handled by the extension
            this.emitFileChangeEvent('solution', context);
        }
    }

    /**
     * Handles changes to project files (.cwproj)
     * Refreshes the solution cache and updates the UI
     */
    private async handleProjectFileChange(context: ExtensionContext, uri: any) {
        logger.info(`🔄 Project file changed: ${uri.fsPath}. Refreshing environment...`);

        // Emit an event that will be handled by the extension
        this.emitFileChangeEvent('project', context, uri);
    }

    /**
     * Emit a file change event to be handled by subscribers
     */
    private emitFileChangeEvent(type: 'solution' | 'project' | 'redirection', context: ExtensionContext, uri?: any) {
        // We'll use the event emitter pattern in the future
        // For now, we'll just call the handler directly from the extension
        if (this.fileChangeHandler) {
            this.fileChangeHandler(type, context, uri);
        }
    }

    // Event handler for file changes
    private fileChangeHandler: ((type: 'solution' | 'project' | 'redirection', context: ExtensionContext, uri?: any) => void) | undefined;

    /**
     * Set the file change handler
     * @param handler The handler function
     */
    public setFileChangeHandler(handler: (type: 'solution' | 'project' | 'redirection', context: ExtensionContext, uri?: any) => void) {
        this.fileChangeHandler = handler;
    }
}

// Singleton instance
let instance: FileWatcherManager | undefined;

/**
 * Get the FileWatcherManager instance
 * @returns The FileWatcherManager instance
 */
export function getFileWatcherManager(): FileWatcherManager {
    if (!instance) {
        instance = new FileWatcherManager();
    }
    return instance;
}