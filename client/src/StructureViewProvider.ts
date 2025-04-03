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

export class StructureViewProvider implements TreeDataProvider<DocumentSymbol> {
    private _onDidChangeTreeData: EventEmitter<DocumentSymbol | undefined | null | void> = new EventEmitter<DocumentSymbol | undefined | null | void>();
    readonly onDidChangeTreeData: Event<DocumentSymbol | undefined | null | void> = this._onDidChangeTreeData.event;

    // Store the expanded state of tree items
    private expandedState: Map<string, boolean> = new Map();

    // Flag to indicate if all items should be expanded
    private expandAllFlag: boolean = false;

    private activeEditor: TextEditor | undefined;
    public treeView: any;

    constructor(treeView?: any) {
        this.treeView = treeView;

        // Listen for active editor changes
        window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor = editor;
            this._onDidChangeTreeData.fire();
        });

        // Listen for document changes
        workspace.onDidChangeTextDocument(event => {
            if (this.activeEditor && event.document === this.activeEditor.document) {
                this._onDidChangeTreeData.fire();
            }
        });

        // Initialize with the current active editor
        this.activeEditor = window.activeTextEditor;
    }

    refresh(): void {
        // Reset the expandAllFlag when refreshing
        this.expandAllFlag = false;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DocumentSymbol): TreeItem {
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

        const treeItem = new TreeItem(element.name, collapsibleState);

        // Set icon based on symbol kind
        treeItem.iconPath = this.getIconForSymbolKind(element.kind);

        // Set tooltip to include detail if available
        treeItem.tooltip = element.detail ? `${element.name} (${element.detail})` : element.name;

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

    async getChildren(element?: DocumentSymbol): Promise<DocumentSymbol[]> {
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
    
            return element.children ?? [];
        }
    
        try {
            const symbols = await commands.executeCommand<DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                this.activeEditor.document.uri
            );
            
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
     */
    async expandAll(): Promise<void> {
        this.expandAllFlag = true;
    
        this._onDidChangeTreeData.fire(); // First refresh to force getChildren()
    
        // Give the tree some time to populate
        await new Promise(resolve => setTimeout(resolve, 100));
    
        const symbols = await this.getChildren(); // Now fetch the fresh, tracked instances
    
        if (this.treeView && symbols) {
            for (const symbol of symbols) {
                await this.expandSymbolRecursively(symbol); // Uses elementMap
            }
        }
    }
    

    private async expandSymbolRecursively(symbol: DocumentSymbol): Promise<void> {
        try {
            const key = this.getElementKey(symbol);
            const tracked = this.elementMap.get(key);
            if (!tracked) {
                logger.error(`❌ Missing elementMap entry for key: ${key} (${symbol.name})`);
                logger.debug('Current keys:', Array.from(this.elementMap.keys()));
                return;
            }
            
            
            // if (tracked !== symbol) {
            //     logger.warn(`⚠️ Symbol instance mismatch for ${symbol.name}. Reveal will likely fail.`);
            // }
            
    
            await this.treeView?.reveal(tracked, { expand: true });
    
         //   await new Promise(resolve => setTimeout(resolve, 50));
    
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
}