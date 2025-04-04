import { ExtensionContext, workspace, window as vscodeWindow, extensions } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ErrorAction, CloseAction } from 'vscode-languageclient/node';
import * as path from 'path';
import LoggerManager from '../logger';
import { globalSettings } from '../globals';

const logger = LoggerManager.getLogger("LanguageServerManager");
logger.setLevel("error");

export class LanguageServerManager {
    private client: LanguageClient | undefined;
    private clientReady: boolean = false;

    constructor() {
        // Initialize with no client
    }

    /**
     * Start the language server
     * @param context Extension context
     * @param hasOpenXmlFiles Whether there are open XML files that might cause conflicts
     * @returns Promise that resolves when the server is ready
     */
    public async startClientServer(context: ExtensionContext, hasOpenXmlFiles: boolean = false): Promise<void> {
        try {
            logger.info("🔍 [DEBUG] Starting Clarion Language Server...");
            
            // Log XML extension status
            try {
                const xmlExtension = extensions.getExtension('redhat.vscode-xml');
                logger.info(`🔍 [DEBUG] XML extension status: ${xmlExtension ? (xmlExtension.isActive ? 'active' : 'inactive') : 'not installed'}`);
            } catch (xmlError) {
                logger.error(`🔍 [DEBUG] Error checking XML extension: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
            }
            
            // Log open documents
            try {
                const openDocs = workspace.textDocuments;
                logger.info(`🔍 [DEBUG] Open documents (${openDocs.length}): ${openDocs.map(d => d.fileName).join(', ')}`);
                
                // Check for XML files and log details
                for (const doc of openDocs) {
                    if (doc.fileName.toLowerCase().endsWith('.xml') || doc.fileName.toLowerCase().endsWith('.cwproj')) {
                        logger.info(`🔍 [DEBUG] XML file details: ${doc.fileName}, language: ${doc.languageId}, version: ${doc.version}`);
                    }
                }
            } catch (docsError) {
                logger.error(`🔍 [DEBUG] Error checking open documents: ${docsError instanceof Error ? docsError.message : String(docsError)}`);
            }
            
            // Skip the delay if there are XML files open
            if (hasOpenXmlFiles) {
                logger.info(`🔍 [DEBUG] XML files are open, skipping delay and proceeding with initialization...`);
            } else {
                // Add a shorter delay to allow other extensions to initialize first
                const delayTime = 1000; // Use a shorter delay
                logger.info(`🔍 [DEBUG] Waiting for other extensions to initialize (${delayTime}ms delay)...`);
                
                // Use a different approach for the delay
                const startTime = Date.now();
                let elapsedTime = 0;
                
                while (elapsedTime < delayTime) {
                    // Check every 100ms
                    await new Promise(resolve => setTimeout(resolve, 100));
                    elapsedTime = Date.now() - startTime;
                    
                    // Log progress every 500ms
                    if (elapsedTime % 500 < 100) {
                        logger.info(`🔍 [DEBUG] Delay progress: ${elapsedTime}ms / ${delayTime}ms`);
                    }
                }
                
                logger.info("🔍 [DEBUG] Delay completed. Continuing with Clarion Language Server initialization...");
            }
        } catch (startupError) {
            logger.error(`🔍 [DEBUG] Error during startup delay: ${startupError instanceof Error ? startupError.message : String(startupError)}`);
        }
        
        let serverModule = context.asAbsolutePath(path.join('out', 'server', 'src', 'server.js'));
        let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

        let serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
        };

        // Get the default lookup extensions from settings
        const lookupExtensions = globalSettings.defaultLookupExtensions || [".clw", ".inc", ".equ", ".eq", ".int"];

        // Create document selectors for all Clarion file extensions
        const documentSelectors = [
            { scheme: 'file', language: 'clarion' },
            ...lookupExtensions.map(ext => ({ scheme: 'file', pattern: `**/*${ext}` }))
        ];

        // Create file watcher pattern for all extensions
        const fileWatcherPattern = `**/*.{${lookupExtensions.map(ext => ext.replace('.', '')).join(',')}}`;

        // Create file watcher pattern for redirection, solution, and project files
        const projectFileWatcherPattern = "**/*.{red,sln,cwproj}";

        let clientOptions: LanguageClientOptions = {
            documentSelector: documentSelectors,
            initializationOptions: {
                settings: workspace.getConfiguration('clarion'),
                lookupExtensions: lookupExtensions
            },
            synchronize: {
                fileEvents: [
                    workspace.createFileSystemWatcher(fileWatcherPattern),
                    workspace.createFileSystemWatcher(projectFileWatcherPattern)
                ],
            },
            // Add error handling options
            errorHandler: {
                error: (error, message, count) => {
                    logger.error(`Language server error: ${error.message || error}`);
                    return ErrorAction.Continue;
                },
                closed: () => {
                    logger.warn("Language server connection closed");
                    // Always try to restart the server
                    return CloseAction.Restart;
                }
            }
        };

        logger.info(`📄 Configured Language Client for extensions: ${lookupExtensions.join(', ')}`);

        this.client = new LanguageClient("ClarionLanguageServer", "Clarion Language Server", serverOptions, clientOptions);
        
        // Start the language client
        const disposable = this.client.start();
        context.subscriptions.push(disposable);

        // Reset client ready state
        this.clientReady = false;

        try {
            // Wait for the language client to become ready
            await this.client.onReady();
            logger.info("✅ Language client started and is ready");
            this.clientReady = true;
        } catch (err) {
            logger.error("❌ Language client failed to start properly", err);
            vscodeWindow.showWarningMessage("Clarion Language Server had issues during startup. Some features may not work correctly.");
            this.client = undefined;
        }
    }

    /**
     * Get the language client instance
     * @returns The language client or undefined if not started
     */
    public getClient(): LanguageClient | undefined {
        return this.client;
    }

    /**
     * Check if the client is ready
     * @returns True if the client is ready, false otherwise
     */
    public isClientReady(): boolean {
        return this.clientReady;
    }

    /**
     * Stop the language client
     * @returns Promise that resolves when the client is stopped
     */
    public stopClient(): Thenable<void> | undefined {
        if (!this.client) {
            return undefined;
        }
        return this.client.stop();
    }
}

// Singleton instance
let instance: LanguageServerManager | undefined;

/**
 * Get the LanguageServerManager instance
 * @returns The LanguageServerManager instance
 */
export function getLanguageServerManager(): LanguageServerManager {
    if (!instance) {
        instance = new LanguageServerManager();
    }
    return instance;
}