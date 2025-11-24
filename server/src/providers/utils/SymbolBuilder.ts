import { SymbolKind, Range, Position } from 'vscode-languageserver';
import { ClarionDocumentSymbol } from '../ClarionDocumentSymbolProvider';

/**
 * Utility class for building DocumentSymbol objects with consistent formatting
 */
export class SymbolBuilder {
    /**
     * Creates a ClarionDocumentSymbol with standardized properties
     */
    static createSymbol(
        name: string,
        detail: string,
        kind: SymbolKind,
        range: Range,
        selectionRange: Range,
        children?: ClarionDocumentSymbol[]
    ): ClarionDocumentSymbol {
        const symbol: ClarionDocumentSymbol = {
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
    ): ClarionDocumentSymbol {
        const range = this.createRange(startLine, 0, endLine, 0);
        return this.createSymbol(name, '', kind, range, range, []);
    }

    /**
     * Creates a procedure symbol with Clarion-specific properties
     */
    static createProcedure(
        name: string,
        params: string,
        returnType: string | undefined,
        startLine: number,
        endLine: number,
        className?: string
    ): ClarionDocumentSymbol {
        const detail = this.formatProcedureDetail(params, returnType);
        const range = this.createRange(startLine, 0, endLine, 0);
        const selectionRange = this.createCollapsedRange(startLine, 0);
        
        const symbol = this.createSymbol(name, detail, SymbolKind.Method, range, selectionRange, []);
        
        // Add Clarion-specific properties
        symbol._finishesAt = endLine;
        
        return symbol;
    }

    /**
     * Creates a variable symbol
     */
    static createVariable(
        name: string,
        dataType: string,
        line: number,
        prefix?: string
    ): ClarionDocumentSymbol {
        let detail = dataType;
        if (prefix) {
            detail += `, PREFIX(${prefix})`;
        }
        
        const range = this.createCollapsedRange(line, 0);
        return this.createSymbol(name, detail, SymbolKind.Variable, range, range, []);
    }

    /**
     * Creates a structure symbol (GROUP, QUEUE, etc.)
     */
    static createStructure(
        name: string,
        structureType: string,
        line: number,
        endLine: number,
        prefix?: string
    ): ClarionDocumentSymbol {
        let detail = this.formatStructureDetail(structureType, name);
        if (prefix) {
            detail += `, PREFIX(${prefix})`;
        }
        
        const range = this.createRange(line, 0, endLine, 0);
        const selectionRange = this.createCollapsedRange(line, 0);
        
        return this.createSymbol(name, detail, SymbolKind.Struct, range, selectionRange, []);
    }
}
