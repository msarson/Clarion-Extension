import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState, ThemeIcon, Command, extensions, Uri } from 'vscode';
import { TreeNode } from './TreeNode';
import { ClarionSolutionInfo, ClarionProjectInfo, ClarionSourcerFileInfo } from 'common/types';
import LoggerManager from './logger';
import * as path from 'path';
import { SolutionCache } from './SolutionCache';
import { globalSolutionFile } from './globals';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SolutionTreeDataProvider");
logger.setLevel("info");

// Special node type for when no solution is open
interface NoSolutionNodeData {
    type: 'noSolution';
}

export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

    private _root: TreeNode[] | null = null;
    private solutionCache: SolutionCache;

    constructor() {
        this.solutionCache = SolutionCache.getInstance();
    }

    async refresh(): Promise<void> {
        logger.info("🔄 Refreshing solution tree...");

        try {
            if (!globalSolutionFile) {
                logger.info("ℹ️ No solution file set. Showing 'Open Solution' node.");
                const noSolutionNode = new TreeNode(
                    "Open Solution",
                    TreeItemCollapsibleState.None,
                    { type: 'noSolution' }
                );
                this._root = [noSolutionNode];
                this._onDidChangeTreeData.fire();
                return;
            }
// Only refresh the solution cache if the solution file path is set in the cache
const currentSolutionPath = this.solutionCache.getSolutionFilePath();
if (currentSolutionPath) {
    await this.solutionCache.refresh();
} else if (globalSolutionFile) {
    // Initialize with the global solution file if it's set but not in the cache
    await this.solutionCache.initialize(globalSolutionFile);
}

await this.getTreeItems();
            await this.getTreeItems();

            if (!this._root) {
                logger.warn("⚠️ Tree root is still null after refresh attempt.");
            } else {
                logger.info(`✅ Tree refreshed successfully with ${this._root.length} root item(s).`);
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            logger.error(`❌ Error refreshing solution tree: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (element) {
            if (element.data && (element.data as any).relativePath &&
                (element.data as any).relativePath.toLowerCase().endsWith('.clw')) {
                logger.info(`🔄 Fetching symbols for source file: ${element.data.relativePath}`);
                if (!element.children || element.children.length === 0) {
                    try {
                        const sourceFile = element.data as ClarionSourcerFileInfo;
                        const projectNode = element.parent;
                        const projectPath = projectNode && projectNode.data && (projectNode.data as ClarionProjectInfo).path || '';
                        const relativePath = sourceFile.relativePath || '';

                        if (!relativePath) {
                            logger.error(`❌ No relative path provided for source file`);
                            return element.children;
                        }

                        const solutionCache = SolutionCache.getInstance();
                        const fullPath = await solutionCache.findFileWithExtension(relativePath);

                        logger.info(`🔍 Constructed full path: ${fullPath}`);

                        logger.info(`🔍 Fetching symbols from language server for ${fullPath}`);
                        const symbols = await this.getSymbolsFromLanguageServer(fullPath);

                        logger.info(`✅ Found ${symbols.length} top-level procedures from language server`);

                        for (const proc of symbols) {
                            try {
                                const procNode = new TreeNode(
                                    proc.name,
                                    TreeItemCollapsibleState.None,
                                    {
                                        type: 'procedureSymbol',
                                        file: sourceFile.relativePath,
                                        name: proc.name,
                                        line: proc.line || 0
                                    },
                                    element
                                );
                                element.children.push(procNode);
                            } catch (err) {
                                logger.error(`❌ Error creating tree node for procedure ${proc.name}: ${err instanceof Error ? err.message : String(err)}`);
                            }
                        }
                    } catch (error) {
                        logger.error(`❌ Error fetching symbols: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }

            return element.children;
        }

        if (!this._root) {
            return this.getTreeItems();
        }

        return this._root;
    }

    private async getSymbolsFromLanguageServer(filePath: string): Promise<any[]> {
        try {
            if (!filePath) {
                logger.error(`❌ No file path provided`);
                return [];
            }

            logger.info(`🔍 Requesting document symbols for ${filePath}`);

            if (!fs.existsSync(filePath)) {
                logger.error(`❌ File not found: ${filePath}`);
                return [];
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            logger.info(`🔍 File has ${lines.length} lines`);

            const documentSymbols = await this.solutionCache.getSymbolsForFile(filePath);

            if (documentSymbols && documentSymbols.length > 0) {
                logger.info(`🔎 Received ${documentSymbols.length} symbols from server for ${filePath}`);

                const procedures = documentSymbols.filter((symbol: any) => {
                    const isProcedure = symbol.kind === 12; // SymbolKind.Function
                    const isMethod = (symbol as any)._isMethodImplementation === true;
                    const isImplementationContainer = symbol.name?.endsWith('(Implementation)');

                    const include = isProcedure && !isMethod && !isImplementationContainer;

                    logger.info(`  • ${symbol.name} [kind=${symbol.kind}] [container=${symbol.containerName ?? '<none>'}] [isMethod=${isMethod}] [isImplementationContainer=${isImplementationContainer}]`);
                    logger.info(`    ${include ? '✅ Included as top-level procedure' : '❌ Excluded'}`);

                    return include;
                });

                logger.info(`✅ Total top-level procedures found: ${procedures.length}`);
                return procedures;
            } else {
                logger.warn(`⚠️ No symbols received from language server for ${filePath}`);
                return [];
            }
        } catch (error) {
            logger.error(`❌ Error getting symbols: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    getTreeItem(element: TreeNode): TreeItem {
        const label = element.label || "Unnamed Item";
        const treeItem = new TreeItem(label, element.collapsibleState);
        const data = element.data;
        logger.info(`🏗 Processing item with label: ${label}`);
        logger.info(JSON.stringify(data, null, 2));
    
        if ((data as any)?.type === 'noSolution') {
            treeItem.iconPath = new ThemeIcon('folder-opened');
            treeItem.description = "Click to open a solution";
            treeItem.tooltip = "No Clarion solution is currently open. Click to open one.";
            treeItem.command = {
                title: 'Open Solution',
                command: 'clarion.openSolution',
                arguments: []
            };
            treeItem.label = "Open Solution";
            logger.info(`⚠️ getTreeItem(): No Solution Open node`);
            return treeItem;
        }
    
        if ((data as any)?.type === 'closeSolution') {
            treeItem.iconPath = new ThemeIcon('x');
            treeItem.description = "Click to close the current solution";
            treeItem.tooltip = "Close the currently open solution.";
            treeItem.command = {
                title: 'Close Solution',
                command: 'clarion.closeSolution',
                arguments: []
            };
            treeItem.label = "Close Solution";
            logger.info(`❌ getTreeItem(): Close Solution node`);
            return treeItem;
        }
    
        if ((data as any)?.guid) {
            const project = data as ClarionProjectInfo;
            treeItem.iconPath = new ThemeIcon('repo');
            treeItem.contextValue = 'clarionProject';
            const projectFile = path.join(project.path, `${project.name}.cwproj`);
            logger.info(`🔍 Project file path: ${projectFile}`);
            treeItem.command = {
                title: 'Open Project File',
                command: 'clarion.openFile',
                arguments: [projectFile]
            };
            logger.info(`📂 getTreeItem(): Project – ${project.name}`);
            return treeItem;
        }
    
        if ((data as any)?.relativePath) {
            const file = data as ClarionSourcerFileInfo;
            treeItem.iconPath = new ThemeIcon('file-code');
            treeItem.contextValue = 'clarionFile';
    
            const solutionCache = SolutionCache.getInstance();
            solutionCache.findFileWithExtension(file.relativePath).then(fullPath => {
                if (fullPath) {
                    treeItem.command = {
                        title: 'Open File',
                        command: 'clarion.openFile',
                        arguments: [fullPath]
                    };
                    logger.info(`📄 getTreeItem(): File – ${file.name} (${fullPath})`);
                } else {
                    treeItem.tooltip = `⚠️ File not found: ${file.relativePath}`;
                    logger.warn(`⚠️ getTreeItem(): File not found for ${file.relativePath}`);
                }
            }).catch(err => {
                logger.error(`❌ getTreeItem(): Error finding file for ${file.relativePath}: ${err}`);
            });
            return treeItem;
        }
    
        if ((data as any)?.type === 'procedureSymbol') {
            treeItem.iconPath = new ThemeIcon('symbol-function');
            treeItem.contextValue = 'clarionProcedureSymbol';
            treeItem.command = {
                title: 'Go to Procedure',
                command: 'clarion.openFile',
                arguments: [data.file, data.range?.start?.line ?? 0]
            };
            treeItem.tooltip = `Go to ${data.name}`;
            logger.info(`🔹 getTreeItem(): Procedure – ${data.name}`);
            return treeItem;
        }
    
        // ⬇️ Only fall back to solution node if none of the above matched
        const solution = data as ClarionSolutionInfo;
        treeItem.iconPath = new ThemeIcon('symbol-class');
        treeItem.contextValue = 'clarionSolution';
        treeItem.tooltip = "Right-click for more options";
        treeItem.command = {
            title: 'Open Solution File',
            command: 'clarion.openFile',
            arguments: [solution.path]
        };
        logger.info(`🧩 getTreeItem(): Solution – ${solution.name}`);
    
        return treeItem;
    }
    

    async getTreeItems(): Promise<TreeNode[]> {
        try {
            logger.info("🔄 Getting solution tree from cache...");

            if (!globalSolutionFile) {
                logger.info("ℹ️ No solution file set. Showing 'Open Solution' node.");
                const noSolutionNode = new TreeNode(
                    "Open Solution",
                    TreeItemCollapsibleState.None,
                    { type: 'noSolution' }
                );
                this._root = [noSolutionNode];
                this._onDidChangeTreeData.fire();
                return this._root;
            }

            try {
                await this.solutionCache.refresh();
                logger.info("✅ Solution cache refreshed successfully");
            } catch (refreshError) {
                logger.error(`❌ Error refreshing solution cache: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`);
            }

            const solution = this.solutionCache.getSolutionInfo();

            if (!solution) {
                logger.warn("⚠️ No solution available in cache.");
                return this._root || [];
            }

            if (!solution.projects || !Array.isArray(solution.projects) || solution.projects.length === 0) {
                logger.warn("⚠️ Invalid or empty projects array in solution");
                return this._root || [];
            }

            logger.info(`🌲 Building tree for solution: ${solution.name}`);
            logger.info(`📁 Projects in solution: ${solution.projects.length}`);

            const solutionNode = new TreeNode(
                solution.name || "Solution",
                TreeItemCollapsibleState.Expanded,
                solution
            );

            for (const project of solution.projects.filter(Boolean)) {
                const projectNode = new TreeNode(
                    project.name || "Unnamed Project",
                    TreeItemCollapsibleState.Expanded,
                    project,
                    solutionNode
                );

                if (project.sourceFiles && Array.isArray(project.sourceFiles)) {
                    for (const sourceFile of project.sourceFiles.filter(Boolean)) {
                        const sourceFileNode = new TreeNode(
                            sourceFile.name || "Unnamed File",
                            TreeItemCollapsibleState.Collapsed,
                            sourceFile,
                            projectNode
                        );

                        if (sourceFile.relativePath?.toLowerCase().endsWith(".clw")) {
                            logger.info(`     💤 Deferring procedure discovery for ${sourceFile.name}`);
                        }

                        logger.info(`     📄 ${sourceFile.name || 'unnamed'} — ${sourceFile.relativePath || 'no path'}`);
                        projectNode.children.push(sourceFileNode);
                    }

                    logger.info(`     ✅ Added ${project.sourceFiles.length} source files to project ${project.name || 'unnamed'}`);
                } else {
                    logger.warn(`⚠️ Project ${project.name || 'unnamed'} has no valid sourceFiles array`);
                }

                solutionNode.children.push(projectNode);
            }

            this._root = [solutionNode];
            this._onDidChangeTreeData.fire();
            logger.info("✅ Solution tree updated successfully");

            return this._root;
        } catch (error) {
            logger.error(`❌ Error building solution tree: ${error instanceof Error ? error.message : String(error)}`);
            return this._root || [];
        }
    }
}
