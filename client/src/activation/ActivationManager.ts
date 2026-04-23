import { commands, window, ExtensionContext, TreeView, workspace, Disposable, languages, extensions, window as vscodeWindow } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { DocumentManager } from '../documentManager';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { StructureViewProvider } from '../views/StructureViewProvider';
import { StatusViewProvider } from '../StatusViewProvider';
import { TreeNode } from '../TreeNode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSolutionFile, globalSettings } from '../globals';
import LoggerManager from '../utils/LoggerManager';
import { isClientReady, getClientReadyPromise } from '../LanguageClientManager';

import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { updateBuildProjectStatusBar } from '../statusbar/StatusBarManager';
import { createSolutionFileWatchers, handleSettingsChange } from '../providers/FileWatcherManager';
import { startLanguageServer } from '../server/LanguageServerManager';
import { refreshOpenDocuments } from '../document/DocumentRefreshManager';

const logger = LoggerManager.getLogger("ActivationManager");
logger.setLevel("error"); // Production: Only log errors

export interface ActivationState {
    client?: LanguageClient;
    treeView?: TreeView<TreeNode>;
    solutionTreeDataProvider?: SolutionTreeDataProvider;
    structureViewProvider?: StructureViewProvider;
    structureView?: TreeView<any>;
    documentManager?: DocumentManager;
    diagnosticCollection: any;
}

export async function initializeGlobalState(context: ExtensionContext): Promise<void> {
    logger.info("🔄 Phase 1: Extension activation begin...");
    GlobalSolutionHistory.initialize(context);
    logger.info("✅ Global solution history initialized");
}

export async function checkConflictingExtensions(context: ExtensionContext): Promise<void> {
    logger.info("🔄 Phase 3: Checking for conflicting extensions...");
    const fushinsoftExtension = extensions.getExtension('fushnisoft.clarion');
    if (fushinsoftExtension) {
        const hasShownFushinsoftMessage = context.globalState.get<boolean>('clarion.hasShownFushinsoftMessage', false);
        
        if (!hasShownFushinsoftMessage) {
            const action = await window.showInformationMessage(
                "The fushnisoft.clarion extension is no longer needed. All syntax highlighting and language features are now included in Clarion Extensions. Would you like to uninstall it?",
                "Uninstall fushnisoft.clarion",
                "Keep Both",
                "Don't Show Again"
            );
            
            if (action === "Uninstall fushnisoft.clarion") {
                try {
                    await commands.executeCommand('workbench.extensions.uninstallExtension', 'fushnisoft.clarion');
                    window.showInformationMessage("fushnisoft.clarion has been uninstalled. Please reload VS Code for changes to take effect.", "Reload Now").then(selection => {
                        if (selection === "Reload Now") {
                            commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                } catch (error) {
                    logger.error("Failed to uninstall fushnisoft.clarion", error);
                    window.showWarningMessage("Could not automatically uninstall fushnisoft.clarion. Please uninstall it manually from the Extensions view.");
                }
            }
            await context.globalState.update('clarion.hasShownFushinsoftMessage', true);
        }
    }
    logger.info("✅ Phase 3 complete: Conflict check done");
}

export function registerEventListeners(context: ExtensionContext): void {
    logger.info("🔄 Phase 4: Setting up event listeners...");
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor(() => {
            updateBuildProjectStatusBar();
        })
    );
    logger.info("✅ Phase 4 complete: Event listeners registered");
}

export function checkForOpenXmlFiles(): number {
    logger.info("🔄 Phase 5: Checking for open XML files...");
    const openXmlFiles = workspace.textDocuments.filter(doc =>
        doc.languageId === 'xml' || doc.fileName.toLowerCase().endsWith('.xml')
    );
    
    if (openXmlFiles.length > 0) {
        logger.warn(`⚠️ Found ${openXmlFiles.length} open XML files. This may cause conflicts with the XML extension.`);
        logger.warn("⚠️ Consider closing XML files before using Clarion features to avoid conflicts.");
    }
    logger.info("✅ Phase 5 complete: XML check done");
    return openXmlFiles.length;
}

export async function startClientServer(
    context: ExtensionContext,
    state: ActivationState,
    hasOpenXmlFiles: boolean = false
): Promise<void> {
    logger.info("🔄 Phase 6: Starting language server...");
    logger.info("✅ Using SVG icons from images directory");

    if (!state.client) {
        logger.info("🚀 Starting Clarion Language Server...");
        state.client = await startLanguageServer(context, state.documentManager, state.structureViewProvider);
    }
    logger.info("✅ Phase 6 complete: Language server started");
}

export function checkFolderStatus(): { hasFolder: boolean; isTrusted: boolean } {
    logger.info("🔄 Phase 7: Checking folder status...");
    const hasFolder = !!(workspace.workspaceFolders && workspace.workspaceFolders.length > 0);
    const isTrusted = workspace.isTrusted;
    logger.info(`   - Has folder open: ${hasFolder}`);
    logger.info(`   - Is trusted: ${isTrusted}`);
    if (workspace.workspaceFolders) {
        logger.info(`   - Folders: ${workspace.workspaceFolders.map(f => f.uri.fsPath).join(', ')}`);
    }
    return { hasFolder, isTrusted };
}

export function handleNoFolderScenario(hasFolder: boolean): void {
    logger.info("🔄 Phase 8: Handling no-folder scenario...");
    if (!hasFolder) {
        logger.info("ℹ️ No folder open. Solution View will show recent solutions.");
        logger.info("📝 Operating in no-folder mode: basic language features available");
    }
    logger.info("✅ Phase 8 complete");
}

export function checkFolderTrust(hasFolder: boolean, isTrusted: boolean): boolean {
    logger.info("🔄 Phase 9: Checking folder trust...");
    if (hasFolder && !isTrusted) {
        logger.warn("⚠️ Folder is not trusted. Clarion features will remain disabled until trust is granted.");
        window.showWarningMessage("Clarion extension requires folder trust to enable features.");
        return false;
    }
    logger.info("✅ Phase 9 complete");
    return true;
}

export async function loadFolderSettings(hasFolder: boolean): Promise<void> {
    logger.info("🔄 Phase 10: Loading folder settings...");
    if (hasFolder) {
        logger.info("   - Calling globalSettings.initializeFromWorkspace()...");
        try {
            const { globalSettings } = await import('../globals');
            await globalSettings.initializeFromWorkspace();
            logger.info("   - initializeFromWorkspace() completed successfully");
        } catch (error) {
            logger.error("   - ❌ Error in initializeFromWorkspace():", error);
            throw error;
        }
        
        logger.info(`🔍 Global settings state after loading folder settings:
            - globalSolutionFile: ${globalSolutionFile || 'not set'}
            - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'not set'}
            - globalClarionVersion: ${globalClarionVersion || 'not set'}`);
    } else {
        logger.info("ℹ️ Skipping folder settings - no folder open");
    }
    logger.info("✅ Phase 10 complete");
}

export async function setupFolderDependentFeatures(
    context: ExtensionContext,
    hasFolder: boolean,
    isTrusted: boolean,
    state: ActivationState,
    isRefreshingRef: { value: boolean },
    reinitializeEnvironment: (refreshDocs?: boolean) => Promise<DocumentManager>,
    workspaceHasBeenTrusted: (context: ExtensionContext, disposables: Disposable[]) => Promise<void>,
    disposables: Disposable[]
): Promise<void> {
    if (hasFolder && isTrusted) {
        context.subscriptions.push(
            workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration("clarion.defaultLookupExtensions") || event.affectsConfiguration("clarion.configuration")) {
                    logger.info("🔄 Clarion configuration changed. Refreshing the solution cache...");
                    
                    // Reload the configuration from workspace settings
                    if (event.affectsConfiguration("clarion.configuration")) {
                        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                            const workspaceFolder = workspace.workspaceFolders[0];
                            const config = workspace.getConfiguration("clarion", workspaceFolder.uri);
                            const configValue = config.get<string>("configuration", "");
                            if (configValue) {
                                globalSettings.configuration = configValue;
                                logger.info(`✅ Updated globalSettings.configuration to: ${configValue}`);
                            }
                        } else {
                            logger.info(`ℹ️ No workspace folder open - using in-memory configuration: ${globalSettings.configuration}`);
                        }
                    }
                    
                    await handleSettingsChange(context, reinitializeEnvironment, state.documentManager);
                }
            })
        );

        if (globalSolutionFile) {
            await createSolutionFileWatchers(context, reinitializeEnvironment, state.documentManager);
        }

        context.subscriptions.push(
            workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration("clarion.redirectionFile") ||
                    event.affectsConfiguration("clarion.redirectionPath")) {
                    logger.info("🔄 Redirection settings changed. Recreating file watchers...");
                    await createSolutionFileWatchers(context, reinitializeEnvironment, state.documentManager);
                }
            })
        );

        if (!isRefreshingRef.value) {
            await refreshOpenDocuments(state.documentManager);

            if (globalSolutionFile) {
                logger.info(`✅ Solution file found in folder settings: ${globalSolutionFile}`);
                
                if (state.client) {
                    logger.info("⏳ Waiting for language client to be ready before initializing solution...");
                    
                    if (isClientReady()) {
                        logger.info("✅ Language client is already ready. Proceeding with solution initialization...");
                        await workspaceHasBeenTrusted(context, disposables);
                    } else {
                        getClientReadyPromise().then(async () => {
                            logger.info("✅ Language client is ready. Proceeding with solution initialization...");
                            await workspaceHasBeenTrusted(context, disposables);
                        }).catch(error => {
                            logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                            vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client failed to start.");
                        });
                    }
                } else {
                    logger.error("❌ Language client is not available.");
                    vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
                }
            } else {
                logger.warn("⚠️ No solution file found in folder settings.");
            }
        }
    } else {
        logger.info("ℹ️ Advanced features disabled: no folder open or folder not trusted");
    }
}
