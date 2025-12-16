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
    TextDocument,
    commands,
    Range,
    TreeView,
    TreeViewExpansionEvent,
    Disposable
} from 'vscode';
import { DocumentSymbol, SymbolKind as LSPSymbolKind } from 'vscode-languageserver-types';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("StructureViewProvider");
logger.setLevel("info"); // Enable debug logging to troubleshoot follow cursor

// 📊 PERFORMANCE: Create perf logger that always logs
const perfLogger = LoggerManager.getLogger("StructureViewPerf");
perfLogger.setLevel("error"); // Reduce perf logging noise

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
    
    // Follow cursor functionality - enabled by default, but only works when Structure View is visible
    private followCursor: boolean = true;
    private isViewVisible: boolean = false; // Track if the Structure View is currently visible
    private selectionChangeDebounceTimeout: NodeJS.Timeout | null = null;
    private currentHighlightedSymbol: DocumentSymbol | undefined;
    
    // Filter-related properties
    private _filterText: string = '';
    private _filterDebounceTimeout: NodeJS.Timeout | null = null;
    private _filteredNodesCache: Map<string, DocumentSymbol[]> = new Map();
    private _debounceDelay: number = 300; // 300ms debounce delay
    
    // Document change debouncing
    private documentChangeDebounceTimeout: NodeJS.Timeout | null = null;
    private documentChangeDebounceDelay: number = 500; // 500ms debounce for document changes
    
    // Parent tracking for tree navigation
    private parentMap: Map<string, DocumentSymbol | null> = new Map();
    
    // Store disposables for proper cleanup
    private disposables: Disposable[] = [];

    constructor(treeView?: TreeView<DocumentSymbol>) {
        this.treeView = treeView;
        
        // Note: The follow cursor context is initialized in extension.ts after tree view creation
        
        // Listen for active editor changes
        this.disposables.push(window.onDidChangeActiveTextEditor(editor => {
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
        }));

        // Listen for document changes
        this.disposables.push(workspace.onDidChangeTextDocument(event => {
            if (this.activeEditor && event.document === this.activeEditor.document) {
                this._onDidChangeTreeData.fire();
            }
        }));
        
        // Listen for selection changes to implement "Follow Cursor" functionality
        this.disposables.push(window.onDidChangeTextEditorSelection(event => {
            logger.debug(`📍 Selection changed in editor: ${event.textEditor.document.fileName}`);
            logger.debug(`   followCursor=${this.followCursor}, isViewVisible=${this.isViewVisible}, activeEditor=${!!this.activeEditor}, match=${event.textEditor === this.activeEditor}`);
            
            // Only follow cursor if BOTH the feature is enabled AND the view is visible
            if (this.followCursor && this.isViewVisible && this.activeEditor && event.textEditor === this.activeEditor) {
                logger.debug(`   Triggering debounced reveal after 100ms`);
                // Debounce the selection change to avoid excessive updates
                if (this.selectionChangeDebounceTimeout) {
                    clearTimeout(this.selectionChangeDebounceTimeout);
                }
                
                this.selectionChangeDebounceTimeout = setTimeout(() => {
                    logger.debug(`   Debounce timeout fired, calling revealActiveSelection()`);
                    this.revealActiveSelection();
                    this.selectionChangeDebounceTimeout = null;
                }, 100); // 100ms debounce delay for cursor movements
            } else {
                logger.debug(`   Skipping reveal: followCursor=${this.followCursor}, isViewVisible=${this.isViewVisible}`);
            }
        }));

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
        // Clear the parent map
        this.parentMap.clear();
        this._onDidChangeTreeData.fire();
        
        const perfTime = performance.now() - perfStart;
        perfLogger.info(`📊 PERF: Structure view refresh completed: ${perfTime.toFixed(2)}ms`);
    }
    
    /**
     * Sets the "Follow Cursor" functionality to a specific state
     * @param enabled Whether to enable or disable follow cursor
     */
    setFollowCursor(enabled: boolean): void {
        this.followCursor = enabled;
        logger.debug(`🔄 Follow cursor set to ${this.followCursor ? 'enabled' : 'disabled'}`);
        logger.debug(`   Current state: followCursor=${this.followCursor}, isViewVisible=${this.isViewVisible}, activeEditor=${!!this.activeEditor}, treeView=${!!this.treeView}`);
        
        // Only reveal if BOTH enabled AND view is visible
        if (this.followCursor && this.isViewVisible) {
            logger.debug(`   Revealing active selection after enabling follow cursor`);
            this.revealActiveSelection();
        } else {
            // Clear the current highlighted symbol when disabling
            this.currentHighlightedSymbol = undefined;
            this._onDidChangeTreeData.fire();
            if (!this.isViewVisible) {
                logger.debug(`   View not visible, skipping reveal`);
            }
        }
    }
    
    /**
     * Updates the visibility state of the Structure View
     * Called by extension.ts when the view visibility changes
     * @param visible Whether the view is currently visible
     */
    setViewVisible(visible: boolean): void {
        this.isViewVisible = visible;
        logger.debug(`🔄 Structure View visibility changed to: ${visible}`);
        
        // If view just became visible and follow cursor is enabled, reveal current selection
        if (visible && this.followCursor) {
            logger.debug(`   View became visible with follow cursor enabled, revealing selection`);
            this.revealActiveSelection();
        }
    }
    
    /**
     * Toggles the "Follow Cursor" functionality
     * @returns The new state of the follow cursor setting
     */
    toggleFollowCursor(): boolean {
        this.setFollowCursor(!this.followCursor);
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
        logger.debug(`🔍 revealActiveSelection called`);
        logger.debug(`   activeEditor=${!!this.activeEditor}, treeView=${!!this.treeView}, followCursor=${this.followCursor}`);
        
        if (!this.activeEditor || !this.treeView) {
            logger.debug(`   Exiting: missing activeEditor or treeView`);
            return;
        }
        
        try {
            // Get the current cursor position
            const position = this.activeEditor.selection.active;
            logger.debug(`   Current cursor position: line ${position.line}`);
            
            // Get all symbols for the current document
            const symbols = await this.getChildren();
            logger.debug(`   Got ${symbols?.length || 0} symbols from getChildren()`);
            if (!symbols || symbols.length === 0) {
                logger.debug(`   Exiting: no symbols`);
                return;
            }
            
            // Find the symbol that contains the cursor position (searches recursively through all symbols and children)
            const symbol = this.findSymbolAtPosition(symbols, position.line);
            logger.debug(`   Found symbol at position: ${symbol ? symbol.name : 'none'}`);
            if (symbol) {
                // Store the currently highlighted symbol
                this.currentHighlightedSymbol = symbol;
                
                logger.debug(`   Revealing symbol: ${symbol.name} at range [${symbol.range.start.line}, ${symbol.range.end.line}]`);
                
                // Get the tracked instance from elementMap
                const key = this.getElementKey(symbol);
                const trackedSymbol = this.elementMap.get(key);
                logger.debug(`   Looking up tracked symbol with key: ${key}`);
                logger.debug(`   Found in elementMap: ${!!trackedSymbol}`);
                
                if (trackedSymbol) {
                    // Reveal using the tracked instance that VS Code knows about
                    await this.treeView.reveal(trackedSymbol, { select: true, focus: false, expand: true });
                    
                    // Force refresh to apply highlighting
                    this._onDidChangeTreeData.fire(trackedSymbol);
                    logger.debug(`   Symbol revealed successfully`);
                } else {
                    logger.debug(`   Could not find tracked symbol in elementMap`);
                }
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
        
        // Helper to check if a symbol is a container node (organizational only, not real code)
        const isContainerNode = (symbol: DocumentSymbol): boolean => {
            // Check if it's an organizational container
            if (symbol.name === "Methods" || 
                symbol.name === "Functions" ||
                symbol.name === "Properties" ||
                symbol.name === "Data" ||
                symbol.name === "CODE") {
                return true;
            }
            
            // Check if it's a regrouped class container (has Methods child and is SymbolKind.Class)
            if (symbol.kind === LSPSymbolKind.Class && 
                symbol.children && 
                symbol.children.some(c => c.name === "Methods")) {
                return true;
            }
            
            // Check if it's an interface implementation container (detail is 'Interface')
            if (symbol.kind === LSPSymbolKind.Interface && 
                symbol.detail === 'Interface') {
                return true;
            }
            
            return false;
        };
        
        // Process all symbols, searching inside containers but not selecting them
        let containingSymbols: DocumentSymbol[] = [];
        
        for (const symbol of symbols) {
            // If this is a container node, search its children instead
            if (isContainerNode(symbol)) {
                if (symbol.children && symbol.children.length > 0) {
                    const childResult = this.findSymbolAtPosition(symbol.children, line);
                    if (childResult) {
                        containingSymbols.push(childResult);
                    }
                }
            } else if (line >= symbol.range.start.line && line <= symbol.range.end.line) {
                // This is a real symbol that contains the line
                containingSymbols.push(symbol);
            }
        }
        
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
        // HOTFIX: Don't navigate for container nodes - they should only expand/collapse
        // Container nodes are organizational groupings with no real code position
        
        // Debug: Log ALL nodes to see what's happening
        console.log(`🔍 getTreeItem called: name='${element.name}', kind=${element.kind}, detail='${element.detail}'`);
        
        const isContainerNode = 
            element.name === "Methods" || 
            element.name === "Functions" ||
            element.name === "Properties" ||
            element.name === "Data";
        
        if (isContainerNode) {
            console.log(`🚫 HOTFIX: Container node detected: ${element.name} (kind=${element.kind}, detail='${element.detail}'), skipping navigation command`);
            logger.debug(`🚫 Container node detected: ${element.name}, skipping navigation command`);
        }
        
        if (this.activeEditor && !isContainerNode) {
            const range = new Range(
                element.range.start.line,
                element.range.start.character,
                element.range.end.line,
                element.range.end.character
            );

            console.log(`✅ HOTFIX: Navigation command attached to: ${element.name}`);
            treeItem.command = {
                command: 'clarion.goToSymbol',
                title: 'Go to Symbol',
                arguments: [
                    this.activeEditor.document.uri,
                    range
                ]
            };
            logger.debug(`✅ Navigation command attached to: ${element.name}`);
        }

        return treeItem;
    }
    private elementMap = new Map<string, DocumentSymbol>();
    private visibilityMap = new Map<string, boolean>();

    /**
     * Regroups flat symbols into hierarchical structure with class containers and Methods/Properties groups
     * Takes flat list like: SystemStringClass.Construct(), SystemStringClass.Destruct()
     * Returns: CLASS (SystemStringClass) > Methods > Construct(), Destruct()
     */
    private regroupFlatSymbols(symbols: DocumentSymbol[], document: TextDocument): DocumentSymbol[] {
        const result: DocumentSymbol[] = [];
        const classMap = new Map<string, DocumentSymbol>(); // Track class containers
        
        logger.info(`🔄 REGROUPING: Starting with ${symbols.length} flat symbols`);
        
        for (const symbol of symbols) {
            // Read the actual source line to get the full qualified name
            // because the language server might not provide it for interface implementations
            const sourceLine = document.lineAt(symbol.range.start.line).text;
            const fullName = sourceLine.trim().split(/\s+/)[0]; // Get first word (the full method name)
            
            // Check if this is a method implementation:
            // - Has dot in name (e.g., "SystemStringClass.Construct")
            // - Is a Method/Function/Interface kind (Clarion methods come through as Interface kind)
            // BUT exclude symbols where the dot is inside a string literal (e.g., STRING('ABC...'))
            const hasDot = fullName.includes('.');
            const isMethodKind = symbol.kind === LSPSymbolKind.Method || 
                               symbol.kind === LSPSymbolKind.Function ||
                               symbol.kind === LSPSymbolKind.Interface;
            
            // Check if dot is inside a string literal by looking for STRING(' pattern with a quote
            // Pattern: STRING('...') where ... contains a dot
            const dotInsideStringLiteral = /STRING\('[^']*\./i.test(fullName);
            
            const isMethodImpl = hasDot && isMethodKind && !dotInsideStringLiteral;
            
            logger.info(`  Symbol: ${symbol.name}, fullName: ${fullName}, hasDot=${hasDot}, isMethodKind=${isMethodKind}, dotInsideStringLiteral=${dotInsideStringLiteral}, isMethodImpl=${isMethodImpl}`);
            
            if (isMethodImpl) {
                // Check if this is an interface implementation (has 2+ dots)
                // e.g., "StandardBehavior.IListControl.GetSelectedItem"
                const dotCount = (fullName.match(/\./g) || []).length;
                const isInterfaceImpl = dotCount >= 2;
                
                if (isInterfaceImpl) {
                    // Extract: ClassName.InterfaceName.MethodName
                    const firstDotIndex = fullName.indexOf('.');
                    const className = fullName.substring(0, firstDotIndex);
                    const remainder = fullName.substring(firstDotIndex + 1);
                    const secondDotIndex = remainder.indexOf('.');
                    const interfaceName = remainder.substring(0, secondDotIndex);
                    const methodPart = remainder.substring(secondDotIndex + 1);
                    
                    // Find or create class container
                    let classContainer = classMap.get(className);
                    if (!classContainer) {
                        classContainer = {
                            name: className,
                            detail: 'Class',
                            kind: LSPSymbolKind.Class,
                            range: symbol.range,
                            selectionRange: symbol.selectionRange,
                            children: []
                        };
                        classMap.set(className, classContainer);
                        result.push(classContainer);
                    }
                    
                    // Find or create interface container within class
                    let interfaceContainer = classContainer.children?.find(c => c.name === interfaceName);
                    if (!interfaceContainer) {
                        interfaceContainer = {
                            name: interfaceName,
                            detail: 'Interface',
                            kind: LSPSymbolKind.Interface,
                            range: symbol.range,
                            selectionRange: symbol.selectionRange,
                            children: []
                        };
                        classContainer.children = classContainer.children || [];
                        classContainer.children.push(interfaceContainer);
                    }
                    
                    // Create method symbol under interface
                    const methodSymbol: DocumentSymbol = {
                        name: methodPart,
                        detail: symbol.detail || '',
                        kind: symbol.kind,
                        range: symbol.range,
                        selectionRange: symbol.selectionRange,
                        children: symbol.children || []
                    };
                    
                    (methodSymbol as any)._isMethodImplementation = true;
                    interfaceContainer.children = interfaceContainer.children || [];
                    interfaceContainer.children.push(methodSymbol);
                    
                    logger.info(`  ✅ Regrouped: ${fullName} -> ${className} > ${interfaceName} > ${methodPart}`);
                    
                    // Expand containers to include this method
                    if (symbol.range.start.line < classContainer.range.start.line ||
                        symbol.range.end.line > classContainer.range.end.line) {
                        classContainer.range = {
                            start: {
                                line: Math.min(symbol.range.start.line, classContainer.range.start.line),
                                character: Math.min(symbol.range.start.character, classContainer.range.start.character)
                            },
                            end: {
                                line: Math.max(symbol.range.end.line, classContainer.range.end.line),
                                character: Math.max(symbol.range.end.character, classContainer.range.end.character)
                            }
                        };
                    }
                    if (symbol.range.start.line < interfaceContainer.range.start.line ||
                        symbol.range.end.line > interfaceContainer.range.end.line) {
                        interfaceContainer.range = {
                            start: {
                                line: Math.min(symbol.range.start.line, interfaceContainer.range.start.line),
                                character: Math.min(symbol.range.start.character, interfaceContainer.range.start.character)
                            },
                            end: {
                                line: Math.max(symbol.range.end.line, interfaceContainer.range.end.line),
                                character: Math.max(symbol.range.end.character, interfaceContainer.range.end.character)
                            }
                        };
                    }
                } else {
                    // Regular method: ClassName.MethodName
                    const dotIndex = fullName.indexOf('.');
                    const className = fullName.substring(0, dotIndex);
                    const methodPart = fullName.substring(dotIndex + 1);
                    
                    // Find or create class container
                    let classContainer = classMap.get(className);
                    if (!classContainer) {
                        classContainer = {
                            name: className,
                            detail: 'Class',
                            kind: LSPSymbolKind.Class,
                            range: symbol.range,
                            selectionRange: symbol.selectionRange,
                            children: []
                        };
                        classMap.set(className, classContainer);
                        result.push(classContainer);
                    }
                    
                    // Find or create Methods container within class
                    let methodsContainer = classContainer.children?.find(c => c.name === 'Methods');
                    if (!methodsContainer) {
                        methodsContainer = {
                            name: 'Methods',
                            detail: '',
                            kind: LSPSymbolKind.Method,
                            range: symbol.range,
                            selectionRange: symbol.selectionRange,
                            children: []
                        };
                        classContainer.children = classContainer.children || [];
                        classContainer.children.push(methodsContainer);
                    }
                    
                    // Create new symbol with short name (without class prefix)
                    const methodSymbol: DocumentSymbol = {
                        name: methodPart,
                        detail: symbol.detail || '',
                        kind: symbol.kind,
                        range: symbol.range,
                        selectionRange: symbol.selectionRange,
                        children: symbol.children || []
                    };
                    
                    // Copy over any custom properties
                    (methodSymbol as any)._isMethodImplementation = true;
                
                    methodsContainer.children = methodsContainer.children || [];
                    methodsContainer.children.push(methodSymbol);
                    
                    logger.info(`  ✅ Regrouped: ${fullName} -> ${className} > Methods > ${methodPart}`);
                    
                    // Expand class container range to include this method
                    // Create new range objects since range properties are read-only
                    if (symbol.range.start.line < classContainer.range.start.line ||
                        symbol.range.end.line > classContainer.range.end.line) {
                        classContainer.range = {
                            start: {
                                line: Math.min(symbol.range.start.line, classContainer.range.start.line),
                                character: Math.min(symbol.range.start.character, classContainer.range.start.character)
                            },
                            end: {
                                line: Math.max(symbol.range.end.line, classContainer.range.end.line),
                                character: Math.max(symbol.range.end.character, classContainer.range.end.character)
                            }
                        };
                    }
                }
            } else {
                // Not a method implementation - add as-is
                result.push(symbol);
            }
        }
        
        logger.info(`🔄 REGROUPING: Finished. Created ${classMap.size} class containers. Result has ${result.length} root symbols`);
        
        return result;
    }

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
                    this.parentMap.set(childKey, element); // Track parent relationship
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

            const trackSymbols = (symbolList: DocumentSymbol[], parent: DocumentSymbol | null = null) => {
                for (const symbol of symbolList) {
                    const key = this.getElementKey(symbol);
                    this.elementMap.set(key, symbol);
                    this.parentMap.set(key, parent);
                    if (symbol.children?.length) {
                        trackSymbols(symbol.children, symbol);
                    }
                }
            };

            // REGROUP FLAT SYMBOLS: Convert flat method list back to hierarchical structure
            // Methods like "SystemStringClass.Construct ()" become nested under SystemStringClass > Methods > Construct
            let regroupedSymbols: DocumentSymbol[] = [];
            
            if (symbols) {
                regroupedSymbols = this.regroupFlatSymbols(symbols, this.activeEditor.document);
                trackSymbols(regroupedSymbols);
                
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
                    this.filterSymbols(regroupedSymbols, this._filterText);
                    
                    // Get only the visible symbols
                    const visibleSymbols = regroupedSymbols.filter(symbol => {
                        const symbolKey = this.getElementKey(symbol);
                        return this.visibilityMap.get(symbolKey) === true;
                    });
                    
                    // Cache the results
                    this._filteredNodesCache.set(rootCacheKey, visibleSymbols);
                    
                    logger.info(`  - Returning ${visibleSymbols.length} visible root symbols`);
                    return visibleSymbols;
                }
            }

            return regroupedSymbols;
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
        const key = this.getElementKey(element);
        const parent = this.parentMap.get(key) || null;
        logger.debug(`getParent called for ${element.name}, returning: ${parent ? parent.name : 'null'}`);
        return Promise.resolve(parent);
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
    
    /**
     * Returns the disposables for registration with extension context
     */
    getDisposables(): Disposable[] {
        return this.disposables;
    }
    
    /**
     * Disposes of all event listeners
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}