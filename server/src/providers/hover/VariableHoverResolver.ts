import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { HoverFormatter, VariableInfo } from './HoverFormatter';
import { ScopeAnalyzer } from '../../utils/ScopeAnalyzer';
import { StructureDeclarationIndexer } from '../../utils/StructureDeclarationIndexer';
import { CrossFileCache } from './CrossFileCache';
import { SymbolFinderService, SymbolInfo } from '../../services/SymbolFinderService';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import { TokenHelper } from '../../utils/TokenHelper';
import { CompilerFlagService } from '../../utils/CompilerFlagService'; // #420
import { ProcedureUtils } from '../../utils/ProcedureUtils';
import { SolutionManager } from '../../solution/solutionManager';
import LoggerManager from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("VariableHoverResolver");
logger.setLevel("error");

/**
 * Resolves hover information for variables (parameters, local, module, global)
 */
export class VariableHoverResolver {
    private sdi: StructureDeclarationIndexer;
    private symbolFinder: SymbolFinderService;
    private memberLocator: MemberLocatorService;
    
    constructor(
        private formatter: HoverFormatter,
        private scopeAnalyzer: ScopeAnalyzer,
        private tokenCache: TokenCache,
        private crossFileCache?: CrossFileCache
    ) {
        this.sdi = StructureDeclarationIndexer.getInstance();
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
            return this.formatter.formatParameter(word, parameterInfo, currentScope, symbolInfo.location.uri ?? document.uri);
        }
        return null;
    }

    /**
     * Find and format hover for a local variable
     */
    async findLocalVariableHover(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string, hoverLine?: number): Promise<Hover | null> {
        const symbolInfo = this.symbolFinder.findLocalVariable(word, tokens, currentScope, document, originalWord, hoverLine);
        
        if (symbolInfo) {
            logger.info(`✅ Found variable info for ${word}: type=${symbolInfo.type}, line=${symbolInfo.location.line}`);
            const variableInfo = this.toVariableInfo(symbolInfo, document); // #488
            // #302 follow-up (Mark): no class-definition appendix — the declaration line and
            // location already carry everything the hover needs; F12 on the type covers "where
            // is the class defined".
            return this.formatter.formatVariable(originalWord || word, variableInfo, currentScope, document, hoverLine);
        }
        return null;
    }

    /**
     * Find and format hover for a module/global-scope structure field's OWN
     * declaration line — a col-0 Label whose parent token is a GROUP/QUEUE/FILE/
     * RECORD, declared outside any PROCEDURE (e.g. a field inside a module-level
     * `SomeGroupType GROUP,TYPE` in an .inc file). `findLocalVariable`'s
     * "exact token under the cursor wins" fast path only fires when a
     * `currentScope` (PROCEDURE/ROUTINE) exists, so a field declared at true
     * file scope never reaches it; `findGlobalVariableHover` also correctly
     * excludes it from BARE-name lookups (structure fields need their
     * PRE()/dot qualifier), but the cursor here is ON the declaration, not
     * doing a bare-name reference. Without this, hovering such a field's own
     * declaration showed nothing.
     */
    findStructureFieldDeclarationHover(word: string, tokens: Token[], document: TextDocument, hoverLine: number): Hover | null {
        const symbolInfo = this.symbolFinder.findStructureField(word, tokens, hoverLine, document);
        if (!symbolInfo) return null;

        logger.info(`✅ Found structure field declaration for ${word} at line ${symbolInfo.location.line}`);
        const variableInfo = this.toVariableInfo(symbolInfo, document); // #488
        return this.formatter.formatVariable(word, variableInfo, symbolInfo.token, document, hoverLine);
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
        
        // #486 — same badge rule as the global card: a structure label is a structure.
        const structureKind = this.structureKindOf(symbolInfo.token, tokens);
        // #489 — this tier ("module-local variable in the current file") also matches a
        // PROGRAM file's global data section, which is global to every module of the
        // program; the badge was hard-coded "Module". Take the scope from the analyser,
        // as the global card does, and treat PROGRAM-file data as global outright.
        const isProgramFile = tokens.some(t => t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'PROGRAM');
        const isGlobal = isProgramFile || scopeInfo?.type === 'global';
        const scopeIcon = isGlobal ? '🌍' : '📦';
        const scopeWord = isGlobal ? 'Global' : 'Module';
        if (scopeInfo) {
            markdown.push(structureKind ? `${scopeIcon} ${scopeWord} ${structureKind} structure` : `${scopeIcon} ${scopeWord} variable`);
            if (structureKind) {
                const facts = this.describeStructure(symbolInfo.token, structureKind, tokens, document);
                if (facts) {
                    markdown.push(``);
                    markdown.push(facts);
                }
            }
        }

        // Add the actual source code line — as written, not rebuilt from tokens
        // (#486: the token join rendered `LocalF FILE , DRIVER ( 'ASCII' ) , PRE ( LF )`).
        const sourceLine = document.getText().split(/\r?\n/)[symbolInfo.location.line]?.trim();
        const declaration = sourceLine || symbolInfo.declaration;
        if (declaration) {
            markdown.push(``);
            markdown.push('```clarion');
            markdown.push(declaration);
            markdown.push('```');
        }

        // Location at bottom, after code block
        markdown.push(this.formatter.locationLink(document.uri, symbolInfo.location.line));
        
        markdown.push(``);
        
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
    async findGlobalVariableHover(searchWord: string, tokens: Token[], document: TextDocument, hoverLine?: number, shallowOnly = false): Promise<Hover | null> {
        // #265: the plain-label decision is SymbolFinderService's — the exact
        // same call F12 uses, so the two surfaces cannot disagree. It excludes
        // parent-linked tokens: a field of a PRE()'d structure never satisfies
        // a bare lookup (previously this scan matched such fields when they
        // appeared before the real global).
        const labelHit = this.symbolFinder.findGlobalVariableInCurrentFile(searchWord, tokens, document);
        if (labelHit) {
            logger.info(`✅ Found global variable in current file: ${labelHit.token.value} at line ${labelHit.location.line}`);
            return this.buildGlobalVariableHover(labelHit.token, tokens, document, hoverLine);
        }

        // Hover-only extras beyond the shared decision: global STRUCTURE labels
        // (QUEUE/GROUP/CLASS declared with the name in `label`) and
        // procedure/function labels, which render as structure/procedure cards.
        const firstCodeToken = tokens.find(t =>
            t.type === TokenType.Keyword &&
            t.value.toUpperCase() === 'CODE'
        );
        const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;

        const structOrProc = tokens.find(t =>
            t.start === 0 &&
            t.line < globalScopeEndLine &&
            (t.type === TokenType.Structure || TokenHelper.isProcedureOrFunction(t)) &&
            t.label?.toLowerCase() === searchWord.toLowerCase()
        );

        if (structOrProc) {
            logger.info(`✅ Found global structure/procedure label in current file: ${structOrProc.value} at line ${structOrProc.line}`);
            return this.buildGlobalVariableHover(structOrProc, tokens, document, hoverLine);
        }

        // When shallowOnly=true (e.g. checking a MEMBER parent doc), skip the recursive
        // cross-file include chain traversal — the caller will handle includes separately.
                if (shallowOnly) return null;

        // #420: a predefined compiler flag (DLL_MODE, _DEBUG_, _C80_ …) is set by the
        // compiler/project system and declared in NO source file — the cross-file walk
        // below would cold-load the whole include universe (10.5s on IBSCommon.clw) to
        // return null. Checked AFTER the current-file tiers so a user declaration of
        // the same name still wins.
        const flagHover = this.compilerFlagHover(searchWord);
        if (flagHover) return flagHover;

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
     * Also handles prefix:field notation (e.g. "SetG:SettingsGroup") by looking for
     * structure fields with the matching PRE prefix and field name.
     * Used by HoverProvider after all scope-based checks fail (parameter/local/module/global).
     */
    public async findInIncludesAndEquates(searchWord: string, tokens: Token[], document: TextDocument): Promise<Hover | null> {
        // For prefix:field notation, try resolving the structure field directly
        const colonIdx = searchWord.lastIndexOf(':');
        if (colonIdx > 0) {
            const prefix = searchWord.substring(0, colonIdx);
            const fieldName = searchWord.substring(colonIdx + 1);
            const prefixResult = await this.memberLocator.findPrefixFieldTokenInChain(prefix, fieldName, document);
            if (prefixResult) {
                logger.info(`✅ Found "${searchWord}" as prefix:field in chain: ${path.basename(prefixResult.doc.uri)}`);
                return this.buildGlobalVariableHover(prefixResult.token, prefixResult.tokens, prefixResult.doc);
            }
        }

        // #420: see findGlobalVariableHover — never walk the include chain for a compiler flag.
        const flagHover = this.compilerFlagHover(searchWord);
        if (flagHover) return flagHover;

        const crossFileResult = await this.memberLocator.findVariableTokenInParentChain(searchWord, document);
        if (crossFileResult) {
            logger.info(`✅ Found "${searchWord}" in INCLUDE file: ${path.basename(crossFileResult.doc.uri)}`);
            return this.buildGlobalVariableHover(crossFileResult.token, crossFileResult.tokens, crossFileResult.doc);
        }
        return await this.searchEquatesFile(searchWord);
    }

    /** #420: documentation card for a predefined compiler flag, or null. */
    private compilerFlagHover(word: string): Hover | null {
        const flag = CompilerFlagService.getInstance().getFlag(word);
        if (!flag) return null;
        logger.info(`⏭️ [#420] "${word}" is a predefined compiler flag — no source declaration to find`);
        return this.formatter.formatKeyword({
            name: flag.name,
            category: 'Predefined compiler flag',
            description: flag.description,
            syntax: `COMPILE('***', ${flag.name})   ! or OMIT('***', ${flag.name}), DLL(${flag.name.toLowerCase()})`
        });
    }

    /**
     * Find local variable information using the document symbol tree (public for use by other resolvers)
     */
    public findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): { type: string; line: number } | null {
        logger.info(`findLocalVariableInfo called for word: ${word}, scope: ${currentScope.value} at line ${currentScope.line}`);
        
        const symbolInfo = this.symbolFinder.findLocalVariable(word, tokens, currentScope, document, originalWord);
        
        if (symbolInfo) {
            logger.info(`Found variable in symbol tree: ${symbolInfo.token.value}`);
            return this.toVariableInfo(symbolInfo, document);
        }

        return null;
    }

    /**
     * #488 — ONE card for one symbol, whichever cursor reached it. The finder's
     * result differs by route: the declaration-line fast path carries the owning
     * structure, the symbol-tree / PRE:Field / Structure.Field routes do not, and
     * each derived the title type its own way (`string` vs `string(261)`). So a
     * QUEUE field read "Field of local procedure QUEUE `FoundQ`" on its own line
     * and "Local procedure variable" at `fq:loc` or `FoundQ.loc`. Both facts come
     * from the declaration token itself, so derive them here for every route.
     */
    private toVariableInfo(symbolInfo: SymbolInfo, document: TextDocument): VariableInfo {
        const token = symbolInfo.token;
        const parentStructure = symbolInfo.parentStructure
            ?? TokenHelper.getEnclosingDataStructure(token, this.tokenCache.getStructure(document));
        return {
            type: this.declaredTypeText(token, document) ?? symbolInfo.type,
            line: symbolInfo.location.line,
            parentStructure
        };
    }

    /**
     * #488 — the type expression as written on the declaration line: the first
     * attribute after the label, up to the first top-level comma. `loc string(261)`
     * → `string(261)`; `pick long,auto` → `long`; `DirQ QUEUE(File:queue),PRE(dq)`
     * → `QUEUE(File:queue)`; `t &StringTheory` → `&StringTheory`. Undefined when
     * the line does not look like a declaration (callers keep the finder's type).
     */
    private declaredTypeText(token: Token, document: TextDocument): string | undefined {
        const line = document.getText().split(/\r?\n/)[token.line];
        if (!line || token.start !== 0) return undefined;
        const rest = line.slice(token.value.length);
        if (!/^\s/.test(rest)) return undefined;
        const m = /^\s+(&?[A-Za-z_][\w:.]*(?:\([^)]*\))?)/.exec(rest);
        return m ? m[1] : undefined;
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
            TokenHelper.isProcedureOrFunction(t) &&
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
            `**${globalVar.label ?? globalVar.value}** — \`${typeInfo}\``,
            ``
        ];
        
        const isProcedure = ProcedureUtils.isProcedureKeyword(typeInfo); // #247: PROCEDURE ≡ FUNCTION
        const isEquate = typeInfo === 'EQUATE';

        // #350-adjacent — a PRE:Field reference (e.g. EVL:Lic) resolves through the same
        // global-variable path as a true global scalar, but the token is actually a field of a
        // PRE()'d FILE/QUEUE/GROUP (StructureProcessor stamps isStructureField/structureParent on
        // it). Label it as a structure field — matching the "`X` Field:" wording
        // StructureFieldResolver already uses for dot-notation access to the same field — instead
        // of the generic "🌍 Global variable", which loses exactly the context the developer needs
        // to tell a real global apart from a structure field reached via its PRE prefix.
        const structureParentName = (globalVar as any).isStructureField
            ? ((globalVar as any).structureParent?.label ?? (globalVar as any).structureParent?.value)
            : undefined;

        if (isClassProperty) {
            const classLabel = containingClassName ? `Class property of \`${containingClassName}\`` : 'Class property';
            markdown.push(`🔷 ${classLabel}`);
        } else if (isInterfaceMethod) {
            const ifaceLabel = containingInterfaceName ? `Interface method of \`${containingInterfaceName}\`` : 'Interface method';
            markdown.push(`🔌 ${ifaceLabel}`);
        } else if (structureParentName) {
            markdown.push(`🔷 \`${structureParentName}\` field`);
        } else if (scopeInfo) {
            const scopeIcon = scopeInfo.type === 'global' ? '🌍' : '📦';
            const scopeWord = scopeInfo.type === 'global' ? 'Global' : 'Module';
            // #486 — a structure label (FILE, QUEUE, GROUP, CLASS, WINDOW, REPORT, VIEW…)
            // is not a variable. The title already named the type; the badge — the line
            // a reader trusts — said "Global variable" for a FILE. Badge it as the
            // structure it is, and give a FILE the facts it is hovered for.
            const structureKind = this.structureKindOf(globalVar, tokens);
            const scopeLabel = structureKind
                ? `${scopeWord} ${structureKind} structure`
                : isProcedure
                    ? `${scopeWord} procedure`
                    : isEquate
                        ? `${scopeWord} constant`
                        : `${scopeWord} variable`;
            markdown.push(`${scopeIcon} ${scopeLabel}`);
            if (structureKind) {
                const facts = this.describeStructure(globalVar, structureKind, tokens, document);
                if (facts) {
                    markdown.push(``);
                    markdown.push(facts);
                }
            }
        }

        // Inline declared-value summary (Gap D). Reads the structured dataType / dataValue
        // attached by ClarionTokenizer; no re-parse of source text. EQUATE renders as
        // `Name = value`; sized scalars render as `Name : TYPE(arg)`.
        if (globalVar.dataType !== undefined) {
            const summary = this.renderDeclaredValueSummary(
                globalVar.label ?? globalVar.value,
                globalVar.dataType,
                globalVar.dataValue
            );
            if (summary) {
                markdown.push(``);
                markdown.push(summary);
            }
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

        // Location at bottom, after code block
        markdown.push(this.formatter.locationLink(document.uri, globalVar.line));
        
        return {
            contents: {
                kind: 'markdown',
                value: markdown.join('\n')
            }
        };
    }

    /**
     * Renders a one-line markdown summary for the structured declared-value pair
     * captured by `ClarionTokenizer.populateDeclaredValues()`. Returns the empty
     * string when nothing useful can be shown (the heading line above already
     * shows `Name — TYPE`, so we only add value-bearing detail).
     */
    /**
     * #486 — the structure keyword this label declares (`Orders FILE,…` → "FILE"),
     * from the Structure token on the label's own line; undefined for a scalar,
     * a reference, a procedure or an EQUATE.
     */
    private structureKindOf(labelToken: Token, tokens: Token[]): string | undefined {
        const opener = tokens.find(t =>
            t.line === labelToken.line &&
            t.start > labelToken.start &&
            t.type === TokenType.Structure &&
            t.finishesAt !== undefined
        );
        return opener ? opener.value.toUpperCase() : undefined;
    }

    /**
     * #486 — one line of facts for a structure card, from the declaration the
     * tokenizer already parsed. FILE: driver, PRE prefix, keys, memos/blobs and
     * record fields. QUEUE/GROUP: PRE prefix and field count. Nothing for the rest.
     */
    private describeStructure(labelToken: Token, kind: string, tokens: Token[], document: TextDocument): string {
        const opener = tokens.find(t =>
            t.line === labelToken.line && t.start > labelToken.start &&
            t.type === TokenType.Structure && t.finishesAt !== undefined);
        if (!opener || opener.finishesAt === undefined) return '';

        const lines = document.getText().split(/\r?\n/);
        const declLine = lines[labelToken.line] ?? '';
        const parts: string[] = [];

        const driver = /\bDRIVER\s*\(\s*'([^']*)'/i.exec(declLine);
        if (driver) parts.push(`DRIVER('${driver[1]}')`);
        const pre = /\bPRE\s*\(\s*([A-Za-z_][\w:]*)\s*\)/i.exec(declLine);
        if (pre) parts.push(`PRE(${pre[1]})`);
        for (const attr of ['CREATE', 'THREAD', 'OWNER', 'ENCRYPT', 'RECLAIM', 'BINDABLE']) {
            if (new RegExp(`[,\\s]${attr}\\b`, 'i').test(declLine)) parts.push(attr);
        }

        // Column-0 labels declared inside this structure, with the keyword that follows each.
        const members = tokens.filter(t =>
            t.line > opener.line && t.line < opener.finishesAt! &&
            t.start === 0 && t.type === TokenType.Label);
        const followerOf = (t: Token) => tokens.find(n => n.line === t.line && n.start > t.start)?.value.toUpperCase() ?? '';
        const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

        if (kind === 'FILE') {
            const keys = members.filter(t => ['KEY', 'INDEX'].includes(followerOf(t))).length;
            const memos = members.filter(t => ['MEMO', 'BLOB'].includes(followerOf(t))).length;
            const record = tokens.find(t =>
                t.line > opener.line && t.line < opener.finishesAt! &&
                t.type === TokenType.Structure && t.value.toUpperCase() === 'RECORD' && t.finishesAt !== undefined);
            const fields = record
                ? members.filter(t => t.line > record.line && t.line < record.finishesAt!).length
                : 0;
            if (keys) parts.push(plural(keys, 'key'));
            if (memos) parts.push(plural(memos, 'memo'));
            parts.push(plural(fields, 'field'));
            return parts.length ? `🗄️ ${parts.join(' · ')}` : '';
        }
        if (kind === 'QUEUE' || kind === 'GROUP') {
            parts.push(plural(members.length, 'field'));
            return `🗂️ ${parts.join(' · ')}`;
        }
        return parts.length ? `🗂️ ${parts.join(' · ')}` : '';
    }

    private renderDeclaredValueSummary(name: string, type: string, value: string | undefined): string {
        const upperType = type.toUpperCase();
        if (value !== undefined) {
            // EQUATE — show as a value:  **MAX_ROWS** = `100`
            if (upperType === 'EQUATE') {
                return `**${name}** = \`${value}\``;
            }
            // Sized / parameterised scalar — show full type signature: **Name** : `STRING(20)`
            return `**${name}** : \`${upperType}(${value})\``;
        }
        // Bare-type declaration — heading already shows the type, nothing to add.
        return '';
    }

    /**
     * Search equates.clw (implicitly global in all Clarion programs via MAP/END) for a label.
     */
    private async searchEquatesFile(searchWord: string): Promise<Hover | null> {
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

    }
