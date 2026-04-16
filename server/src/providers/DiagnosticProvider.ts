import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { extractReturnType } from '../utils/AttributeKeywords';
import { ProcedureSignatureUtils } from '../utils/ProcedureSignatureUtils';
import { MemberLocatorService } from '../services/MemberLocatorService';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("DiagnosticProvider");
logger.setLevel("error");

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
     * @param caller - Optional identifier for debugging who called this (for perf tracking)
     * @returns Array of Diagnostic objects
     */
    public static validateDocument(document: TextDocument, tokens?: Token[], caller?: string): Diagnostic[] {
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
        
        // Validate FILE structures
        const fileDiagnostics = this.validateFileStructures(tokens, document);
        diagnostics.push(...fileDiagnostics);
        
        // Validate CASE structures
        const caseDiagnostics = this.validateCaseStructures(tokens, document);
        diagnostics.push(...caseDiagnostics);
        
        // Validate EXECUTE structures
        const executeDiagnostics = this.validateExecuteStructures(tokens, document);
        diagnostics.push(...executeDiagnostics);
        
        // Validate CLASS/INTERFACE relationships
        const classInterfaceDiagnostics = this.validateClassInterfaceImplementation(tokens, document);
        diagnostics.push(...classInterfaceDiagnostics);
        
        // Validate procedures/methods with return types have RETURN statements
        const returnDiagnostics = this.validateReturnStatements(tokens, document);
        diagnostics.push(...returnDiagnostics);
        
        // Validate CLASS properties (QUEUE not allowed as direct property)
        const classPropertyDiagnostics = this.validateClassProperties(tokens, document);
        diagnostics.push(...classPropertyDiagnostics);
        
        const perfTime = performance.now() - perfStart;
        logger.perf(`🚀 Validation complete${caller ? ` (caller: ${caller})` : ''}`, {
            'time_ms': perfTime.toFixed(2),
            'tokens': tokens.length,
            'diagnostics': diagnostics.length
        });
        
        return diagnostics;
    }
    
    /**
     * Validate that all structures are properly terminated
     * REFACTORED: Uses token hierarchy (finishesAt, parent, children) instead of manual stack tracking
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for unterminated structures
     */
    public static validateStructureTerminators(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const conditionalRanges = this.getConditionalBlockRanges(tokens, document);
        
        // Iterate through all tokens and check structure tokens for proper termination
        for (const token of tokens) {
            // Skip structures within conditional compilation blocks (OMIT/COMPILE)
            if (this.isInConditionalBlock(token.line, conditionalRanges)) {
                continue;
            }
            
            // Only check Structure tokens
            if (token.type !== TokenType.Structure) {
                continue;
            }
            
            const structureType = token.value.toUpperCase();
            
            // Skip structures that don't require terminators
            if (!this.requiresTerminator(structureType)) {
                continue;
            }
            
            // Special handling for IF - check if it has inline termination (END or dot on same line)
            if (structureType === 'IF') {
                const tokenIndex = tokens.indexOf(token);
                const hasInlineTerminator = this.isSingleLineIfThen(tokens, tokenIndex);
                if (hasInlineTerminator) {
                    continue; // IF has inline END or dot terminator, no separate validation needed
                }
            }
            
            // Special handling for MODULE
            // MODULE can appear in 2 contexts:
            // 1. As CLASS attribute: CLASS,MODULE on same line - doesn't need terminator, skip all validation
            // 2. Inside MAP body: parent=MAP - NEEDS explicit terminator (END or dot)
            if (structureType === 'MODULE') {
                // Check if MODULE is part of CLASS attribute list (same line as CLASS)
                const classOnSameLine = tokens.find(t => 
                    t.line === token.line && 
                    t.value.toUpperCase() === 'CLASS' && 
                    t.type === TokenType.Structure
                );
                if (classOnSameLine) {
                    continue; // MODULE as CLASS attribute - skip entirely
                }
                
                // MODULE inside MAP needs explicit terminator - check finishesAt below
                // MODULE at column 0 outside MAP is likely invalid syntax - also check finishesAt
            }
            
            // Check if structure has a finishesAt value
            // If finishesAt is undefined or null, the structure is unterminated
            if (token.finishesAt === undefined || token.finishesAt === null) {
                const diagnostic = this.createUnterminatedStructureDiagnostic({
                    token,
                    structureType,
                    line: token.line,
                    column: token.start
                }, document);
                diagnostics.push(diagnostic);
            }
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
        // END keyword - always closes structures
        if (token.type === TokenType.EndStatement && token.value.toUpperCase() === 'END') {
            return true;
        }
        
        // Dot terminator - need to distinguish inline vs standalone
        if (token.type === TokenType.EndStatement && token.value === '.') {
            // If there's a previous token and it's a number ON THE SAME LINE, this is likely a decimal point
            if (prevToken && prevToken.type === TokenType.Number && prevToken.line === token.line) {
                return false;
            }
            
            // If next token exists and is on same line, probably not a terminator
            // (member access or other use)
            if (nextToken && nextToken.line === token.line && 
                (nextToken.type === TokenType.Variable || nextToken.type === TokenType.Label)) {
                return false;
            }
            
            // Check if this dot is on the SAME LINE as the structure keyword it would close
            // If yes AND there are other tokens between them, it's an inline terminator
            // If yes AND the structure is the only other token, it could be inline syntax like "LOOP WHILE condition."
            if (structureStack && structureStack.length > 0) {
                const topStructure = structureStack[structureStack.length - 1];
                if (topStructure.line === token.line) {
                    // Dot on same line as structure keyword - inline terminator
                    // Example: IF x > 5 THEN statement.  (dot is inline)
                    // Example: LOOP WHILE condition.  (dot is inline)
                    return false;
                }
                
                // Dot on different line - but is it standalone or part of inline statement?
                // Check if prevToken is on the same line as the dot
                // If yes, the dot is part of a statement on that line (inline)
                // If no, the dot is standalone (structure terminator)
                if (prevToken && prevToken.line === token.line) {
                    // There's a token before the dot on the same line
                    // This means: "something." on a line
                    // This is an inline dot (part of a statement), NOT a standalone structure terminator
                    return false;
                }
            }
            
            // Standalone dot (on its own line OR no structure on stack) - closes structures
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
        
        // PROCEDURE and ROUTINE are scope boundaries when they follow a label or variable
        // UNLESS we're currently inside a MAP or CLASS (where they're declarations, not implementations)
        if (token.type === TokenType.Procedure || token.type === TokenType.Routine) {
            // Check if previous token was a label or variable (MAP procedures can have indented identifiers)
            if (prevToken && (prevToken.type === TokenType.Label || prevToken.type === TokenType.Variable)) {
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
        // Note: MODULE requires terminator when inside MAP, but not inside CLASS (handled separately)
        const requiresTermination = [
            'IF', 'LOOP', 'CASE', 'EXECUTE', 'BEGIN',
            'GROUP', 'QUEUE', 'RECORD', 'FILE',
            'CLASS', 'INTERFACE', 'MAP', 'MODULE',
            'WINDOW', 'REPORT', 'APPLICATION',
            'SHEET', 'TAB', 'OLE', 'OPTION', 'MENU', 'MENUBAR', 'TOOLBAR'
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
        
        // MODULE inside MAP REQUIRES END - must be explicitly terminated
        if (parentContext === 'MAP') {
            return true;
        }
        
        // MODULE inside CLASS/INTERFACE is an attribute, not a structure - does NOT require END
        if (parentContext === 'CLASS' || parentContext === 'INTERFACE') {
            return false;
        }
        
        // Default: no terminator needed
        return false;
    }
    
    /**
     * Check if this is an inline IF...THEN with proper termination on same line
     * 
     * CLARION RULE: ALL IF structures require termination (END or dot)
     * Valid inline patterns:
     *   - IF x THEN y.         (dot terminator)
     *   - IF x THEN y END      (END terminator)
     *   - of ?field ; IF x THEN y END  (semicolon-separated)
     * 
     * Invalid pattern:
     *   - IF x THEN y          (no terminator - MUST be flagged!)
     * 
     * This function returns true ONLY if the IF has inline termination,
     * meaning it doesn't need separate validation (already terminated on same line).
     * 
     * @returns true if IF is properly terminated inline, false otherwise
     */
    private static isSingleLineIfThen(tokens: Token[], ifTokenIndex: number): boolean {
        const ifToken = tokens[ifTokenIndex];
        const ifLine = ifToken.line;
        
        // Look ahead for THEN keyword or semicolon on the same line
        for (let i = ifTokenIndex + 1; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Stop if we hit a different line
            if (token.line !== ifLine) {
                break;
            }
            
            // Check if this is a semicolon (statement separator) - check for inline termination after it
            if (token.type === TokenType.Operator && token.value === ';') {
                // Semicolon found, continue looking for THEN and terminator after it
                continue;
            }
            
            // Check if this is THEN keyword
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === 'THEN') {
                // Check if there's an inline terminator (END or dot) after THEN on same line
                let hasStatement = false;
                for (let j = i + 1; j < tokens.length; j++) {
                    const nextToken = tokens[j];
                    
                    // Stop if we hit a different line
                    if (nextToken.line !== ifLine) {
                        break;
                    }
                    
                    // Check for END keyword - inline terminator found!
                    if (nextToken.type === TokenType.EndStatement && nextToken.value.toUpperCase() === 'END') {
                        return true; // Has inline END terminator
                    }
                    
                    // Check for dot terminator - inline terminator found!
                    if (nextToken.type === TokenType.EndStatement && nextToken.value === '.') {
                        return true; // Has inline dot terminator
                    }
                    
                    // Track if we found a statement (non-comment token)
                    if (nextToken.type !== TokenType.Comment) {
                        hasStatement = true;
                    }
                }
                
                // THEN found with statement but NO terminator on same line
                // This MUST be validated (it's missing END or dot)
                return false;
            }
        }
        
        // No THEN found on same line - this is multi-line IF
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
            // Note: We check on each token to avoid missing terminators,
            // but we track which lines we've already checked to avoid duplicates
            if (blockStack.length > 0) {
                // Only check once per line
                const shouldCheckLine = i === 0 || tokens[i - 1].line !== token.line;
                
                if (shouldCheckLine) {
                    const lineText = document.getText({ 
                        start: { line: token.line, character: 0 }, 
                        end: { line: token.line, character: 1000 }
                    }).trim();
                    
                    // Check each open block to see if this line contains its terminator
                    for (let b = blockStack.length - 1; b >= 0; b--) {
                        const block = blockStack[b];
                        
                        // Don't check before the OMIT/COMPILE directive on the same line
                        // But DO check AFTER it (terminator can be on same line after semicolon)
                        if (token.line === block.line) {
                            // Get the full line text
                            const fullLineText = document.getText({ 
                                start: { line: block.line, character: 0 }, 
                                end: { line: block.line, character: 1000 }
                            });
                            
                            // Find where the directive starts
                            const directiveStart = block.column;
                            // Estimate where directive ends (COMPILE('terminator',expr) or OMIT('terminator'))
                            // Look for closing paren after the directive
                            const directiveSubstring = fullLineText.substring(directiveStart);
                            const parenClose = directiveSubstring.indexOf(')');
                            
                            if (parenClose !== -1) {
                                const searchStart = directiveStart + parenClose + 1;
                                const lineAfterDirective = fullLineText.substring(searchStart);
                                
                                // Check if terminator appears after the directive
                                if (lineAfterDirective.includes(block.terminator)) {
                                    // Terminator is on same line but AFTER the directive
                                    blockStack.splice(b, 1);
                                    break;
                                }
                            }
                            // Otherwise skip - terminator not found after directive
                            continue;
                        }
                        
                        // The terminator must appear on the line as-is (case-sensitive)
                        // The entire terminating line is included in the OMIT/COMPILE block
                        if (lineText.includes(block.terminator)) {
                            // Found matching terminator - remove from stack
                            blockStack.splice(b, 1);
                            break;  // Only match one block per line
                        }
                    }
                }
            }
        }
        
        // After processing all tokens, check ALL lines for terminators
        // (some lines may not have tokens, e.g., comment-only lines like "***")
        if (blockStack.length > 0) {
            const lineCount = document.lineCount;
            for (let lineNum = 0; lineNum < lineCount; lineNum++) {
                const lineText = document.getText({ 
                    start: { line: lineNum, character: 0 }, 
                    end: { line: lineNum, character: 1000 }
                }).trim();
                
                // Check each open block to see if this line contains its terminator
                for (let b = blockStack.length - 1; b >= 0; b--) {
                    const block = blockStack[b];
                    
                    // Don't check before the OMIT/COMPILE line, but DO check on the same line
                    // if terminator appears after the directive
                    if (lineNum < block.line) {
                        continue;
                    }
                    
                    // If same line as directive, check if terminator is AFTER the directive
                    if (lineNum === block.line) {
                        // Get the full line text
                        const fullLineText = document.getText({ 
                            start: { line: block.line, character: 0 }, 
                            end: { line: block.line, character: 1000 }
                        });
                        
                        // Find where the directive starts
                        const directiveStart = block.column;
                        // Look for closing paren after the directive
                        const directiveSubstring = fullLineText.substring(directiveStart);
                        const parenClose = directiveSubstring.indexOf(')');
                        
                        if (parenClose !== -1) {
                            const searchStart = directiveStart + parenClose + 1;
                            const lineAfterDirective = fullLineText.substring(searchStart);
                            
                            // Check if terminator appears after the directive
                            if (!lineAfterDirective.includes(block.terminator)) {
                                // Terminator not found after directive
                                continue;
                            }
                            // Fall through - terminator is on same line after directive
                        } else {
                            // Can't find directive end, skip this line
                            continue;
                        }
                    }
                    
                    // The terminator must appear on the line as-is (case-sensitive)
                    if (lineText.includes(block.terminator)) {
                        // Found matching terminator - remove from stack
                        blockStack.splice(b, 1);
                        break;  // Only match one block per line
                    }
                }
                
                // If all blocks are closed, no need to check more lines
                if (blockStack.length === 0) {
                    break;
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
    
    /**
     * Build a map of conditional compilation block ranges (COMPILE/OMIT)
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for text access
     * @returns Array of line ranges that are within conditional blocks
     */
    private static getConditionalBlockRanges(tokens: Token[], document: TextDocument): Array<{start: number, end: number}> {
        const ranges: Array<{start: number, end: number}> = [];
        const blockStack: Array<{line: number, terminator: string}> = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check if this is an OMIT or COMPILE directive
            if (token.type === TokenType.Directive) {
                const directiveType = token.value.toUpperCase();
                
                if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                    // Look for the terminator string
                    let terminatorString: string | null = null;
                    
                    for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                        if (tokens[j].type === TokenType.String) {
                            terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                            break;
                        }
                    }
                    
                    if (terminatorString) {
                        blockStack.push({
                            line: token.line,
                            terminator: terminatorString
                        });
                    }
                }
            }
        }
        
        // Now scan all lines to find terminators
        const lineCount = document.lineCount;
        for (const block of blockStack) {
            for (let lineNum = block.line + 1; lineNum < lineCount; lineNum++) {
                const lineText = document.getText({ 
                    start: { line: lineNum, character: 0 }, 
                    end: { line: lineNum, character: 1000 }
                }).trim();
                
                if (lineText.includes(block.terminator)) {
                    ranges.push({
                        start: block.line,
                        end: lineNum
                    });
                    break;
                }
            }
        }
        
        return ranges;
    }
    
    /**
     * Check if a line is within a conditional compilation block
     * @param line - Line number to check
     * @param ranges - Conditional block ranges
     * @returns True if line is within a conditional block
     */
    private static isInConditionalBlock(line: number, ranges: Array<{start: number, end: number}>): boolean {
        return ranges.some(range => line > range.start && line <= range.end);
    }
    
    /**
     * Validate FILE structures have required attributes
     * KB Rule: FILE must have DRIVER and RECORD
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for invalid FILE structures
     */
    private static validateFileStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const conditionalRanges = this.getConditionalBlockRanges(tokens, document);
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Skip FILE declarations within conditional compilation blocks
            if (this.isInConditionalBlock(token.line, conditionalRanges)) {
                continue;
            }
            
            // Check if this is a FILE declaration
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'FILE') {
                let hasDriver = false;
                let hasRecord = false;
                let fileEndIndex = -1;
                
                // Look ahead to find DRIVER, RECORD, and END
                for (let j = i + 1; j < tokens.length; j++) {
                    const nextToken = tokens[j];
                    const upperValue = nextToken.value.toUpperCase();
                    
                    // Check for DRIVER attribute
                    if (upperValue === 'DRIVER') {
                        hasDriver = true;
                    }
                    
                    // Check for RECORD section
                    if (upperValue === 'RECORD') {
                        hasRecord = true;
                    }
                    
                    // Stop at END or another structure declaration
                    if (upperValue === 'END' && nextToken.type === TokenType.EndStatement) {
                        fileEndIndex = j;
                        break;
                    }
                    
                    // Stop if we hit another structure at column 0
                    if (nextToken.type === TokenType.Structure && nextToken.start === 0 && nextToken.line > token.line) {
                        fileEndIndex = j - 1;
                        break;
                    }
                }
                
                // Report missing DRIVER
                if (!hasDriver) {
                    const range = {
                        start: { line: token.line, character: token.start },
                        end: { line: token.line, character: token.start + token.value.length }
                    };
                    
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: range,
                        message: `FILE declaration missing required DRIVER attribute`,
                        source: 'clarion'
                    });
                }
                
                // Report missing RECORD
                if (!hasRecord) {
                    const range = {
                        start: { line: token.line, character: token.start },
                        end: { line: token.line, character: token.start + token.value.length }
                    };
                    
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: range,
                        message: `FILE declaration missing required RECORD section`,
                        source: 'clarion'
                    });
                }
            }
        }
        
        return diagnostics;
    }
    
    /**
     * Validate CASE structures - OROF must follow OF
     * KB Rule: OROF must follow OF (CASE without OF is valid but uncommon)
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for invalid CASE structures
     */
    private static validateCaseStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check if this is a CASE statement
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CASE') {
                let hasOf = false;
                let lastOfIndex = -1;
                
                // Look ahead to find OF, OROF, and END
                for (let j = i + 1; j < tokens.length; j++) {
                    const nextToken = tokens[j];
                    const upperValue = nextToken.value.toUpperCase();
                    
                    // Check for OF
                    if (upperValue === 'OF') {
                        hasOf = true;
                        lastOfIndex = j;
                    }
                    
                    // Check for OROF
                    if (upperValue === 'OROF') {
                        // OROF must come after an OF
                        if (!hasOf || lastOfIndex === -1) {
                            const range = {
                                start: { line: nextToken.line, character: nextToken.start },
                                end: { line: nextToken.line, character: nextToken.start + nextToken.value.length }
                            };
                            
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: range,
                                message: `OROF must be preceded by an OF clause in CASE structure`,
                                source: 'clarion'
                            });
                        }
                    }
                    
                    // Stop at END
                    if (upperValue === 'END' && nextToken.type === TokenType.EndStatement) {
                        break;
                    }
                    
                    // Stop if we hit another structure
                    if (nextToken.type === TokenType.Structure && nextToken.line > token.line) {
                        break;
                    }
                }
            }
        }
        
        return diagnostics;
    }
    
    /**
     * Validate EXECUTE structures have numeric expression
     * KB Rule: EXECUTE expression must evaluate to numeric
     * Note: This is a simple heuristic - we check if the expression starts with
     * a variable/function that looks numeric or is a literal number
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for invalid EXECUTE structures
     */
    private static validateExecuteStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check if this is an EXECUTE statement
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'EXECUTE') {
                // Look at the next non-whitespace token to check the expression
                let expressionToken = i + 1 < tokens.length ? tokens[i + 1] : null;
                
                if (expressionToken) {
                    const expValue = expressionToken.value;
                    
                    // Simple heuristic checks for obviously non-numeric expressions
                    // Check if it starts with a string literal
                    if (expValue.startsWith("'") || expValue.startsWith('"')) {
                        const range = {
                            start: { line: expressionToken.line, character: expressionToken.start },
                            end: { line: expressionToken.line, character: expressionToken.start + expValue.length }
                        };
                        
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: range,
                            message: `EXECUTE expression should evaluate to a numeric value (found string literal)`,
                            source: 'clarion'
                        });
                    }
                }
            }
        }
        
        return diagnostics;
    }
    
    /**
     * Validate CLASS/INTERFACE implementation
     * KB Rule: CLASS implementing INTERFACE must define all interface methods
     * Note: This is a simplified check - full validation would require symbol resolution
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for missing interface implementations
     */
    private static validateClassInterfaceImplementation(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        // This would require more complex symbol table analysis
        // For now, we'll do a simple check: if CLASS has IMPLEMENTS attribute,
        // we verify that methods are defined somewhere in the file
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check if this is a CLASS with IMPLEMENTS
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
                // Look for IMPLEMENTS attribute
                let implementsInterface: string | null = null;
                
                for (let j = i + 1; j < tokens.length && tokens[j].line === token.line; j++) {
                    const nextToken = tokens[j];
                    if (nextToken.value.toUpperCase() === 'IMPLEMENTS') {
                        // Next token after IMPLEMENTS should be the interface name in parentheses
                        if (j + 1 < tokens.length && tokens[j + 1].value === '(') {
                            // Extract interface name from IMPLEMENTS(InterfaceName)
                            let parenDepth = 1;
                            let interfaceName = '';
                            for (let k = j + 2; k < tokens.length && parenDepth > 0; k++) {
                                if (tokens[k].value === '(') parenDepth++;
                                else if (tokens[k].value === ')') {
                                    parenDepth--;
                                    if (parenDepth === 0) break;
                                }
                                if (parenDepth > 0) {
                                    interfaceName += tokens[k].value;
                                }
                            }
                            implementsInterface = interfaceName.trim();
                            break;
                        }
                    }
                }
                
                // If we found an IMPLEMENTS, add a simple info diagnostic
                // (Full validation would require tracking interface methods and implementations)
                if (implementsInterface) {
                    // This is informational - actual validation would be much more complex
                    // and would require building a complete symbol table
                    // For now, we just note that interface validation is limited
                }
            }
        }
        
        return diagnostics;
    }
    
    /**
     * Validate that procedures/methods with return types have RETURN statements with values
     * Phase 1: Basic validation - checks that at least one RETURN with value exists
     * 
     * IMPORTANT: Return types only appear in declarations (CLASS/MAP/MODULE), NEVER in implementations
     * Strategy: Find declarations with return types, then find their implementations and validate
     * 
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for missing RETURN statements
     */
    public static validateReturnStatements(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const docLines = document.getText().split('\n');
        
        // Step 1: Find all procedure/method declarations with return types
        const declarationsWithReturnTypes: Array<{
            name: string;           // Method name or full ClassName.MethodName
            returnType: string;     // Return type (LONG, STRING, etc.)
            line: number;           // Declaration line
            signature: string;      // Full declaration line text (for overload matching)
        }> = [];
        
        // Find declarations in CLASS blocks and MAP blocks
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Look for MAP declarations
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'MAP') {
                // Find END of MAP
                let mapEndLine = -1;
                for (let j = i + 1; j < tokens.length; j++) {
                    if (tokens[j].value.toUpperCase() === 'END' && tokens[j].start === 0) {
                        mapEndLine = tokens[j].line;
                        break;
                    }
                }
                
                // Scan procedures in MAP
                for (let j = i + 1; j < tokens.length && (mapEndLine === -1 || tokens[j].line < mapEndLine); j++) {
                    if ((tokens[j].type === TokenType.Procedure || tokens[j].type === TokenType.Routine) &&
                        (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {
                        
                        // Find procedure name (should be at start of line)
                        const procNameToken = tokens.find(t =>
                            t.line === tokens[j].line && t.start === 0 && t.type === TokenType.Label
                        );
                        
                        if (!procNameToken) continue;
                        
                        // Check for return type: ProcName PROCEDURE(...), <attributes with return type>
                        let parenDepth = 0;
                        for (let k = j + 1; k < tokens.length && tokens[k].line === tokens[j].line; k++) {
                            if (tokens[k].value === '(') parenDepth++;
                            else if (tokens[k].value === ')') {
                                parenDepth--;
                                if (parenDepth === 0) {
                                    // Look for return type in attributes after closing paren
                                    // IMPORTANT: Only look on the SAME line as the PROCEDURE declaration
                                    if (k + 1 < tokens.length && tokens[k + 1].line === tokens[j].line) {
                                        const lineTokens = tokens.filter(t => t.line === tokens[j].line);
                                        const hasProc = lineTokens.some(t => t.value.toUpperCase() === 'PROC');
                                        const hasDerived = lineTokens.some(t => t.value.toUpperCase() === 'DERIVED');
                                        if (!hasProc && !hasDerived) {
                                            const returnType = extractReturnType(tokens, k + 1, true);
                                            if (returnType) {
                                                declarationsWithReturnTypes.push({
                                                    name: procNameToken.value,  // Just procedure name, no class prefix
                                                    returnType: returnType,
                                                    line: procNameToken.line,
                                                    signature: docLines[tokens[j].line] || ''
                                                });
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            // Look for CLASS declarations
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
                // Find class name
                const classNameToken = tokens.find(t => 
                    t.type === TokenType.Label && t.line === token.line
                );
                
                if (!classNameToken) continue;
                
                const className = classNameToken.value;
                
                // Use finishesAt from DocumentStructure (reliable); fall back to scanning
                // for END at column 0 only if finishesAt is absent. The manual scan is
                // unreliable when the CLASS END is indented (start !== 0), causing the
                // inner loop to bleed past the class body into the rest of the file and
                // falsely attribute later declarations to this class name.
                let classEndLine: number = token.finishesAt ?? -1;
                if (classEndLine === -1) {
                    for (let j = i + 1; j < tokens.length; j++) {
                        if (tokens[j].value.toUpperCase() === 'END' && tokens[j].start === 0) {
                            classEndLine = tokens[j].line;
                            break;
                        }
                    }
                }
                
                // Scan methods in CLASS
                for (let j = i + 1; j < tokens.length && (classEndLine === -1 || tokens[j].line < classEndLine); j++) {
                    if ((tokens[j].type === TokenType.Procedure || tokens[j].type === TokenType.Routine) &&
                        (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {
                        
                        // Find method name (should be at start of line)
                        const methodNameToken = tokens.find(t =>
                            t.line === tokens[j].line && t.start === 0 && t.type === TokenType.Label
                        );
                        
                        if (!methodNameToken) continue;
                        
                        // Check for return type: METHOD PROCEDURE(...), <attributes with return type>
                        let parenDepth = 0;
                        for (let k = j + 1; k < tokens.length && tokens[k].line === tokens[j].line; k++) {
                            if (tokens[k].value === '(') parenDepth++;
                            else if (tokens[k].value === ')') {
                                parenDepth--;
                                if (parenDepth === 0) {
                                    // Look for return type in attributes after closing paren
                                    // IMPORTANT: Only look on the SAME line as the PROCEDURE declaration
                                    if (k + 1 < tokens.length && tokens[k + 1].line === tokens[j].line) {
                                        // Skip if PROC attribute present (callers don't have to capture, so
                                        // empty RETURN is intentional) or DERIVED (override may drop return type)
                                        const lineTokens = tokens.filter(t => t.line === tokens[j].line);
                                        const hasProc = lineTokens.some(t => t.value.toUpperCase() === 'PROC');
                                        const hasDerived = lineTokens.some(t => t.value.toUpperCase() === 'DERIVED');
                                        if (!hasProc && !hasDerived) {
                                            const returnType = extractReturnType(tokens, k + 1, true);
                                            if (returnType) {
                                                declarationsWithReturnTypes.push({
                                                    name: className + '.' + methodNameToken.value,
                                                    returnType: returnType,
                                                    line: methodNameToken.line,
                                                    signature: docLines[tokens[j].line] || ''
                                                });
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Step 2: Find implementations and validate
        for (const decl of declarationsWithReturnTypes) {
            // Find the implementation
            let inMapOrClass = false;
            let mapClassDepth = 0;
            
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                
                // Track when we're inside MAP or CLASS blocks
                if (token.type === TokenType.Structure && 
                    (token.value.toUpperCase() === 'MAP' || token.value.toUpperCase() === 'CLASS')) {
                    inMapOrClass = true;
                    mapClassDepth++;
                }
                
                // Track END statements to know when we exit MAP/CLASS
                if (token.value.toUpperCase() === 'END' && token.type === TokenType.EndStatement) {
                    if (mapClassDepth > 0) {
                        mapClassDepth--;
                        if (mapClassDepth === 0) {
                            inMapOrClass = false;
                        }
                    }
                }
                
                // Skip procedure declarations inside MAP/CLASS - we only want implementations
                if (inMapOrClass) {
                    continue;
                }
                
                if ((token.type === TokenType.Procedure || token.type === TokenType.Routine) &&
                    (token.value.toUpperCase() === 'PROCEDURE' || token.value.toUpperCase() === 'FUNCTION')) {
                    
                    // Reconstruct full name from tokens
                    let fullName = '';
                    if (i > 0 && (tokens[i - 1].type === TokenType.Label || tokens[i - 1].type === TokenType.Variable)) {
                        fullName = tokens[i - 1].value;
                        
                        // Check for ClassName.MethodName pattern
                        if (i > 2 && tokens[i - 2].value === '.' && tokens[i - 3].type === TokenType.Label) {
                            fullName = tokens[i - 3].value + '.' + fullName;
                        } else if (i > 1 && tokens[i - 2].type === TokenType.Label) {
                            // Check source for dot
                            const line = docLines[token.line];
                            const className = tokens[i - 2].value;
                            const methodName = tokens[i - 1].value;
                            if (line.includes(className + '.' + methodName)) {
                                fullName = className + '.' + methodName;
                            }
                        }
                    }
                    
                    // Check if this matches our declaration
                    // Clarion is case-insensitive, so compare lowercase
                    if (fullName.toLowerCase() === decl.name.toLowerCase()) {
                        // For overloaded procedures, verify this implementation matches the declaration's
                        // parameter signature — if not, it's a different overload, skip it
                        const implLine = docLines[token.line] || '';
                        const declParams = ProcedureSignatureUtils.extractParameterTypes(decl.signature);
                        const implParams = ProcedureSignatureUtils.extractParameterTypes(implLine);
                        if (!ProcedureSignatureUtils.parametersMatch(declParams, implParams)) {
                            continue; // Different overload — keep searching
                        }
                        // Find CODE and validate RETURN statements
                        let codeLineStart = -1;
                        
                        for (let j = i + 1; j < tokens.length; j++) {
                            if ((tokens[j].type === TokenType.Keyword || 
                                 tokens[j].type === TokenType.Label ||
                                 tokens[j].type === TokenType.ExecutionMarker) && 
                                tokens[j].value.toUpperCase() === 'CODE') {
                                codeLineStart = tokens[j].line;
                                break;
                            }
                            if ((tokens[j].type === TokenType.Procedure || tokens[j].type === TokenType.Routine) &&
                                (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {
                                break;
                            }
                        }
                        
                        if (codeLineStart === -1) continue;
                        
                        // Find end of procedure
                        let procedureEndLine = tokens[tokens.length - 1].line;
                        for (let j = i + 1; j < tokens.length; j++) {
                            if (j !== i && tokens[j].type === TokenType.Label) {
                                if (j + 1 < tokens.length && 
                                    (tokens[j + 1].type === TokenType.Procedure || tokens[j + 1].type === TokenType.Routine) &&
                                    (tokens[j + 1].value.toUpperCase() === 'PROCEDURE' || tokens[j + 1].value.toUpperCase() === 'FUNCTION')) {
                                    procedureEndLine = tokens[j].line - 1;
                                    break;
                                }
                            }
                        }
                        
                        // Look for RETURN statements
                        const returnStatements: { line: number; hasValue: boolean }[] = [];
                        
                        for (let j = i + 1; j < tokens.length; j++) {
                            if (tokens[j].line > procedureEndLine) break;
                            if (tokens[j].line < codeLineStart) continue;
                            
                            if (tokens[j].type === TokenType.Keyword && tokens[j].value.toUpperCase() === 'RETURN') {
                                let hasValue = false;
                                for (let k = j + 1; k < tokens.length && tokens[k].line === tokens[j].line; k++) {
                                    if (tokens[k].type !== TokenType.Operator && 
                                        tokens[k].value !== '(' && 
                                        tokens[k].value !== ')' &&
                                        tokens[k].value !== ',' &&
                                        tokens[k].value !== '.' &&
                                        tokens[k].type !== TokenType.Comment) {
                                        hasValue = true;
                                        break;
                                    }
                                }
                                
                                returnStatements.push({
                                    line: tokens[j].line,
                                    hasValue: hasValue
                                });
                            }
                        }
                        
                        // Validate
                        const implToken = i > 0 ? tokens[i - 1] : token;
                        
                        if (returnStatements.length === 0) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: {
                                    start: { line: implToken.line, character: implToken.start },
                                    end: { line: implToken.line, character: implToken.start + implToken.value.length }
                                },
                                message: `Procedure '${decl.name}' returns ${decl.returnType} but has no RETURN statement`,
                                source: 'clarion'
                            });
                        } else if (returnStatements.every(r => !r.hasValue)) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: {
                                    start: { line: implToken.line, character: implToken.start },
                                    end: { line: implToken.line, character: implToken.start + implToken.value.length }
                                },
                                message: `Procedure '${decl.name}' returns ${decl.returnType} but all RETURN statements are empty`,
                                source: 'clarion'
                            });
                        }
                        
                        break; // Found implementation, move to next declaration
                    }
                }
            }
        }
        
        return diagnostics;
    }
    
    /**
     * Validate CLASS properties and QUEUE nesting
     * - QUEUE structures are not allowed as direct CLASS properties
     * - QUEUE structures are not allowed nested inside other QUEUEs
     * Only QUEUE references (&QUEUE) are allowed
     * @param tokens - Tokenized document
     * @param document - Original TextDocument for position mapping
     * @returns Array of Diagnostic objects for invalid structures
     */
    private static validateClassProperties(tokens: Token[], document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        // Find all CLASS and QUEUE structures
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            if (token.type !== TokenType.Structure) {
                continue;
            }
            
            const structureType = token.value.toUpperCase();
            
            // Check CLASS for QUEUE children
            if (structureType === 'CLASS' && token.children) {
                for (const child of token.children) {
                    if (child.type === TokenType.Structure && child.value.toUpperCase() === 'QUEUE') {
                        const diagnostic: Diagnostic = {
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: { line: child.line, character: child.start },
                                end: { line: child.line, character: child.start + child.value.length }
                            },
                            message: 'QUEUE structures are not allowed as direct CLASS properties. Use a QUEUE reference (&QUEUE) instead.',
                            source: 'clarion'
                        };
                        diagnostics.push(diagnostic);
                    }
                }
            }
            
            // Check QUEUE for nested QUEUE children
            if (structureType === 'QUEUE' && token.children) {
                for (const child of token.children) {
                    if (child.type === TokenType.Structure && child.value.toUpperCase() === 'QUEUE') {
                        const diagnostic: Diagnostic = {
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: { line: child.line, character: child.start },
                                end: { line: child.line, character: child.start + child.value.length }
                            },
                            message: 'QUEUE structures cannot be nested inside other QUEUE structures. Use a QUEUE reference (&QUEUE) instead.',
                            source: 'clarion'
                        };
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }
        
        return diagnostics;
    }

    // ─── Discarded return value helpers ─────────────────────────────────────

    /**
     * Identifies CODE block line ranges in the token stream, along with the
     * class name that SELF refers to inside each block (null for non-method bodies).
     * Uses `token.executionMarker` (set by DocumentStructure on PROCEDURE/ROUTINE tokens)
     * and `token.finishesAt` — the same metadata used by ClarionDocumentSymbolProvider.
     */
    private static getCodeBlockRanges(
        tokens: Token[]
    ): { start: number; end: number; selfClassName: string | null }[] {
        const ranges: { start: number; end: number; selfClassName: string | null }[] = [];

        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            // Find PROCEDURE/ROUTINE/FUNCTION keyword tokens that are implementations
            if (t.type !== TokenType.Procedure && t.type !== TokenType.Routine) continue;
            // Must have an explicit CODE section
            if (!t.executionMarker) continue;

            // Skip declarations (no body): MethodDeclaration, InterfaceMethod
            const sub = t.subType;
            if (sub === TokenType.MethodDeclaration || sub === TokenType.InterfaceMethod) continue;

            const codeStart = t.executionMarker.line + 1;
            const procEnd = t.finishesAt ?? tokens[tokens.length - 1].line;

            // Look back on the same line for the col-0 label (to get selfClassName)
            let selfClassName: string | null = null;
            for (let k = i - 1; k >= 0; k--) {
                if (tokens[k].line < t.line) break;
                if (tokens[k].type === TokenType.Label && tokens[k].start === 0) {
                    const parts = tokens[k].value.split('.');
                    selfClassName = parts.length >= 2 ? parts[0] : null;
                    break;
                }
            }

            ranges.push({ start: codeStart, end: procEnd, selfClassName });
        }

        return ranges;
    }

    /**
     * Returns true if `typeStr` (the attribute string after the member name, e.g.
     * "PROCEDURE (), string, virtual") describes a method that has a return type
     * and does NOT carry the PROC attribute — meaning callers MUST capture the value.
     */
    private static isNonProcReturnMethod(typeStr: string): boolean {
        const upper = typeStr.toUpperCase();
        if (!upper.startsWith('PROCEDURE') && !upper.startsWith('FUNCTION')) return false;
        // PROC attribute suppresses the return-value requirement
        if (/\bPROC\b/.test(upper)) return false;

        // Strip the PROCEDURE/FUNCTION parameter list to get the attribute section
        let afterParen = upper;
        const parenIdx = upper.indexOf('(');
        if (parenIdx !== -1) {
            let depth = 0;
            for (let i = parenIdx; i < upper.length; i++) {
                if (upper[i] === '(') depth++;
                else if (upper[i] === ')') {
                    depth--;
                    if (depth === 0) { afterParen = upper.substring(i + 1); break; }
                }
            }
        } else {
            afterParen = upper.substring(upper.indexOf('PROCEDURE') + 9).trimStart().substring(
                upper.indexOf('FUNCTION') !== -1 ? 8 : 0
            );
        }

        // Check for a Clarion data-type keyword in the attribute section
        return /\b(LONG|SHORT|BYTE|SIGNED|UNSIGNED|STRING|CSTRING|PSTRING|REAL|DECIMAL|DATE|TIME|SREAL|BLOB|QUEUE|GROUP|CLASS|BOOL|ANY|BFILE|FILE)\b/.test(afterParen);
    }

    /**
     * Async validation pass: warns when a dot-access method call discards a return value.
     * Reuses MemberLocatorService (the same resolution path as hover and F12) for type lookup.
     *
     * Design notes:
     * - Only examines lines inside CODE blocks (token-derived ranges).
     * - Detects standalone `obj.Method(...)` / `obj.Method` lines via regex, then falls
     *   through silently on any resolution failure — no false positives.
     * - Handles SELF/PARENT by determining the enclosing class from the implementation label.
     * - paramCount is passed to resolveDotAccess for correct overload selection.
     *
     * Closes #61
     */
    public static async validateDiscardedReturnValues(
        tokens: Token[],
        document: TextDocument,
        memberLocator: MemberLocatorService
    ): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        const docLines = document.getText().split('\n');
        const codeRanges = this.getCodeBlockRanges(tokens);
        if (codeRanges.length === 0) return diagnostics;

        // Regex to check that a line STARTS with obj.Method — we validate the rest manually
        const DOTCALL_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/;

        for (let lineIdx = 0; lineIdx < docLines.length; lineIdx++) {
            const range = codeRanges.find(r => lineIdx >= r.start && lineIdx <= r.end);
            if (!range) continue;

            const rawLine = docLines[lineIdx];
            // Strip Clarion line comment (! outside strings) — conservative: may produce
            // false negatives when ! is inside a string argument, never false positives.
            const stripped = rawLine.replace(/!.*$/, '').trim();
            if (!stripped) continue;

            const prefixMatch = stripped.match(DOTCALL_PREFIX);
            if (!prefixMatch) continue;

            const objectName = prefixMatch[1];
            const methodName = prefixMatch[2];
            const afterMatch = stripped.substring(prefixMatch[0].length).trimStart();

            // Determine whether the rest of the line is empty (no parens) or just (...)
            let argsStr = '';
            if (afterMatch === '') {
                // obj.Method with no parentheses — valid Clarion call
            } else if (afterMatch.startsWith('(')) {
                // Walk to matching close paren
                let depth = 0;
                let closeIdx = -1;
                for (let i = 0; i < afterMatch.length; i++) {
                    if (afterMatch[i] === '(') depth++;
                    else if (afterMatch[i] === ')') {
                        depth--;
                        if (depth === 0) { closeIdx = i; break; }
                    }
                }
                if (closeIdx === -1) continue; // Unclosed paren — multi-line or syntax error, skip
                const afterClose = afterMatch.substring(closeIdx + 1).trim();
                if (afterClose) continue; // Something after call (e.g. assignment, chained) — not standalone
                argsStr = afterMatch.substring(1, closeIdx);
            } else {
                continue; // Something between identifier and end-of-line — not a bare call
            }

            // Count top-level arguments for overload resolution
            let paramCount = 0;
            if (argsStr.trim()) {
                paramCount = 1;
                let depth = 0;
                for (const ch of argsStr) {
                    if (ch === '(' || ch === '[') depth++;
                    else if (ch === ')' || ch === ']') depth--;
                    else if (ch === ',' && depth === 0) paramCount++;
                }
            }

            // Resolve: SELF/PARENT → use class from implementation label; otherwise dot-access
            let memberInfo;
            const objUpper = objectName.toUpperCase();
            if (objUpper === 'SELF' || objUpper === 'PARENT') {
                if (!range.selfClassName) continue;
                memberInfo = await memberLocator.findMemberInClass(
                    range.selfClassName, methodName, document, paramCount
                );
            } else {
                memberInfo = await memberLocator.resolveDotAccess(
                    objectName, methodName, document, paramCount
                );
            }

            if (!memberInfo) {
                logger.debug(`🔍 Line ${lineIdx + 1}: no memberInfo resolved for ${objectName}.${methodName}`);
                continue;
            }
            logger.debug(`🔍 Line ${lineIdx + 1}: ${objectName}.${methodName} → type="${memberInfo.type}" isNonProc=${this.isNonProcReturnMethod(memberInfo.type ?? '')}`);
            if (!this.isNonProcReturnMethod(memberInfo.type ?? '')) continue;

            const colStart = rawLine.search(/\S/);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineIdx, character: colStart >= 0 ? colStart : 0 },
                    end: { line: lineIdx, character: colStart + stripped.length }
                },
                message: `Return value of '${objectName}.${methodName}' is discarded. Capture the return value or add the PROC attribute to the declaration to suppress this warning.`,
                source: 'clarion'
            });
        }

        return diagnostics;
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
