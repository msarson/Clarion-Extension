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
        const scopeInfo = this.getTokenScope(document, { line: symbol.line, character: symbol.start });
        
        if (!scopeInfo) {
            return 'global';
        }

        // Map ScopeLevel to ScopeType
        switch (scopeInfo.type) {
            case 'routine':
                return 'routine-local';
            case 'procedure':
                return 'procedure-local';
            case 'module':
                return 'module-local';
            case 'global':
            default:
                return 'global';
        }
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
        // Get scope info for both locations
        const refScope = this.getTokenScope(referenceDocument, referenceLocation);
        const declScope = this.getTokenScope(declarationDocument, declarationLocation);

        if (!refScope || !declScope) {
            return false;
        }

        // Different files - check cross-file visibility rules
        if (referenceDocument.uri !== declarationDocument.uri) {
            // Rule 1: Global symbols in PROGRAM file are accessible everywhere
            if (declScope.type === 'global' && declScope.isProgramFile) {
                return true;
            }
            
            // Rule 2: Module-local symbols are NOT visible cross-file
            if (declScope.type === 'module') {
                return false;
            }
            
            // Rule 3: Procedure-local and routine-local are NEVER visible cross-file
            if (declScope.type === 'procedure' || declScope.type === 'routine') {
                return false;
            }
            
            // Default: deny cross-file access
            return false;
        }

        // Same file - check scope hierarchy
        // Global scope is accessible from anywhere
        if (declScope.type === 'global') {
            return true;
        }

        // Module-local is accessible within the same module (file)
        if (declScope.type === 'module') {
            return true; // Same file, so same module
        }

        // Procedure-local: accessible from same procedure and its routines
        if (declScope.type === 'procedure') {
            // Check if reference is in same procedure or a routine within it
            if (refScope.containingProcedure?.line === declScope.containingProcedure?.line) {
                return true;
            }
            return false;
        }

        // Routine-local: only accessible within that routine
        if (declScope.type === 'routine') {
            // Must be in the exact same routine
            if (refScope.containingRoutine?.line === declScope.containingRoutine?.line) {
                return true;
            }
            return false;
        }

        return false;
    }

    /**
     * Get all files that can see a symbol based on its scope
     * @param symbol The symbol token
     * @param declaringFile Path to file where symbol is declared
     * @returns Array of file paths that can access this symbol
     */
    async getVisibleFiles(symbol: Token, declaringFile: string): Promise<string[]> {
        // Try to get document for the declaring file to determine scope
        const document = await this.getDocumentFromUri(declaringFile);
        if (!document) {
            // Can't determine scope without document - return declaring file only
            return [declaringFile];
        }
        
        // Determine symbol scope
        const symbolScope = this.getSymbolScope(symbol, document);
        
        // Case 1: Global symbol in PROGRAM file
        if (symbolScope === 'global') {
            const scopeInfo = this.getTokenScope(document, { 
                line: symbol.line, 
                character: symbol.start 
            });
            
            if (scopeInfo?.isProgramFile) {
                // Global in PROGRAM - visible in ALL files
                if (this.solutionManager) {
                    return this.getAllProjectFiles();
                } else {
                    // No solution loaded - just declaring file
                    return [declaringFile];
                }
            }
        }
        
        // Case 2: Module-local, procedure-local, routine-local
        // These are ONLY visible in declaring file
        return [declaringFile];
    }

    /**
     * Get document from URI - attempts to use SolutionManager
     * @param uri Document URI
     * @returns TextDocument or null if not found
     */
    private async getDocumentFromUri(uri: string): Promise<TextDocument | null> {
        // Check if SolutionManager has the document
        if (this.solutionManager) {
            for (const project of this.solutionManager.solution.projects) {
                // Convert URI to file path for lookup
                const filePath = uri.replace('file:///', '').replace(/\//g, '\\');
                const doc = project.getTextDocumentByPath?.(filePath);
                if (doc) {
                    return doc;
                }
            }
        }
        
        // Without SolutionManager, we can't get documents for unopened files
        return null;
    }

    /**
     * Get all project source files from SolutionManager
     * @returns Array of file URIs
     */
    private getAllProjectFiles(): string[] {
        if (!this.solutionManager) {
            return [];
        }
        
        const allFiles: string[] = [];
        
        for (const project of this.solutionManager.solution.projects) {
            for (const sourceFile of project.sourceFiles) {
                // sourceFile.relativePath is relative to project.path
                // Need to construct full URI
                const fullPath = `${project.path}\\${sourceFile.relativePath}`;
                // Convert to URI format
                const uri = `file:///${fullPath.replace(/\\/g, '/')}`;
                allFiles.push(uri);
            }
        }
        
        return allFiles;
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
                // String token value includes the single quotes, remove them
                // Clarion only uses single quotes for strings
                return stringToken.value.replace(/^'|'$/g, '');
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
