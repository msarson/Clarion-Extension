import { DocumentSymbol, SymbolKind, Range } from 'vscode-languageserver';
import { ClarionDocumentSymbol } from '../ClarionDocumentSymbolProvider';

/**
 * Manages symbol hierarchy, parent stacks, and container relationships
 */
export class SymbolHierarchyManager {
    private parentStack: ClarionDocumentSymbol[] = [];

    /**
     * Get the current parent from the stack
     */
    getCurrentParent(): ClarionDocumentSymbol | null {
        return this.parentStack.length > 0 ? this.parentStack[this.parentStack.length - 1] : null;
    }

    /**
     * Push a new parent onto the stack
     */
    pushParent(symbol: ClarionDocumentSymbol): void {
        this.parentStack.push(symbol);
    }

    /**
     * Pop parents from the stack based on the current line
     */
    popParentsUpToLine(currentLine: number): void {
        while (this.parentStack.length > 0) {
            const parent = this.parentStack[this.parentStack.length - 1];
            if (parent._finishesAt !== undefined && parent._finishesAt < currentLine) {
                this.parentStack.pop();
            } else {
                break;
            }
        }
    }

    /**
     * Clear the parent stack
     */
    clearStack(): void {
        this.parentStack = [];
    }

    /**
     * Add a symbol as a child to the current parent, or to root if no parent
     */
    addSymbol(symbol: ClarionDocumentSymbol, rootSymbols: ClarionDocumentSymbol[]): void {
        const parent = this.getCurrentParent();
        if (parent) {
            if (!parent.children) {
                parent.children = [];
            }
            parent.children.push(symbol);
        } else {
            rootSymbols.push(symbol);
        }
    }

    /**
     * Find or create a container symbol (e.g., "Methods", "Properties")
     */
    findOrCreateContainer(
        name: string,
        kind: SymbolKind,
        parent: ClarionDocumentSymbol | null,
        rootSymbols: ClarionDocumentSymbol[],
        line: number
    ): ClarionDocumentSymbol {
        const containerArray = parent ? parent.children : rootSymbols;
        
        if (!containerArray) {
            throw new Error('Container array is undefined');
        }

        let container = containerArray.find((s: ClarionDocumentSymbol) => s.name === name && s.kind === kind);
        
        if (!container) {
            const range = Range.create(line, 0, line, 0);
            container = {
                name,
                kind,
                range,
                selectionRange: range,
                children: []
            } as ClarionDocumentSymbol;
            containerArray.push(container);
        }
        
        return container;
    }

    /**
     * Get the depth of the current hierarchy
     */
    getDepth(): number {
        return this.parentStack.length;
    }
}
