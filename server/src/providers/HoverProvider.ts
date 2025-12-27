import { Hover, Position, Range } from 'vscode-languageserver-protocol';
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

const logger = LoggerManager.getLogger("HoverProvider");
logger.setLevel("info"); // PERF: Only log errors to reduce overhead

/**
 * Provides hover information for local variables and parameters
 */
export class HoverProvider {
    private tokenCache = TokenCache.getInstance();
    private memberResolver = new ClassMemberResolver();
    private overloadResolver = new MethodOverloadResolver();
    private mapResolver = new MapProcedureResolver();

    /**
     * Provides hover information for a position in the document
     */
    public async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
        logger.info(`Providing hover for position ${position.line}:${position.character} in ${document.uri}`);

        try {
            // Get the word at the current position
            const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
            if (!wordRange) {
                logger.info('No word found at position');
                return null;
            }

            const word = document.getText(wordRange);
            logger.info(`Found word: "${word}" at position`);

            // Check if this is a method implementation line and show declaration hover
            const line = document.getText({
                start: { line: position.line, character: 0 },
                end: { line: position.line, character: Number.MAX_VALUE }
            });
            
            const methodImplMatch = line.match(/^(\w+)\.(\w+)\s+PROCEDURE\s*\((.*?)\)/i);
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
                        return this.constructMethodImplementationHover(methodName, className, declInfo);
                    }
                }
            }

            // Check if this is a MAP procedure implementation and show declaration hover
            // Skip if we're inside a MAP block (those are declarations, not implementations)
            const mapProcMatch = line.match(/^(\w+)\s+PROCEDURE\s*\(/i);
            if (mapProcMatch && !this.isInMapBlock(document, position.line)) {
                const procName = mapProcMatch[1];
                const procNameEnd = mapProcMatch.index! + procName.length;
                
                // Check if cursor is on the procedure name
                if (position.character >= mapProcMatch.index! && position.character <= procNameEnd) {
                    // Find the MAP declaration for this procedure using resolver
                    const tokens = this.tokenCache.getTokens(document);
                    const mapLocation = this.mapResolver.findMapDeclaration(procName, tokens, document);
                    if (mapLocation) {
                        // Extract the text at that location
                        const mapLine = document.getText({
                            start: mapLocation.range.start,
                            end: mapLocation.range.end
                        });
                        return {
                            contents: {
                                kind: 'markdown',
                                value: `**MAP Declaration**\n\n\`\`\`clarion\n${mapLine.trim()}\n\`\`\``
                            }
                        };
                    }
                }
            }

            // Check if this is inside a MAP block (declaration) and show implementation hover
            if (this.isInMapBlock(document, position.line)) {
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
                        logger.info(`Cursor is on procedure name, searching for implementation...`);
                        // Find the implementation
                        const implInfo = this.findProcedureImplementation(document, procName);
                        logger.info(`Implementation found: ${implInfo ? 'YES at line ' + (implInfo.line + 1) : 'NO'}`);
                        if (implInfo) {
                            return {
                                contents: {
                                    kind: 'markdown',
                                    value: `**Implementation** (line ${implInfo.line + 1})\n\n\`\`\`clarion\n${implInfo.preview}\n\`\`\``
                                }
                            };
                        }
                    } else {
                        logger.info(`Cursor NOT on procedure name (cursor at ${position.character}, name range ${procNameStart}-${procNameEnd})`);
                    }
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
                        return this.constructVariableHover(word, structureInfo, currentScope);
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
                            return this.constructClassMemberHover(fieldName, memberInfo);
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
                                    return this.constructVariableHover(fullReference, variableInfo, currentScope);
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
                logger.info('No scope found - cannot provide variable/parameter hover');
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
            const parameterInfo = this.findParameterInfo(searchWord, document, currentScope);
            if (parameterInfo) {
                logger.info(`Found parameter info for ${searchWord}`);
                return this.constructParameterHover(searchWord, parameterInfo, currentScope);
            }
            logger.info(`${searchWord} is not a parameter`);

            // Check if this is a local variable
            logger.info(`Checking if ${searchWord} is a local variable...`);
            const variableInfo = this.findLocalVariableInfo(searchWord, tokens, currentScope, document, word);
            if (variableInfo) {
                logger.info(`✅ HOVER-RETURN: Found variable info for ${searchWord}: type=${variableInfo.type}, line=${variableInfo.line}`);
                return this.constructVariableHover(word, variableInfo, currentScope);
            }
            logger.info(`❌ HOVER-RETURN: ${searchWord} is not a local variable - returning null`);

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
     * Constructs hover for a parameter
     */
    private constructParameterHover(name: string, info: { type: string; line: number }, scope: Token): Hover {
        const markdown = [
            `**Parameter:** \`${name}\``,
            ``,
            `**Type:** \`${info.type}\``,
            ``,
            `**Declared in:** ${scope.value} (line ${info.line + 1})`,
            ``,
            `*Press F12 to go to declaration*`
        ].join('\n');

        return {
            contents: {
                kind: 'markdown',
                value: markdown
            }
        };
    }

    /**
     * Constructs hover for a local variable
     */
    private constructVariableHover(name: string, info: { type: string; line: number }, scope: Token): Hover {
        const isRoutine = scope.subType === TokenType.Routine;
        const variableType = isRoutine ? 'Routine Variable' : 'Local Variable';
        
        // CRITICAL FIX: Keep the full variable name including prefix (e.g., LOC:SMTPbccAddress)
        // Don't strip the prefix - it's part of the variable's identity
        const displayName = name;
        
        const markdown = [
            `**${variableType}:** \`${displayName}\``,
            ``,
            `**Type:** \`${info.type}\``,
            ``,
            `**Scope:** ${isRoutine ? 'Routine' : 'Procedure'}`,
            ``,
            `**Declared at:** line ${info.line + 1}`,
            ``,
            `*Press F12 to go to declaration*`
        ].join('\n');

        return {
            contents: {
                kind: 'markdown',
                value: markdown
            }
        };
    }


    
    /**
     * Constructs hover for a class member
     */
    private constructClassMemberHover(name: string, info: { type: string; className: string; line: number; file: string }): Hover {
        // Determine if it's a property or method based on type
        const isMethod = info.type.toUpperCase().includes('PROCEDURE') || info.type.toUpperCase().includes('FUNCTION');
        const memberType = isMethod ? 'Method' : 'Property';
        
        const markdown = [
            `**Class ${memberType}:** \`${name}\``,
            ``
        ];
        
        // Format type - if it's long, put it on its own line with code block for wrapping
        if (info.type.length > 50) {
            markdown.push(`**Type:**`);
            markdown.push('```clarion');
            markdown.push(info.type);
            markdown.push('```');
        } else {
            markdown.push(`**Type:** \`${info.type}\``);
        }
        
        markdown.push(``);
        markdown.push(`**Class:** ${info.className}`);
        
        if (info.line >= 0) {
            // Extract just the filename from the path
            const fileName = info.file.split(/[\/\\]/).pop() || info.file;
            markdown.push(``);
            markdown.push(`**Declared in:** \`${fileName}\` at line **${info.line + 1}**`);
            markdown.push(``);
            
            // Add navigation hints - F12 for definition, Ctrl+F12 for implementation (methods only)
            if (isMethod) {
                markdown.push(`*(F12 to definition | Ctrl+F12 to implementation)*`);
            } else {
                markdown.push(`*(F12 will navigate to the definition)*`);
            }
        } else {
            markdown.push(``);
            markdown.push(`**Declared in:** ${info.file}`);
            markdown.push(``);
            
            if (isMethod) {
                markdown.push(`*(F12 to definition | Ctrl+F12 to implementation)*`);
            } else {
                markdown.push(`*Press F12 to go to definition*`);
            }
        }
        
        return {
            contents: {
                kind: 'markdown',
                value: markdown.join('\n')
            }
        };
    }

    /**
     * Constructs hover for method implementation showing declaration
     */
    private constructMethodImplementationHover(methodName: string, className: string, declInfo: { signature: string; file: string; line: number }): Hover {
        const fileName = declInfo.file.split(/[\/\\]/).pop() || declInfo.file;
        
        const markdown = [
            `**Method Implementation:** \`${className}.${methodName}\``,
            ``,
            `**Declaration:**`,
            '```clarion',
            declInfo.signature,
            '```',
            ``,
            `**Declared in:** \`${fileName}\` at line **${declInfo.line + 1}**`,
            ``,
            `*(Press F12 to go to declaration)*`
        ];

        return {
            contents: {
                kind: 'markdown',
                value: markdown.join('\n')
            }
        };
    }
        
    /**
     * Check if a line is inside a MAP block
     */
    private isInMapBlock(document: TextDocument, lineNumber: number): boolean {
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        
        let inMap = false;
        for (let i = 0; i <= lineNumber && i < lines.length; i++) {
            const trimmed = lines[i].trim();
            
            if (/^\s*MAP\s*$/i.test(trimmed)) {
                inMap = true;
            } else if (inMap && /^\s*END\s*$/i.test(trimmed)) {
                inMap = false;
            }
        }
        
        return inMap;
    }

    /**
     * Find implementation of a MAP procedure
     */
    private findProcedureImplementation(document: TextDocument, procName: string): { line: number, signature: string, preview: string } | null {
        logger.info(`🔍 findProcedureImplementation searching for: "${procName}"`);
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const tokens = this.tokenCache.getTokens(document);
        
        let inMap = false;
        let checkedLines = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Track MAP blocks to skip declarations
            if (/^\s*MAP\s*$/i.test(trimmed)) {
                inMap = true;
                logger.info(`Entering MAP block at line ${i}`);
                continue;
            }
            if (inMap && /^\s*END\s*$/i.test(trimmed)) {
                inMap = false;
                logger.info(`Exiting MAP block at line ${i}`);
                continue;
            }
            
            // Skip lines inside MAP blocks (those are declarations, not implementations)
            if (inMap) {
                continue;
            }
            
            // Match: ProcName PROCEDURE(...) at start of line (implementation)
            const implMatch = line.match(/^(\w+)\s+PROCEDURE\s*\(/i);
            if (implMatch) {
                checkedLines++;
                if (checkedLines <= 5) {
                    logger.info(`Line ${i}: Found PROCEDURE "${implMatch[1]}" (looking for "${procName}")`);
                }
            }
            if (implMatch && implMatch[1].toLowerCase() === procName.toLowerCase()) {
                logger.info(`✅ Found matching implementation at line ${i}: "${implMatch[1]}"`);
                // Found the implementation, try to find its token for finishesAt
                const procToken = tokens.find(t => 
                    (t.subType === TokenType.Procedure || t.subType === TokenType.GlobalProcedure) &&
                    t.line === i &&
                    t.value.toLowerCase() === procName.toLowerCase()
                );
                
                const previewLines: string[] = [line.trim()];
                const maxPreviewLines = 10;
                
                // Determine end line: use finishesAt if available, otherwise use heuristic
                let endLine: number;
                if (procToken && procToken.finishesAt !== undefined) {
                    // Use token's finishesAt to stop exactly at procedure end
                    endLine = Math.min(procToken.finishesAt, i + maxPreviewLines + 5); // +5 for data section
                } else {
                    // Fallback: search up to 30 lines
                    endLine = Math.min(lines.length, i + 30);
                }
                
                // Find CODE statement and grab lines after it
                let foundCode = false;
                for (let j = i + 1; j <= endLine && j < lines.length; j++) {
                    const previewLine = lines[j];
                    if (!previewLine) continue; // Safety check
                    const previewTrimmed = previewLine.trim().toUpperCase();
                    
                    if (previewTrimmed === 'CODE') {
                        foundCode = true;
                        previewLines.push(previewLine);
                        continue;
                    }
                    
                    if (foundCode) {
                        // Add lines after CODE up to maxPreviewLines or procedure end
                        if (previewLines.length - 1 < maxPreviewLines) { // -1 because first line is signature
                            previewLines.push(previewLine);
                        } else {
                            break;
                        }
                    } else {
                        // Before CODE, just add the line (could be data section, etc.)
                        previewLines.push(previewLine);
                    }
                }
                
                return {
                    line: i,
                    signature: line.trim(),
                    preview: previewLines.join('\n')
                };
            }
        }
        
        logger.info(`❌ No implementation found for "${procName}" (checked ${checkedLines} PROCEDURE declarations)`);
        return null;
    }

}
