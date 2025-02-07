import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

import { ClarionExtensionCommands } from './ClarionExtensionCommands';

import { TextEditorComponent } from './TextEditorComponent';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';
import * as fs from 'fs';
import LocationProvider from './UtilityClasses/LocationProvider';
import { SolutionParser } from './SolutionParser';
// import { SolutionTreeDataProvider, TreeNode } from './SolutionTreeDataProvider';
let client: LanguageClient | undefined;
let solutionParser: SolutionParser | undefined;
export async function activate(context: ExtensionContext): Promise<void> {

    const disposables: Disposable[] = [];
    // let treeView: TreeView<TreeNode> | undefined;
    // Check if the workspace is trusted
    let isWorkspaceTrusted = workspace.isTrusted;
    const documentManager = new DocumentManager(solutionParser!);
    const textEditorComponent = new TextEditorComponent(documentManager);
    
    /**
     * Registers an event handler for text editor selection changes.
     *
     * This event handler listens for selection changes in the text editor. When the selection changes
     * and the affected document is the active document, it updates the document information using
     * the document manager.
     *
     * @returns A Disposable that can be used to unregister the event handler.
     */
    function registerSelectionChangeHandler(): Disposable {
        return window.onDidChangeTextEditorSelection(async (event) => {
            const editor = event.textEditor;
            if (editor) {
                const document = editor.document;
                if (document === window.activeTextEditor?.document) {
                    // Update links for the focused document
                    documentManager.updateDocumentInfo(document);
                }
            }
        });
    }
    
    // function createSolutionTreeView() {
    //     const solutionTreeDataProvider = new SolutionTreeDataProvider(solutionParser!);
    //     const openFileCommand = commands.registerCommand('clarion.openFile', solutionTreeDataProvider.solutionParser.openFile.bind(solutionTreeDataProvider.solutionParser));
    //     context.subscriptions.push(openFileCommand);
    
    //     treeView = window.createTreeView('solutionView', {
    //         treeDataProvider: solutionTreeDataProvider,
    //         showCollapseAll: true
            

            
    //     });
    
    //     disposables.push(treeView);
    
    //     // Define the onDidChangeVisibility handler within the function
    //     treeView.onDidChangeVisibility(async (e) => {
    //         if (e.visible && treeView) {
    //             try {
    //                 const firstElement = await solutionTreeDataProvider.getTreeItems()[0];
    //                 if (firstElement) {
    //                     treeView.reveal(firstElement, { select: true }); // Use { select: true } to select the item when revealing
    //                 }
    //             } catch (error) {
    //                 console.error('Error while revealing TreeView item:', error);
    //             }
    //         }
    //     });
        
    // }
    

    handleTrustedWorkspace(context, documentManager, textEditorComponent, disposables);
    if (isWorkspaceTrusted) {
        startClientServer(context, documentManager);

    }

    // Re-register providers when workspace trust is granted
    workspace.onDidGrantWorkspaceTrust(async () => {
        handleTrustedWorkspace(context, documentManager, textEditorComponent, disposables);
        
        if (workspace.isTrusted) {
            const solutionFilePath = workspace.getConfiguration().get('applicationSolutionFile', '');
            solutionParser = new SolutionParser(solutionFilePath);
            await documentManager.initialize(solutionParser);
            isWorkspaceTrusted = true;
            startClientServer(context, documentManager);
            ClarionExtensionCommands.updateWorkspaceConfigurations();
            const selectionHandler = registerSelectionChangeHandler();
            
            for (const openDocument of workspace.textDocuments) {
                documentManager.updateDocumentInfo(openDocument);
            }
            const inspectFullPathCommand = commands.registerCommand('clarion.inspectFullPath', async () => {
                // Call the function to gather information
                await documentManager.inspectFullPath();
            });
            disposables.push(inspectFullPathCommand);
            // Store the selectionHandler in disposables
            disposables.push(selectionHandler)
         
            // const openSolutionTreeCommand = commands.registerCommand('clarion.openSolutionTree', async () => {
            //     createSolutionTreeView();
            // });
            // disposables.push(openSolutionTreeCommand);
            
            // Call createSolutionTreeView when the extension is activated
            // if (isWorkspaceTrusted && workspace.workspaceFolders) {
            //     createSolutionTreeView();
            // }
        } else {
            stopClientServer();
        }
    });

    if (isWorkspaceTrusted && workspace.workspaceFolders) {
        // Call the method to update workspace configurations
        const solutionFilePath = workspace.getConfiguration().get('applicationSolutionFile', '');
        solutionParser = new SolutionParser(solutionFilePath);
        documentManager.initialize(solutionParser);
        await ClarionExtensionCommands.updateWorkspaceConfigurations();
        const selectionHandler = registerSelectionChangeHandler();
        for (const openDocument of workspace.textDocuments) {
            documentManager.updateDocumentInfo(openDocument);
        }
        const inspectFullPathCommand = commands.registerCommand('clarion.inspectFullPath', async () => {
            // Call the function to gather information
            documentManager.inspectFullPath();
        });
        disposables.push(inspectFullPathCommand);
        // Store the selectionHandler in disposables
        disposables.push(selectionHandler)
    

        // const openSolutionTreeCommand = commands.registerCommand('clarion.openSolutionTree', async () => {
        //     createSolutionTreeView();
        // });
        // disposables.push(openSolutionTreeCommand);
        
        // Call createSolutionTreeView when the extension is activated
        // if (isWorkspaceTrusted && workspace.workspaceFolders) {
        //     createSolutionTreeView();
        // }
        
        
        

        // Dispose of all subscriptions when the extension is deactivated
        context.subscriptions.push(...disposables);

        
        // Store the tree view in disposables


    }
}



export function deactivate(): Thenable<void> | undefined {
    stopClientServer();
    return undefined;
}

function handleTrustedWorkspace(context: ExtensionContext, documentManager: DocumentManager, textEditorComponent: TextEditorComponent, disposables: Disposable[]) {
    if (workspace.isTrusted) {
        const documentSelector = [
            { language: 'clarion', scheme: 'file' }
        ];

        const documentLinkProvider = new ClarionDocumentLinkProvider(documentManager);
        const hoverProvider = new ClarionHoverProvider(documentManager);
        disposables.push(
            textEditorComponent,
            commands.registerCommand('clarion.followLink', () => ClarionExtensionCommands.followLink(documentManager)),
            commands.registerCommand('clarion.configureClarionPropertiesFile', ClarionExtensionCommands.configureClarionPropertiesFile),
            commands.registerCommand('clarion.selectSolutionFile', ClarionExtensionCommands.selectSolutionFile),
            languages.registerDocumentLinkProvider('clarion', documentLinkProvider),
            languages.registerHoverProvider(documentSelector, hoverProvider)
        );
    } else {
        disposables.forEach(disposable => disposable.dispose());
        disposables.length = 0;
    }
}

function startClientServer(context: ExtensionContext, documentManager: DocumentManager) {
    let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'clarion' }],
        initializationOptions: {
            settings: workspace.getConfiguration('clarion')
        },
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{clw,inc}')
        }
    };

    client = new LanguageClient(
        'ClarionLanguageServer',
        'Clarion Language Server',
        serverOptions,
        clientOptions
    );

    client.start();
    // findAndStoreProjectFiles().then((projectFolders) => {
    //     console.log(projectFolders);
    // });
    //  const projectFiles = findAndStoreProjectFiles();

}

function stopClientServer() {
    if (client) {
        client.stop();
        client = undefined;
    }
}

const xml2js = require('xml2js');


