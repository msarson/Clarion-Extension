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
                
                // Special handling for MODULE - depends on parent context
                if (structureType === 'MODULE') {
                    const parentContext = this.getParentContext(structureStack);
                    const needsTerminator = this.moduleNeedsTerminator(parentContext);
                    
                    if (needsTerminator) {
                        structureStack.push({
                            token,
                            structureType,
                            line: token.line,
                            column: token.start
                        });
                    }
                } else if (this.requiresTerminator(structureType)) {
                    structureStack.push({
                        token,
                        structureType,
                        line: token.line,
                        column: token.start
                    });
                }
            }
            
            // Check if this token closes a structure
            else if (this.isStructureClose(token, prevToken, nextToken, structureStack)) {
                if (structureStack.length > 0) {
                    // Pop the most recent structure
                    structureStack.pop();
                }
            }
            
            // Check if we hit a scope boundary that should close structures
            else if (this.isScopeBoundary(token, prevToken, structureStack)) {
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
        
        // MODULE is sometimes tokenized as Label instead of Structure
        if (token.type === TokenType.Label && token.value.toUpperCase() === 'MODULE') {
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if token closes a structure (END, dot terminator, WHILE, or UNTIL)
     * @param structureStack - Current stack to check what we're closing
     */
    private static isStructureClose(token: Token, prevToken: Token | null, nextToken: Token | null, structureStack?: StructureStackItem[]): boolean {
        // END keyword
        if (token.type === TokenType.EndStatement) {
            return true;
        }
        
        // WHILE and UNTIL keywords - these terminate LOOP structures ONLY
        if (token.type === TokenType.Keyword) {
            const keyword = token.value.toUpperCase();
            if (keyword === 'WHILE' || keyword === 'UNTIL') {
                // Only closes LOOP if we have a LOOP on the stack
                if (structureStack && structureStack.length > 0) {
                    const topStructure = structureStack[structureStack.length - 1];
                    return topStructure.structureType === 'LOOP';
                }
                return false;
            }
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
     * Check if token is a scope boundary (PROCEDURE, ROUTINE, CODE, etc.)
     * RETURN is NOT a scope boundary - it can appear inside structures
     */
    private static isScopeBoundary(token: Token, prevToken: Token | null, structureStack: StructureStackItem[]): boolean {
        if (token.type === TokenType.Keyword) {
            const keyword = token.value.toUpperCase();
            // Only CODE is a scope boundary, not RETURN
            return keyword === 'CODE';
        }
        
        // PROCEDURE and ROUTINE are scope boundaries when they follow a label at column 0
        // UNLESS we're currently inside a MAP or CLASS (where they're declarations, not implementations)
        if (token.type === TokenType.Procedure || token.type === TokenType.Routine) {
            // Check if previous token was a label at column 0
            if (prevToken && prevToken.type === TokenType.Label && prevToken.start === 0) {
                // Check if we're inside a MAP or CLASS - if so, this is a declaration, not implementation
                const insideMapOrClass = structureStack.some(item => 
                    item.structureType === 'MAP' || 
                    item.structureType === 'CLASS' || 
                    item.structureType === 'INTERFACE'
                );
                return !insideMapOrClass; // Only a scope boundary if NOT inside MAP/CLASS/INTERFACE
            }
            // Fallback: check if PROCEDURE itself is at column 0 (shouldn't happen but be safe)
            return token.start === 0;
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
        
        // MODULE is sometimes tokenized as Label
        if (token.type === TokenType.Label && token.value.toUpperCase() === 'MODULE') {
            return 'MODULE';
        }
        
        return '';
    }
    
    /**
     * Check if structure type requires a terminator
     */
    private static requiresTerminator(structureType: string): boolean {
        // Structures that require END or dot terminator
        // Note: MODULE is handled separately based on context
        const requiresTermination = [
            'IF', 'LOOP', 'CASE', 'EXECUTE', 'BEGIN',
            'GROUP', 'QUEUE', 'RECORD', 'FILE',
            'CLASS', 'INTERFACE', 'MAP'
        ];
        
        return requiresTermination.includes(structureType);
    }
    
    /**
     * Get the parent structure context from the stack
     */
    private static getParentContext(stack: StructureStackItem[]): string | null {
        if (stack.length === 0) {
            return null;
        }
        // Return the most recent structure type on the stack
        return stack[stack.length - 1].structureType;
    }
    
    /**
     * Check if MODULE needs a terminator based on parent context
     * MODULE requires END inside MAP, but NOT inside CLASS
     */
    private static moduleNeedsTerminator(parentContext: string | null): boolean {
        if (parentContext === null) {
            return false; // MODULE at top level doesn't need terminator
        }
        
        // MODULE inside MAP requires END
        if (parentContext === 'MAP') {
            return true;
        }
        
        // MODULE inside CLASS does NOT require END
        if (parentContext === 'CLASS' || parentContext === 'INTERFACE') {
            return false;
        }
        
        // Default: no terminator needed
        return false;
    }
    
    /**
     * Create diagnostic for unterminated structure
     */
    private static createUnterminatedStructureDiagnostic(
        structure: StructureStackItem,
        document: TextDocument
    ): Diagnostic {
        const line = structure.line;
        const lineText = document.getText({ start: { line, character: 0 }, end: { line, character: 1000 } });
        
        // Find the actual keyword position in the line (first non-whitespace occurrence)
        const keywordIndex = lineText.search(/\S/);
        const startPos = { line, character: keywordIndex >= 0 ? keywordIndex : 0 };
        const endPos = { line, character: startPos.character + structure.token.value.length };
        
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
