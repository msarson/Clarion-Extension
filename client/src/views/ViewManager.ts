import { commands, window, window as vscodeWindow, workspace, ExtensionContext, TreeView } from 'vscode';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { StructureViewProvider } from '../StructureViewProvider';
import { StatusViewProvider } from '../StatusViewProvider';
import { registerSolutionViewCommands, registerStructureViewCommands } from '../commands/ViewCommands';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ViewManager");

// Global references to prevent re-creation
let globalSolutionTreeView: TreeView<any> | undefined;
let globalSolutionProvider: SolutionTreeDataProvider | undefined;
let globalStructureView: TreeView<any> | undefined;
let globalStructureProvider: StructureViewProvider | undefined;
let globalStatusView: TreeView<any> | undefined;
let globalStatusProvider: StatusViewProvider | undefined;

/**
 * Safely refreshes the solution tree view without re-creating it
 */
export async function refreshSolutionTreeView(): Promise<void> {
    if (globalSolutionProvider) {
        await globalSolutionProvider.refresh();
    }
}

/**
 * Creates the solution tree view
 * @param context - Extension context (optional)
 * @param existingTreeView - Existing tree view reference (optional)
 * @param existingProvider - Existing provider reference (optional)
 * @returns Object containing the tree view and provider
 */
export async function createSolutionTreeView(
    context?: ExtensionContext,
    existingTreeView?: TreeView<any>,
    existingProvider?: SolutionTreeDataProvider
): Promise<{ treeView: TreeView<any>; provider: SolutionTreeDataProvider }> {
    // ✅ Use global references if available
    if (globalSolutionTreeView && globalSolutionProvider) {
        logger.info("🔄 Using existing solution tree view...");
        await globalSolutionProvider.refresh();
        return { treeView: globalSolutionTreeView, provider: globalSolutionProvider };
    }

    // ✅ If the tree view already exists, just refresh its data
    if (existingTreeView && existingProvider) {
        logger.info("🔄 Refreshing existing solution tree...");
        await existingProvider.refresh();
        globalSolutionTreeView = existingTreeView;
        globalSolutionProvider = existingProvider;
        return { treeView: existingTreeView, provider: existingProvider };
    }

    // ✅ Create the solution tree provider
    const provider = new SolutionTreeDataProvider();

    try {
        // ✅ Create the tree view only if it doesn't exist
        const view = vscodeWindow.createTreeView('solutionView', {
            treeDataProvider: provider,
            showCollapseAll: true
        });

        // Register solution view commands ONLY ONCE
        if (context) {
            registerSolutionViewCommands(context, provider);
        }

        // Initial refresh to load data
        await provider.refresh();

        // Store global references
        globalSolutionTreeView = view;
        globalSolutionProvider = provider;

        logger.info("✅ Solution tree view successfully registered and populated.");
        
        return { treeView: view, provider };
    } catch (error) {
        logger.error("❌ Error registering solution tree view:", error);
        throw error;
    }
}

/**
 * Creates the structure view
 * @param context - Extension context
 * @param existingView - Existing structure view reference (optional)
 * @param existingProvider - Existing provider reference (optional)
 * @returns Object containing the structure view and provider
 */
export async function createStructureView(
    context: ExtensionContext,
    existingView?: TreeView<any>,
    existingProvider?: StructureViewProvider
): Promise<{ structureView: TreeView<any>; provider: StructureViewProvider }> {
    // If the structure view already exists, just refresh its data
    if (existingView && existingProvider) {
        logger.info("🔄 Refreshing existing structure view...");
        existingProvider.refresh();
        return { structureView: existingView, provider: existingProvider };
    }

    // Create the structure view provider
    const provider = new StructureViewProvider();

    try {
        // Create the tree view
        const view = vscodeWindow.createTreeView('clarionStructureView', {
            treeDataProvider: provider,
            showCollapseAll: true
        });

        // 🔥 Inject the TreeView back into the provider!
        provider.setTreeView(view);

        // Register the provider's event listeners
        provider.getDisposables().forEach(disposable => {
            context.subscriptions.push(disposable);
        });

        // Initialize the follow cursor context
        await commands.executeCommand('setContext', 'clarion.followCursorEnabled', provider.isFollowCursorEnabled());
        logger.info(`Initialized clarion.followCursorEnabled context to ${provider.isFollowCursorEnabled()}`);

        // Register structure view commands
        registerStructureViewCommands(context, provider);

        view.title = "Structure";
        view.message = "Current document structure";
        view.description = "Clarion";

        view.onDidChangeVisibility(async e => {
            await commands.executeCommand('setContext', 'clarionStructureViewVisible', e.visible);
            
            // Update the provider's visibility state so Follow Cursor only works when view is visible
            if (provider) {
                provider.setViewVisible(e.visible);
            }
            
            // If the view becomes visible, ensure the follow cursor context is set correctly
            if (e.visible && provider) {
                const isEnabled = provider.isFollowCursorEnabled();
                await commands.executeCommand('setContext', 'clarion.followCursorEnabled', isEnabled);
                logger.info(`Refreshed clarion.followCursorEnabled context to ${isEnabled}`);
            }
        });
        
        // Set the initial visibility context
        await commands.executeCommand('setContext', 'clarionStructureViewVisible', true);

        logger.info("✅ Structure view successfully registered.");
        
        return { structureView: view, provider };
    } catch (error) {
        logger.error("❌ Error registering structure view:", error);
        throw error;
    }
}

/**
 * Creates the status view
 * @param context - Extension context
 * @returns Object containing the status view and provider
 */
export async function createStatusView(
    context: ExtensionContext
): Promise<{ statusView: TreeView<any>; provider: StatusViewProvider }> {
    // Always create a fresh provider
    const provider = new StatusViewProvider();
    const view = window.createTreeView('clarionStatusView', {
        treeDataProvider: provider
    });
    
    // Inject the treeView reference so provider can update title
    provider.setTreeView(view);
    
    // Set initial title
    provider.refresh();
    
    context.subscriptions.push(view);
    logger.info("✅ Status view created");
    
    // Refresh status view when workspace changes
    context.subscriptions.push(
        workspace.onDidChangeWorkspaceFolders(() => {
            provider?.refresh();
        })
    );
    
    // Refresh status view when workspace trust changes
    context.subscriptions.push(
        workspace.onDidGrantWorkspaceTrust(() => {
            provider?.refresh();
            logger.info("🔒 Workspace trust granted - refreshing status view");
        })
    );
    
    // Export refresh function for use elsewhere
    (global as any).refreshStatusView = () => {
        provider?.refresh();
    };
    
    return { statusView: view, provider };
}
