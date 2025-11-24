import { DocumentSymbol, SymbolKind, Range, Position } from 'vscode-languageserver';
import { ClarionSymbol } from '../ClarionDocumentSymbolProvider';

/**
 * Utility class for building DocumentSymbol objects with consistent formatting
 */
export class SymbolBuilder {
    /**
     * Creates a DocumentSymbol with standardized properties
     */
    static createSymbol(
        name: string,
        detail: string,
        kind: SymbolKind,
        range: Range,
        selectionRange: Range,
        children?: DocumentSymbol[]
    ): ClarionSymbol {
        const symbol: ClarionSymbol = {
            name,
            detail,
            kind,
            range,
            selectionRange,
            children: children || []
        };
        return symbol;
    }

    /**
     * Creates a range from line and character positions
     */
    static createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
        return Range.create(
            Position.create(startLine, startChar),
            Position.create(endLine, endChar)
        );
    }

    /**
     * Creates a collapsed range (start and end are the same)
     */
    static createCollapsedRange(line: number, char: number): Range {
        const pos = Position.create(line, char);
        return Range.create(pos, pos);
    }

    /**
     * Formats a procedure signature for display
     */
    static formatProcedureDetail(params: string, returnType?: string): string {
        let detail = `Procedure ${params}`;
        if (returnType) {
            detail += `, ${returnType}`;
        }
        return detail;
    }

    /**
     * Formats a structure detail (GROUP, QUEUE, etc.)
     */
    static formatStructureDetail(structureType: string, name: string): string {
        return `${structureType} (${name})`;
    }

    /**
     * Creates a container symbol (for grouping like "Methods", "Properties")
     */
    static createContainer(
        name: string,
        kind: SymbolKind,
        startLine: number,
        endLine: number
    ): ClarionSymbol {
        const range = this.createRange(startLine, 0, endLine, 0);
        return this.createSymbol(name, '', kind, range, range, []);
    }
}
