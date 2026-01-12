import { Hover, Location } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../../ClarionTokenizer';
import { ScopeAnalyzer } from '../../utils/ScopeAnalyzer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("HoverFormatter");
logger.setLevel("error");

export interface VariableInfo {
    type: string;
    line: number;
}

export interface ParameterInfo {
    type: string;
    line: number;
}

export interface ClassMemberInfo {
    type: string;
    className: string;
    line: number;
    file: string;
}

export interface MethodDeclarationInfo {
    signature: string;
    file: string;
    line: number;
}

/**
 * Formats hover content for various Clarion symbols
 * Extracted from HoverProvider to improve maintainability
 */
export class HoverFormatter {
    constructor(private scopeAnalyzer: ScopeAnalyzer) {}

    /**
     * Constructs hover for a parameter
     */
    formatParameter(name: string, info: ParameterInfo, scope: Token): Hover {
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
    formatVariable(name: string, info: VariableInfo, scope: Token, document?: TextDocument): Hover {
        // Check if this is a routine scope
        const isRoutine = scope.subType === TokenType.Routine;
        const variableType = isRoutine ? 'Routine Variable' : 'Local Variable';
        
        const displayName = name;
        
        const markdown = [
            `**${displayName}** — \`${info.type}\``,
            ``
        ];
        
        // Determine scope for new format
        if (document) {
            const position = { line: info.line, character: 0 };
            const detailedScope = this.scopeAnalyzer.getTokenScope(document, position);
            
            if (detailedScope) {
                const scopeIcon = detailedScope.type === 'routine' ? '🔐' : 
                                  detailedScope.type === 'procedure' ? '🔧' : 
                                  detailedScope.type === 'module' ? '📦' : '🌍';
                
                // Check if this is a method
                const procedureName = detailedScope.containingProcedure?.label || detailedScope.containingProcedure?.value;
                const isMethod = procedureName?.includes('.');
                
                let scopeLabel = '';
                if (detailedScope.type === 'routine') {
                    scopeLabel = `${scopeIcon} Local routine variable`;
                } else if (detailedScope.type === 'procedure') {
                    scopeLabel = isMethod ? `${scopeIcon} Local method variable` : `${scopeIcon} Local procedure variable`;
                } else if (detailedScope.type === 'module') {
                    scopeLabel = `${scopeIcon} Module variable`;
                } else {
                    scopeLabel = `${scopeIcon} Global variable`;
                }
                
                markdown.push(scopeLabel);
            }
        }
        
        if (document) {
            const fileName = path.basename(document.uri.replace('file:///', ''));
            const lineNumber = info.line + 1;
            // Append "Declared in" to the same line as scope label if it exists
            const lastLine = markdown[markdown.length - 1];
            if (lastLine && lastLine.includes('variable')) {
                markdown[markdown.length - 1] = `${lastLine} Declared in ${fileName}:${lineNumber}`;
            } else {
                markdown.push(`Declared in ${fileName}:${lineNumber}`);
            }
            
            // Add the actual source code line
            const content = document.getText();
            const lines = content.split(/\r?\n/);
            if (info.line < lines.length) {
                const sourceLine = lines[info.line].trim();
                if (sourceLine) {
                    markdown.push(``);
                    markdown.push('```clarion');
                    markdown.push(sourceLine);
                    markdown.push('```');
                }
            }
        } else {
            markdown.push(`Declared at line ${info.line + 1}`);
        }
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
     * Constructs hover for a class member
     */
    formatClassMember(name: string, info: ClassMemberInfo): Hover {
        const isMethod = info.type.toUpperCase().includes('PROCEDURE') || info.type.toUpperCase().includes('FUNCTION');
        const memberType = isMethod ? 'Method' : 'Property';
        
        const markdown = [
            `**${name}** (Class ${memberType})`,
            ``,
            `**Class:** ${info.className}`,
            ``
        ];
        
        // Show declaration with code snippet
        try {
            const declUri = decodeURIComponent(info.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            const declLines = declContent.split('\n');
            const declLine = declLines[info.line];
            
            if (declLine) {
                const trimmedDeclLine = declLine.trim();
                const declFileName = path.basename(declUri);
                const declLineNumber = info.line + 1;
                markdown.push(`**Declaration in** \`${declFileName}\` @ line ${declLineNumber}: *(F12 to navigate)*`);
                markdown.push('```clarion');
                markdown.push(trimmedDeclLine);
                markdown.push('```');
            }
        } catch (error) {
            // Fallback if can't read file
            const fileName = info.file.split(/[\/\\]/).pop() || info.file;
            markdown.push(`**Declaration in** \`${fileName}\` @ line ${info.line + 1}: *(F12 to navigate)*`);
            
            // Show type info as fallback
            markdown.push('```clarion');
            if (info.type.length > 50) {
                markdown.push(info.type);
            } else {
                markdown.push(`${name}  ${info.type}`);
            }
            markdown.push('```');
        }

        return {
            contents: {
                kind: 'markdown',
                value: markdown.join('\n')
            }
        };
    }

    /**
     * Constructs hover for a method call (SELF.method) with both declaration and implementation
     */
    formatMethodCall(name: string, declarationInfo: ClassMemberInfo, implementationLocation: string): Hover {
        const markdown = [
            `**${name}** (Class Method)`,
            ``,
            `**Class:** ${declarationInfo.className}`,
            ``
        ];
        
        // Show declaration from CLASS
        try {
            const declUri = decodeURIComponent(declarationInfo.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            const declLines = declContent.split('\n');
            const declLine = declLines[declarationInfo.line];
            
            if (declLine) {
                const trimmedDeclLine = declLine.trim();
                const declFileName = path.basename(declUri);
                const declLineNumber = declarationInfo.line + 1;
                markdown.push(`**Declaration in** \`${declFileName}\` @ line ${declLineNumber}: *(F12 to navigate)*`);
                markdown.push('```clarion');
                markdown.push(trimmedDeclLine);
                markdown.push('```');
                markdown.push('');
                markdown.push('---'); // Horizontal separator line
                markdown.push('');
            }
        } catch (error) {
            // Fallback if can't read file
            const declFileName = declarationInfo.file.split(/[\/\\]/).pop() || declarationInfo.file;
            markdown.push(`**Declaration:** \`${declFileName}\` @ line **${declarationInfo.line + 1}**`);
            markdown.push('');
        }
        
        // Show implementation
        try {
            const lastColonIndex = implementationLocation.lastIndexOf(':');
            const implFilePath = implementationLocation.substring(0, lastColonIndex).replace('file:///', '');
            const implLine = parseInt(implementationLocation.substring(lastColonIndex + 1));
            
            const implUri = decodeURIComponent(implFilePath);
            const implContent = fs.readFileSync(implUri, 'utf-8');
            const implLines = implContent.split('\n');
            
            const implFileName = path.basename(implUri);
            const implLineNumber = implLine + 1;
            
            // Show up to 10 lines of implementation
            const maxLines = 10;
            const endLine = Math.min(implLine + maxLines, implLines.length);
            const codeLines: string[] = [];
            
            for (let i = implLine; i < endLine; i++) {
                const line = implLines[i];
                if (!line) continue;
                
                const trimmed = line.trim().toUpperCase();
                codeLines.push(implLines[i]);
                
                // Stop at CODE or first END
                if (trimmed === 'CODE' || trimmed.match(/^END\b/)) {
                    break;
                }
            }
            
            if (codeLines.length > 0) {
                markdown.push(`**Implementation in** \`${implFileName}\` @ line ${implLineNumber}: *(Ctrl+F12 to navigate)*`);
                markdown.push('```clarion');
                markdown.push(codeLines.join('\n'));
                markdown.push('```');
            }
        } catch (error) {
            // Fallback if can't read file
            const lastColonIndex = implementationLocation.lastIndexOf(':');
            const implFilePath = implementationLocation.substring(0, lastColonIndex);
            const implLine = parseInt(implementationLocation.substring(lastColonIndex + 1)) + 1;
            const implFile = implFilePath.split(/[\/\\]/).pop() || implFilePath;
            markdown.push(`**Implementation:** \`${implFile}\` @ line **${implLine}**`);
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
    formatMethodImplementation(methodName: string, className: string, declInfo: MethodDeclarationInfo): Hover {
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
     * Construct hover information for procedure calls
     * Shows both MAP declaration and PROCEDURE implementation
     */
    async formatProcedure(
        procName: string,
        mapDecl: Location | null,
        procImpl: Location | null,
        currentDocument: TextDocument,
        currentPosition?: { line: number; character: number }
    ): Promise<Hover | null> {
        logger.info(`formatProcedure: procName="${procName}", hasMapDecl=${!!mapDecl}, hasProcImpl=${!!procImpl}`);
        
        const parts: string[] = [];
        
        let header = `**${procName}** (Procedure)\n`;
        
        let isAtMapDeclaration = false;
        let isAtImplementation = false;
        
        if (currentPosition && mapDecl) {
            const mapUri = mapDecl.uri.replace(/^file:\/\/\//, '');
            const currentUri = currentDocument.uri.replace(/^file:\/\/\//, '');
            if (mapUri.toLowerCase() === currentUri.toLowerCase() && 
                mapDecl.range.start.line === currentPosition.line) {
                isAtMapDeclaration = true;
            }
        }
        
        if (currentPosition && procImpl) {
            const implUri = procImpl.uri.replace(/^file:\/\/\//, '');
            const currentUri = currentDocument.uri.replace(/^file:\/\/\//, '');
            if (implUri.toLowerCase() === currentUri.toLowerCase() && 
                procImpl.range.start.line === currentPosition.line) {
                isAtImplementation = true;
            }
        }
        
        logger.info(`formatProcedure: isAtMapDeclaration=${isAtMapDeclaration}, isAtImplementation=${isAtImplementation}`);
        
        // Add scope information if available
        if (procImpl || mapDecl) {
            try {
                // First check if MAP declaration is inside a MODULE block
                let isModuleScoped = false;
                if (mapDecl) {
                    const mapUri = decodeURIComponent(mapDecl.uri.replace('file:///', ''));
                    const mapContent = fs.readFileSync(mapUri, 'utf-8');
                    const mapLines = mapContent.split('\n');
                    const mapLine = mapDecl.range.start.line;
                    
                    // Search backwards from MAP declaration to find MODULE keyword
                    for (let i = mapLine - 1; i >= Math.max(0, mapLine - 20); i--) {
                        const line = mapLines[i].trim().toUpperCase();
                        if (line.startsWith('MODULE(') || line === 'MODULE') {
                            isModuleScoped = true;
                            break;
                        }
                        // Stop if we hit MAP or END
                        if (line === 'MAP' || line === 'END') {
                            break;
                        }
                    }
                }
                
                if (isModuleScoped) {
                    header = `**${procName}** 📦 Module Procedure\n`;
                } else {
                    // Check file type for global vs module
                    const checkLocation = procImpl || mapDecl;
                    if (checkLocation) {
                        let content: string;
                        
                        // Use current document if same URI, otherwise read from disk
                        if (checkLocation.uri === currentDocument.uri) {
                            content = currentDocument.getText();
                        } else if (checkLocation.uri.startsWith('test://')) {
                            // Skip for test URIs
                            content = '';
                        } else {
                            const uri = decodeURIComponent(checkLocation.uri.replace('file:///', ''));
                            content = fs.readFileSync(uri, 'utf-8');
                        }
                        
                        if (content) {
                            const lines = content.split('\n');
                            const firstNonCommentLine = lines.find(l => l.trim() && !l.trim().startsWith('!'));
                            
                            if (firstNonCommentLine) {
                                const trimmed = firstNonCommentLine.trim().toUpperCase();
                                if (trimmed.startsWith('PROGRAM')) {
                                    header = `**${procName}** 🌍 Global Procedure\n`;
                                } else if (trimmed.startsWith('MEMBER')) {
                                    header = `**${procName}** 📦 Module Procedure\n`;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                // Silently fail scope detection
            }
        }
        
        parts.push(header);
        
        // Show MAP declaration - but NOT if we're hovering at the MAP declaration itself
        logger.info(`formatProcedure: About to check MAP declaration, mapDecl=${!!mapDecl}, isAtMapDeclaration=${isAtMapDeclaration}`);
        if (mapDecl && !isAtMapDeclaration) {
            try {
                // Check if MAP is in current document or if we need to read from disk
                const isSameDocument = mapDecl.uri === currentDocument.uri;
                let mapContent: string;
                let mapUri: string;
                
                if (isSameDocument) {
                    // Use current document content
                    mapContent = currentDocument.getText();
                    mapUri = currentDocument.uri;
                } else if (mapDecl.uri.startsWith('test://')) {
                    // Cannot read test:// URIs from filesystem - skip
                    logger.info(`formatProcedure: Skipping test:// URI MAP preview`);
                    throw new Error('Cannot read test:// URI from filesystem');
                } else {
                    // Read from filesystem
                    mapUri = decodeURIComponent(mapDecl.uri.replace('file:///', ''));
                    mapContent = fs.readFileSync(mapUri, 'utf-8');
                }
                
                const mapLines = mapContent.split('\n');
                const mapLine = mapLines[mapDecl.range.start.line];
                
                if (mapLine) {
                    const trimmedMapLine = mapLine.trim();
                    // Extract filename from URI (handle both file:// and test:// URIs)
                    const fileName = mapUri.includes('://') 
                        ? mapUri.split('/').pop() || 'unknown'
                        : path.basename(mapUri);
                    const lineNumber = mapDecl.range.start.line + 1;
                    parts.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}:\n\`\`\`clarion\n${trimmedMapLine}\n\`\`\``);
                }
            } catch (error) {
                logger.error(`Error reading MAP declaration: ${error}`);
            }
        }
        
        // Show PROCEDURE implementation - but NOT if we're hovering at the implementation itself
        logger.info(`formatProcedure: About to check implementation, procImpl=${!!procImpl}, isAtImplementation=${isAtImplementation}`);
        if (procImpl && !isAtImplementation) {
            try {
                // Check if implementation is in current document or if we need to read from disk
                const isSameDocument = procImpl.uri === currentDocument.uri;
                let implContent: string;
                let implUri: string;
                
                if (isSameDocument) {
                    // Use current document content
                    implContent = currentDocument.getText();
                    implUri = currentDocument.uri;
                    logger.info(`formatProcedure: Using current document content`);
                } else if (procImpl.uri.startsWith('test://')) {
                    // Cannot read test:// URIs from filesystem - skip implementation preview
                    logger.info(`formatProcedure: Skipping test:// URI implementation preview`);
                    throw new Error('Cannot read test:// URI from filesystem');
                } else {
                    // Read from filesystem
                    implUri = decodeURIComponent(procImpl.uri.replace('file:///', ''));
                    logger.info(`formatProcedure: Reading implementation from ${implUri}`);
                    implContent = fs.readFileSync(implUri, 'utf-8');
                }
                
                const implLines = implContent.split('\n');
                const startLine = procImpl.range.start.line;
                
                logger.info(`formatProcedure: Implementation starts at line ${startLine}`);
                
                // Extract filename from URI (handle both file:// and test:// URIs)
                const fileName = implUri.includes('://') 
                    ? implUri.split('/').pop() || 'unknown'
                    : path.basename(implUri);
                const lineNumber = startLine + 1;
                
                const maxLines = 15;
                const endLine = Math.min(startLine + maxLines, implLines.length);
                const codeLines: string[] = [];
                
                let foundCode = false;
                let linesAfterCode = 0;
                const maxLinesAfterCode = 3;
                
                for (let i = startLine; i < endLine; i++) {
                    const line = implLines[i];
                    if (!line) continue;
                    
                    const trimmed = line.trim().toUpperCase();
                    
                    // Stop if we hit another procedure/routine
                    if (i > startLine && trimmed.match(/^\w+\s+(PROCEDURE|ROUTINE|FUNCTION)/)) {
                        break;
                    }
                    
                    codeLines.push(line);
                    
                    // Track CODE section
                    if (trimmed === 'CODE') {
                        foundCode = true;
                    } else if (foundCode) {
                        linesAfterCode++;
                        // Show a few lines after CODE, then stop with ellipsis
                        if (linesAfterCode >= maxLinesAfterCode) {
                            codeLines.push('  ! ...');
                            break;
                        }
                    }
                    
                    // Stop at RETURN
                    if (trimmed.startsWith('RETURN')) {
                        break;
                    }
                }
                
                if (codeLines.length > 0) {
                    logger.info(`formatProcedure: Adding implementation preview with ${codeLines.length} lines`);
                    parts.push(`\n**Implemented in** \`${fileName}\` @ line ${lineNumber}:\n\`\`\`clarion\n${codeLines.join('\n')}\n\`\`\``);
                } else {
                    logger.info(`formatProcedure: No code lines captured for preview`);
                }
            } catch (error) {
                logger.error(`Error reading PROCEDURE implementation: ${error}`);
            }
        } else {
            logger.info(`formatProcedure: Skipping implementation preview (procImpl=${!!procImpl}, isAtImplementation=${isAtImplementation})`);
        }
        
        // Add context-aware navigation hint
        if (mapDecl || procImpl) {
            if (isAtMapDeclaration) {
                if (procImpl) {
                    parts.push(`\n*Press Ctrl+F12 to navigate to implementation*`);
                }
            } else if (isAtImplementation) {
                if (mapDecl) {
                    parts.push(`\n*Press F12 to navigate to MAP declaration*`);
                }
            } else {
                parts.push(`\n*(F12 to MAP declaration | Ctrl+F12 to implementation)*`);
            }
        }
        
        if (parts.length > 1) {
            return {
                contents: {
                    kind: 'markdown',
                    value: parts.join('\n')
                }
            };
        }
        
        return null;
    }

    /**
     * Constructs hover information for built-in Clarion functions
     */
    formatBuiltin(functionName: string, signatures: any[], paramCount: number | null): Hover {
        if (signatures.length === 0) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**Built-in Function**\n\n\`${functionName}\``
                }
            };
        }

        let matchingSignatures = signatures;
        if (paramCount !== null) {
            matchingSignatures = signatures.filter(sig => 
                sig.parameters && sig.parameters.length === paramCount
            );
            
            if (matchingSignatures.length === 0) {
                matchingSignatures = signatures;
            }
        }

        const isKeyword = matchingSignatures.every(sig => 
            !sig.parameters || sig.parameters.length === 0
        );
        
        let content = isKeyword 
            ? `**Keyword: ${functionName}**\n\n`
            : `**Built-in Function: ${functionName}**\n\n`;
        
        if (paramCount !== null && matchingSignatures.length < signatures.length) {
            content += `_Showing signature(s) matching ${paramCount} parameter(s)_\n\n`;
        }
        
        matchingSignatures.forEach((sig, index) => {
            if (matchingSignatures.length > 1) {
                content += `**Overload ${index + 1}:**\n\n`;
            }
            
            if (sig.parameters && sig.parameters.length > 0) {
                content += `\`\`\`clarion\n${sig.label}\n\`\`\`\n\n`;
            }
            
            if (sig.documentation) {
                const docValue = typeof sig.documentation === 'string' 
                    ? sig.documentation 
                    : sig.documentation.value;
                content += `${docValue}\n\n`;
            }
            
            if (sig.parameters && sig.parameters.length > 0) {
                content += `**Parameters:**\n\n`;
                sig.parameters.forEach((param: any) => {
                    content += `- \`${param.label}\`\n`;
                });
                content += `\n`;
            }
            
            if (index < matchingSignatures.length - 1) {
                content += `---\n\n`;
            }
        });

        return {
            contents: {
                kind: 'markdown',
                value: content.trim()
            }
        };
    }

    /**
     * Constructs hover information for a Clarion attribute with parameter count matching
     */
    formatAttribute(attributeName: string, attribute: any, paramCount: number | null): Hover {
        if (!attribute) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**Attribute**\n\n\`${attributeName}\``
                }
            };
        }

        let matchingSignatures = attribute.signatures;
        if (paramCount !== null) {
            matchingSignatures = attribute.signatures.filter((sig: any) => 
                sig.params.length === paramCount
            );
            
            if (matchingSignatures.length === 0) {
                matchingSignatures = attribute.signatures;
            }
        }

        let content = `**Attribute: ${attribute.name}**\n\n`;
        
        content += `${attribute.description}\n\n`;
        
        if (paramCount !== null && matchingSignatures.length < attribute.signatures.length) {
            content += `_Showing signature(s) matching ${paramCount} parameter(s)_\n\n`;
        }
        
        content += `**Signatures:**\n\n`;
        
        matchingSignatures.forEach((sig: any, index: number) => {
            if (matchingSignatures.length > 1) {
                content += `**Overload ${index + 1}:**\n\n`;
            }
            
            if (sig.params.length === 0) {
                content += `\`\`\`clarion\n${attribute.name}\n\`\`\`\n\n`;
            } else {
                const params = sig.params.map((p: any) => {
                    if (typeof p === 'string') {
                        return p;
                    }
                    return p.optional ? `[${p.name}]` : p.name;
                }).join(', ');
                content += `\`\`\`clarion\n${attribute.name}(${params})\n\`\`\`\n\n`;
            }
            
            content += `${sig.description}\n\n`;
            
            if (sig.params.length > 0) {
                content += `**Parameters:**\n\n`;
                sig.params.forEach((param: any) => {
                    const paramName = typeof param === 'string' ? param : param.name;
                    const optionalTag = (typeof param === 'object' && param.optional) ? ' _(optional)_' : '';
                    content += `- \`${paramName}\`${optionalTag}\n`;
                });
                content += `\n`;
            }
            
            if (index < matchingSignatures.length - 1) {
                content += `---\n\n`;
            }
        });

        content += `**Applicable to:** ${attribute.applicableTo.join(', ')}\n\n`;
        content += `**Property Equate:** ${attribute.propertyEquate}`;

        return {
            contents: {
                kind: 'markdown',
                value: content.trim()
            }
        };
    }
}
