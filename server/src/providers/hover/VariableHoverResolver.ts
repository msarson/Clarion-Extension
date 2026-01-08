import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenHelper } from '../../utils/TokenHelper';
import { TokenCache } from '../../TokenCache';
import { ClarionDocumentSymbolProvider } from '../ClarionDocumentSymbolProvider';
import { HoverFormatter, VariableInfo } from './HoverFormatter';
import { ScopeAnalyzer } from '../../utils/ScopeAnalyzer';
import { ClassDefinitionIndexer } from '../../utils/ClassDefinitionIndexer';
import { CrossFileCache } from './CrossFileCache';
import LoggerManager from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("VariableHoverResolver");
logger.setLevel("info");

/**
 * Resolves hover information for variables (parameters, local, module, global)
 */
export class VariableHoverResolver {
    private classIndexer: ClassDefinitionIndexer;
    
    constructor(
        private formatter: HoverFormatter,
        private scopeAnalyzer: ScopeAnalyzer,
        private tokenCache: TokenCache,
        private crossFileCache?: CrossFileCache
    ) {
        this.classIndexer = new ClassDefinitionIndexer();
    }

    /**
     * Find and format hover for a parameter
     */
    findParameterHover(word: string, document: TextDocument, currentScope: Token): Hover | null {
        const parameterInfo = this.findParameterInfo(word, document, currentScope);
        if (parameterInfo) {
            logger.info(`Found parameter info for ${word}`);
            return this.formatter.formatParameter(word, parameterInfo, currentScope);
        }
        return null;
    }

    /**
     * Find and format hover for a local variable
     */
    async findLocalVariableHover(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): Promise<Hover | null> {
        const variableInfo = this.findLocalVariableInfo(word, tokens, currentScope, document, originalWord);
        if (variableInfo) {
            logger.info(`✅ Found variable info for ${word}: type=${variableInfo.type}, line=${variableInfo.line}`);
            const baseHover = this.formatter.formatVariable(originalWord || word, variableInfo, currentScope, document);
            
            // Enhance with class definition info if applicable
            return await this.enhanceHoverWithClassInfo(baseHover, variableInfo.type, document);
        }
        return null;
    }

    /**
     * Find and format hover for a module-local variable
     */
    findModuleVariableHover(searchWord: string, tokens: Token[], document: TextDocument): Hover | null {
        logger.info(`Checking for module-local variable in current file...`);
        const firstProcToken = tokens.find(t => 
            t.type === TokenType.Label &&
            t.subType === TokenType.Procedure &&
            t.start === 0
        );
        const moduleScopeEndLine = firstProcToken ? firstProcToken.line : Number.MAX_SAFE_INTEGER;
        
        const moduleVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line < moduleScopeEndLine &&
            t.value.toLowerCase() === searchWord.toLowerCase()
        );
        
        if (moduleVar) {
            logger.info(`✅ Found module-local variable in current file: ${moduleVar.value} at line ${moduleVar.line}`);
            
            const moduleIndex = tokens.indexOf(moduleVar);
            let typeInfo = 'UNKNOWN';
            let isStructureDefinition = false;
            
            if (moduleIndex + 1 < tokens.length) {
                const nextToken = tokens[moduleIndex + 1];
                if (nextToken.line === moduleVar.line) {
                    // Check if it's a regular type token
                    if (nextToken.type === TokenType.Type) {
                        typeInfo = nextToken.value;
                    }
                    // Check if it's a CLASS/GROUP/QUEUE declaration
                    else if (nextToken.type === TokenType.Structure) {
                        typeInfo = nextToken.value.toUpperCase(); // CLASS, GROUP, QUEUE, etc.
                        isStructureDefinition = true; // This IS the definition
                    }
                }
            }
            
            const modulePos: Position = { line: moduleVar.line, character: 0 };
            const scopeInfo = this.scopeAnalyzer.getTokenScope(document, modulePos);
            
            const markdown = [
                `**${moduleVar.value}** — \`${typeInfo}\``,
                ``
            ];
            
            if (scopeInfo) {
                const scopeIcon = '📦';
                markdown.push(`${scopeIcon} Module variable`);
            }
            
            const fileName = path.basename(document.uri.replace('file:///', ''));
            const lineNumber = moduleVar.line + 1;
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
            if (moduleVar.line < lines.length) {
                const sourceLine = lines[moduleVar.line].trim();
                if (sourceLine) {
                    markdown.push(``);
                    markdown.push('```clarion');
                    markdown.push(sourceLine);
                    markdown.push('```');
                }
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
        
        return null;
    }

    /**
     * Find and format hover for a global variable (in current or parent file)
     */
    async findGlobalVariableHover(searchWord: string, tokens: Token[], document: TextDocument): Promise<Hover | null> {
        // First, check for global variable in CURRENT file (PROGRAM)
        const firstCodeToken = tokens.find(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'CODE'
        );
        const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;
        
        const globalVar = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line < globalScopeEndLine &&
            t.value.toLowerCase() === searchWord.toLowerCase()
        );
        
        if (globalVar) {
            logger.info(`✅ Found global variable in current file: ${globalVar.value} at line ${globalVar.line}`);
            return this.buildGlobalVariableHover(globalVar, tokens, document);
        }
        
        // If not found in current file, check for global variable in MEMBER parent file
        const memberToken = tokens.find(t => 
            t.value && t.value.toUpperCase() === 'MEMBER' && 
            t.line < 5 && 
            t.referencedFile
        );
        
        if (memberToken && memberToken.referencedFile) {
            logger.info(`Found MEMBER reference to: ${memberToken.referencedFile}`);
            return await this.findGlobalVariableInParentFile(searchWord, memberToken.referencedFile, document);
        }
        
        logger.info('No scope found and no global variable found - cannot provide hover');
        return null;
    }

    /**
     * Find parameter information
     */
    private findParameterInfo(word: string, document: TextDocument, currentScope: Token): { type: string; line: number } | null {
        const content = document.getText();
        const lines = content.split('\n');
        const procedureLine = lines[currentScope.line];

        if (!procedureLine) {
            return null;
        }

        const match = procedureLine.match(/PROCEDURE\s*\((.*?)\)/i);
        if (!match || !match[1]) {
            return null;
        }

        const paramString = match[1];
        const params = paramString.split(',');

        for (const param of params) {
            const trimmedParam = param.trim();
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
     * Find local variable information using the document symbol tree (public for use by other resolvers)
     */
    public findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): { type: string; line: number } | null {
        logger.info(`findLocalVariableInfo called for word: ${word}, scope: ${currentScope.value} at line ${currentScope.line}`);
        
        const symbolProvider = new ClarionDocumentSymbolProvider();
        const symbols = symbolProvider.provideDocumentSymbols(tokens, document.uri);
        
        const procedureSymbol = this.findProcedureContainingLine(symbols, currentScope.line);
        if (procedureSymbol) {
            logger.info(`Found procedure symbol: ${procedureSymbol.name}`);
            
            const searchText = originalWord || word;
            logger.info(`Searching with searchText="${searchText}"`);
            const varSymbol = this.findVariableInSymbol(procedureSymbol, searchText);
            if (varSymbol) {
                logger.info(`Found variable in symbol tree: ${varSymbol.name}`);
                
                let type = (varSymbol as any)._clarionType || varSymbol.detail || 'Unknown';
                
                if (varSymbol.kind === 23 && type === 'Unknown') {
                    const structTypeMatch = varSymbol.name.match(/^(\w+)\s*\(/);
                    if (structTypeMatch) {
                        type = structTypeMatch[1];
                    }
                }
                
                return {
                    type: type,
                    line: varSymbol.range.start.line
                };
            }
        }
        
        return null;
    }

    /**
     * Find procedure symbol that contains the given line
     */
    private findProcedureContainingLine(symbols: any[], line: number): any | null {
        for (const symbol of symbols) {
            if (symbol.range.start.line <= line && symbol.range.end.line >= line) {
                if (symbol.kind === 12) {
                    return symbol;
                }
                if (symbol.children) {
                    const result = this.findProcedureContainingLine(symbol.children, line);
                    if (result) return result;
                }
            }
        }
        return null;
    }

    /**
     * Find variable in symbol's children by name
     */
    private findVariableInSymbol(symbol: any, fieldName: string): any | null {
        if (!symbol.children) return null;
        
        for (const child of symbol.children) {
            if (child.kind === 23) {
                const groupNameMatch = child.name.match(/\(([^)]+)\)/);
                if (groupNameMatch) {
                    const groupName = groupNameMatch[1];
                    if (groupName.toLowerCase() === fieldName.toLowerCase()) {
                        return child;
                    }
                }
                
                if (child.children) {
                    const result = this.findVariableInSymbol(child, fieldName);
                    if (result) return result;
                }
            } else if (child.kind === 13) {
                const varName = (child as any)._clarionVarName || child.name.match(/^([^\s]+)/)?.[1] || child.name;
                
                if ((child as any)._isPartOfStructure && (child as any)._possibleReferences) {
                    const possibleRefs = (child as any)._possibleReferences as string[];
                    const matchesReference = possibleRefs.some(ref => 
                        ref.toUpperCase() === fieldName.toUpperCase()
                    );
                    const isUnprefixedMatch = varName.toUpperCase() === fieldName.toUpperCase();
                    
                    if (matchesReference && !isUnprefixedMatch) {
                        return child;
                    } else if (isUnprefixedMatch) {
                        continue;
                    } else {
                        continue;
                    }
                } else if (varName.toLowerCase() === fieldName.toLowerCase()) {
                    return child;
                }
                
                if (child.children) {
                    const result = this.findVariableInSymbol(child, fieldName);
                    if (result) return result;
                }
            } else if (child.children) {
                const result = this.findVariableInSymbol(child, fieldName);
                if (result) return result;
            }
        }
        
        return null;
    }

    /**
     * Build hover for a global variable
     */
    private buildGlobalVariableHover(globalVar: Token, tokens: Token[], document: TextDocument): Hover {
        const globalIndex = tokens.indexOf(globalVar);
        let typeInfo = 'UNKNOWN';
        if (globalIndex + 1 < tokens.length) {
            const nextToken = tokens[globalIndex + 1];
            if (nextToken.line === globalVar.line) {
                if (nextToken.type === TokenType.Type) {
                    typeInfo = nextToken.value;
                } else if (nextToken.type === TokenType.Structure) {
                    typeInfo = nextToken.value.toUpperCase();
                }
            }
        }
        
        const globalPos: Position = { line: globalVar.line, character: 0 };
        const scopeInfo = this.scopeAnalyzer.getTokenScope(document, globalPos);
        
        const markdown = [
            `**${globalVar.value}** — \`${typeInfo}\``,
            ``
        ];
        
        if (scopeInfo) {
            const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
            const scopeLabel = scopeInfo.type === 'global' ? 'Global variable' : 'Module variable';
            markdown.push(`${scopeIcon} ${scopeLabel}`);
        }
        
        const fileName = path.basename(document.uri.replace('file:///', ''));
        const lineNumber = globalVar.line + 1;
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
        if (globalVar.line < lines.length) {
            const sourceLine = lines[globalVar.line].trim();
            if (sourceLine) {
                markdown.push(``);
                markdown.push('```clarion');
                markdown.push(sourceLine);
                markdown.push('```');
            }
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
     * Find global variable in parent file
     */
    private async findGlobalVariableInParentFile(searchWord: string, parentFile: string, currentDocument: TextDocument): Promise<Hover | null> {
        const currentFilePath = decodeURIComponent(currentDocument.uri.replace('file:///', ''));
        const currentFileDir = path.dirname(currentFilePath);
        const resolvedPath = path.resolve(currentFileDir, parentFile);
        
        if (this.crossFileCache) {
            const cached = await this.crossFileCache.getOrLoadDocument(resolvedPath);
            if (cached) {
                const { document: parentDoc, tokens: parentTokens } = cached;
                
                const firstCodeToken = parentTokens.find(t => 
                    t.type === TokenType.Keyword && 
                    t.value.toUpperCase() === 'CODE'
                );
                const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;
                
                const globalVar = parentTokens.find(t =>
                    t.type === TokenType.Label &&
                    t.start === 0 &&
                    t.line < globalScopeEndLine &&
                    t.value.toLowerCase() === searchWord.toLowerCase()
                );
                
                if (globalVar) {
                    logger.info(`✅ Found global variable in MEMBER parent: ${globalVar.value} at line ${globalVar.line}`);
                    return this.buildGlobalVariableHover(globalVar, parentTokens, parentDoc);
                }
            }
        } else {
            // Fallback to direct file reading if cache not available
            if (fs.existsSync(resolvedPath)) {
                try {
                    const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
                    const parentDoc = TextDocument.create(
                        `file:///${resolvedPath.replace(/\\/g, '/')}`,
                        'clarion',
                        1,
                        parentContents
                    );
                    const parentTokens = this.getTokens(parentDoc);
                    
                    const firstCodeToken = parentTokens.find(t => 
                        t.type === TokenType.Keyword && 
                        t.value.toUpperCase() === 'CODE'
                    );
                    const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;
                    
                    const globalVar = parentTokens.find(t =>
                        t.type === TokenType.Label &&
                        t.start === 0 &&
                        t.line < globalScopeEndLine &&
                        t.value.toLowerCase() === searchWord.toLowerCase()
                    );
                    
                    if (globalVar) {
                        logger.info(`✅ Found global variable in MEMBER parent: ${globalVar.value} at line ${globalVar.line}`);
                        return this.buildGlobalVariableHover(globalVar, parentTokens, parentDoc);
                    }
                } catch (err) {
                    logger.error(`Error reading MEMBER parent file: ${err}`);
                }
            }
        }
        
        return null;
    }

    /**
     * Get tokens for a document
     */
    private getTokens(document: TextDocument): Token[] {
        return this.tokenCache.getTokens(document);
    }

    /**
     * Enhance hover text with class definition info from the indexer
     * @param baseHover The base hover text
     * @param typeName The type name to look up
     * @param document The current document
     * @returns Enhanced hover or original if no class info found
     */
    async enhanceHoverWithClassInfo(baseHover: Hover, typeName: string, document: TextDocument): Promise<Hover> {
        try {
            // Extract just the type name without decorators like & or *
            const cleanTypeName = typeName.replace(/^[&*\s]+/, '').trim();
            
            logger.info(`Looking up class definition for type: ${cleanTypeName}`);
            
            // Get project path from document URI
            const docPath = document.uri.replace('file:///', '').replace(/\//g, '\\');
            const projectPath = path.dirname(docPath);
            
            // Try to get or build index for this project
            const index = await this.classIndexer.getOrBuildIndex(projectPath);
            
            // Look up the class
            const definitions = this.classIndexer.findClass(cleanTypeName, projectPath);
            
            if (definitions && definitions.length > 0) {
                const def = definitions[0]; // Use first definition
                
                logger.info(`Found class definition: ${def.className} in ${def.filePath}:${def.lineNumber}`);
                
                // Extract just the filename from the full path
                const fileName = path.basename(def.filePath);
                
                // Build enhanced hover text
                const classInfo = [
                    ``,
                    `---`,
                    `**Class Definition:**`,
                    `- File: \`${fileName}\` (line ${def.lineNumber})`,
                    `- Type: ${def.isType ? 'CLASS,TYPE' : 'CLASS'}`,
                ];
                
                if (def.parentClass) {
                    classInfo.push(`- Parent: \`${def.parentClass}\``);
                }
                
                // Add indexer stats
                classInfo.push(``,  `*Indexed ${index.classes.size} classes in project*`);
                
                // Append to existing hover content
                let existingContent = '';
                if (typeof baseHover.contents === 'string') {
                    existingContent = baseHover.contents;
                } else if ('kind' in baseHover.contents && 'value' in baseHover.contents) {
                    existingContent = baseHover.contents.value;
                } else if (Array.isArray(baseHover.contents)) {
                    existingContent = baseHover.contents.map(c => typeof c === 'string' ? c : c.value).join('\n');
                }
                
                const enhancedContent = existingContent + '\n' + classInfo.join('\n');
                
                return {
                    contents: {
                        kind: 'markdown',
                        value: enhancedContent
                    },
                    range: baseHover.range
                };
            }
            
            logger.info(`No class definition found for: ${cleanTypeName}`);
        } catch (error) {
            logger.error(`Error enhancing hover with class info: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Return original hover if no enhancement possible
        return baseHover;
    }
}
