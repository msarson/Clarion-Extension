import { DocumentSymbol, SymbolKind, Range, Position } from 'vscode-languageserver';
import { ClarionSymbol } from './ClarionDocumentSymbolProvider';

/**
 * Helper class for building DocumentSymbol instances with consistent patterns
 */
export class SymbolBuilder {
    /**
     * Creates a DocumentSymbol with common defaults
     */
    static createSymbol(
        name: string,
        detail: string,
        kind: SymbolKind,
        range: Range,
        selectionRange: Range,
        children: DocumentSymbol[] = []
    ): ClarionSymbol {
        const symbol = DocumentSymbol.create(
            name,
            detail,
            kind,
            range,
            selectionRange,
            children
        ) as ClarionSymbol;

        return symbol;
    }

    /**
     * Creates a Range from line and character positions
     */
    static createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
        return Range.create(
            Position.create(startLine, startChar),
            Position.create(endLine, endChar)
        );
    }

    /**
     * Creates a single-line Range
     */
    static createLineRange(line: number, startChar: number = 0, endChar: number = 999): Range {
        return this.createRange(line, startChar, line, endChar);
    }

    /**
     * Extracts the label/name from a token line
     * Example: "MyProcedure    PROCEDURE" -> "MyProcedure"
     */
    static extractLabel(line: string): string {
        const match = line.match(/^(\w+)/);
        return match ? match[1] : '';
    }

    /**
     * Formats a procedure signature for display
     * Example: "PROCEDURE(string name)" -> "Procedure ( string name )"
     */
    static formatProcedureDetail(signature: string): string {
        return signature
            .replace(/\s+/g, ' ')
            .replace(/\(/g, ' ( ')
            .replace(/\)/g, ' ) ')
            .replace(/,/g, ' , ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Creates a container symbol (Methods, Properties, etc.)
     */
    static createContainer(
        name: string,
        kind: SymbolKind,
        startLine: number,
        endLine: number,
        children: DocumentSymbol[] = []
    ): ClarionSymbol {
        const range = this.createRange(startLine, 0, endLine, 999);
        return this.createSymbol(name, '', kind, range, range, children);
    }

    /**
     * Determines if a token represents a class method implementation
     * Example: "StringTheory.Append" -> true
     */
    static isClassMethod(label: string): boolean {
        return label.includes('.');
    }

    /**
     * Extracts class name and method name from a class method label
     * Example: "StringTheory.Append" -> { className: "STRINGTHEORY", methodName: "Append" }
     */
    static parseClassMethod(label: string): { className: string; methodName: string } | null {
        const dotIndex = label.indexOf('.');
        if (dotIndex === -1) return null;

        return {
            className: label.substring(0, dotIndex).toUpperCase(),
            methodName: label.substring(dotIndex + 1)
        };
    }

    /**
     * Extracts attributes from a structure declaration line
     * Example: "MyGroup                GROUP,PRE(LOC),OVER(Other)" -> "PRE(LOC),OVER(Other)"
     */
    static extractAttributes(line: string, structureType: string): string {
        // Find the structure type keyword
        const typeIndex = line.toUpperCase().indexOf(structureType.toUpperCase());
        if (typeIndex === -1) return '';

        // Get everything after the type keyword
        const afterType = line.substring(typeIndex + structureType.length).trim();
        
        // If starts with comma, that's the attributes
        if (afterType.startsWith(',')) {
            return afterType.substring(1).trim();
        }

        return '';
    }

    /**
     * Creates a class implementation container symbol
     */
    static createClassImplementationContainer(
        className: string,
        firstMethodLine: number,
        lastMethodLine: number
    ): ClarionSymbol {
        const range = this.createRange(firstMethodLine, 0, lastMethodLine, 999);
        const symbol = this.createSymbol(
            `${className} (implementation)`,
            '',
            SymbolKind.Class,
            range,
            range,
            []
        );
        return symbol;
    }

    /**
     * Creates a Methods container symbol
     */
    static createMethodsContainer(
        startLine: number,
        endLine: number,
        children: DocumentSymbol[] = []
    ): ClarionSymbol {
        return this.createContainer('Methods', SymbolKind.Method, startLine, endLine, children);
    }
}
