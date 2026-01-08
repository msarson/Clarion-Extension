/**
 * SymbolFinderService - Unified symbol finding for HoverProvider and DefinitionProvider
 * 
 * Phase 2 of the refactoring (2026-01-08):
 * - Eliminates ~95% code duplication between providers
 * - Single source of truth for symbol finding logic
 * - Returns Token + metadata, not formatted output
 * - Both providers consume this service and format results
 * 
 * Architecture:
 *   SymbolFinderService (find symbols) 
 *     → HoverProvider (format as Hover)
 *     → DefinitionProvider (format as Location)
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenHelper } from '../utils/TokenHelper';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("SymbolFinderService");
logger.setLevel("info");

/**
 * Information about a found symbol
 */
export interface SymbolInfo {
    /** The token representing the symbol */
    token: Token;
    
    /** Data type (e.g., "LONG", "STRING(40)", "MyClass") */
    type: string;
    
    /** Scope where symbol was found */
    scope: {
        token: Token;
        type: 'parameter' | 'local' | 'module' | 'global' | 'routine';
    };
    
    /** Location information */
    location: {
        uri: string;
        line: number;
        character: number;
    };
    
    /** Full declaration if available (e.g., "Counter LONG,AUTO") */
    declaration?: string;
    
    /** Original search word (before any prefix stripping) */
    originalWord: string;
    
    /** Search word used to find this symbol (may be stripped) */
    searchWord: string;
}

/**
 * Options for symbol search
 */
export interface SymbolSearchOptions {
    /** Try full word before stripping prefix (Phase 1 fix) */
    searchFullWordFirst?: boolean;
    
    /** Include cross-file search (MEMBER files, global search) */
    crossFile?: boolean;
    
    /** Stop at first match or collect all matches */
    stopAtFirst?: boolean;
}

/**
 * Unified service for finding symbols in Clarion code
 */
export class SymbolFinderService {
    private symbolProvider: ClarionDocumentSymbolProvider;
    
    constructor(
        private tokenCache: TokenCache,
        private scopeAnalyzer: ScopeAnalyzer
    ) {
        this.symbolProvider = new ClarionDocumentSymbolProvider();
    }
    
    /**
     * Find a parameter in a procedure signature
     * 
     * Example: In "MyProc PROCEDURE(LONG pId, STRING pName)", find "pId" or "pName"
     */
    findParameter(
        word: string, 
        document: TextDocument, 
        scopeToken: Token
    ): SymbolInfo | null {
        logger.info(`Finding parameter: "${word}" in scope: ${scopeToken.value}`);
        
        const content = document.getText();
        const lines = content.split('\n');
        const procedureLine = lines[scopeToken.line];
        
        if (!procedureLine) {
            return null;
        }
        
        // Match PROCEDURE(...) signature
        const match = procedureLine.match(/PROCEDURE\s*\((.*?)\)/i);
        if (!match || !match[1]) {
            return null;
        }
        
        const paramString = match[1];
        const params = paramString.split(',');
        
        for (const param of params) {
            const trimmedParam = param.trim();
            // Match: [*&]? TYPE NAME [= default]
            const paramMatch = trimmedParam.match(/([*&]?\s*\w+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=.*)?$/i);
            
            if (paramMatch) {
                const type = paramMatch[1].trim();
                const paramName = paramMatch[2];
                
                if (paramName.toLowerCase() === word.toLowerCase()) {
                    logger.info(`✅ Found parameter: ${paramName} of type ${type}`);
                    
                    // Create a synthetic token for the parameter
                    const paramToken: Token = {
                        type: TokenType.Variable,
                        value: paramName,
                        line: scopeToken.line,
                        start: procedureLine.indexOf(paramName),
                        maxLabelLength: 0
                    };
                    
                    return {
                        token: paramToken,
                        type: type,
                        scope: {
                            token: scopeToken,
                            type: 'parameter'
                        },
                        location: {
                            uri: document.uri,
                            line: scopeToken.line,
                            character: paramToken.start
                        },
                        declaration: trimmedParam,
                        originalWord: word,
                        searchWord: word
                    };
                }
            }
        }
        
        logger.info(`❌ Parameter "${word}" not found`);
        return null;
    }
    
    /**
     * Find a local variable within a procedure/method
     * 
     * Uses ClarionDocumentSymbolProvider to leverage the already-parsed symbol tree.
     * This is more efficient than re-parsing tokens and handles nesting correctly.
     */
    findLocalVariable(
        word: string,
        tokens: Token[],
        scopeToken: Token,
        document: TextDocument,
        originalWord?: string
    ): SymbolInfo | null {
        logger.info(`Finding local variable: "${word}" in scope: ${scopeToken.value} at line ${scopeToken.line}`);
        
        // Get the symbol tree (pass document for better results)
        const symbols = this.symbolProvider.provideDocumentSymbols(tokens, document.uri, document);
        
        // Find the procedure/method symbol containing this scope
        const procedureSymbol = this.findProcedureContainingLine(symbols, scopeToken.line);
        if (!procedureSymbol) {
            logger.info(`❌ No procedure symbol found for scope at line ${scopeToken.line}`);
            return null;
        }
        
        logger.info(`Found procedure symbol: ${procedureSymbol.name}`);
        
        // Search for the variable in the symbol tree
        const searchText = originalWord || word;
        const varSymbol = this.findVariableInSymbol(procedureSymbol, searchText);
        
        if (!varSymbol) {
            logger.info(`❌ Variable "${searchText}" not found in procedure ${procedureSymbol.name}`);
            return null;
        }
        
        logger.info(`✅ Found variable: ${varSymbol.name} of type ${varSymbol._clarionType || varSymbol.detail}`);
        
        // Extract the variable name (without type info that may be in the name)
        // ClarionDocumentSymbolProvider may include type in the name like "Counter LONG"
        const varName = varSymbol._clarionVarName || varSymbol.name.split(' ')[0];
        
        // Find the actual token for this variable
        const variableToken = tokens.find(t =>
            t.line === varSymbol.range.start.line &&
            t.value.toLowerCase() === varName.toLowerCase()
        );
        
        if (!variableToken) {
            logger.warn(`⚠️ Found symbol but couldn't locate token for ${varName} at line ${varSymbol.range.start.line}`);
            return null;
        }
        
        return {
            token: variableToken,
            type: varSymbol._clarionType || varSymbol.detail || 'UNKNOWN',
            scope: {
                token: scopeToken,
                type: 'local'
            },
            location: {
                uri: document.uri,
                line: varSymbol.range.start.line,
                character: varSymbol.range.start.character
            },
            declaration: varSymbol._clarionDeclaration,
            originalWord: originalWord || word,
            searchWord: word
        };
    }
    
    /**
     * Find a module-level variable (declared before first PROCEDURE)
     */
    findModuleVariable(
        word: string,
        tokens: Token[],
        document: TextDocument
    ): SymbolInfo | null {
        logger.info(`Finding module variable: "${word}"`);
        
        // Find the first procedure to determine module scope boundary
        // Check for any type of procedure: GlobalProcedure, Procedure, MethodImplementation, etc.
        const firstProcToken = tokens.find(t =>
            t.subType === TokenType.Procedure ||
            t.subType === TokenType.GlobalProcedure ||
            t.subType === TokenType.MethodImplementation ||
            t.subType === TokenType.MapProcedure
        );
        
        const moduleScopeEndLine = firstProcToken ? firstProcToken.line : Number.MAX_SAFE_INTEGER;
        
        // Find variable in module scope
        const moduleVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line < moduleScopeEndLine &&
            t.value.toLowerCase() === word.toLowerCase() &&
            // Ensure it's not inside a procedure
            !this.isTokenInsideProcedure(tokens, t, moduleScopeEndLine)
        );
        
        if (!moduleVar) {
            logger.info(`❌ Module variable "${word}" not found`);
            return null;
        }
        
        logger.info(`✅ Found module variable: ${moduleVar.value} at line ${moduleVar.line}`);
        
        // Get type from next token
        const moduleIndex = tokens.indexOf(moduleVar);
        let typeInfo = 'UNKNOWN';
        let declaration: string | undefined;
        
        if (moduleIndex + 1 < tokens.length) {
            const nextToken = tokens[moduleIndex + 1];
            if (nextToken.line === moduleVar.line) {
                if (nextToken.type === TokenType.Type) {
                    typeInfo = nextToken.value;
                } else if (nextToken.type === TokenType.Structure) {
                    typeInfo = nextToken.value.toUpperCase(); // CLASS, GROUP, QUEUE
                }
                
                // Try to build full declaration
                const lineTokens = tokens.filter(t => t.line === moduleVar.line);
                declaration = lineTokens.map(t => t.value).join(' ');
            }
        }
        
        return {
            token: moduleVar,
            type: typeInfo,
            scope: {
                token: moduleVar,
                type: 'module'
            },
            location: {
                uri: document.uri,
                line: moduleVar.line,
                character: moduleVar.start
            },
            declaration: declaration,
            originalWord: word,
            searchWord: word
        };
    }
    
    /**
     * Search for a variable/symbol with full word first, then fallback to stripped prefix
     * This implements the Phase 1 fix for labels with colons (e.g., "BRW1::View:Browse")
     * 
     * Search order:
     * 1. Try full word (e.g., "BRW1::View:Browse")
     * 2. If not found and has colon, try stripped (e.g., "Browse")
     * 3. Try parameter, local, module, then global scope
     */
    async findSymbol(
        word: string,
        document: TextDocument,
        position: { line: number; character: number },
        scopeToken?: Token
    ): Promise<SymbolInfo | null> {
        const tokens = this.tokenCache.getTokens(document);
        
        logger.info(`🔍 Finding symbol: "${word}" at line ${position.line}`);
        
        // Get scope if not provided
        const currentScope = scopeToken || TokenHelper.getInnermostScopeAtLine(tokens, position.line);
        
        if (!currentScope) {
            logger.info('No scope found, checking module/global only');
            
            // Try module variable
            const moduleResult = this.findModuleVariable(word, tokens, document);
            if (moduleResult) return moduleResult;
            
            // TODO: Try global variable
            
            return null;
        }
        
        // Phase 1 fix: Try FULL word first
        logger.info(`Trying full word: "${word}"`);
        
        // 1. Try as parameter
        let result = this.findParameter(word, document, currentScope);
        if (result) {
            logger.info(`✅ Found as parameter: ${word}`);
            return result;
        }
        
        // 2. Try as local variable
        result = this.findLocalVariable(word, tokens, currentScope, document);
        if (result) {
            logger.info(`✅ Found as local variable: ${word}`);
            return result;
        }
        
        // 3. Try as module variable
        result = this.findModuleVariable(word, tokens, document);
        if (result) {
            logger.info(`✅ Found as module variable: ${word}`);
            return result;
        }
        
        // If not found and word has colon, try with stripped prefix
        const colonIndex = word.lastIndexOf(':');
        if (colonIndex > 0) {
            const searchWord = word.substring(colonIndex + 1);
            logger.info(`Full word not found, trying stripped: "${searchWord}"`);
            
            // Try parameter with stripped word
            result = this.findParameter(searchWord, document, currentScope);
            if (result) {
                logger.info(`✅ Found as parameter (stripped): ${searchWord}`);
                result.originalWord = word; // Keep original word
                return result;
            }
            
            // Try local variable with stripped word
            result = this.findLocalVariable(searchWord, tokens, currentScope, document, word);
            if (result) {
                logger.info(`✅ Found as local variable (stripped): ${searchWord}`);
                return result;
            }
            
            // Try module variable with stripped word
            result = this.findModuleVariable(searchWord, tokens, document);
            if (result) {
                logger.info(`✅ Found as module variable (stripped): ${searchWord}`);
                result.originalWord = word;
                return result;
            }
        }
        
        logger.info(`❌ Symbol "${word}" not found`);
        return null;
    }
    
    /**
     * Check if a token is inside a procedure
     */
    private isTokenInsideProcedure(tokens: Token[], token: Token, beforeLine: number): boolean {
        // Find if there's a procedure token before this token that hasn't finished yet
        for (const t of tokens) {
            // Only check procedure tokens (all types)
            if (t.subType !== TokenType.Procedure &&
                t.subType !== TokenType.GlobalProcedure &&
                t.subType !== TokenType.MethodImplementation &&
                t.subType !== TokenType.MapProcedure) {
                continue;
            }
            
            // Skip procedures that start after our token
            if (t.line >= token.line) continue;
            
            // Skip procedures that are after the beforeLine boundary
            if (t.line >= beforeLine) continue;
            
            // Check if this procedure contains our token
            // A procedure contains a token if:
            // 1. Procedure starts before the token
            // 2. Procedure finishes after the token (or hasn't finished yet)
            if (t.line < token.line) {
                // If finishesAt is defined and >= token line, it contains it
                if (t.finishesAt !== undefined && t.finishesAt >= token.line) {
                    return true;
                }
                // If finishesAt is undefined, assume procedure extends to end of file
                // (or until we find another procedure)
                if (t.finishesAt === undefined) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Find the procedure symbol that contains the given line
     */
    private findProcedureContainingLine(
        symbols: ClarionDocumentSymbol[],
        line: number
    ): ClarionDocumentSymbol | null {
        for (const symbol of symbols) {
            // Check if this is a procedure/method and contains the line
            if ((symbol.kind === 12 || symbol.kind === 6) && // Function or Method
                symbol.range.start.line <= line &&
                symbol.range.end.line >= line) {
                return symbol;
            }
            
            // Recursively search children
            if (symbol.children) {
                const found = this.findProcedureContainingLine(symbol.children, line);
                if (found) {
                    return found;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Find a variable within a symbol (recursively searches children)
     */
    private findVariableInSymbol(
        symbol: ClarionDocumentSymbol,
        searchText: string
    ): ClarionDocumentSymbol | null {
        // Check direct children
        if (symbol.children) {
            for (const child of symbol.children) {
                
                // Match on name (case-insensitive)
                if (child.name.toLowerCase() === searchText.toLowerCase()) {
                    return child;
                }
                
                // Also check _clarionVarName if present (handles prefixed variables)
                if (child._clarionVarName?.toLowerCase() === searchText.toLowerCase()) {
                    return child;
                }
                
                // Handle GROUP/QUEUE/CLASS with format "GROUP (VarName)" or "GROUP,PRE(XXX)"
                const groupMatch = child.name.match(/^(?:GROUP|QUEUE|CLASS)\s*\(([^)]+)\)/i);
                if (groupMatch && groupMatch[1].toLowerCase() === searchText.toLowerCase()) {
                    return child;
                }
                
                // Check possible references (for structure fields with prefixes)
                if (child._possibleReferences) {
                    for (const ref of child._possibleReferences) {
                        if (ref.toLowerCase() === searchText.toLowerCase()) {
                            return child;
                        }
                    }
                }
                
                // Recursively search nested children (for nested structures)
                if (child.children) {
                    const found = this.findVariableInSymbol(child, searchText);
                    if (found) {
                        return found;
                    }
                }
            }
        }
        
        return null;
    }
}
