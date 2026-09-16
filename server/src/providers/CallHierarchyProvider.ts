import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CallHierarchyItem, CallHierarchyIncomingCall, CallHierarchyOutgoingCall,
    Location, Position, Range, SymbolKind, CancellationToken
} from 'vscode-languageserver/node';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from '../utils/TokenHelper';
import { KeywordService } from '../utils/KeywordService';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import { DirectiveService } from '../utils/DirectiveService';
import { DefinitionProvider } from './DefinitionProvider';
import { ImplementationProvider } from './ImplementationProvider';
import { ReferencesProvider } from './ReferencesProvider';
import { isCall } from './diagnostics/UnresolvedProcedureCallDiagnostics';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('CallHierarchyProvider');
logger.setLevel('error');
const perfLogger = LoggerManager.getLogger('CallHierarchyProvider.Perf', 'perf');

/**
 * #509 — LSP call hierarchy. "Who calls this" (incoming) and "what does this call"
 * (outgoing) for a procedure, method implementation or routine, walkable a level at
 * a time in the editor's peek view.
 *
 * Nothing here scans the corpus itself. A call site resolves to its target the way
 * Ctrl+F12 / F12 do (ImplementationProvider, then DefinitionProvider), callers come
 * from Find All References filtered to actual call sites (the #481 classification:
 * `Proc(...)`, or a bare `Proc` statement; `START(Proc)` and other references are
 * not calls), and `DO Name` is a call to the routine of that name in the same
 * procedure. A call from a PROGRAM's main CODE section is attributed to an item
 * named PROGRAM, since it has no enclosing procedure.
 *
 * Items carry `data.kind` ('procedure' | 'routine' | 'program') so the two follow-up
 * requests know how to expand them without re-deriving it from the range.
 */

type ItemKind = 'procedure' | 'routine' | 'program';
interface ItemData { kind: ItemKind }

/** A procedure / method implementation / routine token with a label and a body. */
function isCallable(t: Token): boolean {
    if (t.subType === TokenType.Routine && !!t.label) return true;
    return TokenHelper.isProcedureOrFunction(t) && !!t.label &&
        (t.subType === TokenType.GlobalProcedure || t.subType === TokenType.MethodImplementation);
}

export class CallHierarchyProvider {
    private readonly tokenCache = TokenCache.getInstance();

    constructor(
        private readonly definitionProvider: DefinitionProvider = new DefinitionProvider(),
        private readonly implementationProvider: ImplementationProvider = new ImplementationProvider(),
        private readonly referencesProvider: ReferencesProvider = new ReferencesProvider()
    ) {}

    // ── prepare ─────────────────────────────────────────────────────────────

    public async prepare(document: TextDocument, position: Position, cancel?: CancellationToken): Promise<CallHierarchyItem[] | null> {
        const t0 = Date.now();
        const tokens = this.tokenCache.getTokens(document);
        if (!tokens?.length) return null;

        // 1. On a procedure / routine declaration line: that callable.
        const own = tokens.find(t => t.line === position.line && isCallable(t));
        if (own) return [this.itemFor(document.uri, tokens, own)];

        // 2. On a call site: the callee (its implementation where one exists).
        const at = this.tokenAt(tokens, position);
        if (at) {
            const idx = tokens.indexOf(at);
            const doTarget = this.routineCalledByDo(tokens, idx);
            if (doTarget) return [this.itemFor(document.uri, tokens, doTarget)];
            if (isCall(tokens, idx) || tokens[idx - 1]?.value === '.') {
                const target = await this.resolveCallee(document, tokens, at, cancel);
                if (target) return [target];
            }
        }

        // 3. Anywhere else: the callable containing the cursor.
        const container = this.containerOf(tokens, position.line);
        const item = container ? this.itemFor(document.uri, tokens, container) : this.programItem(document.uri, tokens);
        perfLogger.perf('call hierarchy prepare', { ms: Date.now() - t0, uri: document.uri });
        return item ? [item] : null;
    }

    // ── incoming ────────────────────────────────────────────────────────────

    public async incomingCalls(item: CallHierarchyItem, cancel?: CancellationToken): Promise<CallHierarchyIncomingCall[]> {
        const t0 = Date.now();
        const loaded = await this.load(item.uri);
        if (!loaded) return [];
        const data = item.data as ItemData | undefined;
        const groups = new Map<string, CallHierarchyIncomingCall>();
        const add = (from: CallHierarchyItem, range: Range) => {
            const key = `${from.uri}#${from.range.start.line}`;
            const g = groups.get(key);
            if (g) g.fromRanges.push(range); else groups.set(key, { from, fromRanges: [range] });
        };

        if (data?.kind === 'routine') {
            // A routine is callable only from its own procedure: its DO sites are there.
            const { tokens } = loaded;
            const routine = tokens.find(t => t.subType === TokenType.Routine && t.line === item.range.start.line);
            const proc = routine ? this.procedureOwning(tokens, routine.line) : undefined;
            if (routine && proc) {
                for (let i = 0; i < tokens.length; i++) {
                    const t = tokens[i];
                    if (t.line <= proc.line || t.line > (proc.finishesAt ?? proc.line)) continue;
                    const target = this.routineCalledByDo(tokens, i);
                    if (target !== routine) continue;
                    const from = this.containerOf(tokens, t.line);
                    add(from ? this.itemFor(item.uri, tokens, from) : this.programItem(item.uri, tokens)!, this.rangeOf(t));
                }
            }
        } else if (data?.kind === 'procedure') {
            const refs = await this.referencesProvider.provideReferences(
                loaded.document, item.selectionRange.start, { includeDeclaration: false }, cancel
            ).catch(() => null);
            const byUri = new Map<string, Location[]>();
            for (const r of refs ?? []) byUri.set(r.uri, [...(byUri.get(r.uri) ?? []), r]);
            for (const [uri, locs] of byUri) {
                const target = await this.load(uri);
                if (!target) continue;
                const { tokens } = target;
                for (const loc of locs) {
                    const idx = tokens.findIndex(t => t.line === loc.range.start.line && t.start === loc.range.start.character);
                    if (idx < 0) continue;
                    // A prototype / implementation line declares the name; it is not a call.
                    // (isProcedureOrFunction alone also matches a Function CALL token — the
                    // label is what marks a declaration.)
                    if (tokens.some(t => t.line === loc.range.start.line && TokenHelper.isProcedureOrFunction(t) && !!t.label)) continue;
                    if (!isCall(tokens, idx)) continue;
                    const from = this.containerOf(tokens, loc.range.start.line);
                    const fromItem = from ? this.itemFor(uri, tokens, from) : this.programItem(uri, tokens);
                    if (fromItem) add(fromItem, this.rangeOf(tokens[idx]));
                }
            }
        }
        const result = [...groups.values()];
        perfLogger.perf('call hierarchy incoming', { ms: Date.now() - t0, item: item.name, callers: result.length });
        return result;
    }

    // ── outgoing ────────────────────────────────────────────────────────────

    public async outgoingCalls(item: CallHierarchyItem, cancel?: CancellationToken): Promise<CallHierarchyOutgoingCall[]> {
        const t0 = Date.now();
        const loaded = await this.load(item.uri);
        if (!loaded) return [];
        const { document, tokens } = loaded;
        const data = item.data as ItemData | undefined;
        const first = item.range.start.line;
        const last = item.range.end.line;
        const keywords = KeywordService.getInstance();
        const builtins = BuiltinFunctionService.getInstance();
        const directives = DirectiveService.getInstance();

        const groups = new Map<string, CallHierarchyOutgoingCall>();
        const memo = new Map<string, Promise<CallHierarchyItem | null>>();
        const add = (to: CallHierarchyItem, range: Range) => {
            const key = `${to.uri}#${to.range.start.line}`;
            const g = groups.get(key);
            if (g) g.fromRanges.push(range); else groups.set(key, { to, fromRanges: [range] });
        };

        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.line < (data?.kind === 'program' ? first : first + 1) || t.line > last) continue;
            const routine = this.routineCalledByDo(tokens, i);
            if (routine) { add(this.itemFor(item.uri, tokens, routine), this.rangeOf(t)); continue; }
            if (!isCall(tokens, i)) continue;
            const name = t.value;
            if (keywords.isKeyword(name) || builtins.isBuiltin(name) || directives.isDirective(name)) continue;
            if (name.toUpperCase() === 'DO') continue;
            const receiver = tokens[i - 1]?.line === t.line && (tokens[i - 1].type === TokenType.StructureField || tokens[i - 1].value === '.')
                ? tokens[i - 1].value : '';
            const key = `${receiver}|${name.toUpperCase()}`;
            let pending = memo.get(key);
            if (!pending) { pending = this.resolveCallee(document, tokens, t, cancel); memo.set(key, pending); }
            const to = await pending;
            if (to) add(to, this.rangeOf(t));
        }
        const result = [...groups.values()];
        perfLogger.perf('call hierarchy outgoing', { ms: Date.now() - t0, item: item.name, callees: result.length });
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /** The callee's item for a call token: implementation first (Ctrl+F12), then definition (F12). */
    private async resolveCallee(document: TextDocument, _tokens: Token[], call: Token, cancel?: CancellationToken): Promise<CallHierarchyItem | null> {
        const position = { line: call.line, character: call.start + 1 };
        const pick = (r: Location | Location[] | null | undefined): Location | null =>
            !r ? null : Array.isArray(r) ? (r[0] ?? null) : r;
        let loc: Location | null = null;
        try { loc = pick(await this.implementationProvider.provideImplementation(document, position, cancel) as Location | Location[] | null); } catch { /* fall through */ }
        if (!loc) {
            try { loc = pick(await this.definitionProvider.provideDefinition(document, position, cancel) as Location | Location[] | null); } catch { /* fall through */ }
        }
        if (!loc) return null;
        const target = await this.load(loc.uri);
        if (!target) return null;
        const line = loc.range.start.line;
        const callable = target.tokens.find(t => t.line === line && isCallable(t));
        if (callable) return this.itemFor(loc.uri, target.tokens, callable);
        // A MAP prototype (no implementation found) or a class method declaration: still a target.
        const decl = target.tokens.find(t => t.line === line && TokenHelper.isProcedureOrFunction(t) && !!t.label);
        if (decl) {
            return {
                name: decl.label!, kind: SymbolKind.Function, detail: 'prototype', uri: loc.uri,
                range: this.lineRange(target.tokens, line), selectionRange: this.labelRange(target.tokens, line, decl.label!),
                data: { kind: 'procedure' } as ItemData,
            };
        }
        return null;
    }

    /** `DO Name` — tokens[i] is `DO`; the routine of that name in the same procedure, or null. */
    private routineCalledByDo(tokens: Token[], i: number): Token | null {
        const t = tokens[i];
        if (!t || t.value.toUpperCase() !== 'DO') return null;
        const next = tokens[i + 1];
        if (!next || next.line !== t.line) return null;
        const name = next.value.toUpperCase();
        const proc = this.procedureOwning(tokens, t.line);
        const routines = tokens.filter(r => r.subType === TokenType.Routine && r.label?.toUpperCase() === name);
        return routines.find(r => !proc || (r.line > proc.line && r.line <= (proc.finishesAt ?? Infinity))) ?? routines[0] ?? null;
    }

    /** The routine or procedure whose body contains `line` (routine first: it is the tighter scope). */
    private containerOf(tokens: Token[], line: number): Token | undefined {
        const routine = tokens.find(t => t.subType === TokenType.Routine && t.label && t.line <= line && line <= (t.finishesAt ?? t.line));
        if (routine && routine.line !== line) return routine;
        return this.procedureOwning(tokens, line);
    }

    /** The procedure / method implementation whose range contains `line` (routines included in the range). */
    private procedureOwning(tokens: Token[], line: number): Token | undefined {
        let best: Token | undefined;
        for (const t of tokens) {
            if (!isCallable(t) || t.subType === TokenType.Routine) continue;
            if (t.line <= line && line <= (t.finishesAt ?? t.line) && (!best || t.line > best.line)) best = t;
        }
        return best;
    }

    private itemFor(uri: string, tokens: Token[], callable: Token): CallHierarchyItem {
        const isRoutine = callable.subType === TokenType.Routine;
        const label = callable.label!;
        // A procedure's own code ends where its first routine starts (codeFinishesAt);
        // the routines are separate items.
        const end = isRoutine ? (callable.finishesAt ?? callable.line) : (callable.codeFinishesAt ?? callable.finishesAt ?? callable.line);
        return {
            name: label,
            kind: isRoutine ? SymbolKind.Function : label.includes('.') ? SymbolKind.Method : SymbolKind.Function,
            detail: isRoutine ? 'ROUTINE' : (callable.subType === TokenType.MethodImplementation ? 'method' : 'procedure'),
            uri,
            range: { start: { line: callable.line, character: 0 }, end: { line: end, character: this.lineLength(tokens, end) } },
            selectionRange: this.labelRange(tokens, callable.line, label),
            data: { kind: isRoutine ? 'routine' : 'procedure' } as ItemData,
        };
    }

    /** A PROGRAM's main CODE section as an item, for calls that have no enclosing procedure. */
    private programItem(uri: string, tokens: Token[]): CallHierarchyItem | null {
        const program = tokens.find(t => t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'PROGRAM');
        if (!program) return null;
        const claimed = new Set<number>();
        for (const t of tokens) if (t.executionMarker) claimed.add(t.executionMarker.line);
        const code = tokens.find(t => t.type === TokenType.ExecutionMarker && !claimed.has(t.line));
        if (!code) return null;
        let end = tokens[tokens.length - 1].line;
        for (const t of tokens) if (isCallable(t) && t.subType !== TokenType.Routine && t.line > code.line) { end = t.line - 1; break; }
        return {
            name: 'PROGRAM', kind: SymbolKind.Module, detail: 'main code', uri,
            range: { start: { line: code.line, character: 0 }, end: { line: end, character: this.lineLength(tokens, end) } },
            selectionRange: this.rangeOf(code),
            data: { kind: 'program' } as ItemData,
        };
    }

    private tokenAt(tokens: Token[], position: Position): Token | undefined {
        return tokens.find(t => t.line === position.line && position.character >= t.start && position.character <= t.start + t.value.length);
    }
    private rangeOf(t: Token): Range {
        return { start: { line: t.line, character: t.start }, end: { line: t.line, character: t.start + t.value.length } };
    }
    private labelRange(tokens: Token[], line: number, label: string): Range {
        const tok = tokens.find(t => t.line === line && t.value.toUpperCase() === label.toUpperCase());
        return tok ? this.rangeOf(tok) : { start: { line, character: 0 }, end: { line, character: label.length } };
    }
    private lineRange(tokens: Token[], line: number): Range {
        return { start: { line, character: 0 }, end: { line, character: this.lineLength(tokens, line) } };
    }
    private lineLength(tokens: Token[], line: number): number {
        let end = 0;
        for (const t of tokens) if (t.line === line) end = Math.max(end, t.start + t.value.length);
        return end;
    }

    /** The document and tokens for a uri: the live copy when open, else read from disk. */
    private async load(uri: string): Promise<{ document: TextDocument; tokens: Token[] } | null> {
        const live = this.tokenCache.getDocumentText(uri);
        if (live !== undefined && live !== null) {
            const document = TextDocument.create(uri, 'clarion', 1, live);
            return { document, tokens: this.tokenCache.getTokens(document) };
        }
        const filePath = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, path.sep);
        try {
            const text = fs.readFileSync(filePath, 'utf8');
            const document = TextDocument.create(uri, 'clarion', 1, text);
            return { document, tokens: this.tokenCache.getTokens(document) };
        } catch (err) {
            logger.info(`cannot load ${uri}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }
}
