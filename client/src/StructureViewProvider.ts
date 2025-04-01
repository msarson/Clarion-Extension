import {
    TreeDataProvider,
    TreeItem,
    Event,
    EventEmitter,
    TreeItemCollapsibleState,
    ThemeIcon,
    window,
    workspace,
    Uri,
    SymbolKind as VSCodeSymbolKind,
    TextEditor,
    commands,
    Range,
    Position
} from 'vscode';
import { DocumentSymbol, SymbolKind as LSPSymbolKind } from 'vscode-languageserver-types';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("StructureViewProvider");
logger.setLevel("error");

export class StructureViewProvider implements TreeDataProvider<DocumentSymbol> {
    private _onDidChangeTreeData: EventEmitter<DocumentSymbol | undefined | null | void> = new EventEmitter<DocumentSymbol | undefined | null | void>();
    readonly onDidChangeTreeData: Event<DocumentSymbol | undefined | null | void> = this._onDidChangeTreeData.event;

    private activeEditor: TextEditor | undefined;

    constructor() {
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
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DocumentSymbol): TreeItem {
        const collapsibleState = element.children && element.children.length > 0 
            ? TreeItemCollapsibleState.Expanded 
            : TreeItemCollapsibleState.None;
        
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

    async getChildren(element?: DocumentSymbol): Promise<DocumentSymbol[]> {
        if (!this.activeEditor) {
            return [];
        }

        // If element is provided, return its children
        if (element) {
            return element.children || [];
        }

        try {
            // Get document symbols for the current document
            const symbols = await commands.executeCommand<DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                this.activeEditor.document.uri
            );

            if (symbols && symbols.length > 0) {
                return symbols;
            }
            
            return [];
        } catch (error) {
            logger.error(`Error getting document symbols: ${error}`);
            return [];
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
}