import { Hover, Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from '../ClarionDocumentSymbolProvider';

const logger = LoggerManager.getLogger("HoverProvider");
logger.setLevel("error");

/**
 * Provides hover information for local variables and parameters
 */
export class HoverProvider {
    private tokenCache = TokenCache.getInstance();

    /**
     * Provides hover information for a position in the document
     */
    public async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
        logger.info(`Providing hover for position ${position.line}:${position.character} in ${document.uri}`);

        try {
            // Get the word at the current position
            const wordRange = this.getWordRangeAtPosition(document, position);
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
            
            const methodImplMatch = line.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
            if (methodImplMatch) {
                const className = methodImplMatch[1];
                const methodName = methodImplMatch[2];
                
                // Check if cursor is on the class or method name
                const classStart = line.indexOf(className);
                const classEnd = classStart + className.length;
                const methodStart = line.indexOf(methodName, classEnd);
                const methodEnd = methodStart + methodName.length;
                
                if ((position.character >= classStart && position.character <= classEnd) ||
                    (position.character >= methodStart && position.character <= methodEnd)) {
                    const declInfo = this.findMethodDeclarationInfo(className, methodName, document);
                    if (declInfo) {
                        return this.constructMethodImplementationHover(methodName, className, declInfo);
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
                const currentScope = this.getInnermostScopeAtLine(tokens, position.line);
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
                
                if (fieldMatch && fieldMatch[1].toLowerCase() === word.toLowerCase()) {
                    // This is a member access (hovering over the field after the dot)
                    if (beforeDot.toLowerCase() === 'self' || beforeDot.endsWith('self')) {
                        // self.member - class member
                        const tokens = this.tokenCache.getTokens(document);
                        const memberInfo = this.findClassMemberInfo(word, document, position.line, tokens);
                        if (memberInfo) {
                            return this.constructClassMemberHover(word, memberInfo);
                        }
                    } else {
                        // variable.member - structure field access (e.g., MyGroup.MyVar)
                        const structureNameMatch = beforeDot.match(/(\w+)\s*$/);
                        if (structureNameMatch) {
                            const structureName = structureNameMatch[1];
                            logger.info(`Detected structure field access: ${structureName}.${word}`);
                            
                            const tokens = this.tokenCache.getTokens(document);
                            const currentScope = this.getInnermostScopeAtLine(tokens, position.line);
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
            const currentScope = this.getInnermostScopeAtLine(tokens, position.line);

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
     * Gets the word range at a position
     * Enhanced to include colons for Clarion prefix notation (e.g., LOC:Field)
     */
    private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line + 1, character: 0 }
        });

        // Always check for prefix notation (PREFIX:Field) by looking backwards for colon
        let start = position.character;
        while (start > 0) {
            const char = line.charAt(start - 1);
            if (/[a-zA-Z0-9_:]/.test(char)) {
                start--;
            } else {
                break;
            }
        }
        
        let end = position.character;
        while (end < line.length) {
            const char = line.charAt(end);
            if (/[a-zA-Z0-9_:]/.test(char)) {
                end++;
            } else {
                break;
            }
        }
        
        if (start < end) {
            return {
                start: { line: position.line, character: start },
                end: { line: position.line, character: end }
            };
        }

        return null;
    }

    /**
     * Gets the innermost scope at a line
     * Excludes MethodDeclaration (CLASS method declarations in DATA section)
     */
    private getInnermostScopeAtLine(tokens: Token[], line: number): Token | undefined {
        const scopes = tokens.filter(token =>
            // Only consider actual procedure implementations and global procedures, not method declarations in CLASS
            (token.subType === TokenType.Procedure ||
                token.subType === TokenType.GlobalProcedure ||
                token.subType === TokenType.MethodImplementation ||
                token.subType === TokenType.Routine) &&
            token.line <= line &&
            (token.finishesAt === undefined || token.finishesAt >= line)
        );

        return scopes.length > 0 ? scopes[scopes.length - 1] : undefined;
    }

    /**
     * Finds the parent scope (procedure/method) containing a routine
     */
    private getParentScopeOfRoutine(tokens: Token[], routineScope: Token): Token | undefined {
        // Find all procedure/method scopes that contain this routine
        const parentScopes = tokens.filter(token =>
            (token.subType === TokenType.Procedure ||
                token.subType === TokenType.GlobalProcedure ||
                token.subType === TokenType.MethodImplementation ||
                token.subType === TokenType.MethodDeclaration) &&
            token.line < routineScope.line &&
            (token.finishesAt === undefined || token.finishesAt >= routineScope.line)
        );

        if (parentScopes.length === 0) {
            return undefined;
        }

        // Return the closest parent (highest line number)
        return parentScopes.reduce((a, b) => a.line > b.line ? a : b);
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
     * Finds class member information for hover
     */
    private findClassMemberInfo(memberName: string, document: TextDocument, currentLine: number, tokens: Token[]): { type: string; className: string; line: number; file: string } | null {
        logger.info(`🔍 findClassMemberInfo called for member: ${memberName}`);
        // Find the current scope to get the class name
        let currentScope = this.getInnermostScopeAtLine(tokens, currentLine);
        if (!currentScope) {
            logger.info('❌ No scope found');
            return null;
        }
        
        logger.info(`Scope: ${currentScope.value}`);

        // If we're in a routine, we need the parent scope (the method/procedure) to get the class name
        if (currentScope.subType === TokenType.Routine) {
            logger.info(`Current scope is a routine (${currentScope.value}), looking for parent scope`);
            const parentScope = this.getParentScopeOfRoutine(tokens, currentScope);
            if (parentScope) {
                currentScope = parentScope;
                logger.info(`Using parent scope: ${currentScope.value}`);
            } else {
                logger.info('No parent scope found for routine');
                return null;
            }
        }
        
        // Extract class name from method
        let className: string | null = null;
        if (currentScope.value.includes('.')) {
            className = currentScope.value.split('.')[0];
        } else {
            // Parse from the line
            const content = document.getText();
            const lines = content.split('\n');
            const scopeLine = lines[currentScope.line];
            const classMethodMatch = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
            if (classMethodMatch) {
                className = classMethodMatch[1];
            }
        }
        
        if (!className) {
            logger.info('❌ Could not determine className');
            return null;
        }
        
        logger.info(`Looking for member ${memberName} in class ${className}`);
        
        // Search in current file first
        const classTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.value.toUpperCase() === 'CLASS' &&
            token.line > 0
        );
        
        logger.info(`Found ${classTokens.length} CLASS tokens in file`);
        
        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className!.toLowerCase()
            );
            
            if (labelToken) {
                logger.info(`✅ Found class ${className} at line ${labelToken.line}`);
                // Search for member in this class
                for (let i = labelToken.line + 1; i < tokens.length; i++) {
                    const lineTokens = tokens.filter(t => t.line === i);
                    const endToken = lineTokens.find(t => t.value.toUpperCase() === 'END' && t.start === 0);
                    if (endToken) break;
                    
                    const memberToken = lineTokens.find(t => 
                        t.value.toLowerCase() === memberName.toLowerCase() && 
                        t.start === 0
                    );
                    
                    if (memberToken) {
                        logger.info(`Found member token: ${memberToken.value} at start ${memberToken.start}`);
                        logger.info(`All tokens on line ${i}: ${lineTokens.map(t => `[${t.value}:${t.start}:${t.type}]`).join(' ')}`);
                        
                        // Get the first token after the member name - this is the type
                        // It could be a simple type (LONG, BYTE), reference type (&STRING), 
                        // or complex type (class name like StringTheory)
                        const memberEnd = memberToken.start + memberToken.value.length;
                        const typeTokens = lineTokens.filter(t => t.start > memberEnd);
                        logger.info(`Type tokens after member: ${typeTokens.map(t => `[${t.value}:${t.start}:${t.type}]`).join(' ')}`);
                        const type = typeTokens.length > 0 ? typeTokens[0].value : 'Unknown';
                        logger.info(`Selected type: ${type}`);
                        return { type, className, line: i, file: document.uri };
                    }
                }
            }
        }
        
        // If not found in current file, search INCLUDE files
        logger.info(`⚠️ Class ${className} not found in current file - searching INCLUDE files`);
        return this.findClassMemberInIncludes(className, memberName, document);
    }

    /**
     * Searches for class member info in INCLUDE files
     */
    private findClassMemberInIncludes(className: string, memberName: string, document: TextDocument): { type: string; className: string; line: number; file: string } | null {
        const content = document.getText();
        const lines = content.split('\n');
        
        // Find INCLUDE statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;
            
            const includeFileName = includeMatch[1];
            logger.info(`Found INCLUDE: ${includeFileName}`);
            
            // Try to resolve the file (same logic as DefinitionProvider)
            const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
            let resolvedPath: string | null = null;
            
            // Try solution-wide redirection
            const SolutionManager = require('../solution/solutionManager').SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && require('fs').existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            
            // Fallback to relative path
            if (!resolvedPath) {
                const path = require('path');
                const currentDir = path.dirname(filePath);
                const relativePath = path.join(currentDir, includeFileName);
                if (require('fs').existsSync(relativePath)) {
                    resolvedPath = relativePath;
                }
            }
            
            if (resolvedPath) {
                logger.info(`Resolved to: ${resolvedPath}`);
                const fs = require('fs');
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');
                
                // Find the class
                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    const classMatch = includeLine.match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                    if (classMatch) {
                        logger.info(`Found class ${className} in INCLUDE at line ${j}`);
                        
                        // Find the member
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const memberLine = includeLines[k];
                            if (memberLine.match(/^\s*END\s*$/i) || memberLine.match(/^END\s*$/i)) {
                                break;
                            }
                            
                            const memberMatch = memberLine.match(new RegExp(`^\\s*(${memberName})\\s+`, 'i'));
                            if (memberMatch) {
                                logger.info(`Found member ${memberName} at line ${k}: ${memberLine}`);
                                // Extract type - everything after member name until comment or end of line
                                const afterMember = memberLine.substring(memberMatch[0].length).trim();
                                // Remove trailing comments (! or //)
                                const typeWithoutComment = afterMember.split(/\s*[!\/\/]/).shift() || afterMember;
                                const type = typeWithoutComment.trim() || 'Unknown';
                                logger.info(`Extracted type: ${type}`);
                                return { type, className, line: k, file: resolvedPath };
                            }
                        }
                    }
                }
            }
        }
        
        return { type: 'Property', className, line: -1, file: 'INCLUDE file' };
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
     * Finds method declaration info from CLASS (for hover on implementation)
     */
    private findMethodDeclarationInfo(className: string, methodName: string, document: TextDocument): { signature: string; file: string; line: number } | null {
        // Search in current file first
        const tokens = this.tokenCache.getTokens(document);
        const classTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.value.toUpperCase() === 'CLASS' &&
            token.line > 0
        );
        
        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className.toLowerCase()
            );
            
            if (labelToken) {
                // Search for method in class
                for (let i = labelToken.line + 1; i < tokens.length; i++) {
                    const lineTokens = tokens.filter(t => t.line === i);
                    const endToken = lineTokens.find(t => t.value.toUpperCase() === 'END' && t.start === 0);
                    if (endToken) break;
                    
                    const methodToken = lineTokens.find(t =>
                        t.value.toLowerCase() === methodName.toLowerCase() &&
                        t.start === 0
                    );
                    
                    if (methodToken) {
                        // Get the full line as signature
                        const content = document.getText();
                        const lines = content.split('\n');
                        const signature = lines[i].trim();
                        return { signature, file: document.uri, line: i };
                    }
                }
            }
        }
        
        // Search in INCLUDE files
        return this.findMethodDeclarationInIncludes(className, methodName, document);
    }

    /**
     * Searches INCLUDE files for method declaration
     */
    private findMethodDeclarationInIncludes(className: string, methodName: string, document: TextDocument): { signature: string; file: string; line: number } | null {
        const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
        const content = document.getText();
        const lines = content.split('\n');
        
        // Find INCLUDE statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;
            
            const includeFileName = includeMatch[1];
            let resolvedPath: string | null = null;
            
            // Try solution-wide redirection
            const SolutionManager = require('../solution/solutionManager').SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && require('fs').existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            
            // Fallback to relative path
            if (!resolvedPath) {
                const path = require('path');
                const currentDir = path.dirname(filePath);
                const relativePath = path.join(currentDir, includeFileName);
                if (require('fs').existsSync(relativePath)) {
                    resolvedPath = relativePath;
                }
            }
            
            if (resolvedPath) {
                const fs = require('fs');
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');
                
                // Find the class
                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    const classMatch = includeLine.match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                    if (classMatch) {
                        // Find the method
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const methodLine = includeLines[k];
                            if (methodLine.match(/^\s*END\s*$/i) || methodLine.match(/^END\s*$/i)) {
                                break;
                            }
                            
                            const methodMatch = methodLine.match(new RegExp(`^\\s*(${methodName})\\s+PROCEDURE`, 'i'));
                            if (methodMatch) {
                                const signature = methodLine.trim();
                                return { signature, file: resolvedPath, line: k };
                            }
                        }
                    }
                }
            }
        }
        
        return null;
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
}
