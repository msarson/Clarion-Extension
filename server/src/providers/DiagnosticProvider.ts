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
     * @param tokens - Pre-tokenized tokens (optional, will tokenize if not provided)
     * @returns Array of Diagnostic objects
     */
    public static validateDocument(document: TextDocument, tokens?: Token[]): Diagnostic[] {
        const perfStart = performance.now();
        
        // Use provided tokens or tokenize if not provided
        if (!tokens) {
            const code = document.getText();
            const tokenizer = new ClarionTokenizer(code);
            tokens = tokenizer.tokenize();
        }
        
        const diagnostics: Diagnostic[] = [];
        
        // Validate structure terminators
        const structureDiagnostics = this.validateStructureTerminators(tokens, document);
        diagnostics.push(...structureDiagnostics);
        
        // Validate OMIT/COMPILE blocks
        const conditionalDiagnostics = this.validateConditionalBlocks(tokens, document);
        diagnostics.push(...conditionalDiagnostics);
        
        const perfTime = performance.now() - perfStart;
        console.log(`[DiagnosticProvider] 📊 PERF: Validation complete | time_ms=${perfTime.toFixed(2)}, tokens=${tokens.length}, diagnostics=${diagnostics.length}`);
        
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
                // Report them but DON'T stop checking the rest of the file
                while (structureStack.length > 0) {
                    const unclosed = structureStack.pop()!;
                    const diagnostic = this.createUnterminatedStructureDiagnostic(unclosed, document);
                    diagnostics.push(diagnostic);
                }
                // Stack is now empty, continue processing rest of file normally
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
        
        // PROCEDURE and ROUTINE are scope boundaries when they follow a label
        // UNLESS we're currently inside a MAP or CLASS (where they're declarations, not implementations)
        if (token.type === TokenType.Procedure || token.type === TokenType.Routine) {
            // Check if previous token was a label (column position doesn't matter for class methods)
            if (prevToken && prevToken.type === TokenType.Label) {
                // Check if we're inside a MAP or CLASS - if so, this is a declaration, not implementation
                const insideMapOrClass = structureStack.some(item => 
                    item.structureType === 'MAP' || 
                    item.structureType === 'CLASS' || 
                    item.structureType === 'INTERFACE'
                );
                return !insideMapOrClass; // Only a scope boundary if NOT inside MAP/CLASS/INTERFACE
            }
            // Fallback: PROCEDURE itself at any position can be a scope boundary
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
    
    /**
     * Validate OMIT/COMPILE blocks are properly terminated with matching terminator string
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for unterminated OMIT/COMPILE blocks
     */
    public static validateConditionalBlocks(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const blockStack: ConditionalBlockStackItem[] = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check if this is an OMIT or COMPILE directive
            if (token.type === TokenType.Directive) {
                const directiveType = token.value.toUpperCase();
                
                if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                    // Look for the terminator string in the following tokens
                    // Format: OMIT('terminator') or COMPILE('terminator',expression)
                    let terminatorString: string | null = null;
                    
                    // Find the string token that follows (should be in parentheses)
                    for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                        if (tokens[j].type === TokenType.String) {
                            // Extract the string value (remove quotes)
                            terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                            break;
                        }
                    }
                    
                    if (terminatorString) {
                        blockStack.push({
                            token,
                            blockType: directiveType,
                            terminator: terminatorString,
                            line: token.line,
                            column: token.start
                        });
                    }
                }
            }
            
            // Check if this line contains a terminator for any open block
            if (blockStack.length > 0 && token.type === TokenType.Comment) {
                const lineText = document.getText({ 
                    start: { line: token.line, character: 0 }, 
                    end: { line: token.line, character: 1000 }
                });
                
                // Check each open block to see if this line contains its terminator
                for (let b = blockStack.length - 1; b >= 0; b--) {
                    const block = blockStack[b];
                    
                    // Check if the line contains the terminator string
                    // (case-sensitive check as per Clarion spec)
                    if (lineText.includes(block.terminator)) {
                        // Found matching terminator - remove from stack
                        blockStack.splice(b, 1);
                        break;  // Only match one block per line
                    }
                }
            }
        }
        
        // Any remaining blocks in the stack are unterminated
        for (const block of blockStack) {
            diagnostics.push(this.createUnterminatedConditionalBlockDiagnostic(block, document));
        }
        
        return diagnostics;
    }
    
    /**
     * Create diagnostic for unterminated OMIT/COMPILE block
     */
    private static createUnterminatedConditionalBlockDiagnostic(
        block: ConditionalBlockStackItem,
        document: TextDocument
    ): Diagnostic {
        const line = block.line;
        const lineText = document.getText({ start: { line, character: 0 }, end: { line, character: 1000 } });
        
        // Find the actual keyword position
        const keywordIndex = lineText.search(/\S/);
        const startPos = { line, character: keywordIndex >= 0 ? keywordIndex : 0 };
        const endPos = { line, character: startPos.character + block.token.value.length };
        
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: startPos,
                end: endPos
            },
            message: `${block.blockType} block is not terminated with terminator string '${block.terminator}'`,
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

/**
 * Conditional block stack item for tracking OMIT/COMPILE blocks
 */
interface ConditionalBlockStackItem {
    token: Token;
    blockType: string;  // 'OMIT' or 'COMPILE'
    terminator: string;  // The terminator string to look for
    line: number;
    column: number;
}
