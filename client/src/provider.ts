import {languages, ExtensionContext, workspace} from 'vscode';
import { ClarionDefinitionProvider } from "./providers/definitionProvider";

const documentSelector = [
    { language: 'clarion', scheme: 'file' }
];
export function registerProviders(context: ExtensionContext) {
    if (!workspace.isTrusted) {
        return;
    }
    context.subscriptions.push(languages.registerDefinitionProvider(documentSelector, new ClarionDefinitionProvider()));
    // context.subscriptions.push(new ClarioDefinitionProvider());
    // registerDefinitionProvider(context);
}