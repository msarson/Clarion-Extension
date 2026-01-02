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
import { ClarionPatterns } from '../utils/ClarionPatterns';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("HoverProvider");
logger.setLevel("error"); // Production: Only log errors

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

    constructor() {
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.formatter = new HoverFormatter(this.scopeAnalyzer);
        this.contextHandler = new ContextualHoverHandler(this.builtinService, this.attributeService);
        this.symbolResolver = new SymbolHoverResolver(this.dataTypeService, this.controlService);
        this.variableResolver = new VariableHoverResolver(this.formatter, this.scopeAnalyzer, this.tokenCache);
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
            const detection = ProcedureCallDetector.isProcedureCallOrReference(document, position, wordRange);
            
            if (detection.isProcedure) {
                logger.info(`Detected procedure ${ProcedureCallDetector.getDetectionMessage(word, detection.isStartCall)}`);
                
                // Get tokens for parameter counting
                const tokens = this.tokenCache.getTokens(document);
                
                // Find MAP declaration first
                const mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);
                
                let procImpl = null;
                if (mapDecl) {
                    // Check if MAP declaration is from an INCLUDE file
                    const mapDeclUri = mapDecl.uri;
                    const isFromInclude = mapDeclUri !== document.uri;
                    
                    if (isFromInclude) {
                        logger.info(`MAP declaration is from INCLUDE file: ${mapDeclUri}`);
                        // Load the INCLUDE file and its tokens
                        try {
                            const fs = require('fs');
                            const decodedPath = decodeURIComponent(mapDeclUri.replace('file:///', ''));
                            const includeContent = fs.readFileSync(decodedPath, 'utf-8');
                            const includeDoc = TextDocument.create(mapDeclUri, 'clarion', 1, includeContent);
                            const includeTokens = this.tokenCache.getTokens(includeDoc);
                            
                            // Find implementation using INCLUDE file's document and tokens
                            const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                            procImpl = await this.mapResolver.findProcedureImplementation(
                                word,
                                includeTokens,
                                includeDoc,
                                mapPosition,
                                line
                            );
                        } catch (error) {
                            logger.info(`Error loading INCLUDE file: ${error}`);
                        }
                    } else {
                        // Find implementation using MAP declaration position in current document
                        const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                        procImpl = await this.mapResolver.findProcedureImplementation(
                            word,
                            tokens,
                            document,
                            mapPosition, // Use MAP position, not call position
                            line
                        );
                    }
                }
                
                if (mapDecl || procImpl) {
                    return this.formatter.formatProcedure(word, mapDecl, procImpl, document, position);
                }
            }

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
                
                // Check if there's an opening paren after the word
                const textAfterWord = document.getText({
                    start: { line: position.line, character: wordRange.end.character },
                    end: { line: position.line, character: Math.min(wordRange.end.character + 10, line.length) }
                }).trimStart();
                
                let paramCount: number | null = null;
                
                if (textAfterWord.startsWith('(')) {
                    // There's a paren, count the actual parameters
                    paramCount = this.countParametersInCall(line, word);
                    logger.info(`Attribute parameter count: ${paramCount}`);
                } else {
                    // No paren after word - assume no parameters
                    paramCount = 0;
                    logger.info(`No parentheses found for attribute - assuming 0 parameters`);
                }
                
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
                    
                    // Check if there's an opening paren after the word
                    const textAfterWord = document.getText({
                        start: { line: position.line, character: wordRange.end.character },
                        end: { line: position.line, character: Math.min(wordRange.end.character + 10, line.length) }
                    }).trimStart();
                    
                    let paramCount: number | null = null;
                    
                    if (textAfterWord.startsWith('(')) {
                        // There's a paren, count the actual parameters
                        paramCount = this.countParametersInCall(line, word);
                        logger.info(`Parameter count in call: ${paramCount}`);
                    } else {
                        // No paren after word - assume () (zero parameters)
                        paramCount = 0;
                        logger.info(`No parentheses found - assuming 0 parameters`);
                    }
                    
                    return this.formatter.formatBuiltin(word, signatures, paramCount);
                } else {
                    logger.info(`Word ${word} is preceded by dot - treating as class method, not built-in`);
                }
            }
            
            // Check if this is a method implementation line and show declaration hover
            
            const methodImplMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION_LEGACY);
            if (methodImplMatch) {
                const className = methodImplMatch[1];
                const methodName = methodImplMatch[2];
                
                // Count parameters from the implementation signature
                const paramCount = this.overloadResolver.countParametersInDeclaration(line);
                
                // Check if cursor is on the class or method name
                const classStart = line.indexOf(className);
                const classEnd = classStart + className.length;
                const methodStart = line.indexOf(methodName, classEnd);
                const methodEnd = methodStart + methodName.length;
                
                if ((position.character >= classStart && position.character <= classEnd) ||
                    (position.character >= methodStart && position.character <= methodEnd)) {
                    const tokens = this.tokenCache.getTokens(document);
                    // Pass the full line as implementation signature for type matching
                    const declInfo = this.overloadResolver.findMethodDeclaration(className, methodName, document, tokens, paramCount, line);
                    if (declInfo) {
                        return this.formatter.formatMethodImplementation(methodName, className, declInfo);
                    }
                }
            }

            // Check if this is a MAP procedure implementation and show declaration hover
            // Skip if we're inside a MAP block (those are declarations, not implementations)
            const mapProcMatch = line.match(/^(\w+)\s+PROCEDURE\s*\(/i);
            logger.info(`MAP procedure regex test: line="${line}", match=${!!mapProcMatch}, inMapBlock=${documentStructure.isInMapBlock(position.line)}`);
            if (mapProcMatch && !documentStructure.isInMapBlock(position.line)) {
                const procName = mapProcMatch[1];
                const procNameEnd = mapProcMatch.index! + procName.length;
                
                // Check if cursor is on the procedure name
                if (position.character >= mapProcMatch.index! && position.character <= procNameEnd) {
                    // Determine scope for this procedure implementation
                    const tokens = this.tokenCache.getTokens(document);
                    const firstNonCommentToken = tokens.find(t => t.type !== TokenType.Comment);
                    const isProgramFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                                         firstNonCommentToken.value.toUpperCase() === 'PROGRAM';
                    const isMemberFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                                        (firstNonCommentToken.value.toUpperCase() === 'MEMBER' || 
                                         firstNonCommentToken.value.toUpperCase().startsWith('MEMBER('));
                    
                    const scopeIcon = isProgramFile ? '🌍' : (isMemberFile ? '📦' : '');
                    const scopeText = isProgramFile ? 'Global' : (isMemberFile ? 'Module' : '');
                    
                    // Find the MAP declaration for this procedure using resolver
                    // Pass implementation signature for overload resolution
                    const mapLocation = this.mapResolver.findMapDeclaration(procName, tokens, document, line);
                    
                    if (!mapLocation) {
                        // Not found in current file, check for MEMBER
                        logger.info(`MAP declaration not found in current file, checking for MEMBER...`);
                        const memberToken = tokens.find(t => 
                            t.line < 5 && 
                            t.value.toUpperCase() === 'MEMBER' &&
                            t.referencedFile
                        );
                        
                        if (memberToken?.referencedFile) {
                            logger.info(`Found MEMBER('${memberToken.referencedFile}'), searching parent for MAP declaration`);
                            
                            // Use CrossFileResolver to find MAP declaration
                            const memberMapResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                                procName,
                                memberToken.referencedFile,
                                document,
                                line
                            );
                            
                            if (memberMapResult) {
                                // Found MAP in parent file - use it
                                const implLocation: Location = {
                                    uri: document.uri,
                                    range: {
                                        start: { line: position.line, character: mapProcMatch.index! },
                                        end: { line: position.line, character: procNameEnd }
                                    }
                                };
                                
                                return this.formatter.formatProcedure(procName, memberMapResult.location, implLocation, document, position);
                            }
                        }
                    } else {
                        // Found MAP in current file
                        const implLocation: Location = {
                            uri: document.uri,
                            range: {
                                start: { line: position.line, character: mapProcMatch.index! },
                                end: { line: position.line, character: procNameEnd }
                            }
                        };
                        
                        return this.formatter.formatProcedure(procName, mapLocation, implLocation, document, position);
                    }
                }
            }

            // Check if this is inside a MAP block (declaration) and show implementation hover
            if (documentStructure.isInMapBlock(position.line)) {
                logger.info(`Inside MAP block at line ${position.line}`);
                // MAP declarations have two formats:
                // 1. Indented: "    MyProc(params)" - no PROCEDURE keyword
                // 2. Column 0: "MyProc    PROCEDURE(params)" - with PROCEDURE keyword
                const mapDeclMatch = line.match(/^\s*(\w+)\s*(?:PROCEDURE\s*)?\(/i);
                logger.info(`MAP declaration regex match: ${mapDeclMatch ? 'YES' : 'NO'}, line="${line}"`);
                if (mapDeclMatch) {
                    const procName = mapDeclMatch[1];
                    const procNameStart = line.indexOf(procName);
                    const procNameEnd = procNameStart + procName.length;
                    
                    logger.info(`Procedure name: "${procName}", range: ${procNameStart}-${procNameEnd}, cursor at: ${position.character}`);
                    
                    // Check if cursor is on the procedure name
                    if (position.character >= procNameStart && position.character <= procNameEnd) {
                        logger.info(`Cursor is on procedure name, searching for implementation with overload resolution...`);
                        
                        // Use MapProcedureResolver for overload resolution
                        const tokens = this.tokenCache.getTokens(document);
                        const implLocation = await this.mapResolver.findProcedureImplementation(
                            procName, 
                            tokens, 
                            document, 
                            position, 
                            line,  // Pass declaration signature for overload matching
                            documentStructure  // Pass cached structure for performance
                        );
                        
                        // Use the standard procedure hover construction
                        const mapDecl: Location = {
                            uri: document.uri,
                            range: {
                                start: { line: position.line, character: procNameStart },
                                end: { line: position.line, character: procNameEnd }
                            }
                        };
                        
                        return this.formatter.formatProcedure(procName, mapDecl, implLocation, document, position);
                    } else {
                        logger.info(`Cursor NOT on procedure name (cursor at ${position.character}, name range ${procNameStart}-${procNameEnd})`);
                    }
                }
            }

            // Check if this is a method declaration in a CLASS (declaration) and show implementation hover
            const methodTokens = this.tokenCache.getTokens(document);
            
            logger.info(`Checking for method declaration at line ${position.line}, char ${position.character}`);
            logger.info(`Total tokens at this line: ${methodTokens.filter(t => t.line === position.line).length}`);
            
            // Look for a token that could be a method declaration
            // It could be:
            // 1. A token with subType=MethodDeclaration
            // 2. A Label token followed by PROCEDURE on the same line (method declaration in CLASS)
            const lineTokens = methodTokens.filter(t => t.line === position.line);
            
            let currentToken = lineTokens.find(t =>
                t.subType === TokenType.MethodDeclaration &&
                position.character >= t.start &&
                position.character <= t.start + t.value.length
            );
            
            // If not found by subType, check if this is a Label followed by PROCEDURE (method declaration pattern)
            if (!currentToken) {
                const labelToken = lineTokens.find(t => 
                    t.type === TokenType.Label && 
                    t.start === 0 &&
                    position.character >= t.start &&
                    position.character <= t.start + t.value.length
                );
                
                const procedureToken = lineTokens.find(t => 
                    t.value.toUpperCase() === 'PROCEDURE'
                );
                
                // If we have a label at start of line and PROCEDURE on same line, it's likely a method declaration
                if (labelToken && procedureToken) {
                    logger.info(`Found method declaration pattern: Label="${labelToken.value}" + PROCEDURE on line ${position.line}`);
                    currentToken = labelToken;
                }
            }
            
            if (!currentToken) {
                // Debug: show what tokens are on this line
                logger.info(`Tokens on line ${position.line}:`);
                lineTokens.forEach(t => {
                    logger.info(`  - type=${t.type}, subType=${t.subType}, value="${t.value}", start=${t.start}, label="${t.label}"`);
                });
            }
            
            if (currentToken && currentToken.label) {
                logger.info(`Found method declaration: ${currentToken.label} at line ${position.line}`);
                
                // Find the class token and then look for MODULE token on same line
                const classToken = this.findClassTokenForMethodDeclaration(methodTokens, position.line);
                
                if (classToken && classToken.label) {
                    const className = classToken.label;
                    
                    // Find MODULE token on the same line as the class (after the CLASS token)
                    const moduleToken = methodTokens.find(t => 
                        t.line === classToken.line &&
                        t.start > classToken.start &&  // Must come after CLASS token
                        t.referencedFile &&
                        t.value.toUpperCase().includes('MODULE')
                    );
                    
                    const moduleFile = moduleToken?.referencedFile;
                    
                    // Debug: Show all tokens on the CLASS line
                    if (!moduleFile) {
                        logger.info(`❌ No MODULE token found on class line ${classToken.line}. Tokens on this line:`);
                        const lineTokens = methodTokens.filter(t => t.line === classToken.line);
                        lineTokens.forEach(t => {
                            logger.info(`  Token: type=${t.type}, value="${t.value}", start=${t.start}, referencedFile=${t.referencedFile}`);
                        });
                    }
                    
                    logger.info(`Method ${currentToken.label} belongs to class ${className}`);
                    if (moduleFile) {
                        logger.info(`Class references MODULE: ${moduleFile}`);
                    }
                    
                    // Count parameters in the declaration
                    const paramCount = this.overloadResolver.countParametersInDeclaration(line);
                    
                    // Search for implementation using cross-file lookup
                    const implLocation = await this.findMethodImplementationCrossFile(
                        className,
                        currentToken.label,
                        document,
                        paramCount,
                        moduleFile
                    );
                    
                    if (implLocation) {
                        logger.info(`✅ Found implementation at ${implLocation}:${implLocation.split(':')[1]}`);
                        
                        // Get preview of implementation
                        const implInfo = await this.getMethodImplementationPreview(implLocation);
                        if (implInfo) {
                            return {
                                contents: {
                                    kind: 'markdown',
                                    value: `**Implementation** _(Press Ctrl+F12 to navigate)_ — line ${implInfo.line + 1}\n\n\`\`\`clarion\n${implInfo.preview}\n\`\`\``
                                }
                            };
                        }
                    } else {
                        logger.info(`❌ No implementation found for ${className}.${currentToken.label}`);
                        return {
                            contents: {
                                kind: 'markdown',
                                value: `**Method Declaration:** \`${className}.${currentToken.label}\`\n\n⚠️ *Implementation not found*`
                            }
                        };
                    }
                } else {
                    // This is a standalone PROCEDURE (not a CLASS method)
                    logger.info(`Standalone PROCEDURE detected: ${currentToken.label}`);
                    
                    // Extract signature from the line
                    const signature = line.trim();
                    
                    // Determine if this procedure is global (PROGRAM file) or module-local (MEMBER file)
                    // Look for PROGRAM or MEMBER as the first non-comment token in the file
                    const allTokens = this.tokenCache.getTokens(document);
                    const firstNonCommentToken = allTokens.find(t => t.type !== TokenType.Comment);
                    
                    const isProgramFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                                         firstNonCommentToken.value.toUpperCase() === 'PROGRAM';
                    const isMemberFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                                        (firstNonCommentToken.value.toUpperCase() === 'MEMBER' || 
                                         firstNonCommentToken.value.toUpperCase().startsWith('MEMBER('));
                    
                    const scopeIcon = isProgramFile ? '🌍' : (isMemberFile ? '📦' : '');
                    const scopeText = isProgramFile ? 'Global' : (isMemberFile ? 'Module' : '');
                    const header = scopeText ? `**PROCEDURE** ${scopeIcon} ${scopeText}` : `**PROCEDURE**`;
                    
                    // We're at the implementation - try to find and show the MAP declaration
                    // First try local MAP
                    let mapDecl = this.mapResolver.findMapDeclaration(currentToken.label || word, allTokens, document, line);
                    
                    // If not found locally and we're in a MEMBER file, check parent file's MAP
                    if (!mapDecl && isMemberFile) {
                        const memberToken = allTokens.find(t => 
                            t.line < 5 && // MEMBER should be at top of file
                            t.value.toUpperCase() === 'MEMBER' &&
                            t.referencedFile
                        );
                        
                        if (memberToken?.referencedFile) {
                            logger.info(`Checking parent file ${memberToken.referencedFile} for MAP declaration of ${currentToken.label || word}`);
                            const memberResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                                currentToken.label || word,
                                memberToken.referencedFile,
                                document,
                                line
                            );
                            if (memberResult) {
                                mapDecl = memberResult.location;
                            }
                        }
                    }
                    
                    let displaySignature = signature;
                    let fileInfo = '';
                    if (mapDecl) {
                        try {
                            // Read the MAP declaration line
                            const mapUri = decodeURIComponent(mapDecl.uri.replace('file:///', ''));
                            const mapContent = fs.readFileSync(mapUri, 'utf-8');
                            const mapLines = mapContent.split('\n');
                            const mapLine = mapLines[mapDecl.range.start.line];
                            
                            if (mapLine) {
                                const trimmedMapLine = mapLine.trim();
                                displaySignature = trimmedMapLine;
                                const fileName = path.basename(mapUri);
                                const lineNumber = mapDecl.range.start.line + 1; // Convert to 1-based
                                fileInfo = `\n\n**Defined in** \`${fileName}\` @ line ${lineNumber}`;
                                logger.info(`Found MAP declaration: ${trimmedMapLine}`);
                            }
                        } catch (error) {
                            logger.error(`Error reading MAP declaration: ${error}`);
                        }
                    }
                    
                    return {
                        contents: {
                            kind: 'markdown',
                            value: `${header}\n\n\`\`\`clarion\n${displaySignature}\n\`\`\`${fileInfo}\n\n*Press F12 to navigate to definition*`
                        }
                    };
                }
            }

            // Check if this is a structure/group name followed by a dot (e.g., hovering over "MyGroup" in "MyGroup.MyVar")
            // Search for a dot starting from the word's position in the line
            const wordStartInLine = line.indexOf(word, Math.max(0, position.character - word.length));
            const dotIndex = line.indexOf('.', wordStartInLine);
            
            if (dotIndex > wordStartInLine && dotIndex < wordStartInLine + word.length + 5) {
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
                    if (beforeDot.toLowerCase() === 'self' || beforeDot.endsWith('self')) {
                        // self.member - class member
                        const tokens = this.tokenCache.getTokens(document);
                        
                        // If it's a method call, count parameters
                        let paramCount: number | undefined;
                        if (hasParentheses) {
                            paramCount = this.memberResolver.countParametersInCall(line, fieldName);
                            logger.info(`Method call detected with ${paramCount} parameters`);
                        }
                        
                        const memberInfo = this.memberResolver.findClassMemberInfo(fieldName, document, position.line, tokens, paramCount);
                        if (memberInfo) {
                            return this.formatter.formatClassMember(fieldName, memberInfo);
                        }
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
                    t.value.toLowerCase() === word.toLowerCase()
                );
                
                if (globalVar) {
                    logger.info(`✅ Found global variable in current file: ${globalVar.value} at line ${globalVar.line}`);
                    
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
                    const globalPos: Position = { line: globalVar.line, character: 0 };
                    const scopeInfo = this.scopeAnalyzer.getTokenScope(document, globalPos);
                    
                    const markdown = [
                        `**Global Variable:** \`${globalVar.value}\``,
                        ``,
                        `**Type:** \`${typeInfo}\``,
                        ``
                    ];
                    
                    if (scopeInfo) {
                        const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
                        markdown.push(`**Scope:** ${scopeIcon} ${scopeInfo.type.charAt(0).toUpperCase() + scopeInfo.type.slice(1)}`);
                        markdown.push(``);
                        
                        if (scopeInfo.type === 'global') {
                            markdown.push(`**Visibility:** Visible everywhere`);
                        } else {
                            markdown.push(`**Visibility:** Visible only within this file (module-local)`);
                        }
                        markdown.push(``);
                    }
                    
                    // Show file and line info similar to procedures
                    const fileName = path.basename(document.uri.replace('file:///', ''));
                    const lineNumber = globalVar.line + 1; // Convert to 1-based
                    markdown.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}`);
                    markdown.push(``);
                    markdown.push(`*Press F12 to go to declaration*`);
                    
                    return {
                        contents: {
                            kind: 'markdown',
                            value: markdown.join('\n')
                        }
                    };
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
                            
                            // Find first CODE token to establish boundary for global scope
                            const firstCodeToken = parentTokens.find(t => 
                                t.type === TokenType.Keyword && 
                                t.value.toUpperCase() === 'CODE'
                            );
                            const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;
                            
                            // Search for global variable (Label at column 0, before first CODE)
                            const globalVar = parentTokens.find(t =>
                                t.type === TokenType.Label &&
                                t.start === 0 &&
                                t.line < globalScopeEndLine &&
                                t.value.toLowerCase() === word.toLowerCase()
                            );
                            
                            if (globalVar) {
                                logger.info(`✅ Found global variable in MEMBER parent: ${globalVar.value} at line ${globalVar.line}`);
                                
                                // Find the type by looking at the next token
                                const globalIndex = parentTokens.indexOf(globalVar);
                                let typeInfo = 'UNKNOWN';
                                if (globalIndex + 1 < parentTokens.length) {
                                    const nextToken = parentTokens[globalIndex + 1];
                                    if (nextToken.line === globalVar.line) {
                                        if (nextToken.type === TokenType.Type) {
                                            typeInfo = nextToken.value;
                                        } else if (nextToken.type === TokenType.Structure) {
                                            typeInfo = nextToken.value.toUpperCase();
                                        }
                                    }
                                }
                                
                                // Use ScopeAnalyzer to get detailed scope info
                                const globalPos: Position = { line: globalVar.line, character: globalVar.start };
                                const scopeInfo = this.scopeAnalyzer.getTokenScope(parentDoc, globalPos);
                                
                                const markdown = [
                                    `**Global Variable:** \`${globalVar.value}\``,
                                    ``,
                                    `**Type:** \`${typeInfo}\``,
                                    ``
                                ];
                                
                                if (scopeInfo) {
                                    const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
                                    markdown.push(`**Scope:** ${scopeIcon} ${scopeInfo.type.charAt(0).toUpperCase() + scopeInfo.type.slice(1)}`);
                                    markdown.push(``);
                                    
                                    if (scopeInfo.type === 'global') {
                                        markdown.push(`**Visibility:** Visible everywhere`);
                                    } else {
                                        markdown.push(`**Visibility:** Visible only within this file (module-local)`);
                                    }
                                    markdown.push(``);
                                }
                                
                                // Show file and line info similar to procedures
                                const fileName = path.basename(memberToken.referencedFile);
                                const lineNumber = globalVar.line + 1; // Convert to 1-based
                                markdown.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}`);
                                markdown.push(``);
                                markdown.push(`*Press F12 to go to declaration*`);
                                
                                return {
                                    contents: {
                                        kind: 'markdown',
                                        value: markdown.join('\n')
                                    }
                                };
                            }
                        } catch (err) {
                            logger.error(`Error reading MEMBER parent file: ${err}`);
                        }
                    }
                }
                
                logger.info('No scope found and no global variable found - cannot provide hover');
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
            const variableHover = this.variableResolver.findLocalVariableHover(searchWord, tokens, currentScope, document, word);
            if (variableHover) return variableHover;
            logger.info(`${searchWord} is not a local variable`);
            
            // 🔗 Check for module-local variable in current file (Label at column 0, before first PROCEDURE)
            logger.info(`Checking for module-local variable in current file...`);
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
            
            if (moduleVar) {
                logger.info(`✅ Found module-local variable in current file: ${moduleVar.value} at line ${moduleVar.line}`);
                
                // Find the type by looking at the next token
                const moduleIndex = tokens.indexOf(moduleVar);
                let typeInfo = 'UNKNOWN';
                let isStructureDefinition = false;
                
                if (moduleIndex + 1 < tokens.length) {
                    const nextToken = tokens[moduleIndex + 1];
                    if (nextToken.line === moduleVar.line) {
                        // Check if it's a regular type token
                        if (nextToken.type === TokenType.Type) {
                            typeInfo = nextToken.value;
                        }
                        // Check if it's a CLASS/GROUP/QUEUE declaration
                        else if (nextToken.type === TokenType.Structure) {
                            typeInfo = nextToken.value.toUpperCase(); // CLASS, GROUP, QUEUE, etc.
                            isStructureDefinition = true; // This IS the definition
                        }
                    }
                }
                
                // Get scope info for the module-local variable
                const modulePos: Position = { line: moduleVar.line, character: 0 };
                const scopeInfo = this.scopeAnalyzer.getTokenScope(document, modulePos);
                
                // Choose appropriate title based on whether this is a structure definition
                const title = isStructureDefinition 
                    ? `**Module-Local ${typeInfo}:** \`${moduleVar.value}\``
                    : `**Module-Local Variable:** \`${moduleVar.value}\``;
                
                const markdown = [
                    title,
                    ``
                ];
                
                // Only show "Type:" for regular variables, not structure definitions
                if (!isStructureDefinition) {
                    markdown.push(`**Type:** \`${typeInfo}\``);
                    markdown.push(``);
                }
                
                if (scopeInfo) {
                    const scopeIcon = '📦';
                    markdown.push(`**Scope:** ${scopeIcon} Module`);
                    markdown.push(``);
                    markdown.push(`**Visibility:** Visible only within this file (module-local)`);
                    markdown.push(``);
                }
                
                // Show file and line info similar to procedures
                const fileName = path.basename(document.uri.replace('file:///', ''));
                const lineNumber = moduleVar.line + 1; // Convert to 1-based
                markdown.push(`**Defined in** \`${fileName}\` @ line ${lineNumber}`);
                
                return {
                    contents: {
                        kind: 'markdown',
                        value: markdown.join('\n')
                    }
                };
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
                        // Find first CODE token to establish boundary for global scope
                        const firstCodeToken = parentTokens.find(t => 
                            t.type === TokenType.Keyword && 
                            t.value.toUpperCase() === 'CODE'
                        );
                        const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;
                        logger.info(`Global scope ends at line ${globalScopeEndLine}`);
                        
                        // Search for global variable (Label at column 0, before first CODE)
                        const globalVar = parentTokens.find(t =>
                            t.type === TokenType.Label &&
                            t.start === 0 &&
                            t.line < globalScopeEndLine &&
                            t.value.toLowerCase() === searchWord.toLowerCase()
                        );
                        
                        logger.info(`Searched for ${searchWord}, found: ${globalVar ? `YES at line ${globalVar.line}` : 'NO'}`);
                        
                        if (globalVar) {
                            logger.info(`✅ Found global variable in MEMBER parent: ${globalVar.value} at line ${globalVar.line}`);
                            
                            // Find the type by looking at the next token
                            const globalIndex = parentTokens.indexOf(globalVar);
                            let typeInfo = 'UNKNOWN';
                            if (globalIndex + 1 < parentTokens.length) {
                                const nextToken = parentTokens[globalIndex + 1];
                                if (nextToken.line === globalVar.line) {
                                    if (nextToken.type === TokenType.Type) {
                                        typeInfo = nextToken.value;
                                    } else if (nextToken.type === TokenType.Structure) {
                                        typeInfo = nextToken.value.toUpperCase();
                                    }
                                }
                            }
                            
                            // Use ScopeAnalyzer to get detailed scope info
                            const globalPos: Position = { line: globalVar.line, character: globalVar.start };
                            const scopeInfo = this.scopeAnalyzer.getTokenScope(parentDoc, globalPos);
                            
                            const markdown = [
                                `**Global Variable:** \`${globalVar.value}\``,
                                ``,
                                `**Type:** \`${typeInfo}\``,
                                ``
                            ];
                            
                            if (scopeInfo) {
                                const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
                                markdown.push(`**Scope:** ${scopeIcon} ${scopeInfo.type.charAt(0).toUpperCase() + scopeInfo.type.slice(1)}`);
                                markdown.push(``);
                                
                                if (scopeInfo.type === 'global') {
                                    markdown.push(`**Visibility:** Visible everywhere`);
                                } else {
                                    markdown.push(`**Visibility:** Visible only within this file (module-local)`);
                                }
                                markdown.push(``);
                            }
                            
                            // Show file and line info similar to procedures
                            const fileName = path.basename(resolvedPath);
                            const lineNumber = globalVar.line + 1; // Convert to 1-based
                            markdown.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}`);
                            markdown.push(``);
                            markdown.push(`*Press F12 to go to declaration*`);
                            
                            return {
                                contents: {
                                    kind: 'markdown',
                                    value: markdown.join('\n')
                                }
                            };
                        }
                    } catch (err) {
                        logger.error(`Error reading MEMBER parent file: ${err}`);
                    }
                }
            }
            
            logger.info(`❌ HOVER-RETURN: ${searchWord} is not a local variable or global in MEMBER parent - returning null`);
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

        // Match PROCEDURE(...) pattern
        const match = procedureLine.match(/PROCEDURE\s*\((.*?)\)/i);
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
     * Find the CLASS token for a method declaration at the given line
     */
    private findClassTokenForMethodDeclaration(tokens: Token[], methodLine: number): Token | null {
        // Search backwards from the method line to find the CLASS token
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i];
            
            // Stop if we've gone past the method line
            if (token.line > methodLine) {
                continue;
            }
            
            // Look for CLASS structure
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
                // Check if this class contains our method line
                // Find the END of this class
                let classEndLine = -1;
                for (let j = i + 1; j < tokens.length; j++) {
                    const endToken = tokens[j];
                    if (endToken.value.toUpperCase() === 'END' && endToken.start === 0 && endToken.line > token.line) {
                        classEndLine = endToken.line;
                        break;
                    }
                }
                
                // Check if method is within this class
                if (classEndLine === -1 || methodLine < classEndLine) {
                    return token;  // Return the CLASS token itself
                }
            }
        }
        
        return null;
    }

    /**
     * Find method implementation across all files using SolutionManager
     * Returns the file URI and line number as a string like "file:///path:lineNumber"
     */
    private async findMethodImplementationCrossFile(
        className: string,
        methodName: string,
        currentDocument: TextDocument,
        paramCount?: number,
        moduleFile?: string | null
    ): Promise<string | null> {
        const fs = require('fs');
        const path = require('path');
        const { SolutionManager } = require('../solution/solutionManager');
        
        logger.info(`Searching for ${className}.${methodName} implementation cross-file`);
        
        // FIRST: Search the current file (local implementation)
        const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');
        logger.info(`Searching current file first: ${currentPath}`);
        const localImplLine = this.searchFileForImplementation(currentPath, className, methodName, paramCount);
        if (localImplLine !== null) {
            const fileUri = `file:///${currentPath.replace(/\\/g, '/')}`;
            logger.info(`✅ Found implementation in current file at line ${localImplLine}`);
            return `${fileUri}:${localImplLine}`;
        }
        
        // If we have a module file hint, try to find it
        if (moduleFile) {
            logger.info(`Looking for module file: ${moduleFile}`);
            
            const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');
            
            // Use redirection parser to resolve the module file
            // It will check redirection paths, then fall back to current document's directory
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(moduleFile, currentPath);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        logger.info(`Found module file via redirection: ${resolved.path} (source: ${resolved.source})`);
                        const implLine = this.searchFileForImplementation(resolved.path, className, methodName, paramCount);
                        if (implLine !== null) {
                            const fileUri = `file:///${resolved.path.replace(/\\/g, '/')}`;
                            return `${fileUri}:${implLine}`;
                        }
                    }
                }
            } else {
                // No solution open - try relative path as last resort
                const currentDir = path.dirname(currentPath);
                const relativeModulePath = path.join(currentDir, moduleFile);
                
                if (fs.existsSync(relativeModulePath)) {
                    logger.info(`Found module file at: ${relativeModulePath} (no solution open)`);
                    const implLine = this.searchFileForImplementation(relativeModulePath, className, methodName, paramCount);
                    if (implLine !== null) {
                        const fileUri = `file:///${relativeModulePath.replace(/\\/g, '/')}`;
                        return `${fileUri}:${implLine}`;
                    }
                }
            }
        }
        
        // Fallback: Search all solution files (skip current file - already searched)
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager || !solutionManager.solution) {
            logger.info(`No solution manager available for cross-file search`);
            return null;
        }
        
        logger.info(`Searching ${solutionManager.solution.projects.length} projects`);
        
        // Get all source files from all projects
        for (const project of solutionManager.solution.projects) {
            for (const sourceFile of project.sourceFiles) {
                const fullPath = path.join(project.path, sourceFile.relativePath);
                
                // Skip current file - already searched
                if (path.resolve(fullPath) === path.resolve(currentPath)) {
                    continue;
                }
                
                // Only search .clw files
                if (!fullPath.toLowerCase().endsWith('.clw')) {
                    continue;
                }
                
                if (!fs.existsSync(fullPath)) {
                    continue;
                }
                
                const implLine = this.searchFileForImplementation(fullPath, className, methodName, paramCount);
                if (implLine !== null) {
                    const fileUri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    return `${fileUri}:${implLine}`;
                }
            }
        }
        
        logger.info(`❌ No implementation found for ${className}.${methodName}`);
        return null;
    }

    /**
     * Search a specific file for a method implementation
     * Returns the line number if found, null otherwise
     */
    private searchFileForImplementation(
        filePath: string,
        className: string,
        methodName: string,
        paramCount?: number
    ): number | null {
        const fs = require('fs');
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split(/\r?\n/);
            
            // Search for method implementation: ClassName.MethodName PROCEDURE
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const implMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION);
                
                if (implMatch && 
                    implMatch[1].toUpperCase() === className.toUpperCase() &&
                    implMatch[2].toUpperCase() === methodName.toUpperCase()) {
                    
                    // Found a potential match - check parameter count if specified
                    if (paramCount !== undefined) {
                        const params = implMatch[3] ? implMatch[3].trim() : '';
                        const implParamCount = params === '' ? 0 : params.split(',').length;
                        
                        if (implParamCount !== paramCount) {
                            logger.info(`Parameter count mismatch: expected ${paramCount}, found ${implParamCount}`);
                            continue;
                        }
                    }
                    
                    logger.info(`✅ Found implementation in ${filePath} at line ${i}`);
                    return i;
                }
            }
        } catch (error) {
            logger.error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return null;
    }

    /**
     * Get a preview of a method implementation at a specific location
     * Location is in format "file:///path:lineNumber"
     */
    private async getMethodImplementationPreview(location: string): Promise<{ line: number; preview: string } | null> {
        const fs = require('fs');
        const path = require('path');
        const { TextDocument } = require('vscode-languageserver-textdocument');
        
        // Parse the location string
        const parts = location.split(':');
        const lineNumber = parseInt(parts[parts.length - 1]);
        const filePath = parts.slice(0, -1).join(':').replace('file:///', '').replace(/\//g, '\\');
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split(/\r?\n/);
            
            // Try to get the implementation token to find finishesAt
            const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
            const document = TextDocument.create(fileUri, 'clarion', 1, content);
            const tokens = this.tokenCache.getTokens(document);
            
            // Find the procedure/method token at this line
            const implToken = tokens.find(t => 
                t.line === lineNumber &&
                (t.subType === TokenType.MethodImplementation || 
                 t.subType === TokenType.Procedure ||
                 t.subType === TokenType.GlobalProcedure)
            );
            
            let endLine: number;
            const maxPreviewLines = 15;
            
            if (implToken && implToken.finishesAt !== undefined) {
                // Use finishesAt to know exactly where the procedure ends
                endLine = Math.min(implToken.finishesAt + 1, lineNumber + maxPreviewLines);
                logger.info(`Using finishesAt=${implToken.finishesAt} for preview (${endLine - lineNumber} lines)`);
            } else {
                // Fallback: Find next procedure/routine or use max lines
                endLine = lineNumber + maxPreviewLines;
                for (let i = lineNumber + 1; i < Math.min(lines.length, lineNumber + 50); i++) {
                    const line = lines[i];
                    // Check for next procedure/routine implementation at column 0
                    if (/^(\w+\.)?(\w+)\s+(PROCEDURE|ROUTINE|FUNCTION)\b/i.test(line)) {
                        endLine = i;
                        logger.info(`Found next procedure/routine at line ${i}, stopping before it`);
                        break;
                    }
                }
                endLine = Math.min(endLine, lines.length);
            }
            
            // If the implementation is short (<=15 lines), show it all
            const totalLines = endLine - lineNumber;
            if (totalLines <= maxPreviewLines) {
                logger.info(`Short implementation (${totalLines} lines) - showing full preview`);
                const previewLines = lines.slice(lineNumber, endLine);
                return {
                    line: lineNumber,
                    preview: previewLines.join('\n')
                };
            } else {
                // Long implementation - show first 15 lines with ellipsis
                logger.info(`Long implementation (${totalLines} lines) - showing first ${maxPreviewLines} lines`);
                const previewLines = lines.slice(lineNumber, lineNumber + maxPreviewLines);
                previewLines.push('  ...');
                previewLines.push(`  ! ${totalLines - maxPreviewLines} more lines`);
                return {
                    line: lineNumber,
                    preview: previewLines.join('\n')
                };
            }
        } catch (error) {
            logger.error(`Error reading implementation preview: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }



}
