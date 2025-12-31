import { workspace, window as vscodeWindow, ExtensionContext, Location, Position } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ErrorAction, CloseAction } from 'vscode-languageclient/node';
import { globalSettings } from '../globals';
import { setLanguageClient, getClientReadyPromise } from '../LanguageClientManager';
import { DocumentManager } from '../documentManager';
import { StructureViewProvider } from '../views/StructureViewProvider';
import LoggerManager from '../utils/LoggerManager';
import * as path from 'path';

const logger = LoggerManager.getLogger("LanguageServerManager");

/**
 * Initializes and starts the Clarion Language Server
 * @param context - Extension context
 * @param documentManager - Document manager instance for middleware
 * @param structureViewProvider - Structure view provider for refresh notifications
 * @returns Language client instance or undefined if failed
 */
export async function startLanguageServer(
    context: ExtensionContext,
    documentManager: DocumentManager | undefined,
    structureViewProvider: StructureViewProvider | undefined
): Promise<LanguageClient | undefined> {
    try {
        // Check if other extensions (particularly XML extensions) have open files
        const hasOpenXmlFiles = workspace.textDocuments.some(doc => 
            doc.uri.scheme === 'file' && 
            (doc.uri.fsPath.toLowerCase().endsWith('.xml') || 
             doc.uri.fsPath.toLowerCase().endsWith('.sln'))
        );
        
        // Skip the delay if there are XML files open
        if (hasOpenXmlFiles) {
            logger.info(`🔍 [DEBUG] XML files are open, skipping delay and proceeding with initialization...`);
        } else {
            // Minimal delay to allow other extensions to initialize first
            const delayTime = 100; // Reduced to minimal delay
            logger.info(`🔍 [DEBUG] Minimal wait for other extensions (${delayTime}ms delay)...`);
            
            // Simple timeout instead of polling
            await new Promise(resolve => setTimeout(resolve, delayTime));
            
            logger.info("🔍 [DEBUG] Delay completed. Continuing with Clarion Language Server initialization...");
        }
    } catch (startupError) {
        logger.error(`🔍 [DEBUG] Error during startup delay: ${startupError instanceof Error ? startupError.message : String(startupError)}`);
    }

    const serverModule = context.asAbsolutePath(path.join('out', 'server', 'src', 'server.js'));
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.stdio, options: debugOptions }
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

    const clientOptions: LanguageClientOptions = {
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
        middleware: {
            provideDefinition: async (document, position, token, next) => {
                logger.info(`🔥 CLIENT MIDDLEWARE: Definition request for ${document.uri.toString()} at ${position.line}:${position.character}`);
                
                // First check if we're on a PROCEDURE implementation - if so, find MAP declaration
                // This handles reverse navigation: implementation → declaration
                if (documentManager) {
                    const line = document.lineAt(position.line);
                    const lineText = line.text;
                    
                    // Match: ProcName PROCEDURE(...) or Class.MethodName PROCEDURE(...)
                    const procMatch = lineText.match(/^\s*([A-Za-z_][A-Za-z0-9_\.]*)\s+PROCEDURE/i);
                    if (procMatch) {
                        const fullName = procMatch[1];
                        const simpleName = fullName.includes('.') ? fullName.split('.').pop()! : fullName;
                        
                        logger.info(`Detected PROCEDURE implementation: ${fullName} (simple: ${simpleName})`);
                        
                        // Search for MAP declaration
                        const content = document.getText();
                        const lines = content.split('\n');
                        
                        for (let i = 0; i < lines.length; i++) {
                            const mapLine = lines[i].trim().toUpperCase();
                            
                            if (mapLine === 'MAP') {
                                logger.info(`Found MAP block at line ${i}`);
                                logger.info(`End of MAP block searching for: ${simpleName}`);
                                
                                for (let j = i + 1; j < lines.length; j++) {
                                    const declLine = lines[j].trim();
                                    logger.info(`Checking MAP declaration: ${declLine} against ${simpleName}`);
                                    
                                    if (declLine.toUpperCase().startsWith('END')) {
                                        break;
                                    }
                                    
                                    // Match procedure name at start of line, possibly followed by whitespace and PROCEDURE keyword
                                    const declMatch = declLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+(PROCEDURE|FUNCTION|CLASS)/i);
                                    if (declMatch && declMatch[1].toUpperCase() === simpleName.toUpperCase()) {
                                        logger.info(`Found MAP declaration for ${simpleName} at line ${j} - returning location`);
                                        return [new Location(document.uri, new Position(j, 0))];
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
                
                // Not a PROCEDURE implementation, let server handle it
                return next(document, position, token);
            }
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

    const client = new LanguageClient("ClarionLanguageServer", "Clarion Language Server", serverOptions, clientOptions);
    
    // Start the language client
    const disposable = client.start();
    context.subscriptions.push(disposable);

    // Set the client in the LanguageClientManager
    setLanguageClient(client);

    try {
        // Wait for the language client to become ready
        await getClientReadyPromise();
        logger.info("✅ Language client started and is ready");
        
        // Log server capabilities
        const capabilities = client.initializeResult?.capabilities;
        logger.info(`📋 Server capabilities: ${JSON.stringify(capabilities, null, 2)}`);
        logger.info(`📋 Full initializeResult: ${JSON.stringify(client.initializeResult, null, 2)}`);
        if (capabilities?.definitionProvider) {
            logger.info("✅ Server reports definitionProvider capability is enabled");
        } else {
            logger.error("❌ Server does NOT report definitionProvider capability!");
            logger.error(`❌ Capabilities object: ${JSON.stringify(capabilities)}`);
        }
        
        // 🔄 Listen for symbol refresh notifications from server
        client.onNotification('clarion/symbolsRefreshed', (params: { uri: string }) => {
            logger.info(`🔄 Received symbolsRefreshed notification for: ${params.uri}`);
            if (structureViewProvider) {
                structureViewProvider.refresh();
            }
        });

        return client;
    } catch (err) {
        logger.error("❌ Language client failed to start properly", err);
        vscodeWindow.showWarningMessage("Clarion Language Server had issues during startup. Some features may not work correctly.");
        return undefined;
    }
}
