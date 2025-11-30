import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';

/**
 * Diagnostic Provider for Clarion Language
 * Validates syntax and detects errors in Clarion source code
 * 
 * Based on: docs/CLARION_LANGUAGE_REFERENCE.md
 */
export class DiagnosticProvider {
    
    /**
     * Validate a Clarion document and return diagnostics
     * @param document - TextDocument to validate
     * @returns Array of Diagnostic objects
     */
    public static validateDocument(document: TextDocument): Diagnostic[] {
        const code = document.getText();
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        const diagnostics: Diagnostic[] = [];
        
        // Validate structure terminators
        const structureDiagnostics = this.validateStructureTerminators(tokens, document);
        diagnostics.push(...structureDiagnostics);
        
        return diagnostics;
    }
    
    /**
     * Validate that all structures are properly terminated
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for unterminated structures
     */
    public static validateStructureTerminators(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const structureStack: StructureStackItem[] = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const prevToken = i > 0 ? tokens[i - 1] : null;
            const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;
            
            // Check if this token opens a structure that needs termination
            if (this.isStructureOpen(token)) {
                const structureType = this.getStructureType(token);
                if (this.requiresTerminator(structureType)) {
                    structureStack.push({
                        token,
                        structureType,
                        line: token.line,
                        column: token.start
                    });
                }
            }
            
            // Check if this token closes a structure
            else if (this.isStructureClose(token, prevToken, nextToken)) {
                if (structureStack.length > 0) {
                    // Pop the most recent structure
                    structureStack.pop();
                }
            }
            
            // Check if we hit a scope boundary that should close structures
            else if (this.isScopeBoundary(token)) {
                // Check if there are unclosed structures
                while (structureStack.length > 0) {
                    const unclosed = structureStack.pop()!;
                    const diagnostic = this.createUnterminatedStructureDiagnostic(unclosed, document);
                    diagnostics.push(diagnostic);
                }
            }
        }
        
        // Any remaining structures on stack are unterminated
        while (structureStack.length > 0) {
            const unclosed = structureStack.pop()!;
            const diagnostic = this.createUnterminatedStructureDiagnostic(unclosed, document);
            diagnostics.push(diagnostic);
        }
        
        return diagnostics;
    }
    
    /**
     * Check if token opens a structure
     */
    private static isStructureOpen(token: Token): boolean {
        if (token.type === TokenType.Structure) {
            const structType = token.value.toUpperCase();
            return ['IF', 'LOOP', 'CASE', 'GROUP', 'QUEUE', 'RECORD', 'FILE', 
                    'CLASS', 'INTERFACE', 'MAP', 'MODULE', 'BEGIN', 'EXECUTE'].includes(structType);
        }
        return false;
    }
    
    /**
     * Check if token closes a structure (END or dot terminator)
     */
    private static isStructureClose(token: Token, prevToken: Token | null, nextToken: Token | null): boolean {
        // END keyword
        if (token.type === TokenType.EndStatement) {
            return true;
        }
        
        // Dot terminator - check if it's a structure terminator
        // (not a decimal point or member access)
        if (token.type === TokenType.Delimiter && token.value === '.') {
            // If there's a previous token and it's a number, this is likely a decimal point
            if (prevToken && prevToken.type === TokenType.Number) {
                return false;
            }
            
            // If next token exists and is on same line, probably not a terminator
            // (member access or other use)
            if (nextToken && nextToken.line === token.line && 
                (nextToken.type === TokenType.Variable || nextToken.type === TokenType.Label)) {
                return false;
            }
            
            // Otherwise, treat as structure terminator
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if token is a scope boundary (RETURN, PROCEDURE, ROUTINE, CODE, etc.)
     */
    private static isScopeBoundary(token: Token): boolean {
        if (token.type === TokenType.Keyword) {
            const keyword = token.value.toUpperCase();
            return keyword === 'RETURN' || keyword === 'CODE';
        }
        
        if (token.type === TokenType.Procedure || token.type === TokenType.Routine) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get the structure type from a token
     */
    private static getStructureType(token: Token): string {
        if (token.type === TokenType.Structure) {
            return token.value.toUpperCase();
        }
        return '';
    }
    
    /**
     * Check if structure type requires a terminator
     */
    private static requiresTerminator(structureType: string): boolean {
        // Structures that require END or dot terminator
        const requiresTermination = [
            'IF', 'LOOP', 'CASE', 'EXECUTE', 'BEGIN',
            'GROUP', 'QUEUE', 'RECORD', 'FILE',
            'CLASS', 'INTERFACE', 'MAP', 'MODULE'
        ];
        
        return requiresTermination.includes(structureType);
    }
    
    /**
     * Create diagnostic for unterminated structure
     */
    private static createUnterminatedStructureDiagnostic(
        structure: StructureStackItem,
        document: TextDocument
    ): Diagnostic {
        const line = structure.line;
        const startPos = { line, character: structure.token.start };
        const endPos = { line, character: structure.token.start + structure.token.value.length };
        
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: startPos,
                end: endPos
            },
            message: `${structure.structureType} statement is not terminated with END or .`,
            source: 'clarion'
        };
        
        return diagnostic;
    }
}

/**
 * Structure stack item for tracking open structures
 */
interface StructureStackItem {
    token: Token;
    structureType: string;
    line: number;
    column: number;
}
