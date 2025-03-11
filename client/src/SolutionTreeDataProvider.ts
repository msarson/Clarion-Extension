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
        } else if (element.data instanceof ClarionProject) {
            treeItem.iconPath = new ThemeIcon('project');
        } else if (element.data instanceof ClarionSourcerFile) {
            treeItem.iconPath = new ThemeIcon('file-code');
            treeItem.command = {
                title: 'Open File',
                command: 'clarion.openFile',
                arguments: [element.data.relativePath]
            };
        } else if (this.isRedirectionEntry(element.data)) { 
            treeItem.iconPath = new ThemeIcon('file-code');
            treeItem.command = {
                title: 'Open Redirection File',
                command: 'clarion.openFile',
                arguments: [element.data.redFile]
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
        const projectNodes: TreeNode[] = [];

        for (const project of solution.projects) {
            logger.info(`📂 Processing project: ${project.name}`);

            const projectNode = new TreeNode(project.name, TreeItemCollapsibleState.Expanded, project);

            // ✅ Add source files
            const sourceFileNodes = project.sourceFiles.map((sourceFile) => 
                new TreeNode(sourceFile.name, TreeItemCollapsibleState.None, sourceFile)
            );
            projectNode.children.push(...sourceFileNodes);

            // ✅ Add redirection files
            const redirectionRootNode = this.getRedirectionFilesNode(project, projectNode);
            if (redirectionRootNode.children.length > 0) {
                projectNode.children.push(redirectionRootNode);
            }

            projectNodes.push(projectNode);
        }

        return projectNodes;
    }

    /**
     * ✅ Creates a tree representation of redirection files for a given project.
     */
    private getRedirectionFilesNode(project: ClarionProject, parentNode: TreeNode): TreeNode {
        if (project.getRedirectionEntries().length === 0) {
            logger.warn(`⚠️ No redirection files found for project ${project.name}`);
            return new TreeNode("Redirection Files", TreeItemCollapsibleState.None, null, parentNode);
        }
    
        const redirectionEntries = project.getRedirectionEntries();
        const rootRedFile = redirectionEntries[0].redFile;
        logger.info(`📌 Root Redirection File: ${rootRedFile}`);
    
        const rootNode = new TreeNode(
            path.basename(rootRedFile),
            TreeItemCollapsibleState.Collapsed,
            { type: "redirectionFile", path: rootRedFile },
            parentNode
        );
    
        const redirectionMap: Map<string, TreeNode> = new Map();
        redirectionMap.set(rootRedFile, rootNode);
    
        for (const entry of redirectionEntries) {
            if (!entry.redFile) continue;
    
            let redFileNode = redirectionMap.get(entry.redFile);
            if (!redFileNode) {
                // ✅ Add included redirection files as children
                logger.info(`📄 Found Included Redirection File: ${entry.redFile}`);
                redFileNode = new TreeNode(
                    path.basename(entry.redFile),
                    TreeItemCollapsibleState.Collapsed,
                    { type: "redirectionFile", path: entry.redFile },
                    rootNode
                );
                redirectionMap.set(entry.redFile, redFileNode);
                rootNode.children.push(redFileNode);
            }
    
            // ✅ Organize by Section (Debug, Release, Common, etc.)
            let sectionNode = redFileNode.children.find(node => node.label === `[${entry.section}]`);
            if (!sectionNode) {
                sectionNode = new TreeNode(
                    `[${entry.section}]`,
                    TreeItemCollapsibleState.Collapsed,
                    { type: "section", name: entry.section },
                    redFileNode
                );
                redFileNode.children.push(sectionNode);
            }
    
            // ✅ Attach file extension + paths under the correct section
            for (const resolvedPath of entry.paths) {
                const label = `[${entry.extension}] ${resolvedPath}`;
                sectionNode.children.push(
                    new TreeNode(
                        label,
                        TreeItemCollapsibleState.None,
                        { type: "redirectionPath", path: resolvedPath },
                        sectionNode
                    )
                );
            }
        }
    
        return rootNode;
    }
    
}
