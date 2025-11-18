import {
    TreeDataProvider,
    TreeItem,
    Event,
    EventEmitter,
    TreeItemCollapsibleState,
    ThemeIcon,
    window,
    workspace,
    SymbolKind as VSCodeSymbolKind,
    TextEditor,
    commands,
    Range,
    TreeView,
    TreeViewExpansionEvent
} from 'vscode';
import { DocumentSymbol, SymbolKind as LSPSymbolKind } from 'vscode-languageserver-types';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("StructureViewProvider");
logger.setLevel("error");

// 📊 PERFORMANCE: Create perf logger that always logs
const perfLogger = LoggerManager.getLogger("StructureViewPerf");
perfLogger.setLevel("info"); // Keep perf logs visible

// No thresholds needed - solution view priority is handled on the server side


export class StructureViewProvider implements TreeDataProvider<DocumentSymbol> {
    private _onDidChangeTreeData: EventEmitter<DocumentSymbol | undefined | null | void> = new EventEmitter<DocumentSymbol | undefined | null | void>();
    readonly onDidChangeTreeData: Event<DocumentSymbol | undefined | null | void> = this._onDidChangeTreeData.event;

    // Store the expanded state of tree items
    private expandedState: Map<string, boolean> = new Map();

    // Flag to indicate if all items should be expanded
    private expandAllFlag: boolean = false;

    private activeEditor: TextEditor | undefined;
    public treeView: TreeView<DocumentSymbol> | undefined;
    
    // Follow cursor functionality
    private followCursor: boolean = true;
    private selectionChangeDebounceTimeout: NodeJS.Timeout | null = null;
    private currentHighlightedSymbol: DocumentSymbol | undefined;
    
    // Filter-related properties
    private _filterText: string = '';
    private _filterDebounceTimeout: NodeJS.Timeout | null = null;
    private _filteredNodesCache: Map<string, DocumentSymbol[]> = new Map();
    private _debounceDelay: number = 300; // 300ms debounce delay

    constructor(treeView?: TreeView<DocumentSymbol>) {
        this.treeView = treeView;
        
        // Initialize the follow cursor context - make sure to use await in an async IIFE
        (async () => {
            try {
                await commands.executeCommand('setContext', 'clarion.followCursorEnabled', this.followCursor);
                logger.info(`Initialized clarion.followCursorEnabled context to ${this.followCursor}`);
            } catch (error) {
                logger.error(`Failed to set context: ${error}`);
            }
        })();

        // Listen for active editor changes
        window.onDidChangeActiveTextEditor(editor => {
            perfLogger.info(`📊 PERF: Active editor changed to: ${editor?.document.fileName || 'none'}`);
            const perfStart = performance.now();
            
            this.activeEditor = editor;
            
            // Clear any active filter when changing documents
            if (this._filterText !== '') {
                logger.info(`🔄 Clearing filter when changing document`);
                this._filterText = '';
                this._filteredNodesCache.clear();
            }
            
            this._onDidChangeTreeData.fire();
            
            const perfTime = performance.now() - perfStart;
            perfLogger.info(`📊 PERF: Structure view updated for editor change: ${perfTime.toFixed(2)}ms`);
        });

        // Listen for document changes
        workspace.onDidChangeTextDocument(event => {
            if (this.activeEditor && event.document === this.activeEditor.document) {
                this._onDidChangeTreeData.fire();
            }
        });
        
        // Listen for selection changes to implement "Follow Cursor" functionality
        window.onDidChangeTextEditorSelection(event => {
            if (this.followCursor && this.activeEditor && event.textEditor === this.activeEditor) {
                // Debounce the selection change to avoid excessive updates
                if (this.selectionChangeDebounceTimeout) {
                    clearTimeout(this.selectionChangeDebounceTimeout);
                }
                
                this.selectionChangeDebounceTimeout = setTimeout(() => {
                    this.revealActiveSelection();
                    this.selectionChangeDebounceTimeout = null;
                }, 100); // 100ms debounce delay for cursor movements
            }
        });

        // Initialize with the current active editor
        this.activeEditor = window.activeTextEditor;
    }

    refresh(): void {
        perfLogger.info(`📊 PERF: Structure view refresh triggered`);
        const perfStart = performance.now();
        
        // Reset the expandAllFlag when refreshing
        this.expandAllFlag = false;
        // Clear the filter cache when refreshing
        this._filteredNodesCache.clear();
        // Clear the visibility map
        this.visibilityMap.clear();
        this._onDidChangeTreeData.fire();
        
        const perfTime = performance.now() - perfStart;
        perfLogger.info(`📊 PERF: Structure view refresh completed: ${perfTime.toFixed(2)}ms`);
    }
    
    /**
     * Toggles the "Follow Cursor" functionality
     * @returns The new state of the follow cursor setting
     */
    toggleFollowCursor(): boolean {
        this.followCursor = !this.followCursor;
        logger.info(`🔄 Follow cursor ${this.followCursor ? 'enabled' : 'disabled'}`);
        
        // If we just enabled follow cursor, immediately reveal the current selection
        if (this.followCursor) {
            this.revealActiveSelection();
        } else {
            // Clear the current highlighted symbol when disabling
            this.currentHighlightedSymbol = undefined;
            this._onDidChangeTreeData.fire();
        }
        
        return this.followCursor;
    }
    
    /**
     * Gets the current state of the follow cursor setting
     */
    isFollowCursorEnabled(): boolean {
        return this.followCursor;
    }
    
    /**
     * Finds and reveals the symbol at the current cursor position
     */
    private async revealActiveSelection(): Promise<void> {
        if (!this.activeEditor || !this.treeView) {
            return;
        }
        
        try {
            // Get the current cursor position
            const position = this.activeEditor.selection.active;
            
            // Get all symbols for the current document
            const symbols = await this.getChildren();
            if (!symbols || symbols.length === 0) {
                return;
            }
            
            // Find the symbol that contains the cursor position
            const symbol = this.findSymbolAtPosition(symbols, position.line);
            if (symbol) {
                // Store the currently highlighted symbol
                this.currentHighlightedSymbol = symbol;
                
                // Reveal the symbol in the tree view
                await this.treeView.reveal(symbol, { select: true, focus: false });
                
                // Force refresh to apply highlighting
                this._onDidChangeTreeData.fire(symbol);
            }
        } catch (error) {
            // This can happen if VS Code hasn't finished building the tree yet or if the symbol structure changed
            // It's usually harmless - the tree will sync on next cursor move
            logger.debug(`Could not reveal symbol in tree view (this is usually harmless): ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.stack) {
                logger.debug(`Stack: ${error.stack}`);
            }
        }
    }
    
    /**
     * Recursively finds the most specific symbol that contains the given line
     * @param symbols The symbols to search through
     * @param line The line number to find
     * @returns The most specific symbol containing the line, or undefined if none found
     */
    private findSymbolAtPosition(symbols: DocumentSymbol[], line: number): DocumentSymbol | undefined {
        if (!symbols || symbols.length === 0) {
            return undefined;
        }
        
        // Find all symbols that contain the line
        const containingSymbols = symbols.filter(symbol =>
            line >= symbol.range.start.line && line <= symbol.range.end.line
        );
        
        if (containingSymbols.length === 0) {
            return undefined;
        }
        
        // Sort by specificity (smaller range is more specific)
        containingSymbols.sort((a, b) => {
            const aRange = a.range.end.line - a.range.start.line;
            const bRange = b.range.end.line - b.range.start.line;
            return aRange - bRange;
        });
        
        // Get the most specific symbol
        const mostSpecificSymbol = containingSymbols[0];
        
        // Check if there's an even more specific symbol in the children
        if (mostSpecificSymbol.children && mostSpecificSymbol.children.length > 0) {
            const childSymbol = this.findSymbolAtPosition(mostSpecificSymbol.children, line);
            if (childSymbol) {
                return childSymbol;
            }
        }
        
        return mostSpecificSymbol;
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
            this.visibilityMap.clear();
            this._onDidChangeTreeData.fire();
        }
    }

    // Get the current filter text
    getFilterText(): string {
        return this._filterText;
    }

    getTreeItem(element: DocumentSymbol): TreeItem {
        // Store the current element being processed
        this.currentElement = element;
        
        // Generate a unique key for this element
        const elementKey = this.getElementKey(element);

        // Determine collapsible state based on expanded state map or default to expanded
        let collapsibleState = TreeItemCollapsibleState.None;

        if (element.children && element.children.length > 0) {
            if (this.expandAllFlag) {
                // If expandAllFlag is set, expand all nodes
                collapsibleState = TreeItemCollapsibleState.Expanded;
            } else {
                // Otherwise use the expandedState map
                collapsibleState = this.expandedState.has(elementKey)
                    ? (this.expandedState.get(elementKey) ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed)
                    : TreeItemCollapsibleState.Expanded;
            }
        }

        // Create tree item with name only (not detail)
        const treeItem = new TreeItem(element.name, collapsibleState);

        // Set icon based on symbol kind and detail
        // Set icon based on symbol kind
        treeItem.iconPath = this.getIconForSymbolKind(element.kind);
        
        // Add detail as description if available (shows to the right of the name)
        if (element.detail) {
            // Special handling for method declarations and implementations
            if (element.detail === "Declaration") {
                // Check if this method has an implementation
                const hasImplementation = element.children?.some(child =>
                    child.detail === "Implementation");
                
                if (hasImplementation) {
                    treeItem.description = "Declaration @L" + (element.range.start.line + 1);
                } else {
                    treeItem.description = "Declaration";
                }
            } else if (element.detail === "Implementation") {
                treeItem.description = "Implementation @L" + (element.range.start.line + 1);
            } else {
                treeItem.description = element.detail;
            }
        } else if (element.name === "Functions" && element.kind === 10) { // SymbolKind.Function
            // Special handling for Functions container in MAP and MODULE
            treeItem.description = "MAP/MODULE Functions";
        }

        // Set tooltip to include detail if available
        treeItem.tooltip = element.detail ? `${element.name} (${element.detail})` : element.name;
        
        // Apply highlighting if this is the currently highlighted symbol
        if (this.currentHighlightedSymbol && this.getElementKey(element) === this.getElementKey(this.currentHighlightedSymbol)) {
            // Make the item stand out more with a description
            // If we already have a detail description, append the current position marker
            if (element.detail) {
                treeItem.description = `${element.detail} ← current position`;
            } else {
                treeItem.description = "← current position";
            }
            
            // Use a different icon to make it more visible
            treeItem.iconPath = new ThemeIcon('location');
        }

        // Set command to navigate to symbol when clicked
        if (this.activeEditor) {
            const range = new Range(
                element.range.start.line,
                element.range.start.character,
                element.range.end.line,
                element.range.end.character
            );

            treeItem.command = {
                command: 'clarion.goToSymbol',
                title: 'Go to Symbol',
                arguments: [
                    this.activeEditor.document.uri,
                    range
                ]
            };
        }

        return treeItem;
    }
    private elementMap = new Map<string, DocumentSymbol>();
    private visibilityMap = new Map<string, boolean>();

    async getChildren(element?: DocumentSymbol): Promise<DocumentSymbol[]> {
        // 📊 PERFORMANCE: Track getChildren timing
        const perfStart = performance.now();
        const context = element ? `child of ${element.name}` : 'root';
        
        if (!this.activeEditor) return [];

        if (element) {
            const key = this.getElementKey(element);
            this.elementMap.set(key, element); // track the real instance

            if (element.children) {
                for (const child of element.children) {
                    const childKey = this.getElementKey(child);
                    this.elementMap.set(childKey, child);
                }
            }
            
            // Check if we have a filter active
            if (this._filterText && this._filterText.trim() !== '') {
                // Create a cache key based on the element's key
                const cacheKey = `${key}_${this._filterText}`;
                
                // Check if we have cached results for this element
                if (this._filteredNodesCache.has(cacheKey)) {
                    const cachedNodes = this._filteredNodesCache.get(cacheKey);
                    logger.info(`  - Returning ${cachedNodes?.length || 0} cached filtered children`);
                    const perfTime = performance.now() - perfStart;
                    if (perfTime > 10) perfLogger.info(`📊 PERF: getChildren(${context}) cached: ${perfTime.toFixed(2)}ms`);
                    return cachedNodes || [];
                }
                
                // When a filter is active, only return visible children
                const visibleChildren = (element.children ?? []).filter(child => {
                    const childKey = this.getElementKey(child);
                    return this.visibilityMap.get(childKey) === true;
                });
                
                // Cache the results
                this._filteredNodesCache.set(cacheKey, visibleChildren);
                
                logger.info(`  - Returning ${visibleChildren.length} visible children`);
                const perfTime = performance.now() - perfStart;
                if (perfTime > 10) perfLogger.info(`📊 PERF: getChildren(${context}) filtered: ${perfTime.toFixed(2)}ms`);
                return visibleChildren;
            }

            const perfTime = performance.now() - perfStart;
            if (perfTime > 10) perfLogger.info(`📊 PERF: getChildren(${context}) direct: ${perfTime.toFixed(2)}ms`);
            return element.children ?? [];
        }

        try {
            const symbolsStart = performance.now();
            
            // For normal-sized documents, proceed with symbol request
            const symbols = await commands.executeCommand<DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                this.activeEditor.document.uri
            );
            
            const symbolsTime = performance.now() - symbolsStart;
            perfLogger.info(`📊 PERF: executeDocumentSymbolProvider: ${symbolsTime.toFixed(2)}ms, returned ${symbols?.length || 0} symbols`);
            
            this.elementMap.clear();

            const trackSymbols = (symbolList: DocumentSymbol[]) => {
                for (const symbol of symbolList) {
                    const key = this.getElementKey(symbol);
                    this.elementMap.set(key, symbol);
                    if (symbol.children?.length) {
                        trackSymbols(symbol.children);
                    }
                }
            };

            if (symbols) {
                trackSymbols(symbols);
                
                // If we have a filter active
                if (this._filterText && this._filterText.trim() !== '') {
                    // Create a cache key for root level
                    const rootCacheKey = 'root_' + this._filterText;
                    
                    // Check if we have cached results for root level
                    if (this._filteredNodesCache.has(rootCacheKey)) {
                        const cachedRootNodes = this._filteredNodesCache.get(rootCacheKey);
                        logger.info(`  - Returning ${cachedRootNodes?.length || 0} cached filtered root nodes`);
                        return cachedRootNodes || [];
                    }
                    
                    // Apply filtering to mark symbols as visible or hidden
                    this.filterSymbols(symbols, this._filterText);
                    
                    // Get only the visible symbols
                    const visibleSymbols = symbols.filter(symbol => {
                        const symbolKey = this.getElementKey(symbol);
                        return this.visibilityMap.get(symbolKey) === true;
                    });
                    
                    // Cache the results
                    this._filteredNodesCache.set(rootCacheKey, visibleSymbols);
                    
                    logger.info(`  - Returning ${visibleSymbols.length} visible root symbols`);
                    return visibleSymbols;
                }
            }

            return symbols ?? [];
        } catch (error) {
            logger.error(`Error getting document symbols: ${error}`);
            return [];
        }
    }
    

    private storeInElementMap(symbols: DocumentSymbol[]): void {
        for (const symbol of symbols) {
            const key = this.getElementKey(symbol);
            this.elementMap.set(key, symbol);

            if (symbol.children && symbol.children.length > 0) {
                this.storeInElementMap(symbol.children);
            }
        }
    }


    private getIconForSymbolKind(kind: LSPSymbolKind): ThemeIcon {
        switch (kind) {
            case LSPSymbolKind.File:
                return new ThemeIcon('file');
            case LSPSymbolKind.Module:
                return new ThemeIcon('package');
            case LSPSymbolKind.Namespace:
                return new ThemeIcon('symbol-namespace');
            case LSPSymbolKind.Class:
                return new ThemeIcon('symbol-class');
            case LSPSymbolKind.Method:
                return new ThemeIcon('symbol-method');
            case LSPSymbolKind.Property:
                return new ThemeIcon('symbol-property');
            case LSPSymbolKind.Field:
                return new ThemeIcon('symbol-field');
            case LSPSymbolKind.Constructor:
                return new ThemeIcon('symbol-constructor');
            case LSPSymbolKind.Enum:
                return new ThemeIcon('symbol-enum');
            case LSPSymbolKind.Interface:
                return new ThemeIcon('symbol-interface');
            case LSPSymbolKind.Function:
                // Special handling for Functions container in MAP and MODULE
                if (this.isMapModuleFunctionsContainer) {
                    return new ThemeIcon('list-tree');
                }
                return new ThemeIcon('symbol-function');
            case LSPSymbolKind.Variable:
                return new ThemeIcon('symbol-variable');
            case LSPSymbolKind.Constant:
                return new ThemeIcon('symbol-constant');
            case LSPSymbolKind.String:
                return new ThemeIcon('symbol-string');
            case LSPSymbolKind.Number:
                return new ThemeIcon('symbol-number');
            case LSPSymbolKind.Boolean:
                return new ThemeIcon('symbol-boolean');
            case LSPSymbolKind.Array:
                return new ThemeIcon('symbol-array');
            case LSPSymbolKind.Object:
                return new ThemeIcon('symbol-object');
            case LSPSymbolKind.Key:
                return new ThemeIcon('symbol-key');
            case LSPSymbolKind.Null:
                return new ThemeIcon('symbol-null');
            case LSPSymbolKind.EnumMember:
                return new ThemeIcon('symbol-enum-member');
            case LSPSymbolKind.Struct:
                return new ThemeIcon('symbol-struct');
            case LSPSymbolKind.Event:
                return new ThemeIcon('symbol-event');
            case LSPSymbolKind.Operator:
                return new ThemeIcon('symbol-operator');
            case LSPSymbolKind.TypeParameter:
                return new ThemeIcon('symbol-parameter');
            default:
                return new ThemeIcon('symbol-misc');
        }
    }
    
    // Helper to check if this is a Functions container for MAP or MODULE
    private get isMapModuleFunctionsContainer(): boolean {
        const element = this.currentElement;
        return element?.name === "Functions" && element?.kind === 10; // SymbolKind.Function
    }
    
    // Track the current element being processed
    private currentElement: DocumentSymbol | undefined;

    /**
     * Collapses all nodes in the tree view
     */
    async collapseAll(): Promise<void> {
        // Set the expandAllFlag to false
        this.expandAllFlag = false;

        // Clear the expanded state map
        this.expandedState.clear();

        // Refresh the tree view to apply the changes
        this._onDidChangeTreeData.fire();
    }

    /**
     * Generates a unique key for a document symbol
     * @param element The document symbol
     * @returns A string key
     */
    private getElementKey(element: DocumentSymbol): string {
        return `${element.name}_${element.range.start.line}_${element.range.start.character}_${element.kind}`;
    }
    public setTreeView(treeView: TreeView<DocumentSymbol>): void {
        this.treeView = treeView;

        this.treeView.onDidExpandElement((e: TreeViewExpansionEvent<DocumentSymbol>) => {
            this.expandedState.set(this.getElementKey(e.element), true);
        });

        this.treeView.onDidCollapseElement((e: TreeViewExpansionEvent<DocumentSymbol>) => {
            this.expandedState.set(this.getElementKey(e.element), false);
        });

    }

    /**
     * Expands all nodes in the tree view
     * ⚠️ Performance: For large files with 100+ symbols, this can take several seconds
     */
    async expandAll(): Promise<void> {
        this.expandAllFlag = true;
    
        this._onDidChangeTreeData.fire(); // First refresh to force getChildren()
    
        // 🚀 PERFORMANCE: Reduced delay from 100ms to 10ms
        await new Promise(resolve => setTimeout(resolve, 10));
    
        const symbols = await this.getChildren(); // Now fetch the fresh, tracked instances
    
        if (this.treeView && symbols) {
            // 🚀 PERFORMANCE: Only expand top-level symbols to avoid 20+ second delay
            // User can manually expand children as needed
            const expandPromises = symbols.map(symbol => this.expandTopLevelOnly(symbol));
            await Promise.all(expandPromises); // Parallel expansion for speed
        }
    }
    
    /**
     * 🚀 PERFORMANCE: Expand only the top level, not all children recursively
     * This prevents 20+ second delays on large files
     */
    private async expandTopLevelOnly(symbol: DocumentSymbol): Promise<void> {
        try {
            const key = this.getElementKey(symbol);
            const tracked = this.elementMap.get(key);
            if (!tracked) {
                logger.error(`❌ Missing elementMap entry for key: ${key} (${symbol.name})`);
                return;
            }
            
            await this.treeView?.reveal(tracked, { expand: true });
        } catch (error) {
            logger.error(`Failed to expand symbol: ${symbol.name}`, error);
        }
    }

    /**
     * Legacy recursive expansion - kept for potential future use
     * ⚠️ WARNING: This is SLOW on large files (20+ seconds for 500+ symbols)
     */
    private async expandSymbolRecursively(symbol: DocumentSymbol): Promise<void> {
        try {
            const key = this.getElementKey(symbol);
            const tracked = this.elementMap.get(key);
            if (!tracked) {
                logger.error(`❌ Missing elementMap entry for key: ${key} (${symbol.name})`);
                logger.debug('Current keys:', Array.from(this.elementMap.keys()));
                return;
            }
    
            await this.treeView?.reveal(tracked, { expand: true });
    
            for (const child of tracked.children ?? []) {
                await this.expandSymbolRecursively(child);
            }
        } catch (error) {
            logger.error(`Failed to expand symbol: ${symbol.name}`, error);
        }
    }
    
    




    private setAllExpanded(symbols: DocumentSymbol[]): void {
        for (const symbol of symbols) {
            if (symbol.children && symbol.children.length > 0) {
                const key = this.getElementKey(symbol);
                this.expandedState.set(key, true);
                this.setAllExpanded(symbol.children);
            }
        }
    }

    /**
     * Gets the parent of a given element
     * @param element The element to get the parent for
     * @returns The parent element, or null if the element is a root element
     */
    getParent(element: DocumentSymbol): Promise<DocumentSymbol | null> {
        return Promise.resolve(null); // Root elements have no parent
    }
    // Helper method to filter nodes based on text
    private filterNodes(nodes: DocumentSymbol[], filterText: string): DocumentSymbol[] {
        if (!nodes || nodes.length === 0) {
            return [];
        }
        
        const normalizedFilter = filterText.toLowerCase();
        
        // Mark all nodes as visible or hidden based on the filter
        const markVisibility = (nodeList: DocumentSymbol[]) => {
            // First, mark all nodes as not visible
            for (const node of nodeList) {
                const key = this.getElementKey(node);
                this.visibilityMap.set(key, false);
                
                if (node.children && node.children.length > 0) {
                    markVisibility(node.children);
                }
            }
        };
        
        // Mark nodes that match the filter or have matching descendants as visible
        const markMatchingVisible = (node: DocumentSymbol): boolean => {
            const key = this.getElementKey(node);
            
            // Check if this node matches
            const nodeMatches = this.symbolOrDescendantsMatch(node, normalizedFilter);
            
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
            const isVisible = nodeMatches || hasMatchingChildren;
            this.visibilityMap.set(key, isVisible);
            
            return isVisible;
        };
        
        // Apply visibility marking
        markVisibility(nodes);
        for (const node of nodes) {
            markMatchingVisible(node);
        }
        
        // Return only the visible nodes
        return nodes.filter(node => {
            const key = this.getElementKey(node);
            return this.visibilityMap.get(key) === true;
        });
    }

    // Helper method for substring matching
    private substringMatch(text: string, filter: string): boolean {
        // Convert both strings to lowercase for case-insensitive matching
        const textLower = text.toLowerCase();
        const filterLower = filter.toLowerCase();
        
        // Check if filter is a substring of text
        return textLower.indexOf(filterLower) !== -1;
    }
    
    // Helper method to check if a symbol or any of its descendants match the filter
    private symbolOrDescendantsMatch(symbol: DocumentSymbol, normalizedFilter: string): boolean {
        // Check if this symbol matches
        if (this.substringMatch(symbol.name, normalizedFilter) ||
            (symbol.detail && this.substringMatch(symbol.detail, normalizedFilter))) {
            return true;
        }
        
        // Check if any children match
        if (symbol.children && symbol.children.length > 0) {
            for (const child of symbol.children) {
                if (this.symbolOrDescendantsMatch(child, normalizedFilter)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // Helper method to filter symbols recursively
    private filterSymbols(symbols: DocumentSymbol[], filterText: string): DocumentSymbol[] {
        if (!symbols || symbols.length === 0) {
            return [];
        }
        
        const normalizedFilter = filterText.toLowerCase();
        
        // Clear the visibility map when starting a new filter operation
        this.visibilityMap.clear();
        
        // Mark all symbols as visible or hidden based on the filter
        const markVisibility = (symbolList: DocumentSymbol[]) => {
            // First, mark all symbols as not visible
            for (const symbol of symbolList) {
                const key = this.getElementKey(symbol);
                this.visibilityMap.set(key, false);
                
                if (symbol.children && symbol.children.length > 0) {
                    markVisibility(symbol.children);
                }
            }
        };
        
        // Mark symbols that match the filter or have matching descendants as visible
        const markMatchingVisible = (symbol: DocumentSymbol): boolean => {
            const key = this.getElementKey(symbol);
            
            // Check if this symbol matches
            const symbolMatches = this.symbolOrDescendantsMatch(symbol, normalizedFilter);
            
            // Check if any children match
            let hasMatchingChildren = false;
            if (symbol.children && symbol.children.length > 0) {
                for (const child of symbol.children) {
                    if (markMatchingVisible(child)) {
                        hasMatchingChildren = true;
                    }
                }
            }
            
            // Mark this symbol as visible if it matches or has matching children
            const isVisible = symbolMatches || hasMatchingChildren;
            this.visibilityMap.set(key, isVisible);
            
            return isVisible;
        };
        
        // Apply visibility marking
        markVisibility(symbols);
        for (const symbol of symbols) {
            markMatchingVisible(symbol);
        }
        
        // Return only the visible symbols
        return symbols.filter(symbol => {
            const key = this.getElementKey(symbol);
            return this.visibilityMap.get(key) === true;
        });
    }
}