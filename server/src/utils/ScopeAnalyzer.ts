import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { Token, TokenType } from '../tokenizer/TokenTypes';

export type ScopeLevel = 'global' | 'module' | 'procedure' | 'routine';
export type ScopeType = 'global' | 'module-local' | 'procedure-local' | 'routine-local';

export interface ScopeInfo {
    type: ScopeLevel;
    containingProcedure?: Token;
    containingRoutine?: Token;
    memberModuleName?: string;
    isProgramFile: boolean;
    currentFile: string;
}

/**
 * Centralized scope analysis for Clarion language
 * Determines what scope a token/symbol is in and what it can access
 */
export class ScopeAnalyzer {
    constructor(
        private tokenCache: TokenCache,
        private solutionManager: SolutionManager | null
    ) {}

    /**
     * Get scope information for a token at a specific location
     * @param document The document containing the token
     * @param position Position in the document
     * @returns Scope information or null if not determinable
     */
    getTokenScope(document: TextDocument, position: Position): ScopeInfo | null {
        const tokens = this.tokenCache.getTokens(document);
        if (!tokens || tokens.length === 0) {
            return null;
        }

        const isProgramFile = this.isProgramFile(tokens);
        const memberModuleName = this.getMemberModuleName(tokens);
        const containingProcedure = this.findContainingProcedure(tokens, position.line);
        const containingRoutine = this.findContainingRoutine(tokens, position.line);

        // Determine scope level
        let scopeLevel: ScopeLevel;
        if (containingRoutine) {
            scopeLevel = 'routine';
        } else if (containingProcedure) {
            scopeLevel = 'procedure';
        } else if (memberModuleName) {
            scopeLevel = 'module';
        } else {
            scopeLevel = 'global';
        }

        return {
            type: scopeLevel,
            containingProcedure,
            containingRoutine,
            memberModuleName,
            isProgramFile,
            currentFile: document.uri
        };
    }

    /**
     * Determine what scope a symbol was declared in
     * @param symbol The token representing the symbol
     * @param document The document containing the symbol
     * @returns The scope type of the symbol
     */
    getSymbolScope(symbol: Token, document: TextDocument): ScopeType {
        return 'global';
    }

    /**
     * Check if a reference at one location can access a declaration at another
     * @param referenceLocation Where the symbol is being used
     * @param declarationLocation Where the symbol was declared
     * @param referenceDocument Document containing the reference
     * @param declarationDocument Document containing the declaration
     * @returns True if access is allowed
     */
    canAccess(
        referenceLocation: Position,
        declarationLocation: Position,
        referenceDocument: TextDocument,
        declarationDocument: TextDocument
    ): boolean {
        return false;
    }

    /**
     * Get all files that can see a symbol based on its scope
     * @param symbol The symbol token
     * @param declaringFile Path to file where symbol is declared
     * @returns Array of file paths that can access this symbol
     */
    async getVisibleFiles(symbol: Token, declaringFile: string): Promise<string[]> {
        return [];
    }

    private isProgramFile(tokens: Token[]): boolean {
        // PROGRAM at column 0 is tokenized as Label, not ClarionDocument
        return tokens.some(token => 
            (token.type === TokenType.Label || token.type === TokenType.ClarionDocument) && 
            token.value.toUpperCase() === 'PROGRAM'
        );
    }

    private getMemberModuleName(tokens: Token[]): string | undefined {
        // MEMBER at column 0 is tokenized as Label, not ClarionDocument
        // and is tokenized as separate tokens: MEMBER ( 'ModuleName' )
        const memberIndex = tokens.findIndex(token =>
            (token.type === TokenType.Label || token.type === TokenType.ClarionDocument) &&
            token.value.toUpperCase() === 'MEMBER'
        );

        if (memberIndex >= 0 && memberIndex + 2 < tokens.length) {
            // Check if next token is ( and token after that is the string
            const parenToken = tokens[memberIndex + 1];
            const stringToken = tokens[memberIndex + 2];
            
            if (parenToken && parenToken.value === '(' && 
                stringToken && stringToken.type === TokenType.String) {
                // String token value includes the quotes, remove them
                return stringToken.value.replace(/^['"]|['"]$/g, '');
            }
        }

        return undefined;
    }

    private findContainingProcedure(tokens: Token[], line: number): Token | undefined {
        return tokens.find(token =>
            (token.subType === TokenType.Procedure ||
             token.subType === TokenType.GlobalProcedure ||
             token.subType === TokenType.MethodImplementation) &&
            token.line <= line &&
            (token.finishesAt === undefined || token.finishesAt >= line)
        );
    }

    private findContainingRoutine(tokens: Token[], line: number): Token | undefined {
        return tokens.find(token =>
            token.subType === TokenType.Routine &&
            token.line <= line &&
            (token.finishesAt === undefined || token.finishesAt >= line)
        );
    }
}
