import { Definition, Location, Position, Range, DocumentSymbol } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SolutionManager } from '../solution/solutionManager';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { SymbolDefinitionResolver } from '../utils/SymbolDefinitionResolver';
import { FileDefinitionResolver } from '../utils/FileDefinitionResolver';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { ProcedureCallDetector } from './utils/ProcedureCallDetector';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { MemberLocatorService } from '../services/MemberLocatorService';

const logger = LoggerManager.getLogger("DefinitionProvider");
logger.setLevel("error"); // Production: Only log errors

/**
 * Provides goto definition functionality for Clarion files
 * Coordinates multiple specialized resolvers for different definition types
 */
export class DefinitionProvider {
    private tokenCache = TokenCache.getInstance();
    private symbolProvider = new ClarionDocumentSymbolProvider();
    private memberResolver = new ClassMemberResolver();
    private chainedResolver = new ChainedPropertyResolver();
    private overloadResolver = new MethodOverloadResolver();
    private mapResolver = new MapProcedureResolver();
    private symbolResolver = new SymbolDefinitionResolver();
    private fileResolver = new FileDefinitionResolver();
    private crossFileResolver = new CrossFileResolver(this.tokenCache);
    private memberLocator = new MemberLocatorService();
    private scopeAnalyzer: ScopeAnalyzer;
    private symbolFinder: SymbolFinderService;

    constructor() {
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
    }

    /**
     * Provides definition locations for a given position in a document
     * @param document The text document
     * @param position The position within the document
     * @returns A Definition (Location or Location[]) or null if no definition is found
     */
    public async provideDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Providing definition for position ${position.line}:${position.character} in ${document.uri}`);

        try {
            // Get tokens once for reuse throughout the method
            const tokens = this.tokenCache.getTokens(document);

            // Don't navigate on words inside comments or after line-continuation markers
            if (TokenHelper.isPositionInComment(tokens, position.line, position.character)) {
                return null;
            }

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
            logger.info(`Full line text: "${line}"`);
            logger.info(`Position character: ${position.character}`);

            // Check if this is a method call (e.g., "self.SaveFile()" or "obj.Method()")
            const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
            if (dotBeforeIndex > 0) {
                const rawBeforeDot = line.substring(0, dotBeforeIndex).trim();
                const beforeDot = ChainedPropertyResolver.extractChain(rawBeforeDot);
                const afterDot = line.substring(dotBeforeIndex + 1).trim();
                const methodMatch = afterDot.match(/^(\w+)/);
                
                // Extract just the method name from word if it includes the prefix (e.g., "self.SaveFile" -> "SaveFile")
                let methodName = word;
                if (word.includes('.')) {
                    const parts = word.split('.');
                    methodName = parts[parts.length - 1];
                }
                
                if (methodMatch && methodMatch[1].toLowerCase() === methodName.toLowerCase()) {
                    // Check if this looks like a method call (has parentheses)
                    const hasParentheses = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
                    
                    if (hasParentheses && (beforeDot.toLowerCase() === 'self' || beforeDot.toLowerCase().endsWith('self'))) {
                        // This is a method call - find the declaration
                        logger.info(`F12 on method call: ${beforeDot}.${methodName}()`);
                        
                        // Count parameters for overload resolution
                        const paramCount = this.memberResolver.countParametersInCall(line, methodName);
                        logger.info(`Method call has ${paramCount} parameters`);
                        
                        const memberInfo = this.memberResolver.findClassMemberInfo(methodName, document, position.line, tokens, paramCount);
                        
                        if (memberInfo) {
                            logger.info(`✅ Found method declaration at ${memberInfo.file}:${memberInfo.line}`);
                            return Location.create(
                                memberInfo.file,
                                Range.create(memberInfo.line, 0, memberInfo.line, 0)
                            );
                        }
                    }

                    if (hasParentheses && (beforeDot.toLowerCase() === 'parent' || beforeDot.toLowerCase().endsWith('parent'))) {
                        // PARENT.Method() — look up the method starting from the parent class
                        logger.info(`F12 on PARENT method call: PARENT.${methodName}()`);
                        const paramCount = this.memberResolver.countParametersInCall(line, methodName);
                        const memberInfo = await this.memberResolver.findParentClassMemberInfo(methodName, document, position.line, tokens, paramCount);
                        if (memberInfo) {
                            logger.info(`✅ Found PARENT method declaration at ${memberInfo.file}:${memberInfo.line}`);
                            return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
                        }
                    }

                    // Chained access: SELF.Order.MainKey or PARENT.Foo.Bar
                    if (/^\s*(self|parent)\b/i.test(beforeDot) && beforeDot.includes('.')) {
                        const paramCount = hasParentheses
                            ? this.memberResolver.countParametersInCall(line, methodName)
                            : undefined;
                        const chainedInfo = await this.chainedResolver.resolve(beforeDot, methodName, document, position, paramCount ?? undefined);
                        if (chainedInfo) {
                            logger.info(`✅ Chained F12: "${methodName}" resolved at ${chainedInfo.file}:${chainedInfo.line}`);
                            return Location.create(chainedInfo.file, Range.create(chainedInfo.line, 0, chainedInfo.line, 0));
                        }
                    }

                    // SELF.property or PARENT.property (no parentheses) — find the class member declaration
                    if (!hasParentheses && /^\s*(self|parent)\b/i.test(beforeDot)) {
                        const isSelf = /\bself$/i.test(beforeDot);
                        logger.info(`F12 on ${isSelf ? 'SELF' : 'PARENT'} property: ${methodName}`);
                        const memberInfo = isSelf
                            ? this.memberResolver.findClassMemberInfo(methodName, document, position.line, tokens, undefined)
                            : await this.memberResolver.findParentClassMemberInfo(methodName, document, position.line, tokens, undefined);
                        if (memberInfo) {
                            logger.info(`✅ Found property declaration at ${memberInfo.file}:${memberInfo.line}`);
                            return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
                        }
                    }

                    // Typed variable member: st.GetValue() where st is declared as "st StringTheory"
                    if (!/^\s*(self|parent)\b/i.test(beforeDot)) {
                        const structureNameMatch = beforeDot.match(/(\w+)\s*$/);
                        if (structureNameMatch) {
                            const structureName = structureNameMatch[1];
                            const typeInfo = await this.memberLocator.resolveVariableType(structureName, tokens, document);
                            const classType = typeInfo?.isClass ? typeInfo.typeName : this.findVariableType(tokens, structureName, position.line);
                            if (classType) {
                                logger.info(`Variable "${structureName}" is type "${classType}", looking for member "${methodName}"`);
                                const paramCount = hasParentheses
                                    ? this.memberResolver.countParametersInCall(line, methodName) ?? undefined
                                    : undefined;
                                const result = await this.findClassMemberInType(tokens, classType, methodName, document, paramCount);
                                if (result) {
                                    logger.info(`✅ Found typed variable member "${methodName}" in "${classType}"`);
                                    return result;
                                }
                            }
                        }
                    }
                }
            }

            // ✅ IMPLEMENTS(InterfaceName) navigation: F12 on interface name → INTERFACE declaration
            const implementsMatch = line.match(/\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi);
            if (implementsMatch) {
                for (const match of implementsMatch) {
                    const nameMatch = match.match(/\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/i);
                    if (nameMatch) {
                        const ifaceName = nameMatch[1];
                        const nameStart = line.indexOf(ifaceName, line.indexOf(match));
                        const nameEnd = nameStart + ifaceName.length;
                        if (position.character >= nameStart && position.character <= nameEnd) {
                            logger.info(`F12 on IMPLEMENTS(${ifaceName}) — looking for INTERFACE declaration`);
                            const ifaceLocation = await this.findInterfaceDeclaration(ifaceName, document, tokens);
                            if (ifaceLocation) {
                                logger.info(`✅ Found INTERFACE '${ifaceName}' declaration`);
                                return ifaceLocation;
                            }
                        }
                    }
                }
            }

            // ✅ 3-part method implementation: ClassName.InterfaceName.MethodName PROCEDURE
            // When cursor is on the InterfaceName segment, navigate to the INTERFACE declaration
            const threePartMatch = line.match(/^(\w+)\.(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)/i);
            if (threePartMatch) {
                const [, clsName, ifacePart, methodPart] = threePartMatch;
                const ifaceStart = line.indexOf(ifacePart, clsName.length + 1);
                const ifaceEnd = ifaceStart + ifacePart.length;
                if (position.character >= ifaceStart && position.character <= ifaceEnd) {
                    logger.info(`F12 on interface name in 3-part method: ${ifacePart}`);
                    const ifaceLocation = await this.findInterfaceDeclaration(ifacePart, document, tokens);
                    if (ifaceLocation) return ifaceLocation;
                }
            }

            // Check if this is a procedure call in CODE (e.g., "MyProcedure()" or "ProcessOrder(param)")
            // OR if this is inside a START() call (e.g., "START(ProcName, ...)")
            // Navigate to the MAP declaration or PROCEDURE implementation
            const detection = ProcedureCallDetector.isProcedureCallOrReference(document, position, wordRange);
            
            logger.info(`🔍 Checking for procedure call: word="${word}", isProcedure=${detection.isProcedure}, isStartCall=${detection.isStartCall}, line="${line.trim()}"`);
            
            if (detection.isProcedure) {
                logger.info(`🔍 Detected potential procedure ${ProcedureCallDetector.getDetectionMessage(word, detection.isStartCall)}`);
                
                // Count parameters for overload resolution
                const paramCount = this.memberResolver.countParametersInCall(line, word);
                logger.info(`Procedure call has ${paramCount} parameters`);
                
                // First, try to find MAP declaration in current file
                const mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);
                
                // Check if we're already AT the MAP declaration - if so, jump to implementation instead
                if (mapDecl && 
                    mapDecl.uri === document.uri && 
                    mapDecl.range.start.line === position.line) {
                    logger.info(`📍 Already at MAP declaration for ${word} - finding implementation instead`);
                    
                    // Navigate to implementation (like Ctrl+F12 would do)
                    const implLocation = await this.mapResolver.findProcedureImplementation(
                        word,
                        tokens,
                        document,
                        position,
                        line // Pass declaration signature for overload matching
                    );
                    
                    if (implLocation) {
                        logger.info(`✅ Found implementation at line ${implLocation.range.start.line}`);
                        return implLocation;
                    } else {
                        logger.info(`❌ No implementation found for MAP declaration: ${word}`);
                        return null;
                    }
                }
                
                if (mapDecl) {
                    logger.info(`✅ Found MAP declaration for procedure call: ${word}`);
                    return mapDecl;
                }
                
                // If not found locally and file has MEMBER, check parent file's MAP
                const memberToken = tokens.find(t => 
                    t.line < 5 && // MEMBER should be at top of file
                    t.value.toUpperCase() === 'MEMBER' &&
                    t.referencedFile
                );
                
                if (memberToken?.referencedFile) {
                    logger.info(`File has MEMBER('${memberToken.referencedFile}'), checking parent MAP for ${word}`);
                    
                    const memberResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                        word,
                        memberToken.referencedFile,
                        document,
                        line
                    );
                    if (memberResult) {
                        logger.info(`✅ Found MAP declaration in MEMBER file for procedure call: ${word}`);
                        return memberResult.location;
                    }
                }
                
                logger.info(`❌ No MAP declaration found for procedure call: ${word}`);
            }

            // Check if this is a method implementation line (e.g., "StringTheory.Construct PROCEDURE")
            // and navigate to the declaration in the CLASS
            const methodImplMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION_STRICT);
            if (methodImplMatch) {
                const parts = ClarionPatterns.getMethodImplParts(line);
                const className = parts?.className ?? methodImplMatch[1];
                // For 3-part (Class.Interface.Method), use the actual method name
                const methodName = parts?.methodName ?? methodImplMatch[2];
                
                logger.info(`🔍 Detected method implementation line: ${className}.${parts?.interfaceName ? parts.interfaceName + '.' : ''}${methodName}`);
                
                // Check if cursor is on the class, interface, or method name segment
                const classStart = line.indexOf(className);
                const classEnd = classStart + className.length;
                const methodStart = line.indexOf(methodName, classEnd);
                const methodEnd = methodStart + methodName.length;
                
                logger.info(`Cursor at ${position.character}, class range [${classStart}-${classEnd}], method range [${methodStart}-${methodEnd}]`);
                
                if ((position.character >= classStart && position.character <= classEnd) ||
                    (position.character >= methodStart && position.character <= methodEnd)) {
                    logger.info(`F12 on method implementation: ${className}.${methodName}`);
                    
                    // Count parameters from the implementation signature
                    const paramCount = ClarionPatterns.countParameters(line);
                    logger.info(`Method implementation has ${paramCount} parameters`);

                    // For 3-part methods (Class.Interface.Method), the declaration is in the INTERFACE, not the CLASS
                    if (parts?.interfaceName) {
                        const ifaceMethodInfo = this.overloadResolver.findInterfaceMethodDeclaration(
                            parts.interfaceName, methodName, document, tokens, paramCount, line
                        );
                        if (ifaceMethodInfo) {
                            logger.info(`✅ Found interface method declaration at ${ifaceMethodInfo.file}:${ifaceMethodInfo.line}`);
                            return Location.create(ifaceMethodInfo.file, {
                                start: { line: ifaceMethodInfo.line, character: 0 },
                                end: { line: ifaceMethodInfo.line, character: 0 }
                            });
                        }
                    }
                    
                    const declInfo = this.overloadResolver.findMethodDeclaration(className, methodName, document, tokens, paramCount, line);
                    if (declInfo) {
                        logger.info(`✅ Found method declaration at ${declInfo.file}:${declInfo.line} with ${declInfo.paramCount} parameters`);
                        return Location.create(declInfo.file, {
                            start: { line: declInfo.line, character: 0 },
                            end: { line: declInfo.line, character: 0 }
                        });
                    } else {
                        logger.info(`❌ No method declaration found for ${className}.${methodName}`);
                    }
                }
            }

            // Check if this is a MAP procedure/function implementation line (e.g., "ProcessOrder PROCEDURE" or "ProcessOrder FUNCTION")
            // Navigate to the MAP declaration
            const tokenAtPosition = tokens.find(t =>
                t.line === position.line &&
                t.subType === TokenType.GlobalProcedure
            );
            
            logger.info(`Tokens on line ${position.line}: ${TokenHelper.findTokens(tokens, { line: position.line }).map(t => `type=${t.type}, subType=${t.subType}, value="${t.value}", label="${t.label}"`).join('; ')}`);
            logger.info(`Token at position with GlobalProcedure subtype: ${tokenAtPosition ? `YES (label="${tokenAtPosition.label}")` : 'NO'}`);
            
            if (tokenAtPosition && tokenAtPosition.label) {
                logger.info(`🔍 Detected procedure implementation: ${tokenAtPosition.label}`);
                logger.info(`F12 navigating from implementation to MAP declaration for: ${tokenAtPosition.label}`);

                // Pass implementation signature for overload resolution
                const mapDecl = this.mapResolver.findMapDeclaration(tokenAtPosition.label, tokens, document, line);
                if (mapDecl) {
                    logger.info(`✅ Found MAP declaration at line ${mapDecl.range.start.line}`);
                    return mapDecl;
                } else {
                    logger.info(`❌ MAP declaration not found in current file for ${tokenAtPosition.label}`);
                    
                    // Check if this file has MEMBER at top, indicating it's part of another file
                    logger.info(`Checking for MEMBER token in first 5 lines...`);
                    const memberToken = tokens.find(t => 
                        t.line < 5 && // MEMBER should be at top of file
                        t.value.toUpperCase() === 'MEMBER' &&
                        t.referencedFile
                    );
                    
                    if (memberToken) {
                        logger.info(`✅ Found MEMBER token at line ${memberToken.line}: value="${memberToken.value}", referencedFile="${memberToken.referencedFile}"`);
                    } else {
                        logger.info(`❌ No MEMBER token found with referencedFile in first 5 lines`);
                        // Debug: Show all tokens in first 5 lines
                        const firstTokens = TokenHelper.findTokensInHeader(tokens, 5);
                        logger.info(`Debug: Found ${firstTokens.length} tokens in first 5 lines:`);
                        firstTokens.forEach(t => {
                            logger.info(`  Line ${t.line}: type=${t.type}, value="${t.value}", referencedFile="${t.referencedFile || 'undefined'}"`);
                        });
                    }
                    
                    if (memberToken?.referencedFile) {
                        logger.info(`File has MEMBER('${memberToken.referencedFile}'), searching parent file for MAP declaration`);
                        
                        // Use CrossFileResolver to find MAP declaration
                        const memberResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                            tokenAtPosition.label,
                            memberToken.referencedFile,
                            document,
                            line
                        );
                        if (memberResult) {
                            return memberResult.location;
                        }
                    }
                }
            }

            // Check if this is a structure field reference (either dot notation or prefix notation)
            const structureFieldDefinition = await this.findStructureFieldDefinition(word, document, position);
            if (structureFieldDefinition) {
                return structureFieldDefinition;
            }

            // First, check if this is a reference to a label in the current document
            // Get ALL label candidates and filter by scope using ScopeAnalyzer
            const labelCandidates = this.symbolResolver.findAllLabelCandidates(word, document, tokens);
            if (labelCandidates.length > 0) {
                logger.info(`Found ${labelCandidates.length} label candidates for ${word}, filtering by scope...`);
                
                // Filter candidates by scope accessibility
                const accessibleLabels: Location[] = [];
                for (const candidate of labelCandidates) {
                    const canAccess = this.scopeAnalyzer.canAccess(
                        position,
                        candidate.range.start,
                        document,
                        document  // Same document
                    );
                    
                    if (canAccess) {
                        accessibleLabels.push(candidate);
                        logger.info(`✅ Label at line ${candidate.range.start.line} is accessible`);
                    } else {
                        logger.info(`❌ Label at line ${candidate.range.start.line} is out of scope`);
                    }
                }
                
                if (accessibleLabels.length > 0) {
                    // Sort by scope priority: routine > procedure > module > global
                    // This ensures shadowing works correctly (innermost scope wins)
                    accessibleLabels.sort((a, b) => {
                        const aScopeInfo = this.scopeAnalyzer.getTokenScope(document, a.range.start);
                        const bScopeInfo = this.scopeAnalyzer.getTokenScope(document, b.range.start);
                        
                        const scopePriority = (scopeType: string) => {
                            switch (scopeType) {
                                case 'routine': return 4;
                                case 'procedure': return 3;
                                case 'module': return 2;
                                case 'global': return 1;
                                default: return 0;
                            }
                        };
                        
                        const aPriority = scopePriority(aScopeInfo?.type || 'global');
                        const bPriority = scopePriority(bScopeInfo?.type || 'global');
                        
                        // Higher priority first (routine before procedure, etc.)
                        return bPriority - aPriority;
                    });
                    
                    return accessibleLabels[0];
                }
                
                logger.info(`No accessible labels found - all ${labelCandidates.length} candidates are out of scope`);
                // Don't return null yet - continue to check other resolution methods
            }

            // Next, check if this is a reference to a variable or other symbol
            // Do this BEFORE checking MAP procedure implementations to avoid false positives
            const symbolDefinition = await this.findSymbolDefinition(word, document, position);
            if (symbolDefinition) {
                return symbolDefinition;
            }

            // Check if we're inside a MAP block and the word is a procedure declaration
            // Navigate to the PROCEDURE implementation
            // Guard: skip if cursor is inside a PROCEDURE parameter list (word is a parameter type, not a call)
            const isInsideProcSignature = /\bPROCEDURE\s*\(/i.test(line) && (() => {
                const parenOpen = line.indexOf('(', line.search(/\bPROCEDURE\s*\(/i));
                const parenClose = line.lastIndexOf(')');
                return parenOpen >= 0 && position.character > parenOpen && position.character <= parenClose;
            })();
            const mapProcImpl = !isInsideProcSignature && this.mapResolver.findProcedureImplementation(word, tokens, document, position, line);
            if (mapProcImpl) {
                return mapProcImpl;
            }

            // ✅ Check if we're ON a declaration (method declaration in class or MAP procedure declaration)
            // If so, return null - we're already at the definition, no navigation needed
            // This check must come AFTER MAP navigation checks so MAP declarations can navigate to implementations
            // VSCode won't show an error for this case
            if (this.isOnDeclaration(line, position, word)) {
                return null;
            }

            // Next, check if this is a reference to a Clarion structure (queue, window, view, etc.)
            const structureDefinition = await this.findStructureDefinition(word, document, position);
            if (structureDefinition) {
                return structureDefinition;
            }

            // Check if this word is a type name (QUEUE/GROUP/etc) declared in an INCLUDE file
            // Handles F12 on type names in LIKE(TypeName), QUEUE(TypeName), etc.
            const typeDefInIncludes = await this.findTypeInIncludes(word, document);
            if (typeDefInIncludes) {
                return typeDefInIncludes;
            }

            // Finally, check if this is a file reference
            // This is the lowest priority - only look for files if no local definitions are found
            if (this.fileResolver.isLikelyFileReference(word, document, position, tokens)) {
                return await this.fileResolver.findFileDefinition(word, document.uri);
            }

            // Last resort: check if word is a CLASS type name via the class definition indexer
            // This handles parameter types, variable types, etc. (e.g. "EditClass EC" in a PROCEDURE signature)
            const classLocation = await this.findClassTypeDefinition(word, document);
            if (classLocation) {
                return classLocation;
            }

            return null;
        } catch (error) {
            logger.error(`Error providing definition: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
    
    /**
     * Finds the definition of a structure field reference
     * Handles both dot notation (Structure.Field) and prefix notation (PREFIX:Field)
     * Also handles class member access (self.Member or variable.Member)
     * Enhanced to support both structure labels and prefixes in usage
     */
    private async findStructureFieldDefinition(word: string, document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Looking for structure field definition: ${word}`);

        // Get tokens from cache
        const tokens = this.tokenCache.getTokens(document);

        // Get the current line text to analyze the context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });
        
        // CRITICAL FIX: Check if this is a standalone word without prefix or structure notation
        // If it's a standalone word, we should not match structure fields
        const isStandaloneWord = !line.includes(':' + word) && !line.includes('.' + word);
        
        // If this is a standalone word and not part of a qualified reference, skip structure field matching
        if (isStandaloneWord) {
            logger.info(`Skipping structure field matching for standalone word: ${word}`);
            return null;
        }

        // Check if this is a dot notation reference (Structure.Field or Complex:Structure:1.Field or self.Member)
        const dotIndex = line.lastIndexOf('.', position.character - 1);
        if (dotIndex > 0) {
            const beforeDot = line.substring(0, dotIndex).trim();
            const afterDot = line.substring(dotIndex + 1).trim();

            // Extract structure name and field name
            const structureMatch = beforeDot.match(/(\w+)\s*$/);
            const fieldMatch = afterDot.match(/^(\w+)/);
            
            if (structureMatch && fieldMatch) {
                const structureName = structureMatch[1];
                const fieldName = fieldMatch[1];
                
                // Check if cursor is on the structure name or the field name
                if (word.toLowerCase() === structureName.toLowerCase()) {
                    // Cursor is on structure name - find the structure declaration
                    logger.info(`Detected dot notation: cursor on structure "${structureName}" in ${structureName}.${fieldName}`);
                    return this.symbolResolver.findLabelDefinition(structureName, document, position, tokens);
                } else if (word.toLowerCase() === fieldName.toLowerCase()) {
                    // Cursor is on field name - find the field within the structure
                    logger.info(`Detected dot notation: cursor on field "${fieldName}" in ${structureName}.${fieldName}`);

                    // Check if this is self.Member - class member access
                    if (structureName.toLowerCase() === 'self') {
                        logger.info(`Detected self.${fieldName} - looking for class member`);
                        return this.findClassMember(tokens, fieldName, document, position.line);
                    }

                    // Try to find as a typed variable (e.g., otherValue.value where otherValue is StringTheory)
                    const typeInfo = await this.memberLocator.resolveVariableType(structureName, tokens, document);
                    const classType = typeInfo?.isClass ? typeInfo.typeName : this.findVariableType(tokens, structureName, position.line);
                    if (classType) {
                        logger.info(`Variable ${structureName} is of type ${classType}, looking for member ${fieldName}`);
                        const result = await this.findClassMemberInType(tokens, classType, fieldName, document);
                        if (result) {
                            return result;
                        }
                    }

                    // Find the structure definition - handle complex structure names
                    const structureTokens = TokenHelper.findLabels(tokens, structureName);

                    if (structureTokens.length > 0) {
                        // Find the field within the structure
                        return this.findFieldInStructure(tokens, structureTokens[0], fieldName, document, position);
                    }
                }
            }
        }

        // Check if this is a prefix notation reference (PREFIX:Field or Complex:Prefix:Field)
        const colonIndex = line.lastIndexOf(':', position.character - 1);
        if (colonIndex > 0) {
            // Get everything before the last colon as the prefix
            const prefixPart = line.substring(0, colonIndex).trim();
            const fieldPart = line.substring(colonIndex + 1).trim();

            // Extract just the field name without any trailing characters
            const fieldMatch = fieldPart.match(/^(\w+)/);
            if (fieldMatch && fieldMatch[1].toLowerCase() === word.toLowerCase()) {
                const fieldName = fieldMatch[1];
                logger.info(`Detected prefix notation: ${prefixPart}:${fieldName}`);

                // Try to find structures with this exact prefix first
                let structuresWithPrefix = TokenHelper.findStructuresWithPrefix(tokens, prefixPart);

                // If no exact match, try to find structures where the prefix is part of a complex name
                // For example, if prefixPart is "Queue:Browse:1", look for structures with prefix "Queue"
                if (structuresWithPrefix.length === 0 && prefixPart.includes(':')) {
                    const simplePrefixPart = prefixPart.split(':')[0];
                    structuresWithPrefix = TokenHelper.findStructuresWithPrefix(tokens, simplePrefixPart);
                }

                if (structuresWithPrefix.length > 0) {
                    // For each structure with this prefix, look for the field
                    for (const structureToken of structuresWithPrefix) {
                        // Find the label for this structure
                        const structureLabel = tokens.find(t =>
                            t.type === TokenType.Label &&
                            t.line === structureToken.line &&
                            t.start === 0
                        );

                        if (structureLabel) {
                            const result = await this.findFieldInStructure(tokens, structureLabel, fieldName, document, position);
                            if (result) return result;
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Helper method to find a field within a structure
     */
    private async findFieldInStructure(
        tokens: Token[],
        structureToken: Token,
        fieldName: string,
        document: TextDocument,
        position?: Position
    ): Promise<Definition | null> {
        // First, try to find fields directly marked as structure fields
        let fieldTokens = tokens.filter(token =>
            token.type === TokenType.Label &&
            token.value.toLowerCase() === fieldName.toLowerCase() &&
            token.isStructureField === true &&
            token.structureParent?.parent?.value.toLowerCase() === structureToken.value.toLowerCase()
        );

        // If no fields found with the direct approach, try a more flexible approach
        if (fieldTokens.length === 0) {
            // Find the structure token that follows this label
            const structureIndex = tokens.indexOf(structureToken);
            let structureDefToken: Token | undefined;

            // Look for the structure definition after the label
            for (let i = structureIndex + 1; i < tokens.length; i++) {
                const token = tokens[i];
                if (token.type === TokenType.Structure) {
                    structureDefToken = token;
                    break;
                }

                // If we hit another label or we've moved past the structure definition, stop looking
                if (token.type === TokenType.Label ||
                    (token.value.trim().length > 0 && !this.isStructureToken(token))) {
                    break;
                }
            }

            if (structureDefToken) {
                // Find the end of this structure
                const endLine = structureDefToken.finishesAt || Number.MAX_VALUE;

                // Look for field labels within this structure's range
                fieldTokens = tokens.filter(token =>
                    token.type === TokenType.Label &&
                    token.value.toLowerCase() === fieldName.toLowerCase() &&
                    token.line > structureDefToken!.line &&
                    token.line < endLine &&
                    token.start > 0  // Fields are indented
                );
            }
        }

        if (fieldTokens.length > 0) {
            logger.info(`Found ${fieldTokens.length} occurrences of field ${fieldName} in structure ${structureToken.value}`);

            // If we have a position, try to find the field in the current context first
            if (position) {
                const currentLine = position.line;

                // Find the current procedure/method context
                const currentContext = this.findCurrentContext(tokens, currentLine);
                if (currentContext) {
                    logger.info(`Current context: ${currentContext.value} (${currentContext.line}-${currentContext.finishesAt})`);

                    // First, try to find the field within the current context
                    const contextFields = fieldTokens.filter(token =>
                        token.line >= currentContext.line &&
                        (currentContext.finishesAt === undefined || token.line <= currentContext.finishesAt)
                    );

                    if (contextFields.length > 0) {
                        logger.info(`Found field ${fieldName} in current context ${currentContext.value}`);
                        const fieldToken = contextFields[0];

                        // Return the location of the field definition in the current context
                        return Location.create(document.uri, {
                            start: { line: fieldToken.line, character: 0 },
                            end: { line: fieldToken.line, character: fieldToken.value.length }
                        });
                    }
                }
            }

            // If we couldn't find the field in the current context, return the first occurrence
            const fieldToken = fieldTokens[0];
            logger.info(`Using first occurrence of field ${fieldName} at line ${fieldToken.line}`);

            // Return the location of the field definition
            return Location.create(document.uri, {
                start: { line: fieldToken.line, character: 0 },
                end: { line: fieldToken.line, character: fieldToken.value.length }
            });
        }

        return null;
    }

    /**
     * Find the current procedure/method context for a given line
     */
    private findCurrentContext(tokens: Token[], currentLine: number): Token | undefined {
        // First, look for method implementations (Class.Method)
        for (const token of tokens) {
            if (token.subType === TokenType.Class &&
                token.line <= currentLine &&
                (token.finishesAt === undefined || token.finishesAt >= currentLine)) {

                // Check if this is a method implementation (Class.Method)
                if (token.value && token.value.includes('.')) {
                    logger.info(`Found method context: ${token.value} for line ${currentLine}`);
                    return token;
                }
            }
        }

        // If no method found, look for procedure/routine
        for (const token of tokens) {
            if ((token.subType === TokenType.Procedure || token.subType === TokenType.Routine) &&
                token.line <= currentLine &&
                (token.finishesAt === undefined || token.finishesAt >= currentLine)) {
                logger.info(`Found procedure/routine context: ${token.value} for line ${currentLine}`);
                return token;
            }
        }

        return undefined;
    }

    /**
     * Finds the definition of a Clarion structure (queue, window, view, etc.)
     */
    private async findStructureDefinition(word: string, document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Looking for structure definition: ${word}`);

        // Get tokens from cache
        const tokens = this.tokenCache.getTokens(document);

        // Get the line to check context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });
        
        // CRITICAL FIX: Check if this is a standalone word without prefix or structure notation
        // If it's a standalone word, we should not match structure fields
        const isStandaloneWord = !line.includes(':' + word) && !line.includes('.' + word);
        logger.info(`Is standalone word in structure definition: ${isStandaloneWord}, line: "${line}"`);

        // Look for a label token that matches the word (structure definitions are labels in column 1)
        const labelTokens = TokenHelper.findLabels(tokens, word);

        if (labelTokens.length > 0) {
            logger.info(`Found ${labelTokens.length} label tokens for ${word}`);

            // Find the structure token that follows the label
            for (const labelToken of labelTokens) {
                const labelIndex = tokens.indexOf(labelToken);

                // Look for a structure token after the label
                for (let i = labelIndex + 1; i < tokens.length; i++) {
                    const token = tokens[i];
                    if (token.type === TokenType.Structure) {
                        logger.info(`Found structure ${token.value} for label ${labelToken.value} at line ${token.line}`);

                        // Return the location of the structure definition
                        return Location.create(document.uri, {
                            start: { line: labelToken.line, character: 0 },
                            end: { line: labelToken.line, character: labelToken.value.length }
                        });
                    }

                    // If we hit another label or we've moved past the structure definition, stop looking
                    if (token.type === TokenType.Label ||
                        (token.value.trim().length > 0 && !this.isStructureToken(token))) {
                        break;
                    }
                }
            }
        }

        // If we didn't find a label token, look for a structure token with a matching name
        const structureTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.parent &&
            token.parent.value.toLowerCase() === word.toLowerCase()
        );

        if (structureTokens.length > 0) {
            logger.info(`Found ${structureTokens.length} structure tokens for ${word}`);
            const token = structureTokens[0];

            // Return the location of the structure definition
            return Location.create(document.uri, {
                start: { line: token.line, character: token.start },
                end: { line: token.line, character: token.start + token.value.length }
            });
        }

        return null;
    }

    /**
     * Finds the definition of a variable or other symbol
     */
    /**
     * Checks if a token is a structure token
     */
    private isStructureToken(token: Token): boolean {
        return token.type === TokenType.Structure;
    }

    private async findSymbolDefinition(word: string, document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Looking for symbol definition: ${word}`);
    
        const tokens = this.tokenCache.getTokens(document);
        const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
        const currentLine = position.line;
        logger.info(`🔍 Current line: ${currentLine}, total tokens: ${tokens.length}`);
        
        // Get the line to check context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });
        
        // Declare these at function scope so they're available throughout
        let searchWord = word;
        let prefixPart = '';
        let isStandaloneWord = false;
        
        const currentScope = TokenHelper.getInnermostScopeAtLine(structure, currentLine); // 🚀 PERFORMANCE: O(log n) vs O(n)
    
        if (currentScope) {
            logger.info(`Current scope: ${currentScope.value} (${currentScope.line}-${currentScope.finishesAt})`);
            
            // ✨ PHASE 1 FIX: Search with full word FIRST (handles labels with colons like BRW1::View:Browse)
            // This matches the 2026-01-06 fix applied to HoverProvider
            logger.info(`Trying full word: "${word}"`);
            let parameterDefinition = this.findParameterDefinition(word, document, currentScope);
            if (parameterDefinition) {
                logger.info(`Found parameter definition for ${word} in procedure ${currentScope.value}`);
                return parameterDefinition;
            }
            
            // Setup for prefix/dot detection but DON'T overwrite searchWord yet
            // We'll try the full word search first, then fall back to stripped version
            const colonIndex = word.lastIndexOf(':');
            const dotIndex = word.lastIndexOf('.');
            
            // Keep searchWord as the full word for now
            searchWord = word;
            
            // Detect if we have prefix/dot but don't strip yet
            if (colonIndex > 0) {
                prefixPart = word.substring(0, colonIndex);
                logger.info(`Detected colon in word: prefix="${prefixPart}", will try full word first, then stripped if needed`);
            } else if (dotIndex > 0) {
                // For dot notation, prefix is the structure name
                prefixPart = word.substring(0, dotIndex);
                logger.info(`Detected dot in word: structure="${prefixPart}"`);
            } else {
                logger.info(`${word} has no prefix/dot`);
            }
            
            // Check if word is standalone (not part of prefix notation on this line)
            isStandaloneWord = !line.includes(':' + searchWord) && !line.includes('.' + searchWord);
            logger.info(`Is standalone word: ${isStandaloneWord}, line: "${line}"`);
            
            // For PROCEDURE/METHOD: Search the DATA section (everything before CODE)
            // For ROUTINE: Only search explicit DATA sections
            if (currentScope.subType === TokenType.Procedure || 
                currentScope.subType === TokenType.MethodImplementation ||
                currentScope.subType === TokenType.MethodDeclaration) {
                
                // In procedures/methods, everything before CODE is DATA
                const codeMarker = currentScope.executionMarker;
                let dataEnd = codeMarker ? codeMarker.line : currentScope.finishesAt;
                
                // If we don't have a CODE marker or finishesAt, find the next procedure or the actual end
                if (dataEnd === undefined) {
                    // Find the next procedure/method that starts after the current one
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
                        // No next procedure, search to end of file
                        dataEnd = tokens[tokens.length - 1].line;
                        logger.info(`No next procedure found, using end of file at line ${dataEnd}`);
                    }
                }
                
                logger.info(`Searching procedure DATA section from line ${currentScope.line} to ${dataEnd}`);
                
                // Look for variable declarations in the DATA section
                // Need to handle both:
                // 1. Simple variables: SomeVar STRING(20) - token at start 0
                // 2. Prefixed labels: LOC:SomeVar STRING(20) - the field part may not be at start 0 OR the label is PREFIX:Field
                const dataVariables = tokens.filter(token => {
                    // CRITICAL FIX: For structure fields, only match when properly qualified
                    // Check if this token is a structure field
                    const isStructureField = token.isStructureField || token.structurePrefix;
                    
                    // Define these variables outside the if blocks so they're available throughout the function
                    let exactMatch = false;
                    let prefixedMatch = false;
                    
                    // Match exact name
                    exactMatch = token.value.toLowerCase() === searchWord.toLowerCase();
                    
                    // Match prefixed label (e.g., LOC:SMTPbccAddress)
                    prefixedMatch = token.type === TokenType.Label &&
                                   token.value.includes(':') &&
                                   token.value.toLowerCase().endsWith(':' + searchWord.toLowerCase());
                    
                    if (isStructureField) {
                        // For structure fields, we should only match when:
                        // - The search is for a prefixed field (LOC:MyVar) - prefixPart is not empty
                        // - The search is for a structure.field notation (MyGroup.MyVar) - handled by findStructureFieldDefinition
                        // - We should NOT match on just the field name alone (MyVar) - prefixPart is empty
                        
                        // If we're searching for just a field name (no prefix/qualifier), don't match structure fields
                        if (!prefixPart && exactMatch) {
                            logger.info(`❌ Skipping structure field match for unqualified field: "${searchWord}" (no prefix in search)`);
                            return false;
                        }
                        
                        // Only allow prefixed matches for structure fields
                        if (!prefixedMatch) {
                            return false;
                        }
                    } else {
                        // For regular variables (not structure fields), match exact name
                        if (!exactMatch && !prefixedMatch) {
                            return false;
                        }
                    }
                    
                    // Must be a variable or label type
                    if (token.type !== TokenType.Variable && token.type !== TokenType.Label) {
                        return false;
                    }
                    
                    // Must be in the DATA section (after procedure start, before CODE/next procedure)
                    if (token.line <= currentScope.line) {
                        return false;
                    }
                    if (dataEnd !== undefined && token.line >= dataEnd) {
                        return false;
                    }
                    
                    // For exact matches with prefixed variables, the field name might not be at position 0
                    // Check if this token is part of a prefixed label
                    // by looking at the same line for a label token at position 0
                    if (exactMatch && token.start > 0) {
                        // Look for a label at position 0 on the same line
                        const labelAtStart = tokens.find(t =>
                            t.line === token.line &&
                            t.start === 0 &&
                            t.type === TokenType.Label
                        );
                        
                        // If there's a label at position 0, check if it contains a colon (prefix notation)
                        if (labelAtStart && labelAtStart.value.includes(':')) {
                            logger.info(`Found prefixed label: ${labelAtStart.value} with field: ${token.value} at line ${token.line}`);
                            return true;
                        }
                        
                        // If no prefixed label, this token must be at position 0
                        return false;
                    }
                    
                    // Prefixed label match or token at position 0 is valid
                    if (prefixedMatch) {
                        logger.info(`Found prefixed label by suffix match: ${token.value} at line ${token.line}`);
                    }
                    return true;
                });
                
                if (dataVariables.length > 0) {
                    logger.info(`Found ${dataVariables.length} variables in procedure DATA section`);
                    
                    // Iterate through all matching variables to find one that passes validation
                    for (const token of dataVariables) {
                        // CRITICAL FIX: Check if this token has _possibleReferences (structure field with prefix)
                        // This is a secondary check in case token.isStructureField wasn't set during tokenization
                        if ((token as any)._possibleReferences) {
                            const possibleRefs = (token as any)._possibleReferences as string[];
                            logger.info(`PREFIX-VALIDATION: Token "${token.value}" at line ${token.line} has possible references: ${possibleRefs.join(', ')}`);
                            
                            // Check if the search word matches any of the possible references (case-insensitive)
                            const matchesReference = possibleRefs.some(ref => 
                                ref.toUpperCase() === word.toUpperCase()
                            );
                            
                            // Explicitly check if trying to access with unprefixed name - REJECT
                            const isUnprefixedMatch = token.value.toUpperCase() === word.toUpperCase();
                            
                            if (!matchesReference || (isUnprefixedMatch && !prefixPart)) {
                                if (isUnprefixedMatch && !prefixPart) {
                                    logger.info(`❌ PREFIX-REJECT: Cannot access structure field "${token.value}" with unprefixed name - must use ${possibleRefs.join(' or ')}`);
                                } else {
                                    logger.info(`❌ PREFIX-VALIDATION: Search word "${word}" not in possible references - skipping this structure field`);
                                }
                                // Skip this token and continue checking others
                                continue;
                            } else {
                                logger.info(`✅ PREFIX-VALIDATION: Search word "${word}" matches a valid reference`);
                            }
                        }
                        
                        // This token passed validation (or doesn't have _possibleReferences)
                        if (token.start > 0) {
                            // This is a prefixed field, find the label at position 0
                            const labelToken = tokens.find(t =>
                                t.line === token.line &&
                                t.start === 0 &&
                                t.type === TokenType.Label
                            );
                            
                            if (labelToken) {
                                logger.info(`Returning prefixed label location: ${labelToken.value} at line ${labelToken.line}`);
                                return Location.create(document.uri, {
                                    start: { line: labelToken.line, character: 0 },
                                    end: { line: labelToken.line, character: labelToken.value.length }
                                });
                            }
                        }
                        
                        // Return the token position as-is
                        logger.info(`Returning variable location at line ${token.line}`);
                        return Location.create(document.uri, {
                            start: { line: token.line, character: token.start },
                            end: { line: token.line, character: token.start + token.value.length }
                        });
                    }
                    
                    // If we get here, all data variables failed validation
                    logger.info(`All ${dataVariables.length} data variables failed prefix validation`);
                }

                // If still not found and we're in a MethodImplementation, also search GlobalProcedure
                // data sections — local class method implementations share their parent procedure's locals.
                if (currentScope.subType === TokenType.MethodImplementation) {
                    const globalProcs = tokens.filter(t =>
                        t.type === TokenType.Procedure &&
                        t.subType === TokenType.GlobalProcedure
                    );
                    for (const gp of globalProcs) {
                        const gpCodeMarker = gp.executionMarker;
                        const gpDataEnd = gpCodeMarker ? gpCodeMarker.line : (gp.finishesAt ?? tokens[tokens.length - 1].line);
                        const gpVars = tokens.filter(t =>
                            (t.type === TokenType.Variable || t.type === TokenType.Label) &&
                            t.start === 0 &&
                            t.line > gp.line &&
                            t.line < gpDataEnd &&
                            t.value.toLowerCase() === searchWord.toLowerCase()
                        );
                        if (gpVars.length > 0) {
                            const tok = gpVars[0];
                            logger.info(`✅ Found "${searchWord}" in GlobalProcedure data section at line ${tok.line}`);
                            return Location.create(document.uri, {
                                start: { line: tok.line, character: tok.start },
                                end: { line: tok.line, character: tok.start + tok.value.length }
                            });
                        }
                    }
                }
            } else if (currentScope.subType === TokenType.Routine && currentScope.hasLocalData) {
                // For routines with DATA sections, search only the DATA section
                logger.info(`Searching routine DATA section`);
                // The routine variable search is handled below in the general search
            }
            
            // ✨ PHASE 1 FIX: If full word search failed and we have a colon, try with stripped prefix
            if (colonIndex > 0 && searchWord === word) {
                // We searched with full word and found nothing, now try stripped version
                searchWord = word.substring(colonIndex + 1);
                logger.info(`Full word "${word}" not found in DATA section, retrying with stripped field: "${searchWord}"`);
                
                // Try parameter with stripped prefix
                const parameterDefinition = this.findParameterDefinition(searchWord, document, currentScope);
                if (parameterDefinition) {
                    logger.info(`Found parameter definition for ${searchWord} in procedure ${currentScope.value}`);
                    return parameterDefinition;
                }
                
                // Re-run the DATA section search with stripped word
                if (currentScope.subType === TokenType.Procedure || 
                    currentScope.subType === TokenType.MethodImplementation ||
                    currentScope.subType === TokenType.MethodDeclaration) {
                    
                    const codeMarker = currentScope.executionMarker;
                    let dataEnd = codeMarker ? codeMarker.line : currentScope.finishesAt;
                    
                    if (dataEnd === undefined) {
                        const nextProcedure = tokens.find(t =>
                            (t.subType === TokenType.Procedure ||
                             t.subType === TokenType.MethodImplementation ||
                             t.subType === TokenType.MethodDeclaration) &&
                            t.line > currentScope.line
                        );
                        
                        if (nextProcedure) {
                            dataEnd = nextProcedure.line;
                        } else {
                            dataEnd = tokens[tokens.length - 1].line;
                        }
                    }
                    
                    logger.info(`Re-searching DATA section with stripped word: "${searchWord}"`);
                    
                    // Same logic as above but with stripped searchWord
                    const dataVariables = tokens.filter(token => {
                        const isStructureField = token.isStructureField || token.structurePrefix;
                        let exactMatch = token.value.toLowerCase() === searchWord.toLowerCase();
                        let prefixedMatch = token.type === TokenType.Label &&
                                           token.value.includes(':') &&
                                           token.value.toLowerCase().endsWith(':' + searchWord.toLowerCase());
                        
                        if (isStructureField) {
                            if (!prefixPart && exactMatch) {
                                return false;
                            }
                            if (!prefixedMatch) {
                                return false;
                            }
                        } else {
                            if (!exactMatch && !prefixedMatch) {
                                return false;
                            }
                        }
                        
                        if (token.type !== TokenType.Variable && token.type !== TokenType.Label) {
                            return false;
                        }
                        
                        if (token.line <= currentScope.line || (dataEnd !== undefined && token.line >= dataEnd)) {
                            return false;
                        }
                        
                        if (exactMatch && token.start > 0) {
                            const labelAtStart = tokens.find(t =>
                                t.line === token.line &&
                                t.start === 0 &&
                                t.type === TokenType.Label
                            );
                            
                            if (labelAtStart && labelAtStart.value.includes(':')) {
                                return true;
                            }
                            
                            return false;
                        }
                        
                        return true;
                    });
                    
                    if (dataVariables.length > 0) {
                        logger.info(`Found ${dataVariables.length} variables with stripped word in DATA section`);
                        
                        for (const token of dataVariables) {
                            if ((token as any)._possibleReferences) {
                                const possibleRefs = (token as any)._possibleReferences as string[];
                                const matchesReference = possibleRefs.some(ref => 
                                    ref.toUpperCase() === word.toUpperCase()
                                );
                                const isUnprefixedMatch = token.value.toUpperCase() === word.toUpperCase();
                                
                                if (!matchesReference || (isUnprefixedMatch && !prefixPart)) {
                                    continue;
                                }
                            }
                            
                            if (token.start > 0) {
                                const labelToken = tokens.find(t =>
                                    t.line === token.line &&
                                    t.start === 0 &&
                                    t.type === TokenType.Label
                                );
                                
                                if (labelToken) {
                                    return Location.create(document.uri, {
                                        start: { line: labelToken.line, character: 0 },
                                        end: { line: labelToken.line, character: labelToken.value.length }
                                    });
                                }
                            }
                            
                            return Location.create(document.uri, {
                                start: { line: token.line, character: token.start },
                                end: { line: token.line, character: token.start + token.value.length }
                            });
                        }
                    }
                }
            }
        } else {
            logger.info(`❌ NO SCOPE FOUND at line ${currentLine} - cannot check for parameters`);
        }
    
        // DEBUG: Log all tokens that match the word to see what we're getting
        const allMatchingTokens = TokenHelper.findTokens(tokens, { value: searchWord });
        logger.info(`🔍 DEBUG: Found ${allMatchingTokens.length} tokens matching "${searchWord}"`);
        allMatchingTokens.forEach(t => 
            logger.info(`  -> Line ${t.line}, Type: ${t.type}, Start: ${t.start}, Value: "${t.value}"`)
        );

        const variableTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
             token.type === TokenType.ReferenceVariable ||
             token.type === TokenType.ImplicitVariable ||
             token.type === TokenType.Label) &&
            token.value.toLowerCase() === searchWord.toLowerCase() &&
            token.start === 0 &&
            !(token.line === position.line &&
              position.character >= token.start &&
              position.character <= token.start + token.value.length)
        );
    
        if (variableTokens.length > 0) {
            logger.info(`Found ${variableTokens.length} variable tokens for ${searchWord}`);
            variableTokens.forEach(token =>
                logger.info(`  -> Token: ${token.value} at line ${token.line}, type: ${token.type}, start: ${token.start}`)
            );
    
            if (currentScope) {
                const allScopes = this.getEnclosingScopes(tokens, currentScope);
                for (const scope of allScopes) {
                    const scopedVariables = variableTokens.filter(token =>
                        token.line >= scope.line &&
                        (scope.finishesAt === undefined || token.line <= scope.finishesAt)
                    );
                    if (scopedVariables.length > 0) {
                        logger.info(`✅ Found ${scopedVariables.length} variables in scope ${scope.value}`);
                        
                        // Apply scope filtering before prefix validation
                        const accessibleVariables = this.filterByScope(
                            scopedVariables,
                            document,
                            position
                        );
                        
                        if (accessibleVariables.length === 0) {
                            logger.info(`⚠️ No accessible variables in scope ${scope.value} after filtering`);
                            continue; // Try next scope
                        }
                        
                        logger.info(`✅ ${accessibleVariables.length} accessible variables after scope filtering`);
                        
                        // Iterate through accessible variables to find one that passes validation
                        for (const token of accessibleVariables) {
                            // CRITICAL FIX: Check if this is a structure field that requires a prefix
                            // First check: token properties set during tokenization
                            if ((token as any).isStructureField || (token as any).structurePrefix) {
                                logger.info(`❌ PREFIX-SKIP: Token "${token.value}" is a structure field with prefix "${(token as any).structurePrefix}" - skipping for bare field name`);
                                continue; // Skip this token and try the next one
                            }
                            
                            // Second check: _possibleReferences validation (in case token properties weren't set)
                            if ((token as any)._possibleReferences) {
                                const possibleRefs = (token as any)._possibleReferences as string[];
                                logger.info(`PREFIX-VALIDATION: Token "${token.value}" at line ${token.line} has possible references: ${possibleRefs.join(', ')}`);
                                
                                // Check if search word matches a valid prefixed/dotted reference
                                const matchesReference = possibleRefs.some(ref =>
                                    ref.toUpperCase() === word.toUpperCase()
                                );
                                
                                // Explicitly check if trying to access with unprefixed name - REJECT
                                const isUnprefixedMatch = token.value.toUpperCase() === word.toUpperCase();
                                
                                // For standalone words (no prefix/qualifier), we should NOT match structure fields
                                if (isStandaloneWord && isUnprefixedMatch) {
                                    logger.info(`❌ PREFIX-REJECT-STANDALONE: Cannot access structure field "${token.value}" with unprefixed name in standalone context - must use ${possibleRefs.join(' or ')}`);
                                    continue; // Skip this structure field and look for other matches
                                }
                                
                                if (!matchesReference || (isUnprefixedMatch && !prefixPart)) {
                                    if (isUnprefixedMatch && !prefixPart) {
                                        logger.info(`❌ PREFIX-REJECT: Cannot access structure field "${token.value}" with unprefixed name - must use ${possibleRefs.join(' or ')}`);
                                    } else {
                                        logger.info(`❌ PREFIX-VALIDATION: Search word "${word}" not in possible references - skipping this structure field`);
                                    }
                                    continue; // Skip this token and try the next one
                                } else {
                                    logger.info(`✅ PREFIX-VALIDATION: Search word "${word}" matches a valid reference`);
                                }
                            }
                            
                            // This token passed validation
                            return Location.create(document.uri, {
                                start: { line: token.line, character: token.start },
                                end: { line: token.line, character: token.start + token.value.length }
                            });
                        }
                        
                        // All variables in this scope failed validation, continue to next scope
                        logger.info(`All variables in scope ${scope.value} failed prefix validation`);
                    }
                }
            }
    
            logger.info(`🔁 No scoped match found; skipping to global lookup`);
        }
    
        // 🌍 Global fallback
        const globalSymbol = await this.symbolFinder.findGlobalVariable(searchWord, tokens, document);
        if (globalSymbol) {
            // Convert SymbolInfo to Location
            const globalLocation = Location.create(globalSymbol.location.uri, {
                start: { line: globalSymbol.location.line, character: globalSymbol.location.character },
                end: { line: globalSymbol.location.line, character: globalSymbol.location.character + globalSymbol.token.value.length }
            });
            
            // Validate scope accessibility before returning cross-file results
            const globalUri = globalLocation.uri;
            if (globalUri !== document.uri) {
                // This is a cross-file result - validate scope
                logger.info(`🔍 SCOPE-CHECK: Found global definition in different file, validating access`);
                
                // Read the declaring document
                const declPath = decodeURIComponent(globalUri.replace('file:///', '')).replace(/\//g, '\\');
                if (fs.existsSync(declPath)) {
                    const declContents = fs.readFileSync(declPath, 'utf-8');
                    const declDoc = TextDocument.create(globalUri, 'clarion', 1, declContents);
                    
                    const canAccess = this.scopeAnalyzer.canAccess(
                        position,
                        globalLocation.range.start,
                        document,
                        declDoc
                    );
                    
                    if (canAccess) {
                        logger.info(`✅ SCOPE-CHECK: Can access global definition cross-file`);
                        return globalLocation;
                    } else {
                        logger.info(`❌ SCOPE-CHECK: Cannot access this symbol cross-file (scope boundaries violated)`);
                        // Return null - scope violation should block access, not continue to fallbacks
                        return null;
                    }
                }
            } else {
                // Same file - no cross-file validation needed
                return globalLocation;
            }
        }
    
        // 🔗 MEMBER file parent search fallback (including parent's INCLUDE chain)
        logger.info(`🔍 Checking for MEMBER parent file (+ includes) for global variable lookup`);
        const varLocation = await this.memberLocator.findVariableInParentChain(searchWord, document);
        if (varLocation) {
            logger.info(`✅ Found variable "${searchWord}" via MemberLocatorService: ${varLocation.uri} line ${varLocation.range.start.line}`);
            return varLocation;
        }
    
        // 🎯 Try FILE structure fallback
        logger.info(`🧐 Still no match; checking for FILE/QUEUE/GROUP label fallback`);

        // CRITICAL FIX: Check if this is a standalone word without prefix or structure notation
        // We already have the line and isStandaloneWord from earlier in the method
        logger.info(`Is standalone word in label fallback: ${isStandaloneWord}, line: "${line}"`);

        const labelToken = tokens.find(t =>
            t.type === TokenType.Label &&
            t.value.toLowerCase() === searchWord.toLowerCase() &&
            t.start === 0
        );
    
        if (labelToken) {
            logger.info(`Found label token for ${searchWord} at line ${labelToken.line}`);
            const labelIndex = tokens.indexOf(labelToken);
            for (let i = labelIndex + 1; i < tokens.length; i++) {
                const t = tokens[i];
                // Check for FILE, QUEUE, GROUP, RECORD structures
                if (t.type === TokenType.Structure &&
                    (t.value.toUpperCase() === "FILE" ||
                     t.value.toUpperCase() === "QUEUE" ||
                     t.value.toUpperCase() === "GROUP" ||
                     t.value.toUpperCase() === "RECORD")) {
                    
                    // PREFIX-CHECK: Get the symbol to check if it's a structure field with prefix requirements
                    const symbolTokens = this.tokenCache.getTokens(document);
                    if (!symbolTokens || symbolTokens.length === 0) {
                        logger.error(`PREFIX-CHECK: No tokens found for document ${document.uri}`);
                        // Don't return early - continue to check if this is a structure field
                        // If we can't get symbols, we can't validate, so skip this match
                        continue;
                    }
                    const symbols = this.symbolProvider.provideDocumentSymbols(symbolTokens, document.uri);
                    const fieldSymbol = this.findFieldInSymbols(symbols, searchWord);
                    
                    if (fieldSymbol) {
                        const possibleRefs = (fieldSymbol as any)._possibleReferences;
                        const isStructureField = (fieldSymbol as any)._isPartOfStructure;
                        
                        if (isStructureField && possibleRefs && possibleRefs.length > 0) {
                            logger.info(`PREFIX-LABEL-CHECK: Label "${searchWord}" is a structure field with possible refs: ${possibleRefs.join(', ')}`);
                            
                            // Check if the original word matches any of the possible references
                            const wordUpper = word.toUpperCase();
                            const matchesRef = possibleRefs.some((ref: string) =>
                                ref.toUpperCase() === wordUpper
                            );
                            
                            // CRITICAL FIX: For standalone words, we should NEVER match structure fields
                            if (isStandaloneWord) {
                                logger.info(`❌ PREFIX-LABEL-REJECT-STANDALONE: Cannot access structure field "${searchWord}" with unprefixed name in standalone context`);
                                continue; // Skip this structure field and continue searching
                            }
                            
                            if (!matchesRef) {
                                logger.info(`❌ PREFIX-LABEL-SKIP: Structure field "${searchWord}" - word "${word}" not in possible references`);
                                // Don't return this label - it's accessed without proper prefix
                                continue;
                            } else {
                                logger.info(`✅ PREFIX-LABEL-MATCH: Structure field "${searchWord}" accessed with valid reference "${word}"`);
                            }
                        }
                    }
                    
                    logger.info(`📄 Resolved ${searchWord} as ${t.value} label definition`);
                    return Location.create(document.uri, {
                        start: { line: labelToken.line, character: 0 },
                        end: { line: labelToken.line, character: labelToken.value.length }
                    });
                }
                if (t.type === TokenType.Label) break;
            }
        }
    
        logger.info(`🛑 No matching global or local variable found — skipping fallback to random match`);
        return null;
    }

    // Removed duplicate method
    
    /**
     * Helper to find a field symbol by name (case-insensitive) in symbols tree
     */
    private findFieldInSymbols(symbols: DocumentSymbol[], fieldName: string): DocumentSymbol | undefined {
        for (const symbol of symbols) {
            const varName = (symbol as any)._clarionVarName;
            if (varName && varName.toUpperCase() === fieldName.toUpperCase()) {
                return symbol;
            }
            
            // Recursively search children
            if (symbol.children && symbol.children.length > 0) {
                const found = this.findFieldInSymbols(symbol.children, fieldName);
                if (found) return found;
            }
        }
        return undefined;
    }
    
    /**
     * Helper to find a symbol at a specific line with a specific name
     */
    private findSymbolAtLine(symbols: DocumentSymbol[], line: number, varName: string): DocumentSymbol | undefined {
        for (const symbol of symbols) {
            // Check if this symbol is at the given line
            if (symbol.range.start.line === line) {
                const symbolVarName = (symbol as any)._clarionVarName || symbol.name.match(/^([^\s]+)/)?.[1] || symbol.name;
                if (symbolVarName.toUpperCase() === varName.toUpperCase()) {
                    return symbol;
                }
            }
            
            // Recursively search children
            if (symbol.children && symbol.children.length > 0) {
                const found = this.findSymbolAtLine(symbol.children, line, varName);
                if (found) return found;
            }
        }
        return undefined;
    }
    


    /**
 * Gets all enclosing scopes from innermost outward (L4 to L2) for fallback resolution
 */
    private getEnclosingScopes(tokens: Token[], innermost: Token): Token[] {
        const allScopes: Token[] = [];

        let current: Token | undefined = innermost;
        while (current) {
            allScopes.push(current);
            current = this.findEnclosingScope(tokens, current);
        }

        return allScopes;
    }

    /**
     * Finds the next outer scope that encloses the given token
     */
    private findEnclosingScope(tokens: Token[], inner: Token): Token | undefined {
        const candidates = tokens.filter(token =>
            (token.subType === TokenType.Procedure || token.subType === TokenType.Routine || token.subType === TokenType.Class) &&
            token.line < inner.line &&
            (token.finishesAt === undefined || token.finishesAt > inner.line)
        );

        // Return the closest enclosing one
        return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
    }

    /**
 * Extracts the filename from a MEMBER('...') declaration in the given tokens
 */
    private getMemberFileName(tokens: Token[]): string | null {
        const memberToken = tokens.find(token =>
            token.type === TokenType.ClarionDocument &&
            token.value.toUpperCase().startsWith("MEMBER(")
        );

        if (!memberToken) return null;

        const match = memberToken.value.match(/MEMBER\s*\(\s*['"](.+?)['"]\s*\)/i);
        return match ? match[1] : null;
    }

    
    /**
     * Recursively searches for a definition in INCLUDE files and falls back to MEMBER files
     * @param word The word to find
     * @param fromPath The file path to start searching from
     * @param visited Optional set of already visited files to prevent cycles
     * @returns A Location if found, null otherwise
     */
    private async findDefinitionInIncludes(word: string, fromPath: string, visited?: Set<string>): Promise<Location | null> {
        fromPath = decodeURIComponent(fromPath);
        // Initialize visited set if not provided
        if (!visited) {
            visited = new Set<string>();
        }

        // Prevent revisiting the same file
        if (visited.has(fromPath)) {
            logger.info(`Already visited ${fromPath}, skipping to prevent cycles`);
            return null;
        }

        // Mark this file as visited
        visited.add(fromPath);
        logger.info(`Searching for definition of '${word}' in file: ${fromPath}`);

        // Get the SolutionManager instance
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager) {
            logger.warn("No SolutionManager instance available");
            return null;
        }

        // Find the project for this file
        const project = solutionManager.findProjectForFile(fromPath);
        if (!project) {
            logger.warn(`No project found for file: ${fromPath}`);
            return null;
        }

        // Create a TextDocument for the file
        const fileContents = await project.readFileContents(fromPath);
        if (!fileContents) {
            logger.warn(`Could not read file contents: ${fromPath}`);
            return null;
        }

        const fileUri = `file:///${fromPath.replace(/\\/g, "/")}`;
        const document = TextDocument.create(fileUri, "clarion", 1, fileContents);

        // Tokenize the file
        const tokens = this.tokenCache.getTokens(document);

        // First, check if the word is defined in this file
        const labelToken = tokens.find(token =>
            token.start === 0 &&
            token.type === TokenType.Label &&
            token.value.toLowerCase() === word.toLowerCase()
        );

        if (labelToken) {
            logger.info(`Found label definition for '${word}' in ${fromPath} at line ${labelToken.line}`);
            
            // NOTE: We cannot perform scope checking here because we don't have:
            // 1. The reference document (where F12 was pressed)
            // 2. The reference position
            // This recursive function only searches files, it doesn't validate scope.
            // Scope checking needs to happen at the call site where we have the reference context.
            
            return Location.create(document.uri, {
                start: { line: labelToken.line, character: 0 },
                end: { line: labelToken.line, character: labelToken.value.length }
            });
        }

        // INCLUDE Search Logic
        // Find all INCLUDE statements in the file, searching bottom-up
        const includeTokens = tokens.filter(token =>
            token.value.toUpperCase().includes('INCLUDE') &&
            token.value.includes("'")
        );

        // Process includes in reverse order (bottom-up)
        for (let i = includeTokens.length - 1; i >= 0; i--) {
            const includeToken = includeTokens[i];
            
            // Extract the include filename from the token value
            const match = includeToken.value.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!match || !match[1]) continue;
            
            const includeFileName = match[1];
            logger.info(`Found INCLUDE statement for '${includeFileName}' at line ${includeToken.line}`);
            
            // Use the project's redirection parser to resolve the actual file path
            const redirectionParser = project.getRedirectionParser();
            const resolvedPath = redirectionParser.findFile(includeFileName);
            
            if (resolvedPath && resolvedPath.path && fs.existsSync(resolvedPath.path)) {
                logger.info(`Resolved INCLUDE file path: ${resolvedPath.path} (source: ${resolvedPath.source})`);
                
                // Recursively search in the included file
                const result = await this.findDefinitionInIncludes(word, resolvedPath.path, visited);
                if (result) {
                    logger.info(`Found definition in included file: ${resolvedPath.path}`);
                    return result;
                }
            } else {
                logger.warn(`Could not resolve INCLUDE file: ${includeFileName}`);
            }
        }

        // MEMBER Fallback Logic
        // If no definition found in includes, check for MEMBER statements
        const memberFileName = this.getMemberFileName(tokens);
        if (memberFileName) {
            logger.info(`Found MEMBER reference to '${memberFileName}'`);
            
            // Resolve the member file path
            const redirectionParser = project.getRedirectionParser();
            const resolvedMember = redirectionParser.findFile(memberFileName);
            
            if (resolvedMember && resolvedMember.path && fs.existsSync(resolvedMember.path) && !visited.has(resolvedMember.path)) {
                logger.info(`Resolved MEMBER file path: ${resolvedMember.path} (source: ${resolvedMember.source})`);
                
                // Recursively search in the member file
                const result = await this.findDefinitionInIncludes(word, resolvedMember.path, visited);
                if (result) {
                    logger.info(`Found definition in member file: ${resolvedMember.path}`);
                    return result;
                }
            } else {
                logger.warn(`Could not resolve MEMBER file: ${memberFileName}`);
            }
        }

        logger.info(`No definition found for '${word}' in ${fromPath} or its includes/members`);
        return null;
    }

    /**
     * Finds the definition location for a file reference
     */
    private async findFileDefinition(fileName: string, documentUri: string): Promise<Definition | null> {
        logger.info(`Finding definition for file: ${fileName}`);

        // Clean up the fileName - remove quotes and other non-filename characters
        fileName = fileName.replace(/['"()]/g, '').trim();

        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager) {
            logger.warn('No solution manager instance available');
            return null;
        }

        // Extract the document path from the URI
        const documentPath = documentUri.replace('file:///', '').replace(/\//g, '\\');
        logger.info(`Document path: ${documentPath}`);

        // Use the SolutionManager's findFileWithExtension method which now returns path and source
        const result = await solutionManager.findFileWithExtension(fileName);
        let filePath = '';

        if (result && result.path) {
            filePath = result.path;
            logger.info(`Found file: ${filePath} (source: ${result.source})`);
        } else if (!path.extname(fileName)) {
            // If no extension was provided and no file was found, try with server's defaultLookupExtensions
            // This is now handled by the SolutionManager's findFileWithExtension method
            logger.info(`No file found with name ${fileName}, SolutionManager should have tried with default extensions`);
        }

        if (!filePath || !fs.existsSync(filePath)) {
            logger.warn(`File not found: ${fileName}`);
            return null;
        }

        // Convert file path to URI format
        const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;

        // Return the location at the beginning of the file
        return Location.create(fileUri, {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        });
    }

    /**
     * Finds parameter definition in a procedure/method signature
     * Handles formats like: ProcName PROCEDURE(LONG pLen, STRING pName=default)
     */
    private findParameterDefinition(word: string, document: TextDocument, currentScope: Token): Location | null {
        logger.info(`Looking for parameter ${word} in procedure ${currentScope.value}`);
        
        const content = document.getText();
        const lines = content.split('\n');
        
        // Get the procedure line
        const procedureLine = lines[currentScope.line];
        if (!procedureLine) {
            return null;
        }
        
        // Match PROCEDURE(...) pattern to extract parameters
        const match = procedureLine.match(/PROCEDURE\s*\((.*?)\)/i);
        if (!match || !match[1]) {
            logger.info(`No parameters found in procedure signature`);
            return null;
        }
        
        const paramString = match[1];
        logger.info(`Parameter string: "${paramString}"`);
        const paramStartColumn = procedureLine.indexOf('(') + 1;
        
        // Split parameters by comma (simple split, doesn't handle nested parentheses yet)
        const params = paramString.split(',');
        let currentColumn = paramStartColumn;
        
        for (const param of params) {
            const trimmedParam = param.trim();
            // Strip optional-parameter angle brackets: <Key K> → Key K
            const stripped = trimmedParam.replace(/^<(.*)>$/, '$1').trim();
            logger.info(`Checking parameter: "${stripped}"`);
            
            // Extract parameter name (last word before = or end of parameter)
            // Format: TYPE paramName or TYPE paramName=default or *TYPE paramName or &TYPE paramName
            // Match pattern: optional pointer/reference, whitespace, type, whitespace, paramName, optional =default
            const paramMatch = stripped.match(/[*&]?\s*\w+\s+([A-Za-z_][A-Za-z0-9_:]*[A-Za-z0-9_])(?:\s*=.*)?$/i);
            if (paramMatch) {
                const paramName = paramMatch[1];
                logger.info(`Extracted parameter name: "${paramName}"`);
                if (paramName.toLowerCase() === word.toLowerCase()) {
                    // Find the position of this parameter name in the original line
                    const paramNameIndex = procedureLine.indexOf(paramName, currentColumn);
                    if (paramNameIndex >= 0) {
                        logger.info(`Found parameter ${paramName} at column ${paramNameIndex}`);
                        return Location.create(document.uri, {
                            start: { line: currentScope.line, character: paramNameIndex },
                            end: { line: currentScope.line, character: paramNameIndex + paramName.length }
                        });
                    }
                }
            }
            // Move past this parameter for next iteration
            currentColumn += param.length + 1; // +1 for comma
        }
        
        logger.info(`Parameter ${word} not found in procedure signature`);
        return null;
    }

    /**
     * Finds a class member definition (property or method) in the current class context
     */
    private async findClassMember(tokens: Token[], memberName: string, document: TextDocument, currentLine: number): Promise<Location | null> {
        logger.info(`Looking for class member ${memberName} in current context`);

        const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
        
        // Find the current class or method context
        let currentScope = TokenHelper.getInnermostScopeAtLine(structure, currentLine); // 🚀 PERFORMANCE: O(log n) vs O(n)
        if (!currentScope) {
            logger.info('No scope found - cannot determine class context');
            return null;
        }

        // If we're in a routine, we need the parent scope (the method/procedure) to get the class name
        if (currentScope.subType === TokenType.Routine) {
            logger.info(`Current scope is a routine (${currentScope.value}), looking for parent scope`);
            const parentScope = TokenHelper.getParentScopeOfRoutine(structure, currentScope); // 🚀 PERFORMANCE: O(1) vs O(n)
            if (parentScope) {
                currentScope = parentScope;
                logger.info(`Using parent scope: ${currentScope.value}`);
            } else {
                logger.info('No parent scope found for routine');
                return null;
            }
        }

        // For method implementations, extract the class name (e.g., "StringTheory._Malloc" -> "StringTheory")
        let className: string | null = null;
        if (currentScope.value.includes('.')) {
            className = currentScope.value.split('.')[0];
            logger.info(`Extracted class name from method: ${className}`);
        } else {
            // Scope value doesn't have class name, try to parse from the actual line
            const content = document.getText();
            const lines = content.split('\n');
            const scopeLine = lines[currentScope.line];
            logger.info(`Scope line text: "${scopeLine}"`);
            
            // Match ClassName.MethodName PROCEDURE pattern
            const classMethodMatch = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
            if (classMethodMatch) {
                className = classMethodMatch[1];
                logger.info(`Extracted class name from line: ${className}`);
            }
        }

        if (!className) {
            logger.info('Could not determine class name from context');
            return null;
        }

        // Find the class member in this class
        return this.findClassMemberInType(tokens, className, memberName, document);
    }

    /**
     * Finds a class member in a specific class type
     */
    private async findClassMemberInType(tokens: Token[], className: string, memberName: string, document: TextDocument, paramCount?: number): Promise<Location | null> {
        logger.info(`Looking for member ${memberName} in class/structure ${className}`);

        // First: search current file tokens for any structure (CLASS, QUEUE, GROUP, FILE) with this label
        const structureLabelToken = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.parent === undefined &&
            t.value.toLowerCase() === className.toLowerCase()
        );

        if (structureLabelToken) {
            logger.info(`Found structure definition for ${className} at line ${structureLabelToken.line}`);
            const result = await this.findFieldInStructure(tokens, structureLabelToken, memberName, document, { line: structureLabelToken.line, character: 0 });
            if (result) {
                return Array.isArray(result) ? result[0] : result;
            }
        }

        // Second: search CLASS structures (existing logic)
        const classTokens = TokenHelper.findClassStructures(tokens)
            .filter(token => token.line > 0);

        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className.toLowerCase()
            );

            if (labelToken) {
                logger.info(`Found class definition for ${className} at line ${labelToken.line}`);
                const result = await this.findFieldInStructure(tokens, labelToken, memberName, document, { line: labelToken.line, character: 0 });
                if (result) {
                    return Array.isArray(result) ? result[0] : result;
                }
            }
        }

        // Third: cross-file lookup via MemberLocatorService (INCLUDE chain + class index + parent chain)
        logger.info(`Structure ${className} not found in current file, delegating to MemberLocatorService`);
        const memberInfo = await this.memberLocator.findMemberInClass(className, memberName, document, paramCount);
        if (memberInfo) {
            return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
        }

        // Fallback: equates.clw (implicitly global — not always in INCLUDE chain)
        const equatesPath = SolutionManager.getInstance()?.getEquatesPath();
        if (equatesPath && fs.existsSync(equatesPath)) {
            const equatesUri = `file:///${equatesPath.replace(/\\/g, '/')}`;
            // Skip disk read if equates.clw is already cached — findMemberInClass uses
            // getTokensByUri first so the empty content will never be tokenized
            const equatesDoc = TextDocument.create(
                equatesUri, 'clarion', 1,
                this.tokenCache.getTokensByUri(equatesUri) ? '' : fs.readFileSync(equatesPath, 'utf8')
            );
            const equatesInfo = await this.memberLocator.findMemberInClass(className, memberName, equatesDoc, paramCount);
            if (equatesInfo) {
                return Location.create(equatesInfo.file, Range.create(equatesInfo.line, 0, equatesInfo.line, 0));
            }
        }

        return null;
    }

    /**
     * Find INTERFACE declaration by name, searching:
     * 1. Current document tokens
     * 2. INCLUDE files
     * 3. equates.clw
     */
    private async findInterfaceDeclaration(ifaceName: string, document: TextDocument, tokens: Token[]): Promise<Location | null> {
        // Search current document
        const local = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.label?.toLowerCase() === ifaceName.toLowerCase()
        );
        if (local) {
            return Location.create(document.uri, Range.create(local.line, 0, local.line, 0));
        }

        // Search INCLUDE files
        const result = await this.findTypeDeclarationInIncludes(ifaceName, decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\'), new Set());
        if (result) return result;

        // Search equates.clw
        const sm = SolutionManager.getInstance();
        const equatesTokens = sm?.getEquatesTokens();
        const equatesPath = sm?.getEquatesPath();
        if (equatesTokens && equatesPath) {
            const eq = equatesTokens.find(t =>
                t.type === TokenType.Structure &&
                t.subType === TokenType.Interface &&
                t.label?.toLowerCase() === ifaceName.toLowerCase()
            );
            if (eq) {
                const uri = `file:///${equatesPath.replace(/\\/g, '/')}`;
                return Location.create(uri, Range.create(eq.line, 0, eq.line, 0));
            }
        }

        return null;
    }

    /**
     * Walk INCLUDE files reachable from the document and find a structure (QUEUE/GROUP/FILE/CLASS)
     * declaration with label = typeName. Returns a Location pointing to that declaration line.
     */
    private async findTypeInIncludes(typeName: string, document: TextDocument): Promise<Location | null> {
        const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const result = await this.findTypeDeclarationInIncludes(typeName, fromPath, new Set());
        if (result) return result;

        // If this is a MEMBER module, also scan the parent program file's includes.
        // Types like base classes (e.g. Class(ce_MetroWizardForm)) may only be included
        // in the parent PROGRAM file, not in the MEMBER module.
        const tokens = this.tokenCache.getTokensByUri(document.uri);
        const memberToken = tokens?.find(t =>
            t.line < 10 &&
            t.value?.toUpperCase() === 'MEMBER' &&
            t.referencedFile
        );
        if (memberToken?.referencedFile) {
            const solutionManager = SolutionManager.getInstance();
            let parentPath: string | null = null;
            if (solutionManager?.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(memberToken.referencedFile);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        parentPath = resolved.path;
                        break;
                    }
                }
            }
            if (!parentPath) {
                const candidate = path.join(path.dirname(fromPath), memberToken.referencedFile);
                if (fs.existsSync(candidate)) parentPath = candidate;
            }
            if (parentPath) {
                const parentResult = await this.findTypeDeclarationInIncludes(typeName, parentPath, new Set());
                if (parentResult) return parentResult;
            }
        }

        // Fallback: check equates.clw (implicitly global in all Clarion programs)
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            const equatesPath = solutionManager.getEquatesPath();
            if (equatesPath) {
                return this.findTypeDeclarationInIncludes(typeName, equatesPath, new Set());
            }
        }
        return null;
    }

    private async findTypeDeclarationInIncludes(
        typeName: string,
        fromPath: string,
        visited: Set<string>
    ): Promise<Location | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const includeFile = match[1];
            let resolvedPath: string | null = null;

            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(includeFile);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            if (!resolvedPath) {
                const candidate = path.join(path.dirname(fromPath), includeFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }
            if (!resolvedPath) continue;

            const uri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
            let incTokens = this.tokenCache.getTokensByUri(uri);
            if (!incTokens || incTokens.length === 0) {
                try {
                    const { TextDocument: TD } = await import('vscode-languageserver-textdocument');
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    const incDoc = TD.create(uri, 'clarion', 1, incContent);
                    incTokens = this.tokenCache.getTokens(incDoc);
                } catch { incTokens = null; }
            }

            if (incTokens && incTokens.length > 0) {
                const labelToken = incTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    logger.info(`Found type "${typeName}" in ${resolvedPath}:${labelToken.line}`);
                    return Location.create(uri, Range.create(labelToken.line, 0, labelToken.line, 0));
                }
            }

            const nested = await this.findTypeDeclarationInIncludes(typeName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }


    private async findClassTypeDefinition(word: string, document: TextDocument): Promise<Location | null> {
        try {
            const fromPath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
            const projectPath = path.dirname(fromPath);

            const sdi = StructureDeclarationIndexer.getInstance();
            await sdi.getOrBuildIndex(projectPath);
            const definitions = sdi.find(word, projectPath);
            if (definitions.length === 0) return null;

            const def = definitions[0];
            const uri = `file:///${def.filePath.replace(/\\/g, '/')}`;
            logger.error(`✅ ${def.structureType} type F12: "${word}" → ${def.filePath}:${def.line + 1}`);
            return Location.create(uri, Range.create(def.line, 0, def.line, 0));
        } catch (e) {
            logger.error(`findClassTypeDefinition error: ${e}`);
            return null;
        }
    }

    private findVariableType(tokens: Token[], variableName: string, currentLine: number): string | null {
        logger.info(`Looking for type of variable ${variableName}`);

        // Find the variable declaration
        const varTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
                token.type === TokenType.ReferenceVariable ||
                token.type === TokenType.ImplicitVariable ||
                token.type === TokenType.Label) &&
            token.value.toLowerCase() === variableName.toLowerCase() &&
            token.start === 0
        );

        if (varTokens.length === 0) {
            // Check if it's a parameter
            const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, currentLine);
            if (currentScope) {
                // TODO: Parse parameters to get type - for now return null
                logger.info('Variable might be a parameter - parameter type detection not yet implemented');
            }
            return null;
        }

        const varToken = varTokens[0];
        
        // Find the type token on the same line (should be after the variable name)
        const lineTokens = TokenHelper.findTokens(tokens, { line: varToken.line })
            .filter(t => t.start > varToken.start);

        // Handle QUEUE(TypeName), GROUP(TypeName), CLASS(TypeName) — type is inside parens
        const structureToken = lineTokens.find(t => t.type === TokenType.Structure);
        if (structureToken) {
            const afterStructure = lineTokens.filter(t => t.start > structureToken.start);
            const typeArg = afterStructure.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value !== '(' && t.value !== ')'
            );
            if (typeArg) {
                logger.info(`Found structure type arg ${typeArg.value} for variable ${variableName}`);
                return typeArg.value;
            }
        }

        // Handle LIKE(TypeName) — mirrors type of a named variable/type
        const likeToken = lineTokens.find(t => t.type === TokenType.TypeReference);
        if (likeToken) {
            const afterLike = lineTokens.filter(t => t.start > likeToken.start);
            const typeArg = afterLike.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value !== '(' && t.value !== ')'
            );
            if (typeArg) {
                logger.info(`Found LIKE type arg ${typeArg.value} for variable ${variableName}`);
                return typeArg.value;
            }
        }

        const typeToken = lineTokens.find(t =>
            t.type === TokenType.Type || 
            t.type === TokenType.Label || // Class names appear as labels
            /^[A-Z][A-Za-z0-9_]*$/.test(t.value) // Capitalized word (likely a class name)
        );

        if (typeToken) {
            logger.info(`Found type ${typeToken.value} for variable ${variableName}`);
            return typeToken.value;
        }

        return null;
    }

    /**
     * Checks if cursor is on a declaration line (method declaration or MAP procedure)
     * When on a declaration, F12 should not navigate (already at definition)
     */
    private isOnDeclaration(line: string, position: Position, word: string): boolean {
        // Check if line contains PROCEDURE or FUNCTION keyword (but not a method implementation)
        const hasProcedureKeyword = /\b(PROCEDURE|FUNCTION)\b/i.test(line);
        if (!hasProcedureKeyword) {
            return false;
        }
        
        // Rule out method implementations: ClassName.MethodName or ClassName.IFace.MethodName PROCEDURE
        const isMethodImplementation = /^\s*\w+\.\w+(?:\.\w+)?\s+(PROCEDURE|FUNCTION)/i.test(line);
        if (isMethodImplementation) {
            return false;
        }

        // Check if word appears before PROCEDURE/FUNCTION keyword (declaration pattern)
        // Examples:
        //   SomeMethod   PROCEDURE(...)
        //   TestProc     FUNCTION(...)
        const procMatch = line.match(/^(\s*)(\w+)\s+(PROCEDURE|FUNCTION)/i);
        if (procMatch && procMatch[2].toLowerCase() === word.toLowerCase()) {
            logger.info(`Detected cursor on declaration: ${word}`);
            return true;
        }

        return false;
    }

    /**
     * Filters a list of candidate tokens by scope accessibility
     * Returns tokens that are accessible from the reference location
     * Prioritizes closer scopes over distant scopes
     * 
     * @param candidates Array of tokens representing possible definitions
     * @param referenceDoc Document where the reference occurs
     * @param referencePos Position of the reference
     * @returns Filtered and sorted array of tokens (closest scope first)
     */
    private filterByScope(
        candidates: Token[],
        referenceDoc: TextDocument,
        referencePos: Position
    ): Token[] {
        if (candidates.length === 0) {
            return [];
        }

        logger.info(`🔍 SCOPE-FILTER: Filtering ${candidates.length} candidates at ref position ${referencePos.line}:${referencePos.character}`);

        // Check which candidates are accessible
        const accessible = candidates.filter(candidate => {
            // Create a position for the declaration (use token's line and start position)
            const declPos: Position = { line: candidate.line, character: candidate.start };
            
            // Check if reference can access this declaration
            const canAccess = this.scopeAnalyzer.canAccess(
                referencePos,
                declPos,
                referenceDoc,
                referenceDoc  // Same document for now (Phase 1)
            );

            logger.info(`  ${canAccess ? '✅' : '❌'} Token at line ${candidate.line}: ${candidate.value} (type: ${candidate.type})`);
            
            return canAccess;
        });

        if (accessible.length === 0) {
            logger.info(`⚠️ SCOPE-FILTER: No accessible candidates found - variable is out of scope`);
            return []; // Return empty array - variable is not accessible from this scope
        }

        logger.info(`✅ SCOPE-FILTER: Filtered to ${accessible.length} accessible candidates`);

        // Sort by scope distance (closest scope first)
        accessible.sort((a, b) => {
            const aScopeInfo = this.scopeAnalyzer.getTokenScope(referenceDoc, { line: a.line, character: a.start });
            const bScopeInfo = this.scopeAnalyzer.getTokenScope(referenceDoc, { line: b.line, character: b.start });
            
            // Scope priority: routine (4) > procedure (3) > module (2) > global (1)
            const scopePriority = (scope: string) => {
                switch (scope) {
                    case 'routine': return 4;
                    case 'procedure': return 3;
                    case 'module': return 2;
                    case 'global': return 1;
                    default: return 0;
                }
            };
            
            const aPriority = scopePriority(aScopeInfo?.type || '');
            const bPriority = scopePriority(bScopeInfo?.type || '');
            
            // Higher priority (narrower scope) comes first
            return bPriority - aPriority;
        });

        logger.info(`📋 SCOPE-FILTER: Returning ${accessible.length} candidates (sorted by scope distance)`);
        return accessible;
    }

}
