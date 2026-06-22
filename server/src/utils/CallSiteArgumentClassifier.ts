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
        return argSlices.map(slice => this.classifySlice(slice, ctx));
    }

    private classifySlice(slice: Token[], ctx?: ClassifierContext): ArgClassification {
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
            return this.classifySingleToken(first, rawText, line, character, ctx);
        }

        // Multi-token: distinguish dotted/prefixed/call-result/expression.
        return this.classifyMultiToken(significant, rawText, line, character, ctx);
    }

    private classifySingleToken(
        first: Token,
        rawText: string,
        line: number,
        character: number,
        ctx?: ClassifierContext
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
            case TokenType.Variable:
            case TokenType.ReferenceVariable:
                // Picture-format may slip through as Variable if tokenizer didn't tag it.
                if (PICTURE_FORMAT_PATTERN.test(first.value)) {
                    return { kind: 'literal_picture', inferredType: 'STRING', rawText, line, character };
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

        // Substring slice / array index: `<bareVariable> [ ... ]` (#181 item 3).
        // Discriminator is BASE-TYPE resolution, not bracket-content shape: Phase A
        // proved the tokenizer collapses `ident:ident` slices (`field[a:b]`) into a
        // single StructurePrefix token, byte-identical to a prefix array-subscript
        // `arr[LOC:I]`, so colon-presence alone cannot tell a string slice from an
        // array index. Resolving the base type does: any index/slice of a STRING-like
        // base yields STRING. A substring slice is an addressable STRING lvalue, so we
        // reuse the `variable` kind (matches STRING base or `*STRING` ref form) rather
        // than adding a new ArgKind — keeps the fix to the classifier, no resolver edits.
        // Bare-variable base only (Bob scope lock); dotted/prefixed bases are follow-up.
        if (this.looksLikeSliceAccess(significant)) {
            const baseType = ctx?.resolveSymbolType?.(first.value, line, character);
            if (baseType && this.isStringLikeType(baseType)) {
                return { kind: 'variable', inferredType: 'STRING', rawText, line, character };
            }
            // Secondary fallback: when the base cannot be resolved, a standalone
            // Delimiter(':') inside the brackets (numeric slice `[0:128]`) is an
            // almost-certain substring slice → STRING.
            if (!baseType && this.hasStandaloneColon(significant)) {
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
     * Recognises the bare-variable slice/index shape `<Variable> [ ... ]`: a single
     * Variable base immediately followed by a `[`, with the slice closed by `]`.
     * Bare-variable only — dotted/prefixed bases (`SELF.field[a:b]`, `PRE:Field[a:b]`)
     * are out of scope (#181 item 3 follow-up) and naturally excluded by the
     * `Variable`-typed base guard.
     */
    private looksLikeSliceAccess(significant: Token[]): boolean {
        if (significant.length < 4) return false; // base + '[' + >=1 index token + ']'
        const base = significant[0];
        const open = significant[1];
        const close = significant[significant.length - 1];
        return base.type === TokenType.Variable &&
               open.type === TokenType.Delimiter && open.value === '[' &&
               close.type === TokenType.Delimiter && close.value === ']';
    }

    /** True when a standalone `:` Delimiter appears among the slice tokens (numeric slice `[0:128]`). */
    private hasStandaloneColon(significant: Token[]): boolean {
        return significant.some(t => t.type === TokenType.Delimiter && t.value === ':');
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
}
