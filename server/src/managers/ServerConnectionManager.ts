import {
    createConnection,
    Connection,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    ProposedFeatures
} from 'vscode-languageserver/node';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ServerConnectionManager");
logger.setLevel("error");

/**
 * Manages the connection between the server and client
 */
export class ServerConnectionManager {
    private connection: Connection;
    private serverInitialized: boolean = false;

    constructor() {
        // Add global error handlers to prevent crashes
        process.on('uncaughtException', (error) => {
            logger.error(`❌ [CRITICAL] Uncaught exception: ${error.message}`, error);
        });

        process.on('unhandledRejection', (reason: any) => {
            logger.error(`❌ [CRITICAL] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
        });

        // Create connection
        this.connection = createConnection(ProposedFeatures.all);

        // Set up connection handlers
        this.setupConnectionHandlers();
    }

    /**
     * Get the connection instance
     * @returns The connection
     */
    public getConnection(): Connection {
        return this.connection;
    }

    /**
     * Check if the server is initialized
     * @returns True if the server is initialized
     */
    public isServerInitialized(): boolean {
        return this.serverInitialized;
    }

    /**
     * Set the server initialization state
     * @param initialized Whether the server is initialized
     */
    public setServerInitialized(initialized: boolean): void {
        this.serverInitialized = initialized;
    }

    /**
     * Start listening for client connections
     * @param documentsManager The documents manager to listen with
     */
    public startListening(documentsManager: any): void {
        documentsManager.listen(this.connection);
        this.connection.listen();
        logger.info("🟢 Clarion Language Server is now listening for requests.");
    }

    /**
     * Set up connection handlers
     */
    private setupConnectionHandlers(): void {
        // Handle initialize request
        this.connection.onInitialize((params: InitializeParams): InitializeResult => {
            try {
                logger.info(`📥 [CRITICAL] Initialize request received`);
                logger.info(`📥 [CRITICAL] Client capabilities: ${JSON.stringify(params.capabilities)}`);
                logger.info(`📥 [CRITICAL] Client info: ${JSON.stringify(params.clientInfo)}`);
                logger.info(`📥 [CRITICAL] Initialization options: ${JSON.stringify(params.initializationOptions)}`);
                
                // Log workspace folders
                if (params.workspaceFolders) {
                    logger.info(`📥 [CRITICAL] Workspace folders: ${JSON.stringify(params.workspaceFolders)}`);
                } else {
                    logger.info(`📥 [CRITICAL] No workspace folders provided`);
                }
                
                // Log process ID
                if (params.processId) {
                    logger.info(`📥 [CRITICAL] Client process ID: ${params.processId}`);
                } else {
                    logger.info(`📥 [CRITICAL] No client process ID provided`);
                }
                
                // Log root URI
                if (params.rootUri) {
                    logger.info(`📥 [CRITICAL] Root URI: ${params.rootUri}`);
                } else if (params.rootPath) {
                    logger.info(`📥 [CRITICAL] Root path: ${params.rootPath}`);
                } else {
                    logger.info(`📥 [CRITICAL] No root URI or path provided`);
                }
                
                logger.info(`📥 [CRITICAL] Responding with server capabilities`);
                
                // Return server capabilities
                return {
                    capabilities: {
                        textDocumentSync: TextDocumentSyncKind.Incremental,
                        documentFormattingProvider: true,
                        documentSymbolProvider: true,
                        foldingRangeProvider: true,
                        colorProvider: true,
                        definitionProvider: true
                    }
                };
            } catch (error) {
                logger.error(`❌ [CRITICAL] Error in onInitialize: ${error instanceof Error ? error.message : String(error)}`);
                logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
                
                // Return minimal capabilities to avoid crashing
                return {
                    capabilities: {
                        textDocumentSync: TextDocumentSyncKind.Incremental
                    }
                };
            }
        });

        // Handle initialized notification
        this.connection.onInitialized(() => {
            try {
                logger.info(`📥 [CRITICAL] Server initialized notification received`);
                logger.info(`📥 [CRITICAL] Server is now fully initialized`);
                
                // Set the serverInitialized flag
                this.serverInitialized = true;
                
                // Log server process information
                logger.info(`📥 [CRITICAL] Server process ID: ${process.pid}`);
                logger.info(`📥 [CRITICAL] Server platform: ${process.platform}`);
                logger.info(`📥 [CRITICAL] Server architecture: ${process.arch}`);
                logger.info(`📥 [CRITICAL] Node.js version: ${process.version}`);
                
                // Log memory usage
                const memoryUsage = process.memoryUsage();
                logger.info(`📥 [CRITICAL] Memory usage:
                    - RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)} MB
                    - Heap total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB
                    - Heap used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB
                `);
            } catch (error) {
                logger.error(`❌ [CRITICAL] Error in onInitialized: ${error instanceof Error ? error.message : String(error)}`);
                logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
            }
        });

        // Log all incoming notifications
        this.connection.onNotification((method, params) => {
            logger.info(`📥 [INCOMING] Notification received: ${method}`);
        });
    }
}

// Singleton instance
let instance: ServerConnectionManager | undefined;

/**
 * Get the ServerConnectionManager instance
 * @returns The ServerConnectionManager instance
 */
export function getServerConnectionManager(): ServerConnectionManager {
    if (!instance) {
        instance = new ServerConnectionManager();
    }
    return instance;
}