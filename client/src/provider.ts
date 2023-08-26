import {languages, ExtensionContext, workspace} from 'vscode';
//import { ClarionDefinitionProvider } from "./providers/definitionProvider";
import { ClarionHoverProvider } from "./providers/hoverProvider"; 
import {ClarionDocumentLinkProvider} from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';

const documentSelector = [
    { language: 'clarion', scheme: 'file' }
];
export function registerProviders(context: ExtensionContext, documentManager: DocumentManager) {
    if (!workspace.isTrusted) {
        return;
    }
    
  //  context.subscriptions.push(languages.registerDefinitionProvider(documentSelector, new ClarionDefinitionProvider()));
     // Register the hover provider
     const documentLinkProvider = new ClarionDocumentLinkProvider(documentManager);
     context.subscriptions.push(languages.registerDocumentLinkProvider('clarion', documentLinkProvider));
     
     const hoverProvider = new ClarionHoverProvider(documentManager);
     context.subscriptions.push(languages.registerHoverProvider(documentSelector, hoverProvider));
    // context.subscriptions.push(new ClarioDefinitionProvider());
    // registerDefinitionProvider(context);
}