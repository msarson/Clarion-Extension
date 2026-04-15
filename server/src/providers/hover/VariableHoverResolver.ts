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
import { SymbolFinderService } from '../../services/SymbolFinderService';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import LoggerManager from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("VariableHoverResolver");
logger.setLevel("error");

/**
 * Resolves hover information for variables (parameters, local, module, global)
 */
export class VariableHoverResolver {
    private classIndexer: ClassDefinitionIndexer;
    private symbolFinder: SymbolFinderService;
    private memberLocator: MemberLocatorService;
    
    constructor(
        private formatter: HoverFormatter,
        private scopeAnalyzer: ScopeAnalyzer,
        private tokenCache: TokenCache,
        private crossFileCache?: CrossFileCache
    ) {
        this.classIndexer = ClassDefinitionIndexer.getInstance();
        this.symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
        this.memberLocator = new MemberLocatorService(crossFileCache);
    }

    /**
     * Find and format hover for a parameter
     */
    findParameterHover(word: string, document: TextDocument, currentScope: Token): Hover | null {
        const symbolInfo = this.symbolFinder.findParameter(word, document, currentScope);
        
        if (symbolInfo) {
            logger.info(`Found parameter info for ${word}`);
            const parameterInfo = {
                type: symbolInfo.type,
                line: symbolInfo.location.line
            };
            return this.formatter.formatParameter(word, parameterInfo, currentScope);
        }
        return null;
    }

    /**
     * Find and format hover for a local variable
     */
    async findLocalVariableHover(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string, hoverLine?: number): Promise<Hover | null> {
        const symbolInfo = this.symbolFinder.findLocalVariable(word, tokens, currentScope, document, originalWord);
        
        if (symbolInfo) {
            logger.info(`✅ Found variable info for ${word}: type=${symbolInfo.type}, line=${symbolInfo.location.line}`);
            const variableInfo: VariableInfo = {
                type: symbolInfo.type,
                line: symbolInfo.location.line
            };
            const baseHover = this.formatter.formatVariable(originalWord || word, variableInfo, currentScope, document, hoverLine);
            
            // Enhance with class definition info if applicable
            return await this.enhanceHoverWithClassInfo(baseHover, symbolInfo.type, document);
        }
        return null;
    }

    /**
     * Find and format hover for a module-local variable
     */
    findModuleVariableHover(searchWord: string, tokens: Token[], document: TextDocument, hoverLine?: number): Hover | null {
        logger.info(`Checking for module-local variable in current file: ${searchWord}...`);
        
        const symbolInfo = this.symbolFinder.findModuleVariable(searchWord, tokens, document);
        
        if (!symbolInfo) {
            logger.info(`❌ findModuleVariable returned null for ${searchWord}`);
            return null;
        }
        
        logger.info(`✅ Found module-local variable in current file: ${symbolInfo.token.value} at line ${symbolInfo.location.line}`);
        
        const scopeInfo = this.scopeAnalyzer.getTokenScope(document, { 
            line: symbolInfo.location.line, 
            character: 0 
        });
        
        const markdown = [
            `**${symbolInfo.token.value}** — \`${symbolInfo.type}\``,
            ``
        ];
        
        if (scopeInfo) {
            const scopeIcon = '📦';
            markdown.push(`${scopeIcon} Module variable`);
        }
        
        const fileName = path.basename(document.uri.replace('file:///', ''));
        const lineNumber = symbolInfo.location.line + 1;
        // Append "Declared in" to the same line as scope label if it exists
        const lastLine = markdown[markdown.length - 1];
        if (lastLine && lastLine.includes('variable')) {
            markdown[markdown.length - 1] = `${lastLine} Declared in ${fileName}:${lineNumber}`;
        } else {
            markdown.push(`Declared in ${fileName}:${lineNumber}`);
        }
        
        // Add the actual source code line
        if (symbolInfo.declaration) {
            markdown.push(``);
            markdown.push('```clarion');
            markdown.push(symbolInfo.declaration);
            markdown.push('```');
        }
        
        markdown.push(``);
        if (hoverLine === undefined || hoverLine !== symbolInfo.location.line) {
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
     * Find and format hover for a global variable (in current or parent file)
     */
    async findGlobalVariableHover(searchWord: string, tokens: Token[], document: TextDocument, hoverLine?: number): Promise<Hover | null> {
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
            return this.buildGlobalVariableHover(globalVar, tokens, document, hoverLine);
        }
        
        // Check MEMBER parent + its INCLUDE chain, plus current file's INCLUDE chain
        const crossFileResult = await this.memberLocator.findVariableTokenInParentChain(searchWord, document);
        if (crossFileResult) {
            logger.info(`✅ Found "${searchWord}" cross-file: ${path.basename(crossFileResult.doc.uri)}`);
            return this.buildGlobalVariableHover(crossFileResult.token, crossFileResult.tokens, crossFileResult.doc, hoverLine);
        }

        // Final fallback: equates.clw (implicitly global in all Clarion programs)
        const equatesResult = await this.searchEquatesFile(searchWord);
        if (equatesResult) return equatesResult;

        logger.info('No scope found and no global variable found - cannot provide hover');
        return null;
    }

    /**
     * Search the INCLUDE chain of a file and equates.clw for a label.
     * Used by HoverProvider after all scope-based checks fail (parameter/local/module/global).
     */
    public async findInIncludesAndEquates(searchWord: string, tokens: Token[], document: TextDocument): Promise<Hover | null> {
        const crossFileResult = await this.memberLocator.findVariableTokenInParentChain(searchWord, document);
        if (crossFileResult) {
            logger.info(`✅ Found "${searchWord}" in INCLUDE file: ${path.basename(crossFileResult.doc.uri)}`);
            return this.buildGlobalVariableHover(crossFileResult.token, crossFileResult.tokens, crossFileResult.doc);
        }
        return await this.searchEquatesFile(searchWord);
    }

    /**
     * Find local variable information using the document symbol tree (public for use by other resolvers)
     */
    public findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): { type: string; line: number } | null {
        logger.info(`findLocalVariableInfo called for word: ${word}, scope: ${currentScope.value} at line ${currentScope.line}`);
        
        const symbolInfo = this.symbolFinder.findLocalVariable(word, tokens, currentScope, document, originalWord);
        
        if (symbolInfo) {
            logger.info(`Found variable in symbol tree: ${symbolInfo.token.value}`);
            return {
                type: symbolInfo.type,
                line: symbolInfo.location.line
            };
        }
        
        return null;
    }

    /**
     * Build hover for a global variable
     */
    private buildGlobalVariableHover(globalVar: Token, tokens: Token[], document: TextDocument, hoverLine?: number): Hover {
        const typeInfo = SymbolFinderService.extractTypeInfo(globalVar, tokens);

        // Check if this variable is inside a CLASS or INTERFACE structure
        const structure = this.tokenCache.getStructure(document);
        const isClassProperty = structure.isInClassBlock(globalVar.line);
        const isInterfaceMethod = !isClassProperty && tokens.some(t =>
            t.type === TokenType.Procedure &&
            (t as any).subType === TokenType.InterfaceMethod &&
            t.line === globalVar.line
        );
        let containingClassName: string | undefined;
        if (isClassProperty) {
            // 🚀 PERF: use structure index (O(classes)) instead of full token scan + slice + reverse
            const classToken = structure.getClasses().find(t =>
                t.line < globalVar.line && (t.finishesAt === undefined || t.finishesAt >= globalVar.line)
            );
            containingClassName = classToken?.label ?? classToken?.value;
        }
        let containingInterfaceName: string | undefined;
        if (isInterfaceMethod) {
            // 🚀 PERF: use structure index (O(interfaces)) instead of full token scan + slice + reverse
            const ifaceToken = structure.getInterfaces().find(t =>
                t.line < globalVar.line && (t.finishesAt === undefined || t.finishesAt >= globalVar.line)
            );
            containingInterfaceName = ifaceToken?.label ?? ifaceToken?.value;
        }
        
        const globalPos: Position = { line: globalVar.line, character: 0 };
        const scopeInfo = this.scopeAnalyzer.getTokenScope(document, globalPos);
        
        const markdown = [
            `**${globalVar.value}** — \`${typeInfo}\``,
            ``
        ];
        
        const isProcedure = typeInfo === 'PROCEDURE';

        if (isClassProperty) {
            const classLabel = containingClassName ? `Class property of \`${containingClassName}\`` : 'Class property';
            markdown.push(`🔷 ${classLabel}`);
        } else if (isInterfaceMethod) {
            const ifaceLabel = containingInterfaceName ? `Interface method of \`${containingInterfaceName}\`` : 'Interface method';
            markdown.push(`🔌 ${ifaceLabel}`);
        } else if (scopeInfo) {
            const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
            const scopeLabel = isProcedure
                ? (scopeInfo.type === 'global' ? 'Global procedure' : 'Module procedure')
                : (scopeInfo.type === 'global' ? 'Global variable' : 'Module variable');
            markdown.push(`${scopeIcon} ${scopeLabel}`);
        }
        
        const fileName = path.basename(document.uri.replace('file:///', ''));
        const lineNumber = globalVar.line + 1;
        // Append "Declared in" to the same line as scope/context label if it exists
        const lastLine = markdown[markdown.length - 1];
        if (lastLine && (lastLine.includes('variable') || lastLine.includes('procedure') || lastLine.includes('property') || lastLine.includes('method'))) {
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
        if (hoverLine === undefined || hoverLine !== globalVar.line) {
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
     * Search equates.clw (implicitly global in all Clarion programs via MAP/END) for a label.
     */
    private async searchEquatesFile(searchWord: string): Promise<Hover | null> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SolutionManager } = require('../../solution/solutionManager');
        const sm = SolutionManager.getInstance();
        const equatesPath = sm?.getEquatesPath();
        if (!equatesPath || !fs.existsSync(equatesPath)) return null;

        try {
            const content = fs.readFileSync(equatesPath, 'utf-8');
            const uri = `file:///${equatesPath.replace(/\\/g, '/')}`;
            let doc: TextDocument;
            let equatesTokens: Token[];

            if (this.crossFileCache) {
                const cached = await this.crossFileCache.getOrLoadDocument(equatesPath);
                if (!cached) return null;
                doc = cached.document;
                equatesTokens = cached.tokens;
            } else {
                doc = TextDocument.create(uri, 'clarion', 1, content);
                equatesTokens = this.getTokens(doc);
            }

            const eqToken = equatesTokens.find(t =>
                t.type === TokenType.Label &&
                t.start === 0 &&
                t.value.toLowerCase() === searchWord.toLowerCase()
            );
            if (eqToken) {
                logger.info(`✅ Found "${searchWord}" in equates.clw`);
                return this.buildGlobalVariableHover(eqToken, equatesTokens, doc);
            }
        } catch (err) {
            logger.error(`Error searching equates.clw: ${err}`);
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
