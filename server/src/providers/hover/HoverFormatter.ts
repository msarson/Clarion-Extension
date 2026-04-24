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
import { DirectiveEntry } from '../../utils/DirectiveService';

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
            `${scope.value}, line ${info.line + 1}`
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

            // Location at bottom, after code block
            markdown.push(`${fileName}:${lineNumber}`);

            // Append doc comment if present
            const docComment = DocCommentReader.read(lines, info.line);
            if (docComment) {
                markdown.push(``);
                markdown.push(DocCommentReader.toMarkdown(docComment));
            }
        } else {
            markdown.push(`line ${info.line + 1}`);
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

        const header = this.buildMethodHeader(name, info.type, memberCategory, memberType, info.className, isMethod);
        const markdown = [header, ``];

        let declSnippet: string | null = null;
        try {
            const declUri = decodeURIComponent(info.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            const declLine = declContent.split('\n')[info.line];
            if (declLine) declSnippet = declLine.trim();
        } catch {
            declSnippet = info.type.length > 50 ? info.type : `${name}  ${info.type}`;
        }

        if (declSnippet) {
            markdown.push('```clarion');
            markdown.push(declSnippet);
            markdown.push('```');
        }

        const fileName = info.file.split(/[\/\\]/).pop() || info.file;
        markdown.push(`${fileName}:${info.line + 1}`);

        return { contents: { kind: 'markdown', value: markdown.join('\n') } };
    }

    /**
     * Constructs hover for a method call (SELF.method) with both declaration and implementation
     */
    formatMethodCall(name: string, declarationInfo: ClassMemberInfo, implementationLocation: string): Hover {
        const memberCategory = declarationInfo.isInterface ? 'Interface' : 'Class';
        const header = this.buildMethodHeader(name, declarationInfo.type, memberCategory, 'Method', declarationInfo.className, true);
        const markdown = [header, ``];

        let docComment: DocComment | null = null;
        let declSnippet: string | null = null;
        let declLocationStr = '';

        try {
            const declUri = decodeURIComponent(declarationInfo.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            const declLines = declContent.split('\n');
            const declLine = declLines[declarationInfo.line];
            docComment = DocCommentReader.read(declLines, declarationInfo.line);
            if (declLine) declSnippet = declLine.trim();
            declLocationStr = `${path.basename(declUri)}:${declarationInfo.line + 1}`;
        } catch {
            const fileName = declarationInfo.file.split(/[\/\\]/).pop() || declarationInfo.file;
            declLocationStr = `${fileName}:${declarationInfo.line + 1}`;
        }

        if (declSnippet) {
            markdown.push('```clarion');
            markdown.push(declSnippet);
            markdown.push('```');
        }

        let implLocationStr = '';
        try {
            const lastColonIndex = implementationLocation.lastIndexOf(':');
            const implFilePath = implementationLocation.substring(0, lastColonIndex).replace('file:///', '');
            const implLine = parseInt(implementationLocation.substring(lastColonIndex + 1));
            const implUri = decodeURIComponent(implFilePath);
            implLocationStr = `${path.basename(implUri)}:${implLine + 1}`;
            if (!implUri.startsWith('test://')) {
                try {
                    const implLines = fs.readFileSync(implUri, 'utf-8').split('\n');
                    const implDoc = DocCommentReader.read(implLines, implLine);
                    if (implDoc) docComment = implDoc; // definition wins
                } catch { }
            }
        } catch { }

        if (declLocationStr && implLocationStr) {
            markdown.push(`${declLocationStr} → ${implLocationStr}`);
        } else if (declLocationStr) {
            markdown.push(declLocationStr);
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

        return { contents: { kind: 'markdown', value: markdown.join('\n') } };
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
        const memberCategory = ownerClassName ? 'Interface' : 'Class';
        // For 3-part (Class.Interface.Method): show "Class.Interface" as the owner
        const displayClass = ownerClassName ? `${ownerClassName}.${className}` : className;
        const header = this.buildMethodHeader(methodName, declInfo.signature, memberCategory, 'Method', displayClass, true);
        const markdown = [header, ``];

        markdown.push('```clarion');
        markdown.push(declInfo.signature.trim());
        markdown.push('```');

        const fileName = declInfo.file.split(/[\/\\]/).pop() || declInfo.file;
        markdown.push(`${fileName}:${declInfo.line + 1}`);

        let docComment: DocComment | null = null;
        try {
            const declUri = decodeURIComponent(declInfo.file.replace('file:///', ''));
            const declContent = fs.readFileSync(declUri, 'utf-8');
            docComment = DocCommentReader.read(declContent.split('\n'), declInfo.line);
        } catch { }
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

        return { contents: { kind: 'markdown', value: markdown.join('\n') } };
    }

    /**
     * Parses modifiers from a Clarion type/signature string.
     * Attributes (PRIVATE, PROTECTED, VIRTUAL, DERIVED) can appear anywhere after the parameter list.
     * The first unrecognized token after the params is treated as the return type.
     */
    private parseMethodModifiers(typeStr: string): { visibility: string; modifiers: string[]; returnType: string | null } {
        const KNOWN_NON_TYPES = new Set(['PRIVATE', 'PROTECTED', 'VIRTUAL', 'DERIVED', 'STATIC', 'PROC', 'PROCEDURE', 'FUNCTION']);
        let afterParams = typeStr;

        // Find content after the closing paren of the parameter list
        const parenOpen = typeStr.indexOf('(');
        if (parenOpen !== -1) {
            let depth = 0;
            for (let i = parenOpen; i < typeStr.length; i++) {
                if (typeStr[i] === '(') depth++;
                else if (typeStr[i] === ')') {
                    depth--;
                    if (depth === 0) { afterParams = typeStr.substring(i + 1); break; }
                }
            }
        }

        let visibility = '';
        const modifiers: string[] = [];
        let returnType: string | null = null;

        for (const part of afterParams.split(',').map(p => p.trim()).filter(p => p)) {
            const upper = part.toUpperCase();
            if (upper === 'PRIVATE' || upper === 'PROTECTED') {
                visibility = upper;
            } else if (upper === 'VIRTUAL' || upper === 'DERIVED' || upper === 'STATIC') {
                modifiers.push(upper);
            } else if (!KNOWN_NON_TYPES.has(upper) && !returnType) {
                returnType = part;
            }
        }

        return { visibility, modifiers, returnType };
    }

    /**
     * Builds the Option-C style header line for a method or property hover.
     * Format: **Name** — [Private] [Virtual] Category MemberType · ClassName  returns `TYPE`
     */
    private buildMethodHeader(name: string, typeStr: string, memberCategory: string, memberType: string, className: string, isMethod: boolean): string {
        const { visibility, modifiers, returnType } = this.parseMethodModifiers(typeStr);
        const qualifierParts: string[] = [];
        if (visibility === 'PRIVATE') qualifierParts.push('Private');
        else if (visibility === 'PROTECTED') qualifierParts.push('Protected');
        if (modifiers.includes('VIRTUAL')) qualifierParts.push('Virtual');
        if (modifiers.includes('DERIVED')) qualifierParts.push('Derived');
        const qualifiers = qualifierParts.length > 0 ? qualifierParts.join(' ') + ' ' : '';
        let header = `**${name}** — ${qualifiers}${memberCategory} ${memberType} · ${className}`;
        if (isMethod && returnType) header += `  returns \`${returnType}\``;
        return header;
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

        // Show MAP declaration signature - but NOT if we're hovering at the MAP declaration itself
        logger.info(`formatProcedure: About to check MAP declaration, mapDecl=${!!mapDecl}, isAtMapDeclaration=${isAtMapDeclaration}`);
        let declLocationStr = '';
        if (mapDecl) {
            try {
                const isSameDocument = mapDecl.uri === currentDocument.uri;
                let mapContent: string;
                let mapUri: string;

                if (isSameDocument) {
                    mapContent = currentDocument.getText();
                    mapUri = currentDocument.uri;
                } else if (mapDecl.uri.startsWith('test://')) {
                    logger.info(`formatProcedure: Skipping test:// URI MAP preview`);
                    throw new Error('Cannot read test:// URI from filesystem');
                } else {
                    mapUri = decodeURIComponent(mapDecl.uri.replace('file:///', ''));
                    mapContent = fs.readFileSync(mapUri, 'utf-8');
                }

                const mapLines = mapContent.split('\n');
                const mapLine = mapLines[mapDecl.range.start.line];
                const fileName = mapUri.includes('://')
                    ? mapUri.split('/').pop() || 'unknown'
                    : path.basename(mapUri);
                const lineNumber = mapDecl.range.start.line + 1;
                declLocationStr = `${fileName}:${lineNumber}`;

                if (mapLine && !isAtMapDeclaration) {
                    parts.push(`\`\`\`clarion\n${mapLine.trim()}\n\`\`\``);
                }
            } catch (error) {
                logger.error(`Error reading MAP declaration: ${error}`);
            }
        }

        // Build implementation location string - but NOT if we're hovering at the implementation itself
        logger.info(`formatProcedure: About to check implementation, procImpl=${!!procImpl}, isAtImplementation=${isAtImplementation}`);
        let implLocationStr = '';
        if (procImpl) {
            try {
                const implUri = procImpl.uri.startsWith('test://')
                    ? procImpl.uri
                    : decodeURIComponent(procImpl.uri.replace('file:///', ''));
                const fileName = implUri.includes('://')
                    ? implUri.split('/').pop() || 'unknown'
                    : path.basename(implUri);
                implLocationStr = `${fileName}:${procImpl.range.start.line + 1}`;
            } catch (error) {
                logger.error(`Error reading PROCEDURE implementation: ${error}`);
            }
        } else {
            logger.info(`formatProcedure: Skipping implementation (procImpl=${!!procImpl}, isAtImplementation=${isAtImplementation})`);
        }

        // Single footer line: "decl → impl" (omit whichever is at cursor or missing)
        const footerParts: string[] = [];
        if (declLocationStr && !isAtMapDeclaration) footerParts.push(declLocationStr);
        if (implLocationStr && !isAtImplementation) footerParts.push(implLocationStr);
        if (footerParts.length > 0) {
            parts.push(footerParts.join(' → '));
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
    formatBuiltin(functionName: string, signatures: any[], paramCount: number | null, firstArgType?: string): Hover {
        if (signatures.length === 0) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**Built-in Function**\n\n\`${functionName}\``
                }
            };
        }

        let matchingSignatures = signatures;

        // Narrow by first argument's structureType (e.g. FILE, VIEW, WINDOW, REPORT)
        if (firstArgType) {
            const typeNarrowed = signatures.filter(sig =>
                sig.parameters && sig.parameters.length > 0 &&
                sig.parameters[0].label.toUpperCase().startsWith(firstArgType)
            );
            if (typeNarrowed.length > 0) {
                matchingSignatures = typeNarrowed;
            }
        }

        if (paramCount !== null) {
            const countNarrowed = matchingSignatures.filter(sig => 
                sig.parameters && sig.parameters.length === paramCount
            );
            
            if (countNarrowed.length > 0) {
                matchingSignatures = countNarrowed;
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

    /** Formats hover for a compiler directive (e.g. EQUATE, INCLUDE, COMPILE). */
    public formatDirective(entry: DirectiveEntry): Hover {
        let content = `**${entry.name}**\n\n`;
        content += `_${entry.category}_\n\n`;
        if (entry.description) {
            content += `${entry.description}\n\n`;
        }
        content += `**Syntax:** \`\`\`clarion\n${entry.syntax}\n\`\`\``;
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
