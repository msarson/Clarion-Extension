import { SymbolKind } from 'vscode-languageserver';
import { Token, TokenType } from '../../ClarionTokenizer';
import { ClarionDocumentSymbol } from '../ClarionDocumentSymbolProvider';

// Re-export ClarionSymbolKind locally since it's not exported from the main file
const ClarionSymbolKind = {
    Root: SymbolKind.Module,
    Procedure: SymbolKind.Function,
    Routine: SymbolKind.Method,
    Variable: SymbolKind.Variable,
    Structure: SymbolKind.Struct,
    Field: SymbolKind.Field,
    Property: SymbolKind.Property,
    Directive: SymbolKind.Constant,
};

interface ParentStackEntry {
    symbol: ClarionDocumentSymbol;
    finishesAt: number | undefined;
}

/**
 * Manages symbol hierarchy and parent stack operations
 */
export class HierarchyManager {
    /**
     * Finds the appropriate parent symbol for a new symbol based on the parent stack
     */
    static findParent(
        parentStack: ParentStackEntry[],
        currentLine: number
    ): ClarionDocumentSymbol | null {
        if (parentStack.length === 0) {
            return null;
        }

        // Find the last parent that hasn't finished yet
        for (let i = parentStack.length - 1; i >= 0; i--) {
            const entry = parentStack[i];
            if (!entry.finishesAt || entry.finishesAt >= currentLine) {
                return entry.symbol;
            }
        }

        return null;
    }

    /**
     * Pops completed structures from the parent stack based on their finishesAt line
     */
    static checkAndPopCompletedStructures(
        parentStack: ParentStackEntry[],
        currentLine: number,
        tokens: Token[],
        tokensByLine: Map<number, Token[]>,
        hasMethodImplementations: boolean
    ): { shouldResetLastMethodImplementation: boolean } {
        let shouldResetLastMethodImplementation = false;

        if (parentStack.length === 0) {
            return { shouldResetLastMethodImplementation };
        }

        // Find all global procedures, special routines, and method implementations in the stack
        let globalProcedureIndices: number[] = [];
        let currentGlobalProcedureIndex = -1;

        // First, identify all special types in the stack
        for (let i = 0; i < parentStack.length; i++) {
            const entry = parentStack[i];

            // Check if this is a global procedure
            const isGlobalProcedure = entry.symbol.kind === SymbolKind.Function &&
                (entry.symbol._isGlobalProcedure === true ||
                    (entry.symbol.kind === SymbolKind.Function &&
                        !entry.symbol._isMethodImplementation &&
                        !entry.symbol.name.includes('.')));

            if (isGlobalProcedure) {
                globalProcedureIndices.push(i);
                currentGlobalProcedureIndex = i;
            }
        }

        // Check if we're at a new global procedure
        let isAtNewGlobalProcedure = false;
        const lineTokens = tokensByLine.get(currentLine) || [];
        for (const token of lineTokens) {
            if (token.subType === TokenType.GlobalProcedure ||
                (token as any)._isGlobalProcedure === true) {
                isAtNewGlobalProcedure = true;
                break;
            }
        }

        // If we're at a new global procedure, pop the current global procedure
        if (isAtNewGlobalProcedure && currentGlobalProcedureIndex !== -1) {
            parentStack.splice(currentGlobalProcedureIndex);
            shouldResetLastMethodImplementation = true;
            return { shouldResetLastMethodImplementation };
        }

        // Process the stack from bottom to top
        if (hasMethodImplementations && globalProcedureIndices.length > 0) {
            let i = parentStack.length - 1;
            while (i >= 0) {
                const entry = parentStack[i];
                const isGlobalProcedure = globalProcedureIndices.includes(i);

                if (!isGlobalProcedure && entry.finishesAt && currentLine > entry.finishesAt) {
                    parentStack.splice(i, 1);
                }
                i--;
            }
        } else {
            // Standard popping for non-method-implementation scenarios
            let i = parentStack.length - 1;
            while (i >= 0) {
                const entry = parentStack[i];
                if (entry.finishesAt && currentLine > entry.finishesAt) {
                    parentStack.splice(i, 1);
                }
                i--;
            }
        }

        return { shouldResetLastMethodImplementation };
    }

    /**
     * Pushes a symbol onto the parent stack
     */
    static pushToStack(
        parentStack: ParentStackEntry[],
        symbol: ClarionDocumentSymbol,
        finishesAt: number | undefined
    ): void {
        parentStack.push({ symbol, finishesAt });
    }

    /**
     * Get the current parent symbol (top of stack)
     */
    static getCurrentParent(parentStack: ParentStackEntry[]): ClarionDocumentSymbol | null {
        return parentStack.length > 0 ? parentStack[parentStack.length - 1].symbol : null;
    }

    /**
     * Get the current procedure from stack (searches backwards for first procedure)
     */
    static getCurrentProcedure(parentStack: ParentStackEntry[]): ClarionDocumentSymbol | null {
        for (let i = parentStack.length - 1; i >= 0; i--) {
            const symbol = parentStack[i].symbol;
            if (symbol.kind === ClarionSymbolKind.Procedure) {
                return symbol;
            }
        }
        return null;
    }

    /**
     * Check if stack is empty
     */
    static isStackEmpty(parentStack: ParentStackEntry[]): boolean {
        return parentStack.length === 0;
    }

    /**
     * Checks if a symbol has method implementations in its tree
     */
    static hasMethodImplementationsInTree(symbol: ClarionDocumentSymbol): boolean {
        if (symbol._isMethodImplementation) {
            return true;
        }

        if (symbol.children) {
            for (const child of symbol.children) {
                if (this.hasMethodImplementationsInTree(child)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Determines if any symbols in the list have method implementations
     */
    static hasMethodImplementations(symbols: ClarionDocumentSymbol[]): boolean {
        return symbols.some(s => this.hasMethodImplementationsInTree(s));
    }
}
