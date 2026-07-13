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
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { ScopeResolver } from '../scope/ScopeResolver';
import { SolutionManager } from '../solution/solutionManager';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { StructureDeclarationIndexer, scanSourceForDeclarations, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { cooperativeCheckpoint, makeTimeSlicer } from '../utils/cooperativeScan';
import { ReferenceCountIndex } from './ReferenceCountIndex';
import { pathToCanonicalUri } from '../utils/UriUtils';
import { resolveViaProjectRedirection as resolveViaProjectRedirection328 } from '../utils/RedirectionResolution';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("SymbolFinderService");

// ─── #344: include-chain global-name index ──────────────────────────────
// One walk per host file instead of one walk per unresolved name (#334's
// original shape cost 74s on a real 43-project solution's undeclared-variable
// pass). TTL-bounded; evicted wholesale by the #340 watched-files handler.
interface ChainDeclInfo { uri: string; line: number; character: number; }
interface ChainIndexEntry { builtAt: number; hostText: string; names: Map<string, ChainDeclInfo>; }
const includeChainIndexCache = new Map<string, ChainIndexEntry>();
interface SiblingIndexEntry { builtAt: number; fingerprint: string; names: Map<string, string[]>; }
const siblingLabelIndexCache = new Map<string, SiblingIndexEntry>();
const CHAIN_INDEX_TTL_MS = 30_000;
let chainIndexBuildCount = 0;

/** Test observability — number of chain-index builds since process start. */
export function getChainIndexBuildCount(): number {
    return chainIndexBuildCount;
}

/** #340/#344 — external file changes can invalidate any chain; evict wholesale. */
export function evictIncludeChainIndexes(): void {
    includeChainIndexCache.clear();
    siblingLabelIndexCache.clear(); // #345 phase 3
}

// #345 — per-tier cost attribution for callers that run many findSymbol walks
// (undeclaredVar augment). Read+reset around a batch to see where time went.
export interface SymbolFinderPerfStats {
    globalCalls: number; globalMs: number;
    siblingCalls: number; siblingMs: number;
}
const sfPerfStats: SymbolFinderPerfStats = { globalCalls: 0, globalMs: 0, siblingCalls: 0, siblingMs: 0 };
export function resetSymbolFinderPerfStats(): void {
    sfPerfStats.globalCalls = 0; sfPerfStats.globalMs = 0;
    sfPerfStats.siblingCalls = 0; sfPerfStats.siblingMs = 0;
}
export function readSymbolFinderPerfStats(): SymbolFinderPerfStats {
    return { ...sfPerfStats };
}
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
            // Look for type arg ONLY in the immediate first (...) after the structure keyword.
            // e.g. CLASS(WindowManager) → "CLASS(WindowManager)", CLASS() → "CLASS"
            // Without this guard, Class(), Link('x',SomeName) would incorrectly yield CLASS(SomeName).
            const afterNext = lineTokens.filter(t => t.start > next.start);
            let depth = 0;
            let seenOpen = false;
            let typeArg: Token | undefined;
            for (const t of afterNext) {
                if (t.value === '(') {
                    depth++;
                    seenOpen = true;
                } else if (t.value === ')') {
                    depth--;
                    if (seenOpen && depth === 0) break; // closed the first group — stop
                } else if (depth === 1 && (t.type === TokenType.Label || t.type === TokenType.Variable)) {
                    typeArg = t;
                    break;
                }
            }
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
        if (next.type === TokenType.Function) {
            // EQUATE(value) — matched as Function due to trailing '('
            if (next.value.toUpperCase() === 'EQUATE') return 'EQUATE';
        }
        if (next.type === TokenType.FunctionArgumentParameter) {
            // EQUATE (value) with a space — tokenizer swallows it as a single FunctionArgumentParameter token
            if (/^EQUATE\s*\(/i.test(next.value)) return 'EQUATE';
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
        
        // Match PROCEDURE(...)/FUNCTION(...) signature (#247)
        const match = procedureLine.match(/(?:PROCEDURE|FUNCTION)\s*\((.*?)\)/i);
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
        // #265: a bare search word must never bind to a field of a PRE()'d
        // structure — those are only addressable as Pre:Field or Structure.Field
        // (Language Reference, PRE attribute). Qualified searches resolve via
        // findPrefixedField / StructureFieldResolver instead.
        const bareSearch = !searchText.includes(':') && !searchText.includes('.');
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
                t.value.toLowerCase() === wordLower &&
                !(bareSearch && t.structurePrefix) // #265: PRE()'d fields need a qualifier
            );
            if (labelToken) {
                // Skip MAP/global procedure declarations — these are handled by
                // findProcedureDeclaration (step 5) with the correct scope and type.
                const isProcDecl = tokens.some(t =>
                    t.line === labelToken.line &&
                    (t.type === TokenType.Procedure || t.type === TokenType.Function) &&
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
                        t.value.toLowerCase() === wordLower &&
                        !(bareSearch && t.structurePrefix) // #265: PRE()'d fields need a qualifier
                    );
                    if (found) {
                        const isProcDecl = tokens.some(t =>
                            t.line === found.line &&
                            (t.type === TokenType.Procedure || t.type === TokenType.Function) &&
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

            // If the current scope is a Local Derived Method, it shares ONLY its declaring
            // procedure's scope (Issue #233, Rule 4) — the procedure whose LOCAL data declared
            // this method's CLASS. Resolve that single procedure deterministically instead of
            // scanning every GlobalProcedure (the former broad scan leaked unrelated procedures'
            // locals, so hover disagreed with completion in files with multiple procedures).
            if (scopeToken.subType === TokenType.MethodImplementation) {
                const declaringProc = new ScopeResolver(tokens).findDeclaringProcedureForMethod(scopeToken);
                if (declaringProc) {
                    logger.info(`Scope is a Local Derived Method — searching declaring procedure at line ${declaringProc.line} for "${searchText}"`);

                    // Check parameters of the declaring procedure first.
                    const paramResult = this.findParameter(word, document, declaringProc);
                    if (paramResult) {
                        logger.info(`✅ Found "${searchText}" as parameter of declaring procedure at line ${declaringProc.line}`);
                        return paramResult;
                    }

                    const gpStart = declaringProc.line;
                    const gpEnd = declaringProc.finishesAt ?? Number.MAX_SAFE_INTEGER;
                    const found = tokens.find(t =>
                        t.line >= gpStart && t.line <= gpEnd &&
                        t.start === 0 &&
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.value.toLowerCase() === wordLower &&
                        !(bareSearch && t.structurePrefix) // #265: PRE()'d fields need a qualifier
                    );
                    if (found) {
                        // Skip MAP/global procedure declarations — they are not local variables
                        const isProcDecl = tokens.some(t =>
                            t.line === found.line &&
                            (t.type === TokenType.Procedure || t.type === TokenType.Function) &&
                            (t.subType === TokenType.MapProcedure ||
                             t.subType === TokenType.GlobalProcedure ||
                             t.subType === TokenType.MethodDeclaration)
                        );
                        if (!isProcDecl) {
                            logger.info(`✅ Found "${searchText}" in declaring procedure scope at line ${found.line}`);
                            return {
                                token: found,
                                type: SymbolFinderService.extractTypeInfo(found, tokens),
                                scope: { token: declaringProc, type: 'local' },
                                location: { uri: document.uri, line: found.line, character: found.start },
                                originalWord: originalWord || word,
                                searchWord: word
                            };
                        }
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

        // #265: the symbol-tree recursion descends into structure children, so a
        // bare word can land on a PRE()'d structure's field here. Reject it — the
        // module/global tiers are the legal binding for the bare name.
        if (bareSearch && variableToken.structurePrefix) {
            logger.info(`⏭️ "${searchText}" is a field of a PRE(${variableToken.structurePrefix}) structure — bare reference is invalid, deferring to outer scopes`);
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
     * Find a routine-local variable declared in a ROUTINE DATA section.
     *
     * Tier 1 shadows the parent procedure's locals, so this must run before the
     * broader procedure-local search whenever the cursor is inside a ROUTINE.
     */
    findRoutineLocalVariable(
        word: string,
        tokens: Token[],
        routineToken: Token,
        document: TextDocument,
        originalWord?: string
    ): SymbolInfo | null {
        if (routineToken.subType !== TokenType.Routine) {
            return null;
        }

        const searchText = originalWord || word;
        const searchLower = searchText.toLowerCase();
        const bareSearch = !searchText.includes(':') && !searchText.includes('.');
        const routineDataEnd = routineToken.executionMarker?.line ?? routineToken.finishesAt ?? Number.MAX_SAFE_INTEGER;

        const routineVar = tokens.find(t =>
            t.line > routineToken.line &&
            t.line < routineDataEnd &&
            t.start === 0 &&
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.value.toLowerCase() === searchLower &&
            !(bareSearch && t.structurePrefix) // #265: PRE()'d fields need a qualifier
        );

        if (!routineVar) {
            return null;
        }

        const isProcDecl = tokens.some(t =>
            t.line === routineVar.line &&
            (t.type === TokenType.Procedure || t.type === TokenType.Function) &&
            (t.subType === TokenType.MapProcedure ||
             t.subType === TokenType.GlobalProcedure ||
             t.subType === TokenType.MethodDeclaration)
        );
        if (isProcDecl) {
            return null;
        }

        const declaration = tokens
            .filter(t => t.line === routineVar.line)
            .map(t => t.value)
            .join(' ');

        return {
            token: routineVar,
            type: SymbolFinderService.extractTypeInfo(routineVar, tokens),
            scope: {
                token: routineToken,
                type: 'local'
            },
            location: {
                uri: document.uri,
                line: routineVar.line,
                character: routineVar.start
            },
            declaration,
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
            ProcedureUtils.isProcedureKeyword(t.value) // #247: PROCEDURE ≡ FUNCTION
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
     * Find a module-scope variable declared in a sibling MEMBER file of the same PROGRAM.
     *
     * Uses FRG MEMBER edges to enumerate sibling MEMBER files, then scans each file's
     * module scope (between MEMBER and first PROCEDURE) for a matching column-0 label.
     */
    public async findModuleVariableInSiblingMembers(
        word: string,
        document: TextDocument,
        _position: { line: number; character: number }
    ): Promise<SymbolInfo | null> {
        sfPerfStats.siblingCalls++;
        const perfT0 = Date.now();
        try {
            return await this.findModuleVariableInSiblingMembersInner(word, document, _position);
        } finally {
            sfPerfStats.siblingMs += Date.now() - perfT0;
        }
    }

    private async findModuleVariableInSiblingMembersInner(
        word: string,
        document: TextDocument,
        _position: { line: number; character: number }
    ): Promise<SymbolInfo | null> {
        const graph = FileRelationshipGraph.getInstance();
        graph.ensureNoSolutionGraphForDocument(document);

        if (!graph.isBuilt) {
            return null;
        }

        const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
        const programFile = graph.getProgramFile(currentFilePath);
        if (!programFile) {
            return null;
        }

        const memberFiles = graph.getMemberFiles(programFile);

        // #319 → #345 phase 3: the walk previously probed EVERY member module
        // PER LOOKUP (mayContain + a raw column-0 regex read per file) — the
        // undeclared-variable augment probes misses by definition, so N
        // candidates × M member files of repeated raw reads cost 23s on the
        // real 40-project solution. One column-0 label index per program
        // FAMILY (yielded build, TTL + watcher-evicted) now answers which
        // files can possibly declare the word; only those are tokenized, and
        // findModuleVariable stays the authoritative scope check.
        const familyIndex = await this.getSiblingLabelIndex(programFile, memberFiles);
        const candidateFiles = familyIndex.names.get(word.toLowerCase());
        if (!candidateFiles || candidateFiles.length === 0) {
            return null;
        }

        for (const memberPath of candidateFiles) {
            if (memberPath.toLowerCase() === currentFilePath.toLowerCase()) continue;

            const sibling = this.loadTokensForFile(memberPath);
            if (!sibling) continue;

            const result = this.findModuleVariable(word, sibling.tokens, sibling.document);
            if (result) {
                return result;
            }
        }

        return null;
    }

    /**
     * #345 phase 3 — one raw-text pass over a program family's member modules,
     * indexing every column-0 identifier (a module-scope declaration is a
     * column-0 label by language rule; over-approximation is safe because
     * findModuleVariable re-verifies scope on the shortlisted files).
     */
    private async getSiblingLabelIndex(programFile: string, memberFiles: string[]): Promise<SiblingIndexEntry> {
        const key = programFile.toLowerCase();
        // Identity = the member LIST (the #340/#344 discipline); member CONTENT
        // changes are covered by the TTL and the #340 watcher eviction.
        const fingerprint = [...memberFiles].map(m => m.toLowerCase()).sort().join(';');
        const cached = siblingLabelIndexCache.get(key);
        if (cached && cached.fingerprint === fingerprint &&
            Date.now() - cached.builtAt < CHAIN_INDEX_TTL_MS) {
            return cached;
        }

        const entry: SiblingIndexEntry = { builtAt: Date.now(), fingerprint, names: new Map() };
        const timeSlice = makeTimeSlicer();
        const labelRe = /^([A-Za-z_][A-Za-z0-9_:]*)/;
        const seenFiles = new Set<string>();

        for (const memberFile of memberFiles) {
            const memberPath = memberFile.replace(/\//g, '\\');
            const norm = memberPath.toLowerCase();
            if (seenFiles.has(norm)) continue;
            seenFiles.add(norm);
            await timeSlice();

            // Cache-first (same discipline as loadTokensForFile): the member may
            // be open in the editor or seeded by an in-memory fixture.
            let raw = this.tokenCache.getDocumentTextByUriCaseInsensitive(
                `file:///${memberPath.replace(/\\/g, '/')}`);
            if (raw === null || raw === undefined) {
                try {
                    raw = fs.readFileSync(memberPath, 'utf-8');
                } catch {
                    continue;
                }
            }
            for (const line of raw.split(/\r?\n/)) {
                const m = labelRe.exec(line);
                if (!m) continue;
                const k = m[1].toLowerCase();
                let arr = entry.names.get(k);
                if (!arr) { arr = []; entry.names.set(k, arr); }
                if (!arr.includes(memberPath)) arr.push(memberPath);
            }
        }

        siblingLabelIndexCache.set(key, entry);
        logger.info(`📇 [#345] sibling label index for ${path.basename(programFile)}: ${entry.names.size} name(s) across ${seenFiles.size} member(s)`);
        return entry;
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
        const memberToken = TokenHelper.findMemberHeaderToken(tokens);
        if (memberToken?.referencedFile) {
            try {
                const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '').replace(/\//g, '\\'));
                const resolvedPath = path.resolve(path.dirname(currentFilePath), memberToken.referencedFile);
                const parentUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;

                // #119 — cache-first parity with findGlobalVariableInParentFile (:816-838):
                // the parent PROGRAM may be open in the editor (unsaved edits) or seeded by
                // an in-memory test fixture; consult the token cache first and read disk only
                // on a miss (matches the FAR family's 671d7cd8 discipline).
                let parentTokens: Token[] | null = this.tokenCache.getTokensByUriCaseInsensitive(parentUri);
                let parentDoc: TextDocument | null = null;
                if (parentTokens) {
                    const cachedText = this.tokenCache.getDocumentTextByUriCaseInsensitive(parentUri);
                    if (cachedText !== null) {
                        parentDoc = TextDocument.create(parentUri, 'clarion', 1, cachedText);
                    }
                }
                if (!parentTokens || !parentDoc) {
                    if (!fs.existsSync(resolvedPath)) return null;
                    const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
                    parentDoc = TextDocument.create(parentUri, 'clarion', 1, parentContents);
                    parentTokens = this.tokenCache.getTokens(parentDoc);
                }
                const parentResult = this.findPrefixedFieldInTokens(prefixUpper, fieldName, parentTokens, parentDoc.uri);
                if (parentResult) return parentResult;
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
        sfPerfStats.globalCalls++;
        const perfT0 = Date.now();
        try {
            return await this.findGlobalVariableInner(word, tokens, document);
        } finally {
            sfPerfStats.globalMs += Date.now() - perfT0;
        }
    }

    private async findGlobalVariableInner(word: string, tokens: Token[], document: TextDocument): Promise<SymbolInfo | null> {
        logger.info(`🔍 findGlobalVariable: searching for "${word}"`);

        // Step 1: Search current file for global variable (before first CODE/PROCEDURE)
        const currentFileResult = this.findGlobalVariableInCurrentFile(word, tokens, document);
        if (currentFileResult) {
            return currentFileResult;
        }

        // #334: declarations pulled in via `INCLUDE(...)` at module/global scope
        // (Clarion shops routinely declare solution-wide globals in .inc files
        // included from every main module). #344: chain indexed once per host.
        const currentIncludeResult = await this.findGlobalVariableInIncludes(word, tokens, document);
        if (currentIncludeResult) {
            return currentIncludeResult;
        }

        // Step 2: If not found and current file has MEMBER token, search parent file
        const memberToken = TokenHelper.findMemberHeaderToken(tokens);

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
     * Current-file half of the global lookup: a column-0 Label with no parent
     * token (structure fields never qualify — they need their PRE()/dot
     * qualifier) declared before the first CODE, or before the first
     * PROCEDURE when the file has no CODE marker.
     *
     * #265: public so VariableHoverResolver.findGlobalVariableHover shares
     * this exact decision with F12 instead of running its own scan.
     */
    public findGlobalVariableInCurrentFile(word: string, tokens: Token[], document: TextDocument): SymbolInfo | null {
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
        } else if (firstProcedure) {
            globalScopeEndLine = firstProcedure.line;
        } else {
            globalScopeEndLine = Number.MAX_SAFE_INTEGER;
        }

        const globalVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.parent === undefined &&
            t.line < globalScopeEndLine &&
            t.value.toLowerCase() === word.toLowerCase()
        );

        if (!globalVar) {
            return null;
        }

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
        let resolvedPath = path.resolve(currentFileDir, parentFile);
        let parentUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;

        logger.info(`Searching parent file: ${resolvedPath}`);

        // Cache-first lookup — parent may be open in editor (with unsaved
        // edits) or seeded by an in-memory test fixture. Disk read happens
        // only when the cache misses; matches the FAR family's `671d7cd8`
        // discipline.
        let parentTokens: Token[] | null = this.tokenCache.getTokensByUriCaseInsensitive(parentUri);
        let parentDoc: TextDocument | null = null;
        if (parentTokens) {
            const cachedText = this.tokenCache.getDocumentTextByUriCaseInsensitive(parentUri);
            if (cachedText !== null) {
                parentDoc = TextDocument.create(parentUri, 'clarion', 1, cachedText);
            }
        }

        try {
            if (!parentTokens || !parentDoc) {
                if (!fs.existsSync(resolvedPath)) {
                    // #300: MEMBER targets aren't necessarily same-dir — generated multi-DLL
                    // apps put member modules in genfiles\src while the app main lives elsewhere
                    // (project root per the RED). Cache first, same-dir next, redirection LAST —
                    // the same shape every other cross-file resolution path uses. Without this
                    // the whole Tier-6 global walk dead-ended and the undeclared-variable
                    // diagnostic flagged parent-file globals that hover resolves. The fresh-read
                    // URI is canonical (#251) — hand-built file:/// shapes keep causing
                    // cache-identity bugs.
                    const solutionManager = SolutionManager.getInstance();
                    const viaRedirection = solutionManager
                        ? await solutionManager.findFileWithExtension(parentFile, currentFilePath)
                        : null;
                    if (viaRedirection?.path && fs.existsSync(viaRedirection.path)) {
                        logger.info(`✅ #300: MEMBER parent '${parentFile}' resolved via redirection: ${viaRedirection.path}`);
                        resolvedPath = viaRedirection.path;
                        parentUri = pathToCanonicalUri(resolvedPath);
                        // The redirected target may itself be cached (open in the editor)
                        parentTokens = this.tokenCache.getTokensByUriCaseInsensitive(parentUri);
                        if (parentTokens) {
                            const cachedText = this.tokenCache.getDocumentTextByUriCaseInsensitive(parentUri);
                            if (cachedText !== null) {
                                parentDoc = TextDocument.create(parentUri, 'clarion', 1, cachedText);
                            }
                        }
                    } else {
                        logger.warn(`Parent file not found: ${resolvedPath}`);
                        return null;
                    }
                }
            }
            if (!parentTokens || !parentDoc) {
                const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
                parentDoc = TextDocument.create(parentUri, 'clarion', 1, parentContents);
                parentTokens = this.tokenCache.getTokens(parentDoc);
            }
            
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
            
            // #334: not among the parent's own labels — follow the parent's
            // global-scope INCLUDE chain (main modules declare shared globals
            // via `INCLUDE('Globals.inc'),ONCE`-style pulls; #344: indexed once).
            const includeResult = await this.findGlobalVariableInIncludes(word, parentTokens, parentDoc);
            if (includeResult) return includeResult;

            logger.info(`❌ Global variable "${word}" not found in parent file`);
            return null;

        } catch (err) {
            logger.error(`Error reading MEMBER parent file: ${err}`);
            return null;
        }
    }

    /**
     * #334/#344 — resolve a global declared in the host's data-scope INCLUDE
     * chain. #334's original walk exhausted the ENTIRE chain per unresolved
     * name — on a real generated app the parent's chain is the whole
     * ABC/libsrc universe and the undeclared-variable augment feeds it dozens
     * of names (74s measured). The chain is now indexed ONCE per host
     * (name → declaration site), TTL-bounded and evicted wholesale by the
     * #340 watched-files handler; lookups are O(1).
     */
    private async findGlobalVariableInIncludes(
        word: string,
        hostTokens: Token[],
        hostDoc: TextDocument
    ): Promise<SymbolInfo | null> {
        const key = decodeURIComponent(hostDoc.uri.replace(/^file:\/\/\/?/i, '')).toLowerCase();
        // #340 lesson: the path alone is not identity — a host whose CONTENT
        // changed (live edits, or a reused synthetic path in tests) must not
        // serve the old chain. Chain-FILE changes are covered by the TTL and
        // the #340 watcher eviction.
        const hostText = hostDoc.getText();
        let entry = includeChainIndexCache.get(key);
        if (!entry || Date.now() - entry.builtAt > CHAIN_INDEX_TTL_MS || entry.hostText !== hostText) {
            entry = { builtAt: Date.now(), hostText, names: new Map() };
            await this.buildIncludeChainIndex(hostTokens, hostDoc, new Set<string>(), entry.names);
            includeChainIndexCache.set(key, entry);
            chainIndexBuildCount++;
            logger.info(`📇 [#344] include-chain index for ${path.basename(key)}: ${entry.names.size} global name(s)`);
        }

        const decl = entry.names.get(word.toLowerCase());
        if (!decl) return null;

        const declPath = decodeURIComponent(decl.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
        const loaded = this.loadTokensForFile(declPath);
        if (!loaded) return null;
        const declared = loaded.tokens.find(tok =>
            tok.type === TokenType.Label &&
            tok.line === decl.line &&
            tok.start === decl.character);
        if (!declared) return null;

        const typeInfo = SymbolFinderService.extractTypeInfo(declared, loaded.tokens);
        const lineTokens = loaded.tokens.filter(tok => tok.line === declared.line);
        return {
            token: declared,
            type: typeInfo,
            scope: { token: declared, type: 'global' },
            location: {
                uri: loaded.document.uri,
                line: declared.line,
                character: declared.start
            },
            declaration: lineTokens.map(tok => tok.value).join(' '),
            originalWord: word,
            searchWord: word
        };
    }

    /**
     * #344 — one recursive walk of the host's data-scope include chain,
     * collecting every qualifying column-0 declaration label (same guards as
     * #334: data-scope includes only — MAP/MODULE prototype pulls excluded —
     * and `X PROCEDURE(...)` labels never count as globals). First
     * declaration wins on name collisions (Clarion include order).
     */
    private async buildIncludeChainIndex(
        hostTokens: Token[],
        hostDoc: TextDocument,
        visited: Set<string>,
        names: Map<string, ChainDeclInfo>
    ): Promise<void> {
        const boundary = SymbolFinderService.globalScopeEndLine(hostTokens);
        const hostPath = decodeURIComponent(hostDoc.uri.replace('file:///', ''));
        const hostDir = path.dirname(hostPath);
        // #345 phase 3: the cold build tokenizes each chain file synchronously —
        // on a generated app the chain is the whole ABC/libsrc universe, and the
        // unyielded loop showed up as a 20s+ event-loop block. Yield per include.
        const timeSlice = makeTimeSlicer();

        for (const t of hostTokens) {
            if (t.type !== TokenType.Directive || t.value.toUpperCase() !== 'INCLUDE') continue;
            if (t.line >= boundary) continue;
            await timeSlice();

            // Only follow DATA-scope includes — an INCLUDE inside a structure
            // (MAP/MODULE prototype pull, #322 shape) brings in prototypes.
            const insideStructure = hostTokens.some(s =>
                s.type === TokenType.Structure &&
                s.finishesAt !== undefined &&
                s.line <= t.line && s.finishesAt >= t.line);
            if (insideStructure) continue;

            const fileToken = hostTokens.find(s =>
                s.line === t.line && s.start > t.start && s.type === TokenType.String);
            if (!fileToken) continue;
            const includeName = fileToken.value.replace(/^'|'$/g, '').replace(/''/g, "'").trim();
            if (!includeName) continue;

            const visitKey = includeName.toLowerCase();
            if (visited.has(visitKey)) continue;
            visited.add(visitKey);

            let loaded = this.loadTokensForFile(path.resolve(hostDir, includeName));
            if (!loaded) {
                const solutionManager = SolutionManager.getInstance();
                const viaRedirection = solutionManager
                    ? await solutionManager.findFileWithExtension(includeName, hostPath)
                    : null;
                if (viaRedirection?.path) {
                    loaded = this.loadTokensForFile(viaRedirection.path);
                }
            }
            if (!loaded) {
                logger.info(`[#334] INCLUDE target not resolvable: ${includeName} (from ${hostDoc.uri})`);
                continue;
            }
            const included = loaded;

            const includedBoundary = SymbolFinderService.globalScopeEndLine(included.tokens);
            // One pass for the prototype/impl-label exclusion: lines carrying a
            // PROCEDURE/FUNCTION token after column 0.
            const procedureLines = new Set<number>();
            for (const tok of included.tokens) {
                if (tok.start > 0 &&
                    (tok.value.toUpperCase() === 'PROCEDURE' || tok.value.toUpperCase() === 'FUNCTION')) {
                    procedureLines.add(tok.line);
                }
            }
            for (const tok of included.tokens) {
                if (tok.type !== TokenType.Label || tok.start !== 0) continue;
                if (tok.line >= includedBoundary) continue;
                if (procedureLines.has(tok.line)) continue;
                if (tok.parent === undefined) {
                    const k = tok.value.toLowerCase();
                    if (!names.has(k)) {
                        names.set(k, { uri: included.document.uri, line: tok.line, character: tok.start });
                    }
                    continue;
                }
                // #347: structure member — reachable only as PREFIX:Label, via the
                // nearest ancestor structure carrying a non-empty PRE() (the
                // JCA:StartedDate shape: FILE,PRE(JCA) → Record RECORD,PRE() →
                // field). Bare member names stay un-indexed (#265: PRE()'d fields
                // need their qualifier).
                let anc: Token | undefined = tok.parent;
                while (anc && !anc.structurePrefix) { anc = anc.parent; }
                if (!anc?.structurePrefix) continue;
                const pk = `${anc.structurePrefix.toLowerCase()}:${tok.value.toLowerCase()}`;
                if (!names.has(pk)) {
                    names.set(pk, { uri: included.document.uri, line: tok.line, character: tok.start });
                }
            }

            // Nested includes (e.g. Globals.inc itself INCLUDEs deeper files).
            await this.buildIncludeChainIndex(included.tokens, included.document, visited, names);
        }
    }

    /**
     * Global scope ends at the first CODE keyword, else the first PROCEDURE,
     * else never (pure declaration files like .inc). Same convention as
     * `findGlobalVariableInCurrentFile` / the MEMBER-parent walk.
     */
    private static globalScopeEndLine(tokens: Token[]): number {
        const firstCodeToken = tokens.find(t =>
            t.type === TokenType.Keyword &&
            t.value.toUpperCase() === 'CODE'
        );
        if (firstCodeToken) return firstCodeToken.line;

        const firstProcedure = tokens.find(t =>
            t.subType === TokenType.Procedure ||
            t.subType === TokenType.GlobalProcedure
        );
        return firstProcedure ? firstProcedure.line : Number.MAX_SAFE_INTEGER;
    }

    private loadTokensForFile(filePath: string): { document: TextDocument; tokens: Token[] } | null {
        const uri = `file:///${filePath.replace(/\\/g, '/')}`;

        let tokens: Token[] | null = this.tokenCache.getTokensByUriCaseInsensitive(uri);
        let doc: TextDocument | null = null;
        if (tokens) {
            const cachedText = this.tokenCache.getDocumentTextByUriCaseInsensitive(uri);
            if (cachedText !== null) {
                doc = TextDocument.create(uri, 'clarion', 1, cachedText);
            }
        }

        try {
            if (!tokens || !doc) {
                if (!fs.existsSync(filePath)) {
                    return null;
                }
                const contents = fs.readFileSync(filePath, 'utf-8');
                doc = TextDocument.create(uri, 'clarion', 1, contents);
                tokens = this.tokenCache.getTokens(doc);
            }

            return { document: doc, tokens };
        } catch (err) {
            logger.error(`Error loading sibling MEMBER file ${filePath}: ${err}`);
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

            // #319 (reopen): global BEFORE the sibling walk. Globals like
            // GlobalResponse occur in EVERY member module, so the index prune
            // can't help the walk — and the parent lookup is one file. Clarion
            // visibility agrees: global data IS in scope here; a sibling's
            // module data is not (the walk stays as a last-resort finder).
            const globalResult = await this.findGlobalVariable(word, tokens, document);
            if (globalResult) return globalResult;

            const siblingModuleResult = await this.findModuleVariableInSiblingMembers(word, document, position);
            if (siblingModuleResult) return siblingModuleResult;

            // Try structure field (col-0 Label with a parent Structure token, e.g. queue/group fields in INC)
            const fieldResult = this.findStructureField(word, tokens, position.line, document);
            if (fieldResult) return fieldResult;
            
            return null;
        }
        
        // Phase 1 fix: Try FULL word first
        logger.info(`Trying full word: "${word}"`);

        if (currentScope.subType === TokenType.Routine) {
            let result = this.findRoutineLocalVariable(word, tokens, currentScope, document);
            if (result) {
                logger.info(`✅ Found as routine-local variable: ${word}`);
                return result;
            }
        }
        
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

        // 4. Try as global variable — #319 (reopen): BEFORE the sibling walk.
        // Globals like GlobalResponse occur in EVERY member module (the index
        // prune can't help), and the parent lookup is one file vs a 161-file
        // family tokenization. Clarion visibility agrees: global data IS in
        // scope in a member; a sibling's module data is not.
        result = await this.findGlobalVariable(word, tokens, document);
        if (result) {
            logger.info(`✅ Found as global variable: ${word}`);
            return result;
        }

        result = await this.findModuleVariableInSiblingMembers(word, document, position);
        if (result) {
            logger.info(`✅ Found as sibling MEMBER module variable: ${word}`);
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

            if (currentScope.subType === TokenType.Routine) {
                result = this.findRoutineLocalVariable(searchWord, tokens, currentScope, document, word);
                if (result) {
                    logger.info(`✅ Found as routine-local variable (stripped): ${searchWord}`);
                    return result;
                }
            }
            
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

            // Try global variable with stripped word — #319: global before the
            // sibling walk (same rationale as tier 4).
            result = await this.findGlobalVariable(searchWord, tokens, document);
            if (result) {
                logger.info(`✅ Found as global variable (stripped): ${searchWord}`);
                result.originalWord = word;
                return result;
            }

            result = await this.findModuleVariableInSiblingMembers(searchWord, document, position);
            if (result) {
                logger.info(`✅ Found as sibling MEMBER module variable (stripped): ${searchWord}`);
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
        // Accept both Procedure-typed and Function-typed tokens — modern Clarion treats
        // PROCEDURE and FUNCTION as the same construct (both can return values); the
        // token-type split is a tokenizer artifact, not a language distinction.
        const procToken = tokens.find(t =>
            (t.type === TokenType.Procedure || t.type === TokenType.Function) &&
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
                (t.type === TokenType.Procedure || t.type === TokenType.Function) &&
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
            const sdi = StructureDeclarationIndexer.getInstance();
            const project = solutionManager?.findProjectForFile(fromPath);

            // #184 — fork on solution membership:
            if (project) {
                // Solution member → its project index (pre-built at solution-ready,
                // O(1) cache hit). No INCLUDE-chain walk needed on the hot path.
                await sdi.getOrBuildIndex(project.path);
                let definitions = sdi.find(word, project.path);
                if (definitions.length === 0) definitions = sdi.find(word);
                return definitions.length ? this.toIndexedTypeInfo(definitions[0]) : null;
            }

            // Not a solution member (a loose / red-path file opened directly, e.g.
            // a libsrc .clw). Resolve via the file's OWN INCLUDE chain first — the
            // Clarion compilation model — which is bounded to the actual include
            // set and never rescans all of libsrc (the rescan was blowing the
            // 10s hover/F12 timeout).
            const viaInclude = await this.findTypeViaIncludeChain(word, fromPath, document.getText(), new Set<string>());
            if (viaInclude) return this.toIndexedTypeInfo(viaInclude);

            // Then reuse any already-built index (the solution index already scans
            // libsrcPaths) — still NO dir-keyed rebuild. Only when there are no
            // indexes at all (genuine no-solution mode) do we build one keyed on
            // the file's directory, as a last resort.
            let definitions: StructureDeclarationInfo[];
            if (sdi.hasAnyIndex()) {
                definitions = sdi.find(word);
            } else {
                await sdi.getOrBuildIndex(path.dirname(fromPath));
                definitions = sdi.find(word);
            }
            return definitions.length ? this.toIndexedTypeInfo(definitions[0]) : null;
        } catch (e) {
            logger.error(`findIndexedTypeDeclaration error for "${word}": ${e}`);
            return null;
        }
    }

    private toIndexedTypeInfo(def: StructureDeclarationInfo): IndexedTypeInfo {
        return {
            name: def.name,
            filePath: def.filePath,
            line: def.line,
            structureType: def.structureType,
            parentName: def.parentName,
            isType: def.isType,
            lineContent: def.lineContent
        };
    }

    /**
     * #184 — resolve a TYPE/structure declaration by walking the document's
     * INCLUDE chain, scanning only the files actually reachable from it. Fast and
     * solution-independent (no libsrc-wide scan). Returns the first matching
     * structure declaration, or null. `visited` guards against include cycles.
     */
    private async findTypeViaIncludeChain(
        word: string,
        fromPath: string,
        source: string,
        visited: Set<string>
    ): Promise<StructureDeclarationInfo | null> {
        const key = fromPath.toLowerCase();
        if (visited.has(key)) return null;
        visited.add(key);

        // 1. This file's own declarations.
        const wordLower = word.toLowerCase();
        const decls = scanSourceForDeclarations(source, fromPath);
        const match = decls.find(d => d.name.toLowerCase() === wordLower);
        if (match) return match;

        // 2. Recurse into INCLUDE'd files (redirection-resolved, else same-dir).
        const sm = SolutionManager.getInstance();
        const fromDir = path.dirname(fromPath);
        const includeRe = /^\s*INCLUDE\s*\(\s*'([^']+)'/gim;
        let m: RegExpExecArray | null;
        let scanned = 0; // #187 — yield between INCLUDE files so the walk doesn't block hover/F12
        while ((m = includeRe.exec(source)) !== null) {
            await cooperativeCheckpoint(scanned++);
            const includeFile = m[1];
            // #328: owner-project-first redirection
            let resolved: string | null = sm?.solution
                ? resolveViaProjectRedirection328(includeFile, fromPath)
                : null;
            if (!resolved) {
                const candidate = path.join(fromDir, includeFile);
                if (fs.existsSync(candidate)) resolved = candidate;
            }
            if (!resolved || visited.has(resolved.toLowerCase())) continue;

            let incSource: string;
            try { incSource = fs.readFileSync(resolved, 'utf-8'); } catch { continue; }
            const nested = await this.findTypeViaIncludeChain(word, resolved, incSource, visited);
            if (nested) return nested;
        }
        return null;
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
