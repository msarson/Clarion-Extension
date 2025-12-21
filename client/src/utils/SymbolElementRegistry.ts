import { DocumentSymbol } from 'vscode-languageserver-protocol';

/**
 * Centralized registry for tracking DocumentSymbol elements, their keys,
 * parent relationships, and visibility state.
 * 
 * Handles element tracking without side effects - pure data structure management.
 */
export class SymbolElementRegistry {
    private elementMap = new Map<string, DocumentSymbol>();
    private visibilityMap = new Map<string, boolean>();
    private parentMap = new Map<string, DocumentSymbol | null>();

    /**
     * Generates a unique key for a document symbol
     * @param element The document symbol
     * @returns A string key
     */
    getElementKey(element: DocumentSymbol): string {
        return `${element.name}_${element.range.start.line}_${element.range.start.character}_${element.kind}`;
    }

    /**
     * Track a single symbol and optionally its parent relationship
     * @param symbol The symbol to track
     * @param parent The parent symbol, or null if root, undefined if not tracking parent
     */
    trackSymbol(symbol: DocumentSymbol, parent?: DocumentSymbol | null): void {
        const key = this.getElementKey(symbol);
        this.elementMap.set(key, symbol);
        
        if (parent !== undefined) {
            this.parentMap.set(key, parent);
        }
    }

    /**
     * Recursively track a hierarchy of symbols
     * @param symbols Array of symbols to track
     * @param parent Parent symbol for this level
     */
    trackHierarchy(symbols: DocumentSymbol[], parent: DocumentSymbol | null = null): void {
        for (const symbol of symbols) {
            this.trackSymbol(symbol, parent);
            
            if (symbol.children && symbol.children.length > 0) {
                this.trackHierarchy(symbol.children, symbol);
            }
        }
    }

    /**
     * Retrieve a tracked symbol by its key
     * @param key The symbol key
     * @returns The symbol or undefined if not found
     */
    getTrackedSymbol(key: string): DocumentSymbol | undefined {
        return this.elementMap.get(key);
    }

    /**
     * Get the parent of a symbol by its key
     * @param key The symbol key
     * @returns The parent symbol, or null if root, or undefined if not tracked
     */
    getParent(key: string): DocumentSymbol | null | undefined {
        return this.parentMap.get(key);
    }

    /**
     * Check if a symbol is visible (for filtering)
     * @param symbolKey The symbol key
     * @returns true if visible, false if hidden, undefined if not set
     */
    isVisible(symbolKey: string): boolean | undefined {
        return this.visibilityMap.get(symbolKey);
    }

    /**
     * Set visibility state for a symbol
     * @param symbolKey The symbol key
     * @param visible Whether the symbol should be visible
     */
    setVisible(symbolKey: string, visible: boolean): void {
        this.visibilityMap.set(symbolKey, visible);
    }

    /**
     * Clear all tracked data
     */
    clear(): void {
        this.elementMap.clear();
        this.visibilityMap.clear();
        this.parentMap.clear();
    }

    /**
     * Get all tracked element keys
     */
    getAllKeys(): string[] {
        return Array.from(this.elementMap.keys());
    }
}
