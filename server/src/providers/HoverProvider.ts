import { Hover, Location, Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import { AttributeService } from '../utils/AttributeService';
import { ControlService } from '../utils/ControlService';
import { DataTypeService } from '../utils/DataTypeService';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { HoverFormatter } from './hover/HoverFormatter';
import { ProcedureCallDetector } from './utils/ProcedureCallDetector';
import { ContextualHoverHandler } from './hover/ContextualHoverHandler';
import { SymbolHoverResolver } from './hover/SymbolHoverResolver';
import { VariableHoverResolver } from './hover/VariableHoverResolver';
import { ProcedureHoverResolver } from './hover/ProcedureHoverResolver';
import { MethodHoverResolver } from './hover/MethodHoverResolver';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { ClassDefinitionIndexer } from '../utils/ClassDefinitionIndexer';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { ClassConstantParser } from '../utils/ClassConstantParser';
import { ProjectConstantsChecker } from '../utils/ProjectConstantsChecker';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("HoverProvider");
logger.setLevel("info"); // Production: Only log errors

/**
 * Provides hover information for local variables and parameters
 */
export class HoverProvider {
    private tokenCache = TokenCache.getInstance();
    private memberResolver = new ClassMemberResolver();
    private overloadResolver = new MethodOverloadResolver();
    private mapResolver = new MapProcedureResolver();
    private crossFileResolver = new CrossFileResolver(this.tokenCache);
    private builtinService = BuiltinFunctionService.getInstance();
    private attributeService = AttributeService.getInstance();
    private controlService = ControlService.getInstance();
    private dataTypeService = DataTypeService.getInstance();
    private scopeAnalyzer: ScopeAnalyzer;
    private formatter: HoverFormatter;
    private contextHandler: ContextualHoverHandler;
    private symbolResolver: SymbolHoverResolver;
    private variableResolver: VariableHoverResolver;
    private procedureResolver: ProcedureHoverResolver;
    private methodResolver: MethodHoverResolver;
    private includeVerifier: IncludeVerifier;

    constructor() {
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.formatter = new HoverFormatter(this.scopeAnalyzer);
        this.contextHandler = new ContextualHoverHandler(this.builtinService, this.attributeService);
        this.symbolResolver = new SymbolHoverResolver(this.dataTypeService, this.controlService);
        this.variableResolver = new VariableHoverResolver(this.formatter, this.scopeAnalyzer, this.tokenCache);
        this.procedureResolver = new ProcedureHoverResolver(this.mapResolver, this.crossFileResolver, this.formatter);
        this.methodResolver = new MethodHoverResolver(this.overloadResolver, this.memberResolver, this.formatter);
        this.includeVerifier = new IncludeVerifier();
    }

    /**
     * Provides hover information for a position in the document
     */
    public async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
        logger.info(`Providing hover for position ${position.line}:${position.character} in ${document.uri}`);

        try {
            // Get tokens first for OMIT/COMPILE detection
            const allTokens = this.tokenCache.getTokens(document);
            
            // Check if the line is inside an OMIT or COMPILE block
            if (OmitCompileDetector.isLineOmitted(position.line, allTokens, document)) {
                logger.info(`Line ${position.line} is inside OMIT/COMPILE block - skipping hover`);
                return null;
            }
            
            // Get DocumentStructure for MAP block detection
            const documentStructure = this.tokenCache.getStructure(document);
            
            // Get the word at the current position
            const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
            if (!wordRange) {
                logger.info('No word found at position');
                return null;
            }

            const word = document.getText(wordRange);
            logger.info(`Found word: "${word}" at position`);

            // Get the line to check context
            const line = document.getText({
                start: { line: position.line, character: 0 },
                end: { line: position.line, character: Number.MAX_VALUE }
            });

            // ✅ CONTEXT-AWARE DETECTION: Determine if we should prioritize control or data type
            // Get tokens to check for label before the word
            const currentLineTokens = allTokens.filter(t => t.line === position.line);
            
            // Check if there's a Label token before the current word (indicates data declaration)
            const hasLabelBefore = currentLineTokens.some(t => 
                t.type === TokenType.Label && 
                t.start < wordRange.start.character
            );
            
            // Check if we're in a WINDOW/REPORT/APPLICATION structure (indicates control context)
            const isInWindowContext = documentStructure.isInWindowStructure(position.line);
            
            // Check if we're in a MAP block (for MODULE keyword detection)
            const isInMapBlock = documentStructure.isInMapBlock(position.line);
            
            logger.info(`Context detection: hasLabelBefore=${hasLabelBefore}, isInWindowContext=${isInWindowContext}, isInMapBlock=${isInMapBlock}`);

            // Handle MODULE keyword specially (can be keyword in MAP or attribute on CLASS)
            if (word.toUpperCase() === 'MODULE') {
                const moduleHover = this.contextHandler.handleModuleKeyword(isInMapBlock);
                if (moduleHover) return moduleHover;
            }

            // Handle TO keyword specially (can be in LOOP or CASE structure)
            if (word.toUpperCase() === 'TO') {
                const toHover = this.contextHandler.handleToKeyword(allTokens, position, line);
                if (toHover) return toHover;
            }

            // Handle ELSE keyword specially (can be in IF or CASE structure)
            if (word.toUpperCase() === 'ELSE') {
                const elseHover = this.contextHandler.handleElseKeyword(allTokens, position);
                if (elseHover) return elseHover;
            }

            // Handle PROCEDURE keyword specially (different contexts: MAP prototype, CLASS method, implementation)
            if (word.toUpperCase() === 'PROCEDURE') {
                const isInClass = documentStructure.isInClassBlock(position.line);
                const procedureHover = this.contextHandler.handleProcedureKeyword(line, isInMapBlock, isInClass);
                if (procedureHover) return procedureHover;
            }

            // Check if this is a procedure call (e.g., "MyProcedure()")
            // OR if this is inside a START() call (e.g., "START(ProcName, ...)")
            // BUT: Skip if it's SELF.member (class method call)
            // NOTE: PARENT.member NOT supported yet - needs parent class resolution
            const procedureCallHover = await this.procedureResolver.resolveProcedureCall(word, document, position, wordRange, line);
            if (procedureCallHover) return procedureCallHover;

            // Check for data types and controls using context-aware resolver
            const symbolHover = this.symbolResolver.resolve(word, {
                hasLabelBefore,
                isInWindowContext
            });
            if (symbolHover) return symbolHover;

            // Check if this word is a Clarion attribute
            if (this.attributeService.isAttribute(word)) {
                logger.info(`Found Clarion attribute: ${word}`);
                
                const attribute = this.attributeService.getAttribute(word);
                const paramCount = this.countFunctionParameters(line, word, wordRange, document);
                logger.info(`Attribute parameter count: ${paramCount}`);
                
                return this.formatter.formatAttribute(word, attribute, paramCount);
            }

            // Check if this word is a built-in function (but NOT a class method call)
            // Only show built-in hover if the word is standalone (not preceded by a dot)
            if (this.builtinService.isBuiltin(word)) {
                // Get text before the word to check if it's a class method call
                const textBeforeWord = document.getText({
                    start: { line: position.line, character: 0 },
                    end: { line: position.line, character: wordRange.start.character }
                });
                
                // If there's a dot immediately before the word, it's a class method, not a built-in
                if (!textBeforeWord.trimEnd().endsWith('.')) {
                    logger.info(`Found built-in function: ${word}`);
                    
                    const signatures = this.builtinService.getSignatures(word);
                    const paramCount = this.countFunctionParameters(line, word, wordRange, document);
                    logger.info(`Parameter count in call: ${paramCount}`);
                    
                    return this.formatter.formatBuiltin(word, signatures, paramCount);
                } else {
                    logger.info(`Word ${word} is preceded by dot - treating as class method, not built-in`);
                }
            }
            
            // Check if this is a method implementation line and show declaration hover
            const methodImplHover = await this.methodResolver.resolveMethodImplementation(document, position, line);
            if (methodImplHover) return methodImplHover;

            // Check if this is a MAP procedure implementation and show declaration hover
            // Skip if we're inside a MAP block (those are declarations, not implementations)
            const procImplHover = await this.procedureResolver.resolveProcedureImplementation(document, position, line, documentStructure);
            if (procImplHover) return procImplHover;

            // Check if this is inside a MAP block (declaration) and show implementation hover
            const mapDeclHover = await this.procedureResolver.resolveMapDeclaration(document, position, line, documentStructure);
            if (mapDeclHover) return mapDeclHover;

            // Check if this is a method declaration in a CLASS (declaration) and show implementation hover
            const methodDeclHover = await this.methodResolver.resolveMethodDeclaration(document, position, line);
            if (methodDeclHover) return methodDeclHover;

            // Check if this is a structure/group name followed by a dot (e.g., hovering over "MyGroup" in "MyGroup.MyVar")
            // BUT: Skip SELF.member - those are class method calls handled below
            // NOTE: PARENT.member NOT supported yet - requires parent class lookup
            // Search for a dot starting from the word's position in the line
            const wordStartInLine = line.indexOf(word, Math.max(0, position.character - word.length));
            const dotIndex = line.indexOf('.', wordStartInLine);
            
            const isSelfMember = word.toUpperCase().startsWith('SELF.');
            
            if (dotIndex > wordStartInLine && dotIndex < wordStartInLine + word.length + 5 && !isSelfMember) {
                // There's a dot right after the word - this looks like structure.field notation
                logger.info(`Detected dot notation for word: ${word}, dotIndex: ${dotIndex}`);
                
                const tokens = this.tokenCache.getTokens(document);
                const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, position.line);
                if (currentScope) {
                    // Look for the GROUP/QUEUE/etc definition
                    const structureInfo = this.findLocalVariableInfo(word, tokens, currentScope, document, word);
                    if (structureInfo) {
                        logger.info(`✅ HOVER-RETURN: Found structure info for ${word}`);
                        return this.formatter.formatVariable(word, structureInfo, currentScope, document);
                    } else {
                        logger.info(`❌ HOVER-MISS: Could not find structure info for ${word}`);
                    }
                }
            }

            // Check if this is a class member access (self.member or variable.member)
            const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
            if (dotBeforeIndex > 0) {
                const beforeDot = line.substring(0, dotBeforeIndex).trim();
                const afterDot = line.substring(dotBeforeIndex + 1).trim();
                const fieldMatch = afterDot.match(/^(\w+)/);
                
                // Extract field name from word (in case TokenHelper returned "prefix.field")
                const fieldName = word.includes('.') ? word.split('.').pop()! : word;
                
                if (fieldMatch && fieldMatch[1].toLowerCase() === fieldName.toLowerCase()) {
                    // Check if this is a method call (has parentheses)
                    const hasParentheses = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
                    
                    // This is a member access (hovering over the field after the dot)
                    if (beforeDot.toLowerCase() === 'self' || beforeDot.toLowerCase().endsWith(' self')) {
                        // self.member - class member
                        // If it's a method call, count parameters
                        let paramCount: number | undefined;
                        if (hasParentheses) {
                            paramCount = this.memberResolver.countParametersInCall(line, fieldName);
                            logger.info(`Method call detected with ${paramCount} parameters`);
                        }
                        
                        const methodCallHover = await this.methodResolver.resolveMethodCall(fieldName, document, position, line, paramCount);
                        if (methodCallHover) return methodCallHover;
                    } else {
                        // variable.member - structure field access (e.g., MyGroup.MyVar)
                        const structureNameMatch = beforeDot.match(/(\w+)\s*$/);
                        if (structureNameMatch) {
                            const structureName = structureNameMatch[1];
                            logger.info(`Detected structure field access: ${structureName}.${word}`);
                            
                            const tokens = this.tokenCache.getTokens(document);
                            const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, position.line);
                            if (currentScope) {
                                // Try to find the structure field using dot notation reference
                                const fullReference = `${structureName}.${word}`;
                                const variableInfo = this.findLocalVariableInfo(word, tokens, currentScope, document, fullReference);
                                if (variableInfo) {
                                    logger.info(`✅ HOVER-RETURN: Found structure field info for ${fullReference}`);
                                    return this.formatter.formatVariable(fullReference, variableInfo, currentScope, document);
                                }
                            }
                        }
                    }
                }
            }

            // Get tokens and find current scope
            const tokens = this.tokenCache.getTokens(document);
            const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, position.line);

            if (!currentScope) {
                logger.info('No scope found - checking for global variables');
                
                // First, check for global variable in CURRENT file (PROGRAM)
                const globalVarInfo = this.findGlobalVariable(word, tokens, document);
                
                if (globalVarInfo) {
                    logger.info(`✅ Found global variable in current file: ${globalVarInfo.token.value} at line ${globalVarInfo.token.line}`);
                    return this.buildVariableHover(
                        globalVarInfo.token.value,
                        globalVarInfo.typeInfo,
                        true,
                        false,
                        globalVarInfo.scopeInfo,
                        document.uri,
                        globalVarInfo.token.line
                    );
                }
                
                // If not found in current file, check for global variable in MEMBER parent file
                const memberToken = tokens.find(t => 
                    t.value && t.value.toUpperCase() === 'MEMBER' && 
                    t.line < 5 && 
                    t.referencedFile
                );
                
                if (memberToken && memberToken.referencedFile) {
                    logger.info(`Found MEMBER reference to: ${memberToken.referencedFile}`);
                    
                    if (fs.existsSync(memberToken.referencedFile)) {
                        try {
                            const parentContents = await fs.promises.readFile(memberToken.referencedFile, 'utf-8');
                            const parentDoc = TextDocument.create(
                                `file:///${memberToken.referencedFile.replace(/\\/g, '/')}`,
                                'clarion',
                                1,
                                parentContents
                            );
                            const parentTokens = this.tokenCache.getTokens(parentDoc);
                            
                            const globalVarInfo = this.findGlobalVariable(word, parentTokens, parentDoc);
                            
                            if (globalVarInfo) {
                                logger.info(`✅ Found global variable in MEMBER parent: ${globalVarInfo.token.value} at line ${globalVarInfo.token.line}`);
                                return this.buildVariableHover(
                                    globalVarInfo.token.value,
                                    globalVarInfo.typeInfo,
                                    true,
                                    false,
                                    globalVarInfo.scopeInfo,
                                    parentDoc.uri,
                                    globalVarInfo.token.line
                                );
                            }
                        } catch (err) {
                            logger.error(`Error reading MEMBER parent file: ${err}`);
                        }
                    }
                }
                
                logger.info('No scope found and no global variable found - cannot provide hover');
                
                // 🔍 Last resort: Check if this word is a CLASS type reference
                // This handles when user hovers directly on a type name (e.g., hovering on "StringTheory" in "st StringTheory")
                logger.info(`Checking if ${word} is a CLASS type...`);
                const classTypeHover = await this.checkClassTypeHover(word, document);
                if (classTypeHover) return classTypeHover;
                
                return null;
            }

            logger.info(`Current scope: ${currentScope.value}`);

            // Strip prefix if present (e.g., LOC:Field -> Field)
            const colonIndex = word.lastIndexOf(':');
            let searchWord = word;
            let prefixPart = '';
            
            if (colonIndex > 0) {
                prefixPart = word.substring(0, colonIndex);
                searchWord = word.substring(colonIndex + 1);
                logger.info(`Detected prefixed variable in hover: prefix="${prefixPart}", field="${searchWord}"`);
            }

            // Check if this is a parameter
            logger.info(`Checking if ${searchWord} is a parameter...`);
            const parameterHover = this.variableResolver.findParameterHover(searchWord, document, currentScope);
            if (parameterHover) return parameterHover;
            logger.info(`${searchWord} is not a parameter`);

            // Check if this is a local variable
            logger.info(`Checking if ${searchWord} is a local variable...`);
            const variableHover = await this.variableResolver.findLocalVariableHover(searchWord, tokens, currentScope, document, word);
            if (variableHover) return variableHover;
            logger.info(`${searchWord} is not a local variable`);
            
            // 🔗 Check for module-local variable in current file (Label at column 0, before first PROCEDURE)
            logger.info(`Checking for module-local variable in current file...`);
            const moduleVarInfo = this.findModuleLocalVariable(searchWord, tokens, document);
            
            if (moduleVarInfo) {
                logger.info(`✅ Found module-local variable in current file: ${moduleVarInfo.token.value} at line ${moduleVarInfo.token.line}`);
                return this.buildVariableHover(
                    moduleVarInfo.token.value,
                    moduleVarInfo.typeInfo,
                    false,
                    moduleVarInfo.isStructureDefinition,
                    moduleVarInfo.scopeInfo,
                    document.uri,
                    moduleVarInfo.token.line
                );
            }
            
            logger.info(`${searchWord} is not a module-local variable - checking MEMBER parent file`);
            
            // 🔗 Check if MEMBER file exists
            const mapTokens = this.tokenCache.getTokens(document);
            const memberToken = mapTokens.find(t =>
                t.value && t.value.toUpperCase() === 'MEMBER' && 
                t.line < 5 && 
                t.referencedFile
            );
            
            if (memberToken && memberToken.referencedFile) {
                logger.info(`Found MEMBER reference to: ${memberToken.referencedFile}`);
                
                // Resolve the referenced file path relative to the current document
                // Decode URI first to get proper file path
                const currentFilePath = decodeURIComponent(document.uri.replace('file:///', ''));
                const currentFileDir = path.dirname(currentFilePath);
                const resolvedPath = path.resolve(currentFileDir, memberToken.referencedFile);
                logger.info(`Resolved MEMBER path: ${resolvedPath}`);
                logger.info(`Checking if file exists: ${fs.existsSync(resolvedPath)}`);
                
                if (fs.existsSync(resolvedPath)) {
                    try {
                        logger.info(`Reading MEMBER parent file: ${resolvedPath}`);
                        const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
                        const parentDoc = TextDocument.create(
                            `file:///${resolvedPath.replace(/\\/g, '/')}`,
                            'clarion',
                            1,
                            parentContents
                        );
                        const parentTokens = this.tokenCache.getTokens(parentDoc);
                        logger.info(`Tokenized parent file, found ${parentTokens.length} tokens`);
                        
                        // First check if this is a procedure in the MAP (before treating as variable)
                        // Look for MAP declaration of the procedure
                        const parentStructure = this.tokenCache.getStructure(parentDoc);
                        const mapDecl = this.mapResolver.findMapDeclaration(searchWord, parentTokens, parentDoc, line);
                        
                        if (mapDecl) {
                            logger.info(`✅ Found MAP declaration for ${searchWord} in parent - treating as procedure call`);
                            
                            // Find implementation
                            const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                            const procImpl = await this.mapResolver.findProcedureImplementation(
                                searchWord,
                                parentTokens,
                                parentDoc,
                                mapPosition,
                                line
                            );
                            
                            return this.formatter.formatProcedure(searchWord, mapDecl, procImpl, document, position);
                        }
                        
                        // Not a procedure - check for global variable
                        const globalVarInfo = this.findGlobalVariable(searchWord, parentTokens, parentDoc);
                        
                        if (globalVarInfo) {
                            logger.info(`✅ Found global variable in MEMBER parent: ${globalVarInfo.token.value} at line ${globalVarInfo.token.line}`);
                            return this.buildVariableHover(
                                globalVarInfo.token.value,
                                globalVarInfo.typeInfo,
                                true,
                                false,
                                globalVarInfo.scopeInfo,
                                parentDoc.uri,
                                globalVarInfo.token.line
                            );
                        }
                    } catch (err) {
                        logger.error(`Error reading MEMBER parent file: ${err}`);
                    }
                }
            }
            
            logger.info(`❌ ${searchWord} is not a local variable or global in MEMBER parent`);
            
            // 🔍 Last resort: Check if this word is a CLASS type reference
            // This handles when user hovers directly on a type name (e.g., hovering on "StringTheory" in "st StringTheory")
            logger.info(`Checking if ${word} is a CLASS type...`);
            const classTypeHover = await this.checkClassTypeHover(word, document);
            if (classTypeHover) {
                logger.info(`✅ HOVER-RETURN: Found CLASS type hover for ${word}`);
                return classTypeHover;
            }
            
            logger.info(`❌ HOVER-RETURN: No hover information found for ${word}`);
            return null;
        } catch (error) {
            logger.error(`Error providing hover: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Finds parameter information
     */
    private findParameterInfo(word: string, document: TextDocument, currentScope: Token): { type: string; line: number } | null {
        const content = document.getText();
        const lines = content.split('\n');
        const procedureLine = lines[currentScope.line];

        if (!procedureLine) {
            return null;
        }

        // Match PROCEDURE(...) or FUNCTION(...) pattern
        const match = procedureLine.match(ClarionPatterns.PROCEDURE_WITH_PARAMS);
        if (!match || !match[1]) {
            return null;
        }

        const paramString = match[1];
        const params = paramString.split(',');

        for (const param of params) {
            const trimmedParam = param.trim();
            // Extract parameter: TYPE paramName or TYPE paramName=default
            const paramMatch = trimmedParam.match(/([*&]?\s*\w+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=.*)?$/i);
            if (paramMatch) {
                const type = paramMatch[1].trim();
                const paramName = paramMatch[2];
                if (paramName.toLowerCase() === word.toLowerCase()) {
                    return { type, line: currentScope.line };
                }
            }
        }

        return null;
    }

    /**
     * Finds local variable information using the document symbol tree
     * This is more reliable than token-based search as it uses the outline provider's hierarchy
     */
    private findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): { type: string; line: number } | null {
        logger.info(`findLocalVariableInfo called for word: ${word}, scope: ${currentScope.value} at line ${currentScope.line}, subType: ${currentScope.subType}`);
        
        // Try the document symbol approach - more reliable
        const symbolProvider = new ClarionDocumentSymbolProvider();
        const symbols = symbolProvider.provideDocumentSymbols(tokens, document.uri);
        
        // Find the procedure symbol that contains the current line
        const procedureSymbol = this.findProcedureContainingLine(symbols, currentScope.line);
        if (procedureSymbol) {
            logger.info(`Found procedure symbol: ${procedureSymbol.name}`);
            logger.info(`Procedure has ${procedureSymbol.children?.length || 0} children`);
            
            // Debug: Log first 10 children
            if (procedureSymbol.children) {
                procedureSymbol.children.slice(0, 10).forEach((child: any) => {
                    logger.info(`  Child: name="${child.name}", kind=${child.kind}, detail="${child.detail}"`);
                });
            }
            
            // Search for the variable in the procedure's children
            // Use originalWord if available (includes prefix like LOC:MyVar), otherwise use word
            const searchText = originalWord || word;
            logger.info(`PREFIX-DEBUG: Searching with searchText="${searchText}", originalWord="${originalWord}", word="${word}"`);
            const varSymbol = this.findVariableInSymbol(procedureSymbol, searchText);
            if (varSymbol) {
                logger.info(`Found variable in symbol tree: ${varSymbol.name}, detail: ${varSymbol.detail}, kind: ${varSymbol.kind}`);
                
                // Extract type from _clarionType if available, otherwise parse from detail
                let type = (varSymbol as any)._clarionType || varSymbol.detail || 'Unknown';
                
                // Special handling for GROUP/QUEUE/FILE structures (kind = 23)
                if (varSymbol.kind === 23 && type === 'Unknown') {
                    // Extract structure type from name pattern like "GROUP (MyGroup)"
                    const structTypeMatch = varSymbol.name.match(/^(\w+)\s*\(/);
                    if (structTypeMatch) {
                        type = structTypeMatch[1]; // e.g., "GROUP", "QUEUE", "FILE"
                        logger.info(`Extracted structure type from name: ${type}`);
                    }
                }
                
                return {
                    type: type,
                    line: varSymbol.range.start.line
                };
            }
        }
        
        // Fallback to old token-based logic
        logger.info(`PREFIX-DEBUG: Symbol tree search failed, falling back to token search for "${word}"`);
        return this.findLocalVariableInfoLegacy(word, tokens, currentScope, document);
    }
    
    /**
     * Find procedure symbol that contains the given line
     */
    private findProcedureContainingLine(symbols: any[], line: number): any | null {
        for (const symbol of symbols) {
            if (symbol.range.start.line <= line && symbol.range.end.line >= line) {
                // Check if this is a procedure
                if (symbol.kind === 12) { // SymbolKind.Function
                    return symbol;
                }
                // Recursively search children
                if (symbol.children) {
                    const result = this.findProcedureContainingLine(symbol.children, line);
                    if (result) return result;
                }
            }
        }
        return null;
    }
    
    /**
     * Find variable in symbol's children by name (handles prefixed labels)
     */
    private findVariableInSymbol(symbol: any, fieldName: string): any | null {
        if (!symbol.children) return null;
        
        logger.info(`Searching for field "${fieldName}" in symbol with ${symbol.children.length} children`);
        
        for (const child of symbol.children) {
            // Check if this is a GROUP/QUEUE/FILE structure symbol (SymbolKind.Struct = 23)
            if (child.kind === 23) {
                // Extract group name from pattern like "GROUP (MyGroup)" or "QUEUE (MyQueue)"
                const groupNameMatch = child.name.match(/\(([^)]+)\)/);
                if (groupNameMatch) {
                    const groupName = groupNameMatch[1];
                    if (groupName.toLowerCase() === fieldName.toLowerCase()) {
                        logger.info(`✅ Matched GROUP/QUEUE/FILE structure: ${groupName}`);
                        return child;
                    }
                }
                
                // Also search within the structure's children
                if (child.children) {
                    const result = this.findVariableInSymbol(child, fieldName);
                    if (result) return result;
                }
            }
            // Check if this is a variable symbol (SymbolKind.Variable = 13)
            else if (child.kind === 13) {
                // Use _clarionVarName if available (more reliable), otherwise extract from name
                const varName = (child as any)._clarionVarName || child.name.match(/^([^\s]+)/)?.[1] || child.name;
                
                logger.info(`  PREFIX-CHECK: Checking child: varName="${varName}", _isPartOfStructure=${!!(child as any)._isPartOfStructure}, _possibleReferences=${(child as any)._possibleReferences ? JSON.stringify((child as any)._possibleReferences) : 'undefined'}`);
                
                // CRITICAL FIX: Check against _possibleReferences for structure fields
                // Structure fields can ONLY be accessed via their prefixed forms (PREFIX:Field)
                // or dot notation (Structure.Field), NEVER by unprefixed name alone
                if ((child as any)._isPartOfStructure && (child as any)._possibleReferences) {
                    const possibleRefs = (child as any)._possibleReferences as string[];
                    logger.info(`  PREFIX-CHECK: Structure field "${varName}" has possible references: ${possibleRefs.join(', ')}`);
                    
                    // Check if fieldName matches any of the valid prefixed/dotted references
                    const matchesReference = possibleRefs.some(ref => 
                        ref.toUpperCase() === fieldName.toUpperCase()
                    );
                    
                    // Also check if fieldName itself is the unprefixed varName - if so, REJECT it
                    const isUnprefixedMatch = varName.toUpperCase() === fieldName.toUpperCase();
                    
                    if (matchesReference && !isUnprefixedMatch) {
                        logger.info(`✅ PREFIX-MATCH: Matched structure field "${fieldName}" via valid reference`);
                        return child;
                    } else if (isUnprefixedMatch) {
                        logger.info(`❌ PREFIX-REJECT: "${fieldName}" cannot access structure field "${varName}" - must use ${possibleRefs.join(' or ')}`);
                        continue;
                    } else {
                        logger.info(`❌ PREFIX-SKIP: "${fieldName}" does not match any valid reference for structure field "${varName}"`);
                        continue;
                    }
                }
                // For regular variables (not structure fields), match exact name
                else if (varName.toLowerCase() === fieldName.toLowerCase()) {
                    logger.info(`✅ Matched regular variable: child.name="${child.name}", extracted="${varName}", searching for="${fieldName}"`);
                    return child;
                }
                
                // Also search nested children if this is a structure variable
                if (child.children) {
                    const result = this.findVariableInSymbol(child, fieldName);
                    if (result) return result;
                }
            }
            // For other kinds, still search children
            else if (child.children) {
                const result = this.findVariableInSymbol(child, fieldName);
                if (result) return result;
            }
        }
        
        logger.info(`❌ No match found for "${fieldName}"`);
        return null;
    }
    
    /**
     * Legacy token-based variable search (fallback)
     */
    private findLocalVariableInfoLegacy(word: string, tokens: Token[], currentScope: Token, document: TextDocument): { type: string; line: number } | null {
        logger.info(`PREFIX-LEGACY-START: Entering legacy search for "${word}", currentScope.subType=${currentScope.subType}`);
        
        // For PROCEDURE/METHOD: Search the DATA section (everything before CODE)
        if (currentScope.subType === TokenType.Procedure || 
            currentScope.subType === TokenType.MethodImplementation ||
            currentScope.subType === TokenType.MethodDeclaration) {
            
            logger.info(`Entering procedure DATA section search (subType matched: ${currentScope.subType})`);
            
            const codeMarker = currentScope.executionMarker;
            let dataEnd = codeMarker ? codeMarker.line : currentScope.finishesAt;
            
            // If we don't have a CODE marker or finishesAt, find the next procedure
            if (dataEnd === undefined) {
                const nextProcedure = tokens.find(t =>
                    (t.subType === TokenType.Procedure ||
                     t.subType === TokenType.MethodImplementation ||
                     t.subType === TokenType.MethodDeclaration) &&
                    t.line > currentScope.line
                );
                
                if (nextProcedure) {
                    dataEnd = nextProcedure.line;
                    logger.info(`Using next procedure at line ${dataEnd} as DATA section boundary`);
                } else {
                    dataEnd = tokens[tokens.length - 1].line;
                    logger.info(`No next procedure found, using end of file at line ${dataEnd}`);
                }
            }
            
            logger.info(`Searching procedure DATA section from line ${currentScope.line} to ${dataEnd}`);
            
            // Debug: Show all tokens with matching name in the range
            const allMatchingInRange = tokens.filter(t => 
                t.value.toLowerCase() === word.toLowerCase() &&
                t.line > currentScope.line &&
                (dataEnd === undefined || t.line < dataEnd)
            );
            logger.info(`Debug: Found ${allMatchingInRange.length} tokens matching "${word}" in range ${currentScope.line}-${dataEnd}`);
            allMatchingInRange.forEach(t => {
                logger.info(`  -> Line ${t.line}, Type: ${t.type}, Start: ${t.start}, Value: "${t.value}"`);
            });
            
            // Look for variables in DATA section, handling prefixed labels
            const variableTokens = tokens.filter(token => {
                // Match by name - either exact match or as part of prefixed label
                const exactMatch = token.value.toLowerCase() === word.toLowerCase();
                const prefixedMatch = token.type === TokenType.Label && 
                                     token.value.includes(':') &&
                                     token.value.toLowerCase().endsWith(':' + word.toLowerCase());
                
                if (!exactMatch && !prefixedMatch) {
                    return false;
                }
                
                if (token.type !== TokenType.Variable && token.type !== TokenType.Label) {
                    return false;
                }
                
                if (token.line <= currentScope.line || (dataEnd !== undefined && token.line >= dataEnd)) {
                    return false;
                }
                
                // For exact matches, handle prefixed variables (token not at position 0)
                if (exactMatch && token.start > 0) {
                    const labelAtStart = tokens.find(t =>
                        t.line === token.line &&
                        t.start === 0 &&
                        t.type === TokenType.Label
                    );
                    
                    if (labelAtStart && labelAtStart.value.includes(':')) {
                        logger.info(`Found prefixed label in hover: ${labelAtStart.value} with field: ${token.value} at line ${token.line}`);
                        return true;
                    }
                    
                    return false;
                }
                
                // Prefixed label match or token at position 0 is valid
                if (prefixedMatch) {
                    logger.info(`Found prefixed label by suffix match: ${token.value} at line ${token.line}`);
                }
                return true;
            });

            logger.info(`Found ${variableTokens.length} variable tokens for ${word} in procedure DATA section`);
            
            if (variableTokens.length > 0) {
                const varToken = variableTokens[0];
                logger.info(`PREFIX-LEGACY: Found token - value="${varToken.value}", isStructureField=${!!varToken.isStructureField}, structurePrefix="${varToken.structurePrefix}"`);
                
                // CRITICAL FIX: Check if this is a structure field that requires a prefix
                // Skip structure fields when searching for bare field names
                if (varToken.isStructureField || varToken.structurePrefix) {
                    logger.info(`PREFIX-LEGACY: Token "${varToken.value}" is a structure field with prefix "${varToken.structurePrefix}" - skipping for bare field name search`);
                    // Don't return structure fields for bare name searches
                    // They should only be accessible via prefix (LOC:Field) or dot notation (Group.Field)
                    return null;
                }
                
                // Get the source line to extract type information
                const content = document.getText();
                const lines = content.split('\n');
                const varLine = lines[varToken.line];
                
                if (varLine) {
                    // Extract type from the line - handle both simple and prefixed labels
                    const typeMatch = varLine.match(/\s+(&?[A-Z][A-Za-z0-9_]*(?:\([^)]*\))?)/i);
                    if (typeMatch) {
                        return {
                            type: typeMatch[1].trim(),
                            line: varToken.line
                        };
                    }
                }
            }
        }
        
        // Fallback to old logic for routines or if procedure search failed
        // Find variable tokens at column 0 within the current scope
        const variableTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
                token.type === TokenType.ReferenceVariable ||
                token.type === TokenType.ImplicitVariable ||
                token.subType === TokenType.Variable ||
                token.subType === TokenType.ReferenceVariable) &&
            token.value.toLowerCase() === word.toLowerCase() &&
            token.start === 0 &&
            token.line >= currentScope.line &&
            (currentScope.finishesAt === undefined || token.line <= currentScope.finishesAt)
        );

        logger.info(`Found ${variableTokens.length} variable tokens for ${word}`);
        
        if (variableTokens.length === 0) {
            // Debug: Check what tokens exist for this word
            const allMatchingTokens = tokens.filter(t => t.value.toLowerCase() === word.toLowerCase());
            logger.info(`Debug: Found ${allMatchingTokens.length} total tokens matching "${word}"`);
            allMatchingTokens.forEach(t => {
                logger.info(`  -> Line ${t.line}, Type: ${t.type}, SubType: ${t.subType}, Start: ${t.start}, Value: "${t.value}"`);
            });
            return null;
        }

        const varToken = variableTokens[0];
        logger.info(`PREFIX-LEGACY-OTHER: Found token - value="${varToken.value}", line=${varToken.line}, type=${varToken.type}`);
        logger.info(`PREFIX-LEGACY-OTHER: Token properties - isStructureField=${varToken.isStructureField}, structurePrefix=${varToken.structurePrefix}`);
        logger.info(`PREFIX-LEGACY-OTHER: Token object keys: ${Object.keys(varToken).join(', ')}`);
        
        // CRITICAL FIX: Check if this is a structure field that requires a prefix
        // Skip structure fields when searching for bare field names
        if (varToken.isStructureField || varToken.structurePrefix) {
            logger.info(`PREFIX-LEGACY-OTHER: Token "${varToken.value}" is a structure field with prefix "${varToken.structurePrefix}" - skipping for bare field name search`);
            return null;
        }
        
        // Get the source line to extract type information
        const content = document.getText();
        const lines = content.split('\n');
        const sourceLine = lines[varToken.line];
        
        // Parse the variable declaration: varName   type[,attributes]
        // Examples: "AllocLen  long,auto" or "oldString   &string"
        const typeMatch = sourceLine.match(/^[A-Za-z_][A-Za-z0-9_]*\s+(&?[A-Za-z_][A-Za-z0-9_]*(?:,[A-Za-z_][A-Za-z0-9_]*)*)/i);
        if (typeMatch) {
            return { type: typeMatch[1], line: varToken.line };
        }
        
        // Fallback: Try to find the type declaration on the same line using tokens
        const lineTokens = tokens.filter(t => t.line === varToken.line);
        const typeTokens = lineTokens.filter(t => 
            t.type === TokenType.Type || 
            t.type === TokenType.Structure ||
            t.type === TokenType.ReferenceVariable ||
            t.value.toUpperCase() === 'LONG' ||
            t.value.toUpperCase() === 'STRING' ||
            t.value.toUpperCase() === 'SHORT' ||
            t.value.toUpperCase() === 'BYTE'
        );

        const type = typeTokens.length > 0 ? typeTokens[0].value : 'Unknown';

        return { type, line: varToken.line };
    }

    /**
     * Counts parameters in a function call
     * Returns null if unable to parse
     * Counts omitted parameters (e.g., AT(,,435,300) = 4 parameters)
     */
    private countParametersInCall(line: string, functionName: string): number | null {
        // Find the function call in the line
        const funcPattern = new RegExp(`\\b${functionName}\\s*\\(`, 'i');
        const match = line.match(funcPattern);
        if (!match || match.index === undefined) {
            return null;
        }

        const startPos = match.index + match[0].length;
        let depth = 1;
        let paramCount = 1; // Start at 1 - if there's any content, we have at least 1 parameter
        let isEmpty = true; // Track if we've seen any content at all

        for (let i = startPos; i < line.length; i++) {
            const char = line[i];

            if (char === '(') {
                depth++;
                isEmpty = false;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    // Found closing paren
                    // If completely empty parentheses, return 0
                    if (isEmpty) {
                        return 0;
                    }
                    return paramCount;
                }
                isEmpty = false;
            } else if (char === ',' && depth === 1) {
                // Each comma at depth 1 means another parameter
                paramCount++;
            } else if (char.trim() !== '') {
                // Any non-whitespace character means we have content
                isEmpty = false;
            }
        }

        // Unclosed parentheses - return what we have so far
        // If we saw any content, return the count
        return isEmpty ? null : paramCount;
    }

    /**
     * Counts parameters in a function/attribute call
     * Returns null if unable to parse, 0 if empty parentheses
     */
    private countFunctionParameters(line: string, word: string, wordRange: Range, document: TextDocument): number | null {
        // Check if there's an opening paren after the word
        const textAfterWord = document.getText({
            start: { line: wordRange.start.line, character: wordRange.end.character },
            end: { line: wordRange.start.line, character: Math.min(wordRange.end.character + 10, line.length) }
        }).trimStart();
        
        if (textAfterWord.startsWith('(')) {
            // There's a paren, count the actual parameters
            return this.countParametersInCall(line, word);
        } else {
            // No paren after word - assume no parameters
            return 0;
        }
    }

    /**
     * Builds markdown lines for scope information
     */
    private buildScopeMarkdown(scopeInfo: { type: string } | null): string[] {
        if (!scopeInfo) return [];
        
        const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
        const scopeLabel = scopeInfo.type === 'global' ? 'Global variable' : 'Module variable';
        
        return [
            `${scopeIcon} ${scopeLabel}`
        ];
    }

    /**
     * Builds markdown for file location info
     */
    private buildLocationInfo(uri: string, lineNumber: number): string {
        const fileName = path.basename(uri.replace('file:///', ''));
        return `Declared in ${fileName}:${lineNumber}`;
    }

    /**
     * Finds a global variable in the given tokens
     * Returns variable info including type, line, and scope
     */
    private findGlobalVariable(
        searchWord: string, 
        tokens: Token[], 
        document: TextDocument
    ): { token: Token; typeInfo: string; scopeInfo: any } | null {
        // Find first CODE token to establish boundary for global scope
        const firstCodeToken = tokens.find(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'CODE'
        );
        const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;
        
        // Search for global variable (Label at column 0, before first CODE)
        const globalVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line < globalScopeEndLine &&
            t.value.toLowerCase() === searchWord.toLowerCase()
        );
        
        if (!globalVar) return null;
        
        logger.info(`✅ Found global variable: ${globalVar.value} at line ${globalVar.line}`);
        
        // Find the type by looking at the next token
        const globalIndex = tokens.indexOf(globalVar);
        let typeInfo = 'UNKNOWN';
        if (globalIndex + 1 < tokens.length) {
            const nextToken = tokens[globalIndex + 1];
            if (nextToken.line === globalVar.line) {
                if (nextToken.type === TokenType.Type) {
                    typeInfo = nextToken.value;
                } else if (nextToken.type === TokenType.Structure) {
                    typeInfo = nextToken.value.toUpperCase();
                }
            }
        }
        
        // Get scope info for the global variable
        const globalPos: Position = { line: globalVar.line, character: globalVar.start };
        const scopeInfo = this.scopeAnalyzer.getTokenScope(document, globalPos);
        
        return { token: globalVar, typeInfo, scopeInfo };
    }

    /**
     * Finds a module-local variable in the given tokens
     * Returns variable info including type, line, and scope
     */
    private findModuleLocalVariable(
        searchWord: string,
        tokens: Token[],
        document: TextDocument
    ): { token: Token; typeInfo: string; isStructureDefinition: boolean; scopeInfo: any } | null {
        // Find first PROCEDURE token to establish boundary for module scope
        const firstProcToken = tokens.find(t => 
            t.type === TokenType.Label &&
            t.subType === TokenType.Procedure &&
            t.start === 0
        );
        const moduleScopeEndLine = firstProcToken ? firstProcToken.line : Number.MAX_SAFE_INTEGER;
        
        // Search for module-local variable (Label at column 0, before first PROCEDURE)
        const moduleVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line < moduleScopeEndLine &&
            t.value.toLowerCase() === searchWord.toLowerCase()
        );
        
        if (!moduleVar) return null;
        
        logger.info(`✅ Found module-local variable: ${moduleVar.value} at line ${moduleVar.line}`);
        
        // Find the type by looking at the next token
        const moduleIndex = tokens.indexOf(moduleVar);
        let typeInfo = 'UNKNOWN';
        let isStructureDefinition = false;
        
        if (moduleIndex + 1 < tokens.length) {
            const nextToken = tokens[moduleIndex + 1];
            if (nextToken.line === moduleVar.line) {
                if (nextToken.type === TokenType.Type) {
                    typeInfo = nextToken.value;
                } else if (nextToken.type === TokenType.Structure) {
                    typeInfo = nextToken.value.toUpperCase();
                    isStructureDefinition = true;
                }
            }
        }
        
        // Get scope info for the module-local variable
        const modulePos: Position = { line: moduleVar.line, character: 0 };
        const scopeInfo = this.scopeAnalyzer.getTokenScope(document, modulePos);
        
        return { token: moduleVar, typeInfo, isStructureDefinition, scopeInfo };
    }

    /**
     * Builds hover content for a global or module-local variable
     */
    private buildVariableHover(
        varName: string,
        typeInfo: string,
        isGlobal: boolean,
        isStructureDefinition: boolean,
        scopeInfo: any,
        uri: string,
        line: number
    ): Hover {
        const markdown = [
            `**${varName}** — \`${typeInfo}\``,
            ``
        ];
        
        markdown.push(...this.buildScopeMarkdown(scopeInfo));
        markdown.push(this.buildLocationInfo(uri, line + 1));
        markdown.push(``);
        markdown.push(`F12 → Go to declaration`);
        
        return {
            contents: {
                kind: 'markdown',
                value: markdown.join('\n')
            }
        };
    }

    /**
     * Check if a word is a CLASS type and provide hover with definition info
     * @param word The word to check
     * @param document The document
     * @returns Hover with class definition info, or null if not a class
     */
    private async checkClassTypeHover(word: string, document: TextDocument): Promise<Hover | null> {
        try {
            const classIndexer = new ClassDefinitionIndexer();
            
            // Get project path from document URI
            const docPath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
            const projectPath = path.dirname(docPath);
            
            logger.info(`Looking up CLASS type: ${word} in project: ${projectPath}`);
            
            // Try to get or build index for this project
            const index = await classIndexer.getOrBuildIndex(projectPath);
            
            // Look up the class
            const definitions = classIndexer.findClass(word, projectPath);
            
            if (definitions && definitions.length > 0) {
                const def = definitions[0]; // Use first definition
                
                logger.info(`Found CLASS definition: ${def.className} in ${def.filePath}:${def.lineNumber}`);
                
                // Extract just the filename from the full path
                const fileName = path.basename(def.filePath);
                
                // ✅ NEW: Verify the class file is included in current scope
                logger.info(`Verifying if ${fileName} is included...`);
                const isIncluded = await this.includeVerifier.isClassIncluded(fileName, document);
                
                if (!isIncluded) {
                    logger.info(`❌ ${fileName} is not included in current scope - skipping hover`);
                    return null;
                }
                
                logger.info(`✅ Found CLASS type: ${def.className} and verified it's included`);
                
                const relativePath = path.relative(projectPath, def.filePath);
                
                // Parse class file for required constants
                const constantParser = new ClassConstantParser();
                const classConstants = await constantParser.parseFile(def.filePath);
                const thisClassConstants = classConstants.find(c => c.className.toLowerCase() === def.className.toLowerCase());
                
                // Build hover text
                const classInfo = [
                    `**CLASS Type:** \`${def.className}\``,
                    ``,
                    `**Definition:**`,
                    `- File: \`${fileName}\``,
                    `- Line: ${def.lineNumber}`,
                    `- Path: \`${relativePath}\``,
                    `- Type: ${def.isType ? 'CLASS,TYPE' : 'CLASS'}`,
                ];
                
                if (def.parentClass) {
                    classInfo.push(`- Parent: \`${def.parentClass}\``);
                }
                
                // Add required constants information
                if (thisClassConstants && thisClassConstants.constants.length > 0) {
                    logger.info(`Found ${thisClassConstants.constants.length} constants for ${def.className}`);
                    
                    // Check which constants are missing from the project
                    const constantsChecker = new ProjectConstantsChecker();
                    const missingConstants = [];
                    
                    for (const constant of thisClassConstants.constants) {
                        const isDefined = await constantsChecker.isConstantDefined(constant.name, projectPath);
                        logger.info(`Constant ${constant.name} defined: ${isDefined}`);
                        if (!isDefined) {
                            missingConstants.push(constant);
                        }
                    }
                    
                    logger.info(`Missing constants count: ${missingConstants.length}`);
                    
                    if (missingConstants.length > 0) {
                        classInfo.push(``);
                        classInfo.push(`**⚠️ Missing Constants:**`);
                        
                        for (const constant of missingConstants) {
                            const typeDesc = constant.type === 'Link' ? 'Link mode' : 'DLL mode';
                            const fileInfo = constant.relatedFile ? ` (${constant.relatedFile})` : '';
                            classInfo.push(`- \`${constant.name}\` - ${typeDesc}${fileInfo}`);
                        }
                        
                        // Generate suggested definitions for missing constants only
                        const linkModeDefs = constantParser.generateConstantDefinitions(missingConstants, true);
                        const dllModeDefs = constantParser.generateConstantDefinitions(missingConstants, false);
                        
                        classInfo.push(``);
                        classInfo.push(`**Suggested Values:**`);
                        classInfo.push(`- **Link mode:** \`${linkModeDefs}\``);
                        classInfo.push(`- **DLL mode:** \`${dllModeDefs}\``);
                        
                        logger.info(`Listed ${missingConstants.length} missing constants`);
                    } else {
                        // All constants are defined
                        classInfo.push(``);
                        classInfo.push(`✅ **All required constants are defined in project**`);
                    }
                }
                
                classInfo.push(``);
                classInfo.push(`*Part of ${index.classes.size} indexed classes*`);
                
                const hoverMarkdown = classInfo.join('\n');
                logger.info(`Hover markdown length: ${hoverMarkdown.length} chars`);
                logger.info(`Hover markdown preview: ${hoverMarkdown.substring(0, 200)}...`);
                logger.info(`Hover markdown end: ...${hoverMarkdown.substring(hoverMarkdown.length - 200)}`);
                
                // Log the full markdown to see exactly what's being sent
                logger.info(`===== FULL HOVER MARKDOWN =====`);
                logger.info(hoverMarkdown);
                logger.info(`===== END HOVER MARKDOWN =====`);
                
                return {
                    contents: {
                        kind: 'markdown',
                        value: hoverMarkdown
                    }
                };
            }
            
            logger.info(`No CLASS definition found for: ${word}`);
        } catch (error) {
            logger.error(`Error checking class type hover: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return null;
    }

}
