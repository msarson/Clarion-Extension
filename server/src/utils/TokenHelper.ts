import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { ScopeResolver } from '../scope/ScopeResolver';
import { ScopeKind, ScopeNode } from '../scope/ScopeTypes';

/**
 * Shared utility for token and scope navigation
 * Used by HoverProvider, DefinitionProvider, and other providers
 */
export class TokenHelper {
    /**
     * #337 — module-header lookup: the file's `MEMBER('parent.clw')` token.
     * No line cap: comment banners above the header are legal Clarion (license
     * headers, file docs) and the previous hardcoded `t.line < 5` guards
     * silently disabled every MEMBER-parent tier for such files. The tokenizer
     * only sets `referencedFile` on the real header form, so the first match
     * is the header.
     */
    public static findMemberHeaderToken(tokens: Token[]): Token | undefined {
        return tokens.find(t =>
            t.value !== undefined &&
            t.value.toUpperCase() === 'MEMBER' &&
            t.referencedFile !== undefined);
    }

    /** #337 — PROGRAM header lookup (ClarionDocument-typed, no line cap). */
    public static findProgramHeaderToken(tokens: Token[]): Token | undefined {
        return tokens.find(t =>
            t.type === TokenType.ClarionDocument &&
            t.value.toUpperCase() === 'PROGRAM');
    }

    /** #337 — either module header (PROGRAM or MEMBER), no line cap. */
    public static findDocumentHeaderToken(tokens: Token[]): Token | undefined {
        return tokens.find(t =>
            t.type === TokenType.ClarionDocument &&
            (t.value.toUpperCase() === 'PROGRAM' || t.value.toUpperCase() === 'MEMBER'));
    }

    /**
     * #350 — Language Reference, Field Qualification: "You must use this Field
     * Qualification syntax to reference any field in a complex structure that
     * does not have a PRE attribute." A Label inside a data-structure chain
     * (QUEUE/GROUP/FILE/RECORD/VIEW/REPORT) with NO prefixed ancestor is only
     * addressable as Structure.Field — no unqualified word may bind to it,
     * even one textually equal to a compound label (the generated browse
     * queue's 'JCA:StartedDate LIKE(...)' shadowing the FILE,PRE(JCA) field).
     * CLASS/INTERFACE/MAP members are excluded (their scoping is separate).
     */
    private static readonly DOT_ONLY_STRUCTURES = new Set(['QUEUE', 'GROUP', 'FILE', 'RECORD', 'VIEW', 'REPORT']);
    public static requiresDotQualification(t: Token): boolean {
        let anc = t.parent;
        let sawDataStructure = false;
        while (anc) {
            if (anc.structurePrefix) return false;
            if (anc.type === TokenType.Structure) {
                const v = anc.value.toUpperCase();
                if (v === 'CLASS' || v === 'INTERFACE' || v === 'MAP' || v === 'MODULE') return false;
                if (TokenHelper.DOT_ONLY_STRUCTURES.has(v)) sawDataStructure = true;
            }
            anc = anc.parent;
        }
        return sawDataStructure;
    }

    /**
     * Gets the innermost scope at a line (optimized version using DocumentStructure)
     * 🚀 PERFORMANCE: O(log n) using document structure instead of O(n) filter
     * @param structure DocumentStructure instance
     * @param line Line number to find scope for
     * @returns The innermost scope token or undefined
     */
    public static getInnermostScopeAtLine(structure: DocumentStructure, line: number): Token | undefined;
    
    /**
     * Gets the innermost scope at a line (legacy version)
     * ⚠️ DEPRECATED: Use overload with DocumentStructure for better performance
     * @param tokens Array of tokens
     * @param line Line number to find scope for
     * @returns The innermost scope token or undefined
     */
    public static getInnermostScopeAtLine(tokens: Token[], line: number): Token | undefined;
    
    /**
     * Implementation of getInnermostScopeAtLine
     */
    public static getInnermostScopeAtLine(tokensOrStructure: Token[] | DocumentStructure, line: number): Token | undefined {
        // Issue #233 Stage 2: one rule-driven source of truth. Both overloads now return the
        // INNERMOST enclosing scope (a ROUTINE for a routine-body line — with the procedure as
        // its parent — a procedure/method for procedure-body lines), Rule-1 aware. Previously
        // the DocumentStructure path returned the OUTERMOST procedure for routine lines (silently
        // dropping routine scope) while the legacy Token[] path returned the routine; the two
        // disagreed. Returns undefined at global/module scope.
        const resolver = ('getParent' in tokensOrStructure)
            ? (tokensOrStructure as DocumentStructure).getScopeResolver()
            : new ScopeResolver(tokensOrStructure as Token[]);
        return resolver.resolveScopeAt(line).token ?? undefined;
    }

    /**
     * Finds the parent scope (procedure/method) containing a routine (optimized version)
     * 🚀 PERFORMANCE: O(log n) using parent index instead of O(n) filter
     * @param structure DocumentStructure instance
     * @param routineScope The routine token
     * @returns Parent scope token or undefined
     */
    public static getParentScopeOfRoutine(structure: DocumentStructure, routineScope: Token): Token | undefined;
    
    /**
     * Finds the parent scope (procedure/method) containing a routine (legacy version)
     * ⚠️ DEPRECATED: Use overload with DocumentStructure for better performance
     * @param tokens Array of tokens
     * @param routineScope The routine token
     * @returns Parent scope token or undefined
     */
    public static getParentScopeOfRoutine(tokens: Token[], routineScope: Token): Token | undefined;
    
    /**
     * Implementation of getParentScopeOfRoutine
     */
    public static getParentScopeOfRoutine(tokensOrStructure: Token[] | DocumentStructure, routineScope: Token): Token | undefined {
        // Check if we received a DocumentStructure
        if ('getParent' in tokensOrStructure) {
            // 🚀 PERFORMANCE: Use structure's parent index (O(log n))
            const structure = tokensOrStructure as DocumentStructure;
            return structure.getParentScope(routineScope);
        } else {
            // Issue #233 Stage 2: unify the legacy path onto the resolver — the parent scope of
            // a routine is the enclosing procedure/method in its visible chain. Replaces the old
            // "closest parent by highest line" range reduce.
            const node = new ScopeResolver(tokensOrStructure as Token[]).resolveScopeAt(routineScope.line);
            return node.parent?.token ?? undefined;
        }
    }

    /**
     * #264: resolves a `DO routineName` reference to its ROUTINE token, scoped to the
     * ENCLOSING PROCEDURE — Clarion ROUTINE labels are procedure-local and legally
     * repeat across procedures, so a whole-file first-match scan returns the wrong
     * routine whenever two procedures share a routine name. This is the #211
     * algorithm extracted from DefinitionProvider so hover (RoutineHoverResolver),
     * F12 (DefinitionProvider), and Ctrl+F12 (ImplementationProvider) share ONE
     * implementation and always agree.
     *
     * @returns the ROUTINE token inside the cursor's enclosing procedure, or
     *   undefined when the cursor isn't inside a procedure or the procedure has no
     *   such routine (callers should return null — falling back to a file-wide
     *   match would reintroduce the wrong-routine bug).
     */
    public static findScopedRoutineToken(
        structure: DocumentStructure,
        routineName: string,
        cursorLine: number
    ): Token | undefined {
        // #285: search the routine-hosting scopes visible from the cursor, innermost first. A
        // method-local routine shadows a procedure-level one; a LOCAL DERIVED method also sees the
        // routines of its class's declaring procedure (Rule 4), so `DO ProcLevelRoutine` inside such
        // a method resolves — previously only the immediate method scope was searched, so F12/Ctrl+F12
        // returned nothing while hover fell through to a broader (unscoped) resolver and did resolve.
        const scopes = TokenHelper.getRoutineHostingScopes(structure, cursorLine);
        for (const scope of scopes) {
            const match = structure.findRoutines(routineName).find(routineToken => {
                const parentScope = TokenHelper.getParentScopeOfRoutine(structure, routineToken);
                return parentScope?.line === scope.line &&
                       parentScope?.value.toUpperCase() === scope.value.toUpperCase();
            });
            if (match) return match;
        }
        return undefined;
    }

    /**
     * #321 — resolve a GOTO target: a statement label visible from `cursorLine`
     * under GOTO's scope rule (Language Reference): the target must be the
     * label of another EXECUTABLE statement inside the currently executing
     * ROUTINE or PROCEDURE — exactly one unit, no chain, and never a ROUTINE
     * or PROCEDURE label. For a procedure unit the executable region ends
     * where its first ROUTINE begins (routine bodies are separate GOTO units).
     */
    public static findScopedStatementLabelToken(
        structure: DocumentStructure,
        tokens: Token[],
        labelName: string,
        cursorLine: number
    ): Token | undefined {
        const node = structure.getScopeResolver().resolveScopeAt(cursorLine);
        const unit = (node.kind === ScopeKind.Routine ||
                      node.kind === ScopeKind.Procedure ||
                      node.kind === ScopeKind.Method)
            ? node.token : null;
        if (!unit) return undefined;

        // Executable region: after the unit's CODE marker (a routine without a
        // DATA/CODE split starts at its header line).
        const execStart = unit.executionMarker?.line ?? unit.line;
        let execEnd = unit.finishesAt ?? Number.MAX_SAFE_INTEGER;
        if (node.kind !== ScopeKind.Routine) {
            const firstRoutine = tokens.find(t =>
                t.subType === TokenType.Routine &&
                t.line > unit.line &&
                t.line <= execEnd);
            if (firstRoutine) execEnd = firstRoutine.line - 1;
        }

        const nameLower = labelName.toLowerCase();
        return tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.line > execStart &&
            t.line <= execEnd &&
            t.value.toLowerCase() === nameLower &&
            // statement label only — never a ROUTINE/PROCEDURE label
            !tokens.some(s =>
                s.line === t.line &&
                (s.subType === TokenType.Routine ||
                 s.type === TokenType.Procedure ||
                 s.type === TokenType.Function))
        );
    }

    /**
     * #321 stretch — resolve a BREAK/CYCLE label: the label of the INNERMOST
     * enclosing labelled LOOP or ACCEPT structure with that name (BREAK/CYCLE
     * docs: the label must name an enclosing loop — lexical nesting, so the
     * range check alone excludes same-name labels in other procedures).
     * Returns the column-0 Label token on the loop line (the navigation
     * target — the same token the statement-label lookup returns for it).
     */
    public static findEnclosingLoopLabelToken(tokens: Token[], labelName: string, line: number): Token | undefined {
        const lower = labelName.toLowerCase();
        let best: Token | undefined;
        for (const t of tokens) {
            if (t.type !== TokenType.Structure) continue;
            const v = t.value.toUpperCase();
            if (v !== 'LOOP' && v !== 'ACCEPT') continue;
            if (!t.label || t.label.toLowerCase() !== lower) continue;
            if (t.finishesAt === undefined || line < t.line || line > t.finishesAt) continue;
            if (!best || t.line > best.line) best = t;
        }
        if (!best) return undefined;
        return tokens.find(s => s.line === best!.line && s.type === TokenType.Label && s.start === 0) ?? best;
    }

    /**
     * The chain of PROCEDURE / METHOD scopes that can host a ROUTINE visible from `line`, innermost
     * first. A ROUTINE cannot itself host a routine (routines don't nest), so a routine-body line
     * starts from its owning scope. A local derived METHOD's visible chain climbs through its
     * declaring procedure (Rule 4), so both the method and that procedure appear — which is what
     * lets a procedure-level routine resolve from inside one of its class's methods. Empty at
     * global/module scope. Shared by findScopedRoutineToken (#285) and the Create-routine quick
     * fix (#280) so navigation and generation agree on which scopes hold a routine.
     */
    public static getRoutineHostingScopes(structure: DocumentStructure, line: number): Token[] {
        const node = structure.getScopeResolver().resolveScopeAt(line);
        const scopes: Token[] = [];
        let n: ScopeNode | null = node.kind === ScopeKind.Routine ? node.parent : node;
        while (n && (n.kind === ScopeKind.Procedure || n.kind === ScopeKind.Method)) {
            if (n.token) scopes.push(n.token);
            n = n.parent;
        }
        return scopes;
    }

    /**
     * Gets the word range at a position
     * Handles Clarion's special notation:
     * - Prefix notation with colons (LOC:Field, Struct:Field)
     * - Dot notation for structure fields (MyGroup.MyField)
     * - Position-aware for dot notation (cursor on prefix vs cursor on field)
     */
    public static getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });

        // In Clarion, colons are used for prefix notation (LOC:Field, Struct:Field, etc.)
        // and dots are used for structure field access (MyGroup.MyField)
        const includeColons = true;
        
        // For dot notation, we need to be position-aware
        // If cursor is on "MyGroup" in "MyGroup.MyVar", return only "MyGroup"
        // If cursor is on "MyVar" in "MyGroup.MyVar", return "MyGroup.MyVar"
        
        // First, find the immediate word at cursor position (without dots)
        let wordStart = position.character;
        let wordEnd = position.character;
        
        // Find start of current word segment
        while (wordStart > 0) {
            const char = line.charAt(wordStart - 1);
            if (this.isWordCharacter(char) || (includeColons && char === ':')) {
                wordStart--;
            } else {
                break;
            }
        }
        
        // Find end of current word segment  
        while (wordEnd < line.length) {
            const char = line.charAt(wordEnd);
            if (this.isWordCharacter(char)) {
                wordEnd++;
            } else if (includeColons && char === ':') {
                // Include colon in prefix notation
                wordEnd++;
            } else {
                break;
            }
        }
        
        // Now check if there's a dot before or after this word segment
        // If dot is BEFORE the word, we're on the field part - include the prefix
        // If dot is AFTER the word, we're on the prefix part - only return the prefix
        let start = wordStart;
        let end = wordEnd;
        
        // Check for dot AFTER current word (e.g., cursor on "MyGroup" in "MyGroup.MyVar")
        if (wordEnd < line.length && line.charAt(wordEnd) === '.') {
            // Cursor is on the structure name part, just return that part
            // Don't include the dot or field name
        }
        // Check for dot BEFORE current word (e.g., cursor on "MyVar" in "MyGroup.MyVar")
        else if (wordStart > 0 && line.charAt(wordStart - 1) === '.') {
            // Cursor is on the field part, include the structure name
            // Walk backwards to include "MyGroup."
            start = wordStart - 1; // Include the dot
            while (start > 0) {
                const char = line.charAt(start - 1);
                if (this.isWordCharacter(char)) {
                    start--;
                } else {
                    break;
                }
            }
        }

        if (start === end) {
            return null;
        }

        return {
            start: { line: position.line, character: start },
            end: { line: position.line, character: end }
        };
    }

    /**
     * Checks if a character is part of a word (excluding dots and colons)
     */
    private static isWordCharacter(char: string): boolean {
        return /[a-zA-Z0-9_]/.test(char);
    }

    // ========================================================================
    // Phase 2: Filter Pattern Consolidation & Case-Insensitive Comparison
    // ========================================================================

    /**
     * Returns true if the given character position on a line falls inside a Clarion
     * comment (`!`) or after a line-continuation marker (`|`), meaning navigation
     * and hover should be suppressed at that position.
     */
    public static isPositionInComment(tokens: Token[], line: number, character: number): boolean {
        return tokens.some(t =>
            t.line === line &&
            (t.type === TokenType.Comment || t.type === TokenType.LineContinuation) &&
            t.start <= character
        );
    }

    public static isPositionInString(tokens: Token[], line: number, character: number): boolean {
        if (tokens.some(t =>
            t.line === line &&
            t.type === TokenType.String &&
            t.start <= character &&
            character <= t.start + t.value.length
        )) {
            return true;
        }

        // #373: a string literal swallowed inside a composite token (e.g. the
        // FunctionArgumentParameter token "command ('/netnolog')") never surfaces
        // as a TokenType.String token, so the check above misses it and hover/F12
        // ran the full resolver chain on string contents. Scan the covering
        // token's source text for quoted spans instead — '' is an escaped quote,
        // not a terminator.
        const covering = tokens.find(t =>
            t.line === line &&
            t.type !== TokenType.Comment &&
            t.start <= character &&
            character < t.start + t.value.length
        );
        if (!covering || !covering.value.includes("'")) return false;

        let inString = false;
        for (let i = 0; i < covering.value.length; i++) {
            if (covering.value[i] === "'") {
                if (inString && covering.value[i + 1] === "'") { i++; continue; } // '' escape
                inString = !inString;
            }
            if (covering.start + i >= character) return inString;
        }
        return false;
    }

    /**
     * Returns the String token containing the cursor when it sits inside the
     * FIRST string-literal argument of a file-reference statement (INCLUDE /
     * MODULE / MEMBER / LINK) on the cursor line — i.e. the filename position
     * of `INCLUDE('foo.inc')` and siblings. Returns null otherwise.
     *
     * Used by `DefinitionProvider.provideDefinition` (#171) to make a precise
     * exception to the `isPositionInString` guard so F12 on a file-ref filename
     * routes through `FileDefinitionResolver` instead of bailing because the
     * filename happens to live inside a single-quoted string. The caller reads
     * `.value` off the returned token to extract the filename (stripping the
     * surrounding quote chars) rather than going through the heuristic word-
     * extraction path designed for identifier-shaped tokens.
     *
     * The detector deliberately scopes to the **FIRST** string after the
     * file-ref token so two-arg forms like `INCLUDE('foo.inc'),SECTION('bar')`
     * still bail at the SECTION arg (cursor in 2nd string → null). The
     * `referencedFile` token property is populated by the tokenizer for all
     * four statement types (`TokenTypes.ts:117`); 9 existing callers in
     * `MemberLocatorService` / `SymbolFinderService` / `DefinitionProvider`
     * already rely on it. No tokenizer changes.
     *
     * Returns null (caller bails per existing guard) when:
     *   - No file-ref token on the cursor line
     *   - Cursor is in a string but it's not the FIRST string after the
     *     file-ref token (e.g. SECTION arg)
     *   - File-ref token's first string arg can't be located (defensive)
     *
     * Range convention matches `isPositionInString`: `[t.start, t.start + length]`
     * inclusive on both bounds.
     */
    public static getFileRefArgStringToken(tokens: Token[], line: number, character: number): Token | null {
        const fileRefTokens = tokens.filter(t =>
            t.line === line &&
            t.referencedFile !== undefined &&
            t.referencedFile.length > 0
        );
        if (fileRefTokens.length === 0) return null;

        for (const fileRef of fileRefTokens) {
            const firstStringAfter = tokens.find(t =>
                t.line === line &&
                t.type === TokenType.String &&
                t.start > fileRef.start
            );
            if (!firstStringAfter) continue;
            if (
                firstStringAfter.start <= character &&
                character <= firstStringAfter.start + firstStringAfter.value.length
            ) {
                return firstStringAfter;
            }
        }
        return null;
    }

    /**
     * #343 — the SECTION argument of `INCLUDE('file','section')`: the SECOND
     * string after an INCLUDE file-ref token on the line, with the cursor
     * inside it. Only INCLUDE carries a section argument (LINK's second arg
     * is a flag, MODULE/MEMBER are single-arg), so this is INCLUDE-scoped.
     * Returns the section string token plus the include's filename.
     */
    public static getIncludeSectionArgStringToken(
        tokens: Token[],
        line: number,
        character: number
    ): { section: Token; includeFile: string } | null {
        const includeTokens = tokens.filter(t =>
            t.line === line &&
            t.value?.toUpperCase() === 'INCLUDE' &&
            t.referencedFile !== undefined &&
            t.referencedFile.length > 0
        );
        for (const inc of includeTokens) {
            const strings = tokens
                .filter(t => t.line === line && t.type === TokenType.String && t.start > inc.start)
                .sort((a, b) => a.start - b.start);
            if (strings.length < 2) continue;
            const second = strings[1];
            if (second.start <= character && character <= second.start + second.value.length) {
                return { section: second, includeFile: inc.referencedFile! };
            }
        }
        return null;
    }

    /**
     * Boolean wrapper over `getFileRefArgStringToken` — same contract, returns
     * just whether the cursor is in a file-ref filename position. Use when the
     * caller doesn't need the matched token (e.g. tests, guard checks).
     */
    public static isInsideFileRefArg(tokens: Token[], line: number, character: number): boolean {
        return this.getFileRefArgStringToken(tokens, line, character) !== null;
    }

    /**
     * True for any callable declaration token (Procedure or Function).
     * In modern Clarion both can return values; the distinction is a legacy
     * tokenizer artifact, so callers asking "is this a callable declaration?"
     * must accept both. Use this anywhere a per-file check on `t.type` is
     * filtering for callable declarations.
     */
    public static isProcedureOrFunction(token: Token): boolean {
        return token.type === TokenType.Procedure || token.type === TokenType.Function;
    }

    /**
     * Case-insensitive string comparison (optimized to avoid unnecessary allocations)
     * 🚀 PERFORMANCE: Only allocates uppercase strings once, not in tight loops
     * @param a First string
     * @param b Second string
     * @returns true if strings are equal (case-insensitive)
     */
    public static equalsIgnoreCase(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        return a.toUpperCase() === b.toUpperCase();
    }

    /**
     * Find all tokens matching given criteria
     * Consolidates common filter patterns used throughout the codebase
     * @param tokens Array of tokens to search
     * @param criteria Filter criteria object
     * @returns Array of matching tokens
     */
    public static findTokens(tokens: Token[], criteria: {
        type?: TokenType;
        types?: TokenType[];
        subType?: TokenType;
        subTypes?: TokenType[];
        value?: string;
        valueMatch?: (value: string) => boolean;
        atStart?: boolean;
        line?: number;
        beforeLine?: number;
        afterLine?: number;
        inScope?: Token;
    }): Token[] {
        return tokens.filter(t => {
            // Type filtering
            if (criteria.type !== undefined && t.type !== criteria.type) return false;
            if (criteria.types && !criteria.types.includes(t.type)) return false;
            
            // SubType filtering
            if (criteria.subType !== undefined && t.subType !== criteria.subType) return false;
            if (criteria.subTypes && !criteria.subTypes.includes(t.subType!)) return false;
            
            // Value filtering (case-insensitive)
            if (criteria.value && !this.equalsIgnoreCase(t.value, criteria.value)) return false;
            if (criteria.valueMatch && !criteria.valueMatch(t.value)) return false;
            
            // Position filtering
            if (criteria.atStart !== undefined && (t.start === 0) !== criteria.atStart) return false;
            if (criteria.line !== undefined && t.line !== criteria.line) return false;
            if (criteria.beforeLine !== undefined && t.line >= criteria.beforeLine) return false;
            if (criteria.afterLine !== undefined && t.line <= criteria.afterLine) return false;
            
            // Scope filtering
            if (criteria.inScope) {
                const inScope = t.line >= criteria.inScope.line &&
                              (criteria.inScope.finishesAt === undefined || 
                               t.line <= criteria.inScope.finishesAt);
                if (!inScope) return false;
            }
            
            return true;
        });
    }

    /**
     * Find labels at column 0 (common pattern across providers)
     * @param tokens Array of tokens
     * @param name Optional label name to match (case-insensitive)
     * @returns Array of label tokens
     */
    public static findLabels(tokens: Token[], name?: string): Token[] {
        return this.findTokens(tokens, {
            type: TokenType.Label,
            atStart: true,
            value: name
        });
    }

    /**
     * Find MAP structures (common pattern in MapProcedureResolver)
     * @param tokens Array of tokens
     * @returns Array of MAP structure tokens
     */
    public static findMapStructures(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            type: TokenType.Structure,
            value: 'MAP'
        });
    }

    /**
     * Find CLASS structures
     * @param tokens Array of tokens
     * @returns Array of CLASS structure tokens
     */
    public static findClassStructures(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            type: TokenType.Structure,
            value: 'CLASS'
        });
    }

    /**
     * Find MODULE structures
     * @param tokens Array of tokens
     * @returns Array of MODULE structure tokens
     */
    public static findModuleStructures(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            type: TokenType.Structure,
            value: 'MODULE'
        });
    }

    /**
     * Find procedure tokens (any type: Procedure, GlobalProcedure, MethodImplementation)
     * @param tokens Array of tokens
     * @returns Array of procedure tokens
     */
    public static findProcedures(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            subTypes: [
                TokenType.Procedure,
                TokenType.GlobalProcedure,
                TokenType.MethodImplementation
            ]
        });
    }

    /**
     * Find routine tokens
     * @param tokens Array of tokens
     * @returns Array of routine tokens
     */
    public static findRoutines(tokens: Token[]): Token[] {
        return this.findTokens(tokens, {
            subType: TokenType.Routine
        });
    }

    /**
     * Find variable tokens at column 0 (common pattern for data section variables)
     * @param tokens Array of tokens
     * @param name Optional variable name to match (case-insensitive)
     * @returns Array of variable tokens
     */
    public static findVariablesAtStart(tokens: Token[], name?: string): Token[] {
        return this.findTokens(tokens, {
            types: [
                TokenType.Variable,
                TokenType.ReferenceVariable,
                TokenType.ImplicitVariable,
                TokenType.Label // Labels can also be variable declarations
            ],
            atStart: true,
            value: name
        });
    }

    /**
     * Find structure tokens with specific prefix
     * @param tokens Array of tokens
     * @param prefix Structure prefix to match (case-insensitive)
     * @returns Array of structure tokens with matching prefix
     */
    public static findStructuresWithPrefix(tokens: Token[], prefix: string): Token[] {
        return tokens.filter(t =>
            t.type === TokenType.Structure &&
            t.structurePrefix &&
            this.equalsIgnoreCase(t.structurePrefix, prefix)
        );
    }

    /**
     * Find tokens in first N lines (common pattern for file header scanning)
     * @param tokens Array of tokens
     * @param maxLine Maximum line number (exclusive)
     * @returns Array of tokens before maxLine
     */
    public static findTokensInHeader(tokens: Token[], maxLine: number = 5): Token[] {
        return this.findTokens(tokens, {
            beforeLine: maxLine
        });
    }
}
