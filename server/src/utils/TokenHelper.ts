import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';

/**
 * Shared utility for token and scope navigation
 * Used by HoverProvider, DefinitionProvider, and other providers
 */
export class TokenHelper {
    /**
     * Gets the innermost scope at a line (optimized version using DocumentStructure)
     * 🚀 PERFORMANCE: O(log n) using document structure instead of O(n) filter
     * @param structure DocumentStructure instance
     * @param line Line number to find scope for
     * @returns The innermost scope token or undefined
     */
    public static getInnermostScopeAtLine(structure: DocumentStructure, line: number): Token | undefined;
    
    /**
     * Gets the innermost scope at a line (legacy version)
     * ⚠️ DEPRECATED: Use overload with DocumentStructure for better performance
     * @param tokens Array of tokens
     * @param line Line number to find scope for
     * @returns The innermost scope token or undefined
     */
    public static getInnermostScopeAtLine(tokens: Token[], line: number): Token | undefined;
    
    /**
     * Implementation of getInnermostScopeAtLine
     */
    public static getInnermostScopeAtLine(tokensOrStructure: Token[] | DocumentStructure, line: number): Token | undefined {
        // Check if we received a DocumentStructure
        if ('getParent' in tokensOrStructure) {
            // 🚀 PERFORMANCE: Use structure's parent index
            const structure = tokensOrStructure as DocumentStructure;
            
            // Get all tokens on this line
            const lineTokens = structure.getTokensByLine(line);
            if (!lineTokens || lineTokens.length === 0) {
                return undefined;
            }
            
            // Find any token on this line
            const anyToken = lineTokens[0];
            
            // Walk up the parent chain to find the innermost scope
            let current: Token | undefined = anyToken;
            let innermostScope: Token | undefined = undefined;
            
            while (current) {
                if (this.isScopeDefiningToken(current)) {
                    innermostScope = current;
                }
                current = structure.getParent(current);
            }
            
            return innermostScope;
        } else {
            // Legacy implementation using token array (O(n) filter)
            const tokens = tokensOrStructure as Token[];
            const scopes = tokens.filter(token =>
                // Only consider actual procedure implementations and global procedures, not method declarations in CLASS
                (token.subType === TokenType.Procedure ||
                    token.subType === TokenType.GlobalProcedure ||
                    token.subType === TokenType.MethodImplementation ||
                    token.subType === TokenType.Routine) &&
                token.line <= line &&
                (token.finishesAt === undefined || token.finishesAt >= line)
            );

            return scopes.length > 0 ? scopes[scopes.length - 1] : undefined;
        }
    }

    /**
     * Finds the parent scope (procedure/method) containing a routine (optimized version)
     * 🚀 PERFORMANCE: O(log n) using parent index instead of O(n) filter
     * @param structure DocumentStructure instance
     * @param routineScope The routine token
     * @returns Parent scope token or undefined
     */
    public static getParentScopeOfRoutine(structure: DocumentStructure, routineScope: Token): Token | undefined;
    
    /**
     * Finds the parent scope (procedure/method) containing a routine (legacy version)
     * ⚠️ DEPRECATED: Use overload with DocumentStructure for better performance
     * @param tokens Array of tokens
     * @param routineScope The routine token
     * @returns Parent scope token or undefined
     */
    public static getParentScopeOfRoutine(tokens: Token[], routineScope: Token): Token | undefined;
    
    /**
     * Implementation of getParentScopeOfRoutine
     */
    public static getParentScopeOfRoutine(tokensOrStructure: Token[] | DocumentStructure, routineScope: Token): Token | undefined {
        // Check if we received a DocumentStructure
        if ('getParent' in tokensOrStructure) {
            // 🚀 PERFORMANCE: Use structure's parent index (O(log n))
            const structure = tokensOrStructure as DocumentStructure;
            return structure.getParentScope(routineScope);
        } else {
            // Legacy implementation using token array (O(n) filter)
            const tokens = tokensOrStructure as Token[];
            const parentScopes = tokens.filter(token =>
                (token.subType === TokenType.Procedure ||
                    token.subType === TokenType.GlobalProcedure ||
                    token.subType === TokenType.MethodImplementation ||
                    token.subType === TokenType.MethodDeclaration) &&
                token.line < routineScope.line &&
                (token.finishesAt === undefined || token.finishesAt >= routineScope.line)
            );

            if (parentScopes.length === 0) {
                return undefined;
            }

            // Return the closest parent (highest line number)
            return parentScopes.reduce((a, b) => a.line > b.line ? a : b);
        }
    }

    /**
     * Check if a token defines a scope (procedure, routine, etc.)
     */
    private static isScopeDefiningToken(token: Token): boolean {
        return token.subType === TokenType.Procedure ||
               token.subType === TokenType.GlobalProcedure ||
               token.subType === TokenType.MethodImplementation ||
               token.subType === TokenType.Routine;
    }

    /**
     * Gets the word range at a position
     * Handles Clarion's special notation:
     * - Prefix notation with colons (LOC:Field, Struct:Field)
     * - Dot notation for structure fields (MyGroup.MyField)
     * - Position-aware for dot notation (cursor on prefix vs cursor on field)
     */
    public static getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });

        // In Clarion, colons are used for prefix notation (LOC:Field, Struct:Field, etc.)
        // and dots are used for structure field access (MyGroup.MyField)
        const includeColons = true;
        
        // For dot notation, we need to be position-aware
        // If cursor is on "MyGroup" in "MyGroup.MyVar", return only "MyGroup"
        // If cursor is on "MyVar" in "MyGroup.MyVar", return "MyGroup.MyVar"
        
        // First, find the immediate word at cursor position (without dots)
        let wordStart = position.character;
        let wordEnd = position.character;
        
        // Find start of current word segment
        while (wordStart > 0) {
            const char = line.charAt(wordStart - 1);
            if (this.isWordCharacter(char) || (includeColons && char === ':')) {
                wordStart--;
            } else {
                break;
            }
        }
        
        // Find end of current word segment  
        while (wordEnd < line.length) {
            const char = line.charAt(wordEnd);
            if (this.isWordCharacter(char)) {
                wordEnd++;
            } else if (includeColons && char === ':') {
                // Include colon in prefix notation
                wordEnd++;
            } else {
                break;
            }
        }
        
        // Now check if there's a dot before or after this word segment
        // If dot is BEFORE the word, we're on the field part - include the prefix
        // If dot is AFTER the word, we're on the prefix part - only return the prefix
        let start = wordStart;
        let end = wordEnd;
        
        // Check for dot AFTER current word (e.g., cursor on "MyGroup" in "MyGroup.MyVar")
        if (wordEnd < line.length && line.charAt(wordEnd) === '.') {
            // Cursor is on the structure name part, just return that part
            // Don't include the dot or field name
        }
        // Check for dot BEFORE current word (e.g., cursor on "MyVar" in "MyGroup.MyVar")
        else if (wordStart > 0 && line.charAt(wordStart - 1) === '.') {
            // Cursor is on the field part, include the structure name
            // Walk backwards to include "MyGroup."
            start = wordStart - 1; // Include the dot
            while (start > 0) {
                const char = line.charAt(start - 1);
                if (this.isWordCharacter(char)) {
                    start--;
                } else {
                    break;
                }
            }
        }

        if (start === end) {
            return null;
        }

        return {
            start: { line: position.line, character: start },
            end: { line: position.line, character: end }
        };
    }

    /**
     * Checks if a character is part of a word (excluding dots and colons)
     */
    private static isWordCharacter(char: string): boolean {
        return /[a-zA-Z0-9_]/.test(char);
    }

    // ========================================================================
    // Phase 2: Filter Pattern Consolidation & Case-Insensitive Comparison
    // ========================================================================

    /**
     * Case-insensitive string comparison (optimized to avoid unnecessary allocations)
     * 🚀 PERFORMANCE: Only allocates uppercase strings once, not in tight loops
     * @param a First string
     * @param b Second string  
     * @returns true if strings are equal (case-insensitive)
     */
    public static equalsIgnoreCase(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        return a.toUpperCase() === b.toUpperCase();
    }

    /**
     * Find all tokens matching given criteria
     * Consolidates common filter patterns used throughout the codebase
     * @param tokens Array of tokens to search
     * @param criteria Filter criteria object
     * @returns Array of matching tokens
     */
    public static findTokens(tokens: Token[], criteria: {
        type?: TokenType;
        types?: TokenType[];
        subType?: TokenType;
        subTypes?: TokenType[];
        value?: string;
        valueMatch?: (value: string) => boolean;
        atStart?: boolean;
        line?: number;
        beforeLine?: number;
        afterLine?: number;
        inScope?: Token;
    }): Token[] {
        return tokens.filter(t => {
            // Type filtering
            if (criteria.type !== undefined && t.type !== criteria.type) return false;
            if (criteria.types && !criteria.types.includes(t.type)) return false;
            
            // SubType filtering
            if (criteria.subType !== undefined && t.subType !== criteria.subType) return false;
            if (criteria.subTypes && !criteria.subTypes.includes(t.subType!)) return false;
            
            // Value filtering (case-insensitive)
            if (criteria.value && !this.equalsIgnoreCase(t.value, criteria.value)) return false;
            if (criteria.valueMatch && !criteria.valueMatch(t.value)) return false;
            
            // Position filtering
            if (criteria.atStart !== undefined && (t.start === 0) !== criteria.atStart) return false;
            if (criteria.line !== undefined && t.line !== criteria.line) return false;
            if (criteria.beforeLine !== undefined && t.line >= criteria.beforeLine) return false;
            if (criteria.afterLine !== undefined && t.line <= criteria.afterLine) return false;
            
            // Scope filtering
            if (criteria.inScope) {
                const inScope = t.line >= criteria.inScope.line &&
                              (criteria.inScope.finishesAt === undefined || 
                               t.line <= criteria.inScope.finishesAt);
                if (!inScope) return false;
            }
            
            return true;
        });
    }

    /**
     * Find labels at column 0 (common pattern across providers)
     * @param tokens Array of tokens
     * @param name Optional label name to match (case-insensitive)
     * @returns Array of label tokens
     */
    public static findLabels(tokens: Token[], name?: string): Token[] {
        return this.findTokens(tokens, {
            type: TokenType.Label,
            atStart: true,
            value: name
        });
    }

    /**
     * Find MAP structures (common pattern in MapProcedureResolver)
     * @param tokens Array of tokens
     * @returns Array of MAP structure tokens
     */
    public static findMapStructures(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            type: TokenType.Structure,
            value: 'MAP'
        });
    }

    /**
     * Find procedure tokens (any type: Procedure, GlobalProcedure, MethodImplementation)
     * @param tokens Array of tokens
     * @returns Array of procedure tokens
     */
    public static findProcedures(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            subTypes: [
                TokenType.Procedure,
                TokenType.GlobalProcedure,
                TokenType.MethodImplementation
            ]
        });
    }

    /**
     * Find routine tokens
     * @param tokens Array of tokens
     * @returns Array of routine tokens
     */
    public static findRoutines(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            subType: TokenType.Routine
        });
    }

    /**
     * Find variable tokens at column 0 (common pattern for data section variables)
     * @param tokens Array of tokens
     * @param name Optional variable name to match (case-insensitive)
     * @returns Array of variable tokens
     */
    public static findVariablesAtStart(tokens: Token[], name?: string): Token[] {
        return this.findTokens(tokens, {
            types: [
                TokenType.Variable,
                TokenType.ReferenceVariable,
                TokenType.ImplicitVariable,
                TokenType.Label // Labels can also be variable declarations
            ],
            atStart: true,
            value: name
        });
    }

    /**
     * Find structure tokens with specific prefix
     * @param tokens Array of tokens
     * @param prefix Structure prefix to match (case-insensitive)
     * @returns Array of structure tokens with matching prefix
     */
    public static findStructuresWithPrefix(tokens: Token[], prefix: string): Token[] {
        return tokens.filter(t =>
            t.type === TokenType.Structure &&
            t.structurePrefix &&
            this.equalsIgnoreCase(t.structurePrefix, prefix)
        );
    }

    /**
     * Find tokens in first N lines (common pattern for file header scanning)
     * @param tokens Array of tokens
     * @param maxLine Maximum line number (exclusive)
     * @returns Array of tokens before maxLine
     */
    public static findTokensInHeader(tokens: Token[], maxLine: number = 5): Token[] {
        return this.findTokens(tokens, {
            beforeLine: maxLine
        });
    }
}
