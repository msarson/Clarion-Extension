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
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("SymbolFinderService");
logger.setLevel("error");

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
        type: 'parameter' | 'local' | 'module' | 'global' | 'routine' | 'field';
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
 * A located type declaration returned by the StructureDeclarationIndexer.
 * Intentionally small — callers format their own output from this.
 */
export interface IndexedTypeInfo {
    name: string;
    filePath: string;
    /** 0-based line number */
    line: number;
    structureType: string;
    parentName?: string;
    isType: boolean;
    lineContent: string;
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
     * Extract display type string from the token after a variable label.
     * Handles QUEUE(TypeName), GROUP(TypeName), CLASS(TypeName) as well as plain types.
     */
    public static extractTypeInfo(labelToken: Token, tokens: Token[]): string {
        // 🚀 PERF: build line tokens once — avoids O(n) indexOf + multiple O(n) filter passes
        const lineTokens = tokens.filter(t => t.line === labelToken.line);
        const idx = lineTokens.indexOf(labelToken);
        if (idx + 1 >= lineTokens.length) return 'UNKNOWN';
        const next = lineTokens[idx + 1];

        if (next.type === TokenType.Type) return next.value;
        if (next.type === TokenType.Variable || next.type === TokenType.Label) return next.value;
        if (next.type === TokenType.ReferenceVariable) {
            // &TypeName — strip leading '&'
            return next.value.startsWith('&') ? next.value.substring(1) : next.value;
        }
        if (next.type === TokenType.Structure) {
            // Look for type arg: QUEUE(TypeName) → "QUEUE(TypeName)"
            const afterNext = lineTokens.filter(t => t.start > next.start);
            const typeArg = afterNext.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value !== '(' && t.value !== ')'
            );
            return typeArg ? `${next.value.toUpperCase()}(${typeArg.value})` : next.value.toUpperCase();
        }
        if (next.type === TokenType.TypeReference) {
            // LIKE(TypeName) → "LIKE(TypeName)"
            const afterNext = lineTokens.filter(t => t.start > next.start);
            const typeArg = afterNext.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value !== '(' && t.value !== ')'
            );
            return typeArg ? `LIKE(${typeArg.value})` : 'LIKE';
        }
        if (next.type === TokenType.Procedure || next.type === TokenType.Keyword) {
            // PROCEDURE, ROUTINE, FUNCTION — return the keyword as the type
            const upper = next.value.toUpperCase();
            if (upper === 'PROCEDURE' || upper === 'ROUTINE' || upper === 'FUNCTION') return upper;
        }
        return 'UNKNOWN';
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
            // Strip optional-parameter angle brackets: <Key K> → Key K
            const stripped = trimmedParam.replace(/^<(.*)>$/, '$1').trim();
            // Match: [*&]? TYPE NAME [= default]
            // NAME may be a prefixed identifier: PREFIX:Name (e.g. LOC:test)
            const paramMatch = stripped.match(/([*&]?\s*\w+)\s+([A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?)(?:\s*=.*)?$/i);
            
            if (paramMatch) {
                const type = paramMatch[1].trim();
                const paramName = paramMatch[2];
                
                // Match exact name (LOC:test === LOC:test) or bare suffix (test matches LOC:test)
                const paramLower = paramName.toLowerCase();
                const wordLower = word.toLowerCase();
                const isMatch = paramLower === wordLower ||
                    paramLower.endsWith(':' + wordLower);
                
                if (isMatch) {
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
                        declaration: stripped,
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
            logger.info(`❌ No procedure symbol found for scope at line ${scopeToken.line} — falling back to token scan`);
        }
        
        // Search for the variable in the symbol tree (if we have a procedure symbol)
        const searchText = originalWord || word;
        const varSymbol = procedureSymbol ? this.findVariableInSymbol(procedureSymbol, searchText) : null;
        
        if (!varSymbol) {
            logger.info(`❌ Variable "${searchText}" not found in symbol tree — falling back to token scan`);

            // Fallback: scan tokens directly for a Label token at the start of a line (column 0)
            // within the procedure's scope. This catches variables whose symbol names don't match
            // (e.g. QUEUE/GROUP/FILE structures where the symbol name is "QUEUE" not "QZipF"),
            // and also when the symbol provider returns no symbols (e.g. local CLASS declarations).
            // Column 0 check ensures we only match declarations, not usage sites.
            const scopeStart = scopeToken.line;
            const scopeEnd = scopeToken.finishesAt ?? Number.MAX_SAFE_INTEGER;
            const wordLower = searchText.toLowerCase();
            const labelToken = tokens.find(t =>
                t.line >= scopeStart && t.line <= scopeEnd &&
                t.start === 0 &&
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value.toLowerCase() === wordLower
            );
            if (labelToken) {
                // Skip MAP/global procedure declarations — these are handled by
                // findProcedureDeclaration (step 5) with the correct scope and type.
                const isProcDecl = tokens.some(t =>
                    t.line === labelToken.line &&
                    t.type === TokenType.Procedure &&
                    (t.subType === TokenType.MapProcedure ||
                     t.subType === TokenType.GlobalProcedure ||
                     t.subType === TokenType.MethodDeclaration)
                );
                if (!isProcDecl) {
                    logger.info(`✅ Found "${searchText}" via token fallback at line ${labelToken.line}`);
                    return {
                        token: labelToken,
                        type: SymbolFinderService.extractTypeInfo(labelToken, tokens),
                        scope: { token: scopeToken, type: 'local' },
                        location: { uri: document.uri, line: labelToken.line, character: labelToken.start },
                        originalWord: originalWord || word,
                        searchWord: word
                    };
                }
            }

            // If the current scope is a ROUTINE, also search the parent procedure's data section.
            // Per Clarion rules, a ROUTINE can access all variables declared in its containing
            // procedure's local data section (the area between PROCEDURE and CODE).
            if (scopeToken.subType === TokenType.Routine) {
                const parentProc = TokenHelper.getParentScopeOfRoutine(tokens, scopeToken);
                if (parentProc) {
                    // Search up to the parent procedure's CODE marker (data section only),
                    // or up to just before this ROUTINE if no explicit CODE marker exists.
                    const dataEnd = parentProc.executionMarker
                        ? parentProc.executionMarker.line - 1
                        : scopeToken.line - 1;
                    const found = tokens.find(t =>
                        t.line > parentProc.line && t.line <= dataEnd &&
                        t.start === 0 &&
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.value.toLowerCase() === wordLower
                    );
                    if (found) {
                        const isProcDecl = tokens.some(t =>
                            t.line === found.line &&
                            t.type === TokenType.Procedure &&
                            (t.subType === TokenType.MapProcedure ||
                             t.subType === TokenType.GlobalProcedure ||
                             t.subType === TokenType.MethodDeclaration)
                        );
                        if (!isProcDecl) {
                            logger.info(`✅ Found "${searchText}" in parent procedure data section at line ${found.line}`);
                            return {
                                token: found,
                                type: SymbolFinderService.extractTypeInfo(found, tokens),
                                scope: { token: parentProc, type: 'local' },
                                location: { uri: document.uri, line: found.line, character: found.start },
                                originalWord: originalWord || word,
                                searchWord: word
                            };
                        }
                    }
                }
            }

            // If the current scope is a method implementation, the class was declared inside
            // a GlobalProcedure whose locals are shared with the method. Search all GlobalProcedure
            // data sections (before their CODE line) for the variable.
            if (scopeToken.subType === TokenType.MethodImplementation) {
                logger.info(`Scope is MethodImplementation — searching GlobalProcedure scopes for "${searchText}"`);
                const globalProcs = tokens.filter(t =>
                    t.type === TokenType.Procedure &&
                    t.subType === TokenType.GlobalProcedure
                );
                for (const gp of globalProcs) {
                    // Check parameters of the outer procedure first
                    const paramResult = this.findParameter(word, document, gp);
                    if (paramResult) {
                        logger.info(`✅ Found "${searchText}" as parameter of outer GlobalProcedure at line ${gp.line}`);
                        return paramResult;
                    }

                    const gpStart = gp.line;
                    const gpEnd = gp.finishesAt ?? Number.MAX_SAFE_INTEGER;
                    const found = tokens.find(t =>
                        t.line >= gpStart && t.line <= gpEnd &&
                        t.start === 0 &&
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.value.toLowerCase() === wordLower
                    );
                    if (found) {
                        // Skip MAP/global procedure declarations — they are not local variables
                        const isProcDecl = tokens.some(t =>
                            t.line === found.line &&
                            t.type === TokenType.Procedure &&
                            (t.subType === TokenType.MapProcedure ||
                             t.subType === TokenType.GlobalProcedure ||
                             t.subType === TokenType.MethodDeclaration)
                        );
                        if (isProcDecl) continue;

                        logger.info(`✅ Found "${searchText}" in GlobalProcedure scope at line ${found.line}`);
                        return {
                            token: found,
                            type: SymbolFinderService.extractTypeInfo(found, tokens),
                            scope: { token: gp, type: 'local' },
                            location: { uri: document.uri, line: found.line, character: found.start },
                            originalWord: originalWord || word,
                            searchWord: word
                        };
                    }
                }
            }

            return null;
        }
        
        // Skip MAP procedure and method declarations — these are handled by findProcedureDeclaration
        // (step 5) with the correct scope/type. Without this guard the symbol tree would return
        // them with type='()' (the signature detail) instead of 'PROCEDURE', causing isLocalProcDecl
        // to be false and FAR to restrict its search to the outer procedure's narrow finishesAt range.
        if (varSymbol._isMapProcedure || varSymbol._isMethodDeclaration) {
            logger.info(`⏭️ "${searchText}" is a MAP/method declaration — deferring to findProcedureDeclaration`);
            return null;
        }

        logger.info(`✅ Found variable: ${varSymbol.name} of type ${varSymbol._clarionType || varSymbol.detail}`);
        
        // Extract the variable name (without type info that may be in the name).
        // ClarionDocumentSymbolProvider may encode CLASS/GROUP/QUEUE declarations as
        // "CLASS (LabelName)" — in that case the label lives inside the parens, not
        // before the first space.  Fall back to split(' ')[0] for plain "VarName TYPE".
        const structureNameMatch = varSymbol.name.match(/^(?:GROUP|QUEUE|CLASS)\s*\(([^)]+)\)/i);
        const varName = varSymbol._clarionVarName
            || (structureNameMatch ? structureNameMatch[1] : varSymbol.name.split(' ')[0]);
        
        // Find the actual token for this variable
        const variableToken = tokens.find(t =>
            t.line === varSymbol.range.start.line &&
            t.value.toLowerCase() === varName.toLowerCase()
        );
        
        if (!variableToken) {
            logger.warn(`⚠️ Found symbol but couldn't locate token for ${varName} at line ${varSymbol.range.start.line}`);
            return null;
        }
        
        // If the current scope is a ROUTINE but the found variable is in the parent
        // procedure's data section (before the ROUTINE), use the parent procedure as
        // the effective scope so FAR searches the entire procedure range, not just
        // the ROUTINE's range.
        let effectiveScopeToken = scopeToken;
        if (scopeToken.subType === TokenType.Routine && varSymbol.range.start.line < scopeToken.line) {
            const parentProc = TokenHelper.getParentScopeOfRoutine(tokens, scopeToken);
            if (parentProc) {
                effectiveScopeToken = parentProc;
            }
        }

        return {
            token: variableToken,
            type: varSymbol._clarionType || varSymbol.detail
                || SymbolFinderService.extractTypeInfo(variableToken, tokens),
            scope: {
                token: effectiveScopeToken,
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
        
        // Find the first PROCEDURE implementation (not MAP/CLASS declaration).
        // The PROCEDURE keyword carries the subType (GlobalProcedure/MethodImplementation),
        // but the label before it is at start=0 — so we match by subType on the keyword itself,
        // without requiring start===0 (which is only true for the label, not the keyword).
        const firstProcToken = tokens.find(t =>
            (t.subType === TokenType.GlobalProcedure ||
             t.subType === TokenType.MethodImplementation) &&
            t.value.toUpperCase() === 'PROCEDURE'
        );
        
        const moduleScopeEndLine = firstProcToken ? firstProcToken.line : Number.MAX_SAFE_INTEGER;
        
        // Find variable in module scope (exclude structure fields which have a parent token)
        const candidateVars = tokens.filter(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.parent === undefined &&
            t.line < moduleScopeEndLine &&
            t.value.toLowerCase() === word.toLowerCase()
        );
        
        const moduleVar = candidateVars.find(t => 
            !this.isTokenInsideProcedure(tokens, t, moduleScopeEndLine)
        );
        
        if (!moduleVar) {
            return null;
        }
        
        logger.info(`✅ Found module variable: ${moduleVar.value} at line ${moduleVar.line}`);
        
        const typeInfo = SymbolFinderService.extractTypeInfo(moduleVar, tokens);
        const lineTokens = tokens.filter(t => t.line === moduleVar.line);
        const declaration = lineTokens.map(t => t.value).join(' ');
        
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
     * Find a structure field or sub-structure accessed via PRE:Field notation.
     * e.g. "IBSDataSets:Record" → prefix="IBSDataSets", fieldName="Record"
     * Finds the structure with structurePrefix="IBSDataSets" and returns scope='field'
     * so FAR only matches IBSDataSets:Record tokens (not bare "Record").
     */
    private async findPrefixedField(word: string, tokens: Token[], document: TextDocument): Promise<SymbolInfo | null> {
        const colonIndex = word.indexOf(':');
        if (colonIndex <= 0) return null;

        const prefixUpper = word.substring(0, colonIndex).toUpperCase();
        const fieldName = word.substring(colonIndex + 1); // preserve original case

        // Search current file
        const result = this.findPrefixedFieldInTokens(prefixUpper, fieldName, tokens, document.uri);
        if (result) return result;

        // If MEMBER file, search the parent PROGRAM file
        const memberToken = tokens.find(t =>
            t.value && t.value.toUpperCase() === 'MEMBER' &&
            t.line < 5 &&
            t.referencedFile
        );
        if (memberToken?.referencedFile) {
            try {
                const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '').replace(/\//g, '\\'));
                const resolvedPath = path.resolve(path.dirname(currentFilePath), memberToken.referencedFile);
                if (fs.existsSync(resolvedPath)) {
                    const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
                    const parentDoc = TextDocument.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, 'clarion', 1, parentContents);
                    const parentTokens = this.tokenCache.getTokens(parentDoc);
                    const parentResult = this.findPrefixedFieldInTokens(prefixUpper, fieldName, parentTokens, parentDoc.uri);
                    if (parentResult) return parentResult;
                }
            } catch (err) {
                logger.error(`Error reading MEMBER parent file for prefixed field: ${err}`);
            }
        }

        return null;
    }

    private findPrefixedFieldInTokens(prefixUpper: string, fieldName: string, tokens: Token[], uri: string): SymbolInfo | null {
        const fieldNameUpper = fieldName.toUpperCase();

        // Find structure with matching structurePrefix (e.g. FILE,PRE(IBSDataSets))
        const structureToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.structurePrefix?.toUpperCase() === prefixUpper
        );
        if (!structureToken) return null;

        // Find child token within the structure's range
        const childToken = tokens.find(t => {
            if (t.line <= structureToken.line) return false;
            if (structureToken.finishesAt !== undefined && t.line > structureToken.finishesAt) return false;
            // Label at col 0 with matching value (e.g. a field named "Record")
            if (t.type === TokenType.Label && t.start === 0 && t.value.toUpperCase() === fieldNameUpper) return true;
            // Sub-structure with matching label (e.g. "Record  RECORD" → label="Record")
            if (t.type === TokenType.Structure && t.label?.toUpperCase() === fieldNameUpper) return true;
            return false;
        });

        // Determine the field name value to use as searchWord — preserves original casing
        const resolvedName = childToken
            ? (childToken.type === TokenType.Structure ? (childToken.label ?? fieldName) : childToken.value)
            : fieldName;
        const targetToken = childToken ?? structureToken;

        // Synthetic token so token.value = fieldName (FAR uses token.value as searchWord)
        const syntheticToken: Token = {
            type: TokenType.Label,
            value: resolvedName,
            line: targetToken.line,
            start: targetToken.start,
            maxLabelLength: 0
        };

        logger.info(`✅ Found PRE:Field "${prefixUpper}:${fieldName}" — structure "${structureToken.label ?? structureToken.value}" at line ${targetToken.line} in ${uri}`);

        return {
            token: syntheticToken,
            type: 'field',
            scope: {
                token: structureToken, // structurePrefix used by collectFieldPrefixes
                type: 'field'
            },
            location: { uri, line: targetToken.line, character: targetToken.start },
            declaration: `${structureToken.label ?? structureToken.value} PRE(${prefixUpper})`,
            originalWord: `${prefixUpper}:${fieldName}`,
            searchWord: resolvedName
        };
    }

    /**
     * Find a structure field declaration — a col-0 Label whose parent token is a Structure (QUEUE, GROUP, CLASS, FILE).
     * Used when the cursor is on a field declaration line inside a structure definition.
     */
    findStructureField(word: string, tokens: Token[], line: number, document: TextDocument): SymbolInfo | null {
        const fieldToken = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line === line &&
            t.parent !== undefined &&
            t.parent.type === TokenType.Structure &&
            t.value.toLowerCase() === word.toLowerCase()
        );

        if (!fieldToken) {
            return null;
        }

        logger.info(`✅ Found structure field: ${fieldToken.value} at line ${fieldToken.line} (parent: ${fieldToken.parent!.value})`);

        const lineTokens = tokens.filter(t => t.line === fieldToken.line);
        const declaration = lineTokens.map(t => t.value).join(' ');

        return {
            token: fieldToken,
            type: 'field',
            scope: {
                token: fieldToken.parent!,
                type: 'field'
            },
            location: {
                uri: document.uri,
                line: fieldToken.line,
                character: fieldToken.start
            },
            declaration,
            originalWord: word,
            searchWord: word
        };
    }

    /**
     * Find a global variable definition
     * 
     * Global variables are declared at the start of a PROGRAM file, before the first CODE section.
     * 
     * Search strategy (follows Clarion's MEMBER architecture):
     * 1. Search current file (before first CODE)
     * 2. If current file has MEMBER('file.clw'), search that parent file
     * 3. Return null if not found
     * 
     * Note: MEMBER files can only reference ONE parent PROGRAM file, so max 2 files searched.
     * 
     * @param word - The variable name to find
     * @param tokens - Tokens of current document
     * @param document - Current document
     * @returns SymbolInfo if found, null otherwise
     */
    async findGlobalVariable(word: string, tokens: Token[], document: TextDocument): Promise<SymbolInfo | null> {
        logger.info(`🔍 findGlobalVariable: searching for "${word}"`);
        
        // Step 1: Search current file for global variable (before first CODE/PROCEDURE)
        const firstCodeToken = tokens.find(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'CODE'
        );
        
        // If no CODE found, look for first PROCEDURE as the boundary
        const firstProcedure = tokens.find(t =>
            t.subType === TokenType.Procedure ||
            t.subType === TokenType.GlobalProcedure
        );
        
        // Global scope ends at first CODE, or first PROCEDURE if no CODE found
        let globalScopeEndLine: number;
        if (firstCodeToken) {
            globalScopeEndLine = firstCodeToken.line;
            logger.info(`First CODE token at line: ${globalScopeEndLine}`);
        } else if (firstProcedure) {
            globalScopeEndLine = firstProcedure.line;
            logger.info(`No CODE token, using first PROCEDURE at line: ${globalScopeEndLine}`);
        } else {
            globalScopeEndLine = Number.MAX_SAFE_INTEGER;
            logger.info(`No CODE or PROCEDURE tokens, treating entire file as global scope`);
        }
        
        const globalVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.parent === undefined &&
            t.line < globalScopeEndLine &&
            t.value.toLowerCase() === word.toLowerCase()
        );
        
        if (globalVar) {
            logger.info(`✅ Found global variable in current file: ${globalVar.value} at line ${globalVar.line} (< ${globalScopeEndLine})`);
            
            const typeInfo = SymbolFinderService.extractTypeInfo(globalVar, tokens);
            const lineTokens = tokens.filter(t => t.line === globalVar.line);
            const declaration = lineTokens.map(t => t.value).join(' ');
            
            return {
                token: globalVar,
                type: typeInfo,
                scope: {
                    token: globalVar,
                    type: 'global'
                },
                location: {
                    uri: document.uri,
                    line: globalVar.line,
                    character: globalVar.start
                },
                declaration: declaration,
                originalWord: word,
                searchWord: word
            };
        }
        
        // Step 2: If not found and current file has MEMBER token, search parent file
        const memberToken = tokens.find(t => 
            t.value && t.value.toUpperCase() === 'MEMBER' && 
            t.line < 5 && 
            t.referencedFile
        );
        
        if (memberToken && memberToken.referencedFile) {
            logger.info(`Found MEMBER reference to: ${memberToken.referencedFile}`);
            const parentResult = await this.findGlobalVariableInParentFile(word, memberToken.referencedFile, document);
            if (parentResult) return parentResult;
            // Fall through to equates.clw check
        }
        
        logger.info(`❌ Global variable "${word}" not found in current file or parent`);

        // Step 3: Check equates.clw — implicitly in global scope for all Clarion programs
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            const equatesTokens = solutionManager.getEquatesTokens();
            const equatesPath = solutionManager.getEquatesPath();
            if (equatesTokens && equatesTokens.length > 0 && equatesPath) {
                const equatesVar = equatesTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === word.toLowerCase()
                );
                if (equatesVar) {
                    logger.info(`✅ Found "${word}" in equates.clw at line ${equatesVar.line}`);
                    const typeInfo = SymbolFinderService.extractTypeInfo(equatesVar, equatesTokens);
                    const lineTokens = equatesTokens.filter(t => t.line === equatesVar.line);
                    const declaration = lineTokens.map(t => t.value).join(' ');
                    const equatesUri = `file:///${equatesPath.replace(/\\/g, '/')}`;
                    return {
                        token: equatesVar,
                        type: typeInfo,
                        scope: { token: equatesVar, type: 'global' },
                        location: { uri: equatesUri, line: equatesVar.line, character: equatesVar.start },
                        declaration,
                        originalWord: word,
                        searchWord: word
                    };
                }
            }
        }

        return null;
    }
    
    /**
     * Helper: Find global variable in MEMBER parent file
     * 
     * @param word - Variable name to find
     * @param parentFile - Relative path to parent file (from MEMBER token)
     * @param currentDocument - Current document (to resolve relative path)
     * @returns SymbolInfo if found, null otherwise
     */
    private async findGlobalVariableInParentFile(word: string, parentFile: string, currentDocument: TextDocument): Promise<SymbolInfo | null> {
        const currentFilePath = decodeURIComponent(currentDocument.uri.replace('file:///', ''));
        const currentFileDir = path.dirname(currentFilePath);
        const resolvedPath = path.resolve(currentFileDir, parentFile);
        
        logger.info(`Searching parent file: ${resolvedPath}`);
        
        if (!fs.existsSync(resolvedPath)) {
            logger.warn(`Parent file not found: ${resolvedPath}`);
            return null;
        }
        
        try {
            const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
            const parentDoc = TextDocument.create(
                `file:///${resolvedPath.replace(/\\/g, '/')}`,
                'clarion',
                1,
                parentContents
            );
            const parentTokens = this.tokenCache.getTokens(parentDoc);
            
            const firstCodeToken = parentTokens.find(t => 
                t.type === TokenType.Keyword && 
                t.value.toUpperCase() === 'CODE'
            );
            
            // If no CODE found, look for first PROCEDURE as the boundary
            const firstProcedure = parentTokens.find(t =>
                t.subType === TokenType.Procedure ||
                t.subType === TokenType.GlobalProcedure
            );
            
            // Global scope ends at first CODE, or first PROCEDURE if no CODE found
            const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : 
                                      firstProcedure ? firstProcedure.line :
                                      Number.MAX_SAFE_INTEGER;
            
            const globalVar = parentTokens.find(t =>
                t.type === TokenType.Label &&
                t.start === 0 &&
                t.line < globalScopeEndLine &&
                t.value.toLowerCase() === word.toLowerCase()
            );
            
            if (globalVar) {
                logger.info(`✅ Found global variable in MEMBER parent: ${globalVar.value} at line ${globalVar.line}`);
                
                const typeInfo = SymbolFinderService.extractTypeInfo(globalVar, parentTokens);
                const lineTokens = parentTokens.filter(t => t.line === globalVar.line);
                const declaration = lineTokens.map(t => t.value).join(' ');
                
                return {
                    token: globalVar,
                    type: typeInfo,
                    scope: {
                        token: globalVar,
                        type: 'global'
                    },
                    location: {
                        uri: parentDoc.uri,
                        line: globalVar.line,
                        character: globalVar.start
                    },
                    declaration: declaration,
                    originalWord: word,
                    searchWord: word
                };
            }
            
            logger.info(`❌ Global variable "${word}" not found in parent file`);
            return null;
            
        } catch (err) {
            logger.error(`Error reading MEMBER parent file: ${err}`);
            return null;
        }
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
            
            // Try global variable
            const globalResult = await this.findGlobalVariable(word, tokens, document);
            if (globalResult) return globalResult;

            // Try structure field (col-0 Label with a parent Structure token, e.g. queue/group fields in INC)
            const fieldResult = this.findStructureField(word, tokens, position.line, document);
            if (fieldResult) return fieldResult;
            
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
        
        // 4. Try as global variable
        result = await this.findGlobalVariable(word, tokens, document);
        if (result) {
            logger.info(`✅ Found as global variable: ${word}`);
            return result;
        }
        
        // If not found and word has colon, first try to resolve as PRE:Field notation.
        // e.g. "IBSDataSets:Record" → find structure with structurePrefix="IBSDataSets",
        // return scope='field' so FAR only matches IBSDataSets:Record tokens (not bare "Record").
        const colonIdx = word.indexOf(':');
        if (colonIdx > 0) {
            const prefixedResult = await this.findPrefixedField(word, tokens, document);
            if (prefixedResult) {
                logger.info(`✅ Found as prefixed field (PRE:Field): ${word}`);
                return prefixedResult;
            }
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
            
            // Try global variable with stripped word
            result = await this.findGlobalVariable(searchWord, tokens, document);
            if (result) {
                logger.info(`✅ Found as global variable (stripped): ${searchWord}`);
                result.originalWord = word;
                return result;
            }
        }
        
        // 5. Try as procedure declaration (MAP or global PROCEDURE)
        result = this.findProcedureDeclaration(word, tokens, document);
        if (result) {
            logger.info(`✅ Found as procedure declaration: ${word}`);
            return result;
        }

        logger.info(`❌ Symbol "${word}" not found`);
        return null;
    }

    /**
     * Find a MAP or global procedure declaration by name.
     * 
     * Determines scope based on where the MAP declaration lives:
     * - Inside a GlobalProcedure or MethodImplementation → local MAP → scope='local'
     *   (callable only within that procedure and methods of locally-defined classes;
     *    FAR searches the current file with no line-range restriction)
     * - At module level in a MEMBER file → module MAP → scope='module'
     *   (available only within this MEMBER module; FAR searches current file only)
     * - At module level in a PROGRAM file → global MAP → scope='global'
     *   (available throughout the program; FAR searches all project files)
     */
    findProcedureDeclaration(word: string, tokens: Token[], document: TextDocument): SymbolInfo | null {
        const wordLower = word.toLowerCase();
        const procToken = tokens.find(t =>
            t.type === TokenType.Procedure &&
            (t.subType === TokenType.MapProcedure || t.subType === TokenType.GlobalProcedure) &&
            t.label?.toLowerCase() === wordLower
        );
        if (!procToken) return null;

        const labelToken = tokens.find(t =>
            t.line === procToken.line &&
            t.start === 0 &&
            t.type === TokenType.Label &&
            t.value.toLowerCase() === wordLower
        );
        if (!labelToken) return null;

        // Find the innermost containing procedure scope (MethodImplementation or GlobalProcedure)
        const containingScope = tokens
            .filter(t =>
                t.type === TokenType.Procedure &&
                (t.subType === TokenType.GlobalProcedure || t.subType === TokenType.MethodImplementation) &&
                t.line < procToken.line &&
                (t.finishesAt === undefined || t.finishesAt >= procToken.line)
            )
            .sort((a, b) => b.line - a.line)[0]; // innermost = latest start before declaration

        let scopeType: SymbolInfo['scope']['type'];
        let scopeToken: Token;
        if (containingScope) {
            // MAP is inside a procedure → local MAP
            scopeType = 'local';
            scopeToken = containingScope;
        } else {
            // MAP is at module level — global if PROGRAM file, module if MEMBER file
            const isMember = tokens.some(t =>
                t.type === TokenType.ClarionDocument &&
                t.value.toUpperCase() === 'MEMBER'
            );
            scopeType = isMember ? 'module' : 'global';
            scopeToken = labelToken;
        }

        logger.info(`✅ Found procedure declaration "${word}" at line ${labelToken.line} scope=${scopeType}`);
        return {
            token: labelToken,
            type: 'PROCEDURE',
            scope: { token: scopeToken, type: scopeType },
            location: { uri: document.uri, line: labelToken.line, character: labelToken.start },
            originalWord: word,
            searchWord: word
        };
    }

    /**
     * Look up a named type (CLASS, INTERFACE, QUEUE, GROUP, etc.) in the
     * StructureDeclarationIndexer for the document's owning project.
     *
     * This is the single source of truth for SDI-based type resolution.
     * Callers (DefinitionProvider, HoverProvider) apply their own post-filters
     * (e.g. IncludeVerifier) and format the result for their own output.
     *
     * @returns IndexedTypeInfo for the first matching declaration, or null.
     */
    async findIndexedTypeDeclaration(word: string, document: TextDocument): Promise<IndexedTypeInfo | null> {
        try {
            const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            const solutionManager = SolutionManager.getInstance();
            const projectPath = solutionManager?.getProjectPathForFile(fromPath) ?? path.dirname(fromPath);

            const sdi = StructureDeclarationIndexer.getInstance();
            await sdi.getOrBuildIndex(projectPath);
            let definitions = sdi.find(word, projectPath);
            if (definitions.length === 0) {
                // Key mismatch guard: the runtime project path may differ from the pre-build path
                // (e.g. different drive letter case, wrong project matched by basename).
                // Fall back to searching ALL available indexes before giving up.
                definitions = sdi.find(word);
            }
            if (definitions.length === 0) return null;

            const def = definitions[0];
            return {
                name: def.name,
                filePath: def.filePath,
                line: def.line,
                structureType: def.structureType,
                parentName: def.parentName,
                isType: def.isType,
                lineContent: def.lineContent
            };
        } catch (e) {
            logger.error(`findIndexedTypeDeclaration error for "${word}": ${e}`);
            return null;
        }
    }

    /**
     * Check if a token is inside a procedure
     */
    private isTokenInsideProcedure(tokens: Token[], token: Token, beforeLine: number): boolean {
        // Find if there's a procedure implementation before this token that hasn't finished yet
        // Only check Procedure, GlobalProcedure, and MethodImplementation
        // MapProcedure tokens are declarations inside MAP blocks, not implementations
        for (const t of tokens) {
            if (t.subType !== TokenType.Procedure &&
                t.subType !== TokenType.GlobalProcedure &&
                t.subType !== TokenType.MethodImplementation) {
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
