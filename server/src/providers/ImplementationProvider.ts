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
import { Location, Position, Range } from 'vscode-languageserver-protocol';
import { CancellationToken } from 'vscode-languageserver';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';
import { SolutionManager } from '../solution/solutionManager';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { TokenHelper } from '../utils/TokenHelper';
import LoggerManager from '../logger';
import { ProcedureCallDetector } from './utils/ProcedureCallDetector';
import { CrossFileCache } from './hover/CrossFileCache';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import { getLocalMapScope } from '../utils/LocalMapScopeHelper';
import { MemberLocatorService } from '../services/MemberLocatorService';
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
    private memberResolver: ClassMemberResolver;
    private chainedResolver: ChainedPropertyResolver;
    private memberLocator: MemberLocatorService;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        this.crossFileCache = new CrossFileCache(this.tokenCache);
        this.mapResolver = new MapProcedureResolver(this.crossFileCache);
        this.crossFileResolver = new CrossFileResolver(this.tokenCache);
        this.overloadResolver = new MethodOverloadResolver();
        this.memberResolver = new ClassMemberResolver();
        this.chainedResolver = new ChainedPropertyResolver();
        this.memberLocator = new MemberLocatorService(this.crossFileCache);
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
                        return null;
                    }
                    
                    if (implLocation) {
                        logger.info(`✅ Found procedure implementation for call: ${word}`);
                        return implLocation;
                    }
                }
                
                // If no MAP declaration found in current file, check if this file has MEMBER
                // and search the parent file
                logger.info(`No MAP declaration found in current file, checking for MEMBER parent`);
                const memberToken = tokens.find(t => 
                    t.line < 5 && // MEMBER should be at top of file
                    t.value.toUpperCase() === 'MEMBER' &&
                    t.referencedFile
                );
                
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
                                    logger.info(`✅ Found implementation via parent MAP: ${word}`);
                                    return implLocation;
                                }
                            }
                        } catch (error) {
                            logger.info(`Error loading parent file: ${error}`);
                        }
                    }
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
            return Location.create(
                document.uri,
                {
                    start: { line: routineToken.line, character: 0 },
                    end: { line: routineToken.line, character: routineToken.value.length }
                }
            );
        }

        return null;
    }

    /**
     * Find method implementation (class methods or method calls)
     */
    /**
     * #125 — when a typed-variable dot-access call→impl lookup targets an
     * overloaded method, classify the call's args and pick the matching
     * overload before falling through to paramCount-only `resolveDotAccess`.
     * Returns the picked decl as a ClassMemberInfo-shape for downstream
     * `findImplementationCrossFile` lookup; returns null to signal
     * "fall through to existing paramCount-only path" when:
     *   - the variable type can't be resolved to a class,
     *   - the classifier can't find the call's `(...)`,
     *   - fewer than 2 candidates locally,
     *   - `matchedAll=true` (un-disambiguatable).
     */
    private async tryArgClassifyResolve(
        document: TextDocument,
        callInfo: { objectName: string; methodName: string; paramCount: number },
        callLine: number
    ): Promise<{ type: string; className: string; line: number; file: string } | null> {
        const tokens = this.tokenCache.getTokens(document);
        const varTypeInfo = await this.memberLocator.resolveVariableType(callInfo.objectName, tokens, document);
        if (!varTypeInfo?.isClass) return null;
        const className = varTypeInfo.typeName;

        const lowerMethod = callInfo.methodName.toLowerCase();
        const callNameIdx = tokens.findIndex(t =>
            t.line === callLine && (
                t.value.toLowerCase() === lowerMethod ||
                t.value.toLowerCase().endsWith('.' + lowerMethod)
            ));
        if (callNameIdx < 0) return null;

        const args = new CallSiteArgumentClassifier().classifyArguments(tokens, callNameIdx);
        if (!args) return null;

        const candidates = this.overloadResolver.findAllMethodDeclarationsIncludingIncludes(className, callInfo.methodName, document, tokens);
        if (candidates.length < 2) return null;

        const { matchedIndex, matchedAll } = this.overloadResolver.findOverloadByArgClassifications(
            args, candidates.map(c => c.signature));
        if (matchedAll || matchedIndex < 0) return null;

        const picked = candidates[matchedIndex];
        return { type: 'PROCEDURE', className, line: picked.line, file: picked.file };
    }

    private async findMethodImplementation(
        document: TextDocument,
        position: Position,
        line: string,
        token?: CancellationToken
    ): Promise<Location | null> {
        // Pattern 1b: Chained access like SELF.Order.MainKey or PARENT.Foo.Bar
        // Must be checked BEFORE Pattern 1 because Pattern 1's regex matches the last
        // X.Y( pair in a chain (e.g. RangeList.Init() from SELF.Order.RangeList.Init())
        // and returns before reaching this block.
        {
            const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
            if (dotBeforeIndex > 0) {
                const rawBeforeDot = line.substring(0, dotBeforeIndex).trim();
                const beforeDot = ChainedPropertyResolver.extractChain(rawBeforeDot);
                if (/^\s*(self|parent)\b/i.test(beforeDot) && beforeDot.includes('.')) {
                    const afterDot = line.substring(dotBeforeIndex + 1).trim();
                    const methodMatch = afterDot.match(/^(\w+)/);
                    if (methodMatch) {
                        const memberName = methodMatch[1];
                        const hasParens = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
                        const paramCount = hasParens
                            ? this.memberResolver.countParametersInCall(line, memberName)
                            : 0;
                        const chainedInfo = await this.chainedResolver.resolve(beforeDot, memberName, document, position, paramCount);
                        if (chainedInfo) {
                            logger.info(`✅ Chained Ctrl+F12: "${memberName}" → impl lookup at ${chainedInfo.file}:${chainedInfo.line}`);
                            // #182 — arg-classification overlay: re-point at the matching
                            // overload's declaration so both the returned decl and the impl
                            // lookup target the arg-matched overload, not the paramCount one.
                            const picked = this.overloadResolver.resolveOverloadDeclByArgs(
                                chainedInfo.className, memberName, document, this.tokenCache.getTokens(document), position.line);
                            const declInfo = picked
                                ? { ...chainedInfo, line: picked.line, file: picked.file }
                                : chainedInfo;
                            // For methods, try to find the implementation; for properties just return declaration
                            if (ProcedureUtils.startsWithProcedureKeyword(declInfo.type)) { // #247: PROCEDURE ≡ FUNCTION
                                const implLoc = await this.findMethodImplementationCrossFile(
                                    declInfo.className, memberName, document, paramCount, null,
                                    picked?.signature ?? line, declInfo.file, token
                                );
                                if (implLoc) return implLoc;
                            }
                            return Location.create(declInfo.file, Range.create(declInfo.line, 0, declInfo.line, 0));
                        }
                    }
                }

                // Multi-segment variable chain: variable.property.method (e.g., thisStartup.Settings.PutGlobalSetting)
                if (!/^\s*(self|parent)\b/i.test(beforeDot) && beforeDot.includes('.')) {
                    const afterDot = line.substring(dotBeforeIndex + 1).trim();
                    const methodMatch = afterDot.match(/^(\w+)/);
                    if (methodMatch) {
                        const memberName = methodMatch[1];
                        const hasParens = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
                        const paramCount = hasParens
                            ? this.memberResolver.countParametersInCall(line, memberName)
                            : 0;
                        const chainedInfo = await this.chainedResolver.resolve(beforeDot, memberName, document, position, paramCount);
                        if (chainedInfo) {
                            logger.info(`✅ Chained Ctrl+F12 (var chain): "${memberName}" → impl lookup at ${chainedInfo.file}:${chainedInfo.line}`);
                            // #182 — arg-classification overlay (var-chain variant).
                            const picked = this.overloadResolver.resolveOverloadDeclByArgs(
                                chainedInfo.className, memberName, document, this.tokenCache.getTokens(document), position.line);
                            const declInfo = picked
                                ? { ...chainedInfo, line: picked.line, file: picked.file }
                                : chainedInfo;
                            if (ProcedureUtils.startsWithProcedureKeyword(declInfo.type)) { // #247: PROCEDURE ≡ FUNCTION
                                const implLoc = await this.findMethodImplementationCrossFile(
                                    declInfo.className, memberName, document, paramCount, null,
                                    picked?.signature ?? line, declInfo.file, token
                                );
                                if (implLoc) return implLoc;
                            }
                            return Location.create(declInfo.file, Range.create(declInfo.line, 0, declInfo.line, 0));
                        }
                    }
                }
            }
        }

        // Pattern 1: Method call like SELF.MethodName() or PARENT.MethodName() or object.MethodName()
        // Also handles no-paren calls: FuzzyMatcher.Init (Clarion allows no-param methods without ())
        const methodCallMatch = line.match(/(\w+)\.(\w+)\s*\(?/gi);
        if (methodCallMatch) {
            const callInfo = this.extractMethodCall(line, position);
            if (callInfo) {
                logger.info(`Found method call: ${callInfo.objectName}.${callInfo.methodName} with ${callInfo.paramCount} params`);

                // PARENT.Method() — find the parent class and search for its implementation
                if (callInfo.objectName.toUpperCase() === 'PARENT') {
                    const tokens = this.tokenCache.getTokens(document);
                    const parentInfo = await this.memberResolver.getParentClassInfo(document, position.line, tokens);
                    if (parentInfo) {
                        logger.info(`PARENT.${callInfo.methodName} → searching for ${parentInfo.parentClassName}.${callInfo.methodName} implementation`);
                        // #182 — arg-classification overlay: pick the matching overload by
                        // argument type and target its implementation via the matched decl
                        // signature, instead of the paramCount-only call line.
                        const picked = this.overloadResolver.resolveOverloadDeclByArgs(
                            parentInfo.parentClassName, callInfo.methodName, document, tokens, position.line);
                        const impl = await this.findMethodImplementationCrossFile(
                            parentInfo.parentClassName,
                            callInfo.methodName,
                            document,
                            callInfo.paramCount,
                            parentInfo.moduleFile ?? null,
                            picked?.signature ?? line,
                            undefined,
                            token
                        );
                        if (impl) return impl;
                    }
                    return null;
                }

                // SELF.Method() — resolve via class member lookup then cross-file search
                if (callInfo.objectName.toUpperCase() === 'SELF') {
                    const selfTokens = this.tokenCache.getTokens(document);
                    const memberInfo = this.memberResolver.findClassMemberInfo(
                        callInfo.methodName, document, position.line, selfTokens, callInfo.paramCount
                    );
                    if (memberInfo && ProcedureUtils.containsProcedureKeyword(memberInfo.type)) { // #247
                        // #182 — arg-classification overlay (symmetric with PARENT/Definition).
                        const picked = this.overloadResolver.resolveOverloadDeclByArgs(
                            memberInfo.className, callInfo.methodName, document, selfTokens, position.line);
                        const impl = await this.findMethodImplementationCrossFile(
                            memberInfo.className,
                            callInfo.methodName,
                            document,
                            callInfo.paramCount,
                            null,
                            picked?.signature ?? line,
                            memberInfo.file,
                            token
                        );
                        if (impl) return impl;
                    }
                    return this.findMethodImplementationInFile(document, callInfo.methodName, callInfo.paramCount);
                }

                // Typed variable: st.GetValue() where st is declared as "st StringTheory"
                {
                    // #125 — arg-classify overlay for typed-var dot-access call→impl resolution.
                    const argClassifyInfo = await this.tryArgClassifyResolve(document, callInfo, position.line);
                    if (argClassifyInfo) {
                        if (ProcedureUtils.containsProcedureKeyword(argClassifyInfo.type)) { // #247
                            const impl = await this.memberResolver.findImplementationCrossFile(
                                argClassifyInfo.className, callInfo.methodName, argClassifyInfo, document, token
                            );
                            if (impl) {
                                logger.info(`✅ Arg-classify resolved typed-var impl "${callInfo.methodName}" in "${argClassifyInfo.className}"`);
                                return impl;
                            }
                        }
                        return Location.create(argClassifyInfo.file, Range.create(argClassifyInfo.line, 0, argClassifyInfo.line, 0));
                    }
                    const memberInfo = await this.memberLocator.resolveDotAccess(
                        callInfo.objectName, callInfo.methodName, document, callInfo.paramCount
                    );
                    if (memberInfo) {
                        if (ProcedureUtils.containsProcedureKeyword(memberInfo.type)) { // #247
                            const impl = await this.memberResolver.findImplementationCrossFile(
                                memberInfo.className, callInfo.methodName, memberInfo, document, token
                            );
                            if (impl) {
                                logger.info(`✅ Found typed variable impl "${callInfo.methodName}" in "${memberInfo.className}"`);
                                return impl;
                            }
                        }
                        return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
                    }
                }

                return this.findMethodImplementationInFile(document, callInfo.methodName, callInfo.paramCount);
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
     * Extract method call information from line
     */
    private extractMethodCall(
        line: string,
        position: Position
    ): { objectName: string; methodName: string; paramCount: number } | null {
        // First try with parens: Object.Method(...) or Object.Method()
        const regex = /(\w+)\.(\w+)\s*\((.*?)\)/gi;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
            const callStart = match.index;
            const callEnd = match.index + match[0].length;

            if (position.character >= callStart && position.character <= callEnd) {
                const objectName = match[1];
                const methodName = match[2];
                const paramList = match[3].trim();
                const paramCount = paramList === '' ? 0 : paramList.split(',').length;

                return { objectName, methodName, paramCount };
            }
        }

        // Fallback: no-paren dotted call — Object.Method (Clarion allows calling
        // no-parameter methods without parentheses)
        const noParenRegex = /(\w+)\.(\w+)(?!\s*\()/gi;
        while ((match = noParenRegex.exec(line)) !== null) {
            const callStart = match.index;
            const callEnd = match.index + match[0].length;

            if (position.character >= callStart && position.character <= callEnd) {
                return { objectName: match[1], methodName: match[2], paramCount: 0 };
            }
        }

        return null;
    }

    /**
     * Find method implementation in current file
     */
    private findMethodImplementationInFile(
        document: TextDocument,
        methodName: string,
        paramCount?: number,
        declarationSignature?: string,
        className?: string
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
        const candidates: { lineNum: number; signature: string }[] = [];

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
        return Location.create(
            document.uri,
            {
                start: { line: best.lineNum, character: 0 },
                end: { line: best.lineNum, character: lines[best.lineNum].length }
            }
        );
    }

    /**
     * Find the CLASS token for a method at the given line
     */
    private findClassTokenForMethod(tokens: Token[], methodLine: number): Token | null {
        // Search backwards from the method line to find the CLASS token
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i];
            
            // Stop if we've gone past the method line
            if (token.line > methodLine) {
                continue;
            }
            
            // Look for CLASS structure
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
                // Check if this class contains our method line
                // Find the END of this class
                let classEndLine = -1;
                for (let j = i + 1; j < tokens.length; j++) {
                    const endToken = tokens[j];
                    if (endToken.value.toUpperCase() === 'END' && endToken.start === 0 && endToken.line > token.line) {
                        classEndLine = endToken.line;
                        break;
                    }
                }
                
                // Check if method is within this class
                if (classEndLine === -1 || methodLine < classEndLine) {
                    return token;  // Return the CLASS token itself
                }
            }
        }
        
        return null;
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
        token?: CancellationToken
    ): Promise<Location | null> {
        logger.info(`Searching for ${className}.${methodName} implementation cross-file`);
        
        // First, search in current file (filtered by className to avoid matching wrong class)
        const localImpl = this.findMethodImplementationInFile(currentDocument, methodName, paramCount, declarationSignature, className);
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
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(moduleFile);
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
                for (const project of sm.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(implFileName);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        logger.info(`Redirection resolved ${implFileName} → ${resolved.path}`);
                        const implLocation = this.searchFileForMethodImplementation(
                            resolved.path, className, methodName, paramCount, declarationSignature
                        );
                        if (implLocation) return implLocation;
                    }
                }
            }

            // ─── Sibling-dir fallback (cluster site 2 of 4, task 6253f9d5) ─────
            // No solution / redirection failed — fall back to same directory as
            // declaration. Load-bearing for no-solution-open mode + cross-directory
            // siblings outside the project's .red search paths. Move in unison with
            // the cluster-canonical site at `ClassMemberResolver.ts:~1041` and the
            // two companions in `MapDeclarationDiagnostics.ts:145` +
            // `MapDeclarationCodeActionProvider.ts:resolveClwPath`. Phase A audit:
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
        const fileUri = `file:///${fullPath.replace(/\\/g, '/')}`;

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
                return Location.create(fileUri, { start: { line: tok.line, character: 0 }, end: { line: tok.line, character: 0 } });
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
            return Location.create(
                fileUri,
                {
                    start: { line: best.lineNum, character: 0 },
                    end: { line: best.lineNum, character: lines[best.lineNum].length }
                }
            );
        } catch (error) {
            logger.error(`Error reading file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
        }

        return null;
    }
}
