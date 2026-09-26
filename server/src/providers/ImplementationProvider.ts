/**
 * Implementation Provider for Language Server
 * Provides "Go to Implementation" (Ctrl+F12) functionality
 * 
 * Handles:
 * - MAP procedure declarations → implementations (with overload resolution)
 * - Class method declarations → implementations (cross-file via SolutionManager)
 * - Routine references (DO statements)
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { labelLocation, labelRange } from '../utils/ProcedureNameRange'; // #690
import { pathToCanonicalUri } from '../utils/UriUtils'; // #690
import { clarionSourceCandidates } from '../utils/ClarionSourceNaming';
import { Location, Position, Range } from 'vscode-languageserver-protocol';
import { CancellationToken } from 'vscode-languageserver';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';
import { SolutionManager } from '../solution/solutionManager';
import { projectsOwnerFirst } from '../utils/RedirectionResolution';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { TokenHelper } from '../utils/TokenHelper';
import { findEnclosingClassToken } from '../utils/EnclosingClassResolver';
import LoggerManager from '../logger';
import { ProcedureCallDetector } from './utils/ProcedureCallDetector';
import { CrossFileCache } from './hover/CrossFileCache';
import { countParametersInCall } from '../utils/ClassMemberScan';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import { getLocalMapScope } from '../utils/LocalMapScopeHelper';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { DottedAccessResolver } from '../services/DottedAccessResolver';
import { DefinitionProvider } from './DefinitionProvider';
import { cooperativeCheckpoint } from '../utils/cooperativeScan';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("ImplementationProvider");
logger.setLevel("error"); // Production: Only log errors

export class ImplementationProvider {
    private tokenCache: TokenCache;
    private mapResolver: MapProcedureResolver;
    private crossFileResolver: CrossFileResolver;
    private crossFileCache: CrossFileCache;
    private overloadResolver: MethodOverloadResolver;
    private memberLocator: MemberLocatorService;
    /** #654 — the declaration a `receiver.member` names, shared with hover and Go to Definition. */
    private dottedAccess: DottedAccessResolver;
    /** Created on first use — only a weak argument reference that names a real procedure needs it. */
    private definitionProvider?: DefinitionProvider;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        this.crossFileCache = new CrossFileCache(this.tokenCache);
        this.mapResolver = new MapProcedureResolver(this.crossFileCache);
        this.crossFileResolver = new CrossFileResolver(this.tokenCache);
        this.overloadResolver = new MethodOverloadResolver();
        this.memberLocator = new MemberLocatorService(this.crossFileCache);
        this.dottedAccess = new DottedAccessResolver(this.memberLocator, this.overloadResolver);
    }

    /**
     * Provides implementation locations for a given position
     */
    public async provideImplementation(
        document: TextDocument,
        position: Position,
        token?: CancellationToken
    ): Promise<Location | Location[] | null> {
        logger.info(`Implementation requested at ${position.line}:${position.character} in ${document.uri}`);

        const tokens = this.tokenCache.getTokens(document);

        // Don't navigate on words inside comments or after line-continuation markers
        if (TokenHelper.isPositionInComment(tokens, position.line, position.character)) {
            return null;
        }

        // Don't navigate on words inside string literals
        if (TokenHelper.isPositionInString(tokens, position.line, position.character)) {
            return null;
        }

        const documentStructure = this.tokenCache.getStructure(document);
        
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        // Get word at position for procedure call detection
        const wordRange = ProcedureCallDetector.getWordRangeAtPosition(document, position);
        const word = wordRange ? document.getText(wordRange) : '';

        // 1. Check if this is a procedure call (e.g., "MyProcedure()")
        //    OR if this is inside a START() call (e.g., "START(ProcName, ...)")
        if (word && wordRange) {
            const detection = ProcedureCallDetector.isProcedureCallOrReference(document, position, wordRange);

            if (detection.isProcedure) {
                logger.info(`Detected procedure ${ProcedureCallDetector.getDetectionMessage(word, detection.isStartCall)}`);
                const procedureTarget = await this.resolveProcedureReferenceImplementation(
                    word, document, position, line, tokens, detection.isArgumentReference);
                if (procedureTarget) {
                    return procedureTarget.location;
                }
            }
        }

        // 2. Check if this is a routine reference (DO statements)
        const routineLocation = this.findRoutineImplementation(document, position, line);
        if (routineLocation) {
            logger.info(`Found routine implementation`);
            return routineLocation;
        }

        // 3. Check if this is a MAP procedure declaration (inside MAP block)
        // OR a MODULE procedure declaration (inside MODULE block in INCLUDE file)
        const containerCtx = documentStructure.getStructureContextAt(position.line);
        const isInMap = containerCtx.inMap;
        const isInModule = !isInMap && containerCtx.inModule;
        
        if (isInMap || isInModule) {
            // Use ClarionPatterns.MAP_PROCEDURE_DECLARATION which handles both PROCEDURE and FUNCTION
            const mapProcMatch = line.match(ClarionPatterns.MAP_PROCEDURE_DECLARATION);
            if (mapProcMatch) {
                const procName = mapProcMatch[1];
                const procNameStart = line.indexOf(procName);
                const procNameEnd = procNameStart + procName.length;

                // Check if cursor is on the procedure name
                if (position.character >= procNameStart && position.character <= procNameEnd) {
                    logger.info(`Found ${isInMap ? 'MAP' : 'MODULE'} procedure declaration: ${procName}`);
                    
                    // Use MapProcedureResolver for overload resolution
                    const implLocation = await this.mapResolver.findProcedureImplementation(
                        procName,
                        tokens,
                        document,
                        position,
                        line, // Pass declaration signature for overload matching
                        this.tokenCache.getStructure(document) // #258: reuse cached structure
                    );
                    
                    if (implLocation) {
                        logger.info(`✅ Found implementation at line ${implLocation.range.start.line}`);
                        return implLocation;
                    }
                }
            }
        }

        // 4. Check if this is a method call or reference
        const methodLocation = await this.findMethodImplementation(document, position, line, token);
        if (methodLocation) {
            logger.info(`Found method implementation`);
            return methodLocation;
        }

        logger.info(`No implementation found at this position`);
        return null;
    }

    /**
     * Ctrl+F12 for a procedure call or reference: the implementation of the procedure the
     * word names.
     *
     * Returns `{ location }` when it has taken responsibility for the word — including
     * `{ location: null }` for "already on the implementation, nowhere to go", which must
     * not fall through — and `null` when it has not, so provideImplementation continues to
     * its routine, MAP-declaration and method paths.
     *
     * `isArgumentReference` marks the weak `SORT(Queue, CompareProc)` shape, which every
     * bare identifier passed as an argument matches. It carries the same two obligations
     * here as on hover and F12:
     *
     *   1. It must not outrank a declaration in scope. With a local `Helper LONG` in view,
     *      `MESSAGE(Helper)` IS that local, and a variable has no implementation. This
     *      provider has no variable tier of its own to rank behind, so it takes Go to
     *      Definition's answer — see `definitionNamesProcedure` — which makes the two agree
     *      by construction instead of re-deciding what can shadow.
     *   2. It must not start the exhaustive #313 include walk, since most words reaching it
     *      are ordinary variables with nothing to find. Hover already skips the walk for
     *      this shape; now all three surfaces resolve it through the same cheap tiers.
     *
     * When the ranking declines, the result is `null` — a fall-through — so the word is
     * answered exactly as it was before the argument shape existed.
     */
    private async resolveProcedureReferenceImplementation(
        word: string,
        document: TextDocument,
        position: Position,
        line: string,
        tokens: Token[],
        isArgumentReference: boolean
    ): Promise<{ location: Location | null } | null> {
        // Find the MAP declaration first
        const mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);

        if (mapDecl) {
            // Check if MAP declaration is from an INCLUDE file
            const mapDeclUri = mapDecl.uri;
            const isFromInclude = mapDeclUri !== document.uri;

            let implLocation: Location | null = null;

            if (isFromInclude) {
                logger.info(`MAP declaration is from INCLUDE file: ${mapDeclUri}`);
                // Load the INCLUDE file and its tokens using cache
                try {
                    const decodedPath = decodeURIComponent(mapDeclUri.replace('file:///', ''));
                    const cached = await this.crossFileCache.getOrLoadDocument(decodedPath);

                    if (cached) {
                        const { document: includeDoc, tokens: includeTokens } = cached;

                        // Find implementation using INCLUDE file's document and tokens
                        const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                        implLocation = await this.mapResolver.findProcedureImplementation(
                            word,
                            includeTokens,
                            includeDoc,
                            mapPosition,
                            line
                        );
                    }
                } catch (error) {
                    logger.info(`Error loading INCLUDE file: ${error}`);
                }
            } else {
                // Now find implementation using the MAP declaration position
                const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                implLocation = await this.mapResolver.findProcedureImplementation(
                    word,
                    tokens,
                    document,
                    mapPosition, // Use MAP position, not call position
                    line,
                    this.tokenCache.getStructure(document) // #258: reuse cached structure
                );
            }

            // Check if we're already AT the implementation - if so, don't navigate to itself
            if (implLocation &&
                implLocation.uri === document.uri &&
                implLocation.range.start.line === position.line) {
                logger.info(`❌ Already at implementation for ${word} - returning null to prevent self-navigation`);
                return { location: null };
            }

            if (implLocation) {
                if (isArgumentReference && !(await this.definitionNamesProcedure(document, position, [mapDecl, implLocation]))) {
                    logger.info(`⏭️ ${word} is claimed by a declaration in scope — not a procedure reference here`);
                    return null;
                }
                logger.info(`✅ Found procedure implementation for call: ${word}`);
                return { location: implLocation };
            }
        }

        // If no MAP declaration found in current file, check if this file has MEMBER
        // and search the parent file
        logger.info(`No MAP declaration found in current file, checking for MEMBER parent`);
        const memberToken = TokenHelper.findMemberHeaderToken(tokens);

        if (memberToken?.referencedFile) {
            logger.info(`File has MEMBER('${memberToken.referencedFile}'), checking parent for ${word}`);

            const localScope = getLocalMapScope(document.uri);
            // Use CrossFileResolver to find MAP declaration in parent file
            const memberResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                word,
                memberToken.referencedFile,
                document,
                line,
                localScope?.containingProcedure
            );

            if (memberResult) {
                logger.info(`✅ Found MAP declaration in parent file at line ${memberResult.line}`);

                // Now find implementation from the parent MAP declaration using cache
                try {
                    const parentPath = memberResult.file;
                    const cached = await this.crossFileCache.getOrLoadDocument(parentPath);

                    if (cached) {
                        const { document: parentDoc, tokens: parentTokens } = cached;

                        const mapPosition: Position = { line: memberResult.line, character: 0 };
                        const implLocation = await this.mapResolver.findProcedureImplementation(
                            word,
                            parentTokens,
                            parentDoc,
                            mapPosition,
                            line
                        );

                        if (implLocation) {
                            if (isArgumentReference &&
                                !(await this.definitionNamesProcedure(document, position, [memberResult.location, implLocation]))) {
                                logger.info(`⏭️ ${word} is claimed by a declaration in scope — not a procedure reference here`);
                                return null;
                            }
                            logger.info(`✅ Found implementation via parent MAP: ${word}`);
                            return { location: implLocation };
                        }
                    }
                } catch (error) {
                    logger.info(`Error loading parent file: ${error}`);
                }
            }
        }

        // #313: the declaration may live in an INC included INSIDE a MAP (the
        // WinEvent pattern — include('winevent.inc') in the current file's or the
        // MEMBER parent's MAP, with module('winevent.clw') blocks in the INC).
        // findMapDeclaration scans current-document tokens only, and
        // findMapDeclarationInMemberFile searches the parent's MAP only for
        // MODULE('<current file>') blocks — neither reaches those declarations,
        // while go-to-DEFINITION does (its own walk follows the includes). Locate
        // the declaration by walking MAP includes from both start files, then hand
        // its own document+position to findProcedureImplementation — the exact path
        // that already works when the cursor is physically on the declaration.
        //
        // Not for the weak argument shape: see obligation 2 above.
        if (!isArgumentReference) {
            const viaMapInclude = await this.findImplementationViaMapIncludes(word, document, tokens);
            if (viaMapInclude) {
                logger.info(`✅ Found implementation via MAP-include MODULE declaration: ${word}`);
                return { location: viaMapInclude };
            }
        }

        return null;
    }

    /**
     * True when Go to Definition resolves the word at `position` to one of `procedureSites` —
     * the procedure's MAP declaration or its implementation — rather than to some other
     * declaration that shadows it.
     *
     * Called only for the weak argument shape, and only once a procedure of that name has
     * actually been found, so an ordinary variable argument never pays for it. Either site
     * counts, because F12 may reach the procedure through its declaration-side tier or
     * through a label tier that lands on the implementation.
     */
    private async definitionNamesProcedure(
        document: TextDocument,
        position: Position,
        procedureSites: Location[]
    ): Promise<boolean> {
        if (!this.definitionProvider) {
            this.definitionProvider = new DefinitionProvider();
        }
        const definition = await this.definitionProvider.provideDefinition(document, position);
        const targets = (Array.isArray(definition) ? definition : definition ? [definition] : []) as any[];
        const siteKey = (uri: string, line: number) => {
            let path = uri.replace(/^file:\/*/i, '');
            try { path = decodeURIComponent(path); } catch { /* keep as is */ }
            return `${path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()}#${line}`;
        };
        const sites = new Set(procedureSites.map(s => siteKey(s.uri, s.range.start.line)));
        return targets.some(t => {
            const uri: string | undefined = t.uri ?? t.targetUri;
            const range = t.range ?? t.targetSelectionRange ?? t.targetRange;
            return !!uri && !!range && sites.has(siteKey(uri, range.start.line));
        });
    }

    /**
     * #313 — find the implementation of a procedure whose MAP declaration lives in
     * an INC included inside a MAP: walk INCLUDE targets of the current file AND
     * its MEMBER parent, find the declaration inside a MODULE block, then run the
     * proven declaration-side resolution from the INC's own document/position.
     */
    private async findImplementationViaMapIncludes(
        procName: string,
        document: TextDocument,
        tokens: Token[]
    ): Promise<Location | null> {
        const hit = await this.mapResolver.findDeclarationInMapIncludes(procName, document, tokens);
        if (!hit) return null;
        const declLineText = hit.doc.getText({
            start: { line: hit.declLine, character: 0 },
            end: { line: hit.declLine, character: Number.MAX_SAFE_INTEGER }
        });
        return this.mapResolver.findProcedureImplementation(
            procName,
            hit.tokens,
            hit.doc,
            { line: hit.declLine, character: 0 },
            declLineText,
            this.tokenCache.getStructure(hit.doc)
        );
    }

    /**
     * Get word range at position (helper method)
     */
    /**
     * Check if a line is inside a MAP block
     */
    /**
     * Find routine implementation (labels followed by ROUTINE keyword)
     */
    private findRoutineImplementation(
        document: TextDocument,
        position: Position,
        line: string
    ): Location | null {
        // #320: cursor ON the ROUTINE label itself — a routine's declaration IS
        // its implementation, so Go-to-Implementation resolves to the label
        // (parity with F12; previously answered nothing).
        const tokens = this.tokenCache.getTokens(document);
        const isRoutineDeclLine = tokens.some(t => t.line === position.line && t.subType === TokenType.Routine);
        if (isRoutineDeclLine) {
            const labelTok = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === position.line &&
                position.character >= t.start &&
                position.character <= t.start + t.value.length
            );
            if (labelTok) {
                return Location.create(document.uri, {
                    start: { line: labelTok.line, character: labelTok.start },
                    end: { line: labelTok.line, character: labelTok.start + labelTok.value.length }
                });
            }
        }

        // Check if cursor is on a word after DO keyword (supports namespace prefixes with : or ::)
        const wordMatch = line.match(ClarionPatterns.DO_ROUTINE);
        if (!wordMatch) {
            return null;
        }

        const routineName = wordMatch[1];
        const doPos = line.toUpperCase().indexOf('DO');
        const nameStart = line.indexOf(routineName, doPos);
        const nameEnd = nameStart + routineName.length;

        // Check if cursor is on the routine name
        if (position.character < nameStart || position.character > nameEnd) {
            return null;
        }

        logger.info(`Looking for routine: ${routineName}`);

        // #264: scope the lookup to the ENCLOSING PROCEDURE (the #211 rule) — routine
        // labels repeat across procedures, and the previous whole-file first-match text
        // scan landed on the WRONG procedure's routine. Shares DefinitionProvider's
        // algorithm via TokenHelper so hover, F12, and Ctrl+F12 always agree.
        const structure = this.tokenCache.getStructure(document);
        const routineToken = TokenHelper.findScopedRoutineToken(structure, routineName, position.line);
        if (routineToken) {
            logger.info(`✅ Found routine at line ${routineToken.line}`);
            // `routineToken.value` is "ROUTINE"; the routine's name is on `.label`. See
            // TokenHelper.getRoutineLabelRange.
            return Location.create(document.uri, TokenHelper.getRoutineLabelRange(routineToken));
        }

        return null;
    }

    /**
     * Find method implementation (class methods or method calls)
     */
    private async findMethodImplementation(
        document: TextDocument,
        position: Position,
        line: string,
        token?: CancellationToken
    ): Promise<Location | null> {
        // #654 — a member access, `receiver.member` or a chain of them (`SELF.a.b`, `obj.a.b`), names
        // its declaration through DottedAccessResolver: the one call hover and Go to Definition make
        // (#651, #652), so Ctrl+F12 opens the body of the declaration F12 goes to and cannot pick
        // another. It replaces the two chain branches and the PARENT, SELF and typed-variable
        // branches, which each named the class, tried the argument-type pick and asked for the member
        // in turn - and so each carried its own copy of the fixes #627, #642, #643, #645 and #650.
        {
            const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
            if (dotBeforeIndex > 0 && !/\s/.test(line.charAt(dotBeforeIndex + 1))) {
                const afterDot = line.substring(dotBeforeIndex + 1);
                const memberMatch = afterDot.match(/^([\w:]+)/);
                // #639: only the member name itself - the receiver, SELF / PARENT or an argument is
                // another word, with no implementation of this member.
                if (memberMatch && this.isCursorOnMemberAfterDot(line, dotBeforeIndex, memberMatch[1], position)) {
                    const memberName = memberMatch[1];
                    const beforeDot = ChainedPropertyResolver.extractChain(line.substring(0, dotBeforeIndex).trim());
                    const receiver = beforeDot.includes('.') ? beforeDot.trim() : beforeDot.match(/([\w:]+)\s*$/)?.[1];
                    const hasParens = /^\s*\(/.test(afterDot.substring(memberName.length));
                    const paramCount = hasParens ? countParametersInCall(line, memberName) : undefined;
                    if (receiver) {
                        const access = await this.dottedAccess.resolve(receiver, memberName, document, position.line, paramCount);
                        if (access) {
                            const member = access.member;
                            if (ProcedureUtils.containsProcedureKeyword(member.type)) { // #247
                                const body = await this.findMethodImplementationCrossFile(
                                    member.className, memberName, document, paramCount ?? 0,
                                    await this.memberLocator.moduleFileOf(member.className, document) ?? null, // the MODULE hint
                                    access.pickedSignature ?? member.signature ?? line, // #643
                                    member.file, token, member.line                     // #650
                                );
                                if (body) {
                                    logger.info(`✅ ${receiver}.${memberName} → body of ${member.className}.${memberName}`);
                                    return body;
                                }
                            }
                            // A property, or a method whose body is not in source: its declaration.
                            return labelLocation(member.file, member.line, memberName); // #690
                        }
                        // Nothing names it. PARENT has nowhere else to look; another receiver keeps the
                        // last resort it had, a body of that name in this file.
                        if (/^parent$/i.test(receiver)) return null;
                        return this.findMethodImplementationInFile(document, memberName, paramCount ?? 0);
                    }
                }
            }
        }

        // Pattern 2: Method declaration in a class (use SolutionManager for cross-file lookup)
        const tokens = this.tokenCache.getTokens(document);
        
        // First try to detect using subType
        let tokenAtPosition = tokens.find(t =>
            t.line === position.line &&
            t.subType === TokenType.MethodDeclaration &&
            position.character >= t.start &&
            position.character <= t.start + t.value.length
        );
        
        // If not found by subType, check for Label + PROCEDURE pattern (method declaration in CLASS)
        if (!tokenAtPosition) {
            const lineTokens = TokenHelper.findTokens(tokens, { line: position.line });
            const labelToken = lineTokens.find(t =>
                t.type === TokenType.Label && 
                t.start === 0 &&
                position.character >= t.start &&
                position.character <= t.start + t.value.length
            );
            
            const procedureToken = lineTokens.find(t =>
                ProcedureUtils.isProcedureKeyword(t.value) // #247: PROCEDURE ≡ FUNCTION
            );

            if (labelToken && procedureToken) {
                logger.info(`Found method declaration pattern: Label="${labelToken.value}" + PROCEDURE on line ${position.line}`);
                tokenAtPosition = labelToken;
            }
        }

        if (tokenAtPosition && tokenAtPosition.label) {
            logger.info(`Found method/procedure declaration: ${tokenAtPosition.label}`);
            
            // Find the CLASS token for this method
            const classToken = this.findClassTokenForMethod(tokens, position.line);
            
            if (classToken && classToken.label) {
                const className = classToken.label;
                
                // Find MODULE token on the same line as the class (after the CLASS token)
                const moduleToken = tokens.find(t => 
                    t.line === classToken.line &&
                    t.start > classToken.start &&  // Must come after CLASS token
                    t.referencedFile &&
                    t.value.toUpperCase().includes('MODULE')
                );
                
                const moduleFile = moduleToken?.referencedFile;
                
                logger.info(`Method ${tokenAtPosition.label} belongs to class ${className}`);
                if (moduleFile) {
                    logger.info(`Class references MODULE: ${moduleFile}`);
                }
                
                // Count parameters in the declaration line for overload matching
                const paramCount = this.countParametersInLine(line);
                
                // Search for implementation cross-file
                const implementation = await this.findMethodImplementationCrossFile(
                    className,
                    tokenAtPosition.label,
                    document,
                    paramCount,
                    moduleFile,
                    line,
                    undefined,
                    token
                );
                
                if (implementation) {
                    return implementation;
                }
            }
            
            // Fallback to current file search
            return this.findMethodImplementationInFile(document, tokenAtPosition.label);
        }

        return null;
    }

    /**
     * #639 — true when the cursor is on the member named right after the dot at `dotIndex`, the
     * word the chained branches resolve. Otherwise the cursor is on some other word further
     * along the line (`SELF.Q.Field = CHOOSE(...)` with the cursor on CHOOSE).
     */
    private isCursorOnMemberAfterDot(line: string, dotIndex: number, memberName: string, position: Position): boolean {
        const after = line.substring(dotIndex + 1);
        const start = dotIndex + 1 + (after.length - after.trimStart().length);
        return position.character >= start && position.character <= start + memberName.length;
    }

    /**
     * Find method implementation in current file
     */
    private findMethodImplementationInFile(
        document: TextDocument,
        methodName: string,
        paramCount?: number,
        declarationSignature?: string,
        className?: string,
        declarationLine?: number
    ): Location | null {
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        // Skip MAP blocks
        const mapBlocks: Array<{ start: number; end: number }> = [];
        let inMap = false;
        let mapStart = -1;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim().toUpperCase();

            if (trimmed === 'MAP' && !inMap) {
                inMap = true;
                mapStart = i;
            } else if (trimmed.startsWith('END') && inMap) {
                mapBlocks.push({ start: mapStart, end: i });
                inMap = false;
            }
        }

        // Collect all matching candidates
        let candidates: { lineNum: number; signature: string }[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (mapBlocks.some(block => i >= block.start && i <= block.end)) continue;

            const line = lines[i];
            const implMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION);

            if (implMatch && implMatch[2].toUpperCase() === methodName.toUpperCase()) {
                // If caller specified a class name, only match that class
                if (className && implMatch[1].toUpperCase() !== className.toUpperCase()) continue;
                candidates.push({ lineNum: i, signature: line.trim() });
            }
        }

        if (candidates.length === 0) return null;

        // #650: a module may declare the same local class in several procedures, each with its
        // own `ThisWindow.Init` body after it. With the declaration in this document, a body
        // after that declaration is this class's; the first in the file may be another's.
        if (declarationLine !== undefined) {
            const after = candidates.filter(c => c.lineNum > declarationLine);
            if (after.length > 0) candidates = after;
        }

        let bestIdx = 0;
        if (candidates.length > 1) {
            if (declarationSignature) {
                bestIdx = this.overloadResolver.findBestMatchingImplementation(
                    declarationSignature,
                    candidates.map(c => c.signature)
                );
            } else if (paramCount !== undefined) {
                const countMatch = candidates.findIndex(c =>
                    ClarionPatterns.countParameters(c.signature) === paramCount
                );
                if (countMatch !== -1) bestIdx = countMatch;
            }
        }

        const best = candidates[bestIdx];
        logger.info(`✅ Found method implementation at line ${best.lineNum}`);
        // #690: the body's label, as every other path selects it.
        return Location.create(document.uri, labelRange(best.lineNum, /^\S*/.exec(lines[best.lineNum])![0]));
    }

    /**
     * Find the CLASS token for a method at the given line
     */
    private findClassTokenForMethod(tokens: Token[], methodLine: number): Token | null {
        return findEnclosingClassToken(tokens, methodLine);   // #622
    }

    /**
     * Count parameters in a line
     */
    private countParametersInLine(line: string): number {
        const match = line.match(/\(([^)]*)\)/);
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        return paramList.split(',').length;
    }

    /**
     * Find method implementation across all files in solution
     */
    private async findMethodImplementationCrossFile(
        className: string,
        methodName: string,
        currentDocument: TextDocument,
        paramCount?: number,
        moduleFile?: string | null,
        declarationSignature?: string,
        declarationFile?: string,
        token?: CancellationToken,
        declarationLine?: number // #650: the declaration's line, when it is in currentDocument
    ): Promise<Location | null> {
        logger.info(`Searching for ${className}.${methodName} implementation cross-file`);
        
        // First, search in current file (filtered by className to avoid matching wrong class)
        const declaredHere = declarationLine !== undefined && !!declarationFile &&
            decodeURIComponent(declarationFile).toLowerCase() === decodeURIComponent(currentDocument.uri).toLowerCase();
        const localImpl = this.findMethodImplementationInFile(
            currentDocument, methodName, paramCount, declarationSignature, className, declaredHere ? declarationLine : undefined);
        if (localImpl) {
            return localImpl;
        }
        
        // If a moduleFile hint is provided, try it first (fastest path — already resolved by caller)
        if (moduleFile) {
            logger.info(`Looking for module file: ${moduleFile}`);
            
            const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');
            
            // Use redirection parser to resolve the module file
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of projectsOwnerFirst(currentPath)) { // #328 owner-first
                    const redirectionParser = project.getRedirectionParser();
                    // #450 — MODULE('x') may omit the extension; the compiler infers
                    // .clw and redirection masks cannot match a bare name.
                    const resolved = clarionSourceCandidates(moduleFile)
                        .map(c => redirectionParser.findFile(c))
                        .find(r => r?.path && fs.existsSync(r.path));
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        logger.info(`Found module file via redirection: ${resolved.path} (source: ${resolved.source})`);
                        const implLocation = this.searchFileForMethodImplementation(
                            resolved.path,
                            className,
                            methodName,
                            paramCount,
                            declarationSignature
                        );
                        if (implLocation) {
                            return implLocation;
                        }
                    }
                }
            } else {
                // No solution open — walk localDir + libsrcPaths via no-solution resolver
                // (#113 site D). Previously localDir-only; now also reaches libsrcPaths
                // for moduleFile hints pointing at library-hosted classes.
                // Symmetric with MethodHoverResolver.ts (site F).
                const resolved = resolveFileInNoSolutionMode(moduleFile, currentDocument.uri);
                if (resolved) {
                    logger.info(`Found module file at: ${resolved.path} (no solution open, source: ${resolved.source})`);
                    const implLocation = this.searchFileForMethodImplementation(
                        resolved.path,
                        className,
                        methodName,
                        paramCount,
                        declarationSignature
                    );
                    if (implLocation) {
                        return implLocation;
                    }
                }
            }
        }
        
        // Use the FileRelationshipGraph's CLASS_MODULE index for O(1) lookup by class name.
        // This covers library classes (e.g. StringTheory) that are not in the project source list
        // and whose CLW path is already pre-resolved — avoids the expensive full-project scan below.
        try {
            const { FileRelationshipGraph } = await import('../FileRelationshipGraph');
            const graph = FileRelationshipGraph.getInstance();
            if (graph.isBuilt) {
                const classEdges = graph.getEdgesForClass(className);
                for (const edge of classEdges) {
                    // Convert normalised graph path (lowercase, forward slashes) back to filesystem path
                    const candidatePath = edge.toFile.replace(/\//g, path.sep);
                    const implLocation = this.searchFileForMethodImplementation(
                        candidatePath, className, methodName, paramCount, declarationSignature
                    );
                    if (implLocation) {
                        logger.info(`✅ Found ${className}.${methodName} via FileRelationshipGraph edge → ${candidatePath}`);
                        return implLocation;
                    }
                }
            }
        } catch (e) {
            logger.info(`FileRelationshipGraph lookup failed: ${e}`);
        }

        // Fallback: Search all solution files
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager || !solutionManager.solution) {
            // No-solution hail-mary (#113 site E): try `${className}.clw` via the
            // no-solution resolver. Covers library classes living in libsrcPaths
            // (e.g. StringTheory) when no moduleFile hint was provided.
            // Symmetric with MethodHoverResolver.ts (site G).
            const resolved = resolveFileInNoSolutionMode(`${className}.clw`, currentDocument.uri);
            if (resolved) {
                logger.info(`Trying ${className}.clw via no-solution resolver: ${resolved.path} (source: ${resolved.source})`);
                const implLocation = this.searchFileForMethodImplementation(
                    resolved.path, className, methodName, paramCount, declarationSignature
                );
                if (implLocation) {
                    return implLocation;
                }
            }
            logger.info(`No solution manager available for cross-file search`);
            return null;
        }
        
        logger.info(`Searching ${solutionManager.solution.projects.length} projects`);
        
        // Get all source files from all projects. #187 — yield the event loop
        // periodically so this solution-wide .clw scan doesn't block interactive
        // requests (reads + scans each file until a match is found).
        let scanned = 0;
        for (const project of solutionManager.solution.projects) {
            for (const sourceFile of project.sourceFiles) {
                if (await cooperativeCheckpoint(scanned++, token)) return null;
                const fullPath = path.join(project.path, sourceFile.relativePath);

                // Skip current file (already searched)
                const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');
                if (fullPath.toLowerCase() === currentPath.toLowerCase()) {
                    continue;
                }
                
                // Only search .clw files
                if (!fullPath.toLowerCase().endsWith('.clw')) {
                    continue;
                }
                
                if (!fs.existsSync(fullPath)) {
                    continue;
                }
                
                const implLocation = this.searchFileForMethodImplementation(
                    fullPath,
                    className,
                    methodName,
                    paramCount,
                    declarationSignature
                );
                
                if (implLocation) {
                    return implLocation;
                }
            }
        }

        // Fallback: use the redirection parser to find the CLW file that corresponds to
        // the class declaration file (same base name, .clw extension).
        // e.g. ABUTIL.INC → look up ABUTIL.CLW via redirection.
        if (declarationFile) {
            // declarationFile may be a URI — convert to filesystem path
            let declFilePath = declarationFile;
            if (declFilePath.startsWith('file:///')) {
                declFilePath = decodeURIComponent(declFilePath.replace('file:///', '')).replace(/\//g, '\\');
            }
            const declBase = path.basename(declFilePath, path.extname(declFilePath));
            const implFileName = declBase + '.clw';
            const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');

            logger.info(`Searching for ${className}.${methodName} via redirection: ${implFileName}`);

            const sm = SolutionManager.getInstance();
            if (sm?.solution) {
                for (const project of projectsOwnerFirst(currentPath)) { // #328 owner-first
                    const redirectionParser = project.getRedirectionParser();
                    // #450 — same inference for an extension-less implementation target.
                    const resolved = clarionSourceCandidates(implFileName)
                        .map(c => redirectionParser.findFile(c))
                        .find(r => r?.path && fs.existsSync(r.path));
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        logger.info(`Redirection resolved ${implFileName} → ${resolved.path}`);
                        const implLocation = this.searchFileForMethodImplementation(
                            resolved.path, className, methodName, paramCount, declarationSignature
                        );
                        if (implLocation) return implLocation;
                    }
                }
            }

            // ─── Sibling-dir fallback (cluster site 1 of 3, the canonical one since #637) ─────
            // No solution / redirection failed — fall back to same directory as
            // declaration. Load-bearing for no-solution-open mode + cross-directory
            // siblings outside the project's .red search paths. The canonical copy lived
            // in ClassMemberResolver until #637; move in unison with the two companions
            // in `MapDeclarationDiagnostics.ts` + `MapDeclarationCodeActionProvider.ts:resolveClwPath`.
            // Pinned by ImplementationProvider.FindImplementationCrossFile.test.ts (Scenario 2). Phase A audit:
            // `docs/audits/classmemberresolver-sibling-dir-investigation-6253f9d5.md`.
            const declDir = path.dirname(declFilePath);
            const directPath = path.join(declDir, implFileName);
            if (fs.existsSync(directPath)) {
                logger.info(`Direct fallback: ${directPath}`);
                const implLocation = this.searchFileForMethodImplementation(
                    directPath, className, methodName, paramCount, declarationSignature
                );
                if (implLocation) return implLocation;
            }
        }

        logger.info(`❌ No implementation found for ${className}.${methodName}`);
        return null;
    }

    /**
     * Search a specific file for a method implementation
     */
    private searchFileForMethodImplementation(
        fullPath: string,
        className: string,
        methodName: string,
        paramCount?: number,
        declarationSignature?: string
    ): Location | null {
        const fileUri = pathToCanonicalUri(fullPath); // #690: canonical (#251)

        // Fast path: use cached tokens + DocumentStructure index to find MethodImplementation candidates.
        // Two-part label only (ClassName.MethodName) to avoid false positives with 3-part interface
        // implementations (ClassName.InterfaceName.MethodName).
        const cachedTokens = this.tokenCache.getTokensByUri(fileUri);
        if (cachedTokens && cachedTokens.length > 0) {
            const structure = this.tokenCache.getStructureByUri(fileUri);
            const qualifiedName = `${className}.${methodName}`;
            const indexedCandidates = structure?.findMethodImplementations(qualifiedName) ?? [];
            const tokenCandidates = indexedCandidates.filter(t =>
                t.label !== undefined && t.label.split('.').length === 2
            );

            if (tokenCandidates.length === 1) {
                // Single match — return immediately without disk read
                const tok = tokenCandidates[0];
                logger.info(`✅ Found implementation (token cache) in ${fullPath} at line ${tok.line}`);
                return Location.create(fileUri, labelRange(tok.line, tok.label ?? '')); // #690
            }

            if (tokenCandidates.length > 1 && paramCount !== undefined && !declarationSignature) {
                // Multiple overloads, paramCount only — use token-based param count via finishesAt range
                // Pick the candidate whose implementation body has the closest param count
                // We still need line text for ClarionPatterns.countParameters; fall through to disk path.
                // But if we can derive param count from label structure, we can avoid disk.
                // For now: just use line numbers from tokens but read file for signature text.
                // (This still saves the full regex scan — we only read necessary lines.)
            }
        }

        // Disk fallback (also used when file not in cache, or multi-overload needing signatures)
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split(/\r?\n/);

            // Collect all matching candidates
            const candidates: { lineNum: number; signature: string }[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const implMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION);

                if (implMatch &&
                    implMatch[1].toUpperCase() === className.toUpperCase() &&
                    implMatch[2].toUpperCase() === methodName.toUpperCase()) {
                    candidates.push({ lineNum: i, signature: line.trim() });
                }
            }

            if (candidates.length === 0) return null;

            let bestIdx = 0;
            if (candidates.length > 1) {
                if (declarationSignature) {
                    bestIdx = this.overloadResolver.findBestMatchingImplementation(
                        declarationSignature,
                        candidates.map(c => c.signature)
                    );
                } else if (paramCount !== undefined) {
                    // Exact match first
                    const exactMatch = candidates.findIndex(c =>
                        ClarionPatterns.countParameters(c.signature) === paramCount
                    );
                    if (exactMatch !== -1) {
                        bestIdx = exactMatch;
                    } else {
                        // No exact match — find closest, preferring higher param count
                        // (implementations have no default-param markers, so a 3-param
                        // implementation is the right target for a 2-arg call when the
                        // declaration has a default on the 3rd param)
                        bestIdx = candidates.reduce((bestI, c, i) => {
                            const bestCount = ClarionPatterns.countParameters(candidates[bestI].signature);
                            const currCount = ClarionPatterns.countParameters(c.signature);
                            const bestDiff = Math.abs(bestCount - paramCount);
                            const currDiff = Math.abs(currCount - paramCount);
                            if (currDiff < bestDiff) return i;
                            if (currDiff === bestDiff && currCount > bestCount) return i;
                            return bestI;
                        }, 0);
                    }
                }
            }

            const best = candidates[bestIdx];
            logger.info(`✅ Found implementation in ${fullPath} at line ${best.lineNum}`);
            // #690: the body's label, as every other path selects it.
            return Location.create(fileUri, labelRange(best.lineNum, /^\S*/.exec(lines[best.lineNum])![0]));
        } catch (error) {
            logger.error(`Error reading file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
        }

        return null;
    }
}
