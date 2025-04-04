// Add global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process
});

import LoggerManager from './logger';

// Export these variables for backward compatibility
export { getServerConnectionManager } from './managers/ServerConnectionManager';
export { getRequestHandler } from './managers/RequestHandler';

// Re-export serverInitialized for backward compatibility
export const serverInitialized = () => getServerConnectionManager().isServerInitialized();

// Re-export solutionOperationInProgress for backward compatibility
export const solutionOperationInProgress = () => getRequestHandler().isSolutionOperationInProgress();
import { getServerConnectionManager } from './managers/ServerConnectionManager';
import { getServerDocumentManager } from './managers/ServerDocumentManager';
import { getTokenManager } from './managers/TokenManager';
import { getProviderManager } from './managers/ProviderManager';
import { getRequestHandler } from './managers/RequestHandler';

const logger = LoggerManager.getLogger("Server");
logger.setLevel("error");

// Initialize managers
const serverConnectionManager = getServerConnectionManager();
const serverDocumentManager = getServerDocumentManager();
const providerManager = getProviderManager();
const requestHandler = getRequestHandler();

// Get the connection
const connection = serverConnectionManager.getConnection();

// Register providers
providerManager.registerProviders(connection);

// Register request handlers
requestHandler.registerRequestHandlers(connection);

// Start listening
serverConnectionManager.startListening(serverDocumentManager.getDocuments());
