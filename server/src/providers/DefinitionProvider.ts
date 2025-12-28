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
import { TokenHelper } from '../utils/TokenHelper';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { SymbolDefinitionResolver } from '../utils/SymbolDefinitionResolver';
import { FileDefinitionResolver } from '../utils/FileDefinitionResolver';

const logger = LoggerManager.getLogger("DefinitionProvider");
logger.setLevel("info");

/**
 * Provides goto definition functionality for Clarion files
 * Coordinates multiple specialized resolvers for different definition types
 */
export class DefinitionProvider {
    private tokenCache = TokenCache.getInstance();
    private symbolProvider = new ClarionDocumentSymbolProvider();
    private memberResolver = new ClassMemberResolver();
    private overloadResolver = new MethodOverloadResolver();
    private mapResolver = new MapProcedureResolver();
    private symbolResolver = new SymbolDefinitionResolver();
    private fileResolver = new FileDefinitionResolver();
    /**
     * Provides definition locations for a given position in a document
     * @param document The text document
     * @param position The position within the document
     * @returns A Definition (Location or Location[]) or null if no definition is found
     */
    public async provideDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Providing definition for position ${position.line}:${position.character} in ${document.uri}`);

        try {
            // Get the word at the current position
            const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
            if (!wordRange) {
                logger.info('No word found at position');
                return null;
            }

            const word = document.getText(wordRange);
            logger.info(`Found word: "${word}" at position`);
            
            // Get tokens once for reuse throughout the method
            const tokens = this.tokenCache.getTokens(document);
            
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
                const beforeDot = line.substring(0, dotBeforeIndex).trim();
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
                }
            }

            // Check if this is a method implementation line (e.g., "StringTheory.Construct PROCEDURE")
            // and navigate to the declaration in the CLASS
            const methodImplMatch = line.match(/^(\w+)\.(\w+)\s+PROCEDURE\s*\((.*?)\)/i);
            if (methodImplMatch) {
                const className = methodImplMatch[1];
                const methodName = methodImplMatch[2];
                
                logger.info(`🔍 Detected method implementation line: ${className}.${methodName}`);
                
                // Check if cursor is on the class or method name
                const classStart = line.indexOf(className);
                const classEnd = classStart + className.length;
                const methodStart = line.indexOf(methodName, classEnd);
                const methodEnd = methodStart + methodName.length;
                
                logger.info(`Cursor at ${position.character}, class range [${classStart}-${classEnd}], method range [${methodStart}-${methodEnd}]`);
                
                if ((position.character >= classStart && position.character <= classEnd) ||
                    (position.character >= methodStart && position.character <= methodEnd)) {
                    logger.info(`F12 on method implementation: ${className}.${methodName}`);
                    
                    // Count parameters from the implementation signature
                    const paramCount = this.overloadResolver.countParametersInDeclaration(line);
                    logger.info(`Method implementation has ${paramCount} parameters`);
                    
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
                    const memberToken = tokens.find(t => 
                        t.line < 5 && // MEMBER should be at top of file
                        t.value.toUpperCase() === 'MEMBER' &&
                        t.referencedFile
                    );
                    
                    if (memberToken?.referencedFile) {
                        logger.info(`File has MEMBER('${memberToken.referencedFile}'), searching parent file for MAP declaration`);
                        const memberDecl = await this.findMapDeclarationInMemberFile(
                            tokenAtPosition.label,
                            memberToken.referencedFile,
                            document,
                            line
                        );
                        if (memberDecl) {
                            return memberDecl;
                        }
                    }
                }
            }

            // Check if this is a structure field reference (either dot notation or prefix notation)
            const structureFieldDefinition = await this.findStructureFieldDefinition(word, document, position);
            if (structureFieldDefinition) {
                logger.info(`Found structure field definition for ${word} in the current document`);
                return structureFieldDefinition;
            }

            // First, check if this is a reference to a label in the current document
            // This is the highest priority - look for labels in the same scope first
            const labelDefinition = this.symbolResolver.findLabelDefinition(word, document, position, tokens);
            if (labelDefinition) {
                logger.info(`Found label definition for ${word} in the current document`);
                return labelDefinition;
            }

            // Check if we're inside a MAP block and the word is a procedure declaration
            // Navigate to the PROCEDURE implementation
            const mapProcImpl = this.mapResolver.findProcedureImplementation(word, tokens, document, position, line);
            if (mapProcImpl) {
                logger.info(`Found PROCEDURE implementation for MAP declaration: ${word}`);
                return mapProcImpl;
            }

            // ✅ Check if we're ON a declaration (method declaration in class or MAP procedure declaration)
            // If so, return null - we're already at the definition, no navigation needed
            // This check must come AFTER MAP navigation checks so MAP declarations can navigate to implementations
            // VSCode won't show an error for this case
            if (this.isOnDeclaration(line, position, word)) {
                logger.info(`F12 pressed on declaration - already at definition, returning null (no navigation)`);
                return null;
            }

            // Next, check if this is a reference to a Clarion structure (queue, window, view, etc.)
            const structureDefinition = await this.findStructureDefinition(word, document, position);
            if (structureDefinition) {
                logger.info(`Found structure definition for ${word} in the current document`);
                return structureDefinition;
            }

            // Then, check if this is a reference to a variable or other symbol
            const symbolDefinition = await this.findSymbolDefinition(word, document, position);
            if (symbolDefinition) {
                logger.info(`Found symbol definition for ${word} in the current document`);
                return symbolDefinition;
            }

            // Finally, check if this is a file reference
            // This is the lowest priority - only look for files if no local definitions are found
            if (this.fileResolver.isLikelyFileReference(word, document, position, tokens)) {
                logger.info(`No local definition found for ${word}, looking for file reference`);
                return await this.fileResolver.findFileDefinition(word, document.uri);
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
                    const classType = this.findVariableType(tokens, structureName, position.line);
                    if (classType) {
                        logger.info(`Variable ${structureName} is of type ${classType}, looking for member ${fieldName}`);
                        const result = await this.findClassMemberInType(tokens, classType, fieldName, document);
                        if (result) {
                            return result;
                        }
                    }

                    // Find the structure definition - handle complex structure names
                    const structureTokens = tokens.filter(token =>
                        token.type === TokenType.Label &&
                        token.value.toLowerCase() === structureName.toLowerCase() &&
                        token.start === 0
                    );

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
                let structuresWithPrefix = tokens.filter(token =>
                    token.type === TokenType.Structure &&
                    token.structurePrefix?.toLowerCase() === prefixPart.toLowerCase()
                );

                // If no exact match, try to find structures where the prefix is part of a complex name
                // For example, if prefixPart is "Queue:Browse:1", look for structures with prefix "Queue"
                if (structuresWithPrefix.length === 0 && prefixPart.includes(':')) {
                    const simplePrefixPart = prefixPart.split(':')[0];
                    structuresWithPrefix = tokens.filter(token =>
                        token.type === TokenType.Structure &&
                        token.structurePrefix?.toLowerCase() === simplePrefixPart.toLowerCase()
                    );
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
        const labelTokens = tokens.filter(token =>
            token.type === TokenType.Label &&
            token.value.toLowerCase() === word.toLowerCase() &&
            token.start === 0
        );

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
        const currentLine = position.line;
        logger.info(`🔍 Current line: ${currentLine}, total tokens: ${tokens.length}`);
        
        // Check if word contains a colon (prefix notation like LOC:SomeField)
        // or a dot (structure field notation like MyGroup.MyVar)
        const colonIndex = word.lastIndexOf(':');
        const dotIndex = word.lastIndexOf('.');
        let searchWord = word;
        let prefixPart = '';
        
        if (colonIndex > 0) {
            prefixPart = word.substring(0, colonIndex);
            searchWord = word.substring(colonIndex + 1);
            logger.info(`Detected prefixed variable reference: prefix="${prefixPart}", field="${searchWord}"`);
        } else if (dotIndex > 0) {
            // For dot notation, prefix is the structure name
            prefixPart = word.substring(0, dotIndex);
            searchWord = word.substring(dotIndex + 1);
            logger.info(`Detected dot notation variable reference: structure="${prefixPart}", field="${searchWord}"`);
        }
        
        // Get the line to check context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });
        
        // CRITICAL FIX: Check if this is a standalone word without prefix or structure notation
        // For goto definition, we need to handle standalone words differently than hover
        // We should NOT allow goto definition for standalone variables if they're part of a structure
        const isStandaloneWord = !line.includes(':' + searchWord) && !line.includes('.' + searchWord);
        logger.info(`Is standalone word: ${isStandaloneWord}, line: "${line}"`);
        
        const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, currentLine);
    
        if (currentScope) {
            logger.info(`Current scope: ${currentScope.value} (${currentScope.line}-${currentScope.finishesAt})`);
            
            // Check if this is a parameter in the current procedure
            const parameterDefinition = this.findParameterDefinition(searchWord, document, currentScope);
            if (parameterDefinition) {
                logger.info(`Found parameter definition for ${searchWord} in procedure ${currentScope.value}`);
                return parameterDefinition;
            }
            
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
            } else if (currentScope.subType === TokenType.Routine && currentScope.hasLocalData) {
                // For routines with DATA sections, search only the DATA section
                logger.info(`Searching routine DATA section`);
                // The routine variable search is handled below in the general search
            }
        } else {
            logger.info(`❌ NO SCOPE FOUND at line ${currentLine} - cannot check for parameters`);
        }
    
        // DEBUG: Log all tokens that match the word to see what we're getting
        const allMatchingTokens = tokens.filter(token => 
            token.value.toLowerCase() === searchWord.toLowerCase()
        );
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
                        
                        // Iterate through all scoped variables to find one that passes validation
                        for (const token of scopedVariables) {
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
        const globalLocation = await this.findGlobalDefinition(searchWord, document.uri);
        if (globalLocation) return globalLocation;
    
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

    private async findGlobalDefinition(word: string, documentUri: string): Promise<Location | null> {
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager) {
            logger.warn("❌ No SolutionManager instance available.");
            return null;
        }
    
        const documentPath = documentUri.replace("file:///", "").replace(/\//g, "\\");
        const currentProject = solutionManager.findProjectForFile(documentPath);
        if (!currentProject) {
            logger.warn(`❗ No project found for ${documentPath}`);
            return null;
        }
    
        const visited = new Set<string>();
    
        // 🔍 Step 1: Search known project source files
        for (const sourceFile of currentProject.sourceFiles) {
            const fullPath = path.join(currentProject.path, sourceFile.relativePath);
            if (!fs.existsSync(fullPath) || visited.has(fullPath)) continue;
    
            visited.add(fullPath);
            const contents = await currentProject.readFileContents(fullPath);
            if (!contents) continue;
    
            const doc = TextDocument.create(`file:///${fullPath.replace(/\\/g, "/")}`, "clarion", 1, contents);
            const tokens = this.tokenCache.getTokens(doc);
    
            const label = tokens.find(t =>
                t.start === 0 &&
                t.type === TokenType.Label &&
                t.value.toLowerCase() === word.toLowerCase()
            );
    
            if (label) {
                logger.info(`✅ Found global label: ${label.value} at line ${label.line} in ${fullPath}`);
                return Location.create(doc.uri, {
                    start: { line: label.line, character: label.start },
                    end: { line: label.line, character: label.start + label.value.length }
                });
            }
        }
    
        // 🔁 Step 2: Fallback — search all redirection paths
        logger.info(`↪️ Fallback: searching via redirection for ${word}`);
        const resolvedCandidate = await solutionManager.findFileWithExtension(`${word}.CLW`);
        if (resolvedCandidate && resolvedCandidate.path && fs.existsSync(resolvedCandidate.path) && !visited.has(resolvedCandidate.path)) {
            const contents = await fs.promises.readFile(resolvedCandidate.path, "utf-8");
            const doc = TextDocument.create(`file:///${resolvedCandidate.path.replace(/\\/g, "/")}`, "clarion", 1, contents);
            const tokens = this.tokenCache.getTokens(doc);

            const label = tokens.find(t =>
                t.start === 0 &&
                t.type === TokenType.Label &&
                t.value.toLowerCase() === word.toLowerCase()
            );

            if (label) {
                logger.info(`✅ Found global label via redirection: ${label.value} at line ${label.line} in ${resolvedCandidate.path} (source: ${resolvedCandidate.source})`);
                return Location.create(doc.uri, {
                    start: { line: label.line, character: label.start },
                    end: { line: label.line, character: label.start + label.value.length }
                });
            }
        }
    
        // 🔁 Step 3: Try the recursive include search as a last resort
        logger.info(`↪️ Last resort: trying recursive include search for ${word}`);
        return await this.findDefinitionInIncludes(word, documentPath);
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
            logger.info(`Checking parameter: "${trimmedParam}"`);
            
            // Extract parameter name (last word before = or end of parameter)
            // Format: TYPE paramName or TYPE paramName=default or *TYPE paramName or &TYPE paramName
            // Match pattern: optional pointer/reference, whitespace, type, whitespace, paramName, optional =default
            const paramMatch = trimmedParam.match(/[*&]?\s*\w+\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=.*)?$/i);
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

        // Find the current class or method context
        let currentScope = TokenHelper.getInnermostScopeAtLine(tokens, currentLine);
        if (!currentScope) {
            logger.info('No scope found - cannot determine class context');
            return null;
        }

        // If we're in a routine, we need the parent scope (the method/procedure) to get the class name
        if (currentScope.subType === TokenType.Routine) {
            logger.info(`Current scope is a routine (${currentScope.value}), looking for parent scope`);
            const parentScope = TokenHelper.getParentScopeOfRoutine(tokens, currentScope);
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
    private async findClassMemberInType(tokens: Token[], className: string, memberName: string, document: TextDocument): Promise<Location | null> {
        logger.info(`Looking for member ${memberName} in class ${className}`);

        // Find the CLASS structure definition
        const classTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.value.toUpperCase() === 'CLASS' &&
            token.line > 0
        );

        for (const classToken of classTokens) {
            // Find the label token just before this CLASS
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className.toLowerCase()
            );

            if (labelToken) {
                logger.info(`Found class definition for ${className} at line ${labelToken.line}`);
                
                // Search for the member within the class structure  
                // findFieldInStructure returns Definition (Location | Location[]), we need Location
                const result = await this.findFieldInStructure(tokens, labelToken, memberName, document, { line: labelToken.line, character: 0 });
                if (result) {
                    // If it's an array, return the first location
                    return Array.isArray(result) ? result[0] : result;
                }
            }
        }

        // If not found in current file, search in INCLUDE files
        logger.info(`Class ${className} not found in current file, searching includes`);
        return this.findClassMemberInIncludes(className, memberName, document.uri);
    }

    /**
     * Finds the type of a variable (for typed variable.member lookups)
     */
    private findVariableType(tokens: Token[], variableName: string, currentLine: number): string | null {
        logger.info(`Looking for type of variable ${variableName}`);

        // Find the variable declaration
        const varTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
                token.type === TokenType.ReferenceVariable ||
                token.type === TokenType.ImplicitVariable) &&
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
        const lineTokens = tokens.filter(t => t.line === varToken.line && t.start > varToken.start);
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
     * Searches for a class member in INCLUDE files
     */
    private findClassMemberInIncludes(className: string, memberName: string, documentUri: string): Location | null {
        logger.info(`Searching for ${className}.${memberName} in INCLUDE files`);

        // Decode the URI properly
        const filePath = decodeURIComponent(documentUri.replace('file:///', '')).replace(/\//g, '\\');
        logger.info(`Reading file: ${filePath}`);
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        // Find INCLUDE statements by searching the text
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;
            
            const includeFileName = includeMatch[1];
            logger.info(`Found INCLUDE statement: ${includeFileName}`);
            
            // Try to resolve the include file using solution-wide redirection
            let resolvedPath: string | null = null;
            
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                // Try each project's redirection parser
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        logger.info(`Resolved via project ${project.name} redirection: ${resolvedPath}`);
                        break;
                    }
                }
            }
            
            // Fallback: try relative to current file if no solution/project available
            if (!resolvedPath) {
                const currentDir = path.dirname(filePath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = relativePath;
                    logger.info(`Resolved via relative path (no solution): ${resolvedPath}`);
                }
            }
            
            // If we found the file, search it for the class
            if (resolvedPath && fs.existsSync(resolvedPath)) {
                logger.info(`Searching in include file: ${resolvedPath}`);
                
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');

                // Search for the class definition
                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    const classMatch = includeLine.match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                    if (classMatch) {
                        logger.info(`Found class ${className} at line ${j} in ${resolvedPath}`);
                        
                        // Search for the member within the class
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const memberLine = includeLines[k];
                            
                            // Check for END (end of class)
                            if (memberLine.match(/^\s*END\s*$/i) || memberLine.match(/^END\s*$/i)) {
                                logger.info('Reached END of class');
                                break;
                            }
                            
                            // Check for member definition (member name at start of line or after whitespace)
                            const memberMatch = memberLine.match(new RegExp(`^\\s*${memberName}\\s+`, 'i'));
                            if (memberMatch) {
                                logger.info(`Found member ${memberName} at line ${k}`);
                                const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                                const memberIndex = memberLine.indexOf(memberName);
                                return Location.create(fileUri, {
                                    start: { line: k, character: memberIndex },
                                    end: { line: k, character: memberIndex + memberName.length }
                                });
                            }
                        }
                        
                        // Class found but member not found
                        logger.info(`Class ${className} found but member ${memberName} not found`);
                        break;
                    }
                }
            } else {
                logger.warn(`Could not resolve INCLUDE file: ${includeFileName}`);
            }
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
        
        // Rule out method implementations (ClassName.MethodName PROCEDURE)
        const isMethodImplementation = /^\s*\w+\.\w+\s+(PROCEDURE|FUNCTION)/i.test(line);
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
     * Find MAP declaration in MEMBER parent file
     * Searches parent file for MAP block with MODULE pointing back to current file
     * @param procName Procedure name to find
     * @param memberFile Parent file from MEMBER('filename')
     * @param document Current document (implementation file)
     * @param signature Optional signature for overload matching
     */
    private async findMapDeclarationInMemberFile(
        procName: string,
        memberFile: string,
        document: TextDocument,
        signature?: string
    ): Promise<Location | null> {
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            // Resolve MEMBER file path
            const solutionManager = SolutionManager.getInstance();
            let resolvedPath: string | null = null;
            
            // Try solution-wide redirection first
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(memberFile);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        logger.info(`✅ Resolved MEMBER file via redirection: ${resolvedPath}`);
                        break;
                    }
                }
            }
            
            // Fallback to relative path
            if (!resolvedPath) {
                const currentDir = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
                const relativePath = path.join(currentDir, memberFile);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                    logger.info(`✅ Resolved MEMBER file via relative path: ${resolvedPath}`);
                }
            }
            
            if (!resolvedPath) {
                logger.info(`❌ Could not resolve MEMBER file: ${memberFile}`);
                return null;
            }
            
            // Get current filename for reverse lookup
            const currentFileName = path.basename(document.uri);
            logger.info(`Searching for MAP MODULE('${currentFileName}') in ${resolvedPath}`);
            
            // Read and tokenize parent file
            const content = fs.readFileSync(resolvedPath, 'utf8');
            const ClarionTokenizer = (await import('../ClarionTokenizer')).ClarionTokenizer;
            const tokenizer = new ClarionTokenizer(content);
            const parentTokens = tokenizer.tokenize();
            
            // Find MAP blocks
            const mapBlocks = parentTokens.filter(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === 'MAP'
            );
            
            if (mapBlocks.length === 0) {
                logger.info(`No MAP blocks found in ${memberFile}`);
                return null;
            }
            
            // Search each MAP for MODULE pointing to current file
            for (const mapBlock of mapBlocks) {
                const mapStart = mapBlock.line;
                const mapEnd = mapBlock.finishesAt;
                
                if (mapEnd === undefined) continue;
                
                // Find MODULE blocks in this MAP
                const moduleBlocks = parentTokens.filter(t =>
                    t.type === TokenType.Structure &&
                    t.value.toUpperCase() === 'MODULE' &&
                    t.line > mapStart &&
                    t.line < mapEnd
                );
                
                for (const moduleBlock of moduleBlocks) {
                    // Find MODULE token with referencedFile on same line
                    const moduleToken = parentTokens.find(t =>
                        t.line === moduleBlock.line &&
                        t.value.toUpperCase() === 'MODULE' &&
                        t.referencedFile
                    );
                    
                    // Check if this MODULE points to our current file
                    if (moduleToken?.referencedFile && 
                        path.basename(moduleToken.referencedFile).toLowerCase() === currentFileName.toLowerCase()) {
                        logger.info(`✅ Found MODULE('${moduleToken.referencedFile}') pointing to current file`);
                        
                        // Find procedure declaration in this MODULE block
                        const moduleStart = moduleBlock.line;
                        const moduleEnd = moduleBlock.finishesAt;
                        
                        if (moduleEnd === undefined) continue;
                        
                        // Look for MapProcedure tokens matching procName
                        const procedureDecls = parentTokens.filter(t =>
                            t.line > moduleStart &&
                            t.line < moduleEnd &&
                            (t.subType === TokenType.MapProcedure || t.type === TokenType.Function) &&
                            (t.label?.toLowerCase() === procName.toLowerCase() ||
                             t.value.toLowerCase() === procName.toLowerCase())
                        );
                        
                        if (procedureDecls.length === 0) {
                            logger.info(`Procedure ${procName} not found in this MODULE block`);
                            continue;
                        }
                        
                        // If only one, return it
                        if (procedureDecls.length === 1) {
                            const decl = procedureDecls[0];
                            logger.info(`✅ Found MAP declaration at line ${decl.line}`);
                            return Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                                start: { line: decl.line, character: 0 },
                                end: { line: decl.line, character: decl.value.length }
                            });
                        }
                        
                        // Multiple declarations - use overload resolution
                        if (signature) {
                            const ProcedureSignatureUtils = (await import('../utils/ProcedureSignatureUtils')).ProcedureSignatureUtils;
                            const lines = content.split('\n');
                            const implParams = ProcedureSignatureUtils.extractParameterTypes(signature);
                            
                            for (const decl of procedureDecls) {
                                const declSignature = lines[decl.line].trim();
                                const declParams = ProcedureSignatureUtils.extractParameterTypes(declSignature);
                                
                                if (ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                                    logger.info(`✅ Found matching overload at line ${decl.line}`);
                                    return Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                                        start: { line: decl.line, character: 0 },
                                        end: { line: decl.line, character: decl.value.length }
                                    });
                                }
                            }
                        }
                        
                        // Fallback to first declaration
                        const decl = procedureDecls[0];
                        logger.info(`Returning first declaration at line ${decl.line}`);
                        return Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                            start: { line: decl.line, character: 0 },
                            end: { line: decl.line, character: decl.value.length }
                        });
                    }
                }
            }
            
            logger.info(`❌ No MAP MODULE('${currentFileName}') found in ${memberFile}`);
            return null;
            
        } catch (error) {
            logger.error(`Error searching MEMBER file: ${error}`);
            return null;
        }
    }
}
