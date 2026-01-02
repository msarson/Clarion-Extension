import { Hover, Location } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../../ClarionTokenizer';
import { ScopeAnalyzer } from '../../utils/ScopeAnalyzer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("HoverFormatter");

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
        
        // Get scope information using ScopeAnalyzer
        let scopeInfo = '';
        let visibilityInfo = '';
        if (document) {
            const position = { line: info.line, character: 0 };
            const detailedScope = this.scopeAnalyzer.getTokenScope(document, position);
            
            if (detailedScope) {
                // Check if this is a method (procedure with ClassName.MethodName pattern)
                const procedureName = detailedScope.containingProcedure?.label || detailedScope.containingProcedure?.value;
                const isMethod = procedureName?.includes('.');
                
                const scopeIcon = detailedScope.type === 'routine' ? '🔐' : 
                                  detailedScope.type === 'procedure' ? '🔒' : 
                                  detailedScope.type === 'module' ? '📦' : '🌍';
                
                // Use "Method" instead of "Procedure" for methods
                let scopeTypeLabel = detailedScope.type.charAt(0).toUpperCase() + detailedScope.type.slice(1);
                if (detailedScope.type === 'procedure' && isMethod) {
                    scopeTypeLabel = 'Method';
                }
                
                scopeInfo = `**Scope:** ${scopeIcon} ${scopeTypeLabel}`;
                
                if (detailedScope.type === 'routine' && detailedScope.containingRoutine) {
                    const routineName = detailedScope.containingRoutine.label || detailedScope.containingRoutine.value;
                    scopeInfo += ` (${routineName})`;
                } else if (detailedScope.type === 'procedure' && detailedScope.containingProcedure) {
                    scopeInfo += ` (${procedureName})`;
                }
                
                if (detailedScope.type === 'routine') {
                    visibilityInfo = `**Visibility:** Only visible within this routine`;
                } else if (detailedScope.type === 'procedure') {
                    if (isMethod) {
                        visibilityInfo = `**Visibility:** Visible throughout this method and its routines`;
                    } else {
                        visibilityInfo = `**Visibility:** Visible throughout this procedure and its routines`;
                    }
                } else if (detailedScope.type === 'module') {
                    visibilityInfo = `**Visibility:** Visible only within this file (module-local)`;
                } else {
                    visibilityInfo = `**Visibility:** Visible everywhere (global)`;
                }
            }
        }
        
        const markdown = [
            `**${variableType}:** \`${displayName}\``,
            ``,
            `**Type:** \`${info.type}\``,
            ``
        ];
        
        if (scopeInfo) {
            markdown.push(scopeInfo);
            markdown.push(``);
        }
        
        if (visibilityInfo) {
            markdown.push(visibilityInfo);
            markdown.push(``);
        }
        
        if (document) {
            const fileName = path.basename(document.uri.replace('file:///', ''));
            const lineNumber = info.line + 1;
            markdown.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}`);
        } else {
            markdown.push(`**Declared at:** line ${info.line + 1}`);
        }
        markdown.push(``);
        markdown.push(`*Press F12 to go to declaration*`);

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
            `**Class ${memberType}:** \`${name}\``,
            ``
        ];
        
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
            const fileName = info.file.split(/[\/\\]/).pop() || info.file;
            markdown.push(``);
            markdown.push(`**Declared in:** \`${fileName}\` at line **${info.line + 1}**`);
            markdown.push(``);
            
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
     * Constructs hover for a method call (SELF.method) with both declaration and implementation
     */
    formatMethodCall(name: string, declarationInfo: ClassMemberInfo, implementationLocation: string): Hover {
        const markdown = [
            `**Class Method:** \`${name}\``,
            ``
        ];
        
        if (declarationInfo.type.length > 50) {
            markdown.push(`**Type:**`);
            markdown.push('```clarion');
            markdown.push(declarationInfo.type);
            markdown.push('```');
        } else {
            markdown.push(`**Type:** \`${declarationInfo.type}\``);
        }
        
        markdown.push(``);
        markdown.push(`**Class:** ${declarationInfo.className}`);
        markdown.push(``);
        
        // Declaration location
        const declFileName = declarationInfo.file.split(/[\/\\]/).pop() || declarationInfo.file;
        markdown.push(`**Declaration:** \`${declFileName}\` @ line **${declarationInfo.line + 1}**`);
        
        // Implementation location
        const implParts = implementationLocation.split(':');
        const implFile = implParts[0].split(/[\/\\]/).pop() || implParts[0];
        const implLine = parseInt(implParts[1]) + 1;
        markdown.push(`**Implementation:** \`${implFile}\` @ line **${implLine}**`);
        
        markdown.push(``);
        markdown.push(`*(F12 to definition | Ctrl+F12 to implementation)*`);

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
        
        // Add scope information if available
        if (procImpl || mapDecl) {
            try {
                const checkLocation = procImpl || mapDecl;
                if (checkLocation) {
                    const uri = decodeURIComponent(checkLocation.uri.replace('file:///', ''));
                    const content = fs.readFileSync(uri, 'utf-8');
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
            } catch (error) {
                // Silently fail scope detection
            }
        }
        
        parts.push(header);
        
        // Show MAP declaration - but NOT if we're hovering at the MAP declaration itself
        if (mapDecl && !isAtMapDeclaration) {
            try {
                const mapUri = decodeURIComponent(mapDecl.uri.replace('file:///', ''));
                const mapContent = fs.readFileSync(mapUri, 'utf-8');
                const mapLines = mapContent.split('\n');
                const mapLine = mapLines[mapDecl.range.start.line];
                
                if (mapLine) {
                    const trimmedMapLine = mapLine.trim();
                    const fileName = path.basename(mapUri);
                    const lineNumber = mapDecl.range.start.line + 1;
                    parts.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}:\n\`\`\`clarion\n${trimmedMapLine}\n\`\`\``);
                }
            } catch (error) {
                logger.error(`Error reading MAP declaration: ${error}`);
            }
        }
        
        // Show PROCEDURE implementation - but NOT if we're hovering at the implementation itself
        if (procImpl && !isAtImplementation) {
            try {
                const implUri = decodeURIComponent(procImpl.uri.replace('file:///', ''));
                const implContent = fs.readFileSync(implUri, 'utf-8');
                const implLines = implContent.split('\n');
                const startLine = procImpl.range.start.line;
                
                const fileName = path.basename(implUri);
                const lineNumber = startLine + 1;
                
                const maxLines = 10;
                const endLine = Math.min(startLine + maxLines, implLines.length);
                const codeLines: string[] = [];
                
                for (let i = startLine; i < endLine; i++) {
                    const line = implLines[i];
                    if (!line) continue;
                    
                    const trimmed = line.trim().toUpperCase();
                    if (i > startLine && (trimmed.startsWith('RETURN') || 
                        trimmed.match(/^\w+\s+(PROCEDURE|ROUTINE|FUNCTION)/))) {
                        break;
                    }
                    
                    codeLines.push(line);
                    
                    if (trimmed === 'CODE') {
                        if (i + 1 < endLine && implLines[i + 1]) {
                            codeLines.push(implLines[i + 1]);
                        }
                        codeLines.push('  ! ...');
                        break;
                    }
                }
                
                if (codeLines.length > 0) {
                    parts.push(`\n**Implemented in** \`${fileName}\` @ line ${lineNumber}:\n\`\`\`clarion\n${codeLines.join('\n')}\n\`\`\``);
                }
            } catch (error) {
                logger.error(`Error reading PROCEDURE implementation: ${error}`);
            }
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
