import { Token, TokenType } from "./ClarionTokenizer";
import { BranchInfo, BranchKind } from './tokenizer/TokenTypes';
import LoggerManager from "./logger";
import { ProcedureUtils } from './utils/ProcedureUtils';
import { isAttributeKeyword } from './utils/AttributeKeywords';
import { WindowDescriptor, WindowDescriptorParser } from './tokenizer/WindowDescriptorParser';
import { ViewDescriptor, ViewDescriptorParser } from './tokenizer/ViewDescriptorParser';
import { ControlService } from './utils/ControlService';

export type { WindowDescriptor } from './tokenizer/WindowDescriptorParser';
export type { ViewDescriptor } from './tokenizer/ViewDescriptorParser';
export type { BranchInfo, BranchKind } from './tokenizer/TokenTypes';

const logger = LoggerManager.getLogger("DocumentStructure");
logger.setLevel("error");// Production: Only log errors

/**
 * Snapshot of every container the cursor is nested inside, plus shortcut flags
 * for the common predicates. Returned by {@link DocumentStructure.getStructureContextAt}.
 *
 * Containment is strict: a line that opens or closes a structure (the line carrying
 * the keyword or the line carrying its END/period) is NOT considered to be inside
 * that structure. This matches the existing isInMapBlock/isInClassBlock semantics.
 */
export interface StructureContext {
    /** Innermost containing structure, or null at file scope. Same as `chain[0]`. */
    innermost: Token | null;
    /** Containing structures from innermost to outermost. Empty when at file scope. */
    chain: Token[];
    /** First scope-defining ancestor (PROCEDURE / FUNCTION / MethodImpl / ROUTINE / MODULE), or null. */
    scope: Token | null;
    inMap: boolean;
    inModule: boolean;
    inClass: boolean;
    inInterface: boolean;
    /** True if the cursor is inside a WINDOW or an APPLICATION. */
    inWindow: boolean;
    inReport: boolean;
    inFile: boolean;
    inView: boolean;
    /** True if the cursor is inside any data-bearing aggregate: QUEUE, GROUP, or RECORD. */
    inQueueOrGroupOrRecord: boolean;
}

const EMPTY_STRUCTURE_CONTEXT: StructureContext = {
    innermost: null,
    chain: [],
    scope: null,
    inMap: false,
    inModule: false,
    inClass: false,
    inInterface: false,
    inWindow: false,
    inReport: false,
    inFile: false,
    inView: false,
    inQueueOrGroupOrRecord: false,
};

/**
 * One logical Clarion line — possibly spanning multiple physical lines via the
 * `|` continuation marker. Returned by {@link DocumentStructure.getLogicalLine}.
 *
 * `joinedText` strips the trailing `|` of each continuation segment (replaced
 * with a single space to preserve token boundaries) and strips inline `!` comments.
 * Consumers that want the raw form should iterate `tokens` directly.
 */
export interface LogicalLine {
    /** Physical line where the logical line begins (the first line of the chain). */
    startLine: number;
    /** Physical line where the logical line ends. Equals `startLine` when there is
     *  no `|` continuation. */
    endLine: number;
    /** Concatenated source text with `|` markers replaced by single spaces and
     *  inline `!` comments stripped. */
    joinedText: string;
    /** Tokens that comprise the logical line, in source order, with
     *  `LineContinuation` and `Comment` tokens excluded. References live tokens
     *  from `tokensByLine` — do not re-tokenize the joined text. */
    tokens: Token[];
    /** Maps a 0-based column in `joinedText` back to its physical (line, column).
     *  O(log n) on the segment count via binary search. */
    map(joinedColumn: number): { line: number; column: number };
}

export class DocumentStructure {
    private structureStack: Token[] = [];
    private procedureStack: Token[] = [];
    private routineStack: Token[] = [];
    private foundData: boolean = false;
    private insideClassOrInterfaceOrMapDepth: number = 0;
    private structureIndentMap: Map<Token, number> = new Map();
    private maxLabelWidth: number = 0;

    // 🚀 PERFORMANCE: Index structures for O(1) lookups
    private labelIndex: Map<string, Token> = new Map();
    // Procedure / routine indexes keyed by uppercase label.
    // Built by buildSemanticIndexes() at the end of process(), once subType
    // assignments are final. Values are arrays because Clarion allows overloads
    // (multiple procedures sharing a name with different signatures).
    private procedureIndex: Map<string, Token[]> = new Map();
    private routineIndex: Map<string, Token[]> = new Map();
    private tokensByLine: Map<number, Token[]> = new Map();
    private structuresByType: Map<string, Token[]> = new Map();
    private parentIndex: Map<Token, Token> = new Map(); // 🚀 PERFORMANCE: O(1) parent lookups
    /**
     * Flat ?name → all matching FieldEquateLabel tokens across the document.
     * Used by `findControl(name)` (no scope) and `findControlAll(name)`.
     * Names are stored uppercase including the leading `?` so `?MyButton` keys as `?MYBUTTON`.
     */
    private fieldEquateIndex: Map<string, Token[]> = new Map();
    /**
     * Per-structure ?name → FieldEquateLabel token, keyed by the containing
     * WINDOW/REPORT/APPLICATION/TOOLBAR/MENUBAR token. First-occurrence-wins
     * when a window declares the same `?name` twice (Clarion compile error;
     * see TODO(Gap C follow-up) for the diagnostic candidate).
     */
    private fieldEquatesByStructure: Map<Token, Map<string, Token>> = new Map();
    /**
     * EQUATE Label index keyed by uppercase name. Plain EQUATEs are keyed by
     * their raw label (`MAX_ROWS`); ITEMIZE-EQUATEs are keyed by both their
     * raw label AND their PRE-expanded form (`Clr:Red`). Population happens
     * in linkEquatesPass after Gap D's `dataType` is on the Label tokens.
     */
    private equateIndex: Map<string, Token> = new Map();
    /** Cached list of ITEMIZE structure tokens for fast `getItemizeBlocks()` returns. */
    private itemizeBlocks: Token[] = [];
    /**
     * Structured WINDOW / APPLICATION / REPORT header descriptors keyed by
     * the container's Structure token. Built by `populateWindowDescriptors()`
     * during process(); consumed by `getWindowDescriptor` and the cursor-aware
     * `getActiveWindowDescriptor`.
     */
    private windowDescriptors: Map<Token, WindowDescriptor> = new Map();
    /**
     * VIEW descriptor cache — keyed by the VIEW Structure token, value is the
     * parsed `{ from, projectedFields, joins }` from `ViewDescriptorParser`.
     * Populated during process() by `populateViewDescriptors()`.
     */
    private viewDescriptors: Map<Token, ViewDescriptor> = new Map();

    /**
     * Reverse IMPLEMENTS index: for each interface name (UPPER), the list of CLASS
     * tokens that declare `IMPLEMENTS(InterfaceName)` in their attribute clause.
     * Built by `linkImplementorsPass` from the CLASS tokens' `implementedInterfaces`
     * arrays (set by handleStructureToken). First-occurrence order preserved within
     * each bucket; duplicates of the same class do not occur because each CLASS is
     * processed once.
     */
    private implementorsByInterface: Map<string, Token[]> = new Map();
    /**
     * Lazy cache for {@link getLogicalLine}. Each physical line in a continued
     * chain maps to the SAME LogicalLine object (so any line in the chain returns
     * the same answer). Cleared via {@link clearLogicalLineCache} whenever the
     * underlying tokens / line text could change.
     */
    private logicalLinesByPhysicalLine: Map<number, LogicalLine> = new Map();

    constructor(private tokens: Token[], private lines?: string[]) {
        // 🚀 PERFORMANCE: Build indexes first for fast lookups
        this.buildIndexes();
        this.maxLabelWidth = this.processLabels();
    }

    /**
     * 🚀 PERFORMANCE: Build index structures for fast lookups
     */
    private buildIndexes(): void {
        const perfStart = performance.now();
        
        // Index tokens by line for fast line-based lookups
        for (const token of this.tokens) {
            if (!this.tokensByLine.has(token.line)) {
                this.tokensByLine.set(token.line, []);
            }
            this.tokensByLine.get(token.line)!.push(token);
            
            // Index labels
            if (token.type === TokenType.Label && token.label) {
                this.labelIndex.set(token.label.toUpperCase(), token);
            }
            
            // Index structures by type
            if (token.type === TokenType.Structure) {
                const structType = token.value.toUpperCase();
                if (!this.structuresByType.has(structType)) {
                    this.structuresByType.set(structType, []);
                }
                this.structuresByType.get(structType)!.push(token);
            }
        }
        
        // 🚀 PERFORMANCE: Build parent relationship index
        this.buildParentIndex();

        const indexTime = performance.now() - perfStart;
        logger.perf('Built indexes', {
            'time_ms': indexTime.toFixed(2),
            'tokens': this.tokens.length,
            'labels': this.labelIndex.size,
            'lines': this.tokensByLine.size,
            'struct_types': this.structuresByType.size,
            'parent_relationships': this.parentIndex.size
        });
    }

    /**
     * 🚀 PERFORMANCE: Build parent relationship index for O(1) parent lookups
     * This eliminates the need for O(n) scans to find parent structures
     */
    private buildParentIndex(): void {
        const structureStack: Token[] = [];
        
        for (const token of this.tokens) {
            // Pop completed structures from the stack
            while (structureStack.length > 0) {
                const top = structureStack[structureStack.length - 1];
                if (top.finishesAt !== undefined && top.finishesAt < token.line) {
                    structureStack.pop();
                } else {
                    break;
                }
            }
            
            // Current parent is top of stack (if any)
            if (structureStack.length > 0) {
                this.parentIndex.set(token, structureStack[structureStack.length - 1]);
            }
            
            // Push new structures onto the stack
            if (this.isStructureToken(token)) {
                structureStack.push(token);
            }
        }
    }

    /**
     * Check if a token represents a structure that can have children
     */
    private isStructureToken(token: Token): boolean {
        // Structures: CLASS, INTERFACE, MAP, MODULE, GROUP, QUEUE, FILE, etc.
        if (token.type === TokenType.Structure) {
            return true;
        }
        
        // Procedures: PROCEDURE, FUNCTION, METHOD implementations
        if (token.subType === TokenType.Procedure ||
            token.subType === TokenType.GlobalProcedure ||
            token.subType === TokenType.MethodImplementation) {
            return true;
        }
        
        // Routines (nested procedures)
        if (token.subType === TokenType.Routine) {
            return true;
        }
        
        return false;
    }

    /**
     * 🚀 PERFORMANCE: Get the immediate parent token (O(1) lookup)
     * @param token The token to find the parent of
     * @returns The parent token or undefined if at top level
     */
    public getParent(token: Token): Token | undefined {
        return this.parentIndex.get(token);
    }

    /**
     * 🚀 PERFORMANCE: Get the parent scope token (O(1) lookup)
     * A scope is a procedure, routine, or top-level structure
     * @param token The token to find the parent scope of
     * @returns The parent scope token or undefined if at top level
     */
    public getParentScope(token: Token): Token | undefined {
        let parent = this.getParent(token);
        
        // Walk up the parent chain until we find a scope-defining structure
        while (parent) {
            if (this.isScopeToken(parent)) {
                return parent;
            }
            parent = this.getParent(parent);
        }
        
        return undefined;
    }

    /**
     * Check if a token defines a scope (procedure, routine, or module-like structure)
     */
    private isScopeToken(token: Token): boolean {
        // Procedures and routines define scopes
        if (token.subType === TokenType.Procedure ||
            token.subType === TokenType.GlobalProcedure ||
            token.subType === TokenType.MethodImplementation ||
            token.subType === TokenType.Routine) {
            return true;
        }
        
        // MODULE structures define scopes
        if (token.type === TokenType.Structure && 
            token.value.toUpperCase() === 'MODULE') {
            return true;
        }
        
        return false;
    }

    /**
     * 🚀 PERFORMANCE: Get tokens on a specific line (O(1) lookup)
     * @param line Line number
     * @returns Array of tokens on that line, or undefined if no tokens
     */
    public getTokensByLine(line: number): Token[] | undefined {
        return this.tokensByLine.get(line);
    }

    /**
     * Resolves the chain of containing structures at the given line and returns
     * convenience flags for the most common predicates. Single source of truth
     * for "what container am I in" — replaces the older isInMapBlock /
     * isInModuleBlock / isInWindowStructure / isInClassBlock helpers, which now
     * call through to this method.
     *
     * Containment is strict: the structure-opening line and the END/period line
     * are NOT considered inside the structure (matches the existing helpers).
     *
     * @param line Line number to inspect (0-based)
     * @param _character Reserved for future use (cursor-character precision)
     */
    public getStructureContextAt(line: number, _character?: number): StructureContext {
        const seed = this.findSeedTokenForLine(line);
        if (!seed) return EMPTY_STRUCTURE_CONTEXT;

        const chain: Token[] = [];
        let scope: Token | null = null;

        // Walk from the seed's parent upward. We deliberately start one level
        // above the seed so a structure-keyword token on its own opening line
        // resolves to the OUTER chain rather than to itself.
        let cursor: Token | undefined = this.parentIndex.get(seed);
        while (cursor) {
            if (cursor.type === TokenType.Structure) {
                if (
                    cursor.finishesAt !== undefined &&
                    line > cursor.line &&
                    line < cursor.finishesAt
                ) {
                    chain.push(cursor);
                }
            } else if (!scope && this.isScopeToken(cursor)) {
                scope = cursor;
            }
            cursor = this.parentIndex.get(cursor);
        }

        return this.buildStructureContext(chain, scope);
    }

    /**
     * True iff the line is inside any structure whose keyword matches one of the
     * supplied names (case-insensitive). Convenience over getStructureContextAt
     * for ad-hoc multi-keyword checks. Returns false when no keywords are passed.
     */
    public isInsideStructure(line: number, ...keywords: string[]): boolean {
        if (keywords.length === 0) return false;
        const upper = new Set(keywords.map(k => k.toUpperCase()));
        const ctx = this.getStructureContextAt(line);
        return ctx.chain.some(t => upper.has(t.value.toUpperCase()));
    }

    /**
     * Pick a token to start the parent walk from. Prefers tokens on the queried
     * line; on blank lines walks FORWARD to the next non-empty line, falling back
     * to walking backward only past EOF.
     *
     * Why forward first: walking back from a blank line can land on a structure's
     * opening line, and the seed there is the structure's label — whose parent
     * resolves to the OUTER scope, missing the structure that actually contains
     * the queried line. Walking forward lands on a child token whose parent
     * resolves correctly through `parentIndex`.
     */
    private findSeedTokenForLine(line: number): Token | null {
        let lineTokens = this.tokensByLine.get(line);
        if (lineTokens && lineTokens.length > 0) return lineTokens[0];

        const lastLine = this.tokens[this.tokens.length - 1]?.line ?? 0;
        for (let s = line + 1; s <= lastLine; s++) {
            lineTokens = this.tokensByLine.get(s);
            if (lineTokens && lineTokens.length > 0) return lineTokens[0];
        }
        for (let s = line - 1; s >= 0; s--) {
            lineTokens = this.tokensByLine.get(s);
            if (lineTokens && lineTokens.length > 0) return lineTokens[0];
        }
        return null;
    }

    private buildStructureContext(chain: Token[], scope: Token | null): StructureContext {
        const has = (kw: string) => chain.some(t => t.value.toUpperCase() === kw);
        return {
            innermost: chain[0] ?? null,
            chain,
            scope,
            inMap: has('MAP'),
            inModule: has('MODULE'),
            inClass: has('CLASS'),
            inInterface: has('INTERFACE'),
            inWindow: has('WINDOW') || has('APPLICATION'),
            inReport: has('REPORT'),
            inFile: has('FILE'),
            inView: has('VIEW'),
            inQueueOrGroupOrRecord: has('QUEUE') || has('GROUP') || has('RECORD'),
        };
    }

    /**
     * Gets the control and structure context at a specific position
     * Used for context-aware IntelliSense features
     */
    public getControlContextAt(line: number, character: number): {
        controlType: string | null;
        controlToken: Token | null;
        structureType: string | null;
        structureToken: Token | null;
        isInControlDeclaration: boolean;
    } {
        // Get tokens on this line
        const lineTokens = this.tokensByLine.get(line) || [];
        
        // Walk backwards from character position to find control keyword
        let controlToken: Token | null = null;
        for (let i = lineTokens.length - 1; i >= 0; i--) {
            const token = lineTokens[i];
            
            // If we're past our position, skip
            if (token.start > character) continue;
            
            // If we hit the start of the line and it's not a control, we're done
            if (token.start < character) {
                // Check if this is a window element (control)
                if (token.type === TokenType.WindowElement || 
                    token.type === TokenType.Structure) {
                    const upperValue = token.value.toUpperCase();
                    
                    // Check if it's a known control type
                    if (this.isControlKeyword(upperValue)) {
                        controlToken = token;
                        break;
                    }
                }
            }
        }
        
        // If no control found on current line, check if we're in a multi-line control declaration
        if (!controlToken) {
            // Walk back through previous lines to find control start
            for (let checkLine = line - 1; checkLine >= Math.max(0, line - 10); checkLine--) {
                const prevLineTokens = this.tokensByLine.get(checkLine) || [];
                
                // Look for control keyword that hasn't been closed
                for (const token of prevLineTokens) {
                    if (token.type === TokenType.WindowElement || 
                        token.type === TokenType.Structure) {
                        const upperValue = token.value.toUpperCase();
                        if (this.isControlKeyword(upperValue)) {
                            // Check if this control declaration is still open (no END on its line)
                            const hasEnd = prevLineTokens.some(t => 
                                t.type === TokenType.EndStatement
                            );
                            if (!hasEnd) {
                                controlToken = token;
                                break;
                            }
                        }
                    }
                }
                if (controlToken) break;
            }
        }
        
        // Get the parent structure (WINDOW, REPORT, etc.)
        let structureToken: Token | null = null;
        if (controlToken && controlToken.parent) {
            structureToken = controlToken.parent;
        } else {
            // TODO(Gap K follow-up): this fallback walks `structureStack`, which is
            // the build-time stack and is empty by the time external callers run.
            // Effectively dead code — to be removed once a follow-up cleanup task
            // confirms no caller relies on it. New callers should prefer
            // getStructureContextAt() instead.
            for (let i = this.structureStack.length - 1; i >= 0; i--) {
                const struct = this.structureStack[i];
                if (struct.line <= line) {
                    structureToken = struct;
                    break;
                }
            }
        }
        
        return {
            controlType: controlToken?.value.toUpperCase() || null,
            controlToken,
            structureType: structureToken?.value.toUpperCase() || null,
            structureToken,
            isInControlDeclaration: controlToken !== null
        };
    }

    /**
     * Checks if a keyword is a known control type. Delegates to `ControlService`
     * so the recognised set is the union of `clarion-controls.json`'s
     * `windowControls` and `reportControls` arrays — single source of truth
     * shared with `WordCompletionProvider.collectControls` and `AttributeService`.
     *
     * Previously this method carried its own hard-coded list that drifted from
     * the JSON: report-only controls (DETAIL, HEADER, FOOTER, FORM) were missed,
     * and any new control added to the JSON required a parallel edit here.
     * Refactored as Gap J of the DocumentStructure audit.
     */
    private isControlKeyword(keyword: string): boolean {
        return ControlService.getInstance().isControl(keyword);
    }

    public process(): void {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];

            // ✅ Always prioritize structure tokens first.
            // TokenType.Procedure is included for idempotency: handleProcedureToken
            // rewrites Keyword → Procedure on the first pass, so when process()
            // runs a second time on the same token array (e.g. via TokenCache
            // incrementalTokenize merging cached + freshly tokenized tokens),
            // PROCEDURE / FUNCTION tokens kept from the prior pass would otherwise
            // fall through every branch and get skipped. That made the procedureStack
            // and executionMarker assignments drift across edits — symptom: #62
            // stale-diagnostic on multi-procedure PROGRAM shapes (Alice, 2026-05-04).
            if (token.type === TokenType.Keyword ||
                token.type === TokenType.ExecutionMarker ||
                token.type === TokenType.Procedure) {
                const upperValue = token.value.toUpperCase();
                
                // Handle PROCEDURE and FUNCTION (both are procedure declarations in modern Clarion)
                if (ProcedureUtils.isProcedureKeyword(upperValue)) {
                    this.handleProcedureToken(token, i);
                    continue;
                }
                
                switch (upperValue) {
                    case "ROUTINE":
                        this.handleRoutineToken(token, i);
                        break;
                    case "CODE":
                    case "DATA":
                        this.handleExecutionMarker(token);
                        break;
                    case "WHILE":
                    case "UNTIL":
                        // Check if this WHILE/UNTIL terminates a LOOP
                        this.handleLoopTerminator(token, i);
                        break;
                }
            } else if (token.type === TokenType.Structure) {
                this.handleStructureToken(token, i);
            } else if (token.type === TokenType.EndStatement) {
                this.handleEndStatementForStructure(token);
            } else if (token.type === TokenType.Label && token.start === 0) {
                // Special case: CODE/DATA at column 0 should be execution markers, not field labels
                const upperValue = token.value.toUpperCase();
                if (upperValue === 'CODE' || upperValue === 'DATA') {
                    logger.info(`🔧 [ROUTINE-DATA-FIX] Handling CODE/DATA as execution marker: "${token.value}" at line ${token.line}`);
                    logger.debug(`🔧 [ROUTINE-DATA-FIX] Handling CODE/DATA as execution marker: "${token.value}" at line ${token.line}`);
                    this.handleExecutionMarker(token);
                }
                // Add label tokens as children of their parent structure (for GROUP/QUEUE/RECORD fields)
                else if (this.structureStack.length > 0) {
                    const parentStructure = this.structureStack[this.structureStack.length - 1];
                    const structureTypes = ["RECORD", "GROUP", "QUEUE", "FILE", "VIEW", "WINDOW", "REPORT"];
                    if (structureTypes.includes(parentStructure.value.toUpperCase())) {
                        parentStructure.children = parentStructure.children || [];
                        parentStructure.children.push(token);
                        token.parent = parentStructure;
                        logger.info(`📌 Added field '${token.value}' as child of structure '${parentStructure.value}'`);
                    }
                }
            }
            
        }
        
        // Resolve file references for all tokens that have them
        this.resolveFileReferences();
        
        // Close any procedures that are still open at the end of the file
        this.closeRemainingProcedures();
        this.assignMaxLabelLengths();

        // Rebuild the parentIndex now that finishesAt and subType are set by process().
        // The constructor built it before process() ran, so finishesAt was undefined and
        // isStructureToken() had no subType data — the index was effectively empty.
        this.parentIndex.clear();
        this.buildParentIndex();

        // Build name-keyed indexes for procedures and routines now that subTypes are final.
        this.buildSemanticIndexes();

        // Build the FieldEquate (?Ctrl) indexes and link USE() tokens to their targets.
        this.linkUsesPass();

        // Build the EQUATE / ITEMIZE-EQUATE index. Reads `dataType` set by Charlie's
        // Gap D populator, so it must run after that — which is implicit because
        // populateDeclaredValues runs in the tokenizer step before DocumentStructure
        // is even constructed.
        this.linkEquatesPass();

        // Build the reverse IMPLEMENTS index from each CLASS token's
        // `implementedInterfaces` array (set in handleStructureToken).
        this.linkImplementorsPass();

        // Invalidate the lazy logical-line cache. process() can run more than
        // once on the same DS (e.g. TokenCache fallbacks), and stale chains
        // would point at out-of-date Token references.
        this.clearLogicalLineCache();

        // Parse WINDOW / APPLICATION / REPORT header attributes into structured
        // descriptors. Runs after the logical-line cache is cleared so the pass
        // can use a fresh cache via `getLogicalLine` to handle multi-line headers
        // joined by `|` continuations.
        this.populateWindowDescriptors();

        // Parse VIEW headers + bodies into structured descriptors. Like the
        // window descriptor pass above, this runs after the logical-line cache
        // is cleared so multi-line VIEW headers / clauses can be joined cleanly.
        this.populateViewDescriptors();

        // Walk every CASE / IF structure and record its OF / OROF / ELSE / ELSIF
        // clauses on the parent token's `branches` field.
        this.populateBranches();
    }

    /**
     * Walks every CASE and IF structure and records its OF / OROF / ELSE / ELSIF
     * clauses on the parent token's `branches` array. Branches are emitted in
     * source order; each entry covers the body lines that belong to that branch
     * (up to the next branch's keyword line, or the END line for the last).
     *
     * Nested CASE/IF inside a branch are handled by their own `populateBranches`
     * pass — the outer pass skips their inner ConditionalContinuation tokens to
     * avoid double-attribution.
     */
    private populateBranches(): void {
        const cases = this.structuresByType.get('CASE') ?? [];
        const ifs   = this.structuresByType.get('IF') ?? [];
        const containers: Token[] = [...cases, ...ifs];
        if (containers.length === 0) return;

        for (const container of containers) {
            // Always reset — process() may run more than once on the same DS.
            container.branches = undefined;

            if (container.finishesAt === undefined) continue;

            // Inner CASE/IF blocks fully contained inside this one. Their
            // ConditionalContinuation tokens are owned by the inner block.
            const inner = containers.filter(c =>
                c !== container &&
                c.finishesAt !== undefined &&
                c.line > container.line &&
                c.finishesAt < container.finishesAt!
            );

            const branchTokens: Token[] = [];
            for (const t of this.tokens) {
                if (t.type !== TokenType.ConditionalContinuation) continue;
                if (t.line <= container.line || t.line >= container.finishesAt) continue;
                const upper = t.value.toUpperCase();
                if (upper !== 'OF' && upper !== 'OROF' && upper !== 'ELSE' && upper !== 'ELSIF') continue;

                // Skip if inside a nested CASE/IF — that pass owns it.
                const inNested = inner.some(n =>
                    t.line > n.line && t.line < n.finishesAt!
                );
                if (inNested) continue;

                branchTokens.push(t);
            }

            if (branchTokens.length === 0) continue;
            // Sort by source position (line then column) to be deterministic.
            branchTokens.sort((a, b) =>
                a.line !== b.line ? a.line - b.line : a.start - b.start
            );

            const branches: BranchInfo[] = [];
            for (let i = 0; i < branchTokens.length; i++) {
                const tok = branchTokens[i];
                const next = branchTokens[i + 1];
                const startLine = tok.line;
                const endLine = next ? next.line - 1 : container.finishesAt - 1;
                const kind = tok.value.toUpperCase() as BranchKind;
                const valueExpr = kind === 'ELSE' ? undefined : this.extractBranchExpression(tok);
                const entry: BranchInfo = {
                    kind,
                    startLine,
                    endLine,
                    keywordToken: tok,
                };
                if (valueExpr !== undefined) entry.valueExpr = valueExpr;
                branches.push(entry);
            }
            container.branches = branches;
        }
    }

    /**
     * Returns the conditional expression text that follows an OF / OROF / ELSIF
     * keyword on its logical line, joined across `|` continuations. Trailing
     * whitespace is trimmed; comments are already stripped by `getLogicalLine`.
     */
    private extractBranchExpression(keywordToken: Token): string | undefined {
        const logical = this.getLogicalLine(keywordToken.line);
        if (!logical) return undefined;
        const joined = logical.joinedText;
        // Find the keyword in the joined text (case-insensitive). The keyword's
        // physical column is `keywordToken.start` on its physical line, but the
        // joined text might have rewritten leading whitespace; so search for
        // the first occurrence of the keyword as a whole word.
        const re = new RegExp(`\\b${keywordToken.value.toUpperCase()}\\b`, 'i');
        const match = joined.match(re);
        if (!match || match.index === undefined) return undefined;
        const after = joined.slice(match.index + match[0].length).trim();
        return after === '' ? undefined : after;
    }

    /**
     * Walks every WINDOW, APPLICATION, and REPORT structure token and parses
     * its header line (joined across `|` continuations via Alice's Gap P
     * `getLogicalLine`) into a `WindowDescriptor`. Stored in `windowDescriptors`
     * keyed by the structure Token for O(1) lookup.
     */
    private populateWindowDescriptors(): void {
        this.windowDescriptors.clear();
        for (const containerType of ['WINDOW', 'APPLICATION', 'REPORT'] as const) {
            const tokens = this.structuresByType.get(containerType);
            if (!tokens) continue;
            for (const tok of tokens) {
                const logical = this.getLogicalLine(tok.line);
                const headerText = logical?.joinedText ?? this.getPhysicalLineText(tok.line);
                this.windowDescriptors.set(tok, WindowDescriptorParser.parse(headerText));
            }
        }
    }

    /**
     * Walks every VIEW structure, builds a logical-joined header (the
     * `MyView VIEW(File)` line) and a logical-joined body (every line strictly
     * between the VIEW opener and its END), and parses both into a
     * `ViewDescriptor`. Stored in `viewDescriptors` keyed by the VIEW Token
     * for O(1) `getViewDescriptor` lookup.
     */
    private populateViewDescriptors(): void {
        this.viewDescriptors.clear();
        const views = this.structuresByType.get('VIEW');
        if (!views) return;
        for (const view of views) {
            if (view.finishesAt === undefined) continue;
            const headerLogical = this.getLogicalLine(view.line);
            const headerText = headerLogical?.joinedText ?? this.getPhysicalLineText(view.line);

            // Build the body by joining every logical line strictly between
            // the VIEW header chain end and the END line. Skip lines that are
            // already part of the header's `|` chain.
            const bodyChunks: string[] = [];
            const headerEnd = headerLogical?.endLine ?? view.line;
            let line = headerEnd + 1;
            while (line < view.finishesAt) {
                const logical = this.getLogicalLine(line);
                if (logical) {
                    bodyChunks.push(logical.joinedText);
                    line = logical.endLine + 1;
                } else {
                    line++;
                }
            }
            const bodyText = bodyChunks.join('\n');
            this.viewDescriptors.set(view, ViewDescriptorParser.parse(headerText, bodyText));
        }
    }

    /**
     * Single-pass over the token stream that:
     *   1) builds the flat fieldEquateIndex of every `?Name` FieldEquateLabel,
     *   2) builds per-structure ?name maps for windows/reports/applications/toolbars/menubars,
     *   3) sets `linkedTo` on every USE keyword token whose argument resolves to a known
     *      FieldEquateLabel, Label/Variable, or StructurePrefix-qualified field,
     *   4) sets `hasNoFieldEquate = true` on USE tokens whose argument is the bare `?`
     *      "no field equate" idiom (a FieldEquateLabel with value `?` since the
     *      tokenizer follow-up; falls back to detecting the empty-arg form for safety).
     *
     * TODO(Gap C follow-up): a duplicate ?name within a single window is a Clarion
     * compiler error and is a candidate Diagnostic — first-occurrence wins in the
     * per-structure index here, but no warning is currently raised. See kanban for
     * the diagnostic ticket.
     */
    private linkUsesPass(): void {
        this.fieldEquateIndex.clear();
        this.fieldEquatesByStructure.clear();

        // Container structures whose direct FieldEquateLabel descendants we map per-structure.
        const containerKeywords = ['WINDOW', 'APPLICATION', 'REPORT', 'TOOLBAR', 'MENUBAR'];

        // 1. Flat index of every ?name token in the document.
        for (const token of this.tokens) {
            if (token.type !== TokenType.FieldEquateLabel) continue;
            const key = token.value.toUpperCase();
            const list = this.fieldEquateIndex.get(key);
            if (list) list.push(token); else this.fieldEquateIndex.set(key, [token]);
        }

        // 2. Per-structure maps. Walk each known container and grab the FieldEquateLabel
        //    tokens between its open and close. First-occurrence wins on duplicate names.
        for (const kw of containerKeywords) {
            const containers = this.structuresByType.get(kw);
            if (!containers) continue;
            for (const c of containers) {
                if (c.finishesAt === undefined) continue;
                const perName = new Map<string, Token>();
                for (const token of this.tokens) {
                    if (token.line <= c.line) continue;
                    if (token.line >= c.finishesAt) break;
                    if (token.type !== TokenType.FieldEquateLabel) continue;
                    const key = token.value.toUpperCase();
                    if (!perName.has(key)) perName.set(key, token);
                }
                if (perName.size > 0) this.fieldEquatesByStructure.set(c, perName);
            }
        }

        // 3. Walk USE keyword tokens and resolve their argument to a target token.
        for (let i = 0; i < this.tokens.length; i++) {
            const t = this.tokens[i];
            if (t.value.toUpperCase() !== 'USE') continue;
            // USE outside an attribute list (e.g. a stray label, comment matching) — skip
            // unless followed immediately by '('.
            const open = this.tokens[i + 1];
            if (!open || open.value !== '(' || open.line !== t.line) continue;

            // Collect the tokens between this `(` and its matching `)`. We use the
            // token stream's existing depth tracking rather than the source string.
            const args: Token[] = [];
            let depth = 1;
            let j = i + 2;
            for (; j < this.tokens.length; j++) {
                const a = this.tokens[j];
                if (a.value === '(') { depth++; args.push(a); continue; }
                if (a.value === ')') {
                    depth--;
                    if (depth === 0) break;
                    args.push(a);
                    continue;
                }
                args.push(a);
            }

            // v1 forms only: single FieldEquateLabel, single Label/Variable, single StructurePrefix.
            // The Clarion `USE(?)` "no field equate" idiom now tokenises as a FieldEquateLabel
            // with value `?` (Gap C follow-up). It still gets the convenience flag so
            // consumers can branch on it directly without reading linkedTo's value.
            if (args.length === 0) {
                // Defensive — older tokenizer behaviour where `?` was dropped entirely.
                t.hasNoFieldEquate = true;
                continue;
            }
            if (args.length === 1) {
                const a = args[0];
                if (a.type === TokenType.FieldEquateLabel) {
                    if (a.value === '?') {
                        // Bare `?` — no underlying control; flag and skip linking.
                        t.hasNoFieldEquate = true;
                    } else {
                        t.linkedTo = a;
                    }
                    continue;
                }
                if (a.type === TokenType.StructurePrefix) {
                    // Resolve the structure-prefix target via the existing prefix machinery.
                    const target = this.resolveStructurePrefixTarget(a);
                    if (target) t.linkedTo = target;
                    continue;
                }
                if (a.type === TokenType.Variable || a.type === TokenType.Label || a.type === TokenType.Function) {
                    const target = this.labelIndex.get(a.value.toUpperCase());
                    if (target) t.linkedTo = target;
                    continue;
                }
            }
            // Multi-token argument forms — defer.
        }
    }

    /**
     * Resolve a StructurePrefix token (`PRE:Name`) to the field token it references.
     * Looks for a structure with matching `structurePrefix` and a child Label whose
     * value matches the suffix. Returns undefined when ambiguous or unresolved.
     */
    private resolveStructurePrefixTarget(prefixToken: Token): Token | undefined {
        const colonIdx = prefixToken.value.indexOf(':');
        if (colonIdx < 0) return undefined;
        const prefix = prefixToken.value.slice(0, colonIdx).toUpperCase();
        const fieldName = prefixToken.value.slice(colonIdx + 1).toUpperCase();
        if (!prefix || !fieldName) return undefined;

        for (const token of this.tokens) {
            if (
                token.type === TokenType.Structure &&
                token.structurePrefix?.toUpperCase() === prefix &&
                token.children
            ) {
                const hit = token.children.find(c => c.value.toUpperCase() === fieldName);
                if (hit) return hit;
            }
        }
        return undefined;
    }

    /**
     * Walk the token list once and populate procedureIndex + routineIndex by uppercase label.
     * Procedure subtypes covered: GlobalProcedure, MethodImplementation, MapProcedure,
     * MethodDeclaration, InterfaceMethod. Tokens with no label are skipped (cannot be looked
     * up by name anyway).
     */
    private buildSemanticIndexes(): void {
        this.procedureIndex.clear();
        this.routineIndex.clear();

        for (const token of this.tokens) {
            if (!token.label) continue;
            const upperKey = token.label.toUpperCase();

            const sub = token.subType;
            if (
                sub === TokenType.GlobalProcedure ||
                sub === TokenType.MethodImplementation ||
                sub === TokenType.MapProcedure ||
                sub === TokenType.MethodDeclaration ||
                sub === TokenType.InterfaceMethod
            ) {
                const list = this.procedureIndex.get(upperKey);
                if (list) list.push(token); else this.procedureIndex.set(upperKey, [token]);
            }

            if (sub === TokenType.Routine) {
                const list = this.routineIndex.get(upperKey);
                if (list) list.push(token); else this.routineIndex.set(upperKey, [token]);
            }
        }
    }

    /**
     * Builds the equate index and PRE-expands ITEMIZE_EQUATE labels.
     *
     * Detection: a column-0 Label whose line carries an `EQUATE` keyword token.
     * Charlie's Gap D `dataType` field is NOT used here, even though it would be
     * the natural check, because `populateDeclaredValues` runs at tokenize step 6
     * — AFTER `DocumentStructure.process()` (step 2) — so `dataType` is undefined
     * when this pass runs. The shared Token instances do receive `dataType` later,
     * which means consumers reading from this index post-tokenize see the enriched
     * value (e.g. `findEquate(name).dataValue`); only the in-pass detection needs
     * the line-token fallback.
     *
     * For each EQUATE Label, walks `parentIndex` upward looking for the nearest
     * ITEMIZE ancestor that carries a PRE prefix. If one is found, the Label gets
     * `prefixedEquateName = '<prefix>:<label>'` and the equateIndex receives both
     * the prefixed and the bare-name keys (callers can look up either form).
     *
     * Inner ITEMIZE without PRE inherits the next ancestor's PRE — the loop keeps
     * walking past prefix-less ITEMIZE blocks until either a PRE-bearing ancestor
     * is found or the chain ends. This handles the nested-no-PRE / outer-with-PRE
     * case that StructureDeclarationIndexer's regex pass already supports.
     *
     * TODO(Gap B follow-up): an ITEMIZE block containing a non-EQUATE statement is
     * a Clarion compile error — candidate Diagnostic, tracked separately.
     */
    private linkEquatesPass(): void {
        this.equateIndex.clear();
        this.itemizeBlocks = this.structuresByType.get('ITEMIZE')
            ? [...this.structuresByType.get('ITEMIZE')!]
            : [];

        for (const t of this.tokens) {
            if (t.type !== TokenType.Label) continue;
            if (t.start !== 0) continue;
            // Note: deliberately NOT filtering on `isStructureField`. Tokenizer step 2.5
            // (StructureProcessor.processStructureFieldPrefixes) marks every Label inside
            // a PRE-bearing structure — including ITEMIZE — as a structure field, which
            // would skip the very EQUATEs we want to index. The line-text EQUATE check
            // below is a stricter filter that already excludes non-EQUATE structure
            // fields (RECORD/GROUP/QUEUE etc. carry STRING/LONG/LIKE on their lines, not
            // EQUATE), so the redundant filter is dropped here.
            if (!this.lineContainsEquateKeyword(t.line, t.start)) continue;

            // Walk ancestors looking for the nearest ITEMIZE with a PRE prefix.
            let pre: string | undefined;
            let cursor: Token | undefined = this.parentIndex.get(t);
            while (cursor) {
                if (
                    cursor.type === TokenType.Structure &&
                    cursor.value.toUpperCase() === 'ITEMIZE' &&
                    cursor.structurePrefix
                ) {
                    pre = cursor.structurePrefix;
                    break;
                }
                cursor = this.parentIndex.get(cursor);
            }

            if (pre) {
                t.prefixedEquateName = `${pre}:${t.value}`;
                this.equateIndex.set(t.prefixedEquateName.toUpperCase(), t);
            }
            // Always index by the raw label too — callers may look up either form.
            // First-occurrence-wins on collisions (rare; would be a duplicate symbol).
            const rawKey = t.value.toUpperCase();
            if (!this.equateIndex.has(rawKey)) {
                this.equateIndex.set(rawKey, t);
            }
        }
    }

    /**
     * Builds the reverse IMPLEMENTS index. Walks every CLASS token in
     * `structuresByType.get('CLASS')` and pushes it into a per-interface bucket
     * for each name in its `implementedInterfaces` array. Names are normalised
     * to uppercase for lookup.
     */
    private linkImplementorsPass(): void {
        this.implementorsByInterface.clear();
        const classes = this.structuresByType.get('CLASS');
        if (!classes) return;

        for (const cls of classes) {
            const interfaces = cls.implementedInterfaces;
            if (!interfaces || interfaces.length === 0) continue;
            for (const ifaceName of interfaces) {
                const key = ifaceName.toUpperCase();
                const bucket = this.implementorsByInterface.get(key);
                if (bucket) bucket.push(cls);
                else this.implementorsByInterface.set(key, [cls]);
            }
        }
    }

    /**
     * True iff a token on `line` after column `afterColumn` has value EQUATE.
     * Used by `linkEquatesPass` to recognise EQUATE Label declarations without
     * relying on Gap D's `dataType` (which is populated later in the tokenize
     * pipeline — see linkEquatesPass docstring for the timing rationale).
     */
    private lineContainsEquateKeyword(line: number, afterColumn: number): boolean {
        const lineTokens = this.tokensByLine.get(line);
        if (!lineTokens) return false;
        for (const t of lineTokens) {
            if (t.start <= afterColumn) continue;
            if (t.value && t.value.toUpperCase() === 'EQUATE') return true;
        }
        return false;
    }

    private handleExecutionMarker(token: Token): void {
        const currentProcedure = this.procedureStack[this.procedureStack.length - 1] ?? null;
        const currentRoutine = this.routineStack[this.routineStack.length - 1] ?? null;

        if (token.value.toUpperCase() === "DATA") {
            if (currentRoutine) {
                currentRoutine.hasLocalData = true;
                this.foundData = true;
            } else if (currentProcedure) {
                currentProcedure.hasLocalData = true;
                this.foundData = true;
            }
        }

        if (token.value.toUpperCase() === "CODE") {
            if (currentRoutine) {
                currentRoutine.executionMarker = token;
                logger.info(`🚀 CODE execution marker set for ROUTINE '${currentRoutine.value}' at Line ${token.line}`);
            } else if (currentProcedure) {
                currentProcedure.executionMarker = token;
                logger.info(`🚀 CODE execution marker set for PROCEDURE '${currentProcedure.label}' (line ${currentProcedure.line}) at Line ${token.line}. Stack depth: ${this.procedureStack.length}`);
            } else {
                logger.warn(`⚠️ CODE statement found at Line ${token.line}, but no valid procedure or routine to assign it to.`);
            }
        }
    }

    private processLabels(): number {
        let maxLabelWidth = 0;

        for (const token of this.tokens) {
            const insideExecutionCode = this.procedureStack.length > 0;

            if (!insideExecutionCode && token.start === 0 && 
                token.type !== TokenType.Comment && 
                token.type !== TokenType.Directive && 
                token.type !== TokenType.EndStatement &&  // ✅ Don't convert END tokens to labels
                token.value !== '?') {
                token.type = TokenType.Label;
                token.label = token.value;
                maxLabelWidth = Math.max(maxLabelWidth, token.value.length);
                logger.info(`📌 Label '${token.value}' detected at Line ${token.line}, structureStack.length=${this.structureStack.length}`);

                // Enrich structureType: look for a Structure/Type token after the label on the same line
                // e.g. "Names FILE,DRIVER(...)" → Names.structureType = 'FILE'
                // Must be done here (not in buildIndexes) because processLabels is what sets token.type=Label
                const lineTokens = this.tokensByLine.get(token.line);
                if (lineTokens) {
                    const structToken = lineTokens.find(t =>
                        t.start > token.start &&
                        (t.type === TokenType.Structure || t.type === TokenType.Type)
                    );
                    if (structToken) {
                        token.structureType = structToken.value.toUpperCase();
                    }
                }

                if (this.structureStack.length > 0) {
                    let parentStructure = this.structureStack[this.structureStack.length - 1];
                    logger.info(`📌 Parent structure: '${parentStructure.value}' at line ${parentStructure.line}`);
                    parentStructure.maxLabelLength = Math.max(parentStructure.maxLabelLength || 0, token.value.length);

                    // ✅ If we're inside a structure that can have fields, mark this as a structure field
                    // This includes RECORD, GROUP, QUEUE, FILE, etc.
                    const structureTypes = ["RECORD", "GROUP", "QUEUE", "FILE", "VIEW", "WINDOW", "REPORT"];
                    if (structureTypes.includes(parentStructure.value.toUpperCase())) {
                        token.isStructureField = true;
                        token.structureParent = parentStructure;
                        
                        // ✅ Add field as child of the parent structure
                        parentStructure.children = parentStructure.children || [];
                        parentStructure.children.push(token);
                        logger.info(`📌 Added field '${token.value}' as child of structure '${parentStructure.value}'`);

                        // Find the label of the parent structure (if any)
                        // 🚀 PERFORMANCE: Use tokensByLine index instead of indexOf
                        const lineTokens = this.tokensByLine.get(parentStructure.line);
                        if (lineTokens) {
                            const structIndex = lineTokens.indexOf(parentStructure);
                            if (structIndex > 0) {
                                // Check if the token before the structure is a label
                                const prevToken = lineTokens[structIndex - 1];
                                if (prevToken && prevToken.type === TokenType.Label) {
                                    // Set the nestedLabel property to the parent structure's label
                                    token.nestedLabel = prevToken.value;
                                    logger.info(`📌 Field '${token.value}' has nested label '${prevToken.value}'`);
                                }
                            }
                        }

                        // Check for a prefix in the structure hierarchy
                        let prefixFound = false;

                        // First check the immediate parent structure
                        if (parentStructure.structurePrefix) {
                            // Set the structurePrefix property on the label token
                            token.structurePrefix = parentStructure.structurePrefix;
                            logger.info(`📌 Field '${token.value}' associated with prefix '${parentStructure.structurePrefix}'`);
                            prefixFound = true;
                        }

                        // If no prefix found and we're in a nested structure, look up the structure stack
                        if (!prefixFound && parentStructure.parent) {
                            // Start from the parent's parent and go up the chain
                            let currentParent: Token | undefined = parentStructure.parent;

                            // Traverse up the parent chain
                            while (currentParent) {
                                if (currentParent.type === TokenType.Structure && currentParent.structurePrefix) {
                                    // Found a prefix in an ancestor structure
                                    token.structurePrefix = currentParent.structurePrefix;
                                    logger.info(`📌 Field '${token.value}' inherited prefix '${currentParent.structurePrefix}' from ancestor structure`);
                                    prefixFound = true;
                                    break;
                                }
                                // Move to the next parent in the chain
                                currentParent = currentParent.parent;
                            }
                        }
                    }
                }
            }
        }

        return maxLabelWidth;
    }

    private assignMaxLabelLengths(): void {
        for (const token of this.tokens) {
            if (token.type !== TokenType.Structure) continue;

            if (token.parent && token.parent.type === TokenType.Structure) continue;
            if (token.subType === TokenType.Procedure || token.subType === TokenType.Routine) continue;

            const executionMarkerLine = token.parent?.executionMarker?.line ?? null;
            if (executionMarkerLine !== null && token.line > executionMarkerLine) {
                token.maxLabelLength = 0;
                continue;
            }

            let maxLabelLength = 0;

            const topLabel = this.tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === token.line &&
                t.start === 0
            );

            if (topLabel) {
                maxLabelLength = topLabel.value.length;
            }

            let structureTokens = this.tokens.filter(t => t.parent === token);
            for (const childToken of structureTokens) {
                if (childToken.type === TokenType.Label) {
                    maxLabelLength = Math.max(maxLabelLength, childToken.value.length);
                }
            }

            let inlineLabels = this.tokens.filter(t =>
                t.line > token.line &&
                t.start === 0 &&
                t.type === TokenType.Label &&
                t.parent === token
            );

            for (const label of inlineLabels) {
                maxLabelLength = Math.max(maxLabelLength, label.value.length);
            }

            token.maxLabelLength = maxLabelLength;
        }
    }

    private handleStructureToken(token: Token, globalIndex: number): void {
        if (!token.subType) {
            // Assign the specific subType that matches the structure keyword so that
            // consumers can check token.subType === TokenType.Class etc. reliably.
            switch (token.value.toUpperCase()) {
                case 'CLASS':     token.subType = TokenType.Class; break;
                case 'INTERFACE': token.subType = TokenType.Interface; break;
                case 'QUEUE':     token.subType = TokenType.Structure; break;
                case 'GROUP':     token.subType = TokenType.Structure; break;
                default:          token.subType = TokenType.Structure; break;
            }
        }

        // 🛑 Special handling: Skip MODULE structures that are part of CLASS attribute list
        if (token.value.toUpperCase() === "MODULE") {
            // 🚀 PERFORMANCE: Use tokensByLine index
            const sameLine = this.tokensByLine.get(token.line) || [];
            const currentIndex = sameLine.findIndex(t => t === token);

            for (let j = currentIndex - 1; j >= 0; j--) {
                const prev = sameLine[j];
                if (prev.value === ',') {
                    logger.info(`📛 Skipping MODULE at line ${token.line} – part of CLASS attribute list`);
                    return;
                }
                if (prev.value === '(' || prev.type === TokenType.Structure || prev.type === TokenType.Keyword) {
                    break;
                }
            }
        }
        
        // 🛑 Special handling: Skip TOOLBAR when it's inside a function call like SELF.AddItem(Toolbar)
        if (token.value.toUpperCase() === "TOOLBAR") {
            // 🚀 PERFORMANCE: Use tokensByLine index
            const sameLine = this.tokensByLine.get(token.line) || [];
            const currentIndex = sameLine.findIndex(t => t === token);
            
            // Check if TOOLBAR is inside parentheses
            let insideParentheses = false;
            let parenDepth = 0;
            
            for (let j = 0; j < sameLine.length; j++) {
                const t = sameLine[j];
                if (t.value === '(') parenDepth++;
                if (t.value === ')') parenDepth--;
                
                if (j === currentIndex && parenDepth > 0) {
                    insideParentheses = true;
                    break;
                }
            }
            
            if (insideParentheses) {
                logger.info(`📛 Skipping TOOLBAR at line ${token.line} – inside function call`);
                token.type = TokenType.Variable; // Change to variable instead
                return;
            }
        }

        // ✅ Check if structure ends on the same line (single-line declaration)
        // Examples: "AnswerDateTime GROUP(DateTimeType)." or "MyGroup GROUP;END"
        // Also applies to single-line control flow: "IF condition THEN statement." or "IF x THEN y END"
        // Handles line continuation: "IF x THEN | \n statement."
        const sameLine = this.tokensByLine.get(token.line) || [];
        const structureIndex = sameLine.indexOf(token);
        let endsOnSameLine = false;
        let continuationLine = token.line;
        
        // Follow line continuations to find the actual end
        while (continuationLine < this.tokens[this.tokens.length - 1].line) {
            const lineTokens = this.tokensByLine.get(continuationLine) || [];
            
            // Find the last non-comment token on this line
            let lastSignificantToken: Token | undefined;
            for (let i = lineTokens.length - 1; i >= 0; i--) {
                const t = lineTokens[i];
                if (t.type !== TokenType.Comment) {
                    lastSignificantToken = t;
                    break;
                }
            }
            
            if (!lastSignificantToken) {
                break; // Empty line or only comments
            }
            
            // Check if this line has a continuation character
            const hasContinuation = lastSignificantToken.type === TokenType.LineContinuation || 
                                   lastSignificantToken.value === '|';
            
            if (hasContinuation) {
                // Statement continues on next line
                continuationLine++;
                continue;
            }
            
            // No continuation - check if this line ends with a terminator
            const isEnd = lastSignificantToken.type === TokenType.EndStatement || 
                         lastSignificantToken.value.toUpperCase() === 'END';
            const isPeriod = lastSignificantToken.value === '.';
            
            if (isEnd || isPeriod) {
                endsOnSameLine = true;
                token.finishesAt = continuationLine;
                // Mark if this spans multiple lines due to continuation
                if (continuationLine > token.line) {
                    token.isSingleLineWithContinuation = true;
                }
            }
            
            break; // Found the end of the statement
        }
        
        // If structure ends on same line, don't push to stack (no folding needed)
        if (endsOnSameLine) {
            return;
        }
        
        // ✅ Special handling: MODULE inside CLASS/INTERFACE doesn't get pushed to stack
        // It doesn't need its own END - the CLASS/INTERFACE END terminates it
        if (token.value.toUpperCase() === 'MODULE' && this.structureStack.length > 0) {
            const parentStructure = this.structureStack[this.structureStack.length - 1];
            const parentType = parentStructure.value.toUpperCase();
            
            if (parentType === 'CLASS' || parentType === 'INTERFACE') {
                // MODULE inside CLASS/INTERFACE - don't push to stack, just set parent relationship
                token.parent = parentStructure;
                parentStructure.children = parentStructure.children || [];
                parentStructure.children.push(token);
                // Set finishesAt to the parent's finishesAt (will be set when parent closes)
                // For now, we'll set it in handleEndStatementForStructure
                logger.info(`📌 MODULE inside ${parentType} at Line ${token.line} - not pushing to stack`);
                return;
            }
        }

        token.maxLabelLength = 0;
        this.structureStack.push(token);

        // Add parent-child relationship with current procedure or structure
        // Special case: MODULE inside MAP should be child of MAP, not the containing procedure
        const isModuleInMap = token.value.toUpperCase() === 'MODULE' && 
                              this.structureStack.length > 1 &&
                              this.structureStack[this.structureStack.length - 2].value.toUpperCase() === 'MAP';
        
        if (isModuleInMap || this.structureStack.length > 1) {
            // Prioritize structure stack (nested structures or MODULE in MAP)
            const parentStructure = this.structureStack[this.structureStack.length - 2];
            token.parent = parentStructure;
            parentStructure.children = parentStructure.children || [];
            parentStructure.children.push(token);
            logger.info(`🔗 Structure ${token.value} at Line ${token.line} parented to structure ${parentStructure.value}`);

            // Mark RECORD tokens whose direct parent is a FILE — lifts the manual
            // parent-walk that consumers (e.g. StructureDiagnostics) used to do.
            if (
                token.value.toUpperCase() === 'RECORD' &&
                parentStructure.value.toUpperCase() === 'FILE'
            ) {
                token.isFileRecord = true;
            }
        } else if (this.procedureStack.length > 0) {
            // Fall back to procedure parent only if no structure parent exists
            const parentProcedure = this.procedureStack[this.procedureStack.length - 1];
            token.parent = parentProcedure;
            parentProcedure.children = parentProcedure.children || [];
            parentProcedure.children.push(token);
            logger.info(`🔗 Structure ${token.value} at Line ${token.line} parented to procedure ${parentProcedure.value}`);
        }

        // 🚀 PERFORMANCE: Use tokensByLine to find previous token
        const lineTokens = this.tokensByLine.get(token.line) || [];
        const tokenIndex = lineTokens.indexOf(token);
        if (tokenIndex > 0) {
            const prevToken = lineTokens[tokenIndex - 1];
            if (prevToken.type === TokenType.Label) {
                token.label = prevToken.value;
            } else if (
                tokenIndex === 1 &&
                prevToken.type === TokenType.Variable &&
                (token.value.toUpperCase() === 'LOOP' || token.value.toUpperCase() === 'ACCEPT')
            ) {
                // Issue #65: indented `Label LOOP` / `Label ACCEPT` inside CODE
                // sections — the tokenizer only emits TokenType.Label at column 0,
                // so an indented loop label arrives as a leading Variable. Promote
                // it so BREAK <Label> / CYCLE <Label> can resolve to this loop.
                token.label = prevToken.value;
            }
        }
        logger.info(`🧱 Opened ${token.value} at Line ${token.line} ${token.label}`);

        // ✅ Extract structure prefix if present (PRE)
        // Look for PRE attribute in the same line or next few lines
        // This works for all structure types (FILE, QUEUE, GROUP, RECORD, etc.)
        // 🚀 PERFORMANCE: Search only in relevant lines
        const searchEndLine = Math.min(token.line + 20, this.tokens[this.tokens.length - 1]?.line || token.line);
        
        prefixSearch: for (let line = token.line; line <= searchEndLine; line++) {
            const tokensInLine = this.tokensByLine.get(line) || [];
            
            for (let idx = 0; idx < tokensInLine.length; idx++) {
                const t = tokensInLine[idx];

                // If we hit an END statement or another structure, stop searching
                if (t.type === TokenType.EndStatement ||
                    (t.type === TokenType.Structure && t !== token)) {
                    break prefixSearch;
                }

                // Look for PRE attribute
                if (t.value.toUpperCase() === "PRE") {
                    // Check if PRE is followed by parentheses with a prefix
                    if (idx + 1 < tokensInLine.length && tokensInLine[idx + 1].value === "(") {
                        let prefixValue = "";
                        let j = idx + 2;

                        // Extract the prefix value inside the parentheses
                        while (j < tokensInLine.length && tokensInLine[j].value !== ")") {
                            prefixValue += tokensInLine[j].value;
                            j++;
                        }

                        if (prefixValue) {
                            token.structurePrefix = prefixValue;
                            logger.info(`📌 Found structure prefix: ${prefixValue} for ${token.value} at Line ${token.line}`);
                        }
                    }
                    break prefixSearch;
                }
            }
        }

        if (["CLASS", "MAP", "INTERFACE", "MODULE"].includes(token.value.toUpperCase())) {
            logger.info(`Checking if ${token.value.toUpperCase()} is inline`);
            // 🚀 PERFORMANCE: Use tokensByLine index
            const sameLine = this.tokensByLine.get(token.line) || [];
            logger.info(`Same line tokens: ${sameLine.map(t => t.value).join(", ")}`);
            const currentIndex = sameLine.findIndex(t => t === token);
            let isInlineAttribute = false;

            for (let j = currentIndex - 1; j >= 0; j--) {
                const prev = sameLine[j];
                if (prev.value === ',') {
                    isInlineAttribute = true;
                    break;
                }
                if (prev.value === '(' || prev.type === TokenType.Structure || prev.type === TokenType.Keyword) {
                    break;
                }
            }

            logger.info(`Is inline attribute: ${isInlineAttribute}`);

            if (!isInlineAttribute) {
                this.insideClassOrInterfaceOrMapDepth++;
                // Store the structure type in the token's value
                // We'll use this later to identify the type of structure
                logger.info(`Inside ${token.value.toUpperCase()} structure, depth: ${this.insideClassOrInterfaceOrMapDepth}`);
                
                // Special handling for MAP structure: look for shorthand procedure declarations
                if (token.value.toUpperCase() === "MAP") {
                    logger.info(`🗺️ Found MAP structure at line ${token.line}, calling processShorthandProcedures()`);
                    this.processShorthandProcedures(token, globalIndex);
                }
            } else {
                logger.info('Skipping inline attribute');
                return;
            }
        }

        // ✅ Extract IMPLEMENTS() interface names for CLASS tokens
        if (token.value.toUpperCase() === 'CLASS' && token.subType === TokenType.Class) {
            const lineTokens2 = this.tokensByLine.get(token.line) || [];
            const ifaceNames: string[] = [];
            for (let i = 0; i < lineTokens2.length - 1; i++) {
                const t = lineTokens2[i];
                if (t.value.toUpperCase() === 'IMPLEMENTS' && lineTokens2[i + 1]?.value === '(') {
                    // Collect the name inside the parens
                    let j = i + 2;
                    let name = '';
                    while (j < lineTokens2.length && lineTokens2[j].value !== ')') {
                        name += lineTokens2[j].value;
                        j++;
                    }
                    if (name) ifaceNames.push(name);
                }
            }
            if (ifaceNames.length > 0) {
                token.implementedInterfaces = ifaceNames;
                logger.info(`📋 CLASS '${token.label}' implements: ${ifaceNames.join(', ')}`);
            }
        }

        // Store the structure's actual indent position for later use when closing with END
        // Use the structure token's actual start position, not maxLabelWidth
        let indentLevel = token.start;
        this.structureIndentMap.set(token, indentLevel);
    }

    /**
     * Process shorthand procedure declarations in MAP structures
     * In MAP structures, procedures can be declared without the PROCEDURE keyword
     * Format: ProcedureName(parameters),returnType
     *
     * Handles two tokenization patterns:
     * 1. Single token: "Dos2DriverPipe(Long pOpCode, long pClaFCB, long pVarList)"
     * 2. Separate tokens: "SaveRecord" followed by "(" token
     */
    private processShorthandProcedures(mapToken: Token, mapIndex: number): void {
        if (mapIndex === -1) return;
        
        logger.info(`🔍 Processing shorthand procedures in MAP at line ${mapToken.line}`);
        
        // Find the END statement for this MAP
        let endIndex = -1;
        let depth = 1;
        
        for (let i = mapIndex + 1; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            if (token.type === TokenType.Structure) {
                depth++;
            } else if (token.type === TokenType.EndStatement) {
                depth--;
                if (depth === 0) {
                    endIndex = i;
                    break;
                }
            }
            
            // Pattern 1: Look for tokens that contain an opening parenthesis in the same token value
            // In shorthand syntax, the procedure name and opening parenthesis are in the same token
            if (token.value.includes("(") && token.value !== "(" && !token.value.toLowerCase().startsWith("module") && ! token.value.startsWith("!")) {
                // This looks like a shorthand procedure declaration
                token.subType = TokenType.MapProcedure;
                token.parent = mapToken;
                mapToken.children = mapToken.children || [];
                mapToken.children.push(token);
                
                // Extract the procedure name (everything before the opening parenthesis)
                const procName = token.value.split("(")[0].trim();
                
                // CRITICAL FIX: Set the token's label to the procedure name
                // This ensures it will be displayed correctly in the outline view
                token.label = procName;
                
                logger.info(`📌 Found MAP shorthand procedure (single token): ${procName} at line ${token.line}`);
            }
            // Pattern 2: Check if this token is followed by "(" (separate tokens)
            else if ((token.type === TokenType.Function || 
                      token.type === TokenType.Variable || 
                      token.type === TokenType.Label) &&
                     i + 1 < this.tokens.length &&
                     this.tokens[i + 1].value === "(" &&
                     !token.value.toLowerCase().startsWith("module") &&
                     !token.value.toLowerCase().startsWith("map") &&
                     !token.value.startsWith("!") &&
                     !isAttributeKeyword(token.value)) {
                // This looks like a shorthand procedure declaration with separate tokens
                token.subType = TokenType.MapProcedure;
                token.parent = mapToken;
                mapToken.children = mapToken.children || [];
                mapToken.children.push(token);
                
                // Set the token's label to the procedure name
                token.label = token.value;
                
                logger.info(`📌 Found MAP shorthand procedure (separate tokens): ${token.value} at line ${token.line}`);
            }
        }
    }

    private handleLoopTerminator(token: Token, index: number): void {
        // WHILE or UNTIL can terminate a LOOP if:
        // 1. It's not at the beginning of the LOOP (LOOP WHILE... or LOOP UNTIL...)
        // 2. There's a LOOP on the structure stack
        
        // Check if there's a LOOP in the structure stack
        const loopIndex = this.structureStack.findIndex(s => s.value.toUpperCase() === 'LOOP');
        if (loopIndex === -1) {
            // No LOOP to terminate - this must be LOOP WHILE/UNTIL (at the start)
            return;
        }
        
        const loopStructure = this.structureStack[loopIndex];
        
        // Check if this WHILE/UNTIL is on the same line as the LOOP
        // If so, it's the opening condition, not a terminator
        if (loopStructure.line === token.line) {
            return;
        }
        
        // This WHILE/UNTIL terminates the LOOP
        // Pop everything from the stack until we get to (and including) the LOOP
        while (this.structureStack.length > loopIndex) {
            const poppedStructure = this.structureStack.pop()!;
            poppedStructure.finishesAt = token.line;
            logger.info(`🔚 Closed ${poppedStructure.value} at Line ${token.line} (terminated by ${token.value.toUpperCase()})`);
        }
    }

    private handleEndStatementForStructure(token: Token): void {
        // ✅ Check if this END/period is an inline terminator
        // If there's a structure keyword on the same line, this END/period terminates that structure, not the stack
        const sameLine = this.tokensByLine.get(token.line) || [];
        const structureOnSameLine = sameLine.find(t => 
            t.type === TokenType.Structure && t !== token
        );
        
        if (structureOnSameLine) {
            // This is an inline terminator - don't pop from stack
            logger.info(`🔚 Inline terminator '${token.value}' at Line ${token.line} for '${structureOnSameLine.value}' (not popping stack)`);
            return;
        }
        
        // ✅ Check if this period is part of a continued statement (line with | before this line)
        // If the previous line has a line continuation, this period is a statement terminator, not a structure terminator
        if (token.value === '.') {
            const prevLine = this.tokensByLine.get(token.line - 1) || [];
            let lastTokenOnPrevLine: Token | undefined;
            for (let i = prevLine.length - 1; i >= 0; i--) {
                const t = prevLine[i];
                if (t.type !== TokenType.Comment) {
                    lastTokenOnPrevLine = t;
                    break;
                }
            }
            
            if (lastTokenOnPrevLine) {
                const hasContinuation = lastTokenOnPrevLine.type === TokenType.LineContinuation || 
                                       lastTokenOnPrevLine.value === '|';
                if (hasContinuation) {
                    // This period ends a continued statement, not a structure
                    logger.info(`🔚 Period at Line ${token.line} ends continued statement from Line ${token.line - 1} (not popping stack)`);
                    return;
                }
            }
        }
        
        // Look ahead to find the next non-comment token
        const currentIndex = this.tokens.indexOf(token);
        let nextSignificantToken: Token | undefined;
        
        for (let i = currentIndex + 1; i < this.tokens.length; i++) {
            const t = this.tokens[i];
            // Skip comments and continue to next line
            if (t.type === TokenType.Comment) continue;
            // Found a token on a different line
            if (t.line > token.line) {
                nextSignificantToken = t;
                break;
            }
        }
        
        const nextValue = nextSignificantToken?.value.toUpperCase();
        const isElseOrElsif = nextValue === 'ELSE' || nextValue === 'ELSIF';
        const isOf = nextValue === 'OF';
        
        // This END/period terminates a structure from the stack
        // Simply pop the last opened structure - Clarion uses explicit END markers, not indentation
        const lastStructure = this.structureStack.pop();
        if (lastStructure) {
            lastStructure.finishesAt = token.line;
            
            // ✅ Set parent relationship so END knows what it closes
            token.parent = lastStructure;
            
            logger.info(`🔚 Closed ${lastStructure.value} at Line ${token.line}`);
            
            // ✅ Special handling: Check if the structure that's NOW on top of the stack
            // (after popping) is an IF/CASE that continues with ELSE/ELSIF/OF
            if (this.structureStack.length > 0) {
                const parentStructure = this.structureStack[this.structureStack.length - 1];
                const parentType = parentStructure.value.toUpperCase();
                
                if ((parentType === 'IF' && isElseOrElsif) || (parentType === 'CASE' && isOf)) {
                    // The END closed a nested structure/branch, but the parent IF/CASE continues
                    logger.info(`🔄 ${parentType} at Line ${parentStructure.line} continues with ${nextValue} at Line ${nextSignificantToken!.line}`);
                    // Parent IF/CASE stays on stack, will be closed by a later END
                }
            }
            
            if (["CLASS", "MAP", "INTERFACE", "MODULE"].includes(lastStructure.value.toUpperCase())) {
                this.insideClassOrInterfaceOrMapDepth = Math.max(0, this.insideClassOrInterfaceOrMapDepth - 1);
                logger.info(`Exiting ${lastStructure.value.toUpperCase()} structure, depth: ${this.insideClassOrInterfaceOrMapDepth}`);
            }
        }
    }

    private handleProcedureInsideDefinition(token: Token, index: number): void {
        const prevToken = this.tokens[index - 1];
        if (prevToken?.type === TokenType.Label) {
            token.label = prevToken.value;
         //   token.subType = TokenType.Procedure; // optional but useful
            logger.info(`📌 Found method definition '${token.label}' at line ${token.line} inside CLASS/MAP`);
        }
    }

    private handleProcedureToken(token: Token, index: number): void {
        const prevToken = this.tokens[index - 1];
    
        // 🧠 Determine token type based on context
        if (this.insideClassOrInterfaceOrMapDepth > 0) {
            // It's a declaration inside CLASS, MAP, INTERFACE, or MODULE
            const parent = this.structureStack[this.structureStack.length - 1];
            const parentType = parent?.value.toUpperCase();
            token.label = prevToken?.value ?? "AnonymousMethod";
        
            token.type = TokenType.Procedure; // ✅ Always keep as Procedure
            if (parentType === "CLASS") {
                token.subType = TokenType.MethodDeclaration;
            } else if (parentType === "MAP") {
                token.subType = TokenType.MapProcedure;
                logger.info(`📌 Found MAP procedure: ${token.label}`);
            } else if (parentType === "MODULE") {
                token.subType = TokenType.MapProcedure; // Use same type for MODULE procedures
                logger.info(`📌 Found MODULE procedure: ${token.label}`);
            } else if (parentType === "INTERFACE") {
                token.subType = TokenType.InterfaceMethod;
            } else {
                token.subType = TokenType.MethodDeclaration; // fallback
            }
        
            token.parent = parent;
            parent.children = parent.children || [];
            parent.children.push(token);
        
            logger.info(`📌 Declared ${TokenType[token.subType]} '${token.label}' inside ${parentType} at line ${token.line}`);
            return;
        }
        
        // Only close the previous procedure if we're not inside a CLASS/MAP/INTERFACE
        const lastProc = this.procedureStack[this.procedureStack.length - 1];
        if (lastProc) {
            this.handleProcedureClosure(token.line - 1);
        }
        
        // Check for method implementation: Look for pattern like "ClassName.MethodName PROCEDURE"
        // This could be tokenized as: Label(ClassName) + Variable(MethodName) + Keyword(PROCEDURE)
        // Or for interface methods: Label(ClassName) + Variable(InterfaceName) + Variable(MethodName) + Keyword(PROCEDURE)
        // Or in some cases: Label(ClassName.MethodName) + Keyword(PROCEDURE)
        // Or interface: Label(ClassName.InterfaceName.MethodName) + Keyword(PROCEDURE)
        let isMethodImpl = false;
        let fullProcedureName = prevToken?.value ?? "AnonymousProcedure";
        
        // Check if prevToken is a label, variable, attribute, or structure field that might be part of a method name
        if (prevToken?.type === TokenType.Label || prevToken?.type === TokenType.Variable ||
            prevToken?.type === TokenType.Attribute || prevToken?.type === TokenType.StructureField) {
            // Check if the previous token contains dots (entire qualified name in one token)
            if (prevToken.value.includes(".")) {
                // The previous token itself contains dots (e.g., "IConnection.CloseSocket" for 3-part)
                // Look back for a Label token on the same line to find the class name prefix
                const prevPrevToken = index >= 2 ? this.tokens[index - 2] : undefined;
                if (prevPrevToken && prevPrevToken.line === token.line && prevPrevToken.type === TokenType.Label) {
                    fullProcedureName = prevPrevToken.value + '.' + prevToken.value;
                } else {
                    fullProcedureName = prevToken.value;
                }
                isMethodImpl = true;
            } else {
                // Build the full name by looking back at previous tokens on the same line
                // Collect all tokens before PROCEDURE that are part of the qualified name
                const nameParts: string[] = [prevToken.value];
                let lookbackIndex = index - 2;
                
                // Look back to collect ClassName.InterfaceName.MethodName pattern
                while (lookbackIndex >= 0) {
                    const lookbackToken = this.tokens[lookbackIndex];
                    
                    // Stop if we're on a different line
                    if (lookbackToken.line !== token.line) break;
                    
                    // Stop if we hit a non-name token
                    if (lookbackToken.type !== TokenType.Label && 
                        lookbackToken.type !== TokenType.Variable && 
                        lookbackToken.type !== TokenType.Attribute) {
                        break;
                    }
                    
                    // Add this part to the beginning
                    nameParts.unshift(lookbackToken.value);
                    lookbackIndex--;
                }
                
                // If we collected more than one part, it's a method implementation
                if (nameParts.length > 1) {
                    fullProcedureName = nameParts.join('.');
                    isMethodImpl = true;
                }
            }
        }
        
        token.label = fullProcedureName;
        token.type = TokenType.Procedure; // ✅ Always keep as Procedure
        token.subType = isMethodImpl ? TokenType.MethodImplementation : TokenType.GlobalProcedure;
        
        // Skip assigning parent for method implementations — handled in postprocessing
        if (!isMethodImpl && this.structureStack.length > 0) {
            const parent = this.structureStack[this.structureStack.length - 1];
            token.parent = parent;
            parent.children = parent.children || [];
            parent.children.push(token);
        }
        
        this.procedureStack.push(token);
        
        logger.info(`📌 Registered ${TokenType[token.subType]} '${token.label}' at line ${token.line}`);
    }

    private handleRoutineToken(token: Token, index: number): void {
        if (this.procedureStack.length === 0) return;

        this.handleRoutineClosure(token.line - 1);

        let parentProcedure = this.procedureStack[this.procedureStack.length - 1];
        token.parent = parentProcedure;
        parentProcedure.children = parentProcedure.children || [];
        parentProcedure.children.push(token);

        token.subType = TokenType.Routine;
        const prevToken = this.tokens[index - 1];
        token.label = prevToken?.value ?? "AnonymousRoutine";

        this.routineStack.push(token);
        this.foundData = false;
    }

    private handleProcedureClosure(endLine: number): void {
        const lastProcedure = this.procedureStack.pop();
        if (lastProcedure) {
            logger.info(`📤 Closed ${lastProcedure.subType} ${lastProcedure.value} at line ${endLine}`);
            lastProcedure.finishesAt = endLine;
        }

        while (this.routineStack.length > 0) {
            this.handleRoutineClosure(endLine);
        }
    }

    private handleRoutineClosure(endLine: number): void {
        if (this.routineStack.length > 0) {
            const lastRoutine = this.routineStack.pop();
            if (lastRoutine) {
                lastRoutine.finishesAt = endLine;
            }
        }
    }

    public closeRemainingProcedures(): void {
        while (this.procedureStack.length > 0) {
            const lastProcedure = this.procedureStack.pop();
            if (lastProcedure) {
                lastProcedure.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] PROCEDURE '${lastProcedure.value}' closed at Line ${lastProcedure.finishesAt}`);
            }
        }

        while (this.routineStack.length > 0) {
            const lastRoutine = this.routineStack.pop();
            if (lastRoutine) {
                lastRoutine.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] ROUTINE '${lastRoutine.value}' closed at Line ${lastRoutine.finishesAt}`);
            }
        }
    }

    /**
     * Resolve file references for tokens that contain file references
     * Handles MODULE, INCLUDE, LINK, MEMBER, etc. by checking token sequences
     */
    private resolveFileReferences(): void {
        // Note: We're storing unresolved filenames
        // Actual path resolution happens via RedirectionParser when needed
        
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (!token.value) continue;
            
            const upperValue = token.value.toUpperCase();
            
            // Check for MODULE followed by ('filename')
            if (upperValue === 'MODULE') {
                const filename = this.extractFilenameAfterKeyword(i);
                if (filename) {
                    token.referencedFile = filename;
                    logger.info(`✅ MODULE token at line ${token.line} references: ${token.referencedFile}`);
                }
            }
            
            // Check for LINK followed by ('filename') or ('filename',num)
            if (upperValue === 'LINK') {
                const filename = this.extractFilenameAfterKeyword(i);
                if (filename) {
                    token.referencedFile = filename;
                    logger.info(`✅ LINK token at line ${token.line} references: ${token.referencedFile}`);
                }
            }
            
            // Check for INCLUDE followed by ('filename')
            if (upperValue === 'INCLUDE') {
                const filename = this.extractFilenameAfterKeyword(i);
                if (filename) {
                    token.referencedFile = filename;
                    logger.info(`✅ INCLUDE token at line ${token.line} references: ${token.referencedFile}`);
                }
            }
            
            // Check for MEMBER followed by ('filename')
            if (upperValue === 'MEMBER') {
                const filename = this.extractFilenameAfterKeyword(i);
                if (filename) {
                    token.referencedFile = filename;
                    logger.info(`✅ MEMBER token at line ${token.line} references: ${token.referencedFile}`);
                }
            }
        }
    }
    
    /**
     * Extract filename from token sequence like: KEYWORD ( 'filename' )
     * @param keywordIndex Index of the keyword token (MODULE, LINK, INCLUDE, etc.)
     * @returns The filename string or null
     */
    private extractFilenameAfterKeyword(keywordIndex: number): string | null {
        // Expected pattern: KEYWORD ( 'filename' ) [,num]
        // tokens[i] = KEYWORD
        // tokens[i+1] = (
        // tokens[i+2] = 'filename'
        // tokens[i+3] = )
        
        if (keywordIndex + 3 >= this.tokens.length) return null;
        
        const openParen = this.tokens[keywordIndex + 1];
        const filenameToken = this.tokens[keywordIndex + 2];
        const closeParen = this.tokens[keywordIndex + 3];
        
        if (openParen?.value === '(' && 
            filenameToken?.value &&
            filenameToken.value.startsWith("'") &&
            closeParen?.value === ')') {
            // Remove quotes from filename
            return filenameToken.value.replace(/^'|'$/g, '');
        }
        
        return null;
    }

    // =====================================================
    // 🎯 Phase 1: Semantic Query APIs
    // High-level APIs to reduce code duplication in providers
    // =====================================================

    /**
     * Gets all MAP structure blocks in the document
     * @returns Array of MAP tokens (empty if none found)
     */
    public getMapBlocks(): Token[] {
        const mapTokens = this.structuresByType.get('MAP');
        return mapTokens ? [...mapTokens] : [];
    }

    public getModuleBlocks(): Token[] {
        const moduleTokens = this.structuresByType.get('MODULE');
        return moduleTokens ? [...moduleTokens] : [];
    }

    /**
     * Gets the MEMBER parent file (if this file is a MEMBER of another)
     * Searches first 10 lines for MEMBER statement
     * @returns Unresolved filename or null
     */
    public getMemberParentFile(): string | null {
        // MEMBER should be in first 10 lines of file
        const memberToken = this.tokens.find(t => 
            t.line < 10 &&
            t.value && 
            t.value.toUpperCase() === 'MEMBER' &&
            t.referencedFile
        );
        
        return memberToken?.referencedFile || null;
    }

    /**
     * Gets the MODULE file referenced by a CLASS token
     * Looks for MODULE in the CLASS's attribute list on the same line
     * @param classToken The CLASS structure token
     * @returns Unresolved filename or null
     */
    public getClassModuleFile(classToken: Token): string | null {
        if (!classToken || classToken.type !== TokenType.Structure || classToken.value.toUpperCase() !== 'CLASS') {
            return null;
        }

        // Find MODULE token on same line with referencedFile
        // MODULE in CLASS attributes appears after the CLASS token
        const moduleToken = this.tokens.find(t =>
            t.line === classToken.line &&
            t.start > classToken.start &&
            t.value.toUpperCase() === 'MODULE' &&
            t.referencedFile
        );

        return moduleToken?.referencedFile || null;
    }

    /**
     * @deprecated Use {@link getStructureContextAt}(line).inMap. Kept as a shim
     * for existing callers; will be removed once call sites migrate.
     */
    public isInMapBlock(line: number): boolean {
        return this.getStructureContextAt(line).inMap;
    }

    /**
     * @deprecated Use {@link getStructureContextAt}(line).inModule. Kept as a shim
     * for existing callers; will be removed once call sites migrate.
     */
    public isInModuleBlock(line: number): boolean {
        return this.getStructureContextAt(line).inModule;
    }

    /**
     * @deprecated Use {@link getStructureContextAt}(line).inWindow or .inReport.
     * Returns true for WINDOW, APPLICATION, or REPORT containment. Kept as a shim
     * for existing callers; will be removed once call sites migrate.
     */
    public isInWindowStructure(line: number): boolean {
        const ctx = this.getStructureContextAt(line);
        return ctx.inWindow || ctx.inReport;
    }

    /**
     * @deprecated Use {@link getStructureContextAt}(line).inClass. Kept as a shim
     * for existing callers; will be removed once call sites migrate.
     */
    public isInClassBlock(line: number): boolean {
        return this.getStructureContextAt(line).inClass;
    }

    /**
     * Gets all CLASS structure blocks in the document
     * @returns Array of CLASS tokens (empty if none found)
     */
    public getClasses(): Token[] {
        const classTokens = this.structuresByType.get('CLASS');
        return classTokens ? [...classTokens] : [];
    }

    /**
     * Gets all INTERFACE structure blocks in the document
     * @returns Array of INTERFACE tokens (empty if none found)
     */
    public getInterfaces(): Token[] {
        const ifaceTokens = this.structuresByType.get('INTERFACE');
        return ifaceTokens ? [...ifaceTokens] : [];
    }

    /**
     * Finds all MAP procedure declarations with matching name
     * Searches inside MAP blocks for procedure declarations (including overloads)
     * @param procName Procedure name to search for (case-insensitive)
     * @returns Array of matching tokens (empty if none found)
     */
    public findMapDeclarations(procName: string): Token[] {
        const results: Token[] = [];
        const upperProcName = procName.toUpperCase();
        
        // Get all MAP blocks
        const mapBlocks = this.getMapBlocks();
        
        for (const mapToken of mapBlocks) {
            const mapStart = mapToken.line;
            const mapEnd = mapToken.finishesAt;
            
            if (mapEnd === undefined) continue;
            
            // Find all tokens inside this MAP block
            for (const token of this.tokens) {
                if (token.line <= mapStart || token.line >= mapEnd) continue;
                
                // Check if this is a MAP procedure declaration
                const isMatch = (token.subType === TokenType.MapProcedure && 
                                 token.label?.toUpperCase() === upperProcName) ||
                                (token.type === TokenType.Function && 
                                 token.value.toUpperCase() === upperProcName);
                
                if (isMatch) {
                    results.push(token);
                }
            }
        }
        
        return results;
    }

    /**
     * Finds all global procedure implementations (not in MAP blocks).
     * Backed by procedureIndex; filters to GlobalProcedure subtype to preserve
     * the long-standing behaviour of skipping MAP declarations and method impls.
     * @param procName Procedure name to search for (case-insensitive)
     * @returns Array of matching procedure tokens (empty if none found)
     */
    public findProcedureImplementations(procName: string): Token[] {
        const candidates = this.procedureIndex.get(procName.toUpperCase());
        if (!candidates) return [];
        return candidates.filter(t => t.subType === TokenType.GlobalProcedure);
    }

    /**
     * Finds all method implementation tokens for a fully-qualified label such as
     * "ClassName.MethodName" (case-insensitive). Used by ImplementationProvider's
     * MethodImplementation hot path. Returns multiple results when the method is
     * overloaded.
     */
    public findMethodImplementations(qualifiedName: string): Token[] {
        const candidates = this.procedureIndex.get(qualifiedName.toUpperCase());
        if (!candidates) return [];
        return candidates.filter(t => t.subType === TokenType.MethodImplementation);
    }

    /**
     * Returns every MethodImplementation token in this document whose owning
     * class matches `classToken`'s name (case-insensitive). Strictly matches
     * the 2-part `ClassName.MethodName` label form; 3-part interface
     * implementations (`ClassName.IFace.Method`) are excluded — same guard
     * used by ImplementationProvider's MethodImplementation candidate filter.
     *
     * Reads the class name from `classToken.label ?? classToken.value`. Backed
     * by Gap A's `procedureIndex` — no full token scan.
     */
    public getClassMethodImplementations(classToken: Token): Token[] {
        const className = classToken.label ?? classToken.value;
        return this.getClassMethodImplementationsByName(className);
    }

    /**
     * String-keyed variant of `getClassMethodImplementations` — convenient for
     * callers that already have a class name (e.g. derived from a token's
     * dot-prefix) and don't need the CLASS Token.
     */
    public getClassMethodImplementationsByName(className: string): Token[] {
        const upper = className.toUpperCase();
        const results: Token[] = [];
        for (const list of this.procedureIndex.values()) {
            for (const t of list) {
                if (t.subType !== TokenType.MethodImplementation) continue;
                if (!t.label) continue;
                const parts = t.label.split('.');
                if (parts.length !== 2) continue;
                if (parts[0].toUpperCase() !== upper) continue;
                results.push(t);
            }
        }
        return results;
    }

    /**
     * Returns ROUTINE tokens. With no argument, returns every routine in the
     * document (caller can apply line-range or other filters). With a name,
     * returns only routines whose label matches case-insensitively.
     */
    public findRoutines(name?: string): Token[] {
        if (name === undefined) {
            const all: Token[] = [];
            for (const list of this.routineIndex.values()) all.push(...list);
            return all;
        }
        const list = this.routineIndex.get(name.toUpperCase());
        return list ? list.slice() : [];
    }

    /**
     * Returns every indexed procedure-style token regardless of subtype
     * (Global, MethodImplementation, MapProcedure, MethodDeclaration, InterfaceMethod).
     * Used by consumers that need a flat list of "all procedures in this document"
     * — e.g. UnreachableCodeProvider iterating procedure bodies.
     */
    public getAllProcedures(): Token[] {
        const all: Token[] = [];
        for (const list of this.procedureIndex.values()) all.push(...list);
        return all;
    }

    /**
     * Returns the RECORD child of a FILE structure, or undefined when the FILE
     * has no RECORD (a malformed declaration). The flag is set during process()
     * — callers don't need to walk the parent chain themselves.
     */
    public getFileRecord(fileToken: Token): Token | undefined {
        if (!fileToken.children) return undefined;
        return fileToken.children.find(c => c.isFileRecord === true);
    }

    /**
     * Returns the structured declared-value pair for a Label token.
     * `type` is the data-type keyword (uppercase, e.g. 'EQUATE', 'STRING', 'LIKE');
     * `value` is the raw text inside the (...) parens, or undefined for bare-type
     * declarations like `pId LONG`.
     *
     * Returns null when the label has no declared value attached (not a column-0
     * data declaration, or its line wasn't recognised by the populator).
     *
     * Backed by `Token.dataType` / `Token.dataValue`, populated by
     * `ClarionTokenizer.populateDeclaredValues()` — no re-parse here.
     */
    public getDeclaredValue(label: Token): { type?: string; value?: string } | null {
        if (label.dataType === undefined && label.dataValue === undefined) return null;
        return {
            type: label.dataType,
            value: label.dataValue,
        };
    }

    /**
     * Gets all global variables (labels at column 0 before first CODE marker)
     * Excludes procedure declarations and structure declarations
     * @returns Array of global variable tokens (empty if none found)
     */
    public getGlobalVariables(): Token[] {
        const results: Token[] = [];
        
        // Find first CODE marker to determine global scope boundary
        const firstCode = this.getFirstCodeMarker();
        const globalScopeEndLine = firstCode ? firstCode.line : Number.MAX_SAFE_INTEGER;
        
        // Find all labels at column 0 before first CODE
        for (const token of this.tokens) {
            if (token.type === TokenType.Label &&
                token.start === 0 &&
                token.line < globalScopeEndLine) {
                
                const upperValue = token.value.toUpperCase();
                
                // Skip keywords that might be tokenized as labels (DATA, CODE)
                if (upperValue === 'DATA' || upperValue === 'CODE') {
                    continue;
                }
                
                // Exclude procedure declarations (have PROCEDURE or FUNCTION after them)
                // Exclude structure declarations (have CLASS, QUEUE, GROUP, etc. after them)
                const lineTokens = this.tokensByLine.get(token.line) || [];
                const hasStructureKeyword = lineTokens.some(t =>
                    t.start > token.start &&
                    t.type === TokenType.Structure
                );
                
                const hasProcedureKeyword = lineTokens.some(t =>
                    t.start > token.start &&
                    (t.value.toUpperCase() === 'PROCEDURE' ||
                     t.value.toUpperCase() === 'FUNCTION')
                );
                
                if (!hasStructureKeyword && !hasProcedureKeyword) {
                    results.push(token);
                }
            }
        }
        
        return results;
    }

    /**
     * Gets the first CODE marker token in the document
     * This marks the boundary between global scope and procedural code
     * CODE can be tokenized as either Keyword or Label depending on context
     * @returns First CODE token or null if not found
     */
    public getFirstCodeMarker(): Token | null {
        // Find first CODE keyword or label
        for (const token of this.tokens) {
            if (token.value.toUpperCase() === 'CODE' &&
                (token.type === TokenType.Keyword || token.type === TokenType.Label)) {
                return token;
            }
        }
        
        return null;
    }

    /**
     * Checks if a token is in global scope (before first PROCEDURE)
     * @param token Token to check
     * @returns true if in global scope, false otherwise
     */
    public isInGlobalScope(token: Token): boolean {
        // Find first procedure declaration
        const firstProc = this.tokens.find(t =>
            t.subType === TokenType.GlobalProcedure ||
            t.value.toUpperCase() === 'PROCEDURE'
        );
        
        // If no procedure exists, everything is in global scope
        if (!firstProc) {
            return true;
        }
        
        // Token is in global scope if it comes before first PROCEDURE
        return token.line < firstProc.line;
    }

    // =====================================================
    // 🎯 Gap C: FieldEquate (?Ctrl) and USE() relationship APIs
    // =====================================================

    /**
     * Returns every FieldEquateLabel (`?Name`) token contained in `structureToken`,
     * which is expected to be a WINDOW / APPLICATION / REPORT / TOOLBAR / MENUBAR
     * — i.e. a structure that owns named controls. Pulled from the per-structure
     * index built by `linkUsesPass`. Order is declaration order.
     */
    public getControlsInStructure(structureToken: Token): Token[] {
        const map = this.fieldEquatesByStructure.get(structureToken);
        if (!map) return [];
        return Array.from(map.values());
    }

    /**
     * Look up a control by its `?Name` (case-insensitive; the leading `?` is required).
     * If `scope` is provided, search only that structure's per-name index. Without
     * `scope`, returns the first hit from the flat index, or null when ambiguous —
     * callers needing every match should use {@link findControlAll} instead.
     */
    public findControl(name: string, scope?: Token): Token | null {
        const key = name.toUpperCase();
        if (scope) {
            return this.fieldEquatesByStructure.get(scope)?.get(key) ?? null;
        }
        const list = this.fieldEquateIndex.get(key);
        if (!list || list.length === 0) return null;
        return list.length === 1 ? list[0] : null;
    }

    /**
     * Every match for `?Name` across the document. Used to disambiguate when the
     * same `?` identifier is declared in multiple windows in one file, or when a
     * caller wants to surface all candidates (e.g. ReferencesProvider).
     */
    public findControlAll(name: string): Token[] {
        const list = this.fieldEquateIndex.get(name.toUpperCase());
        return list ? [...list] : [];
    }

    /**
     * What does this USE keyword token's argument resolve to? Returns the linked
     * FieldEquateLabel / Label / Variable / StructurePrefix-qualified field token
     * set by `linkUsesPass`. Returns undefined for the `USE(?)` empty-arg idiom
     * (use {@link Token.hasNoFieldEquate} to detect that), and for v1-deferred
     * forms like chained access.
     */
    public getBoundTarget(useToken: Token): Token | undefined {
        return useToken.linkedTo;
    }

    /**
     * Reverse lookup: every USE keyword token in the current document whose
     * `linkedTo` resolves to `controlToken`. Single-document only in v1 — see
     * the `findReferencesToControlAcrossFiles` follow-up for cross-file support.
     */
    public findReferencesToControlInFile(controlToken: Token): Token[] {
        const refs: Token[] = [];
        for (const t of this.tokens) {
            if (t.value.toUpperCase() === 'USE' && t.linkedTo === controlToken) {
                refs.push(t);
            }
        }
        return refs;
    }

    // =====================================================
    // 🎯 Gap B: EQUATE / ITEMIZE block APIs
    // =====================================================

    /**
     * Returns every ITEMIZE structure token in the document. Cached at the end of
     * `process()` from `structuresByType.get('ITEMIZE')` — empty when there are none.
     */
    public getItemizeBlocks(): Token[] {
        return [...this.itemizeBlocks];
    }

    /**
     * Returns the EQUATE Label tokens declared inside the given ITEMIZE block,
     * in declaration order. Each member already has `prefixedEquateName` populated
     * if the ITEMIZE (or an outer ITEMIZE ancestor) carries a PRE prefix.
     * Returns an empty array if `itemizeToken` is not an ITEMIZE structure.
     */
    public getItemizeMembers(itemizeToken: Token): Token[] {
        if (
            itemizeToken.type !== TokenType.Structure ||
            itemizeToken.value.toUpperCase() !== 'ITEMIZE' ||
            itemizeToken.finishesAt === undefined
        ) {
            return [];
        }
        // Filter the equateIndex to tokens that fall strictly inside this ITEMIZE.
        // `getEquates()` already deduplicates and orders by source position.
        return this.getEquates().filter(t =>
            t.line > itemizeToken.line && t.line < itemizeToken.finishesAt!
        );
    }

    /**
     * O(1) lookup. Accepts either the raw EQUATE label (`MAX_ROWS`) or the
     * PRE-expanded ITEMIZE_EQUATE form (`Clr:Red`); both are keyed in the
     * same map. Case-insensitive. Returns the declaring Label token, which
     * already has `dataValue` populated by Charlie's Gap D when present.
     */
    public findEquate(name: string): Token | undefined {
        return this.equateIndex.get(name.toUpperCase());
    }

    /**
     * Every EQUATE Label in the document — plain or ITEMIZE-EQUATE — in
     * declaration order, deduplicated. Use to drive word-completion or any
     * other consumer that wants the full set without filtering tokens manually.
     *
     * Built from the equateIndex (populated by linkEquatesPass), then re-sorted
     * by source position so the iteration order is predictable for callers.
     */
    public getEquates(): Token[] {
        const seen = new Set<Token>();
        for (const t of this.equateIndex.values()) {
            seen.add(t);
        }
        return Array.from(seen).sort((a, b) =>
            a.line !== b.line ? a.line - b.line : a.start - b.start
        );
    }

    // =====================================================
    // 🎯 Gap H: Reverse IMPLEMENTS index
    // =====================================================

    // =====================================================
    // 🎯 Gap P: Continued-line joiner (`|` continuation)
    // =====================================================

    /**
     * Returns the {@link LogicalLine} that contains the given physical line —
     * the result of joining all `|`-continued physical lines into a single
     * logical line. Any line in a multi-line chain returns the SAME LogicalLine
     * object, so callers don't have to walk back to find the chain start.
     *
     * Containment rules:
     *   - Single-line case (no `|` continuation): returns a one-line LogicalLine
     *     with `startLine === endLine === line`.
     *   - Trailing `|` extends the chain: the next physical line is included.
     *   - A comment-only line in the middle of a chain (no `|` of its own) ends
     *     the chain at that line — Clarion semantics, see edge case 7 in the
     *     Gap P design.
     *   - String-literal `|` is preserved by the tokenizer (no `LineContinuation`
     *     token is emitted inside strings) and never extends a chain.
     *
     * Lazy: chains are built on first query and cached. Returns undefined when
     * `line` is out of range or has no tokens at all.
     */
    public getLogicalLine(line: number): LogicalLine | undefined {
        const cached = this.logicalLinesByPhysicalLine.get(line);
        if (cached) return cached;

        // Find the chain start — walk back while the previous line ends in `|`.
        let startLine = line;
        while (startLine > 0 && this.lineEndsWithContinuation(startLine - 1)) {
            startLine--;
        }

        const built = this.buildLogicalLine(startLine);
        if (!built) return undefined;

        // Cache under every physical line in the chain so any query hits.
        for (let l = built.startLine; l <= built.endLine; l++) {
            this.logicalLinesByPhysicalLine.set(l, built);
        }
        return built;
    }

    /**
     * Invalidates the {@link getLogicalLine} cache. Called automatically when
     * `process()` runs; external callers don't need to invoke this directly,
     * but it's exposed (private) for future incremental-update integration.
     */
    private clearLogicalLineCache(): void {
        this.logicalLinesByPhysicalLine.clear();
    }

    /**
     * True iff the given physical line ends with a `|` continuation marker.
     * Walks `tokensByLine` from the end skipping Comment tokens and reports
     * whether the last significant token is a `LineContinuation`.
     */
    private lineEndsWithContinuation(line: number): boolean {
        const lineTokens = this.tokensByLine.get(line);
        if (!lineTokens || lineTokens.length === 0) return false;
        for (let i = lineTokens.length - 1; i >= 0; i--) {
            const t = lineTokens[i];
            if (t.type === TokenType.Comment) continue;
            return t.type === TokenType.LineContinuation || t.value === '|';
        }
        return false;
    }

    /** Reconstructs a physical line's source text. Prefers the lines array
     *  when DS was constructed with one; otherwise composes a column-faithful
     *  approximation from the token stream. */
    private getPhysicalLineText(line: number): string {
        if (this.lines && line < this.lines.length) {
            return this.lines[line];
        }
        const lineTokens = this.tokensByLine.get(line);
        if (!lineTokens || lineTokens.length === 0) return '';
        let cursor = 0;
        let out = '';
        for (const t of lineTokens) {
            if (t.start > cursor) out += ' '.repeat(t.start - cursor);
            out += t.value;
            cursor = t.start + t.value.length;
        }
        return out;
    }

    /** Walks lines from `startLine` joining `|`-continued segments, stripping
     *  inline comments and the `|` markers themselves, and returning a
     *  LogicalLine with token references and the column-mapping function. */
    private buildLogicalLine(startLine: number): LogicalLine | undefined {
        if (this.tokensByLine.get(startLine) === undefined &&
            this.lines === undefined) {
            return undefined;
        }
        if (this.lines && startLine >= this.lines.length) return undefined;

        const tokens: Token[] = [];
        const segments: { joinedStart: number; line: number; lineStart: number }[] = [];
        let joinedText = '';
        let lastLine = startLine;

        let physicalLine = startLine;
        while (true) {
            const lineTokens = this.tokensByLine.get(physicalLine);
            const continues = this.lineEndsWithContinuation(physicalLine);

            // Decide where to truncate this physical line: stop before the
            // first Comment token (strip inline comment) or before the
            // trailing LineContinuation token (strip the `|`).
            let truncateColumn = this.getPhysicalLineText(physicalLine).length;
            if (lineTokens) {
                for (const t of lineTokens) {
                    if (t.type === TokenType.Comment ||
                        t.type === TokenType.LineContinuation ||
                        (t.value === '|' && t.type !== TokenType.String)) {
                        truncateColumn = Math.min(truncateColumn, t.start);
                    }
                }
            }

            const rawLine = this.getPhysicalLineText(physicalLine);
            const segText = rawLine.slice(0, truncateColumn);

            // Record segment for column mapping. `joinedStart` is the column
            // in `joinedText` where this physical line's content begins.
            segments.push({
                joinedStart: joinedText.length,
                line: physicalLine,
                lineStart: 0,
            });

            // Add the physical line's content. Separate continuation segments
            // with a single space so tokens that abut the `|` don't run into
            // the next line's content.
            if (joinedText.length > 0) joinedText += ' ';
            // Re-record the segment after the separator so column 0 of the
            // physical line corresponds to (joinedStart + (joinedText.length -
            // segText.length)). Recompute joinedStart now that the separator
            // is in place.
            segments[segments.length - 1].joinedStart = joinedText.length;
            joinedText += segText;

            // Add tokens (excluding LineContinuation and Comment) in source order.
            if (lineTokens) {
                for (const t of lineTokens) {
                    if (t.type === TokenType.LineContinuation) continue;
                    if (t.type === TokenType.Comment) continue;
                    tokens.push(t);
                }
            }

            lastLine = physicalLine;
            if (!continues) break;
            physicalLine++;
            // Safety guard: bail if we've walked past the document.
            if (this.lines && physicalLine >= this.lines.length) break;
            if (!this.lines && this.tokensByLine.get(physicalLine) === undefined) break;
        }

        const logicalLine: LogicalLine = {
            startLine,
            endLine: lastLine,
            joinedText,
            tokens,
            map: (col: number) => {
                // Binary search for the segment whose joinedStart <= col.
                let lo = 0, hi = segments.length - 1;
                while (lo < hi) {
                    const mid = (lo + hi + 1) >>> 1;
                    if (segments[mid].joinedStart <= col) lo = mid;
                    else hi = mid - 1;
                }
                const seg = segments[lo];
                return {
                    line: seg.line,
                    column: seg.lineStart + (col - seg.joinedStart),
                };
            },
        };
        return logicalLine;
    }

    // =====================================================
    // 🎯 Gap N: PROGRAM / MEMBER document helpers
    // =====================================================

    /**
     * Returns the document kind of this file based on the leading
     * `TokenType.ClarionDocument` token (PROGRAM or MEMBER). Returns
     * `undefined` for files that have neither — typically standalone
     * `.inc` definition files or empty documents.
     */
    public getDocumentKind(): 'PROGRAM' | 'MEMBER' | undefined {
        for (const t of this.tokens) {
            if (t.type !== TokenType.ClarionDocument) continue;
            const v = t.value.toUpperCase();
            if (v === 'PROGRAM' || v === 'MEMBER') return v;
        }
        return undefined;
    }

    /**
     * Returns the program label preceding the PROGRAM keyword
     * (`MyProg PROGRAM` → `'MyProg'`). Looks at the same-line Label
     * token immediately before the PROGRAM keyword. Returns `undefined`
     * when the file has no PROGRAM declaration or PROGRAM has no label.
     */
    public getProgramName(): string | undefined {
        for (const t of this.tokens) {
            if (t.type !== TokenType.ClarionDocument) continue;
            if (t.value.toUpperCase() !== 'PROGRAM') continue;
            const lineTokens = this.tokensByLine.get(t.line);
            if (!lineTokens) return undefined;
            const idx = lineTokens.indexOf(t);
            for (let i = idx - 1; i >= 0; i--) {
                const prev = lineTokens[i];
                if (prev.type === TokenType.Label) return prev.value;
            }
            return undefined;
        }
        return undefined;
    }

    /**
     * Returns the unresolved filename argument of a `MEMBER('parent.clw')`
     * declaration — the literal text between the quotes. Returns `undefined`
     * for non-MEMBER files or for a bare `MEMBER` keyword without parens.
     *
     * The path-resolution variant {@link getMemberParentFile} returns the
     * resolved `referencedFile` (which may be a full path post-redirection);
     * use this method when the raw textual argument is what callers want
     * (e.g. hover surface area).
     */
    public getMemberParent(): string | undefined {
        for (const t of this.tokens) {
            if (t.type !== TokenType.ClarionDocument) continue;
            if (t.value.toUpperCase() !== 'MEMBER') continue;
            const lineTokens = this.tokensByLine.get(t.line);
            if (!lineTokens) return undefined;
            const idx = lineTokens.indexOf(t);
            // Pattern: MEMBER ( 'name.clw' )
            if (lineTokens[idx + 1]?.value !== '(') return undefined;
            const arg = lineTokens[idx + 2];
            if (!arg) return undefined;
            // String literal — strip surrounding quotes if present.
            return arg.value.replace(/^['"]|['"]$/g, '');
        }
        return undefined;
    }

    /**
     * Every CLASS token in this document that declares
     * `IMPLEMENTS(<interfaceName>)` — case-insensitive on the interface name.
     * Returns an empty array when nothing implements the interface (or when
     * the interface name is unknown to this file). Single-document only —
     * cross-file implementor lookup is `StructureDeclarationIndexer` territory.
     */
    public getImplementors(interfaceName: string): Token[] {
        const list = this.implementorsByInterface.get(interfaceName.toUpperCase());
        return list ? [...list] : [];
    }

    /**
     * Returns the structured descriptor for a WINDOW, APPLICATION, or REPORT
     * token — title, geometry, MDI mode, icon, and the residual attribute list.
     * Returns undefined when `structureToken` is not one of those three types
     * (or when it sits before `process()` has run).
     *
     * Backed by `populateWindowDescriptors()` which uses Gap P's `getLogicalLine`
     * to handle headers that span multiple physical lines via `|` continuation.
     */
    public getWindowDescriptor(structureToken: Token): WindowDescriptor | undefined {
        return this.windowDescriptors.get(structureToken);
    }

    /**
     * Convenience: returns the descriptor of the innermost WINDOW / APPLICATION
     * / REPORT structure that contains `line`, or undefined when the cursor is
     * not inside any container. Walks `getStructureContextAt(line).chain` from
     * innermost outward and returns the first descriptor it finds — handy for
     * Hover-at-cursor-on-control implementations that want "what window am I
     * in?" without re-parsing the structure stack.
     */
    public getActiveWindowDescriptor(line: number): WindowDescriptor | undefined {
        const ctx = this.getStructureContextAt(line);
        for (const ancestor of ctx.chain) {
            const desc = this.windowDescriptors.get(ancestor);
            if (desc) return desc;
        }
        return undefined;
    }

    /**
     * Returns the OF / OROF / ELSE / ELSIF clause boundaries recorded on a
     * CASE or IF parent token by `populateBranches()`. Empty array when
     * `caseOrIfToken` isn't a CASE/IF Structure or carries no branches.
     */
    public getBranches(caseOrIfToken: Token): BranchInfo[] {
        return caseOrIfToken.branches ? [...caseOrIfToken.branches] : [];
    }

    // =====================================================
    // 🎯 Issue #65: labelled LOOP / ACCEPT resolution
    // =====================================================

    /**
     * Resolves a `BREAK <Label>` / `CYCLE <Label>` target. Walks every LOOP
     * and ACCEPT structure that carries a label and contains `fromLine`, and
     * returns the innermost match by name (case-insensitive).
     *
     * Returns undefined when:
     *   - `name` is empty
     *   - no labelled LOOP/ACCEPT enclosing `fromLine` matches the name
     *   - the candidate has no `finishesAt` (incomplete document)
     *
     * Backed by `structuresByType` — no token re-walk per call. Consumers:
     * the BREAK/CYCLE-outside-LOOP diagnostic (#64) once it accepts label
     * targets, plus future hover / go-to-definition on loop labels.
     */
    public resolveLoopLabel(name: string, fromLine: number): Token | undefined {
        if (!name) return undefined;
        const target = name.toUpperCase();
        const buckets = ['LOOP', 'ACCEPT'];
        let best: Token | undefined;
        for (const bucket of buckets) {
            const list = this.structuresByType.get(bucket);
            if (!list) continue;
            for (const t of list) {
                if (!t.label) continue;
                if (t.label.toUpperCase() !== target) continue;
                if (t.finishesAt === undefined) continue;
                if (fromLine < t.line || fromLine > t.finishesAt) continue;
                if (!best || t.line > best.line) best = t;
            }
        }
        return best;
    }

    // =====================================================
    // 🎯 Gap L: VIEW block helpers
    // =====================================================

    /**
     * Returns every VIEW structure token in this document — convenience over
     * `structuresByType.get('VIEW') ?? []`. Empty when the document has no VIEWs.
     */
    public getViews(): Token[] {
        const views = this.structuresByType.get('VIEW');
        return views ? [...views] : [];
    }

    /**
     * Returns the structured `{ from, projectedFields, joins }` descriptor for
     * a VIEW token, parsed once during `process()` from the VIEW's header line
     * (joined across `|` continuations) and the body lines between the opener
     * and its END. Returns undefined when `viewToken` is not a VIEW that this
     * document tracked.
     */
    public getViewDescriptor(viewToken: Token): ViewDescriptor | undefined {
        return this.viewDescriptors.get(viewToken);
    }

    /**
     * @deprecated Use {@link getStructureContextAt}(line).inView. Kept as a
     * shim mirroring the older isInMapBlock / isInClassBlock helpers; will be
     * removed once call sites migrate.
     */
    public isInViewBlock(line: number): boolean {
        return this.getStructureContextAt(line).inView;
    }

    /**
     * Every IMPLEMENTS()-clause name token in this document that names
     * `interfaceName` (case-insensitive). Returns the first identifier token
     * inside each `IMPLEMENTS(...)` whose joined argument matches — useful to
     * `ReferencesProvider` for finding all places where an interface is wired
     * up as a contract. Tokens are returned in source order.
     *
     * Note: a multi-token IMPLEMENTS argument (e.g. whitespace inside the
     * parens) collapses to its first identifier token; that's the natural
     * "navigate to the name" position and matches how the forward extractor
     * in `handleStructureToken` joins the spelling.
     */
    public findInterfaceReferences(interfaceName: string): Token[] {
        const target = interfaceName.toUpperCase();
        const refs: Token[] = [];
        const classes = this.structuresByType.get('CLASS');
        if (!classes) return refs;

        for (const cls of classes) {
            const lineTokens = this.tokensByLine.get(cls.line);
            if (!lineTokens) continue;
            for (let i = 0; i < lineTokens.length - 1; i++) {
                const t = lineTokens[i];
                if (t.value.toUpperCase() !== 'IMPLEMENTS') continue;
                if (lineTokens[i + 1]?.value !== '(') continue;
                // Walk inside the parens collecting the joined identifier.
                let j = i + 2;
                let joined = '';
                let firstIdent: Token | undefined;
                while (j < lineTokens.length && lineTokens[j].value !== ')') {
                    const seg = lineTokens[j];
                    if (!firstIdent && /^[A-Za-z_]/.test(seg.value)) {
                        firstIdent = seg;
                    }
                    joined += seg.value;
                    j++;
                }
                if (firstIdent && joined.toUpperCase() === target) {
                    refs.push(firstIdent);
                }
            }
        }
        return refs;
    }
}
