import { Definition, Location, Position, Range, DocumentSymbol, CancellationToken } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SolutionManager } from '../solution/solutionManager';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { pathToCanonicalUri } from '../utils/UriUtils';
import { findSectionLocation } from '../utils/SectionLocator';
import { ScopeResolver } from '../scope/ScopeResolver';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';
import { ArgumentTypeResolver } from '../utils/ArgumentTypeResolver';
import { ProcedureUtils } from '../utils/ProcedureUtils';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { SymbolDefinitionResolver } from '../utils/SymbolDefinitionResolver';
import { FileDefinitionResolver } from '../utils/FileDefinitionResolver';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { ProcedureCallDetector } from './utils/ProcedureCallDetector';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { resolveViaProjectRedirection, resolveViaProjectRedirectionFromUri } from '../utils/RedirectionResolution';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { getLocalMapScope } from '../utils/LocalMapScopeHelper';
import { DefinitionTrace } from './utils/DefinitionTrace';

const logger = LoggerManager.getLogger("DefinitionProvider");
logger.setLevel("error");

/**
 * Provides goto definition functionality for Clarion files
 * Coordinates multiple specialized resolvers for different definition types
 */
export class DefinitionProvider {
    private tokenCache = TokenCache.getInstance();
    private symbolProvider = new ClarionDocumentSymbolProvider();
    private memberResolver = new ClassMemberResolver();
    private chainedResolver = new ChainedPropertyResolver();
    private overloadResolver = new MethodOverloadResolver();
    private argTypeResolver = new ArgumentTypeResolver();
    private mapResolver = new MapProcedureResolver();
    private symbolResolver = new SymbolDefinitionResolver();
    private fileResolver = new FileDefinitionResolver();
    private crossFileResolver = new CrossFileResolver(this.tokenCache);
    private memberLocator = new MemberLocatorService();
    private scopeAnalyzer: ScopeAnalyzer;
    private symbolFinder: SymbolFinderService;

    constructor() {
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
    }

    /**
     * Provides definition locations for a given position in a document
     * @param document The text document
     * @param position The position within the document
     * @returns A Definition (Location or Location[]) or null if no definition is found
     */
    public async provideDefinition(document: TextDocument, position: Position, token?: CancellationToken): Promise<Definition | null> {
        // #360 — per-call instrumentation. The heartbeat starts NOW so it spans
        // the whole call; emitIfSlow() in the finally covers every return path.
        const trace = new DefinitionTrace(Date.now());
        try {
            // Get tokens once for reuse throughout the method
            const tokens = this.tokenCache.getTokens(document);

            // Don't navigate on words inside comments or after line-continuation markers
            if (TokenHelper.isPositionInComment(tokens, position.line, position.character)) {
                return null;
            }

            // #171 — INCLUDE-aware exception to the string-position guard.
            // F12 on the filename inside INCLUDE / MODULE / MEMBER / LINK
            // (`'MyClass.inc'` lives in a single-quoted string) should route
            // through `FileDefinitionResolver`, not bail like other string
            // positions. We extract the filename directly from the matched
            // String token's `value` (stripping the surrounding quote chars)
            // because `getWordRangeAtPosition` was designed for identifier-
            // shaped tokens and doesn't reliably recover filename-with-ext from
            // inside a string. The detector scopes precisely to the FIRST
            // string-arg after a file-ref token, so two-arg forms like
            // `INCLUDE('foo.inc'),SECTION('bar')` still bail correctly at the
            // SECTION arg.
            const fileRefStr = TokenHelper.getFileRefArgStringToken(tokens, position.line, position.character);
            if (fileRefStr) {
                const filename = fileRefStr.value.replace(/^['"]|['"]$/g, '');
                return await this.fileResolver.findFileDefinition(filename, document.uri);
            }

            // #343 — the SECTION argument of INCLUDE('file','section'): F12
            // lands on the SECTION('name') line inside the resolved include.
            const sectionArg = TokenHelper.getIncludeSectionArgStringToken(tokens, position.line, position.character);
            if (sectionArg) {
                const sectionName = sectionArg.section.value.replace(/^'|'$/g, '').replace(/''/g, "'");
                const sectionLoc = findSectionLocation(sectionArg.includeFile, sectionName, document.uri);
                if (sectionLoc) {
                    return Location.create(pathToCanonicalUri(sectionLoc.path), {
                        start: { line: sectionLoc.line, character: Math.max(0, sectionLoc.character) },
                        end: { line: sectionLoc.line, character: Math.max(0, sectionLoc.character) + 'SECTION'.length }
                    });
                }
                return null;
            }

            // Don't navigate on words inside string literals (the file-ref
            // exception above is the only case where a cursor inside a string
            // routes anywhere useful).
            if (TokenHelper.isPositionInString(tokens, position.line, position.character)) {
                return null;
            }

            // Get the word at the current position
            const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
            if (!wordRange) {
                logger.info('No word found at position');
                return null;
            }

            const word = document.getText(wordRange);
            trace.symbol = word;

            // Get the line to check context
            const line = document.getText({
                start: { line: position.line, character: 0 },
                end: { line: position.line, character: Number.MAX_VALUE }
            });

            // ⚡ FAST PATH: if the cursor is on a type argument — CLASS(Type), QUEUE(Type),
            // GROUP(Type), INTERFACE(Type), or LIKE(Type) — skip all slow symbol resolution
            // and go straight to the SDI-based type lookup (pre-built, O(1)).
            // This prevents findSymbolDefinition() from running for minutes on large solutions
            // when the word is a class/type name that will never be found there anyway.
            {
                const typeArgRegex = /\b(?:CLASS|INTERFACE|QUEUE|GROUP|LIKE)\s*\(\s*([A-Za-z_]\w*)\b/gi;
                let typeArgMatch: RegExpExecArray | null;
                while ((typeArgMatch = typeArgRegex.exec(line)) !== null) {
                    if (typeArgMatch[1].toLowerCase() === word.toLowerCase()) {
                        logger.test(`⚡ [DEF] Fast-path: "${word}" is a type argument — skipping to SDI lookup`);
                        return this.findClassTypeDefinition(word, document);
                    }
                }
            }

            // Check if this is a method call (e.g., "self.SaveFile()" or "obj.Method()")
            // Skip if this line is a method implementation (e.g., "ThisWindow.Init PROCEDURE") — that
            // must be handled by the method implementation path below, not the dot-access path.
            const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
            const lineIsMethodImpl = ClarionPatterns.METHOD_IMPLEMENTATION_STRICT.test(line.trimStart());
            if (dotBeforeIndex > 0 && !lineIsMethodImpl) {
                const rawBeforeDot = line.substring(0, dotBeforeIndex).trim();
                const beforeDot = ChainedPropertyResolver.extractChain(rawBeforeDot);
                const afterDot = line.substring(dotBeforeIndex + 1).trim();
                const methodMatch = afterDot.match(/^(\w+)/);
                const isPureChain = /^[A-Za-z_][A-Za-z0-9_:]*(?:\.[A-Za-z_][A-Za-z0-9_:]*)*$/i.test(beforeDot.trim());
                const isSelfParentChain = isPureChain && /^\s*(self|parent)\b/i.test(beforeDot);
                
                // Extract just the method name from word if it includes the prefix (e.g., "self.SaveFile" -> "SaveFile")
                let methodName = word;
                if (word.includes('.')) {
                    const parts = word.split('.');
                    methodName = parts[parts.length - 1];
                }
                
                if (methodMatch && methodMatch[1].toLowerCase() === methodName.toLowerCase()) {
                    // Check if this looks like a method call (has parentheses)
                    const hasParentheses = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
                    
                    if (hasParentheses && (beforeDot.toLowerCase() === 'self' || beforeDot.toLowerCase().endsWith('self'))) {
                        // This is a method call - find the declaration
                        logger.info(`F12 on method call: ${beforeDot}.${methodName}()`);

                        // #131 — arg-classification overlay for SELF.Method(args), symmetric
                        // with the typed-var branch below. SELF resolves to the enclosing
                        // class; classify the call args and pick the matching overload before
                        // the paramCount-only fallback (which can't disambiguate same-arity
                        // overloads that differ only by argument type).
                        const selfClass = this.chainedResolver.resolveCurrentClassName(document, position, tokens);
                        if (selfClass) {
                            const argResolved = await this.tryArgClassifyResolve(tokens, document, selfClass, methodName, position.line);
                            if (argResolved) {
                                logger.info(`✅ Arg-classify resolved SELF.${methodName} in ${selfClass} to line ${argResolved.range.start.line}`);
                                return argResolved;
                            }
                        }

                        // Count parameters for overload resolution
                        const paramCount = this.memberResolver.countParametersInCall(line, methodName);
                        logger.info(`Method call has ${paramCount} parameters`);
                        
                        const memberInfo = this.memberResolver.findClassMemberInfo(methodName, document, position.line, tokens, paramCount);
                        
                        if (memberInfo) {
                            logger.info(`✅ Found method declaration at ${memberInfo.file}:${memberInfo.line}`);
                            return Location.create(
                                memberInfo.file,
                                Range.create(memberInfo.line, 0, memberInfo.line, 0)
                            );
                        }
                    }

                    if (hasParentheses && (beforeDot.toLowerCase() === 'parent' || beforeDot.toLowerCase().endsWith('parent'))) {
                        // PARENT.Method() — look up the method starting from the parent class
                        logger.info(`F12 on PARENT method call: PARENT.${methodName}()`);

                        // #131 — arg-classification overlay for PARENT.Method(args). Resolve
                        // the parent class name, then pick the matching overload by argument
                        // shape before the paramCount-only fallback (which otherwise picks the
                        // first-declared overload regardless of argument type).
                        const parentInfo = await this.memberResolver.getParentClassInfo(document, position.line, tokens);
                        if (parentInfo?.parentClassName) {
                            const argResolved = await this.tryArgClassifyResolve(tokens, document, parentInfo.parentClassName, methodName, position.line);
                            if (argResolved) {
                                logger.info(`✅ Arg-classify resolved PARENT.${methodName} in ${parentInfo.parentClassName} to line ${argResolved.range.start.line}`);
                                return argResolved;
                            }
                        }

                        const paramCount = this.memberResolver.countParametersInCall(line, methodName);
                        const memberInfo = await this.memberResolver.findParentClassMemberInfo(methodName, document, position.line, tokens, paramCount);
                        if (memberInfo) {
                            logger.info(`✅ Found PARENT method declaration at ${memberInfo.file}:${memberInfo.line}`);
                            return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
                        }
                    }

                    // Chained access: SELF.Order.MainKey or PARENT.Foo.Bar
                    if (isSelfParentChain && beforeDot.includes('.')) {
                        // #131 — arg-classification overlay for chained calls like
                        // SELF.inner.SetValue(args). Resolve the chain to the class that
                        // owns the final member, then pick the matching overload by argument
                        // shape before the paramCount-only step-3 lookup (which can't
                        // disambiguate same-arity overloads). Symmetric with the SELF /
                        // PARENT / typed-var branches.
                        if (hasParentheses) {
                            const finalClass = await this.chainedResolver.resolveFinalClassName(beforeDot, document, position);
                            if (finalClass) {
                                const argResolved = await this.tryArgClassifyResolve(tokens, document, finalClass, methodName, position.line);
                                if (argResolved) {
                                    logger.info(`✅ Arg-classify resolved chained ${beforeDot}.${methodName} in ${finalClass} to line ${argResolved.range.start.line}`);
                                    return argResolved;
                                }
                            }
                        }

                        const paramCount = hasParentheses
                            ? this.memberResolver.countParametersInCall(line, methodName)
                            : undefined;
                        const chainedInfo = await this.chainedResolver.resolve(beforeDot, methodName, document, position, paramCount ?? undefined);
                        if (chainedInfo) {
                            logger.info(`✅ Chained F12: "${methodName}" resolved at ${chainedInfo.file}:${chainedInfo.line}`);
                            return Location.create(chainedInfo.file, Range.create(chainedInfo.line, 0, chainedInfo.line, 0));
                        }
                    }

                    // SELF.property or PARENT.property (no parentheses) — find the class member declaration
                    if (!hasParentheses && isSelfParentChain) {
                        const isSelf = /\bself$/i.test(beforeDot);
                        logger.info(`F12 on ${isSelf ? 'SELF' : 'PARENT'} property: ${methodName}`);
                        const memberInfo = isSelf
                            ? this.memberResolver.findClassMemberInfo(methodName, document, position.line, tokens, undefined)
                            : await this.memberResolver.findParentClassMemberInfo(methodName, document, position.line, tokens, undefined);
                        if (memberInfo) {
                            logger.info(`✅ Found property declaration at ${memberInfo.file}:${memberInfo.line}`);
                            return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
                        }
                    }

                    // Typed variable member: st.GetValue() where st is declared as "st StringTheory"
                    if (!isSelfParentChain) {
                        // Multi-segment variable chain: variable.property.method
                        if (isPureChain && beforeDot.includes('.')) {
                            // #131 — arg-classification overlay for typed-var chained calls
                            // like outer.inner.SetValue(args). Same gap and same fix as the
                            // SELF/PARENT chained branch above: resolve the chain's final
                            // class, then pick the matching overload by argument shape before
                            // the paramCount-only fallback.
                            if (hasParentheses) {
                                const finalClass = await this.chainedResolver.resolveFinalClassName(beforeDot, document, position);
                                if (finalClass) {
                                    const argResolved = await this.tryArgClassifyResolve(tokens, document, finalClass, methodName, position.line);
                                    if (argResolved) {
                                        logger.info(`✅ Arg-classify resolved chained var-chain ${beforeDot}.${methodName} in ${finalClass} to line ${argResolved.range.start.line}`);
                                        return argResolved;
                                    }
                                }
                            }

                            const paramCount = hasParentheses
                                ? this.memberResolver.countParametersInCall(line, methodName) ?? undefined
                                : undefined;
                            const chainedInfo = await this.chainedResolver.resolve(beforeDot, methodName, document, position, paramCount);
                            if (chainedInfo) {
                                logger.info(`✅ Chained F12 (var chain): "${methodName}" resolved at ${chainedInfo.file}:${chainedInfo.line}`);
                                return Location.create(chainedInfo.file, Range.create(chainedInfo.line, 0, chainedInfo.line, 0));
                            }
                        }

                        const structureNameMatch = beforeDot.match(/(\w+)\s*$/);
                        if (structureNameMatch) {
                            const structureName = structureNameMatch[1];
                            // Pass position.line so resolveVariableType can also check procedure
                            // parameters (e.g. `*WindowInfo Info`). Issue #215.
                            const typeInfo = await this.memberLocator.resolveVariableType(structureName, tokens, document, position.line);
                            const classType = typeInfo?.typeName ?? this.findVariableType(tokens, structureName, position.line, document);
                            if (classType) {
                                logger.info(`Variable "${structureName}" is type "${classType}", looking for member "${methodName}"`);
                                // #125 — arg-classification overlay: when the typed-var call has
                                // overloaded candidates in the current file, classify the args and
                                // pick the matching overload. Falls through to paramCount-only on
                                // empty candidates or matchedAll fallback (preserves UX for cross-
                                // file classes / un-disambiguatable calls).
                                if (hasParentheses) {
                                    const argClassifyResult = await this.tryArgClassifyResolve(
                                        tokens, document, classType, methodName, position.line);
                                    if (argClassifyResult) {
                                        logger.info(`✅ Arg-classify resolved typed-var "${methodName}" in "${classType}" to line ${argClassifyResult.range.start.line}`);
                                        return argClassifyResult;
                                    }
                                }
                                const paramCount = hasParentheses
                                    ? this.memberResolver.countParametersInCall(line, methodName) ?? undefined
                                    : undefined;
                                const result = await this.findClassMemberInType(tokens, classType, methodName, document, paramCount);
                                if (result) {
                                    logger.info(`✅ Found typed variable member "${methodName}" in "${classType}"`);
                                    return result;
                                }
                            }
                        }
                    }
                }
            }

            // ✅ #211 DO routine reference: F12 on routine name in `DO RoutineName` → ROUTINE label
            // #320: shared DO_ROUTINE pattern — the old inline \w+ stopped at ':' so
            // `DO Menu::MENUBAR1` captured only "Menu", silently skipping this route
            // (a fallback happened to resolve it; hover/impl/F12 now converge on one pattern).
            const doRoutineMatch = line.match(ClarionPatterns.DO_ROUTINE);
            if (doRoutineMatch) {
                const routineName = doRoutineMatch[1];
                if (routineName.toLowerCase() === word.toLowerCase()) {
                    const routineStart = line.indexOf(routineName, line.toUpperCase().indexOf('DO'));
                    const routineEnd = routineStart + routineName.length;
                    if (position.character >= routineStart && position.character <= routineEnd) {
                        logger.info(`F12 on routine reference: DO ${routineName} — looking for ROUTINE label`);
                        const routineLocation = this.findRoutineDefinition(routineName, document, position, tokens);
                        if (routineLocation) {
                            logger.info(`✅ Found ROUTINE '${routineName}' definition`);
                            return routineLocation;
                        }
                    }
                }
            }

            // ✅ IMPLEMENTS(InterfaceName) navigation: F12 on interface name → INTERFACE declaration
            const implementsMatch = line.match(/\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi);
            if (implementsMatch) {
                for (const match of implementsMatch) {
                    const nameMatch = match.match(/\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/i);
                    if (nameMatch) {
                        const ifaceName = nameMatch[1];
                        const nameStart = line.indexOf(ifaceName, line.indexOf(match));
                        const nameEnd = nameStart + ifaceName.length;
                        if (position.character >= nameStart && position.character <= nameEnd) {
                            logger.info(`F12 on IMPLEMENTS(${ifaceName}) — looking for INTERFACE declaration`);
                            const ifaceLocation = await this.findInterfaceDeclaration(ifaceName, document, tokens);
                            if (ifaceLocation) {
                                logger.info(`✅ Found INTERFACE '${ifaceName}' declaration`);
                                return ifaceLocation;
                            }
                        }
                    }
                }
            }

            // ✅ 3-part method implementation: ClassName.InterfaceName.MethodName PROCEDURE
            // When cursor is on the InterfaceName segment, navigate to the INTERFACE declaration
            const threePartMatch = line.match(/^(\w+)\.(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)/i);
            if (threePartMatch) {
                const [, clsName, ifacePart, methodPart] = threePartMatch;
                const ifaceStart = line.indexOf(ifacePart, clsName.length + 1);
                const ifaceEnd = ifaceStart + ifacePart.length;
                if (position.character >= ifaceStart && position.character <= ifaceEnd) {
                    logger.info(`F12 on interface name in 3-part method: ${ifacePart}`);
                    const ifaceLocation = await this.findInterfaceDeclaration(ifacePart, document, tokens);
                    if (ifaceLocation) return ifaceLocation;
                }
            }

            // Check if this is a procedure call in CODE (e.g., "MyProcedure()" or "ProcessOrder(param)")
            // OR if this is inside a START() call (e.g., "START(ProcName, ...)")
            // Navigate to the MAP declaration or PROCEDURE implementation
            const detection = ProcedureCallDetector.isProcedureCallOrReference(document, position, wordRange);
            
            logger.info(`🔍 Checking for procedure call: word="${word}", isProcedure=${detection.isProcedure}, isStartCall=${detection.isStartCall}, line="${line.trim()}"`);
            
            if (detection.isProcedure) {
                logger.info(`🔍 Detected potential procedure ${ProcedureCallDetector.getDetectionMessage(word, detection.isStartCall)}`);
                
                // Count parameters for overload resolution
                const paramCount = this.memberResolver.countParametersInCall(line, word);
                logger.info(`Procedure call has ${paramCount} parameters`);
                
                // First, try to find MAP declaration in current file
                const mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);
                
                // Check if we're already AT the MAP declaration - if so, jump to implementation instead
                if (mapDecl && 
                    mapDecl.uri === document.uri && 
                    mapDecl.range.start.line === position.line) {
                    logger.info(`📍 Already at MAP declaration for ${word} - finding implementation instead`);
                    
                    // Navigate to implementation (like Ctrl+F12 would do)
                    const implLocation = await this.mapResolver.findProcedureImplementation(
                        word,
                        tokens,
                        document,
                        position,
                        line, // Pass declaration signature for overload matching
                        this.tokenCache.getStructure(document) // #258: reuse cached structure
                    );
                    
                    if (implLocation) {
                        logger.info(`✅ Found implementation at line ${implLocation.range.start.line}`);
                        return implLocation;
                    } else {
                        logger.info(`❌ No implementation found for MAP declaration: ${word}`);
                        return null;
                    }
                }
                
                if (mapDecl) {
                    logger.info(`✅ Found MAP declaration for procedure call: ${word}`);
                    return mapDecl;
                }
                
                // If not found locally and file has MEMBER, check parent file's MAP
                const memberToken = TokenHelper.findMemberHeaderToken(tokens);
                
                if (memberToken?.referencedFile) {
                    logger.info(`File has MEMBER('${memberToken.referencedFile}'), checking parent MAP for ${word}`);
                    
                    const localScope = getLocalMapScope(document.uri);
                    const memberResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                        word,
                        memberToken.referencedFile,
                        document,
                        line,
                        localScope?.containingProcedure
                    );
                    if (memberResult) {
                        logger.info(`✅ Found MAP declaration in MEMBER file for procedure call: ${word}`);
                        return memberResult.location;
                    }
                }
                
                logger.info(`❌ No MAP declaration found for procedure call: ${word}`);
            }

            // Check if this is a method implementation line (e.g., "StringTheory.Construct PROCEDURE")
            // and navigate to the declaration in the CLASS
            const methodImplMatch = line.match(ClarionPatterns.METHOD_IMPLEMENTATION_STRICT);
            if (methodImplMatch) {
                const parts = ClarionPatterns.getMethodImplParts(line);
                const className = parts?.className ?? methodImplMatch[1];
                // For 3-part (Class.Interface.Method), use the actual method name
                const methodName = parts?.methodName ?? methodImplMatch[2];
                
                logger.info(`🔍 Detected method implementation line: ${className}.${parts?.interfaceName ? parts.interfaceName + '.' : ''}${methodName}`);
                
                // Check if cursor is on the class, interface, or method name segment
                const classStart = line.indexOf(className);
                const classEnd = classStart + className.length;
                const methodStart = line.indexOf(methodName, classEnd);
                const methodEnd = methodStart + methodName.length;
                
                logger.info(`Cursor at ${position.character}, class range [${classStart}-${classEnd}], method range [${methodStart}-${methodEnd}]`);
                
                if ((position.character >= classStart && position.character <= classEnd) ||
                    (position.character >= methodStart && position.character <= methodEnd)) {
                    logger.info(`F12 on method implementation: ${className}.${methodName}`);
                    
                    // Count parameters from the implementation signature
                    const paramCount = ClarionPatterns.countParameters(line);
                    logger.info(`Method implementation has ${paramCount} parameters`);

                    // For 3-part methods (Class.Interface.Method), the declaration is in the INTERFACE, not the CLASS
                    if (parts?.interfaceName) {
                        const ifaceMethodInfo = this.overloadResolver.findInterfaceMethodDeclaration(
                            parts.interfaceName, methodName, document, tokens, paramCount, line
                        );
                        if (ifaceMethodInfo) {
                            logger.info(`✅ Found interface method declaration at ${ifaceMethodInfo.file}:${ifaceMethodInfo.line}`);
                            return Location.create(ifaceMethodInfo.file, {
                                start: { line: ifaceMethodInfo.line, character: 0 },
                                end: { line: ifaceMethodInfo.line, character: 0 }
                            });
                        }
                    }
                    
                    const declInfo = this.overloadResolver.findMethodDeclaration(className, methodName, document, tokens, paramCount, line);
                    if (declInfo) {
                        logger.info(`✅ Found method declaration at ${declInfo.file}:${declInfo.line} with ${declInfo.paramCount} parameters`);
                        return Location.create(declInfo.file, {
                            start: { line: declInfo.line, character: 0 },
                            end: { line: declInfo.line, character: 0 }
                        });
                    } else {
                        logger.info(`❌ No method declaration found for ${className}.${methodName}`);
                    }
                }
            }

            // Check if this is a MAP procedure/function implementation line (e.g., "ProcessOrder PROCEDURE" or "ProcessOrder FUNCTION")
            // Navigate to the MAP declaration
            const tokenAtPosition = tokens.find(t =>
                t.line === position.line &&
                t.subType === TokenType.GlobalProcedure
            );
            
            logger.info(`Tokens on line ${position.line}: ${TokenHelper.findTokens(tokens, { line: position.line }).map(t => `type=${t.type}, subType=${t.subType}, value="${t.value}", label="${t.label}"`).join('; ')}`);
            logger.info(`Token at position with GlobalProcedure subtype: ${tokenAtPosition ? `YES (label="${tokenAtPosition.label}")` : 'NO'}`);
            
            if (tokenAtPosition && tokenAtPosition.label) {
                logger.info(`🔍 Detected procedure implementation: ${tokenAtPosition.label}`);
                logger.info(`F12 navigating from implementation to MAP declaration for: ${tokenAtPosition.label}`);

                // Pass implementation signature for overload resolution
                const mapDecl = this.mapResolver.findMapDeclaration(tokenAtPosition.label, tokens, document, line);
                if (mapDecl) {
                    logger.info(`✅ Found MAP declaration at line ${mapDecl.range.start.line}`);
                    return mapDecl;
                } else {
                    logger.info(`❌ MAP declaration not found in current file for ${tokenAtPosition.label}`);
                    
                    // Check if this file has a MEMBER header, indicating it's part of another file
                    const memberToken = TokenHelper.findMemberHeaderToken(tokens);
                    
                    if (memberToken) {
                        logger.info(`✅ Found MEMBER token at line ${memberToken.line}: value="${memberToken.value}", referencedFile="${memberToken.referencedFile}"`);
                    } else {
                        logger.info(`❌ No MEMBER token found with referencedFile in first 5 lines`);
                        // Debug: Show all tokens in first 5 lines
                        const firstTokens = TokenHelper.findTokensInHeader(tokens, 5);
                        logger.info(`Debug: Found ${firstTokens.length} tokens in first 5 lines:`);
                        firstTokens.forEach(t => {
                            logger.info(`  Line ${t.line}: type=${t.type}, value="${t.value}", referencedFile="${t.referencedFile || 'undefined'}"`);
                        });
                    }
                    
                    if (memberToken?.referencedFile) {
                        logger.info(`File has MEMBER('${memberToken.referencedFile}'), searching parent file for MAP declaration`);
                        
                        const localScope = getLocalMapScope(document.uri);
                        // Use CrossFileResolver to find MAP declaration
                        const memberResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                            tokenAtPosition.label,
                            memberToken.referencedFile,
                            document,
                            line,
                            localScope?.containingProcedure
                        );
                        if (memberResult) {
                            return memberResult.location;
                        }
                    }
                }
            }

            // Check if this is a structure field reference (either dot notation or prefix notation)
            const structureFieldDefinition = await this.findStructureFieldDefinition(word, document, position);
            if (structureFieldDefinition) {
                return structureFieldDefinition;
            }

            // Check if word is a parameter of the containing procedure.
            // Parameters live in the PROCEDURE() signature, not at column 0, so findAllLabelCandidates
            // cannot find them. SymbolFinderService.findParameter parses the signature line.
            const scopeInfo = this.scopeAnalyzer.getTokenScope(document, position);
            const containingProc = scopeInfo?.containingProcedure;
            if (containingProc) {
                const paramResult = this.symbolFinder.findParameter(word, document, containingProc);
                if (paramResult) {
                    return Location.create(paramResult.location.uri, {
                        start: { line: paramResult.location.line, character: paramResult.location.character },
                        end: { line: paramResult.location.line, character: paramResult.location.character }
                    });
                }

                // For MethodImplementation scope, also check outer GlobalProcedure parameters.
                // A local class method can access the parameters of the procedure that declares the class.
                if (containingProc.subType === TokenType.MethodImplementation) {
                    const outerProcs = tokens.filter(t =>
                        TokenHelper.isProcedureOrFunction(t) &&
                        t.subType === TokenType.GlobalProcedure
                    );
                    for (const gp of outerProcs) {
                        const outerParamResult = this.symbolFinder.findParameter(word, document, gp);
                        if (outerParamResult) {
                            return Location.create(outerParamResult.location.uri, {
                                start: { line: outerParamResult.location.line, character: outerParamResult.location.character },
                                end: { line: outerParamResult.location.line, character: outerParamResult.location.character }
                            });
                        }
                    }
                }
            }

            // First, check if this is a reference to a label in the current document
            // Get ALL label candidates and filter by scope using ScopeAnalyzer
            const labelCandidates = this.symbolResolver.findAllLabelCandidates(word, document, tokens);
            if (labelCandidates.length > 0) {
                logger.info(`Found ${labelCandidates.length} label candidates for ${word}, filtering by scope...`);
                
                // Filter candidates by scope accessibility
                const accessibleLabels: Location[] = [];
                for (const candidate of labelCandidates) {
                    // Self-exclusion (#330): the label under the cursor is not a
                    // navigation target — skipping it lets the later tiers run,
                    // most importantly MAP declaration → implementation (incl.
                    // MODULE('x.dll') re-declarations hopping cross-project).
                    if (candidate.range.start.line === position.line &&
                        position.character >= candidate.range.start.character &&
                        position.character <= candidate.range.end.character) {
                        logger.info(`⏭️ Label at line ${candidate.range.start.line} is the cursor's own token — deferring to later tiers`);
                        continue;
                    }
                    const canAccess = this.scopeAnalyzer.canAccess(
                        position,
                        candidate.range.start,
                        document,
                        document  // Same document
                    );

                    if (canAccess) {
                        accessibleLabels.push(candidate);
                        logger.info(`✅ Label at line ${candidate.range.start.line} is accessible`);
                    } else {
                        logger.info(`❌ Label at line ${candidate.range.start.line} is out of scope`);
                    }
                }
                
                if (accessibleLabels.length > 0) {
                    // Sort by scope priority: routine > procedure > module > global
                    // This ensures shadowing works correctly (innermost scope wins)
                    accessibleLabels.sort((a, b) => {
                        const aScopeInfo = this.scopeAnalyzer.getTokenScope(document, a.range.start);
                        const bScopeInfo = this.scopeAnalyzer.getTokenScope(document, b.range.start);
                        
                        const scopePriority = (scopeType: string) => {
                            switch (scopeType) {
                                case 'routine': return 4;
                                case 'procedure': return 3;
                                case 'module': return 2;
                                case 'global': return 1;
                                default: return 0;
                            }
                        };
                        
                        const aPriority = scopePriority(aScopeInfo?.type || 'global');
                        const bPriority = scopePriority(bScopeInfo?.type || 'global');
                        
                        // Higher priority first (routine before procedure, etc.)
                        return bPriority - aPriority;
                    });
                    
                    return accessibleLabels[0];
                }
                
                logger.info(`No accessible labels found - all ${labelCandidates.length} candidates are out of scope`);
                // Don't return null yet - continue to check other resolution methods
            }

            // #360: between-phase cancellation checkpoint. Cheap early-out if the
            // user has already given up before the heaviest phase. (Deep cancellation
            // INSIDE the resolver — for the case where one phase blocks for tens of
            // seconds — is the phase-2 fix once instrumentation names the tier.)
            if (token?.isCancellationRequested) { trace.cancelled = true; return null; }

            // Next, check if this is a reference to a variable or other symbol
            // Do this BEFORE checking MAP procedure implementations to avoid false positives
            // #360: findSymbolDefinition is the prime 38s suspect ("runs for minutes
            // on large solutions" per the fast-path guard above) — time it explicitly.
            trace.route = 'symbolDefinition';
            const symbolDefinition = await trace.time('symbolDefinition',
                () => this.findSymbolDefinition(word, document, position));
            if (symbolDefinition) {
                return symbolDefinition;
            }

            // Check if we're inside a MAP block and the word is a procedure declaration
            // Navigate to the PROCEDURE implementation
            // Guard: skip if cursor is inside a PROCEDURE parameter list (word is a parameter type, not a call)
            const isInsideProcSignature = /\b(?:PROCEDURE|FUNCTION)\s*\(/i.test(line) && (() => { // #247
                const parenOpen = line.indexOf('(', line.search(/\b(?:PROCEDURE|FUNCTION)\s*\(/i));
                const parenClose = line.lastIndexOf(')');
                return parenOpen >= 0 && position.character > parenOpen && position.character <= parenClose;
            })();
            const mapProcImpl = !isInsideProcSignature && this.mapResolver.findProcedureImplementation(word, tokens, document, position, line,
                this.tokenCache.getStructure(document)); // #258: reuse cached structure
            if (mapProcImpl) {
                return mapProcImpl;
            }

            // ✅ Check if we're ON a declaration (method declaration in class or MAP procedure declaration)
            // If so, return null - we're already at the definition, no navigation needed
            // This check must come AFTER MAP navigation checks so MAP declarations can navigate to implementations
            // VSCode won't show an error for this case
            if (this.isOnDeclaration(line, position, word)) {
                return null;
            }

            // Next, check if this is a reference to a Clarion structure (queue, window, view, etc.)
            trace.route = 'structureDefinition';
            const structureDefinition = await trace.time('structureDefinition',
                () => this.findStructureDefinition(word, document, position));
            if (structureDefinition) {
                return structureDefinition;
            }

            // Check if word is a CLASS/INTERFACE/QUEUE/GROUP type name via the structure index.
            // The SDI is pre-built on solution load and is O(1) per lookup — check it BEFORE
            // walking the include chain (findTypeInIncludes) which can be slow on large solutions.
            trace.route = 'classTypeDefinition';
            const classLocation = await trace.time('classTypeDefinition',
                () => this.findClassTypeDefinition(word, document));
            if (classLocation) {
                return classLocation;
            }

            // Check if this word is a type name (QUEUE/GROUP/etc) declared in an INCLUDE file
            // Handles F12 on type names in LIKE(TypeName), QUEUE(TypeName), etc.
            // Fallback for types not covered by the SDI (e.g. not yet indexed).
            // #360: an include-chain walk — potential 38s culprit on large solutions.
            trace.route = 'typeInIncludes';
            trace.fallbackEntered = true;
            const typeDefInIncludes = await trace.time('typeInIncludes',
                () => this.findTypeInIncludes(word, document));
            if (typeDefInIncludes) {
                return typeDefInIncludes;
            }

            // Finally, check if this is a file reference
            // This is the lowest priority - only look for files if no local definitions are found
            if (this.fileResolver.isLikelyFileReference(word, document, position, tokens)) {
                trace.route = 'fileReference';
                return await trace.time('fileReference',
                    () => this.fileResolver.findFileDefinition(word, document.uri));
            }

            return null;
        } catch (error) {
            logger.error(`Error providing definition: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        } finally {
            trace.cancelled = trace.cancelled || (token?.isCancellationRequested ?? false);
            trace.emitIfSlow();
        }
    }

    /**
     * Finds the definition of a structure field reference
     * Handles both dot notation (Structure.Field) and prefix notation (PREFIX:Field)
     * Also handles class member access (self.Member or variable.Member)
     * Enhanced to support both structure labels and prefixes in usage
     */
    private async findStructureFieldDefinition(word: string, document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Looking for structure field definition: ${word}`);

        // Get tokens from cache
        const tokens = this.tokenCache.getTokens(document);

        // Get the current line text to analyze the context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });
        
        // CRITICAL FIX: Check if this is a standalone word without prefix or structure notation
        // If it's a standalone word, we should not match structure fields
        // #327: a word that itself carries the qualifier (fused token shapes like
        // "LOC:Counter") is qualified by definition — the old line-text probe
        // looked for ':LOC:Counter' in the line and wrongly bailed on every
        // fused reference, making the prefix branch below unreachable.
        const wordIsQualified = word.includes(':') || word.includes('.');
        const isStandaloneWord = !wordIsQualified &&
            !line.includes(':' + word) && !line.includes('.' + word);

        // If this is a standalone word and not part of a qualified reference, skip structure field matching
        if (isStandaloneWord) {
            logger.info(`Skipping structure field matching for standalone word: ${word}`);
            return null;
        }

        // Check if this is a dot notation reference (Structure.Field or Complex:Structure:1.Field or self.Member)
        const dotIndex = line.lastIndexOf('.', position.character - 1);
        if (dotIndex > 0) {
            const beforeDot = line.substring(0, dotIndex).trim();
            const afterDot = line.substring(dotIndex + 1).trim();

            // Extract structure name and field name
            const structureMatch = beforeDot.match(/(\w+)\s*$/);
            const fieldMatch = afterDot.match(/^(\w+)/);
            
            if (structureMatch && fieldMatch) {
                const structureName = structureMatch[1];
                const fieldName = fieldMatch[1];
                
                // Check if cursor is on the structure name or the field name
                if (word.toLowerCase() === structureName.toLowerCase()) {
                    // Cursor is on structure name - find the structure declaration
                    logger.info(`Detected dot notation: cursor on structure "${structureName}" in ${structureName}.${fieldName}`);
                    return this.symbolResolver.findLabelDefinition(structureName, document, position, tokens);
                } else if (word.toLowerCase() === fieldName.toLowerCase()) {
                    // Cursor is on field name - find the field within the structure
                    logger.info(`Detected dot notation: cursor on field "${fieldName}" in ${structureName}.${fieldName}`);

                    // Check if this is self.Member - class member access
                    if (structureName.toLowerCase() === 'self') {
                        logger.info(`Detected self.${fieldName} - looking for class member`);
                        return this.findClassMember(tokens, fieldName, document, position.line);
                    }

                    // Multi-segment chain (e.g. obj.inner.error): resolve the final class of
                    // the chain prefix before the last dot, then resolve member on that class.
                    if (beforeDot.includes('.')) {
                        const chainedInfo = await this.chainedResolver.resolve(beforeDot, fieldName, document, position, undefined);
                        if (chainedInfo) {
                            logger.info(`Resolved chained field "${beforeDot}.${fieldName}" at ${chainedInfo.file}:${chainedInfo.line}`);
                            return Location.create(chainedInfo.file, Range.create(chainedInfo.line, 0, chainedInfo.line, 0));
                        }
                        const finalClass = await this.chainedResolver.resolveFinalClassName(beforeDot, document, position);
                        if (finalClass) {
                            logger.info(`Resolved chain prefix "${beforeDot}" to class "${finalClass}" for field "${fieldName}"`);
                            const chainedResult = await this.findClassMemberInType(tokens, finalClass, fieldName, document);
                            if (chainedResult) {
                                return chainedResult;
                            }
                        }
                    }

                    // Try to find as a typed variable (e.g., otherValue.value where otherValue is StringTheory)
                    // Pass position.line to also resolve procedure parameters. Issue #215.
                    const typeInfo = await this.memberLocator.resolveVariableType(structureName, tokens, document, position.line);
                    const classType = typeInfo?.typeName ?? this.findVariableType(tokens, structureName, position.line, document);
                    if (classType) {
                        logger.info(`Variable ${structureName} is of type ${classType}, looking for member ${fieldName}`);
                        const result = await this.findClassMemberInType(tokens, classType, fieldName, document);
                        if (result) {
                            return result;
                        }
                    }

                    // Find the structure definition - handle complex structure names
                    const structureTokens = TokenHelper.findLabels(tokens, structureName);

                    if (structureTokens.length > 0) {
                        // Find the field within the structure
                        return this.findFieldInStructure(tokens, structureTokens[0], fieldName, document, position);
                    }
                }
            }
        }

        // #327: the former PREFIX:Field branch here was deleted as provably-dead
        // code. It extracted the qualifier from LINE TEXT (substring before the
        // last colon — a mid-line `X = LOC:Counter` yielded "X = LOC"), and its
        // terminal `findFieldInStructure` call could never return a field under
        // any shape: tier 1 compares `structureParent.parent.value` (the
        // ENCLOSING SCOPE token, e.g. PROCEDURE) against the structure label,
        // and tier 2 requires `start > 0` — but labels sit at column 0 by
        // language rule. PREFIX:Field references resolve downstream instead:
        // SymbolDefinitionResolver.findAllLabelCandidates (qualifier-validated,
        // #265) and SymbolFinderService.findPrefixedField — pinned by the
        // qualified-access tests in HoverF12.VariableAgreement.test.ts and
        // DefinitionProvider.QualifiedShapes327.test.ts.
        return null;
    }

    /**
     * Helper method to find a field within a structure
     */
    private async findFieldInStructure(
        tokens: Token[],
        structureToken: Token,
        fieldName: string,
        document: TextDocument,
        position?: Position
    ): Promise<Definition | null> {
        // First, try to find fields directly marked as structure fields
        let fieldTokens = tokens.filter(token =>
            token.type === TokenType.Label &&
            token.value.toLowerCase() === fieldName.toLowerCase() &&
            token.isStructureField === true &&
            token.structureParent?.parent?.value.toLowerCase() === structureToken.value.toLowerCase()
        );

        // If no fields found with the direct approach, try a more flexible approach
        if (fieldTokens.length === 0) {
            // Find the structure token that follows this label
            const structureIndex = tokens.indexOf(structureToken);
            let structureDefToken: Token | undefined;

            // Look for the structure definition after the label
            for (let i = structureIndex + 1; i < tokens.length; i++) {
                const token = tokens[i];
                if (token.type === TokenType.Structure) {
                    structureDefToken = token;
                    break;
                }

                // If we hit another label or we've moved past the structure definition, stop looking
                if (token.type === TokenType.Label ||
                    (token.value.trim().length > 0 && !this.isStructureToken(token))) {
                    break;
                }
            }

            if (structureDefToken) {
                // Find the end of this structure
                const endLine = structureDefToken.finishesAt || Number.MAX_VALUE;

                // Look for field labels within this structure's range
                fieldTokens = tokens.filter(token =>
                    token.type === TokenType.Label &&
                    token.value.toLowerCase() === fieldName.toLowerCase() &&
                    token.line > structureDefToken!.line &&
                    token.line < endLine &&
                    token.start > 0  // Fields are indented
                );
            }
        }

        if (fieldTokens.length > 0) {
            logger.info(`Found ${fieldTokens.length} occurrences of field ${fieldName} in structure ${structureToken.value}`);

            // If we have a position, try to find the field in the current context first
            if (position) {
                const currentLine = position.line;

                // Find the current procedure/method context
                const currentContext = this.findCurrentContext(tokens, currentLine);
                if (currentContext) {
                    logger.info(`Current context: ${currentContext.value} (${currentContext.line}-${currentContext.finishesAt})`);

                    // First, try to find the field within the current context
                    const contextFields = fieldTokens.filter(token =>
                        token.line >= currentContext.line &&
                        (currentContext.finishesAt === undefined || token.line <= currentContext.finishesAt)
                    );

                    if (contextFields.length > 0) {
                        logger.info(`Found field ${fieldName} in current context ${currentContext.value}`);
                        const fieldToken = contextFields[0];

                        // Return the location of the field definition in the current context
                        return Location.create(document.uri, {
                            start: { line: fieldToken.line, character: 0 },
                            end: { line: fieldToken.line, character: fieldToken.value.length }
                        });
                    }
                }
            }

            // If we couldn't find the field in the current context, return the first occurrence
            const fieldToken = fieldTokens[0];
            logger.info(`Using first occurrence of field ${fieldName} at line ${fieldToken.line}`);

            // Return the location of the field definition
            return Location.create(document.uri, {
                start: { line: fieldToken.line, character: 0 },
                end: { line: fieldToken.line, character: fieldToken.value.length }
            });
        }

        return null;
    }

    /**
     * Find the current procedure/method context for a given line
     */
    private findCurrentContext(tokens: Token[], currentLine: number): Token | undefined {
        // Issue #233 Stage 2: use the canonical resolver's innermost scope (procedure / method
        // impl / routine). Replaces the former FIRST-match scan, which only matched the bare
        // TokenType.Procedure subtype (missing GlobalProcedure / MethodImplementation) and had a
        // CLASS-with-dot branch that never fired (a CLASS token's value is 'CLASS').
        return new ScopeResolver(tokens).resolveScopeAt(currentLine).token ?? undefined;
    }

    /**
     * Finds the definition of a Clarion structure (queue, window, view, etc.)
     */
    private async findStructureDefinition(word: string, document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Looking for structure definition: ${word}`);

        // Get tokens from cache
        const tokens = this.tokenCache.getTokens(document);

        // Get the line to check context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });
        
        // CRITICAL FIX: Check if this is a standalone word without prefix or structure notation
        // If it's a standalone word, we should not match structure fields
        const isStandaloneWord = !line.includes(':' + word) && !line.includes('.' + word);
        logger.info(`Is standalone word in structure definition: ${isStandaloneWord}, line: "${line}"`);

        // Look for a label token that matches the word (structure definitions are labels in column 1)
        const labelTokens = TokenHelper.findLabels(tokens, word);

        if (labelTokens.length > 0) {
            logger.info(`Found ${labelTokens.length} label tokens for ${word}`);

            // Find the structure token that follows the label
            for (const labelToken of labelTokens) {
                const labelIndex = tokens.indexOf(labelToken);

                // Look for a structure token after the label
                for (let i = labelIndex + 1; i < tokens.length; i++) {
                    const token = tokens[i];
                    if (token.type === TokenType.Structure) {
                        logger.info(`Found structure ${token.value} for label ${labelToken.value} at line ${token.line}`);

                        // Return the location of the structure definition
                        return Location.create(document.uri, {
                            start: { line: labelToken.line, character: 0 },
                            end: { line: labelToken.line, character: labelToken.value.length }
                        });
                    }

                    // If we hit another label or we've moved past the structure definition, stop looking
                    if (token.type === TokenType.Label ||
                        (token.value.trim().length > 0 && !this.isStructureToken(token))) {
                        break;
                    }
                }
            }
        }

        // If we didn't find a label token, look for a structure token with a matching name
        const structureTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.parent &&
            token.parent.value.toLowerCase() === word.toLowerCase()
        );

        if (structureTokens.length > 0) {
            logger.info(`Found ${structureTokens.length} structure tokens for ${word}`);
            const token = structureTokens[0];

            // Return the location of the structure definition
            return Location.create(document.uri, {
                start: { line: token.line, character: token.start },
                end: { line: token.line, character: token.start + token.value.length }
            });
        }

        return null;
    }

    /**
     * Finds the definition of a variable or other symbol
     */
    /**
     * Checks if a token is a structure token
     */
    private isStructureToken(token: Token): boolean {
        return token.type === TokenType.Structure;
    }

    private async findSymbolDefinition(word: string, document: TextDocument, position: Position): Promise<Definition | null> {
        logger.info(`Looking for symbol definition: ${word}`);

        const tokens = this.tokenCache.getTokens(document);
        const structure = this.tokenCache.getStructure(document);
        const currentScope = TokenHelper.getInnermostScopeAtLine(structure, position.line) ?? undefined;

        // #265 — single source of truth: the same orchestrated tier walk the
        // hover side uses (parameter → routine-local → local incl. the Rule-4
        // declaring-procedure resolution → module → global → sibling MEMBER
        // modules → PRE:Field → stripped-prefix retries → procedure
        // declarations). The ~600-line hand-rolled walk this replaces predated
        // SymbolFinderService and had re-diverged from it (pre-Rule-4 broad
        // GlobalProcedure scan, its own prefix-validation variants).
        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position, currentScope);
        if (symbolInfo) {
            // Self-exclusion (#330 regression fix, parity with the pre-#265
            // hand-rolled walk): a result that IS the token under the cursor is
            // not a navigation. Return null so the later tiers get their turn —
            // most importantly MAP-declaration → implementation, which is how
            // F12 on a MAP declaration (including MODULE('x.dll') DLL
            // re-declarations) hops to the implementing module. Hover keeps
            // identity results by design; only F12 excludes them.
            if (symbolInfo.location.uri === document.uri &&
                symbolInfo.location.line === position.line &&
                position.character >= symbolInfo.location.character &&
                position.character <= symbolInfo.location.character + symbolInfo.token.value.length) {
                logger.info(`⏭️ findSymbol resolved the cursor's own token — deferring to later tiers`);
            } else {
            const location = Location.create(symbolInfo.location.uri, {
                start: { line: symbolInfo.location.line, character: symbolInfo.location.character },
                end: { line: symbolInfo.location.line, character: symbolInfo.location.character + symbolInfo.token.value.length }
            });

            // Cross-file GLOBAL results keep the legacy scope-accessibility gate:
            // a global found in another file must be reachable from the cursor
            // position (a scope violation blocks — it does not fall through).
            // Module-scoped sibling-MEMBER results pass through untouched: that
            // finder is deliberately a last-resort locator (#319) and hover
            // surfaces it, so F12 must agree.
            if (location.uri !== document.uri && symbolInfo.scope.type === 'global') {
                const declPath = decodeURIComponent(location.uri.replace('file:///', '')).replace(/\//g, '\\');
                if (fs.existsSync(declPath)) {
                    const declContents = fs.readFileSync(declPath, 'utf-8');
                    const declDoc = TextDocument.create(location.uri, 'clarion', 1, declContents);
                    const canAccess = this.scopeAnalyzer.canAccess(position, location.range.start, document, declDoc);
                    if (!canAccess) {
                        logger.info(`❌ SCOPE-CHECK: cross-file global "${word}" not accessible from cursor scope`);
                        return null;
                    }
                }
            }
            return location;
            }
        }

        // MEMBER parent chain (including the parent's INCLUDE chain) — reaches
        // further than findSymbol's direct-parent global step.
        const varLocation = await this.memberLocator.findVariableInParentChain(word, document);
        if (varLocation) {
            logger.info(`✅ Found variable "${word}" via MemberLocatorService: ${varLocation.uri} line ${varLocation.range.start.line}`);
            return varLocation;
        }

        // FILE/QUEUE/GROUP/RECORD label fallback: a column-0 label immediately
        // followed by a structure keyword (covers labels the scope walks miss,
        // e.g. structures declared past the module boundary in odd layouts).
        const colonIndex = word.lastIndexOf(':');
        const searchWord = colonIndex > 0 ? word.substring(colonIndex + 1) : word;
        const wordIsBare = !word.includes(':') && !word.includes('.');
        const labelToken = tokens.find(t =>
            t.type === TokenType.Label &&
            (t.value.toLowerCase() === word.toLowerCase() ||
             t.value.toLowerCase() === searchWord.toLowerCase()) &&
            t.start === 0
        );
        if (labelToken) {
            // #265: a label inside a PRE()'d structure (e.g. the RECORD of a
            // prefixed FILE) is only addressable with its qualifier.
            if (labelToken.structurePrefix && wordIsBare) {
                logger.info(`❌ PREFIX-REJECT: "${labelToken.value}" is inside a PRE(${labelToken.structurePrefix}) structure — bare reference is invalid`);
                return null;
            }
            const labelIndex = tokens.indexOf(labelToken);
            for (let i = labelIndex + 1; i < tokens.length; i++) {
                const t = tokens[i];
                if (t.type === TokenType.Structure &&
                    ['FILE', 'QUEUE', 'GROUP', 'RECORD'].includes(t.value.toUpperCase())) {
                    logger.info(`📄 Resolved ${searchWord} as ${t.value} label definition`);
                    return Location.create(document.uri, {
                        start: { line: labelToken.line, character: 0 },
                        end: { line: labelToken.line, character: labelToken.value.length }
                    });
                }
                if (t.type === TokenType.Label) break;
            }
        }

        logger.info(`🛑 No matching definition found for "${word}"`);
        return null;
    }

    /**
     * Finds a class member definition (property or method) in the current class context
     */
    private async findClassMember(tokens: Token[], memberName: string, document: TextDocument, currentLine: number): Promise<Location | null> {
        logger.info(`Looking for class member ${memberName} in current context`);

        const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
        
        // Find the current class or method context
        let currentScope = TokenHelper.getInnermostScopeAtLine(structure, currentLine); // 🚀 PERFORMANCE: O(log n) vs O(n)
        if (!currentScope) {
            logger.info('No scope found - cannot determine class context');
            return null;
        }

        // If we're in a routine, we need the parent scope (the method/procedure) to get the class name
        if (currentScope.subType === TokenType.Routine) {
            logger.info(`Current scope is a routine (${currentScope.value}), looking for parent scope`);
            const parentScope = TokenHelper.getParentScopeOfRoutine(structure, currentScope); // 🚀 PERFORMANCE: O(1) vs O(n)
            if (parentScope) {
                currentScope = parentScope;
                logger.info(`Using parent scope: ${currentScope.value}`);
            } else {
                logger.info('No parent scope found for routine');
                return null;
            }
        }

        // For method implementations, extract the class name (e.g., "StringTheory._Malloc" -> "StringTheory")
        let className: string | null = null;
        if (currentScope.value.includes('.')) {
            className = currentScope.value.split('.')[0];
            logger.info(`Extracted class name from method: ${className}`);
        } else {
            // Scope value doesn't have class name, try to parse from the actual line
            const content = document.getText();
            const lines = content.split('\n');
            const scopeLine = lines[currentScope.line];
            logger.info(`Scope line text: "${scopeLine}"`);
            
            // Match ClassName.MethodName PROCEDURE pattern
            const classMethodMatch = scopeLine.match(/^(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)/i); // #247
            if (classMethodMatch) {
                className = classMethodMatch[1];
                logger.info(`Extracted class name from line: ${className}`);
            }
        }

        if (!className) {
            logger.info('Could not determine class name from context');
            return null;
        }

        // Find the class member in this class
        return this.findClassMemberInType(tokens, className, memberName, document);
    }

    /**
     * Finds a class member in a specific class type
     */
    /**
     * #125 — when a typed-variable dot-access call has overloaded candidates in
     * the current file, classify the call's args and pick the matching overload
     * via `MethodOverloadResolver.findOverloadByArgClassifications`. Returns
     * `null` to signal "fall through to existing paramCount-only path" when:
     *   - the classifier can't find the call's `(...)` on this line,
     *   - the class has fewer than 2 candidates locally (single overload — no
     *     disambiguation needed; or zero — cross-file lookup needed),
     *   - the resolver returns `matchedAll=true` (un-disambiguatable; conservative
     *     fallback preserves UX per `feedback_silent_regression_pushback`).
     */
    private async tryArgClassifyResolve(
        tokens: Token[],
        document: TextDocument,
        className: string,
        methodName: string,
        callLine: number
    ): Promise<Location | null> {
        // #252 — delegates to the single enriched choke point. This was F12's own
        // classify + enrich + resolve copy (#245); hover/Ctrl+F12 gained the same
        // enrichment inside resolveOverloadDeclByArgs, so all consumers now share
        // one implementation and cannot drift.
        const picked = await this.overloadResolver.resolveOverloadDeclByArgs(
            className, methodName, document, tokens, callLine);
        if (!picked) return null;
        return Location.create(picked.file, Range.create(picked.line, 0, picked.line, 0));
    }

    private async findClassMemberInType(tokens: Token[], className: string, memberName: string, document: TextDocument, paramCount?: number): Promise<Location | null> {
        logger.info(`Looking for member ${memberName} in class/structure ${className}`);

        // First: search current file tokens for any structure (CLASS, QUEUE, GROUP, FILE) with this label
        const structureLabelToken = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.parent === undefined &&
            t.value.toLowerCase() === className.toLowerCase()
        );

        if (structureLabelToken) {
            logger.info(`Found structure definition for ${className} at line ${structureLabelToken.line}`);
            const result = await this.findFieldInStructure(tokens, structureLabelToken, memberName, document, { line: structureLabelToken.line, character: 0 });
            if (result) {
                return Array.isArray(result) ? result[0] : result;
            }
        }

        // Second: search CLASS structures (existing logic)
        const classTokens = TokenHelper.findClassStructures(tokens)
            .filter(token => token.line > 0);

        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className.toLowerCase()
            );

            if (labelToken) {
                logger.info(`Found class definition for ${className} at line ${labelToken.line}`);
                const result = await this.findFieldInStructure(tokens, labelToken, memberName, document, { line: labelToken.line, character: 0 });
                if (result) {
                    return Array.isArray(result) ? result[0] : result;
                }
            }
        }

        // Third: cross-file lookup via MemberLocatorService (INCLUDE chain + class index + parent chain)
        logger.info(`Structure ${className} not found in current file, delegating to MemberLocatorService`);
        const memberInfo = await this.memberLocator.findMemberInClass(className, memberName, document, paramCount);
        if (memberInfo) {
            return Location.create(memberInfo.file, Range.create(memberInfo.line, 0, memberInfo.line, 0));
        }

        // Fourth: try INTERFACE lookup (for &InterfaceName reference variables)
        const ifaceInfo = await this.memberLocator.findMemberInInterface(className, memberName, document, paramCount);
        if (ifaceInfo) {
            return Location.create(ifaceInfo.file, Range.create(ifaceInfo.line, 0, ifaceInfo.line, 0));
        }

        // Fallback: equates.clw (implicitly global — not always in INCLUDE chain)
        const equatesPath = SolutionManager.getInstance()?.getEquatesPath();
        if (equatesPath && fs.existsSync(equatesPath)) {
            const equatesUri = `file:///${equatesPath.replace(/\\/g, '/')}`;
            // Skip disk read if equates.clw is already cached — findMemberInClass uses
            // getTokensByUri first so the empty content will never be tokenized
            const equatesDoc = TextDocument.create(
                equatesUri, 'clarion', 1,
                this.tokenCache.getTokensByUri(equatesUri) ? '' : fs.readFileSync(equatesPath, 'utf8')
            );
            const equatesInfo = await this.memberLocator.findMemberInClass(className, memberName, equatesDoc, paramCount);
            if (equatesInfo) {
                return Location.create(equatesInfo.file, Range.create(equatesInfo.line, 0, equatesInfo.line, 0));
            }
        }

        return null;
    }

    /**
     * Find INTERFACE declaration by name, searching:
     * 1. Current document tokens
     * 2. INCLUDE files
     * 3. equates.clw
     */
    private async findInterfaceDeclaration(ifaceName: string, document: TextDocument, tokens: Token[]): Promise<Location | null> {
        // Search current document
        const local = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.label?.toLowerCase() === ifaceName.toLowerCase()
        );
        if (local) {
            return Location.create(document.uri, Range.create(local.line, 0, local.line, 0));
        }

        // Search INCLUDE files
        const result = await this.findTypeDeclarationInIncludes(ifaceName, decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\'), new Set());
        if (result) return result;

        // Search equates.clw
        const sm = SolutionManager.getInstance();
        const equatesTokens = sm?.getEquatesTokens();
        const equatesPath = sm?.getEquatesPath();
        if (equatesTokens && equatesPath) {
            const eq = equatesTokens.find(t =>
                t.type === TokenType.Structure &&
                t.subType === TokenType.Interface &&
                t.label?.toLowerCase() === ifaceName.toLowerCase()
            );
            if (eq) {
                const uri = pathToCanonicalUri(equatesPath); // #251: client-facing Location
                return Location.create(uri, Range.create(eq.line, 0, eq.line, 0));
            }
        }

        return null;
    }

    /**
     * Walk INCLUDE files reachable from the document and find a structure (QUEUE/GROUP/FILE/CLASS)
     * declaration with label = typeName. Returns a Location pointing to that declaration line.
     */
    private async findTypeInIncludes(typeName: string, document: TextDocument): Promise<Location | null> {
        const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const result = await this.findTypeDeclarationInIncludes(typeName, fromPath, new Set());
        if (result) return result;

        // If this is a MEMBER module, also scan the parent program file's includes.
        // Types like base classes (e.g. Class(ce_MetroWizardForm)) may only be included
        // in the parent PROGRAM file, not in the MEMBER module.
        const tokens = this.tokenCache.getTokensByUri(document.uri);
        const memberToken = tokens ? TokenHelper.findMemberHeaderToken(tokens) : undefined;
        if (memberToken?.referencedFile) {
            // #328: owner-project-first redirection
            let parentPath: string | null = resolveViaProjectRedirectionFromUri(memberToken.referencedFile, document.uri);
            if (!parentPath) {
                const candidate = path.join(path.dirname(fromPath), memberToken.referencedFile);
                if (fs.existsSync(candidate)) parentPath = candidate;
            }
            if (parentPath) {
                const parentResult = await this.findTypeDeclarationInIncludes(typeName, parentPath, new Set());
                if (parentResult) return parentResult;
            }
        }

        // Fallback: check equates.clw (implicitly global in all Clarion programs)
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            const equatesPath = solutionManager.getEquatesPath();
            if (equatesPath) {
                return this.findTypeDeclarationInIncludes(typeName, equatesPath, new Set());
            }
        }
        return null;
    }

    private async findTypeDeclarationInIncludes(
        typeName: string,
        fromPath: string,
        visited: Set<string>
    ): Promise<Location | null> {
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
            if (!incTokens || incTokens.length === 0) {
                try {
                    const { TextDocument: TD } = await import('vscode-languageserver-textdocument');
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    const incDoc = TD.create(uri, 'clarion', 1, incContent);
                    incTokens = this.tokenCache.getTokens(incDoc);
                } catch { incTokens = null; }
            }

            if (incTokens && incTokens.length > 0) {
                const labelToken = incTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    logger.info(`Found type "${typeName}" in ${resolvedPath}:${labelToken.line}`);
                    return Location.create(uri, Range.create(labelToken.line, 0, labelToken.line, 0));
                }
            }

            const nested = await this.findTypeDeclarationInIncludes(typeName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }


    private async findClassTypeDefinition(word: string, document: TextDocument): Promise<Location | null> {
        let timeoutId: NodeJS.Timeout | undefined;
        const timeout = new Promise<null>(resolve => {
            timeoutId = setTimeout(() => {
                logger.test(`⏱️ [DEF] findClassTypeDefinition timed out for "${word}" — index build too slow`);
                resolve(null);
            }, 10000);
        });
        try {
            return await Promise.race([this._findClassTypeDefinitionInternal(word, document), timeout]);
        } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
    }

    private async _findClassTypeDefinitionInternal(word: string, document: TextDocument): Promise<Location | null> {
        try {
            const info = await this.symbolFinder.findIndexedTypeDeclaration(word, document);
            if (!info) return null;

            const uri = pathToCanonicalUri(info.filePath); // #251: client-facing Location
            logger.test(`✅ ${info.structureType} type F12: "${word}" → ${info.filePath}:${info.line + 1}`);
            return Location.create(uri, Range.create(info.line, 0, info.line, 0));
        } catch (e) {
            logger.error(`findClassTypeDefinition error: ${e}`);
            return null;
        }
    }

    private findVariableType(tokens: Token[], variableName: string, currentLine: number, document?: TextDocument): string | null {
        logger.info(`Looking for type of variable ${variableName}`);

        // Find the variable declaration
        const varTokens = tokens.filter(token =>
            (token.type === TokenType.Variable ||
                token.type === TokenType.ReferenceVariable ||
                token.type === TokenType.ImplicitVariable ||
                token.type === TokenType.Label) &&
            token.value.toLowerCase() === variableName.toLowerCase() &&
            token.start === 0
        );

        if (varTokens.length === 0) {
            // Check if it's a parameter — parse the enclosing procedure's PROCEDURE() signature
            const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, currentLine);
            if (currentScope) {
                const content = document?.getText();
                if (content) {
                    const lines = content.split('\n');
                    const procedureLine = lines[currentScope.line] ?? '';
                    const sigMatch = procedureLine.match(/(?:PROCEDURE|FUNCTION)\s*\((.*?)\)/i); // #247
                    if (sigMatch?.[1]) {
                        const wordLower = variableName.toLowerCase();
                        for (const param of sigMatch[1].split(',')) {
                            const trimmed = param.trim().replace(/^<(.*)>$/, '$1').trim();
                            const m = trimmed.match(/^([*&]?\s*[\w:]+)\s+([A-Za-z_][\w:]*)(?:\s*=.*)?$/i);
                            if (!m) continue;
                            const paramName = m[2];
                            const pLower = paramName.toLowerCase();
                            if (pLower === wordLower || pLower.endsWith(':' + wordLower)) {
                                const typeName = m[1].trim().replace(/^[*&]\s*/, '').trim();
                                if (typeName) {
                                    logger.info(`findVariableType: "${variableName}" is parameter of type "${typeName}"`);
                                    return typeName;
                                }
                            }
                        }
                    }
                }
            }
            return null;
        }

        const varToken = varTokens[0];
        
        // Find the type token on the same line (should be after the variable name)
        const lineTokens = TokenHelper.findTokens(tokens, { line: varToken.line })
            .filter(t => t.start > varToken.start);

        // Handle QUEUE(TypeName), GROUP(TypeName), CLASS(TypeName) — type is inside parens
        const structureToken = lineTokens.find(t => t.type === TokenType.Structure);
        if (structureToken) {
            const afterStructure = lineTokens.filter(t => t.start > structureToken.start);
            const typeArg = afterStructure.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value !== '(' && t.value !== ')'
            );
            if (typeArg) {
                logger.info(`Found structure type arg ${typeArg.value} for variable ${variableName}`);
                return typeArg.value;
            }
        }

        // Handle LIKE(TypeName) — mirrors type of a named variable/type
        const likeToken = lineTokens.find(t => t.type === TokenType.TypeReference);
        if (likeToken) {
            const afterLike = lineTokens.filter(t => t.start > likeToken.start);
            const typeArg = afterLike.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.value !== '(' && t.value !== ')'
            );
            if (typeArg) {
                logger.info(`Found LIKE type arg ${typeArg.value} for variable ${variableName}`);
                return typeArg.value;
            }
        }

        const typeToken = lineTokens.find(t =>
            t.type === TokenType.Type || 
            t.type === TokenType.Label || // Class names appear as labels
            /^[A-Z][A-Za-z0-9_]*$/.test(t.value) // Capitalized word (likely a class name)
        );

        if (typeToken) {
            logger.info(`Found type ${typeToken.value} for variable ${variableName}`);
            return typeToken.value;
        }

        return null;
    }

    /**
     * Checks if cursor is on a declaration line (method declaration or MAP procedure)
     * When on a declaration, F12 should not navigate (already at definition)
     */
    private isOnDeclaration(line: string, position: Position, word: string): boolean {
        // Check if line contains PROCEDURE or FUNCTION keyword (but not a method implementation)
        const hasProcedureKeyword = /\b(PROCEDURE|FUNCTION)\b/i.test(line);
        if (!hasProcedureKeyword) {
            return false;
        }
        
        // Rule out method implementations: ClassName.MethodName or ClassName.IFace.MethodName PROCEDURE
        const isMethodImplementation = /^\s*\w+\.\w+(?:\.\w+)?\s+(PROCEDURE|FUNCTION)/i.test(line);
        if (isMethodImplementation) {
            return false;
        }

        // Check if word appears before PROCEDURE/FUNCTION keyword (declaration pattern)
        // Examples:
        //   SomeMethod   PROCEDURE(...)
        //   TestProc     FUNCTION(...)
        const procMatch = line.match(/^(\s*)(\w+)\s+(PROCEDURE|FUNCTION)/i);
        if (procMatch && procMatch[2].toLowerCase() === word.toLowerCase()) {
            logger.info(`Detected cursor on declaration: ${word}`);
            return true;
        }

        return false;
    }


    /**
     * #211 — Resolves F12 on a routine name in a `DO RoutineName` statement to the `RoutineName ROUTINE` label
     * Routines are procedure-local labels; this method scopes the search to the enclosing procedure only.
     * @param routineName The name of the routine to find (case-insensitive)
     * @param document The text document
     * @param position The position of the DO reference
     * @param tokens The tokens array
     * @returns A Location pointing to the routine definition, or null if not found
     */
    private findRoutineDefinition(routineName: string, document: TextDocument, position: Position, tokens: Token[]): Location | null {
        logger.info(`🔍 [#211] Resolving DO routine reference: "${routineName}"`);

        // #264: the #211 procedure-scoped algorithm now lives in
        // TokenHelper.findScopedRoutineToken, shared with hover (RoutineHoverResolver)
        // and Ctrl+F12 (ImplementationProvider) so all three always agree.
        const structure = this.tokenCache.getStructure(document);
        const routineToken = TokenHelper.findScopedRoutineToken(structure, routineName, position.line);
        if (!routineToken) {
            logger.info(`❌ No ROUTINE label found for "${routineName}" in the enclosing procedure`);
            return null;
        }

        logger.info(`✅ Found ROUTINE "${routineName}" at line ${routineToken.line}`);
        return Location.create(document.uri, Range.create(routineToken.line, 0, routineToken.line, routineToken.value.length));
    }

}
