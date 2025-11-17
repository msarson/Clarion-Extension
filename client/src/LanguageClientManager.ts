import { LanguageClient } from 'vscode-languageclient/node';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("LanguageClientManager");
logger.setLevel("error");

/**
 * LanguageClientManager is a singleton class that manages the language client's ready state
 * and provides a promise that resolves when the client is ready.
 */
export class LanguageClientManager {
    private static instance: LanguageClientManager | null = null;
    private client: LanguageClient | null = null;
    private _isReady: boolean = false;
    private _readyPromiseResolve: (() => void) | null = null;
    private _readyPromise: Promise<void>;

    private constructor() {
        // Create a promise that will be resolved when the client is ready
        this._readyPromise = new Promise<void>((resolve) => {
            this._readyPromiseResolve = resolve;
        });
    }

    /**
     * Gets the singleton instance of LanguageClientManager
     */
    public static getInstance(): LanguageClientManager {
        if (!LanguageClientManager.instance) {
            LanguageClientManager.instance = new LanguageClientManager();
        }
        return LanguageClientManager.instance;
    }

    /**
     * Sets the language client and initializes the ready state
     * @param client The language client
     */
    public setClient(client: LanguageClient): void {
        this.client = client;
        this._isReady = false;
        
        // Set up a listener for when the client is ready
        client.onReady().then(() => {
            logger.info("✅ Language client is ready");
            this._isReady = true;
            
            // Resolve the ready promise
            if (this._readyPromiseResolve) {
                this._readyPromiseResolve();
                this._readyPromiseResolve = null;
            }
        }).catch(error => {
            logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
        });
    }

    /**
     * Gets the language client
     * @returns The language client, or null if not set
     */
    public getClient(): LanguageClient | null {
        return this.client;
    }

    /**
     * Checks if the language client is ready
     * @returns True if the client is ready, false otherwise
     */
    public isReady(): boolean {
        return this._isReady;
    }

    /**
     * Gets a promise that resolves when the client is ready
     * @returns A promise that resolves when the client is ready
     */
    public get readyPromise(): Promise<void> {
        return this._readyPromise;
    }

    /**
     * Resets the ready state when the client is stopped
     */
    public reset(): void {
        this._isReady = false;
        
        // Create a new promise that will be resolved when the client is ready
        this._readyPromise = new Promise<void>((resolve) => {
            this._readyPromiseResolve = resolve;
        });
    }
}

// Export convenience functions for easier access
export function isClientReady(): boolean {
    return LanguageClientManager.getInstance().isReady();
}

export function getClientReadyPromise(): Promise<void> {
    return LanguageClientManager.getInstance().readyPromise;
}

export function getLanguageClient(): LanguageClient | null {
    return LanguageClientManager.getInstance().getClient();
}

export function setLanguageClient(client: LanguageClient): void {
    LanguageClientManager.getInstance().setClient(client);
}