import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { TreeNode } from './TreeNode';
import { ClarionProject } from './Parser/ClarionProject';
import { ClarionSolution } from './Parser/ClarionSolution';
import { SolutionParser } from './Parser/SolutionParser';
import { ClarionSourcerFile } from './Parser/ClarionSourcerFile';
import { RedirectionEntry } from './Parser/RedirectionFileParser';
import LoggerManager from './logger';
import path = require('path');

const logger = LoggerManager.getLogger("SolutionTreeDataProvider");

export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

    public solutionParser: SolutionParser | undefined;

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
            return []; 
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
            treeItem.iconPath = new ThemeIcon('file-symlink-directory');
            treeItem.contextValue = 'clarionSolution';
            
            // Add ability to open the solution file when clicked
            if (this.solutionParser && this.solutionParser.solutionFilePath) {
                treeItem.command = {
                    title: 'Open Solution File',
                    command: 'clarion.openFile',
                    arguments: [this.solutionParser.solutionFilePath]
                };
            }
        } else if (element.data instanceof ClarionProject) {
            treeItem.iconPath = new ThemeIcon('project');
            treeItem.contextValue = 'clarionProject';
            
            // Add ability to open the project file when clicked
            const projectFile = path.join(element.data.path, `${element.data.name}.cwproj`);
            treeItem.command = {
                title: 'Open Project File',
                command: 'clarion.openFile',
                arguments: [projectFile]
            };
        } else if (element.data instanceof ClarionSourcerFile) {
            treeItem.iconPath = new ThemeIcon('file-code');
            treeItem.command = {
                title: 'Open File',
                command: 'clarion.openFile',
                arguments: [element.data.relativePath]
            };
        }

        return treeItem;
    }

    private isRedirectionEntry(obj: any): obj is RedirectionEntry {
        return obj && typeof obj.redFile === "string" && Array.isArray(obj.paths);
    }

    getTreeItems(): TreeNode[] {
        if (!this.solutionParser) {
            return [];
        }

        const solution = this.solutionParser.solution;
        
        // Create root solution node
        const solutionNode = new TreeNode(
            solution.name || "Solution", 
            TreeItemCollapsibleState.Expanded, 
            solution
        );
        
        // Add projects as children of solution node
        for (const project of solution.projects) {
            logger.info(`📂 Processing project: ${project.name}`);

            const projectNode = new TreeNode(project.name, TreeItemCollapsibleState.Expanded, project, solutionNode);

            // Add source files
            const sourceFileNodes = project.sourceFiles.map((sourceFile) => 
                new TreeNode(sourceFile.name, TreeItemCollapsibleState.None, sourceFile, projectNode)
            );
            projectNode.children.push(...sourceFileNodes);

            solutionNode.children.push(projectNode);
        }

        return [solutionNode]; // Return an array with just the solution node as the root
    }
}
