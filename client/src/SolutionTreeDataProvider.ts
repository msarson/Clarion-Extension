import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { TreeNode } from './TreeNode';
import { ClarionProject, ClarionSourcerFile } from './Parser/ClarionProject';
import { ClarionSolution } from './Parser/ClarionSolution';
import { SolutionParser } from './Parser/SolutionParser';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("SolutionTreeDataProvider");


export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

    public solutionParser: SolutionParser | undefined; // 🔹 Start undefined

    constructor(solutionParser?: SolutionParser) {
        this.solutionParser = solutionParser;
    }

    refresh(): void {
        logger.info("🔄 Refreshing solution tree...");

        if (!this.solutionParser) {
            logger.warn("⚠️ Cannot refresh solution tree: No solution loaded.");
            this._onDidChangeTreeData.fire();
            return;
        }

        this.solutionParser.parseSolution().then(() => {
            this._onDidChangeTreeData.fire();
            logger.info("✅ Solution tree successfully refreshed.");
        }).catch(error => {
            logger.error("❌ Error refreshing solution tree:", error);
        });
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!this.solutionParser) {
            return []; // ✅ Return an empty list if no solution is loaded
        }

        if (element && element.children) {
            return element.children;
        }
        return this.getTreeItems();
    }

    getTreeItem(element: TreeNode): TreeItem {
        const label = element.label || "Unnamed Item";
        const treeItem = new TreeItem(label, element.collapsibleState);

        if (element.data instanceof ClarionSolution) {
            treeItem.iconPath = new ThemeIcon('file-symlink-directory'); // 🔷 Solution Icon
        } else if (element.data instanceof ClarionProject) {
            treeItem.iconPath = new ThemeIcon('project'); // 🔷 Project Icon
        } else if (element.data instanceof ClarionSourcerFile) {
            treeItem.iconPath = new ThemeIcon('file-code'); // 🔷 File Icon
            treeItem.command = {
                title: 'Open File',
                command: 'clarion.openFile',
                arguments: [element.data.relativePath]
            };
        }

        return treeItem;
    }

    getTreeItems(): TreeNode[] {
        if (!this.solutionParser) {
            return []; // ✅ Return an empty list if no solution is loaded
        }

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
