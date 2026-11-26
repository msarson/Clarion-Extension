import { Hover, Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { MapProcedureResolver } from '../../utils/MapProcedureResolver';
import { TokenHelper } from '../../utils/TokenHelper';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { HoverFormatter } from './HoverFormatter';
import { ClarionPatterns } from '../../utils/ClarionPatterns';
import { ProcedureCallDetector } from '../utils/ProcedureCallDetector';
import LoggerManager from '../../logger';
import { getLocalMapScope } from '../../utils/LocalMapScopeHelper';
import * as fs from 'fs';
import { resolveMemberHeaderTokenForUri } from '../../utils/MemberHeaderResolver';
import { CallSiteArgumentClassifier } from '../../utils/CallSiteArgumentClassifier';
import { MethodOverloadResolver } from '../../utils/MethodOverloadResolver';
import { ArgumentTypeResolver } from '../../utils/ArgumentTypeResolver';

/** #881 — which of a procedure's overloaded prototypes a call picks; see chooseOverload. */
interface OverloadChoice {
    line?: number;
    text?: string;
    list: Array<{ line: number; text: string }>;
}

const logger = LoggerManager.getLogger("ProcedureHoverResolver");
logger.setLevel("error");
const perfLogger = LoggerManager.getLogger("ProcedureHoverResolver.Perf", "perf");

/**
 * Resolves hover information for procedures (MAP declarations and implementations)
 */
export class ProcedureHoverResolver {
    private tokenCache = TokenCache.getInstance();
    private mapResolver: MapProcedureResolver;
    private crossFileResolver: CrossFileResolver;
    private formatter: HoverFormatter;
    private argTypes = new ArgumentTypeResolver();

    constructor(
        mapResolver: MapProcedureResolver,
        crossFileResolver: CrossFileResolver,
        formatter: HoverFormatter
    ) {
        this.mapResolver = mapResolver;
        this.crossFileResolver = crossFileResolver;
        this.formatter = formatter;
    }

    /**
     * Resolves hover for a procedure call (e.g., MyProc() or START(MyProc))
     *
     * `allowArgumentReference` admits the weak `SORT(Queue, CompareProc)` shape, and is
     * false for the router's call, which runs ahead of every variable tier. A bare
     * argument naming an in-scope variable IS that variable — the language resolves it
     * to the nearest declaration, and a same-named procedure is reachable there only as
     * `Name()` — so answering with the procedure from that position would shadow the
     * declaration the compiler picks. HoverProvider passes true from its last tier,
     * once no variable has claimed the word.
     */
    async resolveProcedureCall(
        word: string,
        document: TextDocument,
        position: Position,
        wordRange: any,
        line: string,
        allowArgumentReference = false
    ): Promise<Hover | null> {
        const detection = ProcedureCallDetector.isProcedureCallOrReference(document, position, wordRange);
        const isSelfMethodCall = word.toUpperCase().includes('SELF.') && /\w+\.\w+/.test(word);

        if (!detection.isProcedure || isSelfMethodCall) {
            return null;
        }

        if (detection.isArgumentReference && !allowArgumentReference) {
            return null;
        }

        logger.info(`Detected procedure ${ProcedureCallDetector.getDetectionMessage(word, detection.isStartCall)}`);

        // Sub-step timing — names WHICH part of the proc-call hover is slow (the
        // ~700ms floor): the in-document MAP scan, the cross-file include walk, the
        // implementation resolution, or formatting. Emitted only when slow.
        const rStart = Date.now();
        const st: Array<[string, number]> = [];
        let last = rStart;
        const mk = (n: string) => { const now = Date.now(); st.push([n, now - last]); last = now; };
        const emit = () => {
            const tot = Date.now() - rStart;
            if (tot < 300) return;
            const top = st.filter(([, m]) => m >= 15).sort((a, b) => b[1] - a[1]).slice(0, 6)
                .map(([n, m]) => `${n}=${m}`).join(', ');
            perfLogger.perf("Hover proc breakdown", { total_ms: tot, top: top || '(all <15ms)', word });
        };
        try {
        // Get tokens for parameter counting
        const tokens = this.tokenCache.getTokens(document);
        mk('tokens');

        // Find MAP declaration first
        let mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);
        mk('findMapDecl');
        logger.info(`MAP declaration found: ${!!mapDecl}`);

        // #313: the declaration may live in an INC included inside a MAP (current
        // file's or MEMBER parent's — the WinEvent pattern). findMapDeclaration only
        // scans the current document, so hover at call sites of such procedures was
        // dead. Locate the declaration via the shared walk and resolve the
        // implementation from ITS document — the proven declaration-side path.
        //
        // Skipped for a bare ARGUMENT reference (`SORT(Queue, CompareProc)`): that
        // shape matches every identifier passed as an argument, so most words
        // arriving here are ordinary variables with no declaration to find — and
        // this walk is the expensive one (~89s cold on a large PROGRAM file before
        // its result is memoized). A callback's prototype is visible to the compiler
        // from the calling module, which the cheap in-document MAP scan above
        // already covers.
        //
        // #649: a bare prototype counts too. The INCLUDE puts it in the MAP, and the walk
        // reports which module's MAP that is, which is where the procedure is implemented.
        if (!mapDecl && !detection.isArgumentReference) {
            const hit = await this.mapResolver.findDeclarationInMapIncludes(word, document, tokens, true);
            mk('walkIncludes');
            if (hit) {
                // #881 — the walk answers with the first prototype of the name; the call's
                // arguments pick among its overloads.
                const choice = await this.chooseOverload(word, hit.doc, hit.tokens, hit.declLine, document, position, line, tokens);
                const declLine = choice?.line ?? hit.declLine;
                mapDecl = this.lineLocation(hit.doc, declLine);
                const includeImpl = await this.mapResolver.findImplementationForMapInclude(word, { ...hit, declLine });
                mk('implFromWalk');
                return this.withOverloadList(
                    await this.formatter.formatProcedure(word, mapDecl, includeImpl, document, position), choice);
            }
        }

        let procImpl = null;
        let choice: OverloadChoice | null = null;
        if (mapDecl) {
            // Check if MAP declaration is from an INCLUDE file
            const mapDeclUri = mapDecl.uri;
            const isFromInclude = mapDeclUri !== document.uri;
            
            logger.info(`MAP from INCLUDE: ${isFromInclude}, mapUri: ${mapDeclUri}`);
            
            if (isFromInclude) {
                logger.info(`MAP declaration is from INCLUDE file: ${mapDeclUri}`);
                // Load the INCLUDE file and its tokens
                try {
                    const decodedPath = decodeURIComponent(mapDeclUri.replace('file:///', ''));
                    const includeContent = fs.readFileSync(decodedPath, 'utf-8');
                    const includeDoc = TextDocument.create(mapDeclUri, 'clarion', 1, includeContent);
                    const includeTokens = this.tokenCache.getTokens(includeDoc);

                    // #881 — the declaration found may be the first of several overloads.
                    choice = await this.chooseOverload(word, includeDoc, includeTokens, mapDecl.range.start.line, document, position, line, tokens);
                    if (choice?.line !== undefined) mapDecl = this.lineLocation(includeDoc, choice.line);

                    // Find implementation using INCLUDE file's document and tokens
                    const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                    procImpl = await this.mapResolver.findProcedureImplementation(
                        word,
                        includeTokens,
                        includeDoc,
                        mapPosition,
                        choice?.line !== undefined ? choice.text! : line
                    );
                } catch (error) {
                    logger.info(`Error loading INCLUDE file: ${error}`);
                }
            } else {
                // Find implementation using MAP declaration position in current document
                logger.info(`Looking for implementation in current document at MAP line ${mapDecl.range.start.line}`);
                // #881 — findMapDeclaration picks by argument kinds only; a variable argument
                // needs its declared type to tell the overloads apart.
                choice = await this.chooseOverload(word, document, tokens, mapDecl.range.start.line, document, position, line, tokens);
                if (choice?.line !== undefined) mapDecl = this.lineLocation(document, choice.line);
                const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                procImpl = await this.mapResolver.findProcedureImplementation(
                    word,
                    tokens,
                    document,
                    mapPosition,
                    choice?.line !== undefined ? choice.text! : line,
                    this.tokenCache.getStructure(document) // #258: reuse cached structure
                );
                logger.info(`Implementation found in current document: ${!!procImpl}`);
            }
        }
        
        mk('implFromMapDecl');
        logger.info(`Final result: mapDecl=${!!mapDecl}, procImpl=${!!procImpl}`);

        if (mapDecl || procImpl) {
            return this.withOverloadList(await this.formatter.formatProcedure(word, mapDecl, procImpl, document, position), choice);
        }

        return null;
        } finally {
            emit();
        }
    }

    /**
     * #881 — of a procedure's overloaded prototypes, the one a call's arguments pick, typing
     * variable arguments through the shared ArgumentTypeResolver as signature help and F12 do.
     * `line` is set (with its prototype `text`) when one is picked; otherwise `list` holds the
     * prototypes the arguments leave open, every one when nothing can be read from the call.
     * Null when the name has a single prototype.
     */
    private async chooseOverload(
        word: string, declDoc: TextDocument, declTokens: Token[], declLine: number,
        document: TextDocument, position: Position, callLine: string, tokens: Token[],
    ): Promise<OverloadChoice | null> {
        const protos = this.mapResolver.overloadedPrototypes(word, declTokens, declDoc, declLine);
        if (protos.length < 2) return null;
        const texts = MapProcedureResolver.callArgumentTexts(word, callLine);
        if (!texts) return { list: protos };

        const classifier = new CallSiteArgumentClassifier();
        const args = texts.map(s => classifier.classifyArgumentText(s, tokens));
        await this.argTypes.enrichArgs(args, tokens, document, position);
        const signatures = protos.map(p => p.text.trim());
        const overloads = new MethodOverloadResolver();
        const picked = overloads.findOverloadByArgClassifications(args, signatures);
        if (!picked.matchedAll && picked.matchedIndex >= 0) {
            return { line: protos[picked.matchedIndex].line, text: protos[picked.matchedIndex].text, list: [] };
        }
        const compatible = overloads.filterOverloadsByArgClassifications(args, signatures);
        if (compatible.length === 1) return { line: protos[compatible[0]].line, text: protos[compatible[0]].text, list: [] };
        return { list: compatible.length > 1 ? compatible.map(i => protos[i]) : protos };
    }

    /** #881 — a card for an undecided call lists every prototype left open. */
    private withOverloadList(hover: Hover | null, choice: OverloadChoice | null): Hover | null {
        if (!hover || !choice || choice.list.length < 2) return hover;
        const contents = hover.contents as { kind?: string; value?: string };
        if (typeof contents?.value !== 'string') return hover;
        const prototypes = choice.list.map(p => p.text.trim()).join('\n');
        contents.value += `\n\n---\n\n${choice.list.length} overloads, and the arguments do not pick one:\n\n\`\`\`clarion\n${prototypes}\n\`\`\``;
        return hover;
    }

    private lineLocation(doc: TextDocument, line: number): Location {
        const text = doc.getText({ start: { line, character: 0 }, end: { line, character: Number.MAX_SAFE_INTEGER } }).replace(/\r?\n$/, '');
        return { uri: doc.uri, range: { start: { line, character: 0 }, end: { line, character: text.length } } };
    }

    /**
     * Resolves hover for a procedure implementation (e.g., hovering on "MyProc PROCEDURE")
     */
    async resolveProcedureImplementation(
        document: TextDocument,
        position: Position,
        line: string,
        documentStructure: any
    ): Promise<Hover | null> {
        const mapProcMatch = line.match(ClarionPatterns.PROCEDURE_IMPLEMENTATION);
        logger.info(`MAP procedure regex test: line="${line}", match=${!!mapProcMatch}, inMapBlock=${documentStructure.isInMapBlock(position.line)}`);
        
        if (!mapProcMatch || documentStructure.isInMapBlock(position.line)) {
            return null;
        }

        const procName = mapProcMatch[1]; // [1] is name, [2] is keyword
        const procNameStart = line.indexOf(procName);
        const procNameEnd = procNameStart + procName.length;
        
        // Check if cursor is on the procedure name
        if (position.character < procNameStart || position.character > procNameEnd) {
            return null;
        }

        // Determine scope for this procedure implementation
        const tokens = this.tokenCache.getTokens(document);
        const firstNonCommentToken = tokens.find(t => t.type !== TokenType.Comment);
        const isProgramFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                             firstNonCommentToken.value.toUpperCase() === 'PROGRAM';
        const isMemberFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                            (firstNonCommentToken.value.toUpperCase() === 'MEMBER' || 
                             firstNonCommentToken.value.toUpperCase().startsWith('MEMBER('));
        
        // Find the MAP declaration for this procedure using resolver
        const mapLocation = this.mapResolver.findMapDeclaration(procName, tokens, document, line);
        
        if (!mapLocation) {
            // Not found in current file, check for MEMBER
            logger.info(`MAP declaration not found in current file, checking for MEMBER...`);
            const memberToken = resolveMemberHeaderTokenForUri(tokens, document.uri);
            
            if (memberToken?.referencedFile) {
                logger.info(`Found MEMBER('${memberToken.referencedFile}'), searching parent for MAP declaration`);
                
                const localScope = getLocalMapScope(document.uri);
                // Use CrossFileResolver to find MAP declaration
                const memberMapResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                    procName,
                    memberToken.referencedFile,
                    document,
                    line,
                    localScope?.containingProcedure
                );
                
                if (memberMapResult) {
                    // Found MAP in parent file - use it
                    const implLocation: Location = {
                        uri: document.uri,
                        range: {
                            start: { line: position.line, character: procNameStart },
                            end: { line: position.line, character: procNameEnd }
                        }
                    };

                    return this.formatter.formatProcedure(procName, memberMapResult.location, implLocation, document, position);
                }
            }

            // No MAP prototype anywhere (no local entry, no MEMBER-parent match) — the
            // cursor is still sitting on this procedure's own declaration line, matched
            // by PROCEDURE_IMPLEMENTATION above. Answer with that instead of falling
            // through to variable/EQUATE tiers, which can match an unrelated same-named
            // symbol elsewhere in the solution. A method declared in a CLASS or INTERFACE
            // body matches the same pattern and is left to the method-declaration tier.
            const isStandaloneProcedure = tokens.some(t =>
                t.line === position.line &&
                TokenHelper.isProcedureOrFunction(t) &&
                t.subType === TokenType.GlobalProcedure);
            if (!isStandaloneProcedure) {
                return null;
            }
            const bareImplLocation: Location = {
                uri: document.uri,
                range: {
                    start: { line: position.line, character: procNameStart },
                    end: { line: position.line, character: procNameEnd }
                }
            };

            // #313: the prototype may sit in an INC included inside a MAP (this file's or
            // the MEMBER parent's), which neither lookup above follows. A bare prototype
            // counts there as well as one in a MODULE block.
            const includeHit = await this.mapResolver.findDeclarationInMapIncludes(procName, document, tokens, true);
            if (includeHit) {
                const declLineText = includeHit.doc.getText({
                    start: { line: includeHit.declLine, character: 0 },
                    end: { line: includeHit.declLine, character: Number.MAX_SAFE_INTEGER }
                });
                const includeDecl: Location = {
                    uri: includeHit.doc.uri,
                    range: {
                        start: { line: includeHit.declLine, character: 0 },
                        end: { line: includeHit.declLine, character: declLineText.length }
                    }
                };
                return this.formatter.formatProcedure(procName, includeDecl, bareImplLocation, document, position);
            }

            // formatProcedure returns null for a header-only card, which is all it has here.
            const bareHover = await this.formatter.formatProcedure(procName, null, bareImplLocation, document, position);
            return bareHover ?? {
                contents: {
                    kind: 'markdown',
                    value: `**${procName}** (Procedure)\n\n⚠️ No MAP prototype found`
                }
            };
        } else {
            // Found MAP in current file
            const implLocation: Location = {
                uri: document.uri,
                range: {
                    start: { line: position.line, character: procNameStart },
                    end: { line: position.line, character: procNameEnd }
                }
            };
            
            return this.formatter.formatProcedure(procName, mapLocation, implLocation, document, position);
        }
        
        return null;
    }

    /**
     * Resolves hover for a MAP declaration (e.g., hovering on procedure name in MAP block)
     */
    async resolveMapDeclaration(
        document: TextDocument,
        position: Position,
        line: string,
        documentStructure: any
    ): Promise<Hover | null> {
        if (!documentStructure.isInMapBlock(position.line)) {
            return null;
        }

        logger.info(`Inside MAP block at line ${position.line}`);
        
        // MAP declarations have two formats:
        // 1. Indented: "    MyProc(params)" - no PROCEDURE/FUNCTION keyword
        // 2. Column 0: "MyProc    PROCEDURE(params)" or "MyProc    FUNCTION(params)" - with keyword
        const mapDeclMatch = line.match(ClarionPatterns.MAP_PROCEDURE_DECLARATION);
        logger.info(`MAP declaration regex match: ${mapDeclMatch ? 'YES' : 'NO'}, line="${line}"`);
        
        if (!mapDeclMatch) {
            return null;
        }

        const procName = mapDeclMatch[1];
        const procNameStart = line.indexOf(procName);
        const procNameEnd = procNameStart + procName.length;
        
        logger.info(`Procedure name: "${procName}", range: ${procNameStart}-${procNameEnd}, cursor at: ${position.character}`);
        
        // Check if cursor is on the procedure name
        if (position.character < procNameStart || position.character > procNameEnd) {
            logger.info(`Cursor NOT on procedure name (cursor at ${position.character}, name range ${procNameStart}-${procNameEnd})`);
            return null;
        }

        logger.info(`Cursor is on procedure name, searching for implementation with overload resolution...`);
        
        // Use MapProcedureResolver for overload resolution
        const tokens = this.tokenCache.getTokens(document);
        const implLocation = await this.mapResolver.findProcedureImplementation(
            procName, 
            tokens, 
            document, 
            position, 
            line,
            documentStructure
        );
        
        // Use the standard procedure hover construction
        const mapDecl: Location = {
            uri: document.uri,
            range: {
                start: { line: position.line, character: procNameStart },
                end: { line: position.line, character: procNameEnd }
            }
        };
        
        return this.formatter.formatProcedure(procName, mapDecl, implLocation, document, position);
    }
}
