import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState, ThemeIcon, Command, extensions, Uri } from 'vscode';
import { TreeNode } from './TreeNode';
import { ClarionSolutionInfo, ClarionProjectInfo, ClarionSourcerFileInfo } from 'common/types';
import LoggerManager from './logger';
import * as path from 'path';
import { SolutionCache } from './SolutionCache';
import { globalSolutionFile } from './globals';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SolutionTreeDataProvider");
logger.setLevel("error");

// Special node type for when no solution is open
interface NoSolutionNodeData {
    type: 'noSolution';
}

export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

    // Add a new emitter for selecting nodes
    private _onDidSelectNode: EventEmitter<TreeNode> = new EventEmitter<TreeNode>();
    readonly onDidSelectNode: Event<TreeNode> = this._onDidSelectNode.event;

    private _root: TreeNode[] | null = null;
    private solutionCache: SolutionCache;
    
    // Filter-related properties
    private _filterText: string = '';
    private _filterDebounceTimeout: NodeJS.Timeout | null = null;
    private _filteredNodesCache: Map<string, TreeNode[]> = new Map();
    private _debounceDelay: number = 300; // 300ms debounce delay

    constructor() {
        this.solutionCache = SolutionCache.getInstance();
    }

    // Method to set filter text with debouncing
    setFilterText(text: string): void {
        // Clear any existing timeout
        if (this._filterDebounceTimeout) {
            clearTimeout(this._filterDebounceTimeout);
        }

        // Set a new timeout for debouncing
        this._filterDebounceTimeout = setTimeout(() => {
            logger.info(`🔍 Setting filter text: "${text}"`);
            this._filterText = text;
            
            // Clear the cache when filter changes
            this._filteredNodesCache.clear();
            
            // Notify tree view to refresh
            this._onDidChangeTreeData.fire();
            
            this._filterDebounceTimeout = null;
        }, this._debounceDelay);
    }

    // Method to clear the filter
    clearFilter(): void {
        if (this._filterText !== '') {
            this._filterText = '';
            this._filteredNodesCache.clear();
            this._onDidChangeTreeData.fire();
        }
    }

    // Get the current filter text
    getFilterText(): string {
        return this._filterText;
    }
    private refreshInProgress = false;
    async refresh(): Promise<void> {
        if (this.refreshInProgress) return;
        logger.info("🔄 Refreshing solution tree...");
    
        try {
            // Clear the filter cache when refreshing
            this.refreshFilterCache();
            if (!globalSolutionFile) {
                logger.info("ℹ️ No solution file set. Clearing tree.");
                this._root = []; // This will trigger the welcome screen if `clarion.solutionOpen` is false
                this._onDidChangeTreeData.fire();
                return;
            }
    
            const currentSolutionPath = this.solutionCache.getSolutionFilePath();
            if (currentSolutionPath) {
                await this.solutionCache.refresh();
            } else {
                await this.solutionCache.initialize(globalSolutionFile);
            }
    
            await this.getTreeItems(); // Load the new tree
            this._onDidChangeTreeData.fire();
    
            if (!this._root || this._root.length === 0) {
                logger.warn("⚠️ Tree root is empty after refresh.");
            } else {
                logger.info(`✅ Tree refreshed successfully with ${this._root.length} root item(s).`);
            }
        } catch (error) {
            logger.error(`❌ Error refreshing solution tree: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.refreshInProgress = false;
        }
    }
    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        // If we have a filter and this is a request for children of a specific element
        if (element) {
            logger.info(`🔍 Getting children for element: ${element.label}`);
            
            // Check if we have a filter active
            if (this._filterText && this._filterText.trim() !== '') {
                // Create a cache key based on the element's path
                const cacheKey = this.getCacheKeyForNode(element);
                
                // Check if we have cached results for this element
                if (this._filteredNodesCache.has(cacheKey)) {
                    const cachedNodes = this._filteredNodesCache.get(cacheKey);
                    logger.info(`  - Returning ${cachedNodes?.length || 0} cached filtered children`);
                    return cachedNodes || [];
                }
                
                // When a filter is active, only return visible children
                const visibleChildren = element.children.filter(child => child.visible);
                
                // Cache the results
                this._filteredNodesCache.set(cacheKey, visibleChildren);
                
                logger.info(`  - Returning ${visibleChildren.length} visible children`);
                return visibleChildren;
            }
            
            // No filter active, return all children
            logger.info(`  - Children count: ${element.children?.length || 0}`);
            
            if (element.children && element.children.length > 0) {
                logger.info(`  - First few children: ${element.children.slice(0, 5).map(c => c.label).join(', ')}${element.children.length > 5 ? '...' : ''}`);
            }
            
            return element.children;
        }
    
        // ✅ If no solution is loaded, return empty list (shows welcome screen)
        if (!globalSolutionFile) {
            logger.info(`🔍 No solution file, returning empty children list`);
            return [];
        }
    
        // ✅ Otherwise load your normal root tree (project/solution items)
        logger.info(`🔍 Returning root nodes: ${this._root?.length || 0} items`);
        
        // If we have a filter and this is a request for root nodes
        if (this._filterText && this._filterText.trim() !== '' && this._root) {
            // Create a cache key for root level
            const rootCacheKey = 'root_' + this._filterText;
            
            // Check if we have cached results for root level
            if (this._filteredNodesCache.has(rootCacheKey)) {
                const cachedRootNodes = this._filteredNodesCache.get(rootCacheKey);
                logger.info(`  - Returning ${cachedRootNodes?.length || 0} cached filtered root nodes`);
                return cachedRootNodes || [];
            }
            
            // Apply filtering to mark nodes as visible or hidden
            this.applyFilterToTree(this._root, this._filterText);
            
            // Get only the visible root nodes
            const visibleRootNodes = this._root.filter(node => node.visible);
            
            // Cache the results
            this._filteredNodesCache.set(rootCacheKey, visibleRootNodes);
            
            logger.info(`  - Returning ${visibleRootNodes.length} visible root nodes`);
            return visibleRootNodes;
        }
        
        // No filter active, return all root nodes
        if (this._root && this._root.length > 0) {
            logger.info(`  - Root node: ${this._root[0].label}`);
            logger.info(`  - Root children count: ${this._root[0].children?.length || 0}`);
            
            if (this._root[0].children && this._root[0].children.length > 0) {
                logger.info(`  - First few children: ${this._root[0].children.slice(0, 5).map(c => c.label).join(', ')}${this._root[0].children.length > 5 ? '...' : ''}`);
            }
        }
        
        return this._root || [];
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
        
        // Handle section nodes
        if ((data as any)?.type === 'section') {
            const sectionType = (data as any).sectionType;
            switch (sectionType) {
                case 'fileDrivers':
                    treeItem.iconPath = new ThemeIcon('database');
                    break;
                case 'libraries':
                    treeItem.iconPath = new ThemeIcon('library');
                    break;
                case 'projectReferences':
                    treeItem.iconPath = new ThemeIcon('references');
                    break;
                case 'noneFiles':
                    treeItem.iconPath = new ThemeIcon('files');
                    break;
                default:
                    treeItem.iconPath = new ThemeIcon('folder');
            }
            treeItem.contextValue = `clarion${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}Section`;
            return treeItem;
        }
        
        // Handle specific item types
        if ((data as any)?.type === 'fileDriver') {
            treeItem.iconPath = new ThemeIcon('database');
            treeItem.contextValue = 'clarionFileDriver';
            return treeItem;
        }
        
        if ((data as any)?.type === 'library') {
            treeItem.iconPath = new ThemeIcon('library');
            treeItem.contextValue = 'clarionLibrary';
            return treeItem;
        }
        
        if ((data as any)?.type === 'projectReference') {
            treeItem.iconPath = new ThemeIcon('references');
            treeItem.contextValue = 'clarionProjectReference';
            
            // Add command to navigate to the referenced project
            const projectGuid = (data as any).project;
            if (projectGuid) {
                // Find the referenced project in the solution
                const solution = this.solutionCache.getSolutionInfo();
                if (solution && solution.projects) {
                    const referencedProject = solution.projects.find(p => p.guid === projectGuid);
                    if (referencedProject) {
                        logger.info(`Found referenced project: ${referencedProject.name}`);
                        // Create command to navigate to the project
                        treeItem.command = {
                            title: 'Go to Project',
                            command: 'clarion.navigateToProject',
                            arguments: [projectGuid]
                        };
                        treeItem.tooltip = `Navigate to ${referencedProject.name}`;
                    }
                }
            }
            
            return treeItem;
        }
        
        if ((data as any)?.type === 'noneFile') {
            treeItem.iconPath = new ThemeIcon('file');
            treeItem.contextValue = 'clarionNoneFile';
            return treeItem;
        }

        if ((data as any)?.guid) {
            const project = data as ClarionProjectInfo;
            treeItem.iconPath = new ThemeIcon('repo');
            treeItem.contextValue = 'clarionProject';
            const projectFile = path.join(project.path, project.filename);
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
            logger.setLevel("error"); // Temporarily increase log level for debugging
            logger.info(`🔍 Looking for file: ${file.relativePath}`);
            
            // Get the parent project node to help with debugging
            let projectNode = element.parent;
            let projectName = "unknown";
            let projectPath = "unknown";
            
            if (projectNode && projectNode.data && (projectNode.data as any).guid) {
                const projectData = projectNode.data as ClarionProjectInfo;
                projectName = projectData.name || "unnamed";
                projectPath = projectData.path || "unknown";
                logger.info(`🔍 File belongs to project: ${projectName}, path: ${projectPath}`);
                logger.info(`🔍 Full relative path: ${path.join(projectPath, file.relativePath)}`);
                
                // Try direct path first as a quick check
                const directPath = path.join(projectPath, file.relativePath);
                if (fs.existsSync(directPath)) {
                    logger.info(`✅ File found immediately using direct path: ${directPath}`);
                    treeItem.command = {
                        title: 'Open File',
                        command: 'clarion.openFile',
                        arguments: [directPath]
                    };
                    treeItem.tooltip = `File: ${file.name}\nPath: ${directPath} (direct)`;
                    logger.setLevel("error"); // Reset log level
                    return treeItem;
                }
            }
            
            // If direct path didn't work, try server resolution
            solutionCache.findFileWithExtension(file.relativePath).then(fullPath => {
                logger.info(`🔍 Result from findFileWithExtension: ${fullPath}`);
                
                if (fullPath && fullPath !== "") {
                    treeItem.command = {
                        title: 'Open File',
                        command: 'clarion.openFile',
                        arguments: [fullPath]
                    };
                    logger.info(`📄 getTreeItem(): File – ${file.name} (${fullPath})`);
                    
                    // Add tooltip with file path for debugging
                    treeItem.tooltip = `File: ${file.name}\nPath: ${fullPath}`;
                } else {
                    // Try with full path as fallback
                    if (projectNode && projectNode.data && (projectNode.data as any).guid) {
                        const projectData = projectNode.data as ClarionProjectInfo;
                        const fullFilePath = path.join(projectData.path, file.relativePath);
                        
                        if (fs.existsSync(fullFilePath)) {
                            logger.info(`✅ File found using direct path: ${fullFilePath}`);
                            treeItem.command = {
                                title: 'Open File',
                                command: 'clarion.openFile',
                                arguments: [fullFilePath]
                            };
                            treeItem.tooltip = `File: ${file.name}\nPath: ${fullFilePath} (direct)`;
                        } else {
                            treeItem.tooltip = `⚠️ File not found: ${file.relativePath}`;
                            logger.warn(`⚠️ getTreeItem(): File not found for ${file.relativePath}`);
                        }
                    } else {
                        treeItem.tooltip = `⚠️ File not found: ${file.relativePath}`;
                        logger.warn(`⚠️ getTreeItem(): File not found for ${file.relativePath}`);
                    }
                }
            }).catch(err => {
                logger.error(`❌ getTreeItem(): Error finding file for ${file.relativePath}: ${err}`);
            });
            logger.setLevel("error"); // Reset log level
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

    // Add a new method to find and select a project by GUID
    findProjectNodeByGuid(projectGuid: string): TreeNode | null {
        if (!this._root || this._root.length === 0) {
            logger.warn("Cannot find project - no root nodes available");
            return null;
        }

        // Get the solution node (should be the first root node)
        const solutionNode = this._root[0];
        if (!solutionNode || !solutionNode.children) {
            logger.warn("Cannot find project - invalid solution node");
            return null;
        }

        // Find project node with matching GUID
        for (const projectNode of solutionNode.children) {
            const projectData = projectNode.data as ClarionProjectInfo;
            if (projectData && projectData.guid === projectGuid) {
                logger.info(`Found project node for GUID: ${projectGuid}, name: ${projectNode.label}`);
                return projectNode;
            }
        }

        logger.warn(`Project with GUID ${projectGuid} not found in solution tree`);
        return null;
    }

    // Method to reveal a project in the tree
    revealProject(projectGuid: string): boolean {
        const projectNode = this.findProjectNodeByGuid(projectGuid);
        if (projectNode) {
            // Emit an event to notify that this node should be selected
            this._onDidSelectNode.fire(projectNode);
            logger.info(`Revealed project: ${projectNode.label}`);
            return true;
        }
        return false;
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
            
            // Log detailed project information
            logger.info(`📊 Solution tree details in getTreeItems:`);
            for (let i = 0; i < solution.projects.length; i++) {
                const project = solution.projects[i];
                logger.info(`📂 Project ${i+1}/${solution.projects.length}: ${project.name}`);
                logger.info(`  - Path: ${project.path}`);
                logger.info(`  - GUID: ${project.guid}`);
                logger.info(`  - Source Files: ${project.sourceFiles?.length || 0}`);
                logger.info(`  - File Drivers: ${project.fileDrivers?.length || 0}`);
                logger.info(`  - Libraries: ${project.libraries?.length || 0}`);
                logger.info(`  - Project References: ${project.projectReferences?.length || 0}`);
                logger.info(`  - None Files: ${project.noneFiles?.length || 0}`);
            }

            const solutionNode = new TreeNode(
                solution.name || "Solution",
                TreeItemCollapsibleState.Expanded,
                solution
            );

            for (const project of solution.projects.filter(Boolean)) {
                // Log project details to help diagnose issues
                logger.info(`Processing project: ${project.name}`);
                logger.info(`  Source Files: ${project.sourceFiles?.length || 0}`);
                logger.info(`  File Drivers: ${project.fileDrivers?.length || 0} - ${project.fileDrivers?.join(', ') || 'none'}`);
                logger.info(`  Libraries: ${project.libraries?.length || 0} - ${project.libraries?.join(', ') || 'none'}`);
                logger.info(`  Project References: ${project.projectReferences?.length || 0} - ${project.projectReferences?.map(r => r.name).join(', ') || 'none'}`);
                logger.info(`  None Files: ${project.noneFiles?.length || 0} - ${project.noneFiles?.join(', ') || 'none'}`);
                
                const projectNode = new TreeNode(
                    project.name || "Unnamed Project",
                    TreeItemCollapsibleState.Collapsed,
                    project,
                    solutionNode
                );

                // Add File Drivers section if available
                if (project.fileDrivers && project.fileDrivers.length > 0) {
                    const fileDriversNode = new TreeNode(
                        "File Drivers",
                        TreeItemCollapsibleState.Collapsed,
                        { type: 'section', sectionType: 'fileDrivers' },
                        projectNode
                    );

                    for (const driver of project.fileDrivers) {
                        const driverNode = new TreeNode(
                            driver,
                            TreeItemCollapsibleState.None,
                            { type: 'fileDriver', name: driver },
                            fileDriversNode
                        );
                        fileDriversNode.children.push(driverNode);
                    }

                    projectNode.children.push(fileDriversNode);
                    logger.info(`     ✅ Added ${project.fileDrivers.length} file drivers to project ${project.name || 'unnamed'}`);
                }

                // Add Libraries, Objects and Resource Files section if available
                if (project.libraries && project.libraries.length > 0) {
                    const librariesNode = new TreeNode(
                        "Libraries, Objects and Resource Files",
                        TreeItemCollapsibleState.Collapsed,
                        { type: 'section', sectionType: 'libraries' },
                        projectNode
                    );

                    for (const lib of project.libraries) {
                        const libNode = new TreeNode(
                            lib,
                            TreeItemCollapsibleState.None,
                            { type: 'library', name: lib },
                            librariesNode
                        );
                        librariesNode.children.push(libNode);
                    }

                    projectNode.children.push(librariesNode);
                    logger.info(`     ✅ Added ${project.libraries.length} libraries to project ${project.name || 'unnamed'}`);
                }

                // Add Referenced Projects section if available
                if (project.projectReferences && project.projectReferences.length > 0) {
                    const referencesNode = new TreeNode(
                        "Referenced Projects",
                        TreeItemCollapsibleState.Collapsed,
                        { type: 'section', sectionType: 'projectReferences' },
                        projectNode
                    );

                    for (const ref of project.projectReferences) {
                        const refNode = new TreeNode(
                            ref.name,
                            TreeItemCollapsibleState.None,
                            { type: 'projectReference', name: ref.name, project: ref.project },
                            referencesNode
                        );
                        referencesNode.children.push(refNode);
                    }

                    projectNode.children.push(referencesNode);
                    logger.info(`     ✅ Added ${project.projectReferences.length} project references to project ${project.name || 'unnamed'}`);
                }

                // Add Other Files section if available
                if (project.noneFiles && project.noneFiles.length > 0) {
                    const noneFilesNode = new TreeNode(
                        "Other Files",
                        TreeItemCollapsibleState.Collapsed,
                        { type: 'section', sectionType: 'noneFiles' },
                        projectNode
                    );

                    for (const file of project.noneFiles) {
                        const fileNode = new TreeNode(
                            file,
                            TreeItemCollapsibleState.None,
                            { type: 'noneFile', name: file },
                            noneFilesNode
                        );
                        noneFilesNode.children.push(fileNode);
                    }

                    projectNode.children.push(noneFilesNode);
                    logger.info(`     ✅ Added ${project.noneFiles.length} other files to project ${project.name || 'unnamed'}`);
                }

                // Add source files directly under the project node (as they were originally)
                // Now added at the end so they appear after the section nodes
                if (project.sourceFiles && Array.isArray(project.sourceFiles) && project.sourceFiles.length > 0) {
                    for (const sourceFile of project.sourceFiles.filter(Boolean)) {
                        const sourceFileNode = new TreeNode(
                            sourceFile.name || "Unnamed File",
                            TreeItemCollapsibleState.None,
                            sourceFile,
                            projectNode
                        );

                        logger.info(`     📄 ${sourceFile.name || 'unnamed'} — ${sourceFile.relativePath || 'no path'}`);
                        projectNode.children.push(sourceFileNode);
                    }

                    logger.info(`     ✅ Added ${project.sourceFiles.length} source files to project ${project.name || 'unnamed'}`);
                } else {
                    logger.warn(`⚠️ Project ${project.name || 'unnamed'} has no valid sourceFiles array`);
                }

                solutionNode.children.push(projectNode);
                logger.info(`✅ Added project ${project.name} to solution tree with ${projectNode.children.length} child nodes`);
            }

            logger.info(`✅ Added ${solutionNode.children.length} projects to solution tree`);
            this._root = [solutionNode];
            this._onDidChangeTreeData.fire();
            logger.info("✅ Solution tree updated successfully");

            return this._root;
        } catch (error) {
            logger.error(`❌ Error building solution tree: ${error instanceof Error ? error.message : String(error)}`);
            return this._root || [];
        }
    }
    
    // Helper method to create a cache key for a node
    private getCacheKeyForNode(node: TreeNode): string {
        // Create a unique key based on the node's path in the tree
        let key = node.label;
        let parent = node.parent;
        
        while (parent) {
            key = parent.label + '/' + key;
            parent = parent.parent;
        }
        
        return key + '_' + this._filterText;
    }
    
    // Helper method to filter nodes based on text
    // Helper method for substring matching
    private substringMatch(text: string, filter: string): boolean {
        // Convert both strings to lowercase for case-insensitive matching
        const textLower = text.toLowerCase();
        const filterLower = filter.toLowerCase();
        
        // Check if filter is a substring of text
        return textLower.indexOf(filterLower) !== -1;
    }
    
    // Helper method to check if a node matches the filter directly
    private nodeMatches(node: TreeNode, normalizedFilter: string): boolean {
        return this.substringMatch(node.label, normalizedFilter);
    }
    
    // Helper method to find all nodes that match the filter (including descendants)
    private findAllMatchingNodes(nodes: TreeNode[], normalizedFilter: string): TreeNode[] {
        const result: TreeNode[] = [];
        
        const searchNodes = (nodeList: TreeNode[]) => {
            for (const node of nodeList) {
                // Check if this node matches
                if (this.nodeMatches(node, normalizedFilter)) {
                    result.push(node);
                }
                
                // Search children
                if (node.children && node.children.length > 0) {
                    searchNodes(node.children);
                }
            }
        };
        
        searchNodes(nodes);
        return result;
    }
    
    private filterNodes(nodes: TreeNode[], filterText: string): TreeNode[] {
        if (!nodes || nodes.length === 0) {
            return [];
        }
        
        const normalizedFilter = filterText.toLowerCase();
        const visibleNodes: TreeNode[] = [];
        
        // First, mark all nodes as not visible
        const markAllNodesInvisible = (nodeList: TreeNode[]) => {
            for (const node of nodeList) {
                node.visible = false;
                if (node.children && node.children.length > 0) {
                    markAllNodesInvisible(node.children);
                }
            }
        };
        
        // Mark nodes that match the filter as visible
        const markMatchingNodesVisible = (nodeList: TreeNode[]) => {
            for (const node of nodeList) {
                // Check if this node matches
                const nodeMatches = this.nodeMatches(node, normalizedFilter);
                
                // Check if any children match
                let hasVisibleChildren = false;
                if (node.children && node.children.length > 0) {
                    markMatchingNodesVisible(node.children);
                    hasVisibleChildren = node.children.some(child => child.visible);
                }
                
                // Mark this node as visible if it matches or has visible children
                node.visible = nodeMatches || hasVisibleChildren;
                
                // If this node is visible, add it to the result
                if (node.visible) {
                    visibleNodes.push(node);
                }
            }
        };
        
        // Apply the visibility marking
        markAllNodesInvisible(nodes);
        markMatchingNodesVisible(nodes);
        
        // Return only the visible nodes at this level
        return nodes.filter(node => node.visible);
    }
    
    // Helper method to clone the root for filtering
    private cloneRootForFiltering(): TreeNode[] {
        if (!this._root) {
            return [];
        }
        
        // Create a deep copy of the root nodes
        return this._root.map(rootNode => this.cloneNodeForFiltering(rootNode));
    }
    
    // Helper method to clone a node for filtering
    private cloneNodeForFiltering(node: TreeNode, parent?: TreeNode): TreeNode {
        // Create a new node with the same properties
        const clonedNode = new TreeNode(
            node.label,
            node.collapsibleState,
            node.data,
            parent
        );
        
        // Clone all children
        clonedNode.children = node.children.map(child => this.cloneNodeForFiltering(child, clonedNode));
        
        return clonedNode;
    }
    
    // Helper method to apply filter to the entire tree
    private applyFilterToTree(rootNodes: TreeNode[], filterText: string): TreeNode[] {
        if (!rootNodes || rootNodes.length === 0) {
            return [];
        }
        
        const normalizedFilter = filterText.toLowerCase();
        
        // Mark all nodes as visible or hidden based on the filter
        const markVisibility = (nodes: TreeNode[]) => {
            // First, mark all nodes as not visible
            const markAllInvisible = (nodeList: TreeNode[]) => {
                for (const node of nodeList) {
                    node.visible = false;
                    if (node.children && node.children.length > 0) {
                        markAllInvisible(node.children);
                    }
                }
            };
            
            // Then, mark nodes that match the filter or have matching descendants as visible
            const markMatchingVisible = (node: TreeNode): boolean => {
                // Check if this node matches
                const nodeMatches = this.nodeMatches(node, normalizedFilter);
                
                // Check if any children match
                let hasMatchingChildren = false;
                if (node.children && node.children.length > 0) {
                    for (const child of node.children) {
                        if (markMatchingVisible(child)) {
                            hasMatchingChildren = true;
                        }
                    }
                }
                
                // Mark this node as visible if it matches or has matching children
                node.visible = nodeMatches || hasMatchingChildren;
                
                return node.visible;
            };
            
            // Apply the visibility marking
            markAllInvisible(nodes);
            for (const node of nodes) {
                markMatchingVisible(node);
            }
        };
        
        // Apply visibility marking to the root nodes
        markVisibility(rootNodes);
        
        // Return only the visible root nodes
        const result = rootNodes.filter(node => node.visible);
        
        return result;
    }
    
    // Method to refresh the cache when data changes
    refreshFilterCache(): void {
        this._filteredNodesCache.clear();
    }
}
