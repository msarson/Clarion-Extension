import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenHelper } from '../../utils/TokenHelper';
import { KeywordService } from '../../utils/KeywordService';
import { BuiltinFunctionService } from '../../utils/BuiltinFunctionService';
import { CompilerFlagService } from '../../utils/CompilerFlagService';
import { DirectiveService } from '../../utils/DirectiveService';
import { CLARION_STRUCTURAL_WORDS } from '../../services/ReferenceCountIndex';
import { StructureDeclarationIndexer } from '../../utils/StructureDeclarationIndexer';
import { MapProcedureResolver } from '../../utils/MapProcedureResolver';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { TokenCache } from '../../TokenCache';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger('UnresolvedProcedureCallDiagnostics');
const perfLogger = LoggerManager.getLogger('UnresolvedProcedureCallDiagnostics.Perf', 'perf');

/**
 * What the cross-file fallback knows about a name the declaration index has no entry for.
 *
 *   resolved    — a declaration was found the way F12 finds it; never flagged.
 *   unresolved  — nothing reachable declares it; flagged.
 *   unknown     — the question cannot be answered here (this MEMBER's parent file cannot
 *                 be found on disk, so its MAP and includes are unreadable); never flagged.
 *                 The same rule as "index not ready": when in doubt, say nothing.
 */
export type CallResolution = 'resolved' | 'unresolved' | 'unknown';
export type CallResolver = (name: string) => Promise<CallResolution>;

/**
 * #517 — opt-in diagnostic (off by default) for a call to a procedure that
 * resolves to no declaration anywhere the extension can see.
 *
 * The check is deliberately conservative to keep it false-positive-free. A call is
 * flagged only when the name is declared NOWHERE: not in this file (as a MAP
 * prototype, a data label, or a variable), not in the solution's declaration index,
 * and — on an index miss — not anywhere the F12 resolver reaches from this file:
 * its own MAP including MAP INCLUDE files, the MEMBER parent's MAP, and the MODULE
 * blocks of the INCs those MAPs include. That last tier is what the index cannot
 * give: a third-party addon declared in a redirection-reachable INC the indexer
 * never scans (QwInit in CTSQW10.CLW on the real solution) resolves for F12 and
 * must not be flagged here.
 *
 * That answers "does this procedure exist at all", which is the typo / truly
 * undefined case, and sidesteps the reachability minefield #271 flagged: a
 * procedure that exists but is not reachable from here is NOT flagged
 * (reachability-aware tightening is a later step). Method calls (`obj.Method(...)`,
 * `SELF.Method(...)`) are out of scope — they resolve through the class, not a MAP.
 *
 * The index predicate and the cross-file fallback are injected so the check is
 * testable without a live index or files on disk; when the index is not built the
 * diagnostic yields nothing rather than flagging every call.
 */
export async function validateUnresolvedProcedureCalls(
    tokens: Token[],
    document: TextDocument,
    sdiHasProcedure: (name: string) => boolean =
        (name) => StructureDeclarationIndexer.getInstance().findProcedure(name).length > 0,
    sdiReady: boolean = StructureDeclarationIndexer.getInstance().hasProcedureIndex(),
    resolveElsewhere: CallResolver = createF12Resolver(tokens, document)
): Promise<Diagnostic[]> {
    if (tokens.length === 0) return [];
    // Without a built procedure index every name would look undeclared — never guess.
    if (!sdiReady) {
        logger.info('[#517] procedure index not ready — skipping unresolved-call check');
        return [];
    }

    const t0 = Date.now();

    // Names declared in THIS file: MAP prototypes (incl. procedure-local MAPs), data
    // labels (column 0), and data-section variables. A call whose name is any of these
    // is resolved locally. Building the code ranges first lets us exclude in-code
    // Variable *uses* from the declared set (a bare call is itself a Variable).
    const codeRanges = collectCodeRanges(tokens);
    const isInsideCode = (line: number) =>
        codeRanges.some(r => line > r.codeStart && line <= r.end);

    const localNames = new Set<string>();
    for (const t of tokens) {
        if (t.subType === TokenType.MapProcedure && t.label) {
            localNames.add(t.label.toUpperCase());
        } else if (t.type === TokenType.Label && t.value) {
            localNames.add(t.value.toUpperCase());
        } else if ((t.type === TokenType.Variable || t.type === TokenType.ReferenceVariable)
            && t.value && !isInsideCode(t.line)) {
            localNames.add(t.value.toUpperCase());
        }
    }

    const diagnostics: Diagnostic[] = [];
    const keywords = KeywordService.getInstance();
    const builtins = BuiltinFunctionService.getInstance();
    const flags = CompilerFlagService.getInstance();
    const directives = DirectiveService.getInstance();
    const lines = document.getText().split(/\r?\n/);

    // One cross-file answer per name per pass: a generated module calls the same addon
    // procedure many times, and each fallback may load other files.
    const memo = new Map<string, Promise<CallResolution>>();
    let calls = 0, indexHits = 0, fallbacks = 0, unknown = 0;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!isCall(tokens, i)) continue;
        // Only executable code. A Function token in a DATA declaration —
        // `STRING(20),DIM(10)`, `KEY(...)`, `FILE,DRIVER('...')` — is an attribute,
        // not a call, and must never be flagged.
        if (!isInsideCode(t.line)) continue;

        if (t.value.includes('.')) continue;
        // Member / method calls resolve through a class or structure, not a MAP —
        // out of scope. The receiver's trailing '.' is consumed into the preceding
        // token (`Access:File.SetErrors` tokenizes as StructureField then Function with
        // no '.' token between), so read the raw source: a '.' immediately before the
        // name is a method call. A StructureField immediately to the left says the same.
        const lineText = lines[t.line] ?? '';
        const before = lineText.slice(0, t.start).replace(/\s+$/, '');
        if (before.endsWith('.')) continue;
        const prev = tokens[i - 1];
        if (prev && prev.line === t.line && (prev.type === TokenType.StructureField || prev.value === '.')) continue;

        // A colon-prefixed procedure — `IBSCommon:Kill()`, the generated DLL init/kill
        // pair — is declared under its FULL name (`IBSCommon:Kill PROCEDURE,DLL`). Above
        // the tokenizer's 8-character prefix cap it arrives as Variable ':' Function, so
        // the token holds only `Kill`; read the whole identifier from the source line.
        const name = qualifiedNameAt(lineText, t.start, t.value);
        const start = t.start - (name.length - t.value.length);

        const upper = name.toUpperCase();
        if (localNames.has(upper)) continue;
        if (keywords.isKeyword(name)) continue;
        if (builtins.isBuiltin(name)) continue;
        if (flags.isCompilerFlag(name)) continue;
        // PRAGMA is neither a keyword nor a built-in — it is a directive (#519 note).
        if (directives.isDirective(name)) continue;
        if (CLARION_STRUCTURAL_WORDS.has(name.toLowerCase())) continue;

        calls++;
        if (sdiHasProcedure(name)) { indexHits++; continue; }

        let pending = memo.get(upper);
        if (!pending) {
            fallbacks++;
            pending = resolveElsewhere(name).catch(err => {
                logger.warn(`[#517] fallback resolution failed for ${name}: ${err instanceof Error ? err.message : String(err)}`);
                return 'unknown' as CallResolution;
            });
            memo.set(upper, pending);
        }
        const resolution = await pending;
        if (resolution === 'resolved') continue;
        if (resolution === 'unknown') { unknown++; continue; }

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: t.line, character: start },
                end: { line: t.line, character: start + name.length },
            },
            message: `Procedure '${name}' is not declared in this solution.`,
            source: 'Clarion',
            code: 'unresolved-procedure-call',
        });
    }

    perfLogger.perf('[#517] unresolved-call pass', {
        ms: Date.now() - t0, calls, index_hits: indexHits, fallback_names: fallbacks,
        unknown, flagged: diagnostics.length, uri: document.uri,
    });
    return diagnostics;
}

// Lazily built so the module can be imported without touching the singletons
// (tests inject their own resolver and never reach these).
let mapResolver: MapProcedureResolver | undefined;
let crossFileResolver: CrossFileResolver | undefined;
const getMapResolver = () => (mapResolver ??= new MapProcedureResolver());
const getCrossFileResolver = () => (crossFileResolver ??= new CrossFileResolver(TokenCache.getInstance()));

/**
 * The F12 chain for a procedure call, as DefinitionProvider walks it: this file's MAP
 * (which already reads its MAP INCLUDE files), then the MEMBER parent's MAP, then the
 * MODULE blocks of the INCs included by either MAP (`findDeclarationInMapIncludes`,
 * which consults the procedure index first and walks only on a miss — #362).
 *
 * A MEMBER whose parent file cannot be found makes every answer 'unknown': the parent's
 * MAP is where most of this module's callable procedures are declared, and a check
 * that cannot read it would flag them all.
 */
export function createF12Resolver(tokens: Token[], document: TextDocument): CallResolver {
    const memberFile = TokenHelper.findMemberHeaderToken(tokens)?.referencedFile;
    let parentFound: Promise<boolean> | undefined;

    return async (name: string): Promise<CallResolution> => {
        if (getMapResolver().findMapDeclaration(name, tokens, document)) return 'resolved';

        if (memberFile) {
            parentFound ??= getCrossFileResolver().resolveFile(memberFile, document.uri).then(p => p !== null);
            if (!(await parentFound)) return 'unknown';
            const inParent = await getCrossFileResolver().findMapDeclarationInMemberFile(name, memberFile, document);
            if (inParent) return 'resolved';
        }

        if (await getMapResolver().findDeclarationInMapIncludes(name, document, tokens)) return 'resolved';
        return 'unresolved';
    };
}

/**
 * Executable-code ranges: every procedure/method/routine body, plus a PROGRAM's
 * own main CODE section (#516) — its ExecutionMarker, unclaimed by any procedure,
 * up to the first procedure implementation or EOF.
 */
function collectCodeRanges(tokens: Token[]): { codeStart: number; end: number }[] {
    const ranges: { codeStart: number; end: number }[] = [];
    for (const t of tokens) {
        const isProc = TokenHelper.isProcedureOrFunction(t) &&
            (t.subType === TokenType.GlobalProcedure || t.subType === TokenType.MethodImplementation);
        const isRoutine = t.type === TokenType.Routine;
        if (!isProc && !isRoutine) continue;
        if (t.executionMarker === undefined || t.finishesAt === undefined) continue;
        ranges.push({ codeStart: t.executionMarker.line, end: t.finishesAt });
    }
    const isProgram = tokens.some(t => t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'PROGRAM');
    if (isProgram) {
        const claimed = new Set<number>();
        for (const t of tokens) if (t.executionMarker) claimed.add(t.executionMarker.line);
        const mainCode = tokens.find(t => t.type === TokenType.ExecutionMarker && !claimed.has(t.line));
        if (mainCode) {
            let end = tokens[tokens.length - 1].line;
            for (const t of tokens) {
                const isImpl = TokenHelper.isProcedureOrFunction(t) &&
                    (t.subType === TokenType.GlobalProcedure || t.subType === TokenType.MethodImplementation);
                if (isImpl && t.line > mainCode.line) { end = t.line - 1; break; }
            }
            if (end > mainCode.line) ranges.push({ codeStart: mainCode.line, end });
        }
    }
    return ranges;
}

/**
 * True when tokens[i] CALLS a procedure rather than referring to it — the same
 * classification the PRIVATE-call diagnostic uses (#481). `Proc(...)` is a
 * Function in statement or expression position; a bare `Proc` statement is a
 * Variable alone on its line; a Variable anywhere else — `START(Proc)`,
 * `ADDRESS(Proc)` — is a reference and not a call.
 */
function isCall(tokens: Token[], i: number): boolean {
    const t = tokens[i];
    if (t.type === TokenType.Function) return true;
    const next = tokens[i + 1];
    // A short colon-prefixed name (`ABC:Init`, prefix of 8 characters or fewer) is ONE
    // StructurePrefix token; with `(` right after it on the line it is a call.
    if (t.type === TokenType.StructurePrefix) {
        return !!next && next.line === t.line && next.value === '(' && next.start === t.start + t.value.length;
    }
    if (t.type !== TokenType.Variable) return false;
    const prev = tokens[i - 1];
    if (prev && prev.line === t.line) return false;
    if (!next || next.line !== t.line) return true;
    return next.type === TokenType.EndStatement && (!tokens[i + 2] || tokens[i + 2].line !== t.line);
}

/**
 * The full identifier ending where `value` ends at `start` on `lineText`: extends left
 * over `PREFIX:` segments (`IBSCommon:Kill` for a token holding `Kill`). Stops at
 * anything that is not an identifier character or a single colon, so `x = Kill()` and
 * `Label::Routine` are left alone.
 */
function qualifiedNameAt(lineText: string, start: number, value: string): string {
    let i = start;
    while (i >= 2 && lineText[i - 1] === ':' && lineText[i - 2] !== ':' && /[A-Za-z0-9_]/.test(lineText[i - 2])) {
        let j = i - 2;
        while (j > 0 && /[A-Za-z0-9_]/.test(lineText[j - 1])) j--;
        i = j;
    }
    return lineText.slice(i, start) + value;
}
