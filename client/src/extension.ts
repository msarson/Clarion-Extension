import { ExtensionContext, workspace, window, commands, Disposable } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from './logger';
import { globalSettings, globalSolutionFile } from './globals';
import { getLanguageServerManager } from './managers/LanguageServerManager';
import { getFileWatcherManager } from './managers/FileWatcherManager';
import { getViewManager } from './managers/ViewManager';
import { getConfigurationManager } from './managers/ConfigurationManager';
import { getSolutionManager } from './managers/SolutionManager';
import { getCommandManager } from './managers/CommandManager';

const logger = LoggerManager.getLogger("Extension");
logger.setLevel("error");

/**
 * Activate the extension
 * @param context Extension context
 */
export async function activate(context: ExtensionContext): Promise<void> {
    const disposables: Disposable[] = [];
    
    logger.info("🔄 Activating Clarion extension...");

    // Check for open XML files to avoid conflicts with redhat.vscode-xml extension
    const openXmlFiles = workspace.textDocuments.filter(doc =>
        doc.languageId === 'xml' || doc.fileName.toLowerCase().endsWith('.xml')
    );
    
    if (openXmlFiles.length > 0) {
        logger.warn(`⚠️ Found ${openXmlFiles.length} open XML files. This may cause conflicts with the XML extension.`);
        logger.warn("⚠️ Consider closing XML files before using Clarion features to avoid conflicts.");
    }

    // Start the language server
    const languageServerManager = getLanguageServerManager();
    await languageServerManager.startClientServer(context, openXmlFiles.length > 0);

    // ✅ Step 1: Ensure a workspace is saved
    if (!workspace.workspaceFolders) {
        logger.warn("⚠️ No saved workspace detected. Clarion features will be disabled until a workspace is saved.");
        return; // ⛔ Exit early
    }

    // ✅ Step 2: Ensure the workspace is trusted
    if (!workspace.isTrusted) {
        logger.warn("⚠️ Workspace is not trusted. Clarion features will remain disabled until trust is granted.");
        return; // ⛔ Exit early
    }

    // ✅ Step 3: Load workspace settings before initialization
    await globalSettings.initializeFromWorkspace();
    
    // Log the current state of global variables after loading workspace settings
    logger.info(`🔍 Global settings state after loading workspace settings:
        - globalSolutionFile: ${globalSolutionFile || 'not set'}`);

    // Register commands
    const commandManager = getCommandManager();
    commandManager.registerCommands(context);

    // ✅ Watch for changes in Clarion configuration settings
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("clarion.defaultLookupExtensions") || event.affectsConfiguration("clarion.configuration")) {
                logger.info("🔄 Clarion configuration changed. Refreshing the solution cache...");
                await handleSettingsChange(context);
            }
        })
    );

    // Create the file watchers initially
    if (globalSolutionFile) {
        const fileWatcherManager = getFileWatcherManager();
        await fileWatcherManager.createSolutionFileWatchers(context);
        
        // Set up file change handler
        fileWatcherManager.setFileChangeHandler(async (type, context, uri) => {
            const solutionManager = getSolutionManager();
            
            if (type === 'solution') {
                await solutionManager.initializeSolution(context, true);
            } else if (type === 'project') {
                await solutionManager.initializeSolution(context, true);
            } else if (type === 'redirection') {
                await solutionManager.initializeSolution(context, true);
            }
            
            window.showInformationMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} file updated. Solution cache refreshed.`);
        });
    }

    // Re-create file watchers when the solution changes
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("clarion.redirectionFile") ||
                event.affectsConfiguration("clarion.redirectionPath")) {
                logger.info("🔄 Redirection settings changed. Recreating file watchers...");
                const fileWatcherManager = getFileWatcherManager();
                await fileWatcherManager.createSolutionFileWatchers(context);
            }
        })
    );

    // ✅ Ensure all restored tabs are properly indexed (if workspace is already trusted)
    if (workspace.isTrusted) {
        const solutionManager = getSolutionManager();
        await solutionManager.refreshOpenDocuments();

        // Initialize the solution open context variable
        await commands.executeCommand("setContext", "clarion.solutionOpen", !!globalSolutionFile);
        
        // Always create the solution tree view, even if no solution is open
        const viewManager = getViewManager();
        await viewManager.createSolutionTreeView(context);
        
        // Create the structure view
        await viewManager.createStructureView(context);

        // Check if we have a solution file loaded from workspace settings
        if (globalSolutionFile) {
            logger.info(`✅ Solution file found in workspace settings: ${globalSolutionFile}`);
            
            // Wait for the language client to be ready before initializing the solution
            const client = languageServerManager.getClient();
            if (client) {
                logger.info("⏳ Waiting for language client to be ready before initializing solution...");
                
                if (languageServerManager.isClientReady()) {
                    logger.info("✅ Language client is already ready. Proceeding with solution initialization...");
                    await solutionManager.workspaceHasBeenTrusted(context, disposables);
                } else {
                    // Set up a listener for when the client is ready
                    client.onReady().then(async () => {
                        logger.info("✅ Language client is ready. Proceeding with solution initialization...");
                        await solutionManager.workspaceHasBeenTrusted(context, disposables);
                    }).catch(error => {
                        logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                        window.showErrorMessage("Error initializing Clarion solution: Language client failed to start.");
                    });
                }
            } else {
                logger.error("❌ Language client is not available.");
                window.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
            }
        } else {
            logger.warn("⚠️ No solution file found in workspace settings.");
            // Don't show the information message as the solution view will now show an "Open Solution" button
        }
    }

    context.subscriptions.push(...disposables);
}

/**
 * Handle settings changes
 * @param context Extension context
 */
async function handleSettingsChange(context: ExtensionContext) {
    logger.info("🔄 Updating settings from workspace...");

    // Reinitialize global settings from workspace settings.json
    await globalSettings.initializeFromWorkspace();

    // Reinitialize the Solution Cache and Document Manager
    const solutionManager = getSolutionManager();
    await solutionManager.reinitializeEnvironment(true);

    // Refresh the solution tree view
    const viewManager = getViewManager();
    await viewManager.createSolutionTreeView(context);

    window.showInformationMessage("Clarion configuration updated. Solution cache refreshed.");
}

/**
 * Deactivate the extension
 */
export function deactivate(): Thenable<void> | undefined {
    const languageServerManager = getLanguageServerManager();
    return languageServerManager.stopClient();
}