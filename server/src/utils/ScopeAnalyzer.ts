import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { Token } from '../Token';

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
        return null;
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
}
