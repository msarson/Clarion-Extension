import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import LoggerManager from '../logger';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("ScopeAnalyzer");
logger.setLevel("info"); // Enable info logging to debug MAP INCLUDE

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
    private redirectionParser: RedirectionFileParserServer;

    constructor(
        private tokenCache: TokenCache,
        private solutionManager: SolutionManager | null
    ) {
        this.redirectionParser = new RedirectionFileParserServer();
    }

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
        logger.info(`🔍 getSymbolScope called for symbol: "${symbol.value}" at line ${symbol.line}`);
        
        const scopeInfo = this.getTokenScope(document, { line: symbol.line, character: symbol.start });
        
        if (!scopeInfo) {
            logger.info(`⚠️ No scope info found for symbol "${symbol.value}", returning 'global'`);
            return 'global';
        }

        logger.info(`📍 Basic scope info: type=${scopeInfo.type}, isProgramFile=${scopeInfo.isProgramFile}, memberModuleName=${scopeInfo.memberModuleName}`);

        // Check if symbol might be declared in a MAP INCLUDE file
        // This is important for procedures declared in MAP INCLUDE files
        const tokens = this.tokenCache.getTokens(document);
        if (tokens) {
            logger.info(`🗺️ Checking MAP scope level for "${symbol.value}"...`);
            const mapScope = this.getMapScopeLevel(symbol, tokens, document);
            if (mapScope !== null) {
                logger.info(`✅ Found in MAP with scope: ${mapScope}`);
                return mapScope;
            }
            logger.info(`❌ Symbol "${symbol.value}" not found in any MAP (including INCLUDEs)`);
        }

        // Map ScopeLevel to ScopeType
        const scopeType = (() => {
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
        })();
        
        logger.info(`📊 Final scope type for "${symbol.value}": ${scopeType}`);
        return scopeType;
    }

    /**
     * Determine the scope level of a MAP containing a symbol
     * Checks both direct MAP declarations and symbols from MAP INCLUDE files
     * @param symbol The symbol token (could be from document or from an INCLUDE)
     * @param tokens All tokens from the document
     * @param document The document
     * @returns The scope type based on MAP location, or null if not in a MAP
     */
    private getMapScopeLevel(symbol: Token, tokens: Token[], document: TextDocument): ScopeType | null {
        logger.info(`🗺️ getMapScopeLevel: Searching for "${symbol.value}" in MAP blocks...`);
        
        // Find all MAP blocks in the document
        const mapStructures = tokens.filter(t => 
            t.type === TokenType.Structure && 
            t.value.toUpperCase() === 'MAP'
        );

        logger.info(`📋 Found ${mapStructures.length} MAP blocks in document`);

        for (let i = 0; i < mapStructures.length; i++) {
            const mapToken = mapStructures[i];
            logger.info(`🔍 Checking MAP #${i + 1} at line ${mapToken.line}...`);
            
            const mapTokens = this.getMapTokensWithIncludes(mapToken, document, tokens);
            logger.info(`   Found ${mapTokens.length} total tokens in MAP (including INCLUDEs)`);
            
            // Check if our symbol is in this MAP's tokens (including INCLUDEs)
            // Match by value and type (procedure declarations)
            const matchingTokens = mapTokens.filter(t => 
                t.value.toLowerCase() === symbol.value.toLowerCase() &&
                (t.subType === TokenType.MapProcedure || t.type === TokenType.Function)
            );
            
            if (matchingTokens.length > 0) {
                logger.info(`✅ Found ${matchingTokens.length} matching token(s) for "${symbol.value}" in MAP #${i + 1}`);
                
                // Determine scope based on where the MAP is declared
                const mapScopeInfo = this.getTokenScope(document, { 
                    line: mapToken.line, 
                    character: mapToken.start 
                });
                
                if (!mapScopeInfo) {
                    logger.info(`⚠️ Could not determine MAP scope info, defaulting to global`);
                    return 'global';
                }
                
                logger.info(`📍 MAP scope info: type=${mapScopeInfo.type}, containingProcedure=${!!mapScopeInfo.containingProcedure}, memberModuleName=${mapScopeInfo.memberModuleName}, isProgramFile=${mapScopeInfo.isProgramFile}`);
                
                // MAP inside procedure -> procedure-local
                if (mapScopeInfo.containingProcedure) {
                    logger.info(`✅ MAP is inside PROCEDURE -> procedure-local`);
                    return 'procedure-local';
                }
                
                // MAP in MEMBER file -> module-local
                if (mapScopeInfo.memberModuleName) {
                    logger.info(`✅ MAP is in MEMBER file -> module-local`);
                    return 'module-local';
                }
                
                // MAP in PROGRAM file -> global
                if (mapScopeInfo.isProgramFile) {
                    logger.info(`✅ MAP is in PROGRAM file -> global`);
                    return 'global';
                }
                
                logger.info(`⚠️ Could not determine specific scope, defaulting to global`);
                return 'global';
            }
        }
        
        logger.info(`❌ Symbol "${symbol.value}" not found in any MAP (including INCLUDEs)`);
        // Symbol not found in any MAP (including INCLUDEs)
        return null;
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

    /**
     * Get tokens from a MAP block, including tokens from INCLUDEd files
     * PUBLIC method - can be used by other resolvers
     * @param mapToken The MAP structure token
     * @param document The document containing the MAP
     * @param tokens All tokens from the document
     * @returns Array of tokens including those from INCLUDEd files
     */
    public getMapTokensWithIncludes(mapToken: Token, document: TextDocument, tokens: Token[]): Token[] {
        const mapStartLine = mapToken.line;
        const mapEndLine = mapToken.finishesAt;
        
        logger.info(`   📦 getMapTokensWithIncludes: MAP from line ${mapStartLine} to ${mapEndLine}`);
        
        if (mapEndLine === undefined) {
            logger.info(`   ⚠️ MAP has no end line, returning empty array`);
            return [];
        }

        // Get tokens directly in the MAP block
        const mapTokens = tokens.filter(t =>
            t.line > mapStartLine && t.line < mapEndLine
        );

        logger.info(`   📄 Direct MAP tokens: ${mapTokens.length}`);

        // Find INCLUDE statements within MAP block
        const includeStatements = this.findIncludesInMap(mapTokens, document);
        logger.info(`   📁 Found ${includeStatements.length} INCLUDE statement(s) in MAP`);

        // Resolve and load tokens from each included file
        for (const includeInfo of includeStatements) {
            logger.info(`   🔍 Processing INCLUDE: "${includeInfo.filename}" at line ${includeInfo.line}`);
            const result = this.getTokensFromIncludedFileWithPath(includeInfo.filename, document.uri);
            if (result && result.tokens) {
                logger.info(`   ✅ Loaded ${result.tokens.length} tokens from "${includeInfo.filename}"`);
                // Tag each token with source file information
                result.tokens.forEach(token => {
                    token.sourceFile = result.resolvedPath;
                    token.sourceContext = {
                        isFromInclude: true,
                        includeFile: result.resolvedPath,
                        parentFile: document.uri
                    };
                });
                // Add included tokens to the map tokens
                // Note: We keep the original line numbers from the included file
                // but mark them as coming from an include for scope purposes
                mapTokens.push(...result.tokens);
            } else {
                logger.info(`   ❌ Could not load tokens from "${includeInfo.filename}"`);
            }
        }

        logger.info(`   📊 Total MAP tokens (with INCLUDEs): ${mapTokens.length}`);
        return mapTokens;
    }

    /**
     * Find INCLUDE statements within a MAP block
     * @param mapTokens Tokens inside the MAP block
     * @param document The source document
     * @returns Array of include file information
     */
    private findIncludesInMap(mapTokens: Token[], document: TextDocument): Array<{ filename: string, line: number }> {
        const includes: Array<{ filename: string, line: number }> = [];
        
        for (let i = 0; i < mapTokens.length; i++) {
            const token = mapTokens[i];
            
            // Look for INCLUDE keyword
            if (token.type === TokenType.Function && token.value.toUpperCase() === 'INCLUDE') {
                // Next tokens should be: ( 'filename' )
                if (i + 2 < mapTokens.length) {
                    const parenToken = mapTokens[i + 1];
                    const filenameToken = mapTokens[i + 2];
                    
                    if (parenToken.value === '(' && filenameToken.type === TokenType.String) {
                        // Remove quotes from filename
                        const filename = filenameToken.value.replace(/^'|'$/g, '');
                        includes.push({ filename, line: token.line });
                    }
                }
            }
        }
        
        return includes;
    }

    /**
     * Get tokens from an included file (returns tokens and resolved path)
     * @param filename The include filename (e.g., 'MAIN_PY1.INC')
     * @param sourceFileUri URI of the file containing the INCLUDE
     * @returns Object with tokens and resolved path, or null if not found
     */
    private getTokensFromIncludedFileWithPath(filename: string, sourceFileUri: string): { tokens: Token[], resolvedPath: string } | null {
        logger.info(`      🔎 Resolving INCLUDE file: "${filename}"`);
        
        // Convert URI to file path for redirection parser
        // IMPORTANT: Decode URI encoding (%3A -> :, %20 -> space, etc.)
        const decodedUri = decodeURIComponent(sourceFileUri);
        const sourceFilePath = decodedUri.replace('file:///', '').replace(/\//g, '\\');
        const sourceDir = path.dirname(sourceFilePath);
        
        logger.info(`      📂 Source file: ${sourceFilePath}`);
        logger.info(`      📂 Source dir: ${sourceDir}`);
        
        // Get fresh solution manager instance at runtime (not constructor time)
        // This ensures we have the latest loaded solution
        const solutionManager = this.solutionManager || SolutionManager.getInstance();
        
        // Initialize redirection parser with project path if available
        if (solutionManager && solutionManager.solution) {
            // Try each project's redirection parser (like other resolvers do)
            for (const project of solutionManager.solution.projects) {
                logger.info(`      🏗️ Trying project: ${project.name}`);
                const redirectionParser = project.getRedirectionParser();
                const resolved = redirectionParser.findFile(filename, sourceFilePath);
                if (resolved && resolved.path) {
                    logger.info(`      ✅ Resolved via project redirection: ${resolved.path}`);
                    const tokens = this.loadTokensFromFile(resolved.path);
                    return tokens ? { tokens, resolvedPath: resolved.path } : null;
                }
            }
            logger.info(`      ⚠️ Could not resolve via any project's redirection parser`);
        } else {
            logger.info(`      ⚠️ No solution manager/projects available`);
        }
        
        // Try relative to source file directory as fallback
        const fallbackPath = path.join(sourceDir, filename);
        logger.info(`      🔄 Trying fallback path: ${fallbackPath}`);
        
        if (fs.existsSync(fallbackPath)) {
            logger.info(`      ✅ Found file at fallback path`);
            const tokens = this.loadTokensFromFile(fallbackPath);
            return tokens ? { tokens, resolvedPath: fallbackPath } : null;
        }
        
        logger.info(`      ❌ File not found at fallback path either`);
        return null;
    }

    /**
     * Get tokens from an included file (legacy method for compatibility)
     * @param filename The include filename (e.g., 'MAIN_PY1.INC')
     * @param sourceFileUri URI of the file containing the INCLUDE
     * @returns Tokens from the included file, or null if not found
     */
    private getTokensFromIncludedFile(filename: string, sourceFileUri: string): Token[] | null {
        logger.info(`      🔎 Resolving INCLUDE file: "${filename}"`);
        
        // Convert URI to file path for redirection parser
        // IMPORTANT: Decode URI encoding (%3A -> :, %20 -> space, etc.)
        const decodedUri = decodeURIComponent(sourceFileUri);
        const sourceFilePath = decodedUri.replace('file:///', '').replace(/\//g, '\\');
        const sourceDir = path.dirname(sourceFilePath);
        
        logger.info(`      📂 Source file: ${sourceFilePath}`);
        logger.info(`      📂 Source dir: ${sourceDir}`);
        
        // Get fresh solution manager instance at runtime (not constructor time)
        // This ensures we have the latest loaded solution
        const solutionManager = this.solutionManager || SolutionManager.getInstance();
        
        // Initialize redirection parser with project path if available
        if (solutionManager && solutionManager.solution) {
            // Try each project's redirection parser (like other resolvers do)
            for (const project of solutionManager.solution.projects) {
                logger.info(`      🏗️ Trying project: ${project.name}`);
                const redirectionParser = project.getRedirectionParser();
                const resolved = redirectionParser.findFile(filename, sourceFilePath);
                if (resolved && resolved.path) {
                    logger.info(`      ✅ Resolved via project redirection: ${resolved.path}`);
                    return this.loadTokensFromFile(resolved.path);
                }
            }
            logger.info(`      ⚠️ Could not resolve via any project's redirection parser`);
        } else {
            logger.info(`      ⚠️ No solution manager/projects available`);
        }
        
        // Try relative to source file directory as fallback
        const fallbackPath = path.join(sourceDir, filename);
        logger.info(`      🔄 Trying fallback path: ${fallbackPath}`);
        
        if (fs.existsSync(fallbackPath)) {
            logger.info(`      ✅ Found file at fallback path`);
            return this.loadTokensFromFile(fallbackPath);
        }
        
        logger.info(`      ❌ File not found at fallback path either`);
        return null;
    }

    /**
     * Load and tokenize a file
     * @param filePath Full path to the file
     * @returns Tokens from the file, or null if unable to load
     */
    private loadTokensFromFile(filePath: string): Token[] | null {
        logger.info(`         💾 Loading tokens from file: ${filePath}`);
        
        try {
            if (!fs.existsSync(filePath)) {
                logger.info(`         ❌ File does not exist`);
                return null;
            }
            
            // Read file content
            const content = fs.readFileSync(filePath, 'utf-8');
            logger.info(`         📖 Read ${content.length} characters from file`);
            
            // Create a TextDocument for tokenization
            const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
            const document = TextDocument.create(fileUri, 'clarion', 1, content);
            
            // Get tokens from cache (which will tokenize if not already cached)
            const tokens = this.tokenCache.getTokens(document);
            
            if (tokens) {
                logger.info(`         ✅ Tokenized file: ${tokens.length} tokens`);
                
                // Process tokens through DocumentStructure to set referencedFile on MODULE/INCLUDE/LINK tokens
                // This is critical for MODULE resolution to work from INCLUDE files
                const DocumentStructure = require('../DocumentStructure').DocumentStructure;
                const docStructure = new DocumentStructure(tokens);
                logger.info(`         ✅ Processed tokens through DocumentStructure to set referencedFile properties`);
                
                // Log first few tokens for debugging
                const firstFew = tokens.slice(0, 5);
                firstFew.forEach((t, i) => {
                    logger.info(`            Token ${i}: type=${t.type}, subType=${t.subType}, value="${t.value}", line=${t.line}${t.referencedFile ? `, referencedFile="${t.referencedFile}"` : ''}`);
                });
            } else {
                logger.info(`         ❌ Tokenization returned null`);
            }
            
            return tokens || null;
        } catch (error) {
            logger.info(`         ❌ Error loading file: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
