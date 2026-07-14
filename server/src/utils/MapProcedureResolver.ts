/**
 * Resolves MAP procedure definitions and implementations
 * Uses DocumentStructure as single source of truth for MAP/PROCEDURE relationships
 * Supports overload resolution based on parameter types
 */

import { Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { ProcedureSignatureUtils } from './ProcedureSignatureUtils';
import { ProcedureUtils } from './ProcedureUtils';
import { CallSiteArgumentClassifier } from './CallSiteArgumentClassifier';
import { MethodOverloadResolver } from './MethodOverloadResolver';
import { DocumentStructure } from '../DocumentStructure';
import { ScopeAnalyzer } from './ScopeAnalyzer';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { TokenHelper } from './TokenHelper';
import { pathToCanonicalUri } from './UriUtils';
import { resolveViaProjectRedirection, projectsOwnerFirst } from './RedirectionResolution';
import { cooperativeCheckpoint, makeTimeSlicer } from './cooperativeScan';
import { getCrossFileEpoch } from './crossFileEpoch';
import { StructureDeclarationIndexer } from './StructureDeclarationIndexer';
import LoggerManager from '../logger';
import * as fsSync from 'fs';
import * as pathUtil from 'path';

const logger = LoggerManager.getLogger("MapProcedureResolver");
logger.setLevel("error");

/**
 * #361 — walk-RESULT cache for findDeclarationInMapIncludes, keyed by
 * host+procName. The walk recursively reads + tokenizes the reachable MAP
 * include chain; on IBSCommon.clw a hover over a NetTalk procedure (NetDebugTrace)
 * cost ~89s, and hovering repeatedly around a block re-paid it every time. The
 * walk result (including a NEGATIVE "no declaration reachable") is memoized here
 * and reused until the cross-file epoch bumps (the #340 watcher / #355 drift path
 * — the same invalidation every other cross-file memo uses). Module-level so it
 * survives across the per-request resolver instances.
 */
interface MapDeclWalkHit { docUri: string; declLine: number; }
const mapDeclWalkCache = new Map<string, MapDeclWalkHit | null>();
let mapDeclWalkEpoch = -1;

export class MapProcedureResolver {
    private scopeAnalyzer: ScopeAnalyzer;
    private crossFileCache?: any; // CrossFileCache type (optional to avoid circular dependency)

    constructor(crossFileCache?: any) {
        const tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(tokenCache, solutionManager);
        this.crossFileCache = crossFileCache;
    }

    /**
     * #313 — locate a procedure's declaration inside a MODULE block of an INC that
     * is included in a MAP (the WinEvent pattern: include('winevent.inc') in the
     * PROGRAM's global MAP, module('winevent.clw') blocks inside the INC). Walks
     * INCLUDE targets from the given document AND its MEMBER parent. Shared by the
     * goto-implementation and hover call-site routes — both then run the proven
     * declaration-side resolution from the returned document/position.
     */
    public async findDeclarationInMapIncludes(
        procName: string,
        document: TextDocument,
        tokens: Token[]
    ): Promise<{ doc: TextDocument; tokens: Token[]; declLine: number } | null> {
        // #313 follow-up: MAP procedure names never contain dots — a dotted word is
        // member access, and running this walk for it cost 12s per hover on
        // PARENT._FindFirstBreak in a PROGRAM file (the walk exhaustively cold-loaded
        // every reachable INC before concluding "not a MAP procedure").
        if (procName.includes('.')) return null;

        // #361 — result cache (positive + NEGATIVE), epoch-invalidated. The walk
        // below is ~89s on a big NetTalk PROGRAM file; without this, hovering
        // repeatedly around a block re-pays it every time. A NEGATIVE result
        // (NetDebugTrace is not a reachable MAP proc) is exactly what needs
        // remembering — it's the common, most expensive case.
        const epoch = getCrossFileEpoch();
        if (epoch !== mapDeclWalkEpoch) {
            mapDeclWalkCache.clear();
            mapDeclWalkEpoch = epoch;
        }
        const cacheKey = `${document.uri.toLowerCase()}|${procName.toLowerCase()}`;
        if (mapDeclWalkCache.has(cacheKey)) {
            const cached = mapDeclWalkCache.get(cacheKey)!;
            if (!cached) return null;
            // Re-derive the live doc/tokens (CrossFileCache makes this cheap) so a
            // stale document object is never handed out.
            const reloaded = await this.loadDocForWalk(
                decodeURIComponent(cached.docUri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\'));
            if (reloaded) return { doc: reloaded.document, tokens: reloaded.tokens, declLine: cached.declLine };
            // Reload failed (file gone) — fall through to a fresh walk.
        }

        const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
        const startPaths: string[] = [currentPath];

        const memberToken = TokenHelper.findMemberHeaderToken(tokens);
        if (memberToken?.referencedFile) {
            const parentPath = this.resolveIncludeTarget(memberToken.referencedFile, currentPath);
            if (parentPath) startPaths.push(parentPath);
        }

        // #362 — index-first POSITIVE fast-path. If the procedure index (built by a
        // cheap regex scan, a superset of the reachable includes) knows this proc
        // UNAMBIGUOUSLY, load just that ONE file and confirm it with the SAME
        // module-scoped check the walk uses — parity by construction — instead of
        // tokenizing the whole include chain. A unique hit is safe: this only runs on
        // a proc-CALL hover, so the proc is reachable, and a unique declaration IS the
        // target. Anything else (0, or >1 ambiguous, or the candidate isn't a
        // MODULE-scoped prototype) falls through to the unchanged walk — so this can
        // only speed up, never change an answer. (The negative "skip walk when the
        // index is empty" gate is deliberately NOT taken: a prototype could live in an
        // INCLUDEd .clw the SDI doesn't scan, and the walk must still find it.)
        const procHits = StructureDeclarationIndexer.getInstance().findProcedure(procName);
        if (procHits.length === 1) {
            const loaded = await this.loadDocForWalk(procHits[0].filePath);
            if (loaded) {
                const fastLine = this.findModuleScopedProcDeclLine(loaded.tokens, procName.toLowerCase());
                if (fastLine !== null) {
                    logger.info(`✅ #362: index fast-path — ${procName} in ${pathUtil.basename(procHits[0].filePath)}:${fastLine}`);
                    mapDeclWalkCache.set(cacheKey, { docUri: loaded.document.uri, declLine: fastLine });
                    return { doc: loaded.document, tokens: loaded.tokens, declLine: fastLine };
                }
            }
        }

        const visited = new Set<string>();
        for (const start of startPaths) {
            const hit = await this.findModuleDeclarationInIncludesOf(start, procName, visited, 0, /* mapScopedRoot */ true);
            if (hit) {
                mapDeclWalkCache.set(cacheKey, { docUri: hit.doc.uri, declLine: hit.declLine });
                return hit;
            }
        }
        mapDeclWalkCache.set(cacheKey, null);
        return null;
    }

    /**
     * #362 — the walk's declaration test, extracted so the index fast-path and the
     * walk agree by construction: a MapProcedure/Function token named `nameLower`
     * that sits INSIDE a MODULE block. Returns the 0-based line, or null.
     */
    private findModuleScopedProcDeclLine(tokens: Token[], nameLower: string): number | null {
        const moduleRanges = tokens
            .filter(t => t.type === TokenType.Structure &&
                t.value.toUpperCase() === 'MODULE' && t.finishesAt !== undefined)
            .map(t => ({ start: t.line, end: t.finishesAt! }));
        if (moduleRanges.length === 0) return null;
        const decl = tokens.find(t =>
            (t.subType === TokenType.MapProcedure || t.type === TokenType.Function) &&
            (t.label?.toLowerCase() === nameLower || t.value.toLowerCase() === nameLower) &&
            moduleRanges.some(r => t.line > r.start && t.line < r.end)
        );
        return decl ? decl.line : null;
    }

    /** Same-dir → redirection resolution for an INCLUDE/MEMBER filename (owner-first, #328). */
    private resolveIncludeTarget(fileName: string, fromPath: string): string | null {
        const sameDir = pathUtil.join(pathUtil.dirname(fromPath), fileName);
        if (fsSync.existsSync(sameDir)) return sameDir;
        return resolveViaProjectRedirection(fileName, fromPath);
    }

    /** Load a file's document + tokens, via CrossFileCache when available. */
    private async loadDocForWalk(filePath: string): Promise<{ document: TextDocument; tokens: Token[] } | null> {
        if (this.crossFileCache) {
            const cached = await this.crossFileCache.getOrLoadDocument(filePath);
            if (cached) return { document: cached.document, tokens: cached.tokens };
        }
        try {
            const content = fsSync.readFileSync(filePath, 'utf8');
            const doc = TextDocument.create(pathToCanonicalUri(filePath), 'clarion', 1, content);
            return { document: doc, tokens: TokenCache.getInstance().getTokens(doc) };
        } catch {
            return null;
        }
    }

    /** #313 — recursive INCLUDE walk for a declaration inside a MODULE block. Bounded + cooperative. */
    private async findModuleDeclarationInIncludesOf(
        fromPath: string,
        procName: string,
        visited: Set<string>,
        depth = 0,
        mapScopedRoot = false
    ): Promise<{ doc: TextDocument; tokens: Token[]; declLine: number } | null> {
        if (depth > 4) return null;
        const key = fromPath.toLowerCase();
        if (visited.has(key)) return null;
        visited.add(key);
        if (await cooperativeCheckpoint(visited.size, undefined, 5)) return null;

        const from = await this.loadDocForWalk(fromPath);
        if (!from) return null;

        // #313 follow-up: at the ROOT files, only INCLUDEs that sit INSIDE a MAP block
        // can carry MODULE prototype blocks — walking every include of a PROGRAM file
        // (equates, class headers, …) multiplied the walk by an order of magnitude for
        // guaranteed misses. Files reached FROM a MAP include are MAP content
        // throughout, so the restriction only applies at depth 0.
        let mapRanges: Array<{ start: number; end: number }> | null = null;
        if (mapScopedRoot && depth === 0) {
            mapRanges = from.tokens
                .filter(t => t.type === TokenType.Structure &&
                    t.value.toUpperCase() === 'MAP' && t.finishesAt !== undefined)
                .map(t => ({ start: t.line, end: t.finishesAt! }));
            if (mapRanges.length === 0) return null; // no MAP → no MAP includes
        }

        const includePattern = /INCLUDE\s*\(\s*['"]([^'"]+)['"]/gi;
        const content = from.document.getText();
        const nameLower = procName.toLowerCase();
        let match: RegExpExecArray | null;

        // #361 — the inner loop below loads (and, cold, tokenizes) EVERY include of
        // this file with no yield between them; a big NetTalk chain blocked the event
        // loop ~38s in one stretch. Yield whenever a time budget elapses so the
        // editor stays responsive even on a cold, slow walk.
        const timeSlice = makeTimeSlicer();

        // Offset→line lookup for the MAP-range filter (built once, binary-searched).
        let lineStarts: number[] | null = null;
        if (mapRanges) {
            lineStarts = [0];
            for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) {
                lineStarts.push(i + 1);
            }
        }
        const offsetToLine = (offset: number): number => {
            let lo = 0, hi = lineStarts!.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (lineStarts![mid] <= offset) lo = mid; else hi = mid - 1;
            }
            return lo;
        };

        while ((match = includePattern.exec(content)) !== null) {
            if (mapRanges) {
                const matchLine = offsetToLine(match.index);
                if (!mapRanges.some(r => matchLine > r.start && matchLine < r.end)) continue;
            }
            const incPath = this.resolveIncludeTarget(match[1], fromPath);
            if (!incPath || visited.has(incPath.toLowerCase())) continue;

            await timeSlice(); // #361 — keep the loop responsive across include loads
            const inc = await this.loadDocForWalk(incPath);
            if (!inc) continue;

            // Declaration = MapProcedure/Function token with our name, inside a MODULE block.
            const declLine = this.findModuleScopedProcDeclLine(inc.tokens, nameLower);
            if (declLine !== null) {
                logger.info(`✅ #313: declaration of ${procName} found in MAP-included ${pathUtil.basename(incPath)}:${declLine}`);
                return { doc: inc.document, tokens: inc.tokens, declLine };
            }

            const nested = await this.findModuleDeclarationInIncludesOf(incPath, procName, visited, depth + 1);
            if (nested) return nested;
        }
        return null;
    }

    /**
     * Fast extraction of MODULE block containing a specific procedure from file content
     * Avoids tokenizing entire file by searching for procedure name first
     * @param content File content
     * @param procName Procedure name to search for
     * @returns Object with extracted text and line range, or null if not found
     */
    /**
     * 🚀 PERFORMANCE: Extract MODULE block containing a specific procedure declaration
     * Strategy: Find procedure declaration line, then search UPWARD to find enclosing MODULE
     * This handles multiple procedures in one MODULE and nested MODULEs correctly
     * 
     * @param content File content to search
     * @param procName Procedure name to find
     * @returns Extracted MODULE block with adjusted line numbers, or null if not found
     */
    private extractModuleBlockForProcedure(content: string, procName: string): { text: string; startLine: number; endLine: number } | null {
        const lines = content.split(/\r?\n/);
        
        // Step 1: Find the procedure IMPLEMENTATION (not DLL declaration)
        // Matches both formats:
        //   ProcedureName    PROCEDURE(params)     (column 0)
        //                    ProcedureName PROCEDURE(params)  (indented)
        //   ProcedureName    FUNCTION(params)      (both are valid in Clarion)
        // BUT excludes DLL declarations like: ProcedureName FUNCTION(...),DLL
        const procPattern = new RegExp(
            `^\\s*${procName}\\s+(?:PROCEDURE|FUNCTION)`,
            'im'
        );
        
        let procLineNum = -1;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            
            // Skip comments
            if (trimmed.startsWith('!')) {
                continue;
            }
            
            // Check if line matches procedure pattern
            if (procPattern.test(lines[i])) {
                const upperLine = lines[i].toUpperCase();
                
                // Skip if this is a DLL declaration (has ,DLL attribute)
                if (upperLine.includes(',DLL')) {
                    logger.info(`⏭️ Skipping DLL declaration at line ${i}: ${lines[i].trim()}`);
                    continue;
                }
                
                procLineNum = i;
                logger.info(`🎯 Found procedure ${procName} implementation at line ${i}`);
                break;
            }
        }
        
        if (procLineNum === -1) {
            logger.info(`⚠️ Procedure ${procName} implementation not found in file (may only have DLL declaration)`);
            return null;
        }
        
        // Step 2: Search UPWARD from procLineNum to find enclosing MODULE
        let moduleStartLine = -1;
        let depth = 0; // Track structure nesting depth
        
        for (let i = procLineNum - 1; i >= 0; i--) {
            const trimmed = lines[i].trim();
            const upperLine = trimmed.toUpperCase();
            
            // Skip comments and empty lines
            if (upperLine.startsWith('!') || trimmed === '') {
                continue;
            }
            
            // Look for structure closings (END or .)
            if (upperLine === 'END' || upperLine.startsWith('END ') || upperLine.startsWith('END!') || upperLine === '.') {
                depth++;
            }
            
            // Look for MODULE opening
            if (upperLine.startsWith('MODULE(')) {
                if (depth === 0) {
                    // Found our MODULE! (at the correct nesting level)
                    moduleStartLine = i;
                    logger.info(`✅ Found enclosing MODULE at line ${i}`);
                    break;
                } else {
                    // This MODULE belongs to an outer structure
                    depth--;
                }
            }
            
            // Look for other structure openings that increase depth
            if (upperLine.startsWith('MAP') || upperLine.startsWith('GROUP') || 
                upperLine.startsWith('QUEUE') || upperLine.startsWith('RECORD') ||
                upperLine.startsWith('CLASS') || upperLine.startsWith('INTERFACE')) {
                if (depth > 0) {
                    depth--;
                }
            }
        }
        
        if (moduleStartLine === -1) {
            logger.info(`⚠️ No enclosing MODULE found for procedure ${procName}`);
            return null;
        }
        
        // Step 3: Find MODULE end (search DOWN from moduleStart)
        let moduleEndLine = -1;
        depth = 1; // We're inside the MODULE
        
        for (let i = moduleStartLine + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            const upperLine = trimmed.toUpperCase();
            
            // Skip comments
            if (upperLine.startsWith('!')) {
                continue;
            }
            
            // Look for structure openings
            if (upperLine.startsWith('MODULE(') || upperLine.startsWith('MAP') || 
                upperLine.startsWith('GROUP') || upperLine.startsWith('QUEUE') ||
                upperLine.startsWith('RECORD') || upperLine.startsWith('CLASS') ||
                upperLine.startsWith('INTERFACE')) {
                depth++;
            }
            
            // Look for structure closings
            if (upperLine === 'END' || upperLine.startsWith('END ') || upperLine.startsWith('END!') || upperLine === '.') {
                depth--;
                if (depth === 0) {
                    moduleEndLine = i;
                    logger.info(`✅ Found MODULE end at line ${i}`);
                    break;
                }
            }
        }
        
        if (moduleEndLine === -1) {
            logger.info(`⚠️ Could not find MODULE end for procedure ${procName}`);
            return null;
        }
        
        // Step 4: Extract the MODULE block
        const extractedLines = lines.slice(moduleStartLine, moduleEndLine + 1);
        const extractedText = extractedLines.join('\n');
        
        logger.info(`🚀 Extracted MODULE block: ${extractedLines.length} lines (${extractedText.length} chars)`);
        
        return {
            text: extractedText,
            startLine: moduleStartLine,
            endLine: moduleEndLine
        };
    }

    /**
     * #248: when the "signature" callers pass is actually a raw CALL-SITE line
     * (`x = Rep(4)` — no PROCEDURE/FUNCTION keyword), pick the overload by
     * classifying the call's ARGUMENTS, exactly like the other overload consumers.
     * The legacy extractParameterTypes path required the text to start with
     * `name(` or contain `PROCEDURE(...)`, so a mid-line call yielded [] — which
     * then "exactly matched" a zero-parameter overload.
     *
     * @returns matched candidate index, or -1 when the line isn't a call to
     *   `procName` / the args don't disambiguate (callers keep their existing
     *   conservative fallbacks).
     */
    private pickCandidateByCallArgs(
        procName: string,
        maybeCallLine: string,
        tokens: Token[],
        candidateSignatures: string[]
    ): number {
        // A line containing PROCEDURE/FUNCTION is a genuine signature — not a call.
        if (ProcedureUtils.containsProcedureKeyword(maybeCallLine)) return -1;
        if (candidateSignatures.length < 2) return -1;

        const escaped = procName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const callMatch = new RegExp(`\\b${escaped}\\s*\\(`, 'i').exec(maybeCallLine);
        if (!callMatch) return -1;

        // Extract the balanced-paren argument text (Clarion strings are '...' with '' escapes).
        const openIdx = callMatch.index + callMatch[0].length - 1;
        let depth = 0, inString = false, closeIdx = -1;
        for (let i = openIdx; i < maybeCallLine.length; i++) {
            const ch = maybeCallLine[i];
            if (inString) {
                if (ch === "'") inString = false; // '' re-enters on the next quote
                continue;
            }
            if (ch === "'") { inString = true; continue; }
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) { closeIdx = i; break; }
            }
        }
        if (closeIdx < 0) return -1;
        const argText = maybeCallLine.substring(openIdx + 1, closeIdx);

        // Split top-level commas (depth- and string-aware); keep empty segments —
        // omitted args hold their position (#250).
        const segments: string[] = [];
        let current = '', segDepth = 0, segInString = false;
        for (const ch of argText) {
            if (segInString) {
                current += ch;
                if (ch === "'") segInString = false;
                continue;
            }
            if (ch === "'") { segInString = true; current += ch; continue; }
            if (ch === '(') segDepth++;
            else if (ch === ')') segDepth--;
            if (ch === ',' && segDepth === 0) { segments.push(current); current = ''; continue; }
            current += ch;
        }
        if (current.trim() !== '' || segments.length > 0) segments.push(current);

        const classifier = new CallSiteArgumentClassifier();
        const args = segments.map(s => classifier.classifyArgumentText(s, tokens));
        const result = new MethodOverloadResolver().findOverloadByArgClassifications(
            args, candidateSignatures);
        return (!result.matchedAll && result.matchedIndex >= 0) ? result.matchedIndex : -1;
    }

    /**
     * Finds MAP procedure declaration for a PROCEDURE implementation
     * Searches for MapProcedure tokens or Function tokens inside MAP blocks
     * NOW INCLUDES tokens from MAP INCLUDE files
     * Supports overload resolution based on parameter types
     * @param procName Procedure name
     * @param tokens Document tokens
     * @param document Text document
     * @param implementationSignature Optional implementation signature for overload matching
     * @param containingProcedure Optional — when set, only search MAP blocks inside this procedure (local MAP scope)
     */
    public findMapDeclaration(
        procName: string, 
        tokens: Token[], 
        document: TextDocument,
        implementationSignature?: string,
        containingProcedure?: string
    ): Location | null {
        logger.info(`Looking for MAP declaration for procedure: ${procName}`);

        if (!tokens || tokens.length === 0) {
            logger.info(`No tokens available`);
            return null;
        }

        // #353/#354 — the former debug block here ran a full-document
        // TokenHelper.findTokens({value:'MAP'}) scan (O(token count)) plus a
        // per-token log forEach, purely to feed logger.info calls the "error"
        // log level discards. On a 68k-token program that scan + string-building
        // ran on EVERY hover/F12 — part of the ~700ms per-interaction floor. The
        // authoritative lookup below (findMapStructures) is the only scan needed.
        const mapStructures = TokenHelper.findMapStructures(tokens);

        if (mapStructures.length === 0) {
            logger.info(`No MAP blocks found`);
            return null;
        }

        // Collect all candidate declarations
        const candidates: Array<{ token: Token, signature: string }> = [];

        // Search inside each MAP block
        for (const mapToken of mapStructures) {
            const mapStartLine = mapToken.line;
            const mapEndLine = mapToken.finishesAt;
            
            if (mapEndLine === undefined) continue;

            // When containingProcedure is specified, only search MAPs whose immediate
            // parent in the token tree is the named procedure (local MAP scope).
            if (containingProcedure) {
                const mapParent = mapToken.parent;
                const parentLabel = mapParent?.label ?? mapParent?.value;
                if (!parentLabel || parentLabel.toUpperCase() !== containingProcedure.toUpperCase()) {
                    logger.info(`⏭️ Skipping MAP at line ${mapStartLine} — parent is '${parentLabel}', not '${containingProcedure}'`);
                    continue;
                }
            }

            // ✨ NEW: Get tokens from MAP including INCLUDEs using ScopeAnalyzer
            logger.info(`🗺️ Searching MAP at line ${mapStartLine} (including INCLUDEs)...`);
            const tokensInMap = this.scopeAnalyzer.getMapTokensWithIncludes(mapToken, document, tokens);
            logger.info(`📋 Found ${tokensInMap.length} total tokens in MAP (with INCLUDEs)`);

            // Look for MapProcedure tokens or Function tokens matching our procedure name
            for (const t of tokensInMap) {
                const isMatch = (t.subType === TokenType.MapProcedure && 
                                 (t.label?.toLowerCase() === procName.toLowerCase() || 
                                  t.value.toLowerCase().startsWith(procName.toLowerCase()))) ||
                                (t.type === TokenType.Function && 
                                 t.value.toLowerCase() === procName.toLowerCase());
                
                if (isMatch) {
                    // Get the full line as signature
                    // If token is from an INCLUDE, get content from the INCLUDE file
                    let signature: string;
                    let sourceUri: string;
                    
                    if (t.sourceFile && t.sourceContext?.isFromInclude) {
                        // Token is from an INCLUDE file
                        logger.info(`   Token found in INCLUDE file: ${t.sourceFile}`);
                        sourceUri = pathToCanonicalUri(t.sourceFile); // #251
                        
                        // Read the INCLUDE file to get the signature
                        try {
                            const fs = require('fs');
                            const content = fs.readFileSync(t.sourceFile, 'utf8');
                            const lines = content.split('\n');
                            signature = lines[t.line]?.trim() || '';
                        } catch (error) {
                            logger.info(`   ⚠️ Could not read INCLUDE file: ${error}`);
                            signature = t.value;
                        }
                    } else {
                        // Token is from the current document
                        sourceUri = document.uri;
                        const content = document.getText();
                        const lines = content.split('\n');
                        signature = lines[t.line].trim();
                    }
                    
                    candidates.push({ token: t, signature });
                    logger.info(`✅ Found MAP declaration candidate at line ${t.line}: ${signature}`);
                    if (t.sourceFile) {
                        logger.info(`   📁 Source: ${t.sourceFile}`);
                    }
                }
            }
        }

        if (candidates.length === 0) {
            logger.info(`No MAP declaration found for ${procName}`);
            return null;
        }

        // If only one candidate, return it
        if (candidates.length === 1) {
            const candidate = candidates[0];
            const targetUri = candidate.token.sourceFile && candidate.token.sourceContext?.isFromInclude
                ? pathToCanonicalUri(candidate.token.sourceFile) // #251
                : document.uri;
            
            logger.info(`Found single MAP declaration for ${procName} at line ${candidate.token.line}`);
            if (candidate.token.sourceFile) {
                logger.info(`   📁 Location: ${targetUri}`);
            }
            
            return Location.create(targetUri, {
                start: { line: candidate.token.line, character: 0 },
                end: { line: candidate.token.line, character: candidate.token.value.length }
            });
        }

        // Multiple candidates - use overload resolution
        logger.info(`Found ${candidates.length} overloaded MAP declarations for ${procName}`);

        // #248: callers routinely pass the raw CALL-SITE line here — pick the overload
        // by classifying the call's arguments before attempting signature-vs-signature
        // matching (which mis-fired on call lines: [] "matched" a 0-param overload).
        if (implementationSignature) {
            const picked = this.pickCandidateByCallArgs(
                procName, implementationSignature, tokens, candidates.map(c => c.signature));
            if (picked >= 0) {
                const candidate = candidates[picked];
                const targetUri = candidate.token.sourceFile && candidate.token.sourceContext?.isFromInclude
                    ? pathToCanonicalUri(candidate.token.sourceFile) // #251
                    : document.uri;
                logger.info(`✅ [#248] Call-args matched MAP decl at line ${candidate.token.line}`);
                return Location.create(targetUri, {
                    start: { line: candidate.token.line, character: 0 },
                    end: { line: candidate.token.line, character: candidate.token.value.length }
                });
            }
        }

        // If implementation signature provided, try type matching
        if (implementationSignature && ProcedureUtils.containsProcedureKeyword(implementationSignature)) {
            const implParams = ProcedureSignatureUtils.extractParameterTypes(implementationSignature);
            logger.info(`Implementation parameter types: [${implParams.join(', ')}]`);
            
            for (const candidate of candidates) {
                const declParams = ProcedureSignatureUtils.extractParameterTypes(candidate.signature);
                logger.info(`Declaration at line ${candidate.token.line} parameter types: [${declParams.join(', ')}]`);
                
                if (ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                    const targetUri = candidate.token.sourceFile && candidate.token.sourceContext?.isFromInclude
                        ? pathToCanonicalUri(candidate.token.sourceFile) // #251
                        : document.uri;
                    
                    logger.info(`✅ Found exact type match at line ${candidate.token.line}`);
                    if (candidate.token.sourceFile) {
                        logger.info(`   📁 Location: ${targetUri}`);
                    }
                    
                    return Location.create(targetUri, {
                        start: { line: candidate.token.line, character: 0 },
                        end: { line: candidate.token.line, character: candidate.token.value.length }
                    });
                }
            }
            
            logger.info(`No exact type match found, returning first candidate`);
        }

        // Fallback to first candidate
        const firstCandidate = candidates[0];
        const targetUri = firstCandidate.token.sourceFile && firstCandidate.token.sourceContext?.isFromInclude
            ? pathToCanonicalUri(firstCandidate.token.sourceFile) // #251
            : document.uri;
        
        logger.info(`Returning first MAP declaration at line ${firstCandidate.token.line}`);
        if (firstCandidate.token.sourceFile) {
            logger.info(`   📁 Location: ${targetUri}`);
        }
        
        return Location.create(targetUri, {
            start: { line: firstCandidate.token.line, character: 0 },
            end: { line: firstCandidate.token.line, character: firstCandidate.token.value.length }
        });
    }

    /**
     * Finds PROCEDURE implementation for a MAP declaration
     * Position must be inside a MAP block
     * Supports overload resolution based on parameter types
     * @param procName Procedure name
     * @param tokens Document tokens
     * @param document Text document
     * @param position Position in MAP declaration
     * @param declarationSignature Optional declaration signature for overload matching
     * @param documentStructure Optional pre-built DocumentStructure (for performance)
     */
    public async findProcedureImplementation(
        procName: string, 
        tokens: Token[], 
        document: TextDocument, 
        position: Position,
        declarationSignature?: string,
        documentStructure?: DocumentStructure
    ): Promise<Location | null> {
        logger.info(`Looking for implementation of ${procName} from position ${position.line}`);

        if (!tokens || tokens.length === 0) {
            logger.info(`No tokens available`);
            return null;
        }

        // Check if we're inside a PROCEDURE/ROUTINE block - if so, skip MAP logic
        // (we're in actual code, not in a MAP declaration section)
        // NOTE: Exclude ClarionDocument (PROGRAM/MODULE) since MAP declarations are inside those
        const procedureBlocks = TokenHelper.findTokens(tokens, {
            subType: TokenType.GlobalProcedure,
            beforeLine: position.line + 1,
            afterLine: position.line - 1
        }).filter(t => 
            t.finishesAt !== undefined &&
            t.finishesAt >= position.line
        );

        logger.info(`Checking if position ${position.line} is inside PROCEDURE/PROGRAM block. Found ${procedureBlocks.length} blocks containing this position`);
        if (procedureBlocks.length > 0) {
            logger.info(`Position ${position.line} is inside a PROCEDURE/ROUTINE/PROGRAM block (line ${procedureBlocks[0].line}-${procedureBlocks[0].finishesAt}), not a MAP declaration`);
            return null;
        }

        // Check if position is inside a MAP block using DocumentStructure.
        // #258: production call sites now pass the CACHED structure via `documentStructure`
        // (previously all omitted it, re-processing the shared cache tokens on every
        // hover/F12/Ctrl+F12). The build-from-passed-tokens fallback remains for direct
        // callers (tests) whose tokens are authoritative and may not be cache-backed.
        const docStructure = documentStructure || new DocumentStructure(tokens);
        if (!documentStructure) {
            docStructure.process();
        }
        
        // Special case: If the document is an INCLUDE file (has MODULE at top level without MAP)
        // and position is on a procedure declaration, find implementation via MODULE
        const isInMap = docStructure.isInMapBlock(position.line);
        const isIncludeFile = !isInMap;
        
        if (isIncludeFile) {
            logger.info(`Position ${position.line} is not inside a MAP block - checking if this is an INCLUDE file`);
            
            // Look for MODULE blocks in this file
            const moduleBlocks = TokenHelper.findTokens(tokens, {
                type: TokenType.Structure,
                value: 'MODULE'
            }).filter(t => t.referencedFile);
            
            if (moduleBlocks.length > 0) {
                logger.info(`   Found ${moduleBlocks.length} MODULE block(s) with referencedFile in this file`);
                
                // Check if the position is within any MODULE block (position could be on declaration inside MODULE)
                for (const moduleBlock of moduleBlocks) {
                    const moduleToken = moduleBlock;
                    logger.info(`   Checking MODULE('${moduleToken.referencedFile}') at line ${moduleToken.line}, finishesAt ${moduleToken.finishesAt}`);
                    
                    // Check if position is within this MODULE block
                    if (position.line >= moduleToken.line && 
                        moduleToken.finishesAt !== undefined && 
                        position.line <= moduleToken.finishesAt) {
                        
                        logger.info(`   Position ${position.line} is within MODULE block - this is an INCLUDE file`);
                        
                        // Find if the position is on a procedure declaration in this MODULE block
                        const procAtPosition = tokens.find(t =>
                            t.line === position.line &&
                            (t.subType === TokenType.MapProcedure || t.type === TokenType.Function) &&
                            (t.label?.toLowerCase() === procName.toLowerCase() || 
                             t.value.toLowerCase() === procName.toLowerCase())
                        );
                        
                        if (procAtPosition && moduleToken.referencedFile) {
                            logger.info(`   Position is on procedure declaration ${procName}, searching in MODULE file ${moduleToken.referencedFile}`);
                            const externalImpl = await this.findImplementationInModuleFile(
                                procName,
                                moduleToken.referencedFile,
                                document,
                                declarationSignature
                            );
                            if (externalImpl) {
                                return externalImpl;
                            }
                            logger.info(`   No implementation found in MODULE file`);
                        }
                    }
                }
            }
            
            logger.info(`Position ${position.line} is not inside a MAP block and not a MODULE INCLUDE file`);
            return null;
        }

        // Get MAP blocks for MODULE lookup
        const mapBlocks = docStructure.getMapBlocks();
        const mapBlock = mapBlocks.find(m =>
            m.line < position.line &&
            m.finishesAt !== undefined &&
            m.finishesAt > position.line
        );

        if (!mapBlock) {
            logger.info(`Could not find MAP block containing position ${position.line}`);
            return null;
        }
        
        // Get all tokens from MAP including INCLUDEs to find MODULE references
        const tokensInMap = this.scopeAnalyzer.getMapTokensWithIncludes(mapBlock, document, tokens);
        logger.info(`   📋 Got ${tokensInMap.length} tokens from MAP (including INCLUDEs)`);
        
        // Find the MODULE block that contains the current position
        // When checking tokens from INCLUDE files, we need to look for MODULE tokens
        // that might reference the implementation file
        const moduleBlocks = tokensInMap.filter(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === 'MODULE'
        );
        
        logger.info(`   Found ${moduleBlocks.length} MODULE blocks in MAP`);
        
        // Look for MODULE with referencedFile that matches our procedure
        for (const moduleBlock of moduleBlocks) {
            // Find the MODULE keyword token (with referencedFile) 
            const moduleTokens = tokensInMap.filter(t =>
                t.line === moduleBlock.line &&
                t.value.toUpperCase() === 'MODULE' &&
                t.referencedFile
            );
            
            if (moduleTokens.length > 0) {
                const moduleToken = moduleTokens[0];
                logger.info(`   MODULE('${moduleToken.referencedFile}') found at line ${moduleToken.line}`);
                
                // Check if the procedure we're looking for is declared within this MODULE block
                const proceduresInModule = tokensInMap.filter(t =>
                    t.line > moduleBlock.line &&
                    t.line < (moduleBlock.finishesAt || Infinity) &&
                    (t.subType === TokenType.MapProcedure || t.type === TokenType.Function) &&
                    (t.label?.toLowerCase() === procName.toLowerCase() || 
                     t.value.toLowerCase() === procName.toLowerCase())
                );
                
                if (proceduresInModule.length > 0 && moduleToken.referencedFile) {
                    logger.info(`   Found procedure ${procName} in MODULE block, searching external file`);
                    const externalImpl = await this.findImplementationInModuleFile(
                        procName, 
                        moduleToken.referencedFile,
                        document,
                        declarationSignature
                    );
                    if (externalImpl) {
                        return externalImpl;
                    }
                    logger.info(`   No implementation found in MODULE file`);
                }
            }
        }
        
        logger.info(`   No MODULE reference found for procedure, searching current file`);

        // Find all GlobalProcedure implementations with matching name in current file
        const candidates: Array<{ token: Token, signature: string }> = [];
        
        const implementations = TokenHelper.findTokens(tokens, {
            subType: TokenType.GlobalProcedure
        }).filter(t => t.label?.toLowerCase() === procName.toLowerCase());

        if (implementations.length === 0) {
            logger.info(`No implementation found for ${procName}`);
            return null;
        }

        // Collect signatures for all implementations
        const content = document.getText();
        const lines = content.split('\n');
        
        for (const impl of implementations) {
            const signature = lines[impl.line].trim();
            candidates.push({ token: impl, signature });
            logger.info(`Found implementation candidate at line ${impl.line}: ${signature}`);
        }

        // If only one candidate, return it
        if (candidates.length === 1) {
            const impl = candidates[0].token;
            logger.info(`Found single implementation for ${procName} at line ${impl.line}`);
            return Location.create(document.uri, {
                start: { line: impl.line, character: 0 },
                end: { line: impl.line, character: impl.value.length }
            });
        }

        // Multiple candidates - use overload resolution
        logger.info(`Found ${candidates.length} overloaded implementations for ${procName}`);

        // #248: callers routinely pass the raw CALL-SITE line here — pick the overload
        // by classifying the call's arguments before signature-vs-signature matching.
        if (declarationSignature) {
            const picked = this.pickCandidateByCallArgs(
                procName, declarationSignature, tokens, candidates.map(c => c.signature));
            if (picked >= 0) {
                const candidate = candidates[picked];
                logger.info(`✅ [#248] Call-args matched implementation at line ${candidate.token.line}`);
                return Location.create(document.uri, {
                    start: { line: candidate.token.line, character: 0 },
                    end: { line: candidate.token.line, character: candidate.token.value.length }
                });
            }
        }

        // If declaration signature provided, try type matching
        if (declarationSignature && ProcedureUtils.containsProcedureKeyword(declarationSignature)) {
            const declParams = ProcedureSignatureUtils.extractParameterTypes(declarationSignature);
            logger.info(`Declaration parameter types: [${declParams.join(', ')}]`);
            
            for (const candidate of candidates) {
                const implParams = ProcedureSignatureUtils.extractParameterTypes(candidate.signature);
                logger.info(`Implementation at line ${candidate.token.line} parameter types: [${implParams.join(', ')}]`);
                
                if (ProcedureSignatureUtils.parametersMatch(declParams, implParams)) {
                    logger.info(`✅ Found exact type match at line ${candidate.token.line}`);
                    return Location.create(document.uri, {
                        start: { line: candidate.token.line, character: 0 },
                        end: { line: candidate.token.line, character: candidate.token.value.length }
                    });
                }
            }
            
            logger.info(`No exact type match found, returning first candidate`);
        }

        // Fallback to first candidate
        const impl = candidates[0].token;
        logger.info(`Returning first implementation at line ${impl.line}`);
        return Location.create(document.uri, {
            start: { line: impl.line, character: 0 },
            end: { line: impl.line, character: impl.value.length }
        });
    }

    /**
     * Search for procedure implementation in external MODULE file
     * Uses RedirectionParser to resolve file path
     * @param procName Procedure name to find
     * @param moduleFile Filename from MODULE('filename')
     * @param document Current document (for path resolution context)
     * @param declarationSignature Optional signature for overload matching
     */
    private async findImplementationInModuleFile(
        procName: string,
        moduleFile: string,
        document: TextDocument,
        declarationSignature?: string
    ): Promise<Location | null> {
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            // Try to resolve the file path using redirection
            const SolutionManager = (await import('../solution/solutionManager')).SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            
            let resolvedPath: string | null = null;
            // #328: owner-first base for every redirection lookup in this walk
            const fromFsPath328 = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');

            // #299: MODULE('X.DLL') / MODULE('X.LIB') is an external-library identifier (docs:
            // "may contain any unique identifier"), typically another project in this solution.
            // The old flow required redirection to resolve the PHYSICAL binary before trying the
            // source-project fallback — a DLL that isn't built (or whose output dir isn't in the
            // RED paths) dead-ended F12 even though every needed source file is in the solution.
            // Go straight from the library basename to its main source (IBSUTILS.DLL →
            // ibsutils.clw); the existing MAP-walk below then follows the real MODULE('x.clw').
            // #313 (docs: MODULE — "specify MEMBER source file"): the sourcefile string
            // routinely OMITS the extension — the Language Reference's own example is
            // MODULE('Loadit') for loadit.clw, and shipped headers do the same
            // (MODULE('cwHH') in cwhh.inc). An extensionless name that resolves as
            // '<name>.clw' is a source module; only names that DON'T are treated as
            // external-library identifiers ("may contain any unique identifier" — the
            // #292/#299 case). Previously extname('cwHH')==='' routed straight into the
            // external-library branch and hard-returned null.
            let effectiveModuleFile = moduleFile;
            const moduleExt = path.extname(moduleFile).toLowerCase();
            let isSourceModule = ['.clw', '.inc', '.equ', '.eq', '.int'].includes(moduleExt);
            if (moduleExt === '') {
                const clwCandidate = `${moduleFile}.clw`;
                let clwResolved = resolveViaProjectRedirection(clwCandidate, fromFsPath328) !== null; // #328 owner-first
                if (!clwResolved) {
                    const currentDir = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
                    clwResolved = fs.existsSync(path.join(currentDir, clwCandidate));
                }
                if (clwResolved) {
                    logger.info(`✅ #313: extensionless MODULE('${moduleFile}') resolves as source module ${clwCandidate}`);
                    effectiveModuleFile = clwCandidate;
                    isSourceModule = true;
                }
            }
            if (!isSourceModule && solutionManager && solutionManager.solution) {
                const libBase = path.basename(moduleFile, path.extname(moduleFile)).toLowerCase();
                for (const proj of solutionManager.solution.projects) {
                    const mainFile = (proj.sourceFiles || []).find(sf =>
                        sf?.name && sf.name.toLowerCase() === `${libBase}.clw`);
                    if (mainFile) {
                        const fullPath = path.join(proj.path, mainFile.relativePath);
                        if (fs.existsSync(fullPath)) {
                            logger.info(`✅ #299: external-library MODULE '${moduleFile}' mapped to main source ${fullPath}`);
                            resolvedPath = fullPath;
                            break;
                        }
                    }
                }
                if (!resolvedPath) {
                    logger.info(`❌ #299: no project main source found for external-library MODULE '${moduleFile}'`);
                    return null;
                }
            }

            // Try solution-wide redirection first
            if (!resolvedPath && solutionManager && solutionManager.solution) {
                for (const project of projectsOwnerFirst(fromFsPath328)) { // #328 owner-first
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(effectiveModuleFile);
                    logger.info(`RedirectionParser.findFile('${effectiveModuleFile}') returned:`, resolved);
                    if (resolved && typeof resolved.path === 'string' && fs.existsSync(resolved.path)) {
                        resolvedPath = String(resolved.path);
                        logger.info(`✅ Resolved MODULE file via redirection: ${resolvedPath}`);
                        
                        // Check immediately if this is a DLL/LIB (before any file operations)
                        const ext = path.extname(resolvedPath).toLowerCase();
                        if (ext === '.dll' || ext === '.lib') {
                            logger.info(`⚠️ Resolved to compiled binary (${ext}), searching for source file instead`);
                            
                            // Try to find the source file in other projects
                            // Strategy: Find the main CLW file for this DLL (e.g., IBSCommon.clw for IBSCOMMON.DLL)
                            // That file will have a MAP which declares where the procedure is implemented
                            const actualExt = path.extname(resolvedPath);
                            const baseName = path.basename(resolvedPath, actualExt);
                            logger.info(`🔍 Looking for main source file with base name: "${baseName}" (ext: "${ext}", from: "${resolvedPath}")`);
                            logger.info(`📚 Total projects in solution: ${solutionManager.solution.projects.length}`);
                            let sourceFound = false;
                            
                            for (const proj of solutionManager.solution.projects) {
                                logger.info(`   🏗️ Checking project: ${proj.name} at ${proj.path}`);
                                const sourceFiles = proj.sourceFiles || [];
                                
                                // Look for exact match first: IBSCommon.clw for IBSCOMMON.DLL
                                const mainFile = sourceFiles.find(sf => {
                                    if (!sf || !sf.name) return false;
                                    if (!sf.name.toLowerCase().endsWith('.clw')) return false;
                                    
                                    const sfBase = path.basename(sf.name, path.extname(sf.name)).toLowerCase();
                                    const searchBase = baseName.toLowerCase();
                                    return sfBase === searchBase;
                                });
                                
                                if (mainFile) {
                                    const fullPath = path.join(proj.path, mainFile.relativePath);
                                    if (fs.existsSync(fullPath)) {
                                        logger.info(`   ✅ Found main source file: ${mainFile.name}`);
                                        resolvedPath = fullPath;
                                        sourceFound = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (!sourceFound) {
                                logger.info(`❌ No main source file found for ${baseName}, cannot search in compiled binary`);
                                return null;
                            }
                        }
                        
                        break;
                    }
                }
            }
            
            // Fallback to relative path from current document
            if (!resolvedPath) {
                const currentDir = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
                const relativePath = path.join(currentDir, effectiveModuleFile);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                    logger.info(`✅ Resolved MODULE file via relative path: ${resolvedPath}`);
                }
            }

            if (!resolvedPath) {
                logger.info(`❌ Could not resolve MODULE file: ${effectiveModuleFile}`);
                return null;
            }
            
            // At this point, resolvedPath points to a source CLW file
            logger.debug(`📖 Loading source file: ${resolvedPath}`);
            
            // Use cache if available, otherwise read from disk
            let content: string;
            if (this.crossFileCache) {
                const cached = await this.crossFileCache.getOrLoadDocument(resolvedPath);
                if (cached) {
                    content = cached.document.getText();
                } else {
                    content = fs.readFileSync(resolvedPath, 'utf8');
                }
            } else {
                content = fs.readFileSync(resolvedPath, 'utf8');
            }
            
            // 🚀 PERFORMANCE: Try fast extraction first - only tokenize the MODULE block we need
            const extracted = this.extractModuleBlockForProcedure(content, procName);
            
            if (extracted) {
                logger.info(`🚀 Fast extraction: Found MODULE block (${extracted.text.length} chars) at lines ${extracted.startLine}-${extracted.endLine}`);
                
                // Check if the extracted block starts with MODULE('xxx.CLW')
                const firstLine = extracted.text.split(/\r?\n/)[0];
                const moduleMatch = firstLine.match(/MODULE\s*\(\s*'([^']+\.CLW)'\s*\)/i);
                
                if (moduleMatch) {
                    // Direct MODULE reference to a CLW file - resolve and search for implementation
                    const clwFile = moduleMatch[1];
                    logger.info(`🎯 Extracted MODULE references CLW file: ${clwFile}`);
                    
                    const solutionManager = SolutionManager.getInstance();
                    if (solutionManager && solutionManager.solution) {
                        for (const proj of projectsOwnerFirst(fromFsPath328)) { // #328 owner-first
                            const redirectionParser = proj.getRedirectionParser();
                            const resolved = redirectionParser.findFile(clwFile);
                            if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                                logger.info(`✅ Resolved CLW file: ${resolved.path}`);
                                const clwContent = fs.readFileSync(resolved.path, 'utf8');
                                const clwUri = pathToCanonicalUri(resolved.path);
                                const clwDocument = TextDocument.create(clwUri, 'clarion', 1, clwContent);
                                const tokenCache = TokenCache.getInstance();
                                const clwTokens = tokenCache.getTokens(clwDocument);
                                
                                // Find the procedure implementation
                                const impl = clwTokens.find(t =>
                                    t.subType === TokenType.GlobalProcedure &&
                                    t.label?.toLowerCase() === procName.toLowerCase()
                                );
                                
                                if (impl) {
                                    logger.info(`✅ Found implementation in ${path.basename(resolved.path)} at line ${impl.line}`);
                                    return Location.create(pathToCanonicalUri(resolved.path), { // #251
                                        start: { line: impl.line, character: 0 },
                                        end: { line: impl.line, character: impl.value.length }
                                    });
                                }
                                
                                logger.info(`⚠️ Implementation not found in ${path.basename(resolved.path)}`);
                                break;
                            }
                        }
                    }
                    
                    logger.info(`⚠️ Could not resolve or find implementation in ${clwFile}`);
                    return null;
                }
                
                // Otherwise, tokenize the extracted block and look for MAP structure
                const ClarionTokenizer = (await import('../ClarionTokenizer')).ClarionTokenizer;
                const tokenizer = new ClarionTokenizer(extracted.text);
                const moduleTokens = tokenizer.tokenize();
                
                // Adjust line numbers in tokens to match original file
                moduleTokens.forEach(t => {
                    if (typeof t.line === 'number') {
                        t.line += extracted.startLine;
                    }
                });
                
                // Find the MAP in the extracted block
                const DocumentStructure = (await import('../DocumentStructure')).DocumentStructure;
                const docStructure = new DocumentStructure(moduleTokens);
                const mapBlocks = docStructure.getMapBlocks();
                
                if (mapBlocks.length > 0) {
                    // Search in the MAP for the procedure declaration
                    const mapTokens = this.scopeAnalyzer.getMapTokensWithIncludes(
                        mapBlocks[0],
                        { uri: pathToCanonicalUri(resolvedPath), getText: () => extracted.text } as TextDocument, // #251
                        moduleTokens
                    );
                    
                    // Find the procedure in the MAP
                    const procTokens = mapTokens.filter(t =>
                        (t.subType === TokenType.MapProcedure || t.subType === TokenType.Function) &&
                        t.label?.toLowerCase() === procName.toLowerCase()
                    );
                    
                    if (procTokens.length > 0) {
                        const procToken = procTokens[0];
                        logger.info(`✅ Found procedure ${procName} declaration in MAP at line ${procToken.line}`);
                        
                        // Find the MODULE token that contains this procedure
                        const moduleTokenInMap = mapTokens.find(t =>
                            t.value.toUpperCase() === 'MODULE' &&
                            t.referencedFile &&
                            t.line < procToken.line
                        );
                        
                        if (moduleTokenInMap?.referencedFile) {
                            logger.info(`🎯 Procedure is in MODULE('${moduleTokenInMap.referencedFile}')`);
                            logger.info(`📄 MODULE references a CLW file, searching for direct implementation`);
                            
                            // Resolve the CLW file
                            const solutionManager = SolutionManager.getInstance();
                            if (solutionManager && solutionManager.solution) {
                                for (const proj of projectsOwnerFirst(fromFsPath328)) { // #328 owner-first
                                    const redirectionParser = proj.getRedirectionParser();
                                    const resolved = redirectionParser.findFile(moduleTokenInMap.referencedFile);
                                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                                        logger.info(`✅ Resolved CLW file: ${resolved.path}`);
                                        const clwContent = fs.readFileSync(resolved.path, 'utf8');
                                        const clwUri = pathToCanonicalUri(resolved.path);
                                        const clwDocument = TextDocument.create(clwUri, 'clarion', 1, clwContent);
                                        const tokenCache = TokenCache.getInstance();
                                        const clwTokens = tokenCache.getTokens(clwDocument);
                                        
                                        // Find the procedure implementation
                                        const impl = clwTokens.find(t =>
                                            t.subType === TokenType.GlobalProcedure &&
                                            t.label?.toLowerCase() === procName.toLowerCase()
                                        );
                                        
                                        if (impl) {
                                            logger.info(`✅ Found implementation in ${path.basename(resolved.path)} at line ${impl.line}`);
                                            return Location.create(pathToCanonicalUri(resolved.path), { // #251
                                                start: { line: impl.line, character: 0 },
                                                end: { line: impl.line, character: impl.value.length }
                                            });
                                        }
                                        
                                        logger.info(`⚠️ Implementation not found in ${path.basename(resolved.path)}`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Fast extraction didn't find the implementation - return null instead of falling through
                logger.info(`⚠️ Fast extraction found MAP but no implementation for ${procName}`);
                return null;
            }
            
            // Fallback: Use full tokenization if fast extraction failed
            logger.info(`⚠️ Fast extraction failed, falling back to full tokenization`);
            const fileUri = pathToCanonicalUri(resolvedPath);
            const moduleDocument = TextDocument.create(fileUri, 'clarion', 1, content);
            const tokenCache = TokenCache.getInstance();
            const moduleTokens = tokenCache.getTokens(moduleDocument);
            
            // Find the MAP in this file
            const DocumentStructure = (await import('../DocumentStructure')).DocumentStructure;
            const docStructure = new DocumentStructure(moduleTokens);
            const mapBlocks = docStructure.getMapBlocks();
            
            if (mapBlocks.length === 0) {
                logger.info(`⚠️ No MAP found in ${path.basename(resolvedPath)}, searching for procedure directly`);
                // Fallback: search for procedure implementation directly in this file
                const implementations = moduleTokens.filter(t =>
                    t.subType === TokenType.GlobalProcedure &&
                    t.label?.toLowerCase() === procName.toLowerCase()
                );
                
                if (implementations.length > 0) {
                    const impl = implementations[0];
                    logger.info(`✅ Found implementation directly in file at line ${impl.line}`);
                    return Location.create(pathToCanonicalUri(resolvedPath), { // #251
                        start: { line: impl.line, character: 0 },
                        end: { line: impl.line, character: impl.value.length }
                    });
                }
                
                logger.info(`No implementation found for ${procName}`);
                return null;
            }
            
            logger.info(`📋 Found MAP in ${path.basename(resolvedPath)}, searching for procedure declaration`);
            const mapBlock = mapBlocks[0];
            
            // Get all tokens from the MAP (including INCLUDEs)
            const mapTokens = this.scopeAnalyzer.getMapTokensWithIncludes(
                mapBlock, 
                { uri: pathToCanonicalUri(resolvedPath), getText: () => content } as TextDocument, // #251
                moduleTokens
            );
            
            logger.info(`📊 Got ${mapTokens.length} tokens from MAP (including INCLUDEs)`);
            
            // Find the procedure declaration in the MAP
            const procDeclarations = mapTokens.filter(t =>
                (t.subType === TokenType.MapProcedure || t.type === TokenType.Function) &&
                (t.label?.toLowerCase() === procName.toLowerCase() || 
                 t.value.toLowerCase() === procName.toLowerCase())
            );
            
            if (procDeclarations.length === 0) {
                logger.info(`⚠️ Procedure ${procName} not declared in MAP of ${path.basename(resolvedPath)}`);
                logger.info(`   Searching for direct implementation in file (may be declared in parent PROGRAM's MODULE block)`);
                
                // Fallback: The procedure might be declared in the parent file's MODULE block
                // but implemented directly in this file
                const implementations = moduleTokens.filter(t =>
                    t.subType === TokenType.GlobalProcedure &&
                    t.label?.toLowerCase() === procName.toLowerCase()
                );
                
                if (implementations.length > 0) {
                    const impl = implementations[0];
                    logger.info(`✅ Found direct implementation in file at line ${impl.line}`);
                    return Location.create(pathToCanonicalUri(resolvedPath), { // #251
                        start: { line: impl.line, character: 0 },
                        end: { line: impl.line, character: impl.value.length }
                    });
                }
                
                return null;
            }
            
            logger.info(`✅ Found procedure ${procName} declaration in MAP at line ${procDeclarations[0].line}`);
            
            // Find which MODULE block contains this procedure declaration
            const moduleBlocks = mapTokens.filter(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === 'MODULE'
            );
            
            for (const modBlock of moduleBlocks) {
                const isInModule = procDeclarations.some(proc =>
                    proc.line > modBlock.line &&
                    (modBlock.finishesAt === undefined || proc.line < modBlock.finishesAt)
                );
                
                if (isInModule) {
                    // Find the MODULE token with referencedFile
                    const moduleToken = mapTokens.find(t =>
                        t.line === modBlock.line &&
                        t.value.toUpperCase() === 'MODULE' &&
                        t.referencedFile
                    );
                    
                    if (moduleToken && moduleToken.referencedFile) {
                        logger.info(`🎯 Procedure is in MODULE('${moduleToken.referencedFile}')`);
                        
                        // Check if this is a CLW file (direct implementation) or DLL (needs further resolution)
                        const refFile = moduleToken.referencedFile.toLowerCase();
                        if (refFile.endsWith('.clw')) {
                            // This is a source file - look for direct implementation
                            logger.info(`📄 MODULE references a CLW file, searching for direct implementation`);
                            
                            // Resolve the CLW file path using solutionManager
                            if (solutionManager && solutionManager.solution) {
                                for (const proj of projectsOwnerFirst(fromFsPath328)) { // #328 owner-first
                                    const redirectionParser = proj.getRedirectionParser();
                                    const resolved = redirectionParser.findFile(moduleToken.referencedFile);
                                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                                        logger.info(`✅ Resolved CLW file: ${resolved.path}`);
                                        const clwContent = fs.readFileSync(resolved.path, 'utf8');
                                        const clwUri = pathToCanonicalUri(resolved.path);
                                        const clwDocument = TextDocument.create(clwUri, 'clarion', 1, clwContent);
                                        const tokenCache = TokenCache.getInstance();
                                        const clwTokens = tokenCache.getTokens(clwDocument);
                                        
                                        // Find the procedure implementation
                                        const impl = clwTokens.find(t =>
                                            t.subType === TokenType.GlobalProcedure &&
                                            t.label?.toLowerCase() === procName.toLowerCase()
                                        );
                                        
                                        if (impl) {
                                            logger.info(`✅ Found implementation in ${path.basename(resolved.path)} at line ${impl.line}`);
                                            return Location.create(pathToCanonicalUri(resolved.path), { // #251
                                                start: { line: impl.line, character: 0 },
                                                end: { line: impl.line, character: impl.value.length }
                                            });
                                        }
                                        
                                        logger.info(`⚠️ Implementation not found in ${path.basename(resolved.path)}`);
                                        break;
                                    }
                                }
                            }
                        } else {
                            // This is a DLL/LIB - recursively resolve
                            return await this.findImplementationInModuleFile(
                                procName,
                                moduleToken.referencedFile,
                                { uri: pathToCanonicalUri(resolvedPath), getText: () => content } as TextDocument, // #251
                                declarationSignature
                            );
                        }
                    }
                }
            }
            
            // If not in a MODULE, look for direct implementation in this file
            logger.info(`🔍 Procedure not in a MODULE block, searching for direct implementation`);
            const implementations = moduleTokens.filter(t =>
                t.subType === TokenType.GlobalProcedure &&
                t.label?.toLowerCase() === procName.toLowerCase()
            );
            
            if (implementations.length === 0) {
                logger.info(`No implementation found in MODULE file for ${procName}`);
                return null;
            }
            
            // If only one, return it
            if (implementations.length === 1) {
                const impl = implementations[0];
                logger.info(`✅ Found implementation in MODULE file at line ${impl.line}`);
                return Location.create(pathToCanonicalUri(resolvedPath), { // #251
                    start: { line: impl.line, character: 0 },
                    end: { line: impl.line, character: impl.value.length }
                });
            }
            
            // Multiple implementations - try overload resolution
            logger.info(`Found ${implementations.length} overloaded implementations in MODULE file`);

            if (declarationSignature) {
                const lines = content.split('\n');

                // #248: raw call-line "signatures" pick by classified call args first.
                const moduleSigs = implementations.map(impl => (lines[impl.line] ?? '').trim());
                const picked = this.pickCandidateByCallArgs(
                    procName, declarationSignature, moduleTokens, moduleSigs);
                if (picked >= 0) {
                    const impl = implementations[picked];
                    logger.info(`✅ [#248] Call-args matched MODULE implementation at line ${impl.line}`);
                    return Location.create(pathToCanonicalUri(resolvedPath), { // #251
                        start: { line: impl.line, character: 0 },
                        end: { line: impl.line, character: impl.value.length }
                    });
                }

                if (ProcedureUtils.containsProcedureKeyword(declarationSignature)) {
                    const declParams = ProcedureSignatureUtils.extractParameterTypes(declarationSignature);

                    for (const impl of implementations) {
                        const signature = lines[impl.line].trim();
                        const implParams = ProcedureSignatureUtils.extractParameterTypes(signature);

                        if (ProcedureSignatureUtils.parametersMatch(declParams, implParams)) {
                            logger.info(`✅ Found exact type match in MODULE file at line ${impl.line}`);
                            return Location.create(pathToCanonicalUri(resolvedPath), { // #251
                                start: { line: impl.line, character: 0 },
                                end: { line: impl.line, character: impl.value.length }
                            });
                        }
                    }
                }
            }
            
            // Fallback to first implementation
            const impl = implementations[0];
            logger.info(`Returning first implementation from MODULE file at line ${impl.line}`);
            return Location.create(pathToCanonicalUri(resolvedPath), { // #251
                start: { line: impl.line, character: 0 },
                end: { line: impl.line, character: impl.value.length }
            });
            
        } catch (error) {
            logger.error(`Error searching MODULE file: ${error}`);
            return null;
        }
    }
}
