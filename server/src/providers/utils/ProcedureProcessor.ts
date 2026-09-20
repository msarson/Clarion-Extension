import { DocumentSymbol, SymbolKind } from 'vscode-languageserver-types';
import { classNameFromMethodLabel, isMethodImplementationLabel } from '../../utils/EnclosingClassResolver';
import { Token, TokenType } from '../../ClarionTokenizer.js';
import { SymbolBuilder } from './SymbolBuilder';
import { ClarionDocumentSymbol } from '../ClarionDocumentSymbolProvider';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("ProcedureProcessor");
logger.setLevel("error"); // Production: Only log errors

export class ProcedureProcessor {
    /**
     * Process a procedure token and create a symbol
     */
    static processProcedure(
        token: Token,
        tokens: Token[],
        allText: string
    ): ClarionDocumentSymbol | null {
        const procedureName = token.value.trim();
        if (!procedureName) return null;

        const signature = this.extractProcedureSignature(token, tokens, allText);
        const isMethod = procedureName.includes('.');
        
        // Use SymbolBuilder to create the symbol
        const range = SymbolBuilder.createRange(token.line, 0, token.finishesAt || token.line, 0);
        const selectionRange = SymbolBuilder.createCollapsedRange(token.line, 0);
        
        return SymbolBuilder.createSymbol(
            procedureName,
            signature,
            isMethod ? SymbolKind.Method : SymbolKind.Function,
            range,
            selectionRange
        );
    }

    /**
     * Extract the full procedure signature with parameters
     */
    private static extractProcedureSignature(
        token: Token,
        tokens: Token[],
        allText: string
    ): string {
        const lines = allText.split(/\r?\n/);
        if (token.line >= lines.length) return token.value;

        let signature = lines[token.line].trim();
        
        // Handle line continuation
        let currentLine = token.line;
        while (currentLine < lines.length - 1 && signature.endsWith('|')) {
            currentLine++;
            signature = signature.slice(0, -1).trim() + ' ' + lines[currentLine].trim();
        }

        return signature;
    }

    /**
     * Check if a procedure is a class method implementation
     */
    static isClassMethodImplementation(procedureName: string): boolean {
        return isMethodImplementationLabel(procedureName);   // #622
    }

    /**
     * Extract class name from a method implementation name (upper-cased — callers compare
     * case-insensitively against upper-cased keys).
     */
    static extractClassName(methodName: string): string | null {
        // #622: one of three copies of this split. The shared helper requires the dot PAST
        // position 0, so a pathological ".Foo" now yields null rather than an empty string.
        return classNameFromMethodLabel(methodName)?.toUpperCase() ?? null;
    }

    /**
     * Extract method name from full qualified name
     */
    static extractMethodName(methodName: string): string {
        const dotIndex = methodName.indexOf('.');
        if (dotIndex === -1) return methodName;
        return methodName.substring(dotIndex + 1);
    }
}
