import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";
import { ProcedureUtils } from './utils/ProcedureUtils';
import { isAttributeKeyword } from './utils/AttributeKeywords';

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
     * Checks if a keyword is a known control type
     */
    private isControlKeyword(keyword: string): boolean {
        const controls = [
            'BUTTON', 'ENTRY', 'LIST', 'COMBO', 'CHECK', 'RADIO', 'OPTION',
            'TEXT', 'STRING', 'PROMPT', 'IMAGE', 'BOX', 'LINE', 'ELLIPSE',
            'REGION', 'GROUP', 'SHEET', 'TAB', 'SPIN', 'PANEL', 'PROGRESS',
            'OLE', 'MENU', 'MENUBAR', 'ITEM', 'TOOLBAR'
        ];
        return controls.includes(keyword);
    }

    public process(): void {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
    
            // ✅ Always prioritize structure tokens first
            if (token.type === TokenType.Keyword || token.type === TokenType.ExecutionMarker) {
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
}
