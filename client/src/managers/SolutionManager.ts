import { ExtensionContext, workspace, window as vscodeWindow, commands, Uri, ConfigurationTarget, Disposable, languages } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';
import { SolutionCache } from '../SolutionCache';
import { DocumentManager } from '../documentManager';
import { globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, globalSettings, setGlobalClarionSelection, ClarionSolutionSettings } from '../globals';
import { getLanguageServerManager } from './LanguageServerManager';
import { getConfigurationManager } from './ConfigurationManager';
import { getViewManager } from './ViewManager';
import { getFileWatcherManager } from './FileWatcherManager';
import { ClarionExtensionCommands } from '../ClarionExtensionCommands';

const logger = LoggerManager.getLogger("SolutionManager");
logger.setLevel("error");

export class SolutionManager {
    private documentManager: DocumentManager | undefined;

    constructor() {
        // Initialize with no document manager
    }

    /**
     * Initialize the solution
     * @param context Extension context
     * @param refreshDocs Whether to refresh open documents
     */
    public async initializeSolution(context: ExtensionContext, refreshDocs: boolean = false): Promise<void> {
        logger.info("🔄 Initializing Clarion Solution...");

        if (!globalSolutionFile || !globalClarionPropertiesFile || !globalClarionVersion) {
            logger.warn("⚠️ Missing required settings (solution file, properties file, or version). Initialization aborted.");
            return;
        }

        // Get configurations from the solution file
        const solutionFileContent = fs.readFileSync(globalSolutionFile, 'utf-8');
        const configManager = getConfigurationManager();
        const availableConfigs = configManager.extractConfigurationsFromSolution(solutionFileContent);

        // Validate the stored configuration
        if (!availableConfigs.includes(globalSettings.configuration)) {
            logger.warn(`⚠️ Invalid configuration detected: ${globalSettings.configuration}. Asking user to select a valid one.`);

            // Prompt user to select a valid configuration
            const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
                placeHolder: "Invalid configuration detected. Select a valid configuration:",
            });

            if (!selectedConfig) {
                vscodeWindow.showWarningMessage("No valid configuration selected. Using 'Debug' as a fallback.");
                globalSettings.configuration = "Debug"; // Safe fallback
            } else {
                globalSettings.configuration = selectedConfig;
            }

            // Save the new selection
            await workspace.getConfiguration().update("clarion.configuration", globalSettings.configuration, ConfigurationTarget.Workspace);
            logger.info(`✅ Updated configuration: ${globalSettings.configuration}`);
        }
        
        // Wait for the language client to be ready before proceeding
        const languageServerManager = getLanguageServerManager();
        const client = languageServerManager.getClient();
        
        if (client) {
            if (!languageServerManager.isClientReady()) {
                logger.info("⏳ Waiting for language client to be ready...");
                try {
                    await client.onReady();
                    logger.info("✅ Language client is now ready.");
                } catch (error) {
                    logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                    vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client failed to start.");
                    return;
                }
            }

            // Get the solution directory
            const solutionDir = path.dirname(globalSolutionFile);

            // Send notification to initialize the server-side solution manager
            client.sendNotification('clarion/updatePaths', {
                redirectionPaths: [globalSettings.redirectionPath],
                projectPaths: [solutionDir],
                solutionFilePath: globalSolutionFile,
                configuration: globalSettings.configuration,
                clarionVersion: globalClarionVersion,
                redirectionFile: globalSettings.redirectionFile,
                macros: globalSettings.macros,
                libsrcPaths: globalSettings.libsrcPaths,
                defaultLookupExtensions: globalSettings.defaultLookupExtensions
            });
            logger.info("✅ Clarion paths/config/version sent to the language server.");
        } else {
            logger.error("❌ Language client is not available.");
            vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
            return;
        }
        
        // Wait a moment for the server to process the notification
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Continue initializing the solution cache and document manager
        this.documentManager = await this.reinitializeEnvironment(refreshDocs);
        
        const viewManager = getViewManager();
        await viewManager.createSolutionTreeView(context);
        
        this.registerLanguageFeatures(context);
        
        await commands.executeCommand("setContext", "clarion.solutionOpen", true);
        
        configManager.updateConfigurationStatusBar(globalSettings.configuration);
        
        // Create file watchers for the solution, project, and redirection files
        const fileWatcherManager = getFileWatcherManager();
        await fileWatcherManager.createSolutionFileWatchers(context);
        
        // Force refresh all open documents to ensure links are generated
        await this.refreshOpenDocuments();
        
        vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);
    }

    /**
     * Reinitialize the environment
     * @param refreshDocs Whether to refresh open documents
     * @returns The document manager
     */
    public async reinitializeEnvironment(refreshDocs: boolean = false): Promise<DocumentManager> {
        logger.info("🔄 Initializing SolutionCache and DocumentManager...");

        // Get the SolutionCache singleton
        const solutionCache = SolutionCache.getInstance();

        // Set the language client in the solution cache
        const languageServerManager = getLanguageServerManager();
        const client = languageServerManager.getClient();
        
        if (client) {
            solutionCache.setLanguageClient(client);
        } else {
            logger.error("❌ Language client not available. Cannot initialize SolutionCache properly.");
        }

        // Initialize the solution cache with the solution file path
        if (globalSolutionFile) {
            await solutionCache.initialize(globalSolutionFile);
        } else {
            logger.warn("⚠️ No solution file path available. SolutionCache will not be initialized.");
        }

        if (this.documentManager) {
            logger.info("🔄 Disposing of existing DocumentManager instance...");
            this.documentManager.dispose();
            this.documentManager = undefined;
        }

        // Create a new DocumentManager
        this.documentManager = await DocumentManager.create();

        if (refreshDocs) {
            logger.info("🔄 Refreshing open documents...");
            await this.refreshOpenDocuments();
        }

        return this.documentManager;
    }

    /**
     * Refresh all open documents
     */
    public async refreshOpenDocuments(): Promise<void> {
        logger.info("🔄 Refreshing all open documents...");

        const defaultLookupExtensions = globalSettings.defaultLookupExtensions;
        logger.info(`🔍 Loaded defaultLookupExtensions: ${JSON.stringify(defaultLookupExtensions)}`);

        // Fetch ALL open documents using the updated method
        const openDocuments = await this.getAllOpenDocuments();

        if (openDocuments.length === 0) {
            logger.warn("⚠️ No open documents found.");
            return;
        }

        for (const document of openDocuments) {
            // Ensure the document manager updates the links
            if (this.documentManager) {
                await this.documentManager.updateDocumentInfo(document);
            }
        }

        logger.info(`✅ Successfully refreshed ${openDocuments.length} open documents.`);
    }

    /**
     * Get all open documents
     * @returns Array of open documents
     */
    public async getAllOpenDocuments(): Promise<any[]> {
        const openDocuments: any[] = [];

        if ("tabGroups" in vscodeWindow) {
            logger.info("✅ Using `window.tabGroups.all` to fetch open tabs.");

            const tabGroups = (vscodeWindow as any).tabGroups.all;

            for (const group of tabGroups) {
                for (const tab of group.tabs) {
                    if (tab.input && "uri" in tab.input) {
                        const documentUri = (tab.input as any).uri as Uri;

                        // Check if this is a file URI (not a settings or other special URI)
                        if (documentUri.scheme === 'file') {
                            let doc = workspace.textDocuments.find(d => d.uri.toString() === documentUri.toString());

                            if (!doc) {
                                try {
                                    doc = await workspace.openTextDocument(documentUri);
                                } catch (error) {
                                    logger.error(`❌ Failed to open document: ${documentUri.fsPath}`, error);
                                }
                            }

                            if (doc) {
                                openDocuments.push(doc);
                                logger.info(`📄 Added document to open list: ${documentUri.fsPath}`);
                            }
                        }
                    }
                }
            }
        } else {
            logger.warn("⚠️ `tabGroups` API not available, falling back to `visibleTextEditors`.");
            return vscodeWindow.visibleTextEditors.map((editor: any) => editor.document);
        }

        logger.info(`🔍 Found ${openDocuments.length} open documents.`);
        return openDocuments;
    }

    /**
     * Register language features
     * @param context Extension context
     */
    public registerLanguageFeatures(context: ExtensionContext): void {
        if (!this.documentManager) {
            logger.warn("⚠️ Cannot register language features: documentManager is undefined!");
            return;
        }

        // Import providers here to avoid circular dependencies
        const { ClarionDocumentLinkProvider } = require('../providers/documentLinkProvier');
        const { ClarionHoverProvider } = require('../providers/hoverProvider');
        const { ClarionDecorator } = require('../ClarionDecorator');

        // Variables to track disposables
        let hoverProviderDisposable: Disposable | undefined;
        let documentLinkProviderDisposable: Disposable | undefined;
        let semanticTokensProviderDisposable: Disposable | undefined;

        // Fix: Ensure only one Document Link Provider is registered
        if (documentLinkProviderDisposable) {
            documentLinkProviderDisposable.dispose(); // Remove old provider if it exists
        }

        logger.info("🔗 Registering Document Link Provider...");

        // Get the default lookup extensions from settings
        const lookupExtensions = globalSettings.defaultLookupExtensions || [".clw", ".inc", ".equ", ".eq", ".int"];

        // Create document selectors for all Clarion file extensions
        const documentSelectors = [
            { scheme: "file", language: "clarion" },
            ...lookupExtensions.map(ext => ({ scheme: "file", pattern: `**/*${ext}` }))
        ];

        // Register the document link provider for all selectors
        documentLinkProviderDisposable = languages.registerDocumentLinkProvider(
            documentSelectors,
            new ClarionDocumentLinkProvider(this.documentManager)
        );
        context.subscriptions.push(documentLinkProviderDisposable);

        // Fix: Ensure only one Hover Provider is registered
        if (hoverProviderDisposable) {
            hoverProviderDisposable.dispose(); // Remove old provider if it exists
        }

        logger.info("📝 Registering Hover Provider...");
        hoverProviderDisposable = languages.registerHoverProvider(
            documentSelectors,
            new ClarionHoverProvider(this.documentManager)
        );
        context.subscriptions.push(hoverProviderDisposable);
        
        // Register Prefix Decorator for variable highlighting
        if (semanticTokensProviderDisposable) {
            semanticTokensProviderDisposable.dispose(); // Remove old provider if it exists
        }
        
        logger.info("🎨 Registering Clarion Decorator for variable and comment highlighting...");
        const clarionDecorator = new ClarionDecorator();
        semanticTokensProviderDisposable = {
            dispose: () => clarionDecorator.dispose()
        };
        context.subscriptions.push(semanticTokensProviderDisposable);
    }

    /**
     * Close the current Clarion solution
     * @param context Extension context
     */
    public async closeClarionSolution(context: ExtensionContext): Promise<void> {
        try {
            logger.info("🔄 Closing Clarion solution...");
            
            // Clear solution-related settings from workspace
            await workspace.getConfiguration().update("clarion.solutionFile", "", ConfigurationTarget.Workspace);
            await workspace.getConfiguration().update("clarion.currentSolution", "", ConfigurationTarget.Workspace);
            
            // Reset global variables
            await setGlobalClarionSelection("", globalClarionPropertiesFile, globalClarionVersion, "");
            
            // Clear the environment variable
            process.env.CLARION_SOLUTION_FILE = "";
            
            // Clear the solution cache to remove any stored locations
            const solutionCache = SolutionCache.getInstance();
            solutionCache.clear();
            
            // Hide the configuration status bar if it exists
            const configManager = getConfigurationManager();
            configManager.hideConfigurationStatusBar();
            
            // Mark solution as closed
            await commands.executeCommand("setContext", "clarion.solutionOpen", false);
            
            // Refresh the solution tree view to show the "Open Solution" button
            const viewManager = getViewManager();
            await viewManager.createSolutionTreeView(context);
            
            // Dispose of any file watchers
            const fileWatcherManager = getFileWatcherManager();
            await fileWatcherManager.createSolutionFileWatchers(context);
            
            vscodeWindow.showInformationMessage("Clarion solution closed successfully.");
        } catch (error) {
            const errMessage = error instanceof Error ? error.message : String(error);
            logger.error("❌ Error closing solution:", error);
            vscodeWindow.showErrorMessage(`Error closing Clarion solution: ${errMessage}`);
        }
    }

    /**
     * Handle workspace trust
     * @param context Extension context
     * @param disposables Array of disposables
     */
    public async workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
        logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

        // Read solution file directly from workspace settings first
        const solutionFileFromSettings = workspace.getConfiguration().get<string>("clarion.solutionFile", "");
        logger.info(`🔍 Solution file from workspace settings: ${solutionFileFromSettings || 'not set'}`);

        // Load settings from workspace.json
        await globalSettings.initialize();
        await globalSettings.initializeFromWorkspace();
        
        // Set environment variable for the server to use if we have a solution file
        if (solutionFileFromSettings && fs.existsSync(solutionFileFromSettings)) {
            process.env.CLARION_SOLUTION_FILE = solutionFileFromSettings;
            logger.info(`✅ Set CLARION_SOLUTION_FILE environment variable from workspace settings: ${solutionFileFromSettings}`);
        }

        // Log the current state of global variables
        logger.info(`🔍 Global settings state after initialization:
            - globalSolutionFile: ${globalSolutionFile || 'not set'}
            - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'not set'}
            - globalClarionVersion: ${globalClarionVersion || 'not set'}
            - configuration: ${globalSettings.configuration || 'not set'}
            - redirectionFile: ${globalSettings.redirectionFile || 'not set'}
            - redirectionPath: ${globalSettings.redirectionPath || 'not set'}`);

        // Dispose of old subscriptions
        disposables.forEach(disposable => disposable.dispose());
        disposables.length = 0;

        // ✅ Only initialize if a solution exists in settings
        if (globalSolutionFile) {
            logger.info("✅ Solution file found. Proceeding with initialization...");
            
            // If properties file or version is missing, try to set defaults
            if (!globalClarionPropertiesFile || !globalClarionVersion) {
                logger.warn("⚠️ Missing Clarion properties file or version. Attempting to use defaults...");
                
                // Try to find a default properties file if not set
                if (!globalClarionPropertiesFile) {
                    const defaultPropertiesPath = path.join(process.env.APPDATA || '', 'SoftVelocity', 'Clarion', 'ClarionProperties.xml');
                    if (fs.existsSync(defaultPropertiesPath)) {
                        logger.info(`✅ Using default properties file: ${defaultPropertiesPath}`);
                        await workspace.getConfiguration().update('clarion.propertiesFile', defaultPropertiesPath, ConfigurationTarget.Workspace);
                        
                        // Use the setGlobalClarionSelection function to update the global variables
                        await setGlobalClarionSelection(
                            globalSolutionFile,
                            defaultPropertiesPath,
                            globalClarionVersion || "Clarion11",
                            globalSettings.configuration
                        );
                    }
                }
                
                // Set a default version if not set
                if (!globalClarionVersion) {
                    const defaultVersion = "Clarion11";
                    logger.info(`✅ Using default Clarion version: ${defaultVersion}`);
                    await workspace.getConfiguration().update('clarion.version', defaultVersion, ConfigurationTarget.Workspace);
                    
                    // Use the setGlobalClarionSelection function to update the global variables
                    await setGlobalClarionSelection(
                        globalSolutionFile,
                        globalClarionPropertiesFile,
                        defaultVersion,
                        globalSettings.configuration
                    );
                }
            }
            
            // Try to initialize even if some settings are missing
            try {
                logger.info("✅ Attempting to initialize Clarion Solution...");
                await this.initializeSolution(context);
                
                // Note: registerLanguageFeatures is already called inside initializeSolution
                // Removed duplicate call to avoid decoration doubling
            } catch (error) {
                logger.error(`❌ Error initializing solution: ${error instanceof Error ? error.message : String(error)}`);
                vscodeWindow.showErrorMessage(`Error initializing Clarion solution. Try using the "Reinitialize Solution" command.`);
            }
        } else {
            logger.warn("⚠️ No solution file found in settings.");
            // Don't show the information message as the solution view will now show an "Open Solution" button
            
            // Make sure the solution tree view is created
            const viewManager = getViewManager();
            await viewManager.createSolutionTreeView();
        }
    }
}

// Singleton instance
let instance: SolutionManager | undefined;

/**
 * Get the SolutionManager instance
 * @returns The SolutionManager instance
 */
export function getSolutionManager(): SolutionManager {
    if (!instance) {
        instance = new SolutionManager();
    }
    return instance;
}
