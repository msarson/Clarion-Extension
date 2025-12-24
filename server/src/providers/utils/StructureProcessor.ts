import { DocumentSymbol, SymbolKind } from 'vscode-languageserver-types';
import { Token, TokenType } from '../../ClarionTokenizer.js';
import { SymbolBuilder } from './SymbolBuilder';
import { ClarionDocumentSymbol } from '../ClarionDocumentSymbolProvider';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("StructureProcessor");
logger.setLevel("error"); // Production: Only log errors

export class StructureProcessor {
    /**
     * Process a structure token (GROUP, QUEUE, FILE, etc.) and create a symbol
     */
    static processStructure(
        token: Token,
        tokens: Token[],
        allText: string
    ): ClarionDocumentSymbol | null {
        const structureName = token.label || token.value.trim();
        if (!structureName) return null;

        const symbolKind = this.getStructureSymbolKind(token.subType);
        const structureType = this.getStructureTypeName(token.subType);
        
        // Use SymbolBuilder to create the symbol with proper Range objects
        const range = SymbolBuilder.createRange(token.line, 0, token.finishesAt || token.line, 0);
        const selectionRange = SymbolBuilder.createCollapsedRange(token.line, 0);
        
        const detail = SymbolBuilder.formatStructureDetail(structureType, structureName);
        
        return SymbolBuilder.createSymbol(
            structureName,
            detail,
            symbolKind,
            range,
            selectionRange
        );
    }

    /**
     * Get the appropriate SymbolKind for a structure type
     */
    private static getStructureSymbolKind(subType: number | undefined): SymbolKind {
        switch (subType) {
            case TokenType.Structure:
                return SymbolKind.Struct;
            default:
                return SymbolKind.Struct;
        }
    }

    /**
     * Get human-readable structure type name
     */
    private static getStructureTypeName(subType: number | undefined): string {
        // For now, just return 'STRUCTURE' - can be enhanced later
        return 'STRUCTURE';
    }

    /**
     * Check if a structure should have child fields
     */
    static shouldHaveChildren(subType: number | undefined): boolean {
        return subType === TokenType.Structure;
    }
}
