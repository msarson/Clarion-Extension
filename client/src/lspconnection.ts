import { LanguageClient } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function setLanguageClient(newClient: LanguageClient) {
    client = newClient;
}

export function getLanguageClient(): LanguageClient {
    if (!client) {
        throw new Error("LanguageClient is not initialized yet.");
    }
    return client;
}
