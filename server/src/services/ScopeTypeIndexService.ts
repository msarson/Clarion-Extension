import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';

/**
 * A routine-local (Tier 1) sub-scope inside a procedure scope.
 */
export interface RoutineScope {
    startLine: number;
    endLine: number;
    varTypes: Map<string, string>;
}

/**
 * One procedure's scope entry in the file-level var-type index:
 * parameters + locals (Tiers 2/3) in `varTypes`, optional Tier 4 class
 * fields for method implementations, and Tier 1 routine sub-scopes.
 */
export interface ProcScopeEntry {
    startLine: number;
    endLine: number;
    varTypes: Map<string, string>;
    classFields?: Map<string, string>;
    enclosingClassLower?: string;
    routineScopes?: RoutineScope[];
}

/**
 * The per-file variable-type index produced by
 * {@link ScopeTypeIndexService.buildFileVarTypeIndex}.
 */
export interface FileVarTypeIndex {
    procScopes: ProcScopeEntry[];
    moduleScope: Map<string, string>;
}

/**
 * #257 Phase 1 — FAR's scope-tier variable-type index, extracted VERBATIM from
 * ReferencesProvider so other resolvers (signature help, F12, DocumentHighlight)
 * can consume the same scope model instead of growing their own.
 *
 * Covers Clarion's full scope model per `project_clarion_scope_model.md`:
 *   Tier 1 — routine local data (own-name-scope shadowing)
 *   Tier 2 — procedure parameters
 *   Tier 3 — procedure local data
 *   Tier 4 — CLASS member data via SELF
 *   Tier 5 — module data
 *   Tier 6 — global data (PROGRAM file, loaded separately)
 * plus the #193 PRE-prefix additive keying (`prefix:field` aliases).
 *
 * All lookups are synchronous and zero-I/O against a precomputed per-file
 * index — the perf property that made the #257 assessment invert the #245
 * "fold FAR onto the shared resolver" direction. Phase 2 adds index caching;
 * Phase 3 points ArgumentTypeResolver here.
 */
export class ScopeTypeIndexService {

    constructor(private tokenCache: TokenCache = TokenCache.getInstance()) { }

    /**
     * #257 Phase 2 — per-token-array index cache. Keyed on Token[] IDENTITY:
     * every TokenCache path (full tokenize, incremental merge, closed-file
     * cache) hands out a NEW array when content changes and the SAME array
     * only while content is unchanged, so array identity is a correct and
     * zero-bookkeeping invalidation key. De-quadratifies the #189 CodeLens
     * precompute, which rebuilt this index once per CodeLens for the same file.
     * WeakMap → dropping the token array (cache eviction, doc close) drops
     * the index with it; no explicit eviction needed.
     */
    private readonly indexCache = new WeakMap<Token[], FileVarTypeIndex>();

    /**
     * Get tokens for a URI — uses the in-memory cache for open documents,
     * falls back to reading and tokenizing from disk for closed files.
     */
    private getTokensForUri(uri: string): Token[] {
        return this.tokenCache.getTokensForClosedFile(uri);
    }

    /**
     * P2b track-(b) + Phase B+ + Tier 1 — file-level variable-type index covering
     * Clarion's full scope model per `project_clarion_scope_model.md`:
     *
     *   Tier 1 (routine local data)          — DATA-section vars inside a ROUTINE,
     *                                          own-name-scope shadowing per spec
     *   Tier 2 (procedure parameters)        — folded into procScopes via Token.parameters
     *   Tier 3 (procedure local data)        — col-0 Labels within proc finishesAt,
     *                                          EXCLUDING routine-bounded lines (regression
     *                                          fix uncovered by Tier 1 investigation —
     *                                          routine vars must not pollute proc-local map)
     *   Tier 4 (CLASS member data via SELF)  — when proc is a methodImpl, classFields populated
     *   Tier 5 (module data)                 — col-0 Labels OUTSIDE any procedure scope
     *
     * Tier 6 (global data) is built per-file too but loaded SEPARATELY via
     * `loadGlobalScope(programFileUri)` — the PROGRAM file may differ from the
     * cursor's MEMBER file, so the matching loop loads it once per match and
     * passes it into `lookupVarTypeAtLine`.
     */
    public buildFileVarTypeIndex(tokens: Token[]): FileVarTypeIndex {
        const cached = this.indexCache.get(tokens);
        if (cached) return cached;
        const built = this.buildFileVarTypeIndexUncached(tokens);
        this.indexCache.set(tokens, built);
        return built;
    }

    /** The actual index build — see `buildFileVarTypeIndex` for the tier model. */
    private buildFileVarTypeIndexUncached(tokens: Token[]): FileVarTypeIndex {
        const procScopes: ProcScopeEntry[] = [];
        const moduleScope = new Map<string, string>();

        const tokensByLine = new Map<number, Token[]>();
        for (const t of tokens) {
            const arr = tokensByLine.get(t.line);
            if (arr) arr.push(t); else tokensByLine.set(t.line, [t]);
        }

        // Pre-compute procedure line ranges so we can identify "outside-any-procedure"
        // lines for the module-scope walk (Tier 5).
        const procRanges: Array<{ start: number; end: number }> = [];
        for (const procToken of tokens) {
            if (procToken.type === TokenType.Procedure &&
                (procToken.subType === TokenType.GlobalProcedure ||
                 procToken.subType === TokenType.MethodImplementation) &&
                procToken.finishesAt !== undefined && procToken.finishesAt > procToken.line) {
                procRanges.push({ start: procToken.line, end: procToken.finishesAt });
            }
        }
        const isInsideAnyProcedure = (line: number) =>
            procRanges.some(r => line >= r.start && line <= r.end);

        // Tier 5 — Module scope: col-0 Labels OUTSIDE any procedure scope.
        for (const t of tokens) {
            if (t.type !== TokenType.Label || t.start !== 0 || !t.label) continue;
            if (isInsideAnyProcedure(t.line)) continue;
            const lineTokens = tokensByLine.get(t.line);
            if (!lineTokens) continue;
            this.captureLabelType(t, lineTokens, moduleScope);
        }

        // Per-procedure scope build (Tiers 2 + 3 + optional Tier 4 for methods).
        for (const procToken of tokens) {
            if (procToken.type !== TokenType.Procedure ||
                (procToken.subType !== TokenType.GlobalProcedure &&
                 procToken.subType !== TokenType.MethodImplementation) ||
                procToken.finishesAt === undefined || procToken.finishesAt <= procToken.line) {
                continue;
            }
            const startLine = procToken.line;
            const endLine = procToken.finishesAt;
            const varTypes = new Map<string, string>();

            // Tier 2 — Procedure parameters from tokenizer's structured parameters list.
            if (procToken.parameters) {
                for (const p of procToken.parameters) {
                    if (p.name) {
                        // Strip pass-by-ref decoration from type for downstream comparisons.
                        const cleanType = p.type ? p.type.replace(/^[*&]\s*/, '') : '';
                        varTypes.set(p.name.toLowerCase(), cleanType);
                    }
                }
            }

            // Tier 1 — Routine local data: find Routine tokens with hasLocalData
            // inside this procedure's scope. Build per-routine var-type sub-maps and
            // collect their line ranges so the Tier 3 walk can EXCLUDE them.
            const routineScopes: RoutineScope[] = [];
            for (const t of tokens) {
                if (t.type === TokenType.Keyword &&
                    t.subType === TokenType.Routine &&
                    t.hasLocalData === true &&
                    t.finishesAt !== undefined && t.finishesAt > t.line &&
                    t.line >= startLine && t.finishesAt <= endLine) {
                    const routineVarTypes = new Map<string, string>();
                    for (let line = t.line + 1; line <= t.finishesAt; line++) {
                        const lineTokens = tokensByLine.get(line);
                        if (!lineTokens) continue;
                        for (let k = 0; k < lineTokens.length; k++) {
                            const cand = lineTokens[k];
                            if (cand.type !== TokenType.Label || cand.start !== 0 || !cand.label) continue;
                            this.captureLabelType(cand, lineTokens, routineVarTypes);
                        }
                    }
                    routineScopes.push({ startLine: t.line, endLine: t.finishesAt, varTypes: routineVarTypes });
                }
            }

            // Tier 3 — Procedure local data: col-0 Labels within (startLine, endLine),
            // EXCLUDING lines bounded by any routine in this procedure (regression fix —
            // otherwise routine vars last-write-overwrite proc-local vars in the map).
            for (let line = startLine + 1; line <= endLine; line++) {
                if (routineScopes.some(r => line >= r.startLine && line <= r.endLine)) continue;
                const lineTokens = tokensByLine.get(line);
                if (!lineTokens) continue;
                for (let k = 0; k < lineTokens.length; k++) {
                    const cand = lineTokens[k];
                    if (cand.type !== TokenType.Label || cand.start !== 0 || !cand.label) continue;
                    this.captureLabelType(cand, lineTokens, varTypes);
                }
            }

            // Tier 4 — CLASS member data via SELF (only for methodImpls).
            // procToken.label for methodImpl is "ClassName.MethodName" → split on '.'
            // → look up the CLASS structure → walk its data members.
            let classFields: Map<string, string> | undefined;
            let enclosingClassLower: string | undefined;
            if (procToken.subType === TokenType.MethodImplementation && procToken.label) {
                const dotIdx = procToken.label.indexOf('.');
                if (dotIdx > 0) {
                    enclosingClassLower = procToken.label.substring(0, dotIdx).toLowerCase();
                    classFields = this.gatherClassDataMembers(enclosingClassLower, tokens, tokensByLine);
                }
            }

            procScopes.push({
                startLine, endLine, varTypes, classFields, enclosingClassLower,
                routineScopes: routineScopes.length > 0 ? routineScopes : undefined
            });
        }

        // #193 — additively key PRE-bearing structure members as `prefix:field` so a
        // prefixed base (`PRE:Field`) resolves. Runs after the bare-label walks so the
        // alias keys sit alongside (never replace) the existing bare keys.
        this.applyStructurePrefixKeying(tokens, tokensByLine, procScopes, moduleScope);

        return { procScopes, moduleScope };
    }

    /**
     * Helper for `buildFileVarTypeIndex`: extract the declared-type of a column-0
     * Label by inspecting the next significant token on the same line. Mutates
     * `target` map.
     */
    private captureLabelType(label: Token, lineTokens: Token[], target: Map<string, string>): void {
        if (!label.label) return;
        const declType = this.resolveLabelDeclaredType(label, lineTokens);
        if (declType !== undefined) {
            target.set(label.label.toLowerCase(), declType);
        }
    }

    /**
     * Determine the declared-type string for a column-0 Label by inspecting the next
     * significant token on its line (with a `label.dataType` fallback). Returns
     * `undefined` when no type can be derived. Extracted from `captureLabelType` so
     * the PRE-group prefix-keying pass can capture the same type for its alias key.
     */
    private resolveLabelDeclaredType(label: Token, lineTokens: Token[]): string | undefined {
        const idx = lineTokens.indexOf(label);
        if (idx < 0 || idx + 1 >= lineTokens.length) return undefined;
        const next = lineTokens[idx + 1];

        // Class-typed (`inst MyClass`), Type-keyword (`count LONG`), Reference (`mgr &MyClass`).
        if (next.type === TokenType.Type ||
            next.type === TokenType.Variable ||
            next.type === TokenType.Label) {
            return next.value;
        } else if (next.type === TokenType.ReferenceVariable) {
            return next.value.startsWith('&') ? next.value.slice(1) : next.value;
        } else if (label.dataType) {
            return label.dataType;
        }
        return undefined;
    }

    /**
     * #193 — PRE-group prefix-keying. Clarion structures (GROUP/RECORD/FILE/QUEUE)
     * may carry a `PRE(prefix)` attribute; their member fields are then addressable
     * as `prefix:field`. The base var-type walk keys those members by bare label only,
     * so a prefixed base (`PRE:Field`) cannot be resolved. This pass scans every
     * PRE-bearing Structure token and ADDITIVELY keys each member field as
     * `prefix:field` in whichever scope already holds its bare label (the proc scope
     * containing the member, else module scope). Additive → bare-label lookups are
     * byte-identical; only new colon-keys are added.
     *
     * The prefix value is read BY POSITION (the token after the PRE attribute's `(`),
     * never by token-type: a prefix that collides with a keyword (e.g. `PRE`) tokenizes
     * as Attribute, while a non-colliding one (e.g. `QUE`) tokenizes as Variable —
     * type-gating would silently miss the latter.
     */
    private applyStructurePrefixKeying(
        tokens: Token[],
        tokensByLine: Map<number, Token[]>,
        procScopes: Array<{ startLine: number; endLine: number; varTypes: Map<string, string> }>,
        moduleScope: Map<string, string>
    ): void {
        for (const structToken of tokens) {
            if (structToken.type !== TokenType.Structure) continue;
            if (structToken.finishesAt === undefined || structToken.finishesAt <= structToken.line) continue;

            const prefix = this.extractStructurePrefix(structToken, tokensByLine);
            if (!prefix) continue;
            const prefixLower = prefix.toLowerCase();

            // Member fields: column-0 Labels strictly between the structure line and its END.
            for (let line = structToken.line + 1; line < structToken.finishesAt; line++) {
                const lineTokens = tokensByLine.get(line);
                if (!lineTokens) continue;
                for (const cand of lineTokens) {
                    if (cand.type !== TokenType.Label || cand.start !== 0 || !cand.label) continue;
                    const declType = this.resolveLabelDeclaredType(cand, lineTokens);
                    if (declType === undefined) continue;
                    const aliasKey = `${prefixLower}:${cand.label.toLowerCase()}`;
                    const target = procScopes.find(s => line >= s.startLine && line <= s.endLine)?.varTypes
                        ?? moduleScope;
                    // Set-if-absent: a literal/explicit colon-label declaration (e.g. a var
                    // literally named `LOC:Name`) is authoritative over a PRE-alias and is
                    // already keyed by the bare walk that ran before this pass — never clobber
                    // it. Clarion precedence: explicit declaration wins over the prefix alias.
                    if (!target.has(aliasKey)) {
                        target.set(aliasKey, declType);
                    }
                }
            }
        }
    }

    /**
     * Extract a PRE-bearing structure's prefix value. Walks the structure's
     * declaration line for a `PRE` Attribute token followed by `(`, then returns the
     * token immediately after the `(` BY POSITION (regardless of its token-type — see
     * `applyStructurePrefixKeying`). Returns `undefined` when there is no PRE attribute.
     */
    private extractStructurePrefix(structToken: Token, tokensByLine: Map<number, Token[]>): string | undefined {
        const lineTokens = tokensByLine.get(structToken.line);
        if (!lineTokens) return undefined;
        for (let i = 0; i < lineTokens.length - 2; i++) {
            const t = lineTokens[i];
            if (t.type === TokenType.Attribute && t.value.toUpperCase() === 'PRE' &&
                lineTokens[i + 1].type === TokenType.Delimiter && lineTokens[i + 1].value === '(') {
                return lineTokens[i + 2].value;
            }
        }
        return undefined;
    }

    /**
     * Helper for `buildFileVarTypeIndex` Tier 4 — walks the named CLASS structure's
     * data members (col-0 Labels inside the class body, EXCLUDING method declarations).
     */
    private gatherClassDataMembers(
        classNameLower: string,
        tokens: Token[],
        tokensByLine: Map<number, Token[]>
    ): Map<string, string> {
        const fields = new Map<string, string>();
        for (const t of tokens) {
            if (t.type === TokenType.Structure && t.subType === TokenType.Class &&
                t.label?.toLowerCase() === classNameLower &&
                t.finishesAt !== undefined && t.finishesAt > t.line) {
                for (let line = t.line + 1; line < t.finishesAt; line++) {
                    const lineTokens = tokensByLine.get(line);
                    if (!lineTokens) continue;
                    for (let k = 0; k < lineTokens.length; k++) {
                        const cand = lineTokens[k];
                        if (cand.type !== TokenType.Label || cand.start !== 0 || !cand.label) continue;
                        // Skip method declarations — fields only.
                        const next = lineTokens[k + 1];
                        if (next && next.type === TokenType.Procedure) continue;
                        this.captureLabelType(cand, lineTokens, fields);
                    }
                }
            }
        }
        return fields;
    }

    /**
     * Tier 6 — load module-level variables from a different file (typically the
     * PROGRAM file, when the cursor's file is a MEMBER). Reuses the same module-scope
     * walk as `buildFileVarTypeIndex`. Returns empty map if the file can't be loaded.
     */
    public loadGlobalScopeFromProgramFile(programFileUri: string): Map<string, string> {
        const tokens = this.getTokensForUri(programFileUri);
        if (!tokens || tokens.length === 0) return new Map();
        return this.buildFileVarTypeIndex(tokens).moduleScope;
    }

    /**
     * Tier 6 entry point — resolve the PROGRAM file for the cursor's MEMBER (via FRG)
     * and load its module-scope vars. Returns null when FRG isn't built or when no
     * PROGRAM-scope data is reachable.
     *
     * Symmetric handling of cursor-in-PROGRAM vs cursor-in-MEMBER:
     * - Cursor-in-MEMBER: walk the FRG forward-MEMBER edge from the cursor's file to
     *   find the PROGRAM file; load its moduleScope as globalScope.
     * - Cursor-in-PROGRAM: cursor's file IS the program (no outgoing MEMBER edge).
     *   For cursor-own-file scans, the matching loop's own moduleScope already covers
     *   PROGRAM-level vars via Tier 5 — but the matching loop ALSO scans MEMBER files
     *   reachable via reverse-MEMBER edges, and those scans need globalScope to resolve
     *   PROGRAM-level vars. So when the cursor IS a PROGRAM (detected via reverse-MEMBER
     *   edge presence), return the cursor file's own moduleScope as globalScope so
     *   MEMBER-file scans can see it. Closes the cursor-in-PROGRAM silent-asymmetry bug
     *   (`671d7cd8` discovery — symmetric to `0c289e16`'s decl-vs-call cursor-side
     *   asymmetry, different axis).
     */
    public loadGlobalScopeForCursor(document: TextDocument): Map<string, string> | null {
        const graph = FileRelationshipGraph.getInstance();
        if (!graph.isBuilt) {
            // No-solution fallback: when editing a MEMBER file without FRG, resolve the
            // parent PROGRAM via MEMBER('x.clw') and load its module-scope globals.
            const docTokens = this.tokenCache.getTokens(document);
            const memberToken = docTokens.find(t =>
                t.type === TokenType.ClarionDocument &&
                t.value.toUpperCase() === 'MEMBER' &&
                !!t.referencedFile
            );
            if (memberToken?.referencedFile) {
                const resolved = resolveFileInNoSolutionMode(memberToken.referencedFile, document.uri);
                if (resolved) {
                    const programUri = 'file:///' + resolved.path.replace(/\\/g, '/');
                    return this.loadGlobalScopeFromProgramFile(programUri);
                }
            }
            return null;
        }
        const docFsPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
            .replace(/\//g, '\\');

        const programFsPath = graph.getProgramFile(docFsPath);
        if (programFsPath) {
            const programUri = 'file:///' + programFsPath.replace(/\\/g, '/');
            // Self-MEMBER edge case (cursor file MEMBERs itself) — fall back to
            // cursor's own moduleScope.
            if (programUri.toLowerCase() === document.uri.toLowerCase()) {
                return this.buildFileVarTypeIndex(this.tokenCache.getTokens(document)).moduleScope;
            }
            return this.loadGlobalScopeFromProgramFile(programUri);
        }

        // No outgoing MEMBER edge — cursor file might BE a PROGRAM. Check incoming
        // MEMBER edges: if any sibling files reference this one as their PROGRAM,
        // cursor IS the program. Return cursor's moduleScope so reverse-MEMBER scans
        // (MEMBER files reached via filesToSearch widening) can resolve PROGRAM-level
        // vars via the global tier.
        if (graph.getMemberFiles(docFsPath).length > 0) {
            return this.buildFileVarTypeIndex(this.tokenCache.getTokens(document)).moduleScope;
        }
        return null;
    }

    /**
     * P2b track-(b) — variable-type lookup at a source line + key.
     *
     * Walks the tier chain in Clarion's resolution priority order:
     *   1. Routine Local data (`routineScopes`, shadows the proc scope)
     *   2. Procedure parameters + 3. Procedure Local data (both in `procScope.varTypes`)
     *   4. CLASS member data via SELF (only consulted when `key` starts with "self.")
     *   5. Module data (`moduleScope`)
     *   6. Global data (`globalScope` from PROGRAM file)
     *
     * `key` is one of:
     *   - plain identifier (`'inst'`) → searched against varTypes / moduleScope / globalScope
     *   - SELF-prefixed (`'self.receiver'`) → searched against the procedure's classFields
     */
    public lookupVarTypeAtLine(
        index: FileVarTypeIndex,
        globalScope: Map<string, string> | null,
        line: number,
        key: string
    ): string | undefined {
        const scope = index.procScopes.find(s => line >= s.startLine && line <= s.endLine);

        // SELF.field path — Tier 4 only.
        if (key.startsWith('self.')) {
            const fieldNameLower = key.slice('self.'.length);
            return scope?.classFields?.get(fieldNameLower);
        }

        // Plain identifier path — full Clarion resolution priority order:
        //   Tier 1 (routine local) → Tier 2/3 (proc params + locals) → Tier 5 (module) → Tier 6 (global)
        // Routine-local wins over proc-local per the spec (own-name-scope shadowing).
        if (scope?.routineScopes) {
            const routine = scope.routineScopes.find(r => line >= r.startLine && line <= r.endLine);
            if (routine) {
                const routineHit = routine.varTypes.get(key);
                if (routineHit) return routineHit;
            }
        }
        if (scope) {
            const local = scope.varTypes.get(key);
            if (local) return local;
        }
        const moduleHit = index.moduleScope.get(key);
        if (moduleHit) return moduleHit;
        return globalScope?.get(key);
    }
}
