import { SignatureHelp, SignatureInformation, ParameterInformation, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { SolutionManager } from '../solution/solutionManager';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("SignatureHelpProvider");
logger.setLevel("info"); // DEBUG: Enable for signature help debugging

/**
 * Provides signature help (parameter hints) for method calls
 */
export class SignatureHelpProvider {
    private tokenCache = TokenCache.getInstance();
    private overloadResolver = new MethodOverloadResolver();
    private memberResolver = new ClassMemberResolver();

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

            // Get tokens for class resolution
            const tokens = this.tokenCache.getTokens(document);

            // Find all overloads for this method
            let signatures: SignatureInformation[] = [];

            if (isClassMethod && prefix) {
                // This is a class method call (self.Method or variable.Method)
                signatures = await this.getClassMethodSignatures(prefix, methodName, document, position.line, tokens);
            } else {
                // Could be a regular procedure call
                signatures = await this.getProcedureSignatures(methodName, document, tokens);
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
        tokens: Token[]
    ): Promise<SignatureInformation[]> {
        logger.info(`Getting procedure signatures for ${methodName}`);
        
        // Find procedure declarations in MAP
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
                // Find all methods with this name
                for (let i = labelToken.line + 1; i < tokens.length; i++) {
                    const lineTokens = tokens.filter(t => t.line === i);
                    const endToken = lineTokens.find(t => t.value.toUpperCase() === 'END' && t.start === 0);
                    if (endToken) break;

                    const methodToken = lineTokens.find(t =>
                        t.value.toLowerCase() === methodName.toLowerCase() &&
                        t.start === 0
                    );

                    if (methodToken) {
                        const content = document.getText();
                        const lines = content.split('\n');
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
        
        // Find MAP structures
        const mapTokens = tokens.filter(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === 'MAP'
        );

        for (const mapToken of mapTokens) {
            // Search within MAP for procedure declarations
            for (let i = mapToken.line + 1; i < tokens.length; i++) {
                const lineTokens = tokens.filter(t => t.line === i);
                const endToken = lineTokens.find(t => t.value.toUpperCase() === 'END' && t.start === 0);
                if (endToken) break;

                // Check if this line has our procedure name
                const content = document.getText();
                const lines = content.split('\n');
                const line = lines[i];

                // Match procedure name (indented or with PROCEDURE keyword)
                const procMatch = line.match(new RegExp(`^\\s*${procName}\\s*\\(`, 'i')) ||
                                line.match(new RegExp(`^${procName}\\s+PROCEDURE\\s*\\(`, 'i'));

                if (procMatch) {
                    const signature = line.trim();
                    const paramCount = this.overloadResolver.countParametersInDeclaration(signature);
                    procedures.push({ signature, paramCount });
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
}
