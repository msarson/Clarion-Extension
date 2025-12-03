import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../ClarionTokenizer';

/**
 * Shared utility for token and scope navigation
 * Used by HoverProvider, DefinitionProvider, and other providers
 */
export class TokenHelper {
    /**
     * Gets the innermost scope at a line
     * Excludes MethodDeclaration (CLASS method declarations in DATA section)
     */
    public static getInnermostScopeAtLine(tokens: Token[], line: number): Token | undefined {
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

    /**
     * Finds the parent scope (procedure/method) containing a routine
     */
    public static getParentScopeOfRoutine(tokens: Token[], routineScope: Token): Token | undefined {
        // Find all procedure/method scopes that contain this routine
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
}
