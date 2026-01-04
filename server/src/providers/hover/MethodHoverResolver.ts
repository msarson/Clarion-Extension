import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { MethodOverloadResolver } from '../../utils/MethodOverloadResolver';
import { ClassMemberResolver } from '../../utils/ClassMemberResolver';
import { HoverFormatter } from './HoverFormatter';
import { ClarionPatterns } from '../../utils/ClarionPatterns';
import { SolutionManager } from '../../solution/solutionManager';
import LoggerManager from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("MethodHoverResolver");

/**
 * Resolves hover information for class methods (declarations, implementations, and calls)
 */
export class MethodHoverResolver {
    private tokenCache = TokenCache.getInstance();
    private overloadResolver: MethodOverloadResolver;
    private memberResolver: ClassMemberResolver;
    private formatter: HoverFormatter;

    constructor(
        overloadResolver: MethodOverloadResolver,
        memberResolver: ClassMemberResolver,
        formatter: HoverFormatter
    ) {
        this.overloadResolver = overloadResolver;
        this.memberResolver = memberResolver;
        this.formatter = formatter;
    }

    /**
     * Resolves hover for a method implementation line (e.g., ClassName.MethodName PROCEDURE)
     */
    async resolveMethodImplementation(
        document: TextDocument,
        position: Position,
        line: string
    ): Promise<Hover | null> {
        const methodImplMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION_STRICT);
        if (!methodImplMatch) {
            return null;
        }

        const className = methodImplMatch[1];
        const methodName = methodImplMatch[2];
        
        // Count parameters from the implementation signature
        const paramCount = ClarionPatterns.countParameters(line);
        
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

        return null;
    }

    /**
     * Resolves hover for a method declaration in a CLASS
     */
    async resolveMethodDeclaration(
        document: TextDocument,
        position: Position,
        line: string
    ): Promise<Hover | null> {
        const methodTokens = this.tokenCache.getTokens(document);
        
        logger.info(`Checking for method declaration at line ${position.line}, char ${position.character}`);
        logger.info(`Total tokens at this line: ${methodTokens.filter(t => t.line === position.line).length}`);
        
        // Look for a token that could be a method declaration
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
            logger.info(`Tokens on line ${position.line}:`);
            lineTokens.forEach(t => {
                logger.info(`  - type=${t.type}, subType=${t.subType}, value="${t.value}", start=${t.start}, label="${t.label}"`);
            });
            return null;
        }

        if (!currentToken.label) {
            return null;
        }

        logger.info(`Found method declaration: ${currentToken.label} at line ${position.line}`);
        
        // Find the class token
        const classToken = this.findClassTokenForMethodDeclaration(methodTokens, position.line);
        
        if (!classToken || !classToken.label) {
            // This might be a standalone PROCEDURE (handled by ProcedureHoverResolver)
            return null;
        }

        const className = classToken.label;
        
        // Find MODULE token on the same line as the class (after the CLASS token)
        const moduleToken = methodTokens.find(t => 
            t.line === classToken.line &&
            t.start > classToken.start &&
            t.referencedFile &&
            t.value.toUpperCase().includes('MODULE')
        );
        
        const moduleFile = moduleToken?.referencedFile;
        
        if (!moduleFile) {
            logger.info(`❌ No MODULE token found on class line ${classToken.line}`);
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

        return null;
    }

    /**
     * Resolves hover for a method call (e.g., self.MethodName())
     */
    async resolveMethodCall(
        fieldName: string,
        document: TextDocument,
        position: Position,
        line: string,
        paramCount?: number
    ): Promise<Hover | null> {
        const tokens = this.tokenCache.getTokens(document);
        const memberInfo = this.memberResolver.findClassMemberInfo(fieldName, document, position.line, tokens, paramCount);
        
        if (!memberInfo) {
            logger.info(`❌ findClassMemberInfo returned null for ${fieldName} in SELF context`);
            return null;
        }

        // Check if this is a method (not a property)
        const isMethod = memberInfo.type.toUpperCase().includes('PROCEDURE') || memberInfo.type.toUpperCase().includes('FUNCTION');
        
        if (isMethod) {
            const implLocation = await this.findMethodImplementationCrossFile(
                memberInfo.className,
                fieldName,
                document,
                paramCount,
                null
            );
            
            if (implLocation) {
                return this.formatter.formatMethodCall(fieldName, memberInfo, implLocation);
            }
        }
        
        return this.formatter.formatClassMember(fieldName, memberInfo);
    }

    /**
     * Find the CLASS token for a method declaration
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
                    return token;
                }
            }
        }
        
        return null;
    }

    /**
     * Find method implementation across all files using SolutionManager
     */
    private async findMethodImplementationCrossFile(
        className: string,
        methodName: string,
        currentDocument: TextDocument,
        paramCount?: number,
        moduleFile?: string | null
    ): Promise<string | null> {
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
        
        // Fallback: Search all solution files
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
     */
    private searchFileForImplementation(
        filePath: string,
        className: string,
        methodName: string,
        paramCount?: number
    ): number | null {
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
     * Get a preview of a method implementation
     */
    private async getMethodImplementationPreview(location: string): Promise<{ line: number; preview: string } | null> {
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
                    if (ClarionPatterns.HAS_PROCEDURE_KEYWORD.test(line)) {
                        endLine = i;
                        logger.info(`Found next procedure/routine at line ${i}, stopping before it`);
                        break;
                    }
                }
                endLine = Math.min(endLine, lines.length);
            }
            
            // If the implementation is short, show it all
            const totalLines = endLine - lineNumber;
            if (totalLines <= maxPreviewLines) {
                logger.info(`Short implementation (${totalLines} lines) - showing full preview`);
                const previewLines = lines.slice(lineNumber, endLine);
                return {
                    line: lineNumber,
                    preview: previewLines.join('\n')
                };
            } else {
                // Show first part with ellipsis
                logger.info(`Long implementation (${totalLines} lines) - showing first ${maxPreviewLines} lines`);
                const previewLines = lines.slice(lineNumber, lineNumber + maxPreviewLines);
                previewLines.push('  ! ...');
                return {
                    line: lineNumber,
                    preview: previewLines.join('\n')
                };
            }
        } catch (error) {
            logger.error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
