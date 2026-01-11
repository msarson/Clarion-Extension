import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState, ThemeIcon, Command, extensions, Uri, workspace } from 'vscode';
import { TreeNode } from './TreeNode';
import { ClarionSolutionInfo, ClarionProjectInfo, ClarionSourcerFileInfo } from 'common/types';
import LoggerManager from './utils/LoggerManager';
import * as path from 'path';
import { SolutionCache } from './SolutionCache';
import { globalSolutionFile } from './globals';
import * as fs from 'fs';
import { ProjectIndex } from './ProjectIndex';
import { PathUtils } from './PathUtils';
import { getLanguageClient } from './LanguageClientManager';
import { SolutionScanner, DetectedSolution } from './utils/SolutionScanner';
import { ClarionInstallationDetector } from './utils/ClarionInstallationDetector';
import { GlobalSolutionHistory } from './utils/GlobalSolutionHistory';
import { ProjectDependencyResolver } from './utils/ProjectDependencyResolver';

const logger = LoggerManager.getLogger("SolutionTreeDataProvider");

// Create a specialized debug logger for file resolution issues
const fileResolutionLogger = LoggerManager.getLogger("FileResolution");
fileResolutionLogger.setLevel("error");

// Special node type for when no solution is open
interface NoSolutionNodeData {
    type: 'noSolution';
}

// Add description property to TreeNode
interface TreeNodeWithDescription extends TreeNode {
    description?: string;
}

export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

    // Add a new emitter for selecting nodes
    private _onDidSelectNode: EventEmitter<TreeNode> = new EventEmitter<TreeNode>();
    readonly onDidSelectNode: Event<TreeNode> = this._onDidSelectNode.event;

    private _root: TreeNode[] | null = null;
    private solutionCache: SolutionCache;
    private projectIndex: ProjectIndex;
    
    // Filter-related properties
    private _filterText: string = '';
    private _filterDebounceTimeout: NodeJS.Timeout | null = null;
    private _filteredNodesCache: Map<string, TreeNode[]> = new Map();
    private _debounceDelay: number = 300; // 300ms debounce delay
    
    // Cache for detected solutions nodes to prevent rapid refreshes
    private _detectedSolutionsCache: TreeNode[] | null = null;
    private _lastFolderCheckTime: number = 0;
    private _folderCheckCacheDuration: number = 5000; // 5 seconds
    
    // Prevent concurrent getDetectedSolutionsNodes calls
    private _isLoadingDetectedSolutions: boolean = false;
    private _pendingDetectedSolutionsPromise: Promise<TreeNode[]> | null = null;
    
    // Track refresh state
    private refreshInProgress = false;

    // Application sort order: 'solution' (as in .sln) or 'build' (dependency order)
    private _applicationSortOrder: 'solution' | 'build' = 'solution';

    // Track currently building project
    private _currentlyBuildingProject: string | null = null; // Project name
    
    // Track overall build progress
    private _buildProgress: { current: number; total: number } | null = null;

    constructor() {
        this.solutionCache = SolutionCache.getInstance();
        this.projectIndex = ProjectIndex.getInstance();
    }

    // Methods to track build status
    setCurrentlyBuildingProject(projectName: string | null): void {
        this._currentlyBuildingProject = projectName;
        this._onDidChangeTreeData.fire();
    }

    getCurrentlyBuildingProject(): string | null {
        return this._currentlyBuildingProject;
    }
    
    // Methods to track build progress
    setBuildProgress(current: number, total: number): void {
        this._buildProgress = { current, total };
        this._onDidChangeTreeData.fire();
    }
    
    clearBuildProgress(): void {
        this._buildProgress = null;
        this._onDidChangeTreeData.fire();
    }
    
    getBuildProgress(): { current: number; total: number } | null {
        return this._buildProgress;
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

    // Toggle application sort order
    async toggleApplicationSortOrder(): Promise<void> {
        this._applicationSortOrder = this._applicationSortOrder === 'solution' ? 'build' : 'solution';
        
        // Force a full refresh to rebuild the tree with new sort order
        await this.refresh();
    }
    
    // Set application sort order directly
    async setApplicationSortOrder(order: 'solution' | 'build'): Promise<void> {
        if (this._applicationSortOrder !== order) {
            this._applicationSortOrder = order;
            // Clear the root to force complete rebuild
            this._root = null;
            await this.refresh();
            // Give VS Code a moment to process the tree update
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Get current application sort order
    getApplicationSortOrder(): 'solution' | 'build' {
        return this._applicationSortOrder;
    }

    async refresh(): Promise<void> {
        if (this.refreshInProgress) {
            logger.info("⏭️ Refresh already in progress, skipping...");
            return;
        }
        this.refreshInProgress = true;
        const startTime = performance.now();
        logger.info("🔄 Refreshing solution tree...");
    
        try {
            // Clear the filter cache when refreshing
            this.refreshFilterCache();
            
            // Clear detected solutions cache to allow fresh detection
            this._detectedSolutionsCache = null;
            
            if (!globalSolutionFile) {
                logger.info("ℹ️ No solution file set. Clearing tree.");
                this._root = []; // This will trigger the welcome screen if `clarion.solutionOpen` is false
                this._onDidChangeTreeData.fire();
                const endTime = performance.now();
                logger.info(`✅ Tree cleared in ${(endTime - startTime).toFixed(2)}ms`);
                return;
            }
    
            // Store the current tree state before refreshing
            const existingTree = this._root ? [...this._root] : [];
            const hasExistingProjects = existingTree.length > 0 &&
                existingTree[0].children && existingTree[0].children.length > 0;
            
            if (hasExistingProjects) {
                logger.info(`ℹ️ Existing tree has ${existingTree[0].children.length} projects before refresh`);
            }
    
            const currentSolutionPath = this.solutionCache.getSolutionFilePath();
            const cacheStartTime = performance.now();
            if (currentSolutionPath) {
                // Use non-forced refresh to preserve cache on empty server results
                await this.solutionCache.refresh(false);
            } else {
                await this.solutionCache.initialize(globalSolutionFile);
                
                // If the solution info is empty after initialization, try a refresh but don't force it
                const solution = this.solutionCache.getSolutionInfo();
                if (!solution || !solution.projects || solution.projects.length === 0) {
                    logger.warn("⚠️ Solution cache is empty after initialization. Refreshing from server...");
                    await this.solutionCache.refresh(false);
                }
            }
            const cacheEndTime = performance.now();
            logger.info(`✅ Solution cache refreshed in ${(cacheEndTime - cacheStartTime).toFixed(2)}ms`);
    
            const treeStartTime = performance.now();
            await this.getTreeItems(); // Load the new tree
            const treeEndTime = performance.now();
            logger.info(`✅ Tree items loaded in ${(treeEndTime - treeStartTime).toFixed(2)}ms`);
            
            // Check if we got an empty tree but had projects before
            if ((!this._root || this._root.length === 0 ||
                (this._root[0].children && this._root[0].children.length === 0)) &&
                hasExistingProjects) {
                
                logger.warn("⚠️ Tree is empty after refresh but had projects before. Restoring previous tree.");
                this._root = existingTree;
                logger.info(`✅ Restored previous tree with ${existingTree[0].children.length} projects`);
            }
            
            this._onDidChangeTreeData.fire();
    
            if (!this._root || this._root.length === 0) {
                logger.warn("⚠️ Tree root is empty after refresh.");
            } else {
                const endTime = performance.now();
                logger.info(`✅ Tree refreshed successfully with ${this._root.length} root item(s) in ${(endTime - startTime).toFixed(2)}ms`);
            }
        } catch (error) {
            logger.error(`❌ Error refreshing solution tree: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.refreshInProgress = false;
        }
    }
    
    /**
     * Creates tree nodes for detected solutions when no solution is currently open
     * Uses caching to prevent rapid refreshes
     */
    private async getDetectedSolutionsNodes(): Promise<TreeNode[]> {
        // If already loading, return the pending promise to avoid concurrent calls
        if (this._isLoadingDetectedSolutions && this._pendingDetectedSolutionsPromise) {
            logger.info(`⏳ Already loading detected solutions, returning pending promise...`);
            return this._pendingDetectedSolutionsPromise;
        }
        
        // Check if we can use cached results
        const now = Date.now();
        if (this._detectedSolutionsCache && 
            (now - this._lastFolderCheckTime) < this._folderCheckCacheDuration) {
            logger.info(`ℹ️ Using cached detected solutions nodes (${this._detectedSolutionsCache.length} nodes)`);
            return this._detectedSolutionsCache;
        }
        
        // Mark as loading and create the promise
        this._isLoadingDetectedSolutions = true;
        this._pendingDetectedSolutionsPromise = this._loadDetectedSolutionsNodes();
        
        try {
            const result = await this._pendingDetectedSolutionsPromise;
            return result;
        } finally {
            this._isLoadingDetectedSolutions = false;
            this._pendingDetectedSolutionsPromise = null;
        }
    }
    
    /**
     * Internal method that actually loads detected solutions
     */
    private async _loadDetectedSolutionsNodes(): Promise<TreeNode[]> {
        logger.info(`🔍 Building detected solutions nodes (cache expired or empty)...`);
        const nodes: TreeNode[] = [];
        
        try {
            // Check if we have any folder open
            const hasFolder = workspace.workspaceFolders && workspace.workspaceFolders.length > 0;
            
            if (!hasFolder) {
                logger.info(`ℹ️ No folder open - checking recent solutions...`);
                
                // Get recent solutions from global history
                const recentSolutions = await GlobalSolutionHistory.getValidReferences();
                logger.info(`📜 Found ${recentSolutions.length} recent solutions to display`);
                
                if (recentSolutions.length > 0) {
                    // Show recent solutions header
                    const headerNode = new TreeNode(
                        `📜 Recent Solutions (${recentSolutions.length})`,
                        TreeItemCollapsibleState.None,
                        { type: 'info' }
                    );
                    nodes.push(headerNode);
                    
                    // Add recent solution nodes
                    for (const ref of recentSolutions) {
                        const solutionName = path.basename(ref.solutionFile, '.sln');
                        const recentNode = new TreeNode(
                            `▶ ${solutionName}`,
                            TreeItemCollapsibleState.None,
                            {
                                type: 'recentSolution',
                                solutionPath: ref.solutionFile,
                                folderPath: ref.folderPath,
                                tooltip: `${ref.solutionFile}\nLast opened: ${ref.lastOpened.toLocaleString()}`
                            },
                            undefined,
                            ref.folderPath
                        );
                        recentNode.description = ref.folderPath; // Show full path, not just folder name
                        nodes.push(recentNode);
                    }
                    
                    // Add separator
                    const separatorNode = new TreeNode(
                        "─────────────",
                        TreeItemCollapsibleState.None,
                        { type: 'separator' }
                    );
                    nodes.push(separatorNode);
                }
                
                // No folder open - offer to open one
                const openFolderNode = new TreeNode(
                    "📁 Open Folder...",
                    TreeItemCollapsibleState.None,
                    { 
                        type: 'openFolder', 
                        tooltip: "Open a folder containing Clarion solutions" 
                    }
                );
                nodes.push(openFolderNode);
                
                const browseNode = new TreeNode(
                    "📂 Browse for Solution...",
                    TreeItemCollapsibleState.None,
                    { type: 'browseSolution', tooltip: "Open a Clarion solution file from anywhere" }
                );
                nodes.push(browseNode);
                
                // Cache immediately to prevent rapid re-calls
                this._detectedSolutionsCache = nodes;
                this._lastFolderCheckTime = Date.now();
                logger.info(`✅ Cached ${nodes.length} nodes (no folder, ${recentSolutions.length} recent)`);
                
                return nodes;
            }
            
            // Scan for solutions in the opened folder
            const detectedSolutions = await SolutionScanner.scanWorkspaceFolders();
            
            // Check Clarion installations
            const installations = await ClarionInstallationDetector.detectInstallations();
            
            logger.info(`🔍 Found ${detectedSolutions.length} solution(s) and ${installations.length} Clarion installation(s)`);
            
            if (detectedSolutions.length === 0) {
                // No solutions found - offer to browse
                const noSolutionsNode = new TreeNode(
                    "No Solutions Detected",
                    TreeItemCollapsibleState.None,
                    { type: 'info', tooltip: "No .sln files found in this folder" }
                );
                
                const browseNode = new TreeNode(
                    "📂 Browse for Solution...",
                    TreeItemCollapsibleState.None,
                    { type: 'browseSolution', tooltip: "Open a Clarion solution file from anywhere" }
                );
                
                nodes.push(noSolutionsNode);
                nodes.push(browseNode);
                return nodes;
            }
            
            // Show warning if no Clarion installation detected
            if (installations.length === 0) {
                const warningNode = new TreeNode(
                    "⚠️ No Clarion Installation Detected",
                    TreeItemCollapsibleState.None,
                    { type: 'warning', tooltip: "Clarion IDE not found. Install Clarion or manually configure settings." }
                );
                nodes.push(warningNode);
            }
            
            // Add header
            const headerNode = new TreeNode(
                `📁 ${detectedSolutions.length} Solution(s) Found`,
                TreeItemCollapsibleState.None,
                { type: 'info' }
            );
            nodes.push(headerNode);
            
            // Add detected solution nodes (clickable)
            for (const solution of detectedSolutions) {
                const solutionNode = new TreeNode(
                    `▶ ${solution.solutionName}`,
                    TreeItemCollapsibleState.None,
                    { 
                        type: 'detectedSolution', 
                        solutionPath: solution.solutionPath,
                        tooltip: `Click to open: ${solution.solutionPath}`
                    },
                    undefined,
                    path.dirname(solution.solutionPath)
                );
                
                nodes.push(solutionNode);
            }
            
            // Add browse option
            const browseNode = new TreeNode(
                "📂 Browse for Solution...",
                TreeItemCollapsibleState.None,
                { type: 'browseSolution', tooltip: "Open a Clarion solution file from anywhere" }
            );
            nodes.push(browseNode);
            
            // ✅ Also show recent solutions from global history (even when folder is open)
            const recentSolutions = await GlobalSolutionHistory.getValidReferences();
            logger.info(`📜 Found ${recentSolutions.length} recent solutions in global history`);
            
            if (recentSolutions.length > 0) {
                // Add separator
                const separatorNode = new TreeNode(
                    "─────────────",
                    TreeItemCollapsibleState.None,
                    { type: 'separator' }
                );
                nodes.push(separatorNode);
                
                // Show recent solutions header
                const recentHeaderNode = new TreeNode(
                    `📜 Recent Solutions (${recentSolutions.length})`,
                    TreeItemCollapsibleState.None,
                    { type: 'info' }
                );
                nodes.push(recentHeaderNode);
                
                // Add recent solution nodes
                for (const ref of recentSolutions) {
                    const solutionName = path.basename(ref.solutionFile, '.sln');
                    const recentNode = new TreeNode(
                        `▶ ${solutionName}`,
                        TreeItemCollapsibleState.None,
                        {
                            type: 'recentSolution',
                            solutionPath: ref.solutionFile,
                            folderPath: ref.folderPath,
                            tooltip: `${ref.solutionFile}\nLast opened: ${ref.lastOpened.toLocaleString()}`
                        },
                        undefined,
                        ref.folderPath
                    );
                    recentNode.description = ref.folderPath; // Show full path, not just folder name
                    nodes.push(recentNode);
                }
            }
            
        } catch (error) {
            logger.error('❌ Error getting detected solutions:', error);
            // Return browse option on error
            const browseNode = new TreeNode(
                "📂 Browse for Solution...",
                TreeItemCollapsibleState.None,
                { type: 'browseSolution', tooltip: "Open a Clarion solution file" }
            );
            nodes.push(browseNode);
        }
        
        // Cache the results
        this._detectedSolutionsCache = nodes;
        this._lastFolderCheckTime = Date.now();
        logger.info(`✅ Cached ${nodes.length} detected solution nodes`);
        
        return nodes;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        // If we have a filter and this is a request for children of a specific element
        if (element) {
            logger.info(`🔍 Getting children for element: ${element.label}`);
            
            // Check if this is a project node that needs to load its details
            if (element.data && (element.data as any).kind === 'project') {
                // This is a project node that needs to load its details from the server
                const projectData = element.data as any;
                
                // Show loading indicator
                const loadingNode = new TreeNode(
                    "Loading...",
                    TreeItemCollapsibleState.None,
                    { type: 'loading' }
                );
                
                // Return the loading node while we fetch the details
                const loadingResult = [loadingNode];
                
                // Get project information from the data payload
                const { projectId } = projectData;
                
                // Get the language client
                const client = getLanguageClient();
                if (!client) {
                    logger.error("❌ Language client not available");
                    return loadingResult;
                }
                
                try {
                    logger.info(`🔄 Requesting children for ${element.label} from server with GUID: ${projectId}`);
                    
                    // Request project files from the server
                    const response = await client.sendRequest<{ files: any[] }>('clarion/getProjectFiles', {
                        projectGuid: projectId
                    });
                    
                    if (response && response.files) {
                        logger.info(`✅ Received ${response.files.length} files from server for project ${element.label}`);
                        
                        // Update the project node description to show the correct file count
                        const projectNodeWithDesc = element as TreeNodeWithDescription;
                        projectNodeWithDesc.description = `${response.files.length} ${response.files.length === 1 ? 'file' : 'files'}`;
                        
                        // Clear existing children
                        element.children = [];
                        
                        // Create a set to track files already added to this project
                        const addedFiles = new Set<string>();
                        
                        // Add the files to the project node
                        for (const sourceFile of response.files) {
                            // Skip files that have already been added to this project
                            if (addedFiles.has(sourceFile.name)) {
                                logger.info(`[TREE] Skipping duplicate file: ${sourceFile.name} in project ${element.label}`);
                                continue;
                            }
                            
                            const uniqueId = `${projectId}_${sourceFile.name}`;
                            // Log more details about the source file for debugging
                            logger.info(`[TREE] Creating node for file: ${sourceFile.name} with uniqueId: ${uniqueId}`);
                            logger.info(`[TREE] Source file details: name=${sourceFile.name}, relativePath=${sourceFile.relativePath}`);
                            
                            // Make sure we never use undefined as a label
                            const displayName = sourceFile.name || path.basename(sourceFile.relativePath || "unknown-file");
                            
                            const sourceFileNode = new TreeNode(
                                displayName,
                                TreeItemCollapsibleState.None,
                                {
                                    ...sourceFile,
                                    // Ensure each file has a unique identifier to prevent duplication
                                    uniqueId: uniqueId
                                },
                                element
                            );
                            element.children.push(sourceFileNode);
                            
                            // Mark this file as added to prevent duplicates
                            addedFiles.add(sourceFile.name);
                        }
                        
                        logger.info(`[TREE] Added ${element.children.length} source files to project node`);
                        
                        // Return the source files
                        return element.children;
                    } else {
                        logger.warn(`⚠️ Server returned no files for project ${element.label}`);
                        
                        // Clear existing children and update description
                        element.children = [];
                        const projectNodeWithDesc = element as TreeNodeWithDescription;
                        projectNodeWithDesc.description = "0 files";
                        
                        return [];
                    }
                } catch (error) {
                    logger.error(`❌ Error getting project files from server: ${error instanceof Error ? error.message : String(error)}`);
                    
                    // Return the loading node to indicate an error
                    return loadingResult;
                }
            }
            
            // Check if this is a project node with the old format (for backward compatibility)
            else if (element.data && (element.data as any).guid) {
                // This is a project node that needs to load its details from the server
                const projectData = element.data as any;
                
                // Show loading indicator
                const loadingNode = new TreeNode(
                    "Loading...",
                    TreeItemCollapsibleState.None,
                    { type: 'loading' }
                );
                
                // Return the loading node while we fetch the details
                const loadingResult = [loadingNode];
                
                // Get the language client
                const client = getLanguageClient();
                if (!client) {
                    logger.error("❌ Language client not available");
                    return loadingResult;
                }
                
                try {
                    logger.info(`🔄 Requesting children for ${element.label} from server with GUID: ${projectData.guid}`);
                    
                    // Request project files from the server
                    const response = await client.sendRequest<{ files: any[] }>('clarion/getProjectFiles', {
                        projectGuid: projectData.guid
                    });
                    
                    if (response && response.files) {
                        logger.info(`✅ Received ${response.files.length} files from server for project ${element.label}`);
                        
                        // Update the project node description to show the correct file count
                        const projectNodeWithDesc = element as TreeNodeWithDescription;
                        projectNodeWithDesc.description = `${response.files.length} ${response.files.length === 1 ? 'file' : 'files'}`;
                        
                        // Clear existing children
                        element.children = [];
                        
                        // Create a set to track files already added to this project
                        const addedFiles = new Set<string>();
                        
                        // Add the files to the project node
                        for (const sourceFile of response.files) {
                            // Skip files that have already been added to this project
                            if (addedFiles.has(sourceFile.name)) {
                                logger.info(`[TREE] Skipping duplicate file: ${sourceFile.name} in project ${element.label}`);
                                continue;
                            }
                            
                            const uniqueId = `${projectData.guid}_${sourceFile.name}`;
                            // Log more details about the source file for debugging
                            logger.info(`[TREE] Creating node for file: ${sourceFile.name} with uniqueId: ${uniqueId}`);
                            logger.info(`[TREE] Source file details: name=${sourceFile.name}, relativePath=${sourceFile.relativePath}`);
                            
                            // Make sure we never use undefined as a label
                            const displayName = sourceFile.name || path.basename(sourceFile.relativePath || "unknown-file");
                            
                            const sourceFileNode = new TreeNode(
                                displayName,
                                TreeItemCollapsibleState.None,
                                {
                                    ...sourceFile,
                                    // Ensure each file has a unique identifier to prevent duplication
                                    uniqueId: uniqueId
                                },
                                element
                            );
                            element.children.push(sourceFileNode);
                            
                            // Mark this file as added to prevent duplicates
                            addedFiles.add(sourceFile.name);
                        }
                        
                        logger.info(`[TREE] Added ${element.children.length} source files to project node`);
                        
                        // Return the source files
                        return element.children;
                    } else {
                        logger.warn(`⚠️ Server returned no files for project ${element.label}`);
                        
                        // Clear existing children and update description
                        element.children = [];
                        const projectNodeWithDesc = element as TreeNodeWithDescription;
                        projectNodeWithDesc.description = "0 files";
                        
                        return [];
                    }
                } catch (error) {
                    logger.error(`❌ Error getting project files from server: ${error instanceof Error ? error.message : String(error)}`);
                    
                    // Return the loading node to indicate an error
                    return loadingResult;
                }
            }
            
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
    
        // ✅ If no solution is loaded, show detected solutions
        if (!globalSolutionFile) {
            logger.info(`🔍 No solution file, checking for detected solutions...`);
            return await this.getDetectedSolutionsNodes();
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
    
    // The loadProjectDetails method has been removed as we now always request data from the server
    
    getTreeItem(element: TreeNode): TreeItem {
        const label = element.label || "Unnamed Item";
        const treeItem = new TreeItem(label, element.collapsibleState);
        
        // Set description if available
        if (element.description) {
            treeItem.description = element.description;
        }
        
        const data = element.data;
        logger.info(`🏗 Processing item with label: ${label}`);
        // Reduce logging to improve performance
        logger.info(`🏗 Item data type: ${data?.type || (data?.guid ? 'project' : (data?.relativePath ? 'file' : 'other'))}`);

        // Handle detected solution nodes
        if ((data as any)?.type === 'detectedSolution') {
            treeItem.iconPath = new ThemeIcon('file-text');
            treeItem.tooltip = (data as any).tooltip || `Click to open: ${(data as any).solutionPath}`;
            treeItem.command = {
                title: 'Open Detected Solution',
                command: 'clarion.openDetectedSolution',
                arguments: [(data as any).solutionPath]
            };
            return treeItem;
        }

        // Handle recent solution nodes
        if ((data as any)?.type === 'recentSolution') {
            treeItem.iconPath = new ThemeIcon('history');
            treeItem.tooltip = (data as any).tooltip || `Click to open: ${(data as any).solutionPath}`;
            treeItem.command = {
                title: 'Open Recent Solution',
                command: 'clarion.openRecentSolution',
                arguments: [(data as any).folderPath, (data as any).solutionPath]
            };
            return treeItem;
        }

        // Handle separator nodes (non-clickable)
        if ((data as any)?.type === 'separator') {
            treeItem.iconPath = undefined;
            treeItem.collapsibleState = TreeItemCollapsibleState.None;
            return treeItem;
        }

        // Handle browse solution node
        if ((data as any)?.type === 'browseSolution') {
            treeItem.iconPath = new ThemeIcon('folder-opened');
            treeItem.tooltip = (data as any).tooltip || "Open a Clarion solution file from anywhere";
            treeItem.command = {
                title: 'Browse for Solution',
                command: 'clarion.openSolution',
                arguments: []
            };
            return treeItem;
        }

        // Handle open folder node
        if ((data as any)?.type === 'openFolder') {
            treeItem.iconPath = new ThemeIcon('folder-opened');
            treeItem.tooltip = (data as any).tooltip || "Open a folder containing Clarion solutions";
            treeItem.command = {
                title: 'Open Folder',
                command: 'vscode.openFolder',
                arguments: []
            };
            return treeItem;
        }

        // Handle info nodes (non-clickable)
        if ((data as any)?.type === 'info') {
            treeItem.iconPath = new ThemeIcon('info');
            return treeItem;
        }

        // Handle solution info header
        if ((data as any)?.type === 'solutionInfo') {
            treeItem.iconPath = new ThemeIcon('folder');
            return treeItem;
        }

        // Handle warning node
        if ((data as any)?.type === 'warning') {
            treeItem.iconPath = new ThemeIcon('warning');
            treeItem.tooltip = (data as any).tooltip;
            return treeItem;
        }

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
        
        // Handle Applications group node
        if ((data as any)?.type === 'applications-group') {
            treeItem.iconPath = new ThemeIcon('extensions');
            treeItem.contextValue = 'clarionApplicationsGroup';
            treeItem.tooltip = 'Clarion Application Files';
            return treeItem;
        }
        
        // Handle individual Clarion APP file nodes
        if ((data as any)?.type === 'clarionApp') {
            const appData = data as any;
            const exists = fs.existsSync(appData.absolutePath);
            
            // Check if this app's corresponding project is building
            // APP file name (without .app) should match project name
            const appName = appData.name?.replace(/\.app$/i, '');
            const isBuilding = appName && this._currentlyBuildingProject === appName;
            
            if (isBuilding) {
                // Show building icon for the app
                treeItem.iconPath = new ThemeIcon('sync~spin');
                treeItem.description = '(Building...)';
                treeItem.tooltip = `${appData.absolutePath} - Building project...`;
            } else if (exists) {
                treeItem.iconPath = new ThemeIcon('symbol-class'); // Application icon
                treeItem.tooltip = appData.absolutePath;
                // Don't set a command - APP files are binary and shouldn't open in editor
            } else {
                treeItem.iconPath = new ThemeIcon('warning');
                treeItem.tooltip = `APP file not found: ${appData.absolutePath}`;
            }
            
            treeItem.contextValue = 'clarionApp';
            treeItem.resourceUri = Uri.file(appData.absolutePath);
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
            
            // Check if this project is currently building
            const isBuilding = this._currentlyBuildingProject === project.name;
            
            // Check if this is the startup project
            const workspaceConfig = workspace.getConfiguration('clarion');
            const startupProjectGuid = workspaceConfig.get<string>('startupProject');
            const isStartupProject = startupProjectGuid && 
                project.guid.replace(/[{}]/g, '').toLowerCase() === startupProjectGuid.replace(/[{}]/g, '').toLowerCase();
            
            if (isBuilding) {
                // Show building icon with sync/loading indicator
                treeItem.iconPath = new ThemeIcon('sync~spin');
                treeItem.description = '(Building...)';
            } else if (isStartupProject) {
                // Make startup project bold and add play icon
                treeItem.iconPath = new ThemeIcon('play');
                treeItem.description = '(Startup)';
            } else {
                treeItem.iconPath = new ThemeIcon('repo');
            }
            
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
            // Log more details about the file for debugging
            logger.info(`🔍 Looking for file: ${file.name || 'undefined'}, relativePath: ${file.relativePath || 'undefined'}`);
            
            // Get the parent project node to help with debugging
            let projectNode = element.parent;
            let projectName = "unknown";
            let projectPath = "unknown";
            
            if (projectNode && projectNode.data && (projectNode.data as any).guid) {
                const projectData = projectNode.data as ClarionProjectInfo;
                projectName = projectData.name || "unnamed";
                projectPath = projectData.path || "unknown";
                logger.info(`🔍 File belongs to project: ${projectName}, path: ${projectPath}`);
                
                // Make sure we have a valid relative path
                const relativePath = file.relativePath || file.name || "unknown-file";
                logger.info(`🔍 Full relative path: ${path.join(projectPath, relativePath)}`);
                
                // Try direct path first as a quick check
                // Make sure we have a valid relative path
                const fileRelativePath = file.relativePath || file.name || "unknown-file";
                const directPath = path.join(projectPath, fileRelativePath);
                
                if (fs.existsSync(directPath)) {
                    logger.info(`✅ File found immediately using direct path: ${directPath}`);
                    treeItem.command = {
                        title: 'Open File',
                        command: 'clarion.openFile',
                        arguments: [directPath]
                    };
                    treeItem.tooltip = `File: ${file.name || path.basename(fileRelativePath)}\nPath: ${directPath} (direct)`;
                    return treeItem;
                }
            }
            
            // If direct path didn't work, try server resolution
            // Make sure we have a valid path to search for
            const searchPath = file.relativePath || file.name || "unknown-file";
            solutionCache.findFileWithExtension(searchPath).then(fullPath => {
                logger.info(`🔍 Result from findFileWithExtension: ${fullPath}`);
                
                if (fullPath && fullPath !== "") {
                    treeItem.command = {
                        title: 'Open File',
                        command: 'clarion.openFile',
                        arguments: [fullPath]
                    };
                    logger.info(`📄 getTreeItem(): File – ${file.name || path.basename(searchPath)} (${fullPath})`);
                    
                    // Add tooltip with file path for debugging
                    treeItem.tooltip = `File: ${file.name || path.basename(searchPath)}\nPath: ${fullPath}`;
                } else {
                    // Try with full path as fallback
                    if (projectNode && projectNode.data && (projectNode.data as any).guid) {
                        const projectData = projectNode.data as ClarionProjectInfo;
                        // Make sure we have a valid relative path
                        const fallbackPath = file.relativePath || file.name || "unknown-file";
                        const fullFilePath = path.join(projectData.path, fallbackPath);
                        
                        if (fs.existsSync(fullFilePath)) {
                            logger.info(`✅ File found using direct path: ${fullFilePath}`);
                            treeItem.command = {
                                title: 'Open File',
                                command: 'clarion.openFile',
                                arguments: [fullFilePath]
                            };
                            treeItem.tooltip = `File: ${file.name || path.basename(fallbackPath)}\nPath: ${fullFilePath} (direct)`;
                        } else {
                            treeItem.tooltip = `⚠️ File not found: ${file.name || fallbackPath}`;
                            logger.warn(`⚠️ getTreeItem(): File not found for ${file.name || fallbackPath}`);
                        }
                    } else {
                        treeItem.tooltip = `⚠️ File not found: ${file.name || file.relativePath || "unknown-file"}`;
                        logger.warn(`⚠️ getTreeItem(): File not found for ${file.name || file.relativePath || "unknown-file"}`);
                    }
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

        const solution = data as ClarionSolutionInfo;
        treeItem.iconPath = new ThemeIcon('symbol-class');
        treeItem.contextValue = 'clarionSolution';
        treeItem.tooltip = "Right-click for more options";
        
        // Add build progress to description if building
        if (this._buildProgress) {
            treeItem.description = `Building ${this._buildProgress.current} of ${this._buildProgress.total}`;
            treeItem.tooltip = `Building solution: ${this._buildProgress.current} of ${this._buildProgress.total} projects completed`;
        }
        
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
        const startTime = performance.now();
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
                const endTime = performance.now();
                logger.info(`✅ Created 'Open Solution' node in ${(endTime - startTime).toFixed(2)}ms`);
                return this._root;
            }
    
            // Use the solution info directly without refreshing again
            // This avoids duplicate refreshes since the refresh() method already refreshes the cache
            let solution = this.solutionCache.getSolutionInfo();

            if (!solution) {
                logger.warn("⚠️ No solution available in cache.");
                return this._root || [];
            }

            // Check if we already have a valid tree with projects
            if (this._root && this._root.length > 0 && this._root[0].children && this._root[0].children.length > 0) {
                // We have an existing tree with projects
                if (!solution.projects || !Array.isArray(solution.projects) || solution.projects.length === 0) {
                    logger.warn("⚠️ Server returned empty projects array. Preserving existing tree.");
                    logger.info(`✅ Preserved existing tree with ${this._root[0].children.length} projects`);
                    return this._root;
                }
            }

            // If we don't have an existing tree or the solution has projects, proceed normally
            if (!solution.projects || !Array.isArray(solution.projects) || solution.projects.length === 0) {
                logger.warn("⚠️ Invalid or empty projects array in solution. Forcing refresh from server...");
                
                // Try one more time with force refresh
                await this.solutionCache.refresh(true);
                const refreshedSolution = this.solutionCache.getSolutionInfo();
                
                if (!refreshedSolution || !refreshedSolution.projects || refreshedSolution.projects.length === 0) {
                    logger.error("❌ Still unable to get valid solution data after force refresh");
                    
                    // If we have an existing tree, preserve it
                    if (this._root && this._root.length > 0) {
                        logger.info("✅ Preserving existing tree after failed refresh");
                        return this._root;
                    }
                    
                    return this._root || [];
                }
                
                // Use the refreshed solution
                solution = refreshedSolution;
            }

            logger.info(`🌲 Building tree for solution: ${solution.name}`);
            logger.info(`📁 Projects in solution: ${solution.projects.length}`);
            
            // Create the solution node
            const solutionNode = new TreeNode(
                solution.name || "Solution",
                TreeItemCollapsibleState.Expanded,
                solution
            );

            // Add Applications group if there are any applications
            if (solution.applications && solution.applications.length > 0) {
                const applicationsGroupNode = new TreeNode(
                    "Applications",
                    TreeItemCollapsibleState.Expanded,
                    { type: 'applications-group' },
                    solutionNode
                );

                // Determine application order based on sort preference
                let orderedApplications = [...solution.applications];
                
                if (this._applicationSortOrder === 'build') {
                    // Sort by build order (dependency order)
                    try {
                        const solutionDir = path.dirname(globalSolutionFile);
                        const resolver = new ProjectDependencyResolver(solutionDir, solution.projects);
                        
                        await resolver.analyzeDependencies();
                        
                        const buildOrder = resolver.getBuildOrder();
                        
                        // Create a map of project names to their build order index
                        const buildOrderMap = new Map<string, number>();
                        buildOrder.forEach((project, index) => {
                            buildOrderMap.set(project.name.toLowerCase(), index);
                        });
                        
                        // Sort applications based on their matching project's build order
                        orderedApplications.sort((a, b) => {
                            const nameA = a.name.replace(/\.app$/i, '').toLowerCase();
                            const nameB = b.name.replace(/\.app$/i, '').toLowerCase();
                            
                            const orderA = buildOrderMap.get(nameA) ?? 999999;
                            const orderB = buildOrderMap.get(nameB) ?? 999999;
                            
                            return orderA - orderB;
                        });
                    } catch (error) {
                        logger.error(`Failed to sort applications by build order: ${error}`);
                        // Fall back to solution order
                    }
                }

                // Add APP file nodes in the determined order
                for (const app of orderedApplications) {
                    const appNode = new TreeNode(
                        app.name,
                        TreeItemCollapsibleState.None,
                        {
                            type: 'clarionApp',
                            name: app.name,
                            relativePath: app.relativePath,
                            absolutePath: app.absolutePath
                        },
                        applicationsGroupNode
                    );
                    applicationsGroupNode.children.push(appNode);
                }

                solutionNode.children.push(applicationsGroupNode);
                logger.info(`✅ Added Applications group with ${solution.applications.length} APP file(s)`);
            }

            // Add project nodes with minimal information - details will be loaded on demand
            for (const project of solution.projects.filter(Boolean)) {
                // Create a project node with no children initially
                // Add project identity data to allow lazy loading on expand
                const projectNode = new TreeNode(
                    project.name || "Unnamed Project",
                    TreeItemCollapsibleState.Collapsed,
                    {
                        ...project,
                        kind: 'project',
                        projectId: project.guid,
                        projectPath: project.path,
                        projectName: project.name
                    },
                    solutionNode
                );
                
                // Add counts to the project node label if available
                const projectWithCounts = project as any;
                const projectNodeWithDesc = projectNode as TreeNodeWithDescription;
                
                if (projectWithCounts.sourceFilesCount !== undefined) {
                    projectNodeWithDesc.description = `${projectWithCounts.sourceFilesCount} ${projectWithCounts.sourceFilesCount === 1 ? 'file' : 'files'}`;
                } else if (project.sourceFiles) {
                    projectNodeWithDesc.description = `${project.sourceFiles.length} ${project.sourceFiles.length === 1 ? 'file' : 'files'}`;
                } else {
                    // Default to 0 files if no count is available
                    projectNodeWithDesc.description = "0 files";
                }

                // Add the project node to the solution
                solutionNode.children.push(projectNode);
                logger.info(`✅ Added project ${project.name} to solution tree (details will be loaded on demand)`);
            }

            logger.info(`✅ Added ${solutionNode.children.length} projects to solution tree`);
            this._root = [solutionNode];
            this._onDidChangeTreeData.fire();
            const endTime = performance.now();
            logger.info(`✅ Solution tree updated successfully in ${(endTime - startTime).toFixed(2)}ms`);

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
    
    // The updateReverseIndex method has been removed as part of the client-side caching removal
    // Project files are now always requested from the server when needed
}
