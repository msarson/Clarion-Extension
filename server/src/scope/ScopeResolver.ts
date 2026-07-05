import { Token, TokenType } from '../tokenizer/TokenTypes';
import { ScopeKind, ScopeTier, ScopeNode, LineRange } from './ScopeTypes';

/**
 * Issue #233 — the canonical, deterministic scope resolver.
 *
 * A thin, pure, I/O-free layer over the token stream that DocumentStructure has already
 * enriched (`finishesAt`, `codeFinishesAt`, `executionMarker`, `declaringProcedureLine`).
 * It answers the three scope questions from ONE rule set:
 *   - resolveScopeAt(line)          → "what scope encloses this position?" (Rule 1 aware)
 *   - getVisibleScopeChain(line)    → "what tiers are visible from here?"  (Rules 2/3/4/5)
 *   - findDeclaringProcedureForMethod(method) → Rule 4 declaring-procedure link.
 *
 * Rule 1 is honored by bounding procedure containment with `codeFinishesAt` (the executable
 * extent, which stops at the first ROUTINE) rather than `finishesAt` (the structural span,
 * which runs past a procedure's routines). This is what lets a line inside a routine — or
 * inside a local derived method that follows the procedure — resolve to the RIGHT scope
 * instead of the enclosing procedure's dead tail.
 */
export class ScopeResolver {
    private readonly procLineToToken: Map<number, Token> = new Map();
    private readonly isProgram: boolean;
    private readonly isMember: boolean;
    private readonly firstProcLine: number;

    constructor(private readonly tokens: Token[]) {
        let firstProc = Number.MAX_SAFE_INTEGER;
        let sawProgram = false;
        let sawMember = false;
        for (const t of tokens) {
            if (this.isProcedureToken(t)) {
                this.procLineToToken.set(t.line, t);
                if (t.line < firstProc) firstProc = t.line;
            }
            if ((t.type === TokenType.Label || t.type === TokenType.ClarionDocument)) {
                const v = t.value.toUpperCase();
                if (v === 'PROGRAM') sawProgram = true;
                else if (v === 'MEMBER') sawMember = true;
            }
        }
        this.isProgram = sawProgram;
        this.isMember = sawMember && !sawProgram;
        this.firstProcLine = firstProc;
    }

    private isProcedureToken(t: Token): boolean {
        return t.subType === TokenType.Procedure ||
            t.subType === TokenType.GlobalProcedure ||
            t.subType === TokenType.MethodImplementation;
    }

    /** The executable-extent upper bound for a scope token (Rule 1). */
    private codeEnd(token: Token): number {
        return token.codeFinishesAt ?? token.finishesAt ?? Number.MAX_SAFE_INTEGER;
    }

    /**
     * Innermost PROCEDURE / METHODIMPL whose EXECUTABLE extent (Rule 1) contains `line`.
     * Using `codeFinishesAt` here is the crux: a line past a procedure's first routine, or
     * inside a local derived method that trails the procedure, is excluded from that
     * procedure's extent, so we never return the wrong outer procedure.
     */
    private findContainingProcedure(line: number): Token | undefined {
        let best: Token | undefined;
        for (const t of this.tokens) {
            if (!this.isProcedureToken(t)) continue;
            if (t.line <= line && line <= this.codeEnd(t)) {
                if (!best || t.line > best.line) best = t;
            }
        }
        return best;
    }

    /** Innermost ROUTINE (by structural body) containing `line`. */
    private findContainingRoutine(line: number): Token | undefined {
        let best: Token | undefined;
        for (const t of this.tokens) {
            if (t.subType !== TokenType.Routine) continue;
            const end = t.finishesAt ?? Number.MAX_SAFE_INTEGER;
            if (t.line <= line && line <= end) {
                if (!best || t.line > best.line) best = t;
            }
        }
        return best;
    }

    private kindForProcedure(token: Token): ScopeKind {
        return token.subType === TokenType.MethodImplementation ? ScopeKind.Method : ScopeKind.Procedure;
    }

    private tierForKind(kind: ScopeKind): ScopeTier {
        switch (kind) {
            case ScopeKind.Global: return ScopeTier.Global;
            case ScopeKind.Module: return ScopeTier.Module;
            case ScopeKind.Procedure: return ScopeTier.Procedure;
            case ScopeKind.Method: return ScopeTier.Method;
            case ScopeKind.Routine: return ScopeTier.Routine;
        }
    }

    /** Data-section range (declarations) for a procedure/method/routine token. */
    private dataExtentOf(token: Token): LineRange {
        const end = token.executionMarker
            ? token.executionMarker.line - 1
            : this.codeEnd(token);
        return { startLine: token.line, endLine: end };
    }

    /** Executable range for a procedure/method/routine token. */
    private codeExtentOf(token: Token): LineRange {
        return {
            startLine: token.executionMarker?.line ?? token.line,
            endLine: this.codeEnd(token),
        };
    }

    /** The synthetic top-of-file scope (Global for a PROGRAM, Module for a MEMBER). */
    private topNode(): ScopeNode {
        const kind = this.isMember ? ScopeKind.Module : ScopeKind.Global;
        const endLine = this.firstProcLine === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : this.firstProcLine - 1;
        const range: LineRange = { startLine: 0, endLine };
        return {
            kind,
            tier: this.tierForKind(kind),
            token: null,
            parent: null,
            codeExtent: range,
            dataExtent: range,
        };
    }

    private procedureNode(token: Token, parent: ScopeNode | null): ScopeNode {
        const kind = this.kindForProcedure(token);
        const node: ScopeNode = {
            kind,
            tier: this.tierForKind(kind),
            token,
            parent,
            codeExtent: this.codeExtentOf(token),
            dataExtent: this.dataExtentOf(token),
        };
        if (kind === ScopeKind.Method) {
            const declaring = this.findDeclaringProcedureForMethod(token);
            if (declaring) {
                node.declaringProcedure = this.procedureNode(declaring, this.topNode());
                // A local derived method's visible chain climbs through its declaring procedure.
                node.parent = node.declaringProcedure;
            }
        }
        return node;
    }

    /**
     * "What scope encloses this position?" — Rule 1 aware. Returns the innermost enclosing
     * scope, with `.parent` linked all the way out to the Global/Module top.
     */
    resolveScopeAt(line: number): ScopeNode {
        const routine = this.findContainingRoutine(line);
        const proc = this.findContainingProcedure(line);

        // A routine wins when it exists and is at least as deep as any procedure whose
        // executable extent also matched (normally the procedure won't match a routine line
        // at all, because codeFinishesAt excludes the routine).
        if (routine && (!proc || routine.line >= proc.line)) {
            const parentProcToken = routine.parent && this.isProcedureToken(routine.parent)
                ? routine.parent
                : this.findContainingProcedureByStructure(routine.line);
            const parentNode = parentProcToken
                ? this.procedureNode(parentProcToken, this.topNode())
                : this.topNode();
            return {
                kind: ScopeKind.Routine,
                tier: ScopeTier.Routine,
                token: routine,
                parent: parentNode,
                codeExtent: this.codeExtentOf(routine),
                dataExtent: this.dataExtentOf(routine),
            };
        }

        if (proc) {
            return this.procedureNode(proc, this.topNode());
        }

        return this.topNode();
    }

    /**
     * Structural (finishesAt-based) containing procedure — used only to find a ROUTINE's
     * owning procedure, where the procedure's executable extent deliberately excludes the
     * routine (so codeFinishesAt cannot be used).
     */
    private findContainingProcedureByStructure(line: number): Token | undefined {
        let best: Token | undefined;
        for (const t of this.tokens) {
            if (!this.isProcedureToken(t)) continue;
            const end = t.finishesAt ?? Number.MAX_SAFE_INTEGER;
            if (t.line <= line && line <= end) {
                if (!best || t.line > best.line) best = t;
            }
        }
        return best;
    }

    /**
     * "What tiers are visible from here?" — ordered innermost → outermost (Rules 2/3/4/5).
     * Simply walks the parent chain built by resolveScopeAt.
     */
    getVisibleScopeChain(line: number): ScopeNode[] {
        const chain: ScopeNode[] = [];
        let node: ScopeNode | null = this.resolveScopeAt(line);
        while (node) {
            chain.push(node);
            node = node.parent;
        }
        return chain;
    }

    /**
     * Rule 4: the GlobalProcedure whose LOCAL data declared this method's CLASS, or undefined
     * for an ordinary (module/global-class) method. Deterministic — reads the link stamped by
     * DocumentStructure.linkLocalDerivedMethodsPass().
     */
    findDeclaringProcedureForMethod(method: Token): Token | undefined {
        if (method.declaringProcedureLine === undefined) return undefined;
        return this.procLineToToken.get(method.declaringProcedureLine);
    }
}
