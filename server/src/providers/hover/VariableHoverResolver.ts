import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenHelper } from '../../utils/TokenHelper';
import { TokenCache } from '../../TokenCache';
import { ClarionDocumentSymbolProvider } from '../ClarionDocumentSymbolProvider';
import { HoverFormatter, VariableInfo } from './HoverFormatter';
import { ScopeAnalyzer } from '../../utils/ScopeAnalyzer';
import LoggerManager from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("VariableHoverResolver");

/**
 * Resolves hover information for variables (parameters, local, module, global)
 */
export class VariableHoverResolver {
    constructor(
        private formatter: HoverFormatter,
        private scopeAnalyzer: ScopeAnalyzer,
        private tokenCache: TokenCache
    ) {}

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
    findLocalVariableHover(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): Hover | null {
        const variableInfo = this.findLocalVariableInfo(word, tokens, currentScope, document, originalWord);
        if (variableInfo) {
            logger.info(`✅ Found variable info for ${word}: type=${variableInfo.type}, line=${variableInfo.line}`);
            return this.formatter.formatVariable(originalWord || word, variableInfo, currentScope, document);
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
                    }
                }
            }
            
            const modulePos: Position = { line: moduleVar.line, character: 0 };
            const scopeInfo = this.scopeAnalyzer.getTokenScope(document, modulePos);
            
            const markdown = [
                `**Module-Local Variable:** \`${moduleVar.value}\``,
                ``,
                `**Type:** \`${typeInfo}\``,
                ``
            ];
            
            if (scopeInfo) {
                const scopeIcon = '📦';
                markdown.push(`**Scope:** ${scopeIcon} Module`);
                markdown.push(``);
                markdown.push(`**Visibility:** Visible only within this file (module-local)`);
                markdown.push(``);
            }
            
            const fileName = path.basename(document.uri.replace('file:///', ''));
            const lineNumber = moduleVar.line + 1;
            markdown.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}`);
            markdown.push(``);
            markdown.push(`*Press F12 to go to declaration*`);
            
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
     * Find local variable information using the document symbol tree
     */
    private findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): { type: string; line: number } | null {
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
            `**Global Variable:** \`${globalVar.value}\``,
            ``,
            `**Type:** \`${typeInfo}\``,
            ``
        ];
        
        if (scopeInfo) {
            const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
            markdown.push(`**Scope:** ${scopeIcon} ${scopeInfo.type.charAt(0).toUpperCase() + scopeInfo.type.slice(1)}`);
            markdown.push(``);
            
            if (scopeInfo.type === 'global') {
                markdown.push(`**Visibility:** Visible everywhere`);
            } else {
                markdown.push(`**Visibility:** Visible only within this file (module-local)`);
            }
            markdown.push(``);
        }
        
        const fileName = path.basename(document.uri.replace('file:///', ''));
        const lineNumber = globalVar.line + 1;
        markdown.push(`**Declared in** \`${fileName}\` @ line ${lineNumber}`);
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
     * Find global variable in parent file
     */
    private async findGlobalVariableInParentFile(searchWord: string, parentFile: string, currentDocument: TextDocument): Promise<Hover | null> {
        const currentFilePath = decodeURIComponent(currentDocument.uri.replace('file:///', ''));
        const currentFileDir = path.dirname(currentFilePath);
        const resolvedPath = path.resolve(currentFileDir, parentFile);
        
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
        
        return null;
    }

    /**
     * Get tokens for a document
     */
    private getTokens(document: TextDocument): Token[] {
        return this.tokenCache.getTokens(document);
    }
}
