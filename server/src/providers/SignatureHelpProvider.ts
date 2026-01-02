import { SignatureHelp, SignatureInformation, ParameterInformation, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { SolutionManager } from '../solution/solutionManager';
import { DocumentStructure } from '../DocumentStructure';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import { AttributeService } from '../utils/AttributeService';
import { ControlService } from '../utils/ControlService';
import { DataTypeService } from '../utils/DataTypeService';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("SignatureHelpProvider");
logger.setLevel("error"); // DEBUG: Enable for signature help debugging

/**
 * Provides signature help (parameter hints) for method calls
 */
export class SignatureHelpProvider {
    private tokenCache = TokenCache.getInstance();
    private overloadResolver = new MethodOverloadResolver();
    private memberResolver = new ClassMemberResolver();
    private builtinService = BuiltinFunctionService.getInstance();
    private attributeService = AttributeService.getInstance();
    private controlService = ControlService.getInstance();
    private dataTypeService = DataTypeService.getInstance();

    /**
     * Provides signature help at a given position
     */
    public async provideSignatureHelp(document: TextDocument, position: Position): Promise<SignatureHelp | null> {
        logger.info(`Providing signature help for position ${position.line}:${position.character}`);

        try {
            // Get the line text up to the cursor position
            const line = document.getText({
                start: { line: position.line, character: 0 },
                end: { line: position.line, character: position.character }
            });

            logger.info(`Line up to cursor: "${line}"`);

            // Check if we're inside a method call
            const methodCallInfo = this.parseMethodCall(line);
            if (!methodCallInfo) {
                logger.info('Not inside a method call');
                return null;
            }

            const { methodName, prefix, parameterIndex, isClassMethod } = methodCallInfo;
            logger.info(`Method call detected: ${prefix ? prefix + '.' : ''}${methodName}, parameter index: ${parameterIndex}`);

            // 🚀 FAST PATH: Get cached tokens for instant signature help
            // Don't trigger re-tokenization as it blocks the UI
            const tokens = this.tokenCache.getCachedTokens(document);
            if (tokens.length === 0) {
                logger.info('No cached tokens available for signature help');
                return null;
            }

            // Get control context for attribute validation
            const docStructure = this.tokenCache.getStructure(document);
            const controlContext = docStructure.getControlContextAt(position.line, position.character);
            
            if (controlContext.controlType) {
                logger.info(`Control context: ${controlContext.controlType} in ${controlContext.structureType || 'unknown structure'}`);
            }

            // Find all overloads for this method
            let signatures: SignatureInformation[] = [];

            if (isClassMethod && prefix) {
                // This is a class method call (self.Method or variable.Method)
                signatures = await this.getClassMethodSignatures(prefix, methodName, document, position.line, tokens);
            } else {
                // Check if it's a built-in function with signatures
                const builtinSigs = this.getBuiltinSignatures(methodName);
                if (builtinSigs.length > 0) {
                    signatures = builtinSigs;
                } else {
                    // Check if it's an attribute with signatures
                    const attrSigs = this.getAttributeSignatures(methodName, controlContext);
                    if (attrSigs.length > 0) {
                        signatures = attrSigs;
                    } else {
                        // Could be a regular procedure call
                        signatures = await this.getProcedureSignatures(methodName, document, tokens, position);
                    }
                }
            }

            if (signatures.length === 0) {
                logger.info('No signatures found');
                return null;
            }

            logger.info(`Found ${signatures.length} signature(s):`);
            signatures.forEach((sig, idx) => {
                logger.info(`  [${idx}] ${sig.label}`);
            });

            // Select the best signature based on current parameter count
            const activeSignature = this.selectActiveSignature(signatures, parameterIndex);
            logger.info(`Selected signature ${activeSignature} as active`);

            return {
                signatures,
                activeSignature,
                activeParameter: parameterIndex
            };

        } catch (error) {
            logger.error(`Error providing signature help: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Parses the current line to determine if we're in a method call
     */
    private parseMethodCall(line: string): {
        methodName: string;
        prefix: string | null;
        parameterIndex: number;
        isClassMethod: boolean;
    } | null {
        // Find the last unclosed opening parenthesis
        let parenDepth = 0;
        let lastOpenParen = -1;

        for (let i = line.length - 1; i >= 0; i--) {
            const char = line[i];
            if (char === ')') {
                parenDepth++;
            } else if (char === '(') {
                if (parenDepth === 0) {
                    lastOpenParen = i;
                    break;
                }
                parenDepth--;
            }
        }

        if (lastOpenParen === -1) {
            return null; // Not inside parentheses
        }

        // Extract the method name and prefix (if any) before the opening paren
        const beforeParen = line.substring(0, lastOpenParen).trim();
        
        // Match pattern: [prefix.]methodName
        const match = beforeParen.match(/(\w+\.)?(\w+)\s*$/);
        if (!match) {
            return null;
        }

        const prefix = match[1] ? match[1].slice(0, -1) : null; // Remove trailing dot
        const methodName = match[2];
        const isClassMethod = prefix !== null;

        // Count parameters (commas at depth 0)
        const afterParen = line.substring(lastOpenParen + 1);
        const parameterIndex = this.countParameters(afterParen);

        return {
            methodName,
            prefix,
            parameterIndex,
            isClassMethod
        };
    }

    /**
     * Counts the number of parameters by counting commas at depth 0
     */
    private countParameters(text: string): number {
        if (text.trim() === '') {
            return 0; // Empty - we're at the first parameter
        }

        let depth = 0;
        let commaCount = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '(' || char === '<') {
                depth++;
            } else if (char === ')' || char === '>') {
                depth--;
            } else if (char === ',' && depth === 0) {
                commaCount++;
            }
        }

        return commaCount; // Current parameter is at this index
    }

    /**
     * Gets all signature overloads for a class method
     */
    private async getClassMethodSignatures(
        prefix: string,
        methodName: string,
        document: TextDocument,
        currentLine: number,
        tokens: Token[]
    ): Promise<SignatureInformation[]> {
        logger.info(`Getting class method signatures for ${prefix}.${methodName}`);

        // Determine the class name
        let className: string | null = null;

        if (prefix.toLowerCase() === 'self') {
            // Find current class context
            let currentScope = TokenHelper.getInnermostScopeAtLine(tokens, currentLine);
            
            // If we're in a routine, get the parent scope
            if (currentScope && currentScope.subType === TokenType.Routine) {
                logger.info(`Current scope is a routine, looking for parent scope`);
                const parentScope = TokenHelper.getParentScopeOfRoutine(tokens, currentScope);
                if (parentScope) {
                    currentScope = parentScope;
                    logger.info(`Using parent scope: ${currentScope.value}`);
                }
            }
            
            if (currentScope) {
                // Extract class name from method
                if (currentScope.value.includes('.')) {
                    className = currentScope.value.split('.')[0];
                } else {
                    // Parse from the actual line text
                    const content = document.getText();
                    const lines = content.split('\n');
                    const scopeLine = lines[currentScope.line];
                    const classMethodMatch = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
                    if (classMethodMatch) {
                        className = classMethodMatch[1];
                        logger.info(`Extracted class name from line: ${className}`);
                    }
                }
            }
        } else {
            // Try to find the variable type
            className = this.findVariableType(tokens, prefix, currentLine);
        }

        if (!className) {
            logger.info(`Could not determine class name for ${prefix}`);
            return [];
        }

        logger.info(`Resolved class name: ${className}`);

        // Find all overloads of this method in the class
        const declarations = await this.findAllMethodDeclarations(className, methodName, document, tokens);
        
        return declarations.map(decl => this.createSignatureInformation(methodName, decl.signature, decl.paramCount));
    }

    /**
     * Gets all signature overloads for a regular procedure
     */
    private async getProcedureSignatures(
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        position: Position
    ): Promise<SignatureInformation[]> {
        logger.info(`Getting procedure signatures for ${methodName}`);
        
        // ✅ CONTEXT-AWARE DETECTION: Determine context for MODULE and data types
        // Get tokens to check for label before the method name
        const lineTokens = tokens.filter(t => t.line === position.line);
        
        // Check if there's a Label token before the current word (indicates data declaration)
        const hasLabelBefore = lineTokens.some(t => 
            t.type === TokenType.Label && 
            t.start < position.character
        );
        
        // Check if we're in a MAP block
        const docStructure = this.tokenCache.getStructure(document);
        const isInMapBlock = docStructure.isInMapBlock(position.line);
        
        // Check if we're in a WINDOW/REPORT/APPLICATION structure
        const isInWindowContext = docStructure.isInWindowStructure(position.line);
        
        logger.info(`Context detection for ${methodName}: hasLabelBefore=${hasLabelBefore}, isInMapBlock=${isInMapBlock}, isInWindowContext=${isInWindowContext}`);

        // Handle MODULE keyword specially (can be keyword in MAP or attribute on CLASS)
        if (methodName.toUpperCase() === 'MODULE') {
            if (isInMapBlock) {
                // MODULE in MAP context - it's a builtin keyword
                logger.info(`MODULE in MAP context - using builtin`);
                const signatures = this.builtinService.getSignatures(methodName);
                if (signatures.length > 0) {
                    return signatures;
                }
            } else {
                // MODULE outside MAP - it's likely a CLASS attribute
                logger.info(`MODULE outside MAP - using attribute`);
                const attribute = this.attributeService.getAttribute(methodName);
                if (attribute && attribute.signatures) {
                    return attribute.signatures.map(sig => this.createAttributeSignatureInformation(methodName, sig));
                }
            }
        }
        
        // Decide priority: data type vs control/builtin based on context
        const checkDataTypeFirst = hasLabelBefore || !isInWindowContext;
        
        if (checkDataTypeFirst) {
            // Data declaration context - check data type FIRST
            if (this.dataTypeService.hasDataType(methodName)) {
                logger.info(`Found Clarion data type: ${methodName} (data context)`);
                const dataType = this.dataTypeService.getDataType(methodName);
                if (dataType) {
                    const sig = this.createDataTypeSignature(dataType);
                    return [sig];
                }
            }
        }
        
        // Check if this is a built-in function
        if (this.builtinService.isBuiltin(methodName)) {
            logger.info(`Found built-in function: ${methodName}`);
            const signatures = this.builtinService.getSignatures(methodName);
            
            // Check if this is a pure keyword (ALL signatures have 0 parameters)
            // Pure keywords like MAP, PROGRAM, CODE should not show in signature help
            const hasAnyParams = signatures.some(sig => 
                sig.parameters && sig.parameters.length > 0
            );
            
            if (hasAnyParams) {
                // This is a function with parameters - show ALL signatures including 0-param overloads
                logger.info(`Returning all ${signatures.length} signature(s) for ${methodName}`);
                return signatures;
            } else {
                logger.info(`${methodName} is a pure keyword (no parameters) - skipping signature help`);
                // Fall through to check for user-defined procedures
            }
        }
        
        // If we didn't check data type first, check it now as fallback
        if (!checkDataTypeFirst && this.dataTypeService.hasDataType(methodName)) {
            logger.info(`Found Clarion data type: ${methodName} (window context fallback)`);
            const dataType = this.dataTypeService.getDataType(methodName);
            if (dataType) {
                const sig = this.createDataTypeSignature(dataType);
                return [sig];
            }
        }
        
        // Otherwise, find procedure declarations in MAP
        const procedures = this.findProcedureInMap(methodName, tokens, document);
        
        return procedures.map(proc => this.createSignatureInformation(methodName, proc.signature, proc.paramCount));
    }

    /**
     * Finds all overload declarations for a method
     */
    private async findAllMethodDeclarations(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[]
    ): Promise<{ signature: string; paramCount: number }[]> {
        const declarations: { signature: string; paramCount: number }[] = [];

        // Search in current file
        const classTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.value.toUpperCase() === 'CLASS'
        );

        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className.toLowerCase()
            );

            if (labelToken) {
                // Get file content once
                const content = document.getText();
                const lines = content.split('\n');
                
                // Find all methods with this name by iterating through tokens
                // This is O(n) instead of O(n²) with repeated filter calls
                for (const token of tokens) {
                    // Only process tokens after the class start
                    if (token.line <= labelToken.line) continue;
                    
                    // Stop at END token at column 0
                    if (token.type === TokenType.Keyword &&
                        token.value.toUpperCase() === 'END' && 
                        token.start === 0) {
                        break;
                    }
                    
                    // Check if this is a method declaration at start of line
                    if (token.type === TokenType.Label &&
                        token.value.toLowerCase() === methodName.toLowerCase() &&
                        token.start === 0) {
                        
                        const i = token.line;
                        const signature = lines[i].trim();
                        const paramCount = this.overloadResolver.countParametersInDeclaration(signature);

                        declarations.push({ signature, paramCount });
                    }
                }
            }
        }

        // If no methods found in current file, search INCLUDE files
        if (declarations.length === 0) {
            logger.info(`No methods found in current file, searching INCLUDE files`);
            const includeDeclarations = await this.findMethodDeclarationsInIncludes(className, methodName, document);
            declarations.push(...includeDeclarations);
        }

        return declarations;
    }

    /**
     * Searches for method declarations in INCLUDE files
     */
    private async findMethodDeclarationsInIncludes(
        className: string,
        methodName: string,
        document: TextDocument
    ): Promise<{ signature: string; paramCount: number }[]> {
        const declarations: { signature: string; paramCount: number }[] = [];
        const content = document.getText();
        const lines = content.split('\n');
        
        // Find INCLUDE statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;
            
            const includeFileName = includeMatch[1];
            logger.info(`Found INCLUDE: ${includeFileName}`);
            
            // Resolve file path
            const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
            let resolvedPath: string | null = null;
            
            // Try solution-wide redirection
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        logger.info(`Resolved via solution: ${resolvedPath}`);
                        break;
                    }
                }
            }
            
            // Fallback to relative path
            if (!resolvedPath) {
                const currentDir = path.dirname(filePath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = relativePath;
                    logger.info(`Resolved via relative path: ${resolvedPath}`);
                }
            }
            
            if (resolvedPath) {
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');
                
                // Find the class
                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    const classMatch = includeLine.match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                    if (classMatch) {
                        logger.info(`Found class ${className} in INCLUDE at line ${j}`);
                        
                        // Find all methods with this name
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const methodLine = includeLines[k];
                            if (methodLine.match(/^END\s*$/i)) {
                                logger.info(`Reached END of class at line ${k}`);
                                break;
                            }
                            
                            // Check if line starts with the method name (label at column 0)
                            const methodMatch = methodLine.match(new RegExp(`^${methodName}\\s+PROCEDURE`, 'i'));
                            if (methodMatch) {
                                const signature = methodLine.trim();
                                const declParamCount = this.overloadResolver.countParametersInDeclaration(signature);
                                
                                declarations.push({
                                    signature,
                                    paramCount: declParamCount
                                });
                                
                                logger.info(`Found method in INCLUDE at line ${k} with ${declParamCount} parameters: ${signature.substring(0, 60)}`);
                            }
                        }
                        break; // Found the class, no need to search further in this file
                    }
                }
            } else {
                logger.info(`Could not resolve INCLUDE file: ${includeFileName}`);
            }
        }
        
        return declarations;
    }

    /**
     * Finds procedures in MAP structure
     */
    private findProcedureInMap(
        procName: string,
        tokens: Token[],
        document: TextDocument
    ): { signature: string; paramCount: number }[] {
        const procedures: { signature: string; paramCount: number }[] = [];
        
        // Use DocumentStructure to get MAP declarations
        const documentStructure = this.tokenCache.getStructure(document);
        const mapDeclarations = documentStructure.findMapDeclarations(procName);
        
        // Get document content for extracting signatures
        const content = document.getText();
        const lines = content.split('\n');
        
        // Extract signatures from found declarations
        for (const declToken of mapDeclarations) {
            const line = lines[declToken.line];
            if (line) {
                const signature = line.trim();
                const paramCount = this.overloadResolver.countParametersInDeclaration(signature);
                
                // Check for duplicates before adding
                const isDuplicate = procedures.some(p => 
                    p.signature === signature && p.paramCount === paramCount
                );
                
                if (!isDuplicate) {
                    procedures.push({ signature, paramCount });
                    logger.info(`Found MAP declaration: ${signature}`);
                }
            }
        }
        
        return procedures;
    }

    /**
     * Finds the type of a variable
     */
    private findVariableType(tokens: Token[], variableName: string, currentLine: number): string | null {
        // Look for variable declarations
        const varTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
             token.type === TokenType.ReferenceVariable ||
             token.type === TokenType.ImplicitVariable) &&
            token.value.toLowerCase() === variableName.toLowerCase() &&
            token.start === 0 &&
            token.line < currentLine
        );

        if (varTokens.length === 0) {
            return null;
        }

        const varToken = varTokens[varTokens.length - 1]; // Use closest declaration

        // Find the type token on the same line
        const lineTokens = tokens.filter(t => t.line === varToken.line && t.start > varToken.start);
        const typeToken = lineTokens.find(t =>
            t.type === TokenType.Type ||
            t.type === TokenType.Label || // Class names appear as labels
            /^[A-Z][A-Za-z0-9_]*$/.test(t.value) // Capitalized word (likely class name)
        );

        return typeToken ? typeToken.value : null;
    }

    /**
     * Creates a SignatureInformation object from a signature string
     */
    private createSignatureInformation(methodName: string, signature: string, paramCount: number): SignatureInformation {
        // Extract parameters from signature
        const match = signature.match(/PROCEDURE\s*\(([^)]*)\)/i);
        const parameters: ParameterInformation[] = [];

        if (match && match[1]) {
            const paramList = match[1].trim();
            if (paramList !== '') {
                // Split by comma at depth 0
                const params = this.splitParameters(paramList);
                
                for (const param of params) {
                    const trimmed = param.trim();
                    // Extract parameter name and type
                    const paramMatch = trimmed.match(/([*&<]?\s*\w+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*[=>].*)?$/i);
                    if (paramMatch) {
                        const type = paramMatch[1].trim();
                        const name = paramMatch[2];
                        parameters.push({
                            label: `${type} ${name}`,
                            documentation: undefined
                        });
                    } else {
                        // Fallback: use the whole parameter as label
                        parameters.push({
                            label: trimmed,
                            documentation: undefined
                        });
                    }
                }
            }
        }

        // Format the signature label
        const label = `${methodName}(${parameters.map(p => p.label).join(', ')})`;

        return {
            label,
            documentation: undefined,
            parameters
        };
    }

    /**
     * Creates a SignatureInformation object for a Clarion data type
     */
    private createDataTypeSignature(dataType: any): SignatureInformation {
        const parameters: ParameterInformation[] = [];
        
        // Build parameter info from data type parameters
        for (const param of dataType.parameters) {
            const optionalTag = param.optional ? ' (optional)' : '';
            parameters.push({
                label: param.name + optionalTag,
                documentation: param.description
            });
        }
        
        // Format the signature label
        const paramLabels = dataType.parameters.map((p: any) => 
            p.optional ? `[${p.name}]` : p.name
        ).join(', ');
        
        const label = dataType.parameters.length > 0 
            ? `${dataType.name}(${paramLabels})` 
            : dataType.name;
        
        return {
            label,
            documentation: `${dataType.description}\n\nSize: ${dataType.size}${dataType.range ? `\nRange: ${dataType.range}` : ''}`,
            parameters
        };
    }

    /**
     * Creates a SignatureInformation object for an attribute
     */
    private createAttributeSignatureInformation(name: string, sig: any): SignatureInformation {
        const params = sig.params.map((p: any) => {
            const paramName = typeof p === 'string' ? p : p.name;
            return ParameterInformation.create(paramName);
        });
        
        const paramStrings = sig.params.map((p: any) => {
            if (typeof p === 'string') {
                return p;
            }
            return p.optional ? `[${p.name}]` : p.name;
        });
        
        const paramString = paramStrings.length > 0 ? paramStrings.join(', ') : '';
        const label = paramString ? `${name}(${paramString})` : name;
        
        return {
            label,
            documentation: sig.description,
            parameters: params
        };
    }

    /**
     * Splits a parameter list by commas at depth 0
     */
    private splitParameters(paramList: string): string[] {
        const params: string[] = [];
        let current = '';
        let depth = 0;
        let angleDepth = 0;

        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];

            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === '<') {
                angleDepth++;
            } else if (char === '>') {
                angleDepth--;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                params.push(current);
                current = '';
                continue;
            }

            current += char;
        }

        if (current.trim() !== '') {
            params.push(current);
        }

        return params;
    }

    /**
     * Selects the active signature based on parameter count
     */
    private selectActiveSignature(signatures: SignatureInformation[], parameterIndex: number): number {
        if (signatures.length === 0) {
            return 0;
        }

        // Find signature with parameter count >= current parameter index
        for (let i = 0; i < signatures.length; i++) {
            const sig = signatures[i];
            const paramCount = sig.parameters?.length || 0;

            // If this signature can accommodate the current parameter index
            if (paramCount > parameterIndex) {
                return i;
            }
        }

        // Default to last signature (highest parameter count)
        return signatures.length - 1;
    }

    /**
     * Gets signature information for built-in functions
     */
    private getBuiltinSignatures(name: string): SignatureInformation[] {
        if (!this.builtinService.isBuiltin(name)) {
            return [];
        }

        logger.info(`Getting built-in signatures for: ${name}`);
        const signatures = this.builtinService.getSignatures(name);

        // Check if this is a pure keyword (ALL signatures have 0 parameters)
        const hasAnyParams = signatures.some(sig => 
            sig.parameters && sig.parameters.length > 0
        );

        if (!hasAnyParams) {
            logger.info(`${name} is a pure keyword - skipping signature help`);
            return [];
        }

        return signatures;
    }

    /**
     * Gets signature information for attributes
     */
    private getAttributeSignatures(
        name: string,
        context: {
            controlType: string | null;
            structureType: string | null;
            isInControlDeclaration: boolean;
        }
    ): SignatureInformation[] {
        if (!this.attributeService.isAttribute(name)) {
            return [];
        }

        logger.info(`Getting attribute signatures for: ${name}`);
        const attribute = this.attributeService.getAttribute(name);
        if (!attribute || !attribute.signatures) {
            return [];
        }

        // Check if attribute is valid for current control
        const validation = this.validateAttributeForControl(name, context.controlType);

        // Convert attribute signatures to SignatureInformation
        return attribute.signatures.map(sig => {
            // Handle both string and ParameterDefinition formats
            const params = sig.params.map(p => {
                const paramName = typeof p === 'string' ? p : p.name;
                return ParameterInformation.create(paramName);
            });
            
            // Format parameters with optional brackets
            const paramStrings = sig.params.map(p => {
                if (typeof p === 'string') {
                    return p;
                }
                return p.optional ? `[${p.name}]` : p.name;
            });
            
            const paramString = paramStrings.length > 0 ? paramStrings.join(', ') : '';
            const label = paramString ? `${name}(${paramString})` : name;
            
            let documentation = sig.description;
            
            // Add context warning if invalid
            if (!validation.isValid && context.controlType) {
                const prefix = validation.reason 
                    ? `⚠️ **${validation.reason}**\n\n`
                    : `⚠️ **Not typically used with ${context.controlType}**\n\n`;
                    
                if (validation.validControls && validation.validControls.length > 0) {
                    documentation = prefix +
                        `**Commonly used with:** ${validation.validControls.join(', ')}\n\n` +
                        `**Current context:** ${context.controlType}\n\n` +
                        documentation;
                } else {
                    documentation = prefix + documentation;
                }
            }
            // If valid, just show the normal signature description without extra text
            
            // Create SignatureInformation with MarkupContent for proper markdown rendering
            return {
                label,
                documentation: {
                    kind: 'markdown' as const,
                    value: documentation
                },
                parameters: params
            };
        });
    }

    /**
     * Validates if an attribute is appropriate for a control type
     */
    private validateAttributeForControl(
        attributeName: string,
        controlType: string | null
    ): {
        isValid: boolean;
        reason?: string;
        validControls?: string[];
    } {
        if (!controlType) {
            return { isValid: true }; // Can't validate without context
        }
        
        // Check against control's commonAttributes
        const control = this.controlService.getControl(controlType);
        if (control && control.commonAttributes) {
            const isValid = control.commonAttributes.includes(attributeName);
            
            if (!isValid) {
                // Get list of controls that DO support this attribute
                const validControls = this.getValidControlsForAttribute(attributeName);
                
                return {
                    isValid: false,
                    reason: `${attributeName} is not commonly used with ${controlType}`,
                    validControls: validControls.slice(0, 8) // Limit to first 8 for readability
                };
            }
            
            return { isValid: true };
        }
        
        // Fallback to attribute's applicableTo
        const attribute = this.attributeService.getAttribute(attributeName);
        if (attribute) {
            if (attribute.applicableTo.includes('CONTROL')) {
                return { isValid: true }; // Generic control attribute
            }
            
            // Check if it's structure-level only (WINDOW, REPORT, etc.)
            if (!attribute.applicableTo.includes('CONTROL')) {
                return {
                    isValid: false,
                    reason: `${attributeName} is only valid at structure level`,
                    validControls: []
                };
            }
        }
        
        return { isValid: true }; // Default to allow (let compiler catch errors)
    }

    /**
     * Gets list of controls that commonly use this attribute
     */
    private getValidControlsForAttribute(attributeName: string): string[] {
        const validControls: string[] = [];
        
        // Check window controls
        for (const control of this.controlService.getAllWindowControls()) {
            if (control.commonAttributes.includes(attributeName)) {
                validControls.push(control.name);
            }
        }
        
        return validControls;
    }
}
