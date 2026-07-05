import { Token, TokenType } from '../tokenizer/TokenTypes';

/**
 * Classification of a single call-site argument.
 *
 * Buckets are derived from the empirical surface survey performed during
 * Phase A of P2b (10ea5a80 / Mark's overload-resolution rule). Each kind
 * carries enough information for `MethodOverloadResolver.findOverloadByArgClassifications`
 * to apply the locked rule:
 *
 *   1. literal → non-reference overload only (literal has no address).
 *   2. variable → may match base type or `*TYPE` ref form (compiler picks most specific).
 *   3. unknown / expression → conservative match-all (silent-failure-pushback bias).
 */
export type ArgKind =
    | 'literal_string'      // 'x', "hello"
    | 'literal_picture'     // @s255, @n10.2
    | 'literal_numeric'     // 42, 3.14, -7
    | 'variable'            // myVar
    | 'dotted_var'          // SELF.lines, obj.field
    | 'prefixed_var'        // PA5:RECORD, EVENT:Accepted, Access:RunScreen
    | 'control_equate'      // ?MyControl
    | 'call_result'         // Func(...), obj.Method(...)
    | 'expression'          // a & b, n + 1, anything compound
    | 'unknown';            // didn't match any pattern (e.g. stripped/empty)

export interface ArgClassification {
    kind: ArgKind;
    /** Base Clarion type when known (e.g. 'STRING', 'LONG', 'MyClass'). Undefined for kinds that need external resolution and no resolver supplied. */
    inferredType?: string;
    /** Text of the argument as written at the call site (whitespace-collapsed). For diagnostics. */
    rawText: string;
    /** 0-based line number of the first token in the argument. */
    line: number;
    /** 0-based column of the first token in the argument. */
    character: number;
}

/**
 * Optional context for the classifier. Allows the caller to inject a symbol-type
 * resolver (typically wrapping `SymbolFinderService.findSymbol`) so the classifier
 * stays a pure function and resolver wiring lives in the consumer.
 */
export interface ClassifierContext {
    /**
     * Resolve a name to its declared Clarion type at a given source position.
     * The classifier calls this for `variable`, `dotted_var`, `prefixed_var`, and
     * `control_equate` kinds when populating `inferredType`. Return `undefined`
     * when the name cannot be resolved — the classifier leaves `inferredType`
     * unset and the consumer falls back to conservative match-all.
     */
    resolveSymbolType?: (name: string, line: number, character: number) => string | undefined;
}

const PICTURE_FORMAT_PATTERN = /^@[a-z]/i;

/**
 * Pure-function classifier for call-site arguments. Walks the token stream
 * starting from a call's name token, locates the `(...)` argument list, and
 * partitions it into per-position classifications.
 *
 * Single-purpose: identify the argument's shape and (when a resolver is provided)
 * its inferred type. Does not consume `MethodOverloadResolver` output — overload
 * picking is the resolver's job. The seam between the two is intentional: this
 * classifier can grow richer arg semantics independently of overload resolution.
 */
export class CallSiteArgumentClassifier {

    /**
     * Classify the arguments of a function/method call.
     *
     * @param tokens Token stream for the file.
     * @param callNameTokenIdx Index of the call's name token (the token immediately
     *   before the opening `(`). Comments between the name and `(` are tolerated.
     * @param ctx Optional resolver context.
     * @returns
     *   - `ArgClassification[]` when the argument list is found and parsed.
     *     Empty array (`[]`) when the call has zero arguments (`Foo()`).
     *   - `null` when no `(...)` follows the name on the same line — the call has
     *     no argument list (e.g. property access `obj.field` with no parens).
     */
    public classifyArguments(
        tokens: Token[],
        callNameTokenIdx: number,
        ctx?: ClassifierContext
    ): ArgClassification[] | null {
        if (callNameTokenIdx < 0 || callNameTokenIdx >= tokens.length) return null;

        const callNameToken = tokens[callNameTokenIdx];
        const callLine = callNameToken.line;

        // Step 1: locate the opening `(` on the same line, skipping comments.
        let openParenIdx = -1;
        for (let j = callNameTokenIdx + 1; j < tokens.length && tokens[j].line === callLine; j++) {
            const t = tokens[j];
            if (t.type === TokenType.Comment) continue;
            if (t.type === TokenType.Delimiter && t.value === '(') {
                openParenIdx = j;
                break;
            }
            // Any other token before `(` means there's no call here.
            break;
        }
        if (openParenIdx < 0) return null;

        // Step 2: collect argument slices via depth-aware comma split.
        const argSlices: Token[][] = [];
        let current: Token[] = [];
        let depth = 1;
        let j = openParenIdx + 1;
        while (j < tokens.length && depth > 0) {
            const t = tokens[j];
            if (t.type === TokenType.Comment) { j++; continue; }
            if (t.type === TokenType.Delimiter) {
                if (t.value === '(') {
                    depth++;
                    current.push(t);
                } else if (t.value === ')') {
                    depth--;
                    if (depth === 0) {
                        if (current.length > 0) argSlices.push(current);
                        break;
                    }
                    current.push(t);
                } else if (t.value === ',' && depth === 1) {
                    if (current.length > 0) argSlices.push(current);
                    current = [];
                } else {
                    current.push(t);
                }
            } else {
                current.push(t);
            }
            j++;
        }

        // Step 3: classify each slice.
        // #240: build a name→value map of EQUATE declarations once, so a bare EQUATE
        // argument can be classified by its constant's literal shape without a resolver
        // (the hover/def path calls us with no ctx).
        const equates = this.buildEquateValueMap(tokens);
        return argSlices.map(slice => this.classifySlice(slice, ctx, equates));
    }

    private classifySlice(slice: Token[], ctx?: ClassifierContext, equates?: Map<string, string>): ArgClassification {
        // Trim purely-syntactic leading tokens (defensive; tokenizer normally produces clean slices).
        const significant = slice.filter(t =>
            t.type !== TokenType.Comment &&
            !(t.type === TokenType.Delimiter && (t.value === ' ' || t.value === '\t'))
        );

        const rawText = slice.map(t => t.value).join('').trim();
        const first = significant[0];

        if (!first) {
            return { kind: 'unknown', rawText, line: 0, character: 0 };
        }

        const line = first.line;
        const character = first.start;

        // Single-token slices: the simple buckets.
        if (significant.length === 1) {
            return this.classifySingleToken(first, rawText, line, character, ctx, equates);
        }

        // Multi-token: distinguish dotted/prefixed/call-result/expression.
        return this.classifyMultiToken(significant, rawText, line, character, ctx);
    }

    private classifySingleToken(
        first: Token,
        rawText: string,
        line: number,
        character: number,
        ctx?: ClassifierContext,
        equates?: Map<string, string>
    ): ArgClassification {
        switch (first.type) {
            case TokenType.String:
                return { kind: 'literal_string', inferredType: 'STRING', rawText, line, character };
            case TokenType.Number:
                return { kind: 'literal_numeric', inferredType: this.numericBaseType(first.value), rawText, line, character };
            case TokenType.PictureFormat:
                return { kind: 'literal_picture', inferredType: 'STRING', rawText, line, character };
            case TokenType.FieldEquateLabel:
                // ?ControlName — control equate. Type lookup can refine; fall back to LONG (control id).
                return {
                    kind: 'control_equate',
                    inferredType: ctx?.resolveSymbolType?.(first.value, line, character) ?? 'LONG',
                    rawText, line, character
                };
            case TokenType.StructureField:
                // Already-merged dotted path token (e.g. "SELF.lines").
                return {
                    kind: 'dotted_var',
                    inferredType: ctx?.resolveSymbolType?.(first.value, line, character),
                    rawText, line, character
                };
            case TokenType.StructurePrefix:
            case TokenType.Constant:
                // INV:Customer, EVENT:Accepted, Reset:Done — prefix-namespaced.
                return {
                    kind: 'prefixed_var',
                    inferredType: ctx?.resolveSymbolType?.(first.value, line, character),
                    rawText, line, character
                };
            case TokenType.ImplicitVariable:
                // #241: an undeclared implicit variable — the compiler infers its type from the
                // label's trailing suffix (# → LONG, $ → REAL, " → STRING(32)). It is a real
                // addressable variable, so it keeps the `variable` kind (can bind a base type or
                // a `*TYPE` ref parameter), unlike an EQUATE constant (#240).
                return {
                    kind: 'variable',
                    inferredType: this.implicitVariableType(first.value),
                    rawText, line, character
                };
            case TokenType.Variable:
            case TokenType.ReferenceVariable:
                // Picture-format may slip through as Variable if tokenizer didn't tag it.
                if (PICTURE_FORMAT_PATTERN.test(first.value)) {
                    return { kind: 'literal_picture', inferredType: 'STRING', rawText, line, character };
                }
                // #240: a bare identifier that names an EQUATE is a named constant. Classify it
                // by the literal shape of its value (numeric / string / picture) so the overload
                // resolver treats it like the underlying literal — a constant has no address, so
                // this also correctly excludes reference-parameter (`*TYPE`) overloads.
                if (equates) {
                    const equateArg = this.classifyEquateArgument(
                        this.stripRefSigil(first.value), rawText, line, character, equates);
                    if (equateArg) return equateArg;
                }
                return {
                    kind: 'variable',
                    inferredType: ctx?.resolveSymbolType?.(this.stripRefSigil(first.value), line, character),
                    rawText, line, character
                };
            default:
                if (PICTURE_FORMAT_PATTERN.test(first.value)) {
                    return { kind: 'literal_picture', inferredType: 'STRING', rawText, line, character };
                }
                return { kind: 'unknown', rawText, line, character };
        }
    }

    private classifyMultiToken(
        significant: Token[],
        rawText: string,
        line: number,
        character: number,
        ctx?: ClassifierContext
    ): ArgClassification {
        const first = significant[0];
        const second = significant[1];

        // Substring slice / array index: `<base> [ ... ]` (#181 item 3 + #192).
        // Discriminator is BASE-TYPE resolution, not bracket-content shape: Phase A
        // proved the tokenizer collapses `ident:ident` slices (`field[a:b]`) into a
        // single StructurePrefix token, byte-identical to a prefix array-subscript
        // `arr[LOC:I]`, so colon-presence alone cannot tell a string slice from an
        // array index. Resolving the base type does: any index/slice of a STRING-like
        // base yields STRING. A substring slice is an addressable STRING lvalue, so we
        // reuse the `variable` kind (matches STRING base or `*STRING` ref form) rather
        // than adding a new ArgKind — keeps the fix to the classifier, no resolver edits.
        // Base forms recognised (#192 widened from bare-variable-only): bare variable,
        // dotted (`SELF.field[a:b]`, one StructureField token), and prefixed
        // (`PRE:Field[a:b]`, a three-token [Attribute|Variable ':' Variable] head).
        const slice = this.sliceAccess(significant);
        if (slice) {
            const baseType = ctx?.resolveSymbolType?.(slice.baseName, line, character);
            if (baseType && this.isStringLikeType(baseType)) {
                return { kind: 'variable', inferredType: 'STRING', rawText, line, character };
            }
            // Secondary fallback: when the base cannot be resolved, a standalone
            // Delimiter(':') inside the brackets (numeric slice `[0:128]`) is an
            // almost-certain substring slice → STRING.
            if (!baseType && this.hasStandaloneColon(significant, slice.openIdx)) {
                return { kind: 'variable', inferredType: 'STRING', rawText, line, character };
            }
            // Resolved non-string base (e.g. `arr[i]` LONG element) or unresolved
            // single subscript: leave to the fall-through buckets — never retype to
            // STRING (non-X regression guard).
        }

        // Negative numeric literal: `-` operator + Number.
        if (first.type === TokenType.Operator && first.value === '-' &&
            second && second.type === TokenType.Number && significant.length === 2) {
            return {
                kind: 'literal_numeric',
                inferredType: this.numericBaseType(second.value),
                rawText, line, character
            };
        }

        // Function call result: identifier directly followed by `(`.
        if ((first.type === TokenType.Function ||
             first.type === TokenType.Variable ||
             first.type === TokenType.PropertyFunction) &&
            second && second.type === TokenType.Delimiter && second.value === '(') {
            return { kind: 'call_result', rawText, line, character };
        }

        // Dotted access: identifier `.` identifier(...optional `(`).
        if (this.looksLikeDottedAccess(significant)) {
            const lastSig = significant[significant.length - 1];
            const endsInCall = lastSig.type === TokenType.Delimiter && lastSig.value === ')';
            if (endsInCall) {
                return { kind: 'call_result', rawText, line, character };
            }
            return {
                kind: 'dotted_var',
                inferredType: ctx?.resolveSymbolType?.(this.joinDotPath(significant), line, character),
                rawText, line, character
            };
        }

        // Prefix-namespace: identifier `:` identifier (Clarion's PRE convention).
        if (first.type === TokenType.Variable &&
            second && second.type === TokenType.Delimiter && second.value === ':' &&
            significant.length >= 3) {
            const name = significant.slice(0, 3).map(t => t.value).join('');
            return {
                kind: 'prefixed_var',
                inferredType: ctx?.resolveSymbolType?.(name, line, character),
                rawText, line, character
            };
        }

        // Property access: identifier `{` PROP `:` Name `}` — emit as expression (deep-navigation).
        if (significant.some(t => t.type === TokenType.Delimiter && t.value === '{')) {
            return { kind: 'expression', rawText, line, character };
        }

        // Compound expressions: contains arithmetic/concat operators.
        if (significant.some(t => t.type === TokenType.Operator)) {
            return { kind: 'expression', rawText, line, character };
        }

        return { kind: 'unknown', rawText, line, character };
    }

    /**
     * Recognises a slice/index shape `<base> [ ... ]` and, when present, returns the
     * base NAME (the tokens before `[`, for resolver lookup) plus the index of the
     * opening `[`. Returns `null` when no slice shape is present. Four base forms
     * (#181 item 3 + #192 + #193 — token shapes confirmed empirically in Phase A):
     *
     *   - bare variable:        `Variable '[' … ']'`                        → base = first.value
     *   - dotted:               `StructureField '[' … ']'`                  → base = first.value ("SELF.field")
     *   - 3-token prefixed:     `(Attribute|Variable) ':' Variable '[' … ']'` → base = "PRE:Field"
     *   - collapsed prefixed:   `StructurePrefix '[' … ']'`                  → base = first.value ("QUE:QText")
     *
     * The base name is ONLY the tokens before `[`; the index/slice content is never
     * swept into it (`SELF.field[i]` resolves "SELF.field", not "SELF.fieldi").
     *
     * Prefixed bases tokenize ASYMMETRICALLY at the call site (#193): when the prefix
     * collides with a keyword (e.g. `PRE`) it splits into three tokens
     * (`Attribute ':' Variable`), but a non-colliding prefix (e.g. `QUE`) collapses to
     * a single `StructurePrefix` token whose value is already the colon-joined
     * "QUE:QText". The 3-token form is matched explicitly; the collapsed form is folded
     * into the bare/dotted head union below (identical handling — base = first.value).
     */
    private sliceAccess(significant: Token[]): { baseName: string; openIdx: number } | null {
        const close = significant[significant.length - 1];
        if (!(close.type === TokenType.Delimiter && close.value === ']')) return null;

        const first = significant[0];

        // 3-token prefixed head: (Attribute|Variable) ':' Variable '[' … ']'.
        if (significant.length >= 6 &&
            (first.type === TokenType.Attribute || first.type === TokenType.Variable) &&
            significant[1].type === TokenType.Delimiter && significant[1].value === ':' &&
            significant[2].type === TokenType.Variable &&
            significant[3].type === TokenType.Delimiter && significant[3].value === '[') {
            return { baseName: significant.slice(0, 3).map(t => t.value).join(''), openIdx: 3 };
        }

        // Bare-variable / dotted / collapsed-prefixed head: <base> '[' … ']'.
        // StructurePrefix covers the collapsed "QUE:QText" form (#193) — its value is
        // already the full colon-joined base name, so it shares first.value handling.
        if (significant.length >= 4 &&
            (first.type === TokenType.Variable ||
             first.type === TokenType.StructureField ||
             first.type === TokenType.StructurePrefix) &&
            significant[1].type === TokenType.Delimiter && significant[1].value === '[') {
            return { baseName: first.value, openIdx: 1 };
        }

        return null;
    }

    /**
     * True when a standalone `:` Delimiter appears INSIDE the brackets (numeric slice
     * `[0:128]`). Scans only tokens after the opening `[` (`openIdx`), so a prefix
     * colon (`PRE:Field`) outside the brackets is never mistaken for a slice colon.
     */
    private hasStandaloneColon(significant: Token[], openIdx: number): boolean {
        for (let i = openIdx + 1; i < significant.length; i++) {
            const t = significant[i];
            if (t.type === TokenType.Delimiter && t.value === ':') return true;
        }
        return false;
    }

    /** STRING-family base test (handles parameterised forms like `STRING(256)`). */
    private isStringLikeType(type: string): boolean {
        const base = type.trim().toUpperCase().split('(')[0].trim();
        return base === 'STRING' || base === 'CSTRING' || base === 'PSTRING' || base === 'ASTRING';
    }

    private looksLikeDottedAccess(significant: Token[]): boolean {
        if (significant.length < 3) return false;
        const a = significant[0];
        const dot = significant[1];
        const b = significant[2];
        return (a.type === TokenType.Variable || a.type === TokenType.StructureField) &&
               dot.type === TokenType.Delimiter && dot.value === '.' &&
               (b.type === TokenType.Variable || b.type === TokenType.StructureField);
    }

    private joinDotPath(significant: Token[]): string {
        return significant
            .filter(t => t.type === TokenType.Variable ||
                         t.type === TokenType.StructureField ||
                         (t.type === TokenType.Delimiter && t.value === '.'))
            .map(t => t.value)
            .join('');
    }

    private stripRefSigil(value: string): string {
        return value.startsWith('&') ? value.slice(1) : value;
    }

    private numericBaseType(literal: string): string {
        return literal.includes('.') ? 'REAL' : 'LONG';
    }

    /** #241: implicit-variable type from its trailing suffix (# LONG, $ REAL, " STRING(32)). */
    private implicitVariableType(name: string): string | undefined {
        switch (name.charAt(name.length - 1)) {
            case '#': return 'LONG';
            case '$': return 'REAL';
            case '"': return 'STRING';
            default:  return undefined;
        }
    }

    // ── #240: EQUATE argument type inference ────────────────────────────────────
    // An EQUATE is a compile-time named constant (`Label EQUATE(value)`). When it is
    // passed as a call argument, the compiler resolves overloads by the value's type.
    // We derive that type from the raw value text captured on the declaration token
    // (`Token.dataValue`), so it works purely from the token stream (no resolver).

    /** name(upper) → raw parenthesised EQUATE value text (e.g. '100', "'hi'", '@P##'). */
    private buildEquateValueMap(tokens: Token[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const t of tokens) {
            if (t.dataType === 'EQUATE' && t.dataValue !== undefined && t.value) {
                const key = t.value.toUpperCase();
                if (!map.has(key)) map.set(key, t.dataValue); // first declaration wins
            }
        }
        return map;
    }

    /** Classify a bare identifier that names an EQUATE, or undefined if it isn't one
     *  (or its value can't be resolved to a literal type — caller falls back to `variable`). */
    private classifyEquateArgument(
        name: string,
        rawText: string,
        line: number,
        character: number,
        equates: Map<string, string>
    ): ArgClassification | undefined {
        const inf = this.resolveEquateInferredType(name, equates, new Set<string>());
        if (!inf) return undefined;
        return { kind: inf.kind, inferredType: inf.inferredType, rawText, line, character };
    }

    /** Map an EQUATE's value to a literal kind/type, following alias chains (bounded). */
    private resolveEquateInferredType(
        name: string,
        equates: Map<string, string>,
        visited: Set<string>
    ): { kind: ArgKind; inferredType: string } | undefined {
        const key = name.toUpperCase();
        if (visited.has(key)) return undefined; // cycle guard
        const raw = equates.get(key);
        if (raw === undefined) return undefined;
        visited.add(key);

        const t = raw.trim();
        if (t.length === 0) return undefined;                                   // ITEMIZE auto-value etc.
        if (t.startsWith("'") || t.startsWith('"')) {
            return { kind: 'literal_string', inferredType: 'STRING' };
        }
        if (PICTURE_FORMAT_PATTERN.test(t)) {
            return { kind: 'literal_picture', inferredType: 'STRING' };
        }
        const num = this.classifyNumericLiteral(t);
        if (num) return num;
        // Alias to another label, e.g. `Init EQUATE(SetUpProg)` — resolve transitively.
        if (/^[A-Za-z_][A-Za-z0-9_:]*$/.test(t)) {
            return this.resolveEquateInferredType(t, equates, visited);
        }
        // Constant expression (1+2, BOR(...)), a type keyword (SIGNED EQUATE(LONG)), or
        // anything unrecognised → let the caller fall back to conservative match-all.
        return undefined;
    }

    /** Numeric literal → { literal_numeric, LONG|REAL }, else undefined. Handles decimal,
     *  scientific, and Clarion radix integers (1111b binary, 777o octal, 1AFh hex). */
    private classifyNumericLiteral(t: string): { kind: ArgKind; inferredType: string } | undefined {
        if (/^[+-]?(\d+\.\d+|\.\d+|\d+)([eE][+-]?\d+)?$/.test(t)) {
            const isReal = t.includes('.') || /[eE]/.test(t);
            return { kind: 'literal_numeric', inferredType: isReal ? 'REAL' : 'LONG' };
        }
        if (/^[+-]?[0-9][0-9a-fA-F]*[bBoOhH]$/.test(t)) {
            return { kind: 'literal_numeric', inferredType: 'LONG' };
        }
        return undefined;
    }
}
