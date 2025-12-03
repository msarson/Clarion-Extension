import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ClarionDocumentSymbol } from '../ClarionDocumentSymbolProvider';

/**
 * Utility class for finding symbols within a document symbol tree
 */
export class SymbolFinder {
    /**
     * Find a class definition symbol by name (case-insensitive)
     */
    static findClassDefinition(
        symbols: ClarionDocumentSymbol[],
        className: string,
        classSymbolMap?: Map<string, ClarionDocumentSymbol>
    ): ClarionDocumentSymbol | null {
        // First check the class symbol map if provided
        if (classSymbolMap) {
            const classSymbol = classSymbolMap.get(className.toUpperCase());
            if (classSymbol) {
                return classSymbol;
            }
        }
        
        // If not found in the map, search through all symbols recursively
        const findInSymbols = (symbolList: DocumentSymbol[]): DocumentSymbol | null => {
            for (const symbol of symbolList) {
                // Check if this is a class with the matching name
                if (symbol.kind === SymbolKind.Class) {
                    const symbolName = symbol.name.split(' ')[0]; // Get name without any suffix
                    if (symbolName.toUpperCase() === className.toUpperCase()) {
                        return symbol;
                    }
                }
                
                // Check children recursively
                if (symbol.children && symbol.children.length > 0) {
                    const found = findInSymbols(symbol.children);
                    if (found) return found;
                }
            }
            return null;
        };
        
        return findInSymbols(symbols);
    }

    /**
     * Find a class implementation container (case-insensitive)
     */
    static findClassImplementation(
        symbols: ClarionDocumentSymbol[],
        className: string
    ): ClarionDocumentSymbol | null {
        const fullName = `${className.toUpperCase()} (implementation)`;
        
        const findInSymbols = (symbolList: DocumentSymbol[]): DocumentSymbol | null => {
            for (const symbol of symbolList) {
                if (symbol.name.toUpperCase() === fullName) {
                    return symbol;
                }
                if (symbol.children && symbol.children.length > 0) {
                    const found = findInSymbols(symbol.children);
                    if (found) return found;
                }
            }
            return null;
        };
        
        return findInSymbols(symbols);
    }

    /**
     * Find the most recent global procedure in the symbols array
     */
    static findMostRecentGlobalProcedure(symbols: DocumentSymbol[]): DocumentSymbol | null {
        let mostRecentGlobalProcedure: DocumentSymbol | null = null;

        for (const symbol of symbols) {
            if (symbol.kind === SymbolKind.Function &&
                (symbol as ClarionDocumentSymbol)._isGlobalProcedure === true) {
                mostRecentGlobalProcedure = symbol;
            }
        }

        return mostRecentGlobalProcedure;
    }
}
