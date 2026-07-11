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
        return tokens.some(t =>
            t.line === line &&
            t.type === TokenType.String &&
            t.start <= character &&
            character <= t.start + t.value.length
        );
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
