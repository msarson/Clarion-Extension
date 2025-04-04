import { ExtensionContext, TreeView, window as vscodeWindow, commands, Disposable } from 'vscode';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { StructureViewProvider } from '../StructureViewProvider';
import { TreeNode } from '../TreeNode';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ViewManager");
logger.setLevel("error");

export class ViewManager {
    private treeView: TreeView<TreeNode> | undefined;
    private solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
    private structureViewProvider: StructureViewProvider | undefined;
    private structureView: TreeView<any> | undefined;

    constructor() {
        // Initialize with no views
    }

    /**
     * Create or refresh the solution tree view
     * @param context Extension context (optional)
     */
    public async createSolutionTreeView(context?: ExtensionContext): Promise<void> {
        // ✅ If the tree view already exists, just refresh its data
        if (this.treeView && this.solutionTreeDataProvider) {
            logger.info("🔄 Refreshing existing solution tree...");
            await this.solutionTreeDataProvider.refresh();
            return;
        }

        // ✅ Create the solution tree provider
        this.solutionTreeDataProvider = new SolutionTreeDataProvider();

        try {
            // ✅ Create the tree view only if it doesn't exist
            this.treeView = vscodeWindow.createTreeView('solutionView', {
                treeDataProvider: this.solutionTreeDataProvider,
                showCollapseAll: true
            });

            // Register filter commands
            const filterCommand = commands.registerCommand('clarion.solutionView.filter', async () => {
                const filterText = await vscodeWindow.showInputBox({
                    placeHolder: 'Filter solution tree...',
                    prompt: 'Enter text to filter the solution tree',
                    value: this.solutionTreeDataProvider?.getFilterText() || ''
                });
                
                if (filterText !== undefined) { // User didn't cancel
                    if (this.solutionTreeDataProvider) {
                        this.solutionTreeDataProvider.setFilterText(filterText);
                    }
                }
            });
            if (context) {
                context.subscriptions.push(filterCommand);
            }

            const clearFilterCommand = commands.registerCommand('clarion.solutionView.clearFilter', () => {
                if (this.solutionTreeDataProvider) {
                    this.solutionTreeDataProvider.clearFilter();
                }
            });
            if (context) {
                context.subscriptions.push(clearFilterCommand);
            }

            // Initial refresh to load data
            await this.solutionTreeDataProvider.refresh();

            logger.info("✅ Solution tree view successfully registered and populated.");
        } catch (error) {
            logger.error("❌ Error registering solution tree view:", error);
        }
    }

    /**
     * Create or refresh the structure view
     * @param context Extension context
     */
    public async createStructureView(context: ExtensionContext): Promise<void> {
        // If the structure view already exists, just refresh its data
        if (this.structureView && this.structureViewProvider) {
            logger.info("🔄 Refreshing existing structure view...");
            this.structureViewProvider.refresh();
            return;
        }

        // Create the structure view provider
        this.structureViewProvider = new StructureViewProvider();

        try {
            // Create the tree view
            this.structureView = vscodeWindow.createTreeView('clarionStructureView', {
                treeDataProvider: this.structureViewProvider,
                showCollapseAll: true
            });

            // 🔥 Inject the TreeView back into the provider!
            this.structureViewProvider.setTreeView(this.structureView);

            // Register the expand all command
            context.subscriptions.push(
                commands.registerCommand('clarion.structureView.expandAll', async () => {
                    if (this.structureViewProvider) {
                        await this.structureViewProvider.expandAll();
                    }
                })
            );

            // Register filter commands
            const filterCommand = commands.registerCommand('clarion.structureView.filter', async () => {
                const filterText = await vscodeWindow.showInputBox({
                    placeHolder: 'Filter structure view...',
                    prompt: 'Enter text to filter the structure view',
                    value: this.structureViewProvider?.getFilterText() || ''
                });
                
                if (filterText !== undefined) { // User didn't cancel
                    if (this.structureViewProvider) {
                        this.structureViewProvider.setFilterText(filterText);
                    }
                }
            });
            context.subscriptions.push(filterCommand);

            const clearFilterCommand = commands.registerCommand('clarion.structureView.clearFilter', () => {
                if (this.structureViewProvider) {
                    this.structureViewProvider.clearFilter();
                }
            });
            context.subscriptions.push(clearFilterCommand);

            this.structureView.title = "Structure";
            this.structureView.message = "Current document structure";
            this.structureView.description = "Clarion";

            this.structureView.onDidChangeVisibility(e => {
                commands.executeCommand('setContext', 'clarionStructureViewVisible', e.visible);
            });

            logger.info("✅ Structure view successfully registered.");
        } catch (error) {
            logger.error("❌ Error registering structure view:", error);
        }
    }

    /**
     * Get the solution tree data provider
     * @returns The solution tree data provider
     */
    public getSolutionTreeDataProvider(): SolutionTreeDataProvider | undefined {
        return this.solutionTreeDataProvider;
    }

    /**
     * Get the solution tree view
     * @returns The solution tree view
     */
    public getSolutionTreeView(): TreeView<TreeNode> | undefined {
        return this.treeView;
    }

    /**
     * Get the structure view provider
     * @returns The structure view provider
     */
    public getStructureViewProvider(): StructureViewProvider | undefined {
        return this.structureViewProvider;
    }

    /**
     * Get the structure view
     * @returns The structure view
     */
    public getStructureView(): TreeView<any> | undefined {
        return this.structureView;
    }
}

// Singleton instance
let instance: ViewManager | undefined;

/**
 * Get the ViewManager instance
 * @returns The ViewManager instance
 */
export function getViewManager(): ViewManager {
    if (!instance) {
        instance = new ViewManager();
    }
    return instance;
}