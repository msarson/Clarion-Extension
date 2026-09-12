import { Hover, Location, Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { resolveViaProjectRedirection } from '../utils/RedirectionResolution';
import { findSectionLocation } from '../utils/SectionLocator';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import { AttributeService } from '../utils/AttributeService';
import { ControlService } from '../utils/ControlService';
import { DataTypeService } from '../utils/DataTypeService';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { HoverFormatter } from './hover/HoverFormatter';
import { ProcedureCallDetector } from './utils/ProcedureCallDetector';
import { ContextualHoverHandler } from './hover/ContextualHoverHandler';
import { SymbolHoverResolver } from './hover/SymbolHoverResolver';
import { VariableHoverResolver } from './hover/VariableHoverResolver';
import { ProcedureHoverResolver } from './hover/ProcedureHoverResolver';
import { MethodHoverResolver } from './hover/MethodHoverResolver';
import { RoutineHoverResolver } from './hover/RoutineHoverResolver';
import { HoverContextBuilder } from './hover/HoverContextBuilder';
import { FileDefinitionResolver } from '../utils/FileDefinitionResolver';
import { HoverRouter } from './hover/HoverRouter';
import { StructureFieldResolver } from './hover/StructureFieldResolver';
import { CrossFileCache } from './hover/CrossFileCache';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { getLocalMapScope } from '../utils/LocalMapScopeHelper';
import { ScopeKind, ScopeNode } from '../scope/ScopeTypes';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("HoverProvider");
logger.setLevel("error");

// Hover attribution — the "LSP slow handler | onHover" line gives a total but not
// WHERE it went. Visible when clarion.log.performance.enabled; emits only for
// hovers ≥ threshold, naming the stages of the resolution ladder.
const perfLogger = LoggerManager.getLogger("HoverProvider.Perf", "perf");
const HOVER_SLOW_REPORT_MS = 250;

/** Per-request stage trace threaded through the resolution ladder. */
interface HoverTrace {
    stages: Array<[string, number]>;
    word?: string;
}

/**
 * Provides hover information for local variables and parameters
 */
export class HoverProvider {
    private tokenCache = TokenCache.getInstance();
    private memberResolver = new ClassMemberResolver();
    private overloadResolver = new MethodOverloadResolver();
    private crossFileCache: CrossFileCache;
    private mapResolver: MapProcedureResolver;
    private crossFileResolver = new CrossFileResolver(this.tokenCache);
    private fileResolver = new FileDefinitionResolver(); // #265 — shared with F12's #171 path
    private builtinService = BuiltinFunctionService.getInstance();
    private attributeService = AttributeService.getInstance();
    private controlService = ControlService.getInstance();
    private dataTypeService = DataTypeService.getInstance();
    private scopeAnalyzer: ScopeAnalyzer;
    private formatter: HoverFormatter;
    private contextHandler: ContextualHoverHandler;
    private symbolResolver: SymbolHoverResolver;
    private variableResolver: VariableHoverResolver;
    private procedureResolver: ProcedureHoverResolver;
    private methodResolver: MethodHoverResolver;
    private routineResolver: RoutineHoverResolver;
    private contextBuilder: HoverContextBuilder;
    private router: HoverRouter;
    private structureFieldResolver: StructureFieldResolver;
    private includeVerifier: IncludeVerifier;
    private symbolFinder: SymbolFinderService;

    constructor() {
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.formatter = new HoverFormatter(this.scopeAnalyzer);
        this.contextHandler = new ContextualHoverHandler(this.builtinService, this.attributeService);
        this.symbolResolver = new SymbolHoverResolver(this.dataTypeService, this.controlService);
        this.crossFileCache = new CrossFileCache(this.tokenCache);
        this.mapResolver = new MapProcedureResolver(this.crossFileCache);
        this.variableResolver = new VariableHoverResolver(this.formatter, this.scopeAnalyzer, this.tokenCache, this.crossFileCache);
        this.procedureResolver = new ProcedureHoverResolver(this.mapResolver, this.crossFileResolver, this.formatter);
        this.methodResolver = new MethodHoverResolver(this.overloadResolver, this.memberResolver, this.formatter);
        this.routineResolver = new RoutineHoverResolver(this.formatter);
        this.contextBuilder = new HoverContextBuilder();
        this.structureFieldResolver = new StructureFieldResolver(
            this.formatter,
            this.methodResolver,
            this.variableResolver
        );
        this.router = new HoverRouter(
            this.procedureResolver,
            this.methodResolver,
            this.variableResolver,
            this.symbolResolver,
            this.routineResolver,
            this.contextHandler,
            this.formatter
        );
        this.includeVerifier = IncludeVerifier.getInstance();
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
    }

    /**
     * Provides hover information for a position in the document
     */
    public async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
        const t0 = Date.now();
        const trace: HoverTrace = { stages: [] };
        try {
            return await this._provideHoverInternal(document, position, trace);
        } finally {
            const totalMs = Date.now() - t0;
            if (totalMs >= HOVER_SLOW_REPORT_MS) {
                const top = trace.stages
                    .filter(([, ms]) => ms >= 25)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, ms]) => `${name}=${ms}`)
                    .join(', ');
                perfLogger.perf("Hover slow", {
                    total_ms: totalMs,
                    top: top || '(all stages <25ms — cost is queue/tokenize)',
                    word: trace.word ?? '(pre-context)',
                    line: position.line,
                    character: position.character,
                    uri: document.uri
                });
            }
        }
    }

    private async _provideHoverInternal(document: TextDocument, position: Position, trace: HoverTrace): Promise<Hover | null> {
        let stageStart = Date.now();
        const mark = (name: string) => {
            const now = Date.now();
            trace.stages.push([name, now - stageStart]);
            stageStart = now;
        };

        try {
            // #265 — INCLUDE/MODULE/MEMBER/LINK filename hover (mirror of F12's
            // #171 exception). The context builder bails on any cursor inside a
            // string literal, so this must run BEFORE it: when the cursor is on
            // the filename argument of a file-ref statement, show the RESOLVED
            // path (the redirection answer — the filename alone doesn't tell you
            // which copy wins). The detector scopes to the FIRST string after the
            // file-ref token, so SECTION args still fall through to the bail.
            {
                const preTokens = this.tokenCache.getTokens(document);
                const fileRefStr = TokenHelper.getFileRefArgStringToken(preTokens, position.line, position.character);
                mark('tokenize+fileRef');
                if (fileRefStr) {
                    return this.buildFileRefHover(fileRefStr, preTokens, document);
                }
                // #343 — the SECTION argument of INCLUDE('file','section'):
                // card names the resolved file + section line (same locator
                // F12 uses, so both surfaces agree).
                const sectionArg = TokenHelper.getIncludeSectionArgStringToken(preTokens, position.line, position.character);
                if (sectionArg) {
                    return this.buildSectionRefHover(sectionArg.section, sectionArg.includeFile, document);
                }

                // A `?Name` field equate — a window control's own label. Like the two
                // above, this must run BEFORE the context builder: `?` is a non-word
                // character, so `getWordRangeAtPosition` either drops the sigil (leaving
                // a bare `Cancel`, which the ladder below then matches against any
                // unrelated EQUATE or keyword of that name) or, with the cursor on the
                // `?` itself, returns an empty range and no hover at all. Resolving from
                // the token keeps both cases on the control.
                const feqToken = TokenHelper.getFieldEquateTokenAt(preTokens, position.line, position.character);
                if (feqToken) {
                    // Deliberately terminal: a `?Name` resolving to no control in scope
                    // returns null rather than falling through. Nothing in the ladder
                    // below models controls, so any match it finds on the bare name is a
                    // coincidence rather than an answer.
                    return this.buildFieldEquateHover(feqToken, document, position);
                }
            }

            // Build hover context
            const context = await this.contextBuilder.build(document, position);
            mark('contextBuild');
            if (!context) {
                return null; // No word or in OMIT block
            }

            const { word, wordRange, line, tokens, currentScope } = context;
            trace.word = word;

            // ⚡ FAST PATH: if the cursor is on a type argument — CLASS(Type), QUEUE(Type),
            // GROUP(Type), INTERFACE(Type), or LIKE(Type) — skip all slow symbol resolution
            // and go straight to the SDI-based type lookup.
            {
                const typeArgRegex = /\b(?:CLASS|INTERFACE|QUEUE|GROUP|LIKE)\s*\(\s*([A-Za-z_]\w*)\b/gi;
                let typeArgMatch: RegExpExecArray | null;
                while ((typeArgMatch = typeArgRegex.exec(line)) !== null) {
                    if (typeArgMatch[1].toLowerCase() === word.toLowerCase()) {
                        return this.checkClassTypeHover(word, document, true);
                    }
                }
            }

            // ✅ Hover on IMPLEMENTS(InterfaceName): show interface method signatures
            const implementsHover = await this.buildImplementsHover(word, line, position, document, tokens);
            mark('implementsHover');
            if (implementsHover) return implementsHover;

            // ✅ Hover on 3-part method line (ClassName.InterfaceName.MethodName PROCEDURE)
            // When cursor is on the interface-name segment, show the INTERFACE hover
            const threePartMatch = line.match(/^([\w:]+)\.([\w:]+)\.([\w:]+)\s+(?:PROCEDURE|FUNCTION)/i);
            if (threePartMatch) {
                const [, cls, iface, meth] = threePartMatch;
                const ifaceStart = line.indexOf(iface, cls.length + 1);
                const ifaceEnd = ifaceStart + iface.length;
                if (position.character >= ifaceStart && position.character <= ifaceEnd) {
                    const ifaceToken = await this.findInterfaceToken(iface, document, tokens);
                    if (ifaceToken) return this.buildInterfaceHover(ifaceToken, iface, document);
                }
            }

            // Route through the router for keywords, procedures, methods, symbols, attributes, builtins
            const routedHover = await this.router.route(context);
            mark('router');
            if (routedHover) { return routedHover; }

            // Check for structure.field access (e.g., MyGroup.MyVar)
            const structureHover = await this.structureFieldResolver.resolveStructureAccess(word, line, position, document);
            mark('structureAccess');
            if (structureHover) { return structureHover; }

            // Check for field access after dot (e.g., self.member or variable.member)
            const fieldHover = await this.structureFieldResolver.resolveFieldAccess(word, line, position, document, this.countParametersInCall.bind(this));
            mark('fieldAccess');
            if (fieldHover) { return fieldHover; }

            // currentScope already destructured above from context
            // If cursor is on a PROCEDURE/FUNCTION declaration line, prioritize that exact
            // declaration scope for parameter hover (works even when currentScope is null
            // on declaration lines before CODE).
            const declarationScope = tokens.find(t =>
                TokenHelper.isProcedureOrFunction(t) &&
                t.line === position.line
            );
            if (declarationScope) {
                const declarationParamHover = this.variableResolver.findParameterHover(word, document, declarationScope);
                mark('declParam');
                if (declarationParamHover) return declarationParamHover;
            }

            if (!currentScope) {
                // #474: a DOTTED field reference must be answered before anything below.
                // `HoverContextBuilder` truncates the word at the dot, so hovering
                // `Customer.Name` arrives here as the bare word `Customer` — which is a
                // real global structure label, so `findGlobalVariableHover` answers with
                // the FILE and the field is never looked up. That is why a dotted field
                // described its own file instead of itself.
                const dottedFieldHover = await this.resolveDottedFieldHover(tokens, document, position);
                mark('dottedField(noScope)');
                if (dottedFieldHover) return dottedFieldHover;

                // Check for global variable (in current file or MEMBER parent)
                const globalVarHover = await this.variableResolver.findGlobalVariableHover(word, tokens, document, position.line);
                mark('globalVar(noScope)');
                if (globalVarHover) return globalVarHover;

                // Cursor may be ON the declaration line of a module/global-scope
                // structure field (e.g. a field inside a file-scope `GROUP,TYPE` in
                // an .inc) — not a bare-name reference, so findGlobalVariableHover's
                // PRE()/dot-qualifier exclusion above correctly doesn't match it.
                const structureFieldHover = this.variableResolver.findStructureFieldDeclarationHover(word, tokens, document, position.line);
                mark('structureFieldDecl(noScope)');
                if (structureFieldHover) return structureFieldHover;

                logger.info('No scope found and no global variable found - cannot provide hover');

                // #474: a PREFIXED field reference outside any PROCEDURE — a VIEW's
                // `PROJECT(CUS:Name)`, a `KEY(CUS:ID)`, anything in the data section —
                // produced no hover at all. This lookup lives on the scoped path
                // (`findInIncludesAndEquates`, near the end of this method) and this
                // branch returns before ever reaching it.
                //
                // Placed here, after the global and structure-field-declaration checks,
                // so it mirrors the scoped path's ordering: those run before it there too,
                // and a prefixed word that is genuinely a global keeps answering as one.
                const prefixedFieldHover = await this.resolvePrefixedFieldHover(word, tokens, document);
                mark('prefixedField(noScope)');
                if (prefixedFieldHover) return prefixedFieldHover;

                const classTypeHover = await this.checkClassTypeHover(word, document);
                mark('classType(noScope)');
                if (classTypeHover) return classTypeHover;

                const structTypeHover = await this.structureFieldResolver.resolveTypeNameHover(word, document);
                mark('structType(noScope)');
                if (structTypeHover) return structTypeHover;

                return null;
            }

            logger.info(`Current scope: ${currentScope.value}`);

            // First, try searching with the full word (handles labels with colons like BRW1::View:Browse)
            logger.info(`Checking if ${word} (full word) is a parameter...`);
            let parameterHover = this.variableResolver.findParameterHover(word, document, currentScope);
            mark('paramFull');
            if (parameterHover) return parameterHover;

            // If the current scope is a MethodImplementation (e.g. ThisWindow.Init inside Main),
            // also check the outer GlobalProcedure(s) for parameters — Clarion scoping allows
            // local class methods to access the enclosing procedure's parameters.
            if (currentScope.subType === TokenType.MethodImplementation) {
                const outerProcs = tokens.filter(t =>
                    TokenHelper.isProcedureOrFunction(t) && t.subType === TokenType.GlobalProcedure
                );
                for (const gp of outerProcs) {
                    const outerParamHover = this.variableResolver.findParameterHover(word, document, gp);
                    if (outerParamHover) return outerParamHover;
                }
            }

            logger.info(`Checking if ${word} (full word) is a local variable...`);
            let variableHover = await this.variableResolver.findLocalVariableHover(word, tokens, currentScope, document, word, position.line);
            mark('localVar');
            if (variableHover) return variableHover;

            logger.info(`Checking for ${word} (full word) as module-local variable...`);
            let moduleVarHover = this.variableResolver.findModuleVariableHover(word, tokens, document, position.line);
            mark('moduleVar');
            if (moduleVarHover) return moduleVarHover;

            logger.info(`${word} not found locally - checking MEMBER parent file`);
            
            // 🔗 Check if MEMBER file exists
            const mapTokens = this.tokenCache.getTokens(document);
            const memberToken = TokenHelper.findMemberHeaderToken(mapTokens);
            
            if (memberToken && memberToken.referencedFile) {
                logger.info(`Found MEMBER reference to: ${memberToken.referencedFile}`);
                
                const currentFilePath = decodeURIComponent(document.uri.replace('file:///', ''));
                const currentFileDir = path.dirname(currentFilePath);
                // #452 — `MEMBER('Parent')` is legal without the extension. Resolving the
                // raw target produced a path that does not exist, the parent was never
                // loaded, and hover fell through to the generic symbol path — so a CALL
                // SITE rendered the "Global procedure" card with only the MAP declaration
                // link, and never offered the implementation. The declaration still
                // resolved because a different path already normalises, which is what made
                // this look unrelated to the extension-less work in #447/#449/#450.
                const resolvedPath = path.resolve(
                    currentFileDir, TokenHelper.normalizeMemberFilename(memberToken.referencedFile));
                logger.info(`Resolved MEMBER path: ${resolvedPath}`);
                
                const cached = await this.crossFileCache.getOrLoadDocument(resolvedPath);
                mark('memberParentLoad');
                if (cached) {
                    const { document: parentDoc, tokens: parentTokens } = cached;
                    logger.info(`Loaded parent file, found ${parentTokens.length} tokens`);

                    // First check if this is a procedure in the MAP (before treating as variable)
                    const localScope = getLocalMapScope(document.uri);
                    const mapDecl = this.mapResolver.findMapDeclaration(word, parentTokens, parentDoc, line, localScope?.containingProcedure);
                    mark('parentMapDecl');

                    if (mapDecl) {
                        logger.info(`✅ Found MAP declaration for ${word} in parent - treating as procedure call`);

                        const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                        const procImpl = await this.mapResolver.findProcedureImplementation(
                            word,
                            parentTokens,
                            parentDoc,
                            mapPosition,
                            line
                        );
                        mark('parentProcImpl');

                        return this.formatter.formatProcedure(word, mapDecl, procImpl, document, position);
                    }

                    // Not a procedure — check for global variable in parent's own scope only.
                    // Use full word (e.g., Access:IBSDataSets) — colon is part of the label name.
                    // shallowOnly=true: skips recursive include chain, handled by findInIncludesAndEquates below.
                    const globalVarHover = await this.variableResolver.findGlobalVariableHover(word, parentTokens, parentDoc, position.line, true);
                    mark('parentGlobalVar');
                    if (globalVarHover) return globalVarHover;
                }
            }

            logger.info(`❌ ${word} not found in MEMBER parent`);

            // Check INCLUDE files of the current file and equates.clw
            const includesHover = await this.variableResolver.findInIncludesAndEquates(word, tokens, document);
            mark('includesAndEquates');
            if (includesHover) return includesHover;

            // 🔍 Last resort: Check if this word is a CLASS type reference
            logger.debug(`Falling through to checkClassTypeHover for "${word}"`);
            const classTypeHover = await this.checkClassTypeHover(word, document);
            mark('classType');
            if (classTypeHover) {
                logger.info(`✅ HOVER-RETURN: Found CLASS type hover for ${word}`);
                return classTypeHover;
            }

            // 🔍 Check if this word is a structure type (QUEUE/GROUP) declared in an INCLUDE file
            // Handles hovering over type names in LIKE(TypeName), QUEUE(TypeName), etc.
            const structTypeHover = await this.structureFieldResolver.resolveTypeNameHover(word, document);
            mark('structType');
            if (structTypeHover) {
                logger.info(`✅ HOVER-RETURN: Found structure type hover for ${word}`);
                return structTypeHover;
            }
            
            logger.info(`❌ HOVER-RETURN: No hover information found for ${word}`);
            return null;
        } catch (error) {
            logger.error(`Error providing hover: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Finds local variable information using the document symbol tree
     * This is more reliable than token-based search as it uses the outline provider's hierarchy
     */
    private findLocalVariableInfo(word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string): { type: string; line: number } | null {
        logger.info(`findLocalVariableInfo called for word: ${word}, scope: ${currentScope.value} at line ${currentScope.line}, subType: ${currentScope.subType}`);
        
        // Try the document symbol approach - more reliable
        const symbolProvider = new ClarionDocumentSymbolProvider();
        const symbols = symbolProvider.provideDocumentSymbols(tokens, document.uri);
        
        // Find the procedure symbol that contains the current line
        const procedureSymbol = this.findProcedureContainingLine(symbols, currentScope.line);
        if (procedureSymbol) {
            logger.info(`Found procedure symbol: ${procedureSymbol.name}`);
            logger.info(`Procedure has ${procedureSymbol.children?.length || 0} children`);
            
            // Debug: Log first 10 children
            if (procedureSymbol.children) {
                procedureSymbol.children.slice(0, 10).forEach((child: any) => {
                    logger.info(`  Child: name="${child.name}", kind=${child.kind}, detail="${child.detail}"`);
                });
            }
            
            // Search for the variable in the procedure's children
            // Use originalWord if available (includes prefix like LOC:MyVar), otherwise use word
            const searchText = originalWord || word;
            logger.info(`PREFIX-DEBUG: Searching with searchText="${searchText}", originalWord="${originalWord}", word="${word}"`);
            const varSymbol = this.findVariableInSymbol(procedureSymbol, searchText);
            if (varSymbol) {
                logger.info(`Found variable in symbol tree: ${varSymbol.name}, detail: ${varSymbol.detail}, kind: ${varSymbol.kind}`);
                
                // Extract type from _clarionType if available, otherwise parse from detail
                let type = (varSymbol as any)._clarionType || varSymbol.detail || 'Unknown';
                
                return {
                    type: type,
                    line: varSymbol.range.start.line
                };
            }
        }
        
        // Fallback to old token-based logic
        logger.info(`PREFIX-DEBUG: Symbol tree search failed, falling back to token search for "${word}"`);
        return this.findLocalVariableInfoLegacy(word, tokens, currentScope, document);
    }
    
    /**
     * Find procedure symbol that contains the given line
     */
    private findProcedureContainingLine(symbols: any[], line: number): any | null {
        for (const symbol of symbols) {
            if (symbol.range.start.line <= line && symbol.range.end.line >= line) {
                // Check if this is a procedure
                if (symbol.kind === 12) { // SymbolKind.Function
                    return symbol;
                }
                // Recursively search children
                if (symbol.children) {
                    const result = this.findProcedureContainingLine(symbol.children, line);
                    if (result) return result;
                }
            }
        }
        return null;
    }
    
    /**
     * Find variable in symbol's children by name (handles prefixed labels)
     */
    private findVariableInSymbol(symbol: any, fieldName: string): any | null {
        if (!symbol.children) return null;
        
        logger.info(`Searching for field "${fieldName}" in symbol with ${symbol.children.length} children`);
        
        for (const child of symbol.children) {
            // Check if this is a GROUP/QUEUE/FILE structure symbol (SymbolKind.Struct = 23)
            if (child.kind === 23) {
                // Extract group name from pattern like "GROUP (MyGroup)" or "QUEUE (MyQueue)"
                const groupNameMatch = child.name.match(/\(([^)]+)\)/);
                if (groupNameMatch) {
                    const groupName = groupNameMatch[1];
                    if (groupName.toLowerCase() === fieldName.toLowerCase()) {
                        logger.info(`✅ Matched GROUP/QUEUE/FILE structure: ${groupName}`);
                        return child;
                    }
                }
                
                // Also search within the structure's children
                if (child.children) {
                    const result = this.findVariableInSymbol(child, fieldName);
                    if (result) return result;
                }
            }
            // Check if this is a variable symbol (SymbolKind.Variable = 13)
            else if (child.kind === 13) {
                // Use _clarionVarName if available (more reliable), otherwise extract from name
                const varName = (child as any)._clarionVarName || child.name.match(/^([^\s]+)/)?.[1] || child.name;
                
                logger.info(`  PREFIX-CHECK: Checking child: varName="${varName}", _isPartOfStructure=${!!(child as any)._isPartOfStructure}, _possibleReferences=${(child as any)._possibleReferences ? JSON.stringify((child as any)._possibleReferences) : 'undefined'}`);
                
                // CRITICAL FIX: Check against _possibleReferences for structure fields
                // Structure fields can ONLY be accessed via their prefixed forms (PREFIX:Field)
                // or dot notation (Structure.Field), NEVER by unprefixed name alone
                if ((child as any)._isPartOfStructure && (child as any)._possibleReferences) {
                    const possibleRefs = (child as any)._possibleReferences as string[];
                    logger.info(`  PREFIX-CHECK: Structure field "${varName}" has possible references: ${possibleRefs.join(', ')}`);
                    
                    // Check if fieldName matches any of the valid prefixed/dotted references
                    const matchesReference = possibleRefs.some(ref => 
                        ref.toUpperCase() === fieldName.toUpperCase()
                    );
                    
                    // Also check if fieldName itself is the unprefixed varName - if so, REJECT it
                    const isUnprefixedMatch = varName.toUpperCase() === fieldName.toUpperCase();
                    
                    if (matchesReference && !isUnprefixedMatch) {
                        logger.info(`✅ PREFIX-MATCH: Matched structure field "${fieldName}" via valid reference`);
                        return child;
                    } else if (isUnprefixedMatch) {
                        logger.info(`❌ PREFIX-REJECT: "${fieldName}" cannot access structure field "${varName}" - must use ${possibleRefs.join(' or ')}`);
                        continue;
                    } else {
                        logger.info(`❌ PREFIX-SKIP: "${fieldName}" does not match any valid reference for structure field "${varName}"`);
                        continue;
                    }
                }
                // For regular variables (not structure fields), match exact name
                else if (varName.toLowerCase() === fieldName.toLowerCase()) {
                    logger.info(`✅ Matched regular variable: child.name="${child.name}", extracted="${varName}", searching for="${fieldName}"`);
                    return child;
                }
                
                // Also search nested children if this is a structure variable
                if (child.children) {
                    const result = this.findVariableInSymbol(child, fieldName);
                    if (result) return result;
                }
            }
            // For other kinds, still search children
            else if (child.children) {
                const result = this.findVariableInSymbol(child, fieldName);
                if (result) return result;
            }
        }
        
        logger.info(`❌ No match found for "${fieldName}"`);
        return null;
    }
    
    /**
     * Legacy token-based variable search (fallback)
     */
    private findLocalVariableInfoLegacy(word: string, tokens: Token[], currentScope: Token, document: TextDocument): { type: string; line: number } | null {
        logger.info(`PREFIX-LEGACY-START: Entering legacy search for "${word}", currentScope.subType=${currentScope.subType}`);
        
        // For PROCEDURE/METHOD: Search the DATA section (everything before CODE)
        if (currentScope.subType === TokenType.Procedure || 
            currentScope.subType === TokenType.MethodImplementation ||
            currentScope.subType === TokenType.MethodDeclaration) {
            
            logger.info(`Entering procedure DATA section search (subType matched: ${currentScope.subType})`);
            
            const codeMarker = currentScope.executionMarker;
            let dataEnd = codeMarker ? codeMarker.line : currentScope.finishesAt;
            
            // If we don't have a CODE marker or finishesAt, find the next procedure
            if (dataEnd === undefined) {
                const nextProcedure = tokens.find(t =>
                    (t.subType === TokenType.Procedure ||
                     t.subType === TokenType.MethodImplementation ||
                     t.subType === TokenType.MethodDeclaration) &&
                    t.line > currentScope.line
                );
                
                if (nextProcedure) {
                    dataEnd = nextProcedure.line;
                    logger.info(`Using next procedure at line ${dataEnd} as DATA section boundary`);
                } else {
                    dataEnd = tokens[tokens.length - 1].line;
                    logger.info(`No next procedure found, using end of file at line ${dataEnd}`);
                }
            }
            
            logger.info(`Searching procedure DATA section from line ${currentScope.line} to ${dataEnd}`);
            
            // Debug: Show all tokens with matching name in the range
            const allMatchingInRange = tokens.filter(t => 
                t.value.toLowerCase() === word.toLowerCase() &&
                t.line > currentScope.line &&
                (dataEnd === undefined || t.line < dataEnd)
            );
            logger.info(`Debug: Found ${allMatchingInRange.length} tokens matching "${word}" in range ${currentScope.line}-${dataEnd}`);
            allMatchingInRange.forEach(t => {
                logger.info(`  -> Line ${t.line}, Type: ${t.type}, Start: ${t.start}, Value: "${t.value}"`);
            });
            
            // Look for variables in DATA section, handling prefixed labels
            const variableTokens = tokens.filter(token => {
                // Match by name - either exact match or as part of prefixed label
                const exactMatch = token.value.toLowerCase() === word.toLowerCase();
                const prefixedMatch = token.type === TokenType.Label && 
                                     token.value.includes(':') &&
                                     token.value.toLowerCase().endsWith(':' + word.toLowerCase());
                
                if (!exactMatch && !prefixedMatch) {
                    return false;
                }
                
                if (token.type !== TokenType.Variable && token.type !== TokenType.Label) {
                    return false;
                }
                
                if (token.line <= currentScope.line || (dataEnd !== undefined && token.line >= dataEnd)) {
                    return false;
                }
                
                // For exact matches, handle prefixed variables (token not at position 0)
                if (exactMatch && token.start > 0) {
                    const labelAtStart = tokens.find(t =>
                        t.line === token.line &&
                        t.start === 0 &&
                        t.type === TokenType.Label
                    );
                    
                    if (labelAtStart && labelAtStart.value.includes(':')) {
                        logger.info(`Found prefixed label in hover: ${labelAtStart.value} with field: ${token.value} at line ${token.line}`);
                        return true;
                    }
                    
                    return false;
                }
                
                // Prefixed label match or token at position 0 is valid
                if (prefixedMatch) {
                    logger.info(`Found prefixed label by suffix match: ${token.value} at line ${token.line}`);
                }
                return true;
            });

            logger.info(`Found ${variableTokens.length} variable tokens for ${word} in procedure DATA section`);
            
            if (variableTokens.length > 0) {
                const varToken = variableTokens[0];
                logger.info(`PREFIX-LEGACY: Found token - value="${varToken.value}", isStructureField=${!!varToken.isStructureField}, structurePrefix="${varToken.structurePrefix}"`);
                
                // CRITICAL FIX: Check if this is a structure field that requires a prefix
                // Skip structure fields when searching for bare field names
                if (varToken.isStructureField || varToken.structurePrefix) {
                    logger.info(`PREFIX-LEGACY: Token "${varToken.value}" is a structure field with prefix "${varToken.structurePrefix}" - skipping for bare field name search`);
                    // Don't return structure fields for bare name searches
                    // They should only be accessible via prefix (LOC:Field) or dot notation (Group.Field)
                    return null;
                }
                
                // Get the source line to extract type information
                const content = document.getText();
                const lines = content.split('\n');
                const varLine = lines[varToken.line];
                
                if (varLine) {
                    // Extract type from the line - handle both simple and prefixed labels
                    const typeMatch = varLine.match(/\s+(&?[A-Z][A-Za-z0-9_]*(?:\([^)]*\))?)/i);
                    if (typeMatch) {
                        return {
                            type: typeMatch[1].trim(),
                            line: varToken.line
                        };
                    }
                }
            }
        }
        
        // Fallback to old logic for routines or if procedure search failed
        // Find variable tokens at column 0 within the current scope
        const variableTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
                token.type === TokenType.ReferenceVariable ||
                token.type === TokenType.ImplicitVariable ||
                token.subType === TokenType.Variable ||
                token.subType === TokenType.ReferenceVariable) &&
            token.value.toLowerCase() === word.toLowerCase() &&
            token.start === 0 &&
            token.line >= currentScope.line &&
            (currentScope.finishesAt === undefined || token.line <= currentScope.finishesAt)
        );

        logger.info(`Found ${variableTokens.length} variable tokens for ${word}`);
        
        if (variableTokens.length === 0) {
            // Debug: Check what tokens exist for this word
            const allMatchingTokens = TokenHelper.findTokens(tokens, { value: word });
            logger.info(`Debug: Found ${allMatchingTokens.length} total tokens matching "${word}"`);
            allMatchingTokens.forEach(t => {
                logger.info(`  -> Line ${t.line}, Type: ${t.type}, SubType: ${t.subType}, Start: ${t.start}, Value: "${t.value}"`);
            });
            return null;
        }

        const varToken = variableTokens[0];
        logger.info(`PREFIX-LEGACY-OTHER: Found token - value="${varToken.value}", line=${varToken.line}, type=${varToken.type}`);
        logger.info(`PREFIX-LEGACY-OTHER: Token properties - isStructureField=${varToken.isStructureField}, structurePrefix=${varToken.structurePrefix}`);
        logger.info(`PREFIX-LEGACY-OTHER: Token object keys: ${Object.keys(varToken).join(', ')}`);
        
        // CRITICAL FIX: Check if this is a structure field that requires a prefix
        // Skip structure fields when searching for bare field names
        if (varToken.isStructureField || varToken.structurePrefix) {
            logger.info(`PREFIX-LEGACY-OTHER: Token "${varToken.value}" is a structure field with prefix "${varToken.structurePrefix}" - skipping for bare field name search`);
            return null;
        }
        
        // Get the source line to extract type information
        const content = document.getText();
        const lines = content.split('\n');
        const sourceLine = lines[varToken.line];
        
        // Parse the variable declaration: varName   type[,attributes]
        // Examples: "AllocLen  long,auto" or "oldString   &string"
        const typeMatch = sourceLine.match(/^[A-Za-z_][A-Za-z0-9_]*\s+(&?[A-Za-z_][A-Za-z0-9_]*(?:,[A-Za-z_][A-Za-z0-9_]*)*)/i);
        if (typeMatch) {
            return { type: typeMatch[1], line: varToken.line };
        }
        
        // Fallback: Try to find the type declaration on the same line using tokens
        const lineTokens = TokenHelper.findTokens(tokens, { line: varToken.line });
        const typeTokens = lineTokens.filter(t =>
            t.type === TokenType.Type || 
            t.type === TokenType.Structure ||
            t.type === TokenType.ReferenceVariable ||
            t.value.toUpperCase() === 'LONG' ||
            t.value.toUpperCase() === 'STRING' ||
            t.value.toUpperCase() === 'SHORT' ||
            t.value.toUpperCase() === 'BYTE'
        );

        const type = typeTokens.length > 0 ? typeTokens[0].value : 'Unknown';

        return { type, line: varToken.line };
    }

    /**
     * Counts parameters in a function call
     * Returns null if unable to parse
     * Counts omitted parameters (e.g., AT(,,435,300) = 4 parameters)
     */
    private countParametersInCall(line: string, functionName: string): number | null {
        // Find the function call in the line
        const funcPattern = new RegExp(`\\b${functionName}\\s*\\(`, 'i');
        const match = line.match(funcPattern);
        if (!match || match.index === undefined) {
            return null;
        }

        const startPos = match.index + match[0].length;
        let depth = 1;
        let paramCount = 1; // Start at 1 - if there's any content, we have at least 1 parameter
        let isEmpty = true; // Track if we've seen any content at all

        for (let i = startPos; i < line.length; i++) {
            const char = line[i];

            if (char === '(') {
                depth++;
                isEmpty = false;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    // Found closing paren
                    // If completely empty parentheses, return 0
                    if (isEmpty) {
                        return 0;
                    }
                    return paramCount;
                }
                isEmpty = false;
            } else if (char === ',' && depth === 1) {
                // Each comma at depth 1 means another parameter
                paramCount++;
            } else if (char.trim() !== '') {
                // Any non-whitespace character means we have content
                isEmpty = false;
            }
        }

        // Unclosed parentheses - return what we have so far
        // If we saw any content, return the count
        return isEmpty ? null : paramCount;
    }

    /**
     * Counts parameters in a function/attribute call
     * Returns null if unable to parse, 0 if empty parentheses
     */
    private countFunctionParameters(line: string, word: string, wordRange: Range, document: TextDocument): number | null {
        // Check if there's an opening paren after the word
        const textAfterWord = document.getText({
            start: { line: wordRange.start.line, character: wordRange.end.character },
            end: { line: wordRange.start.line, character: Math.min(wordRange.end.character + 10, line.length) }
        }).trimStart();
        
        if (textAfterWord.startsWith('(')) {
            // There's a paren, count the actual parameters
            return this.countParametersInCall(line, word);
        } else {
            // No paren after word - assume no parameters
            return 0;
        }
    }

    /**
     * Builds markdown lines for scope information
     */

    /**
     * Resolve a qualified field reference — `CUS:Name` or `Orders.ID` — for a cursor
     * that has no enclosing PROCEDURE scope (#474).
     *
     * Both forms name a field of a declared structure, but by different keys, so they
     * need different lookups:
     *   `CUS:Name`   PRE() prefix + field. Delegates to the same
     *                `findInIncludesAndEquates` the scoped path uses, so the rendered
     *                hover is identical wherever the reference appears.
     *   `Orders.ID`  structure LABEL + field, which no PRE() lookup can match — the
     *                prefix here is `ORD`, not `Orders`.
     *
     * Deliberately narrow: only qualified references are handled. An unqualified word in
     * the data section keeps its existing behaviour, so this cannot introduce hovers where
     * there were none before except for the forms #474 is about.
     *
     * The dotted half reads the TOKEN rather than `word`. `HoverContextBuilder` truncates
     * at the dot — hovering `Customer.Name` yields the word `Customer` — which is precisely
     * why that case answered with the FILE. Widening word extraction is not an option: the
     * dot is also the chained-access separator (`SELF.records.alpha`), and the chained
     * resolver depends on the current split. The tokenizer already emits the whole
     * reference as one `StructureField` token, so the token is the reliable source here.
     */
    private async resolveDottedFieldHover(
        tokens: Token[],
        document: TextDocument,
        position: Position
    ): Promise<Hover | null> {
        const dottedToken = tokens.find(t =>
            t.type === TokenType.StructureField &&
            t.line === position.line &&
            position.character >= t.start &&
            position.character <= t.start + t.value.length &&
            t.value.includes('.')
        );
        if (!dottedToken) return null;

        const dot = dottedToken.value.indexOf('.');
        const typeName = dottedToken.value.slice(0, dot);
        const fieldName = dottedToken.value.slice(dot + 1);
        // A single qualifier is a field reference. `A.B.C` is a chained member
        // access and belongs to the chained resolver, not here.
        if (!typeName || !fieldName || fieldName.includes('.')) return null;

        return this.structureFieldResolver.resolveStructureTypeFieldHover(typeName, fieldName, document);
    }

    /**
     * The `PRE:Field` half of #474 — see `resolveDottedFieldHover` for the dotted half.
     *
     * Delegates to the same `findInIncludesAndEquates` the scoped path uses, so the hover
     * a prefixed field renders is identical wherever the reference appears. Narrow by
     * design: an unqualified word is left alone, so this cannot manufacture hovers beyond
     * the form #474 is about.
     */
    private async resolvePrefixedFieldHover(
        word: string,
        tokens: Token[],
        document: TextDocument
    ): Promise<Hover | null> {
        if (word.lastIndexOf(':') <= 0) return null;
        return this.variableResolver.findInIncludesAndEquates(word, tokens, document);
    }

    /**
     * Check if a word is a CLASS type and provide hover with definition info
     * @param word The word to check
     * @param document The document
     * @returns Hover with class definition info, or null if not a class
     */
    private async checkClassTypeHover(word: string, document: TextDocument, skipIncludeCheck = false): Promise<Hover | null> {
        let timeoutId: NodeJS.Timeout | undefined;
        const timeout = new Promise<null>(resolve => {
            timeoutId = setTimeout(() => {
                logger.test(`⏱️ [HOVER] checkClassTypeHover timed out for "${word}" — class index build too slow`);
                resolve(null);
            }, 10000);
        });
        try {
            return await Promise.race([this._checkClassTypeHoverInternal(word, document, skipIncludeCheck), timeout]);
        } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
    }

    private async _checkClassTypeHoverInternal(word: string, document: TextDocument, skipIncludeCheck = false): Promise<Hover | null> {
        try {
            const info = await this.symbolFinder.findIndexedTypeDeclaration(word, document);
            if (!info) {
                return null;
            }

            const fileName = path.basename(info.filePath);

            // Hover-only guard: verify the type's file is included in current scope.
            // Skipped for fast-path calls where the word appears as a type argument (CLASS(word),
            // QUEUE(word), etc.) — the usage itself proves the type is accessible in this file.
            if (!skipIncludeCheck) {
                const isIncluded = await this.includeVerifier.isClassIncluded(fileName, document);
                if (!isIncluded) {
                    return null;
                }
            }

            const typeLabel = info.structureType === 'INTERFACE'
                ? 'INTERFACE'
                : info.isType ? `${info.structureType}, TYPE` : info.structureType;
            const parentLine = info.parentName ? `\n⬆️ Extends: \`${info.parentName}\`` : '';
            const hoverMarkdown = [
                `**${info.name}** — ${typeLabel}`,
                ``,
                `📦 Defined in ${this.formatter.locationLink(info.filePath, info.line)}${parentLine}`
            ].join('\n');

            return {
                contents: { kind: 'markdown', value: hoverMarkdown }
            };
        } catch (error) {
            logger.error(`Error checking class type hover: ${error instanceof Error ? error.message : String(error)}`);
        }

        return null;
    }

    /**
     * Invalidate cache for a specific file
     */
    public invalidateCache(filePath: string): void {
        this.crossFileCache.invalidate(filePath);
    }

    /**
     * Clear all cache
     */
    public clearCache(): void {
        this.crossFileCache.clear();
    }

    /**
     * #265 — hover card for a file-ref filename (INCLUDE / MODULE / MEMBER /
     * LINK argument): statement keyword + filename + the redirection-resolved
     * absolute path, or a not-found note. Shares FileDefinitionResolver with
     * F12 so both surfaces always agree on which physical file wins.
     */
    private async buildFileRefHover(fileRefStr: Token, tokens: Token[], document: TextDocument): Promise<Hover | null> {
        const filename = fileRefStr.value.replace(/^['"]|['"]$/g, '');
        if (!filename) return null;

        // The statement keyword: the file-ref-carrying token on the same line.
        const refToken = tokens.find(t =>
            t.line === fileRefStr.line && t.referencedFile !== undefined && t.referencedFile.length > 0);
        const keyword = refToken ? refToken.value.toUpperCase() : 'INCLUDE';

        const loc = await this.fileResolver.findFileDefinition(filename, document.uri);
        const lines: string[] = [`**${keyword}** \`${filename}\``];
        if (loc) {
            const fsPath = decodeURIComponent(loc.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            lines.push(`Resolves to: \`${fsPath}\``);
        } else {
            lines.push('⚠️ File not found via project paths or redirection');
        }
        return {
            contents: { kind: 'markdown', value: lines.join('\n\n') },
            range: Range.create(
                fileRefStr.line, fileRefStr.start,
                fileRefStr.line, fileRefStr.start + fileRefStr.value.length)
        };
    }

    /**
     * #343 — hover card for the SECTION argument of INCLUDE('file','section'):
     * the resolved file + the SECTION line, via the same SectionLocator F12
     * uses so the surfaces agree.
     */
    private buildSectionRefHover(sectionStr: Token, includeFile: string, document: TextDocument): Hover | null {
        const sectionName = sectionStr.value.replace(/^'|'$/g, '').replace(/''/g, "'");
        if (!sectionName) return null;

        const loc = findSectionLocation(includeFile, sectionName, document.uri);
        const lines: string[] = [`**SECTION** \`'${sectionName}'\` — \`${includeFile}\``];
        if (loc) {
            lines.push(`Resolves to: ${this.formatter.locationLink(loc.path, loc.line)}`);
        } else {
            lines.push(`⚠️ Section not found in the resolved include`);
        }
        return {
            contents: { kind: 'markdown', value: lines.join('\n\n') },
            range: Range.create(
                sectionStr.line, sectionStr.start,
                sectionStr.line, sectionStr.start + sectionStr.value.length)
        };
    }

    /**
     * Hover card for a `?Name` field equate: the control's own type keyword, the
     * structure that owns it, its declaration line, and a link to it.
     *
     * Scoped to the WINDOW/APPLICATION/REPORT structures declared in the CURRENT
     * procedure, the same scope `?` completion offers — a field equate belongs to
     * the procedure whose window declares it, so a same-named control elsewhere in
     * the file is a different control, not this one. Returns null when the name
     * resolves to nothing in that scope; that reference doesn't compile, and
     * pointing at some other procedure's control instead would be a guess.
     */
    private buildFieldEquateHover(feqToken: Token, document: TextDocument, position: Position): Hover | null {
        const structure = this.tokenCache.getStructure(document);

        // 1. The usual case: a window declared in the enclosing procedure. The same
        //    `?Name` — `?Cancel` above all — recurs across unrelated windows, so the
        //    procedure's own window is the only reading that is certain.
        for (const proc of this.enclosingProcedures(structure, position.line)) {
            for (const win of structure.getContainerStructuresInProcedure(proc)) {
                const hit = structure.findControl(feqToken.value, win);
                if (hit) {
                    return this.renderFieldEquateCard(feqToken, hit, win, document, structure);
                }
            }
        }

        // 2. Not the enclosing procedure's — but a window can be declared in a class
        //    or in another source entirely, so absence here is not absence. A
        //    declaration found elsewhere in THIS file is offered as a candidate and
        //    labelled with its owner, never as the current procedure's control.
        const declarations = structure.findControlDeclarations(feqToken.value);
        if (declarations.length === 1) {
            return this.renderFieldEquateCard(feqToken, declarations[0].control, null, document, structure);
        }
        if (declarations.length > 1) {
            // The same name across several windows is ordinary Clarion. Listing the
            // candidates is the honest answer; picking one would be a coin toss.
            const lines: string[] = [
                `**${feqToken.value}** — \`FIELD EQUATE\``,
                `Declared in ${declarations.length} windows in this file — none in this procedure:`
            ];
            for (const { control } of declarations) {
                const { controlType } = structure.getControlContextAt(control.line, control.start);
                const owner = this.enclosingScopeName(structure, control.line);
                const what = [controlType, owner ? `in \`${owner}\`` : null].filter(Boolean).join(' ');
                lines.push(`- ${what ? what + ' — ' : ''}${this.formatter.locationLink(document.uri, control.line)}`);
            }
            return {
                contents: { kind: 'markdown', value: lines.join('\n\n') },
                range: Range.create(
                    feqToken.line, feqToken.start,
                    feqToken.line, feqToken.start + feqToken.value.length)
            };
        }

        // 3. Declared in another source, or not at all. Either way this file cannot
        //    say which — and no card beats a confident wrong one.
        return null;
    }

    /**
     * Procedure/method tokens whose windows a `?Name` on `line` could refer to,
     * innermost first.
     *
     * The scope chain matters because of the ABC shape: a generated procedure holds
     * its WINDOW in local data and its event handling in the methods of a locally
     * declared `WindowManager` subclass. A `?Name` inside one of those methods is
     * outside the method's own line range, so the method alone never resolves it —
     * `ScopeResolver` links the method to the procedure whose local data declared
     * its CLASS, and that is the procedure holding the window.
     */
    private enclosingProcedures(structure: ReturnType<TokenCache['getStructure']>, line: number): Token[] {
        const out: Token[] = [];
        const seen = new Set<Token>();
        const push = (t: Token | null | undefined) => {
            if (t && !seen.has(t)) { seen.add(t); out.push(t); }
        };

        let node: ScopeNode | null;
        try {
            node = structure.getScopeResolver().resolveScopeAt(line);
        } catch {
            return out;
        }
        for (let n: ScopeNode | null = node; n; n = n.parent) {
            if (n.kind === ScopeKind.Procedure || n.kind === ScopeKind.Method) {
                push(n.token);
            }
            push(n.declaringProcedure?.token);
        }
        return out;
    }

    /**
     * The card itself. `container` is the owning WINDOW/APPLICATION/REPORT when the
     * control was resolved inside the current procedure; null when it was found
     * elsewhere in the file, which the card then says outright.
     */
    private renderFieldEquateCard(
        feqToken: Token,
        declToken: Token,
        container: Token | null,
        document: TextDocument,
        structure: ReturnType<TokenCache['getStructure']>
    ): Hover {
        // The control keyword (BUTTON/ENTRY/LIST/…) is read at the DECLARATION's
        // position, not the cursor's — the cursor is usually on a reference, where
        // there is no control keyword to find.
        const { controlType } = structure.getControlContextAt(declToken.line, declToken.start);

        const lines: string[] = [
            controlType ? `**${declToken.value}** — \`${controlType}\`` : `**${declToken.value}**`
        ];

        if (container) {
            lines.push(`🔷 ${container.value.toUpperCase()} control`);
        } else {
            const owner = this.enclosingScopeName(structure, declToken.line);
            lines.push(owner
                ? `🔷 Control declared in \`${owner}\`, not in this procedure`
                : '🔷 Control declared elsewhere in this file, not in this procedure');
        }

        const declLine = document.getText({
            start: { line: declToken.line, character: 0 },
            end: { line: declToken.line, character: Number.MAX_VALUE }
        }).trim();
        if (declLine) {
            lines.push('```clarion\n' + declLine + '\n```');
        }
        lines.push(this.formatter.locationLink(document.uri, declToken.line));

        return {
            contents: { kind: 'markdown', value: lines.join('\n\n') },
            range: Range.create(
                feqToken.line, feqToken.start,
                feqToken.line, feqToken.start + feqToken.value.length)
        };
    }

    /** Name of the procedure/method enclosing `line`, for labelling a control found outside the current one. */
    private enclosingScopeName(structure: ReturnType<TokenCache['getStructure']>, line: number): string | null {
        try {
            // A scope node's token is the PROCEDURE keyword; `label` carries the name
            // (dotted, for a method implementation) — same accessor CodeLens uses.
            const t = structure.getScopeResolver().resolveScopeAt(line).token;
            return t ? (t.label ?? t.value) : null;
        } catch {
            return null;
        }
    }

    /**
     * Hover on IMPLEMENTS(InterfaceName) — show the interface's method signatures.
     * Returns null if the cursor isn't on an interface name inside IMPLEMENTS().
     */
    private async buildImplementsHover(
        word: string,
        line: string,
        position: Position,
        document: TextDocument,
        tokens: Token[]
    ): Promise<Hover | null> {
        // Check if word appears as the argument of IMPLEMENTS(...)
        const implementsRe = /\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi;
        let m: RegExpExecArray | null;
        while ((m = implementsRe.exec(line)) !== null) {
            const ifaceName = m[1];
            if (ifaceName.toLowerCase() !== word.toLowerCase()) continue;
            const nameStart = m.index + m[0].indexOf(ifaceName);
            const nameEnd = nameStart + ifaceName.length;
            if (position.character < nameStart || position.character > nameEnd) continue;

            const ifaceToken = await this.findInterfaceToken(ifaceName, document, tokens);
            if (!ifaceToken) return null;

            return this.buildInterfaceHover(ifaceToken, ifaceName, document);
        }

        // Also hover directly on an INTERFACE structure's label token (col 0)
        const ifaceStruct = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.line === position.line
        );
        if (ifaceStruct && ifaceStruct.label?.toLowerCase() === word.toLowerCase()) {
            return this.buildInterfaceHover(ifaceStruct, word, document);
        }

        return null;
    }

    /** Find an INTERFACE token by name: current file → INCLUDE chain → index → equates */
    private async findInterfaceToken(ifaceName: string, document: TextDocument, tokens: Token[]): Promise<Token | null> {
        // 1. Current document
        const local = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.label?.toLowerCase() === ifaceName.toLowerCase()
        );
        if (local) return local;

        // 2. Walk INCLUDE files reachable from this document
        const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const incToken = await this.findInterfaceTokenInIncludes(ifaceName, fromPath, new Set());
        if (incToken) return incToken;

        // 3. StructureDeclarationIndexer — covers libsrc/.inc files not in the INCLUDE chain
        const sdi = StructureDeclarationIndexer.getInstance();
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const sm = SolutionManager.getInstance();
        const project = sm?.findProjectForFile(docPath);
        if (project?.path) {
            await sdi.getOrBuildIndex(project.path);
            const infos = sdi.find(ifaceName, project.path);
            const ifaceInfo = infos.find(d => d.structureType === 'INTERFACE');
            if (ifaceInfo) {
                const uri = `file:///${ifaceInfo.filePath.replace(/\\/g, '/')}`;
                let incTokens = this.tokenCache.getTokensByUri(uri);
                if (!incTokens) {
                    try {
                        const incContent = fs.readFileSync(ifaceInfo.filePath, 'utf8');
                        const incDoc = TextDocument.create(uri, 'clarion', 1, incContent);
                        incTokens = this.tokenCache.getTokens(incDoc);
                    } catch { /* fall through */ }
                }
                const iface = incTokens?.find(t =>
                    t.type === TokenType.Structure &&
                    t.subType === TokenType.Interface &&
                    t.label?.toLowerCase() === ifaceName.toLowerCase()
                );
                if (iface) return iface;
            }
        }

        // 4. equates.clw
        const equatesTokens = sm?.getEquatesTokens();
        if (equatesTokens) {
            const eq = equatesTokens.find(t =>
                t.type === TokenType.Structure &&
                t.subType === TokenType.Interface &&
                t.label?.toLowerCase() === ifaceName.toLowerCase()
            );
            if (eq) return eq;
        }
        return null;
    }

    /** Walk INCLUDE files from fromPath and search for an INTERFACE token with matching name */
    private async findInterfaceTokenInIncludes(ifaceName: string, fromPath: string, visited: Set<string>): Promise<Token | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const includeFile = match[1];
            let resolvedPath: string | null = null;

            // #328: owner-project-first redirection
            resolvedPath = resolveViaProjectRedirection(includeFile, fromPath);
            if (!resolvedPath) {
                const candidate = path.join(path.dirname(fromPath), includeFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }
            if (!resolvedPath) continue;

            const uri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
            let incTokens = this.tokenCache.getTokensByUri(uri);
            if (!incTokens) {
                try {
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    const incDoc = TextDocument.create(uri, 'clarion', 1, incContent);
                    incTokens = this.tokenCache.getTokens(incDoc);
                } catch { continue; }
            }

            const iface = incTokens.find(t =>
                t.type === TokenType.Structure &&
                t.subType === TokenType.Interface &&
                t.label?.toLowerCase() === ifaceName.toLowerCase()
            );
            if (iface) return iface;

            const nested = await this.findInterfaceTokenInIncludes(ifaceName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }

    /**
     * Build a Hover card for an INTERFACE, listing its method prototypes and
     * — when `document` is supplied — a footer naming each CLASS in the same
     * file that declares `IMPLEMENTS(<this interface>)`. Cross-file implementors
     * are not surfaced in v1; that's `findReferencesToControlAcrossFiles`-style
     * follow-up territory for `StructureDeclarationIndexer`.
     */
    private buildInterfaceHover(ifaceToken: Token, ifaceName: string, document?: TextDocument): Hover {
        const methods = (ifaceToken.children ?? [])
            .filter(c => c.subType === TokenType.InterfaceMethod)
            .map(c => `  ${c.label ?? c.value}`)
            .join('\n');
        const body = methods ? `\n${methods}\n` : '';

        let implementorsFooter = '';
        if (document) {
            const implementors = this.tokenCache.getStructure(document).getImplementors(ifaceName);
            if (implementors.length > 0) {
                const list = implementors
                    .map(c => `- \`${c.label ?? c.value}\` — ${this.formatter.locationLink(document.uri, c.line)}`)
                    .join('\n');
                implementorsFooter =
                    `\n\n**${implementors.length} class${implementors.length === 1 ? '' : 'es'} implement${implementors.length === 1 ? 's' : ''} this interface in this file:**\n${list}`;
            }
        }

        const content =
            `\`\`\`clarion\n${ifaceName} INTERFACE${body}END\n\`\`\`\n\n` +
            `*Interface — defines a contract implemented by classes.*${implementorsFooter}`;
        return { contents: { kind: 'markdown', value: content } };
    }

}
