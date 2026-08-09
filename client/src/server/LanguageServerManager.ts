import { workspace, window as vscodeWindow, ExtensionContext, commands } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ErrorAction, CloseAction } from 'vscode-languageclient/node';
import { globalSettings, globalSolutionFile } from '../globals';
import { setLanguageClient, getClientReadyPromise } from '../LanguageClientManager';
import { StructureViewProvider } from '../views/StructureViewProvider';
import LoggerManager from '../utils/LoggerManager';
import * as path from 'path';

const logger = LoggerManager.getLogger("LanguageServerManager");
logger.setLevel("error");

/**
 * Initializes and starts the Clarion Language Server
 * @param context - Extension context
 * @param structureViewProvider - Structure view provider for refresh notifications
 * @returns Language client instance or undefined if failed
 */
export async function startLanguageServer(
    context: ExtensionContext,
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

    const clientOptions: LanguageClientOptions = {
        documentSelector: documentSelectors,
        initializationOptions: {
            settings: workspace.getConfiguration('clarion'),
            lookupExtensions: lookupExtensions,
            // #289: announce the configured solution INSIDE the initialize request itself, so the
            // server knows a solution is coming at t≈0 — the clarion/solutionPending notification
            // proved racy (it queues behind whatever the busy event loop is processing and lost to
            // the 2s no-solution fallback timer by 0ms on Mark's VM).
            configuredSolutionFile: workspace.getConfiguration('clarion').get<string>('currentSolution', '')
                || workspace.getConfiguration('clarion').get<string>('solutionFile', '')
        },
        synchronize: {
            fileEvents: [
                workspace.createFileSystemWatcher(fileWatcherPattern),
                workspace.createFileSystemWatcher(projectFileWatcherPattern)
            ],
        },
        // #341: the provideDefinition middleware that lived here intercepted F12
        // on any `X PROCEDURE` line with a naive textual first-MAP scan (no MODULE
        // blocks, no signatures) and BYPASSED the server, which handles
        // implementation->declaration navigation properly (#330 tiers). Removed
        // with the DocumentManager sweep - the server answers all definitions.
        // Add error handling options.
        // #276 — vscode-languageclient@8 changed the ErrorHandler contract: `error` returns an
        // `ErrorHandlerResult` and `closed` a `CloseHandlerResult` (a `{ action }` object), not the
        // bare `ErrorAction`/`CloseAction` enum the @7 API accepted.
        errorHandler: {
            error: (error, message, count) => {
                logger.error(`Language server error: ${error.message || error}`);
                return { action: ErrorAction.Continue };
            },
            closed: () => {
                logger.warn("Language server connection closed");
                // Always try to restart the server
                return { action: CloseAction.Restart };
            }
        }
    };

    logger.info(`📄 Configured Language Client for extensions: ${lookupExtensions.join(', ')}`);

    const client = new LanguageClient("ClarionLanguageServer", "Clarion Language Server", serverOptions, clientOptions);

    // Start the language client. In vscode-languageclient@8, start() returns a Promise that
    // resolves once the client is ready (the @7 onReady() + Disposable-return API was removed);
    // register stop() for cleanup.
    await client.start();
    context.subscriptions.push({ dispose: () => { void client.stop(); } });

    // Set the client in the LanguageClientManager
    setLanguageClient(client);

    try {
        // Wait for the language client to become ready
        await getClientReadyPromise();
        logger.info("✅ Language client started and is ready");

        // #289: announce a configured solution to the server IMMEDIATELY — long before the full
        // client-side init flow sends clarion/updatePaths. Without this the server's 2s
        // no-solution fallback fires mid-startup (it has no signal a solution is coming), runs
        // the expensive async cross-file validation pass on open documents in degraded
        // no-solution mode, and that work starves the solution load itself. The announcement is
        // just a flag — the real load still arrives via clarion/updatePaths.
        const cfg = workspace.getConfiguration('clarion');
        const configuredSolution = globalSolutionFile
            || cfg.get<string>('currentSolution', '')
            || cfg.get<string>('solutionFile', '');
        if (configuredSolution) {
            client.sendNotification('clarion/solutionPending', { solutionFilePath: configuredSolution });
            logger.info(`⏱️ [STARTUP] clarion/solutionPending sent (${configuredSolution})`);
        }
        
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
        // #297 fix 6 (audit H3): only refresh the Structure view when the notification is about
        // the ACTIVE editor. The server emits this per didOpen/didChange for EVERY document —
        // refreshing on all of them issued extra documentSymbol fetches mid-flight, feeding the
        // generation race that blanked the view.
        client.onNotification('clarion/symbolsRefreshed', (params: { uri: string }) => {
            const activeUri = vscodeWindow.activeTextEditor?.document.uri.toString();
            const same = !!activeUri && !!params?.uri &&
                decodeURIComponent(activeUri).toLowerCase() === decodeURIComponent(params.uri).toLowerCase();
            if (!same) {
                logger.info(`🔄 symbolsRefreshed for non-active document ignored: ${params?.uri}`);
                return;
            }
            logger.info(`🔄 Received symbolsRefreshed notification for active document: ${params.uri}`);
            if (structureViewProvider) {
                structureViewProvider.refresh();
            }
        });

        // Re-invoke the doc-link provider per visible Clarion editor on
        // solution-ready. Uses `vscode.executeDocumentLinkProvider` so the
        // refresh runs without touching document content — no dirty-flag flip.
        // Audit trail for the framing pivot (away from LSP capability backport)
        // lives in GH #160.
        client.onNotification('clarion/refreshDocumentLinks', async () => {
            logger.info(`🔗 Received clarion/refreshDocumentLinks; re-invoking document-link provider on visible editors`);
            for (const editor of vscodeWindow.visibleTextEditors) {
                if (editor.document.languageId === 'clarion') {
                    try {
                        await commands.executeCommand('vscode.executeDocumentLinkProvider', editor.document.uri);
                    } catch (err) {
                        logger.warn(`⚠️ doc-link refresh failed for ${editor.document.uri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
            }
        });

        return client;
    } catch (err) {
        logger.error("❌ Language client failed to start properly", err);
        vscodeWindow.showWarningMessage("Clarion Language Server had issues during startup. Some features may not work correctly.");
        return undefined;
    }
}
