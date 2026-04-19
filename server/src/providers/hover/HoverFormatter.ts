import { Hover, Location } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../../ClarionTokenizer';
import { ScopeAnalyzer } from '../../utils/ScopeAnalyzer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../../logger';
import { DocCommentReader, DocComment } from '../../utils/DocCommentReader';
import { PropEntry } from '../../utils/PropertyService';
import { EventEntry } from '../../utils/EventService';

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
    isInterface?: boolean;
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
    formatVariable(name: string, info: VariableInfo, scope: Token, document?: TextDocument, hoverLine?: number): Hover {
        const displayName = name;
        
        const markdown = [
            `**${displayName}** — \`${info.type}\``,
            ``
        ];

        // Derive a contextual noun from the type (CLASS, GROUP, QUEUE, FILE, etc.)
        const typeNoun = this.getTypeNoun(info.type);
        
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
                    scopeLabel = `${scopeIcon} Local routine ${typeNoun}`;
                } else if (detailedScope.type === 'procedure') {
                    scopeLabel = isMethod ? `${scopeIcon} Local method ${typeNoun}` : `${scopeIcon} Local procedure ${typeNoun}`;
                } else if (detailedScope.type === 'module') {
                    scopeLabel = `${scopeIcon} Module ${typeNoun}`;
                } else {
                    scopeLabel = `${scopeIcon} Global ${typeNoun}`;
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

            // Append doc comment if present
            const docComment = DocCommentReader.read(lines, info.line);
            if (docComment) {
                markdown.push(``);
                markdown.push(DocCommentReader.toMarkdown(docComment));
            }
        } else {
            markdown.push(`Declared at line ${info.line + 1}`);
        }
        markdown.push(``);
        if (hoverLine === undefined || hoverLine !== info.line) {
            markdown.push(`F12 → Go to declaration`);
        }

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
        const memberCategory = info.isInterface ? 'Interface' : 'Class';

        // Extract visibility modifier from type string (e.g. ",PRIVATE" or ",PROTECTED")
        let visibility = info.isInterface ? '' : 'PUBLIC ';
        let visibilityIcon = '';
        if (!info.isInterface) {
            if (/,\s*PRIVATE\b/i.test(info.type)) {
                visibility = 'PRIVATE ';
                visibilityIcon = '🔒 ';
            } else if (/,\s*PROTECTED\b/i.test(info.type)) {
                visibility = 'PROTECTED ';
                visibilityIcon = '🔐 ';
            }
        }

        const markdown = [
            `**${visibilityIcon}${name}** (${visibility}${memberCategory} ${memberType})`,
            ``,
            `**${memberCategory}:** ${info.className}`,
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
        const memberCategory = declarationInfo.isInterface ? 'Interface' : 'Class';
        const markdown = [
            `**${name}** (${memberCategory} Method)`,
            ``,
            `**${memberCategory}:** ${declarationInfo.className}`,
            ``
        ];

        let docComment: DocComment | null = null;

        // Show declaration from CLASS
        try {
            const declUri = decodeURIComponent(declarationInfo.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            const declLines = declContent.split('\n');
            const declLine = declLines[declarationInfo.line];

            docComment = DocCommentReader.read(declLines, declarationInfo.line);

            if (declLine) {
                const trimmedDeclLine = declLine.trim();
                const declFileName = path.basename(declUri);
                const declLineNumber = declarationInfo.line + 1;
                markdown.push(`**Declaration in** \`${declFileName}\` @ line ${declLineNumber}: *(F12 to navigate)*`);
                markdown.push('```clarion');
                markdown.push(trimmedDeclLine);
                markdown.push('```');
                markdown.push('');
                markdown.push('---');
                markdown.push('');
            }
        } catch (error) {
            // Fallback if can't read file
            const declFileName = declarationInfo.file.split(/[\/\\]/).pop() || declarationInfo.file;
            markdown.push(`**Declaration:** \`${declFileName}\` @ line **${declarationInfo.line + 1}**`);
            markdown.push('');
        }

        // Show implementation location with signature snippet
        try {
            const lastColonIndex = implementationLocation.lastIndexOf(':');
            const implFilePath = implementationLocation.substring(0, lastColonIndex).replace('file:///', '');
            const implLine = parseInt(implementationLocation.substring(lastColonIndex + 1));
            const implUri = decodeURIComponent(implFilePath);
            const implFileName = path.basename(implUri);
            const implLineNumber = implLine + 1;
            markdown.push(`**Implemented in** \`${implFileName}\` @ line ${implLineNumber}: *(Ctrl+F12 to navigate)*`);
            if (!implUri.startsWith('test://')) {
                try {
                    const implContent = fs.readFileSync(implUri, 'utf-8');
                    const implLines = implContent.split('\n');
                    const implSignature = implLines[implLine]?.trim();
                    if (implSignature) {
                        markdown.push('```clarion');
                        markdown.push(implSignature);
                        markdown.push('```');
                    }
                    // Definition wins: impl !!! comment overrides declaration comment
                    const implDoc = DocCommentReader.read(implLines, implLine);
                    if (implDoc) docComment = implDoc;
                } catch {
                    // File not readable — skip snippet and impl doc
                }
            }
            markdown.push(``);
            markdown.push(`*Ctrl+F12 to navigate*`);
        } catch (error) {
            const lastColonIndex = implementationLocation.lastIndexOf(':');
            const implFilePath = implementationLocation.substring(0, lastColonIndex);
            const implLine = parseInt(implementationLocation.substring(lastColonIndex + 1)) + 1;
            const implFile = implFilePath.split(/[\/\\]/).pop() || implFilePath;
            markdown.push(`**Implementation:** \`${implFile}\` @ line **${implLine}**`);
        }

        if (docComment) {
            const docMarkdown = DocCommentReader.toMarkdown(docComment);
            if (docMarkdown) {
                markdown.push('');
                markdown.push('---');
                markdown.push('');
                markdown.push(docMarkdown);
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
    formatMethodImplementation(
        methodName: string,
        className: string,
        declInfo: MethodDeclarationInfo,
        ownerClassName?: string,
        implLocation?: { lines: string[], line: number }
    ): Hover {
        const fileName = declInfo.file.split(/[\/\\]/).pop() || declInfo.file;

        // className may be the interface name (3-part) or class name (2-part)
        const isInterface = !!ownerClassName;
        const title = ownerClassName
            ? `**${ownerClassName}.${className}.${methodName}** — Method Implementation`
            : `**${className}.${methodName}** — Method Implementation`;

        const markdown = [title, ``];

        if (isInterface) {
            markdown.push(`🔷 Class: \`${ownerClassName}\``);
            markdown.push(`🔌 Interface: \`${className}\``);
        } else {
            markdown.push(`🔷 Class: \`${className}\``);
        }

        markdown.push(``);
        markdown.push(`**Declaration:** \`${fileName}\`:${declInfo.line + 1}`);
        markdown.push(``);
        markdown.push('```clarion');
        markdown.push(declInfo.signature);
        markdown.push('```');
        markdown.push(``);
        markdown.push(`*F12 to go to declaration*`);

        // Doc comment: try declaration file, then let implementation override (definition wins)
        let docComment: DocComment | null = null;
        try {
            const declUri = decodeURIComponent(declInfo.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            docComment = DocCommentReader.read(declContent.split('\n'), declInfo.line);
        } catch {
            // Declaration file not readable
        }
        if (implLocation) {
            const implDoc = DocCommentReader.read(implLocation.lines, implLocation.line);
            if (implDoc) docComment = implDoc; // definition wins
        }

        if (docComment) {
            const docMarkdown = DocCommentReader.toMarkdown(docComment);
            if (docMarkdown) {
                markdown.push('');
                markdown.push('---');
                markdown.push('');
                markdown.push(docMarkdown);
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
     * Extracts doc comment for a procedure from its MAP declaration and/or implementation.
     * Implementation !!! comment takes precedence over declaration (definition wins).
     */
    private extractProcedureDocComment(
        procName: string,
        mapDecl: Location | null,
        procImpl: Location | null,
        currentDocument: TextDocument
    ): DocComment | null {
        let docComment: DocComment | null = null;

        // Try MAP declaration first
        if (mapDecl) {
            try {
                let mapContent: string;
                if (mapDecl.uri === currentDocument.uri) {
                    mapContent = currentDocument.getText();
                } else if (!mapDecl.uri.startsWith('test://')) {
                    const mapUri = decodeURIComponent(mapDecl.uri.replace('file:///', ''));
                    mapContent = fs.readFileSync(mapUri, 'utf-8');
                } else {
                    mapContent = '';
                }
                if (mapContent) {
                    docComment = DocCommentReader.read(mapContent.split('\n'), mapDecl.range.start.line);
                }
            } catch {
                // Silently skip
            }
        }

        // Try implementation — overrides MAP declaration if found (definition wins)
        if (procImpl) {
            try {
                let implContent: string;
                if (procImpl.uri === currentDocument.uri) {
                    implContent = currentDocument.getText();
                } else if (!procImpl.uri.startsWith('test://')) {
                    const implUri = decodeURIComponent(procImpl.uri.replace('file:///', ''));
                    implContent = fs.readFileSync(implUri, 'utf-8');
                } else {
                    implContent = '';
                }
                if (implContent) {
                    const implDoc = DocCommentReader.read(implContent.split('\n'), procImpl.range.start.line);
                    if (implDoc) docComment = implDoc;
                }
            } catch {
                // Silently skip
            }
        }

        return docComment;
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

        // Extract doc comment: try impl first (definition wins), fall back to MAP declaration
        const procDocComment = this.extractProcedureDocComment(
            procName, mapDecl, procImpl, currentDocument
        );
        if (procDocComment) {
            const docMarkdown = DocCommentReader.toMarkdown(procDocComment);
            if (docMarkdown) {
                parts.push(docMarkdown + '\n');
            }
        }

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
                let implUri: string;
                if (procImpl.uri.startsWith('test://')) {
                    implUri = procImpl.uri;
                } else {
                    implUri = decodeURIComponent(procImpl.uri.replace('file:///', ''));
                }
                const fileName = implUri.includes('://')
                    ? implUri.split('/').pop() || 'unknown'
                    : path.basename(implUri);
                const lineNumber = procImpl.range.start.line + 1;
                parts.push(`**Implemented in** \`${fileName}\` @ line ${lineNumber}`);
            } catch (error) {
                logger.error(`Error reading PROCEDURE implementation: ${error}`);
            }
        } else {
            logger.info(`formatProcedure: Skipping implementation (procImpl=${!!procImpl}, isAtImplementation=${isAtImplementation})`);
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

    /** Formats hover for a PROP: runtime property equate. */
    public formatPropEquate(entry: PropEntry): Hover {
        const isPropPrint = entry.name.toUpperCase().startsWith('PROPPRINT:');
        let content = `**${entry.name}**\n\n`;
        if (isPropPrint) {
            content += entry.readOnly ? `_Read-only printer control property_\n\n` : `_Printer control property_\n\n`;
        } else {
            content += entry.readOnly ? `_Read-only runtime property_\n\n` : `_Runtime property_\n\n`;
        }
        if (entry.description) {
            content += `${entry.description}\n\n`;
        }
        const usageExample = isPropPrint
            ? `PRINTER{${entry.name}}`
            : `?Control{${entry.name}}`;
        content += `**Usage:** \`${usageExample}\``;
        return {
            contents: { kind: 'markdown', value: content.trim() }
        };
    }

    /** Formats hover for an EVENT: equate (e.g. EVENT:Accepted, EVENT:CloseWindow). */
    public formatEventEquate(entry: EventEntry): Hover {
        let content = `**${entry.name}**\n\n`;
        content += `_${entry.category} Event_\n\n`;
        if (entry.description) {
            content += `${entry.description}\n\n`;
        }
        content += `**Usage:** \`OF EVENT:${entry.name.slice('EVENT:'.length)}\``;
        return {
            contents: { kind: 'markdown', value: content.trim() }
        };
    }

    /** Returns a display noun for the declaration type (e.g. CLASS → "class", GROUP → "group"). */
    private getTypeNoun(type: string): string {
        const upper = type.trimStart().toUpperCase();
        if (upper.startsWith('CLASS'))     return 'class';
        if (upper.startsWith('GROUP'))     return 'group';
        if (upper.startsWith('QUEUE'))     return 'queue';
        if (upper.startsWith('FILE'))      return 'file';
        if (upper.startsWith('VIEW'))      return 'view';
        if (upper.startsWith('REPORT'))    return 'report';
        if (upper.startsWith('WINDOW'))    return 'window';
        if (upper.startsWith('MENU'))      return 'menu';
        if (upper.startsWith('TOOLBAR'))   return 'toolbar';
        if (upper.startsWith('INTERFACE')) return 'interface';
        return 'variable';
    }
}
