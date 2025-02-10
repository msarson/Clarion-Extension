import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState } from 'vscode';
import { SolutionParser, SourceFile } from './SolutionParser';
import { Logger } from './UtilityClasses/Logger';

export class TreeNode extends TreeItem {
    public children: TreeNode[];
    public data?: any;

    constructor(
        label: string | undefined,
        collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
        data?: any,
        children: TreeNode[] = []
    ) {
        super(label ?? "Unknown Node", collapsibleState); // ✅ Ensure label is valid
        this.children = children;
        this.data = data;
    }
}
export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: EventEmitter<TreeNode | undefined> = new EventEmitter<TreeNode | undefined>();
    readonly onDidChangeTreeData: Event<TreeNode | undefined> = this._onDidChangeTreeData.event;

    public solutionParser: SolutionParser;

    constructor(solutionParser: SolutionParser) {
        this.solutionParser = solutionParser;
    }

    refresh(): void {
        Logger.info("🔄 Triggering tree view refresh...");
        this._onDidChangeTreeData.fire(undefined); // 🔄 Triggers an update to the tree view
    }

    getParent(element: TreeNode): TreeNode | null {
        return null;
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (element && element.children) {
            return element.children;
        }
        return this.getTreeItems();
    }

    getTreeItem(element: TreeNode): TreeItem {
        const treeItem = new TreeItem(element.label!, element.collapsibleState);
        if (element.data instanceof SourceFile) {
            const relativePath = element.data.relativePath;
            treeItem.command = {
                title: 'Open File',
                command: 'clarion.openFile',
                arguments: [relativePath]
            };
        }
        return treeItem;
    }

    getTreeItems(): TreeNode[] {
        const solution = this.solutionParser.solution;
        const projectNodes = solution.projects.map((project) => {
            const projectNode = new TreeNode(project.name, TreeItemCollapsibleState.Expanded, project);
            const sourceFileNodes = project.sourceFiles.map((sourceFile) => {
                return new TreeNode(sourceFile.name, TreeItemCollapsibleState.None, sourceFile);
            });
            projectNode.children = sourceFileNodes;
            return projectNode;
        });

        return projectNodes;
    }
}
