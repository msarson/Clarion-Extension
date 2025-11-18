import { Hover, Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';

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

            // Check if this is a class member access (self.member or variable.member)
            const line = document.getText({
                start: { line: position.line, character: 0 },
                end: { line: position.line, character: Number.MAX_VALUE }
            });
            
            const dotIndex = line.lastIndexOf('.', position.character - 1);
            if (dotIndex > 0) {
                const beforeDot = line.substring(0, dotIndex).trim();
                const afterDot = line.substring(dotIndex + 1).trim();
                const fieldMatch = afterDot.match(/^(\w+)/);
                
                if (fieldMatch && fieldMatch[1].toLowerCase() === word.toLowerCase()) {
                    // This is a member access
                    if (beforeDot.toLowerCase() === 'self' || beforeDot.endsWith('self')) {
                        // self.member - class member
                        const tokens = this.tokenCache.getTokens(document);
                        const memberInfo = this.findClassMemberInfo(word, document, position.line, tokens);
                        if (memberInfo) {
                            return this.constructClassMemberHover(word, memberInfo);
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

            // Check if this is a parameter
            const parameterInfo = this.findParameterInfo(word, document, currentScope);
            if (parameterInfo) {
                return this.constructParameterHover(word, parameterInfo, currentScope);
            }

            // Check if this is a local variable
            const variableInfo = this.findLocalVariableInfo(word, tokens, currentScope);
            if (variableInfo) {
                return this.constructVariableHover(word, variableInfo);
            }

            return null;
        } catch (error) {
            logger.error(`Error providing hover: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Gets the word range at a position
     */
    private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line + 1, character: 0 }
        });

        const wordPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
        let match: RegExpExecArray | null;

        while ((match = wordPattern.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            if (position.character >= start && position.character <= end) {
                return {
                    start: { line: position.line, character: start },
                    end: { line: position.line, character: end }
                };
            }
        }

        return null;
    }

    /**
     * Gets the innermost scope at a line
     */
    private getInnermostScopeAtLine(tokens: Token[], line: number): Token | undefined {
        const scopes = tokens.filter(token =>
            (token.subType === TokenType.Procedure ||
                token.subType === TokenType.GlobalProcedure ||
                token.subType === TokenType.MethodImplementation ||
                token.subType === TokenType.MethodDeclaration ||
                token.subType === TokenType.Routine) &&
            token.line <= line &&
            (token.finishesAt === undefined || token.finishesAt >= line)
        );

        return scopes.length > 0 ? scopes[scopes.length - 1] : undefined;
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
     * Finds local variable information
     */
    private findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token): { type: string; line: number } | null {
        // Find variable tokens at column 0 within the current scope
        const variableTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
                token.type === TokenType.ReferenceVariable ||
                token.type === TokenType.ImplicitVariable) &&
            token.value.toLowerCase() === word.toLowerCase() &&
            token.start === 0 &&
            token.line >= currentScope.line &&
            (currentScope.finishesAt === undefined || token.line <= currentScope.finishesAt)
        );

        if (variableTokens.length === 0) {
            return null;
        }

        const varToken = variableTokens[0];
        
        // Try to find the type declaration on the same line
        const lineTokens = tokens.filter(t => t.line === varToken.line);
        const typeTokens = lineTokens.filter(t => 
            t.type === TokenType.Type || 
            t.type === TokenType.Structure ||
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
    private constructVariableHover(name: string, info: { type: string; line: number }): Hover {
        const markdown = [
            `**Local Variable:** \`${name}\``,
            ``,
            `**Type:** \`${info.type}\``,
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
        const currentScope = this.getInnermostScopeAtLine(tokens, currentLine);
        if (!currentScope) {
            logger.info('❌ No scope found');
            return null;
        }
        
        logger.info(`Scope: ${currentScope.value}`);
        
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
            markdown.push(`*(F12 will navigate to the definition)*`);
        } else {
            markdown.push(``);
            markdown.push(`**Declared in:** ${info.file}`);
            markdown.push(``);
            markdown.push(`*Press F12 to go to definition*`);
        }
        
        return {
            contents: {
                kind: 'markdown',
                value: markdown.join('\n')
            }
        };
    }
}
