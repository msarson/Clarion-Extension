import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier, ArgClassification, ClassifierContext } from '../utils/CallSiteArgumentClassifier';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * Unit suite for CallSiteArgumentClassifier (P2b — task 10ea5a80, Phase B step 1).
 *
 * Two harnesses:
 *
 *   (A) Mocked-token tests — fast, deterministic, exhaustive coverage of the 9
 *       buckets defined in Phase A's empirical surface survey. Tokens are
 *       hand-built so the classifier's pure-function shape is validated in
 *       isolation, independent of tokenizer changes.
 *
 *   (B) Real-tokenizer smoke tests — drive the classifier with output from
 *       `ClarionTokenizer` on small Clarion source fragments. Belt + suspenders
 *       against tokenizer evolution silently shifting bucket assignments.
 *
 * Resolver behavior is verified via injected `ClassifierContext.resolveSymbolType`
 * stub that records calls and returns canned types — pinning that the classifier
 * (a) calls the resolver with the right name + position, and (b) propagates the
 * returned type into `inferredType`.
 */
suite('CallSiteArgumentClassifier (10ea5a80 Phase B)', () => {

    let classifier: CallSiteArgumentClassifier;

    setup(() => {
        classifier = new CallSiteArgumentClassifier();
    });

    // ───────────────────────────────────────────────────────────────────────
    // (A) Mocked-token tests — exhaustive bucket coverage
    // ───────────────────────────────────────────────────────────────────────

    suite('mocked tokens — bucket classification', () => {

        // Helper: build a token quickly.
        function tk(type: TokenType, value: string, line = 0, start = 0): Token {
            return { type, value, line, start, maxLabelLength: 0 };
        }

        // Helper: build the standard call shape `Foo( <args> )` from a list of arg-token-arrays.
        // Returns `{ tokens, callNameIdx }` — pass to classifier.classifyArguments.
        function buildCall(callName: string, args: Token[][]): { tokens: Token[]; callNameIdx: number } {
            const tokens: Token[] = [tk(TokenType.Variable, callName, 0, 0)];
            tokens.push(tk(TokenType.Delimiter, '(', 0, callName.length));
            args.forEach((arg, i) => {
                if (i > 0) tokens.push(tk(TokenType.Delimiter, ',', 0, 0));
                arg.forEach(t => tokens.push(t));
            });
            tokens.push(tk(TokenType.Delimiter, ')', 0, 0));
            return { tokens, callNameIdx: 0 };
        }

        test('zero-arg call → empty array', () => {
            const { tokens, callNameIdx } = buildCall('Foo', []);
            const result = classifier.classifyArguments(tokens, callNameIdx);
            assert.deepStrictEqual(result, []);
        });

        test('no parens after name → null', () => {
            const tokens: Token[] = [
                tk(TokenType.Variable, 'Foo', 0, 0),
                tk(TokenType.Delimiter, '.', 0, 3)
            ];
            const result = classifier.classifyArguments(tokens, 0);
            assert.strictEqual(result, null);
        });

        test('literal_string — single-quoted', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.String, "'hello'", 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_string');
            assert.strictEqual(a.inferredType, 'STRING');
            assert.strictEqual(a.rawText, "'hello'");
        });

        test('literal_string — double-quoted', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.String, '"hello"', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_string');
            assert.strictEqual(a.inferredType, 'STRING');
        });

        test('literal_picture — explicit PictureFormat token', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.PictureFormat, '@s255', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_picture');
            assert.strictEqual(a.inferredType, 'STRING');
        });

        test('literal_picture — picture-format string slipping through as Variable', () => {
            // Tokenizer may not always tag picture formats; classifier falls back to pattern.
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, '@s255', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_picture');
            assert.strictEqual(a.inferredType, 'STRING');
        });

        test('literal_numeric — integer → LONG', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Number, '42', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_numeric');
            assert.strictEqual(a.inferredType, 'LONG');
        });

        test('literal_numeric — real → REAL', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Number, '3.14', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_numeric');
            assert.strictEqual(a.inferredType, 'REAL');
        });

        test('literal_numeric — negative integer (Operator + Number)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Operator, '-', 0, 4),
                 tk(TokenType.Number, '7', 0, 5)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'literal_numeric');
            assert.strictEqual(a.inferredType, 'LONG');
        });

        test('variable — resolver populates inferredType', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'svalue', 5, 4)]
            ]);
            const calls: { name: string; line: number; character: number }[] = [];
            const ctx: ClassifierContext = {
                resolveSymbolType: (name, line, character) => {
                    calls.push({ name, line, character });
                    return name === 'svalue' ? 'STRING(20)' : undefined;
                }
            };
            const [a] = classifier.classifyArguments(tokens, callNameIdx, ctx)!;
            assert.strictEqual(a.kind, 'variable');
            assert.strictEqual(a.inferredType, 'STRING(20)');
            assert.strictEqual(a.line, 5);
            assert.strictEqual(a.character, 4);
            assert.deepStrictEqual(calls, [{ name: 'svalue', line: 5, character: 4 }]);
        });

        test('variable — no resolver → inferredType undefined', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'svalue', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'variable');
            assert.strictEqual(a.inferredType, undefined);
        });

        test('variable — ReferenceVariable strips & before resolving', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.ReferenceVariable, '&MyClass', 0, 4)]
            ]);
            const seen: string[] = [];
            const ctx: ClassifierContext = {
                resolveSymbolType: (name) => { seen.push(name); return 'MyClass'; }
            };
            const [a] = classifier.classifyArguments(tokens, callNameIdx, ctx)!;
            assert.strictEqual(a.kind, 'variable');
            assert.strictEqual(a.inferredType, 'MyClass');
            assert.deepStrictEqual(seen, ['MyClass'], 'classifier must strip & sigil before lookup');
        });

        test('dotted_var — single StructureField token (e.g. SELF.lines)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.StructureField, 'SELF.lines', 0, 4)]
            ]);
            const ctx: ClassifierContext = {
                resolveSymbolType: () => 'StringTheory'
            };
            const [a] = classifier.classifyArguments(tokens, callNameIdx, ctx)!;
            assert.strictEqual(a.kind, 'dotted_var');
            assert.strictEqual(a.inferredType, 'StringTheory');
        });

        test('dotted_var — split tokens (Variable . Variable)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'obj', 0, 4),
                 tk(TokenType.Delimiter, '.', 0, 7),
                 tk(TokenType.Variable, 'field', 0, 8)]
            ]);
            const seen: string[] = [];
            const ctx: ClassifierContext = {
                resolveSymbolType: (name) => { seen.push(name); return 'LONG'; }
            };
            const [a] = classifier.classifyArguments(tokens, callNameIdx, ctx)!;
            assert.strictEqual(a.kind, 'dotted_var');
            assert.strictEqual(a.inferredType, 'LONG');
            assert.deepStrictEqual(seen, ['obj.field']);
        });

        test('control_equate — ?ControlName', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.FieldEquateLabel, '?MyControl', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'control_equate');
            assert.strictEqual(a.inferredType, 'LONG'); // default fallback when no resolver
        });

        test('control_equate — resolver overrides default LONG', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.FieldEquateLabel, '?MyEntry', 0, 4)]
            ]);
            const ctx: ClassifierContext = {
                resolveSymbolType: () => 'STRING(20)' // hypothetical typed control
            };
            const [a] = classifier.classifyArguments(tokens, callNameIdx, ctx)!;
            assert.strictEqual(a.kind, 'control_equate');
            assert.strictEqual(a.inferredType, 'STRING(20)');
        });

        test('prefixed_var — StructurePrefix single token (PA5:RECORD)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.StructurePrefix, 'PA5:RECORD', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'prefixed_var');
        });

        test('prefixed_var — Constant single token (EVENT:Accepted)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Constant, 'EVENT:Accepted', 0, 4)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'prefixed_var');
        });

        test('prefixed_var — split (Variable : Variable)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'PA5', 0, 4),
                 tk(TokenType.Delimiter, ':', 0, 7),
                 tk(TokenType.Variable, 'RECORD', 0, 8)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'prefixed_var');
        });

        test('call_result — Function token + (', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Function, 'LEN', 0, 4),
                 tk(TokenType.Delimiter, '(', 0, 7),
                 tk(TokenType.Variable, 'svalue', 0, 8),
                 tk(TokenType.Delimiter, ')', 0, 14)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'call_result');
        });

        test('call_result — dotted call (obj.Method())', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'obj', 0, 4),
                 tk(TokenType.Delimiter, '.', 0, 7),
                 tk(TokenType.Variable, 'Method', 0, 8),
                 tk(TokenType.Delimiter, '(', 0, 14),
                 tk(TokenType.Delimiter, ')', 0, 15)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'call_result');
        });

        test('expression — arithmetic (a & b)', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'a', 0, 4),
                 tk(TokenType.Operator, '&', 0, 6),
                 tk(TokenType.Variable, 'b', 0, 8)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'expression');
            assert.strictEqual(a.inferredType, undefined);
        });

        test('expression — property access (ckTest_Feq{PROP:FEQ})', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Variable, 'ckTest_Feq', 0, 4),
                 tk(TokenType.Delimiter, '{', 0, 14),
                 tk(TokenType.Property, 'PROP:FEQ', 0, 15),
                 tk(TokenType.Delimiter, '}', 0, 22)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'expression');
        });

        test('multiple args — mixed kinds, per-position classification', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.String, "'x'", 0, 4)],
                [tk(TokenType.Variable, 'svalue', 0, 9)],
                [tk(TokenType.Number, '42', 0, 17)]
            ]);
            const ctx: ClassifierContext = {
                resolveSymbolType: () => 'STRING(20)'
            };
            const result = classifier.classifyArguments(tokens, callNameIdx, ctx)!;
            assert.strictEqual(result.length, 3);
            assert.strictEqual(result[0].kind, 'literal_string');
            assert.strictEqual(result[1].kind, 'variable');
            assert.strictEqual(result[1].inferredType, 'STRING(20)');
            assert.strictEqual(result[2].kind, 'literal_numeric');
        });

        test('nested call — inner commas do not split outer args', () => {
            // Foo( LEN(a), b )  → 2 args, first is call_result, second is variable.
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Function, 'LEN', 0, 4),
                 tk(TokenType.Delimiter, '(', 0, 7),
                 tk(TokenType.Variable, 'a', 0, 8),
                 tk(TokenType.Delimiter, ')', 0, 9)],
                [tk(TokenType.Variable, 'b', 0, 13)]
            ]);
            const result = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].kind, 'call_result');
            assert.strictEqual(result[1].kind, 'variable');
        });

        test('comments inside arg list are tolerated', () => {
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Comment, '!note', 0, 4),
                 tk(TokenType.Variable, 'svalue', 0, 12)]
            ]);
            const [a] = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(a.kind, 'variable');
        });

        test('out-of-bounds callNameTokenIdx → null', () => {
            const result = classifier.classifyArguments([], 0);
            assert.strictEqual(result, null);
        });

        test('deeply nested parens preserve depth tracking', () => {
            // Foo( ((a)) )
            const { tokens, callNameIdx } = buildCall('Foo', [
                [tk(TokenType.Delimiter, '(', 0, 4),
                 tk(TokenType.Delimiter, '(', 0, 5),
                 tk(TokenType.Variable, 'a', 0, 6),
                 tk(TokenType.Delimiter, ')', 0, 7),
                 tk(TokenType.Delimiter, ')', 0, 8)]
            ]);
            const result = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.strictEqual(result.length, 1, 'deep nesting should not collapse arg count');
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // (B) Real-tokenizer smoke tests — belt + suspenders against tokenizer drift
    // ───────────────────────────────────────────────────────────────────────

    suite('real tokenizer — smoke', () => {

        function tokenize(source: string): Token[] {
            const doc = TextDocument.create('file:///smoke.clw', 'clarion', 1, source);
            return new ClarionTokenizer(doc.getText()).tokenize();
        }

        function findCallNameIdx(tokens: Token[], name: string, occurrence = 0): number {
            let count = 0;
            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i].value.toLowerCase() === name.toLowerCase()) {
                    if (count === occurrence) return i;
                    count++;
                }
            }
            return -1;
        }

        test('AtSortReport(\'Config1\', \'ReRun1\') — two literal_string', () => {
            const src = [
                "  PROGRAM",
                "  CODE",
                "  AtSortReport('Config1', 'ReRun1')"
            ].join('\n');
            const tokens = tokenize(src);
            const idx = findCallNameIdx(tokens, 'AtSortReport');
            assert.ok(idx >= 0, 'tokenizer must produce AtSortReport token');
            const result = classifier.classifyArguments(tokens, idx)!;
            assert.ok(result, 'classifier must locate the arg list');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].kind, 'literal_string');
            assert.strictEqual(result[1].kind, 'literal_string');
        });

        test('AtSortReport(12345) — single literal_numeric', () => {
            const src = [
                "  PROGRAM",
                "  CODE",
                "  AtSortReport(12345)"
            ].join('\n');
            const tokens = tokenize(src);
            const idx = findCallNameIdx(tokens, 'AtSortReport');
            const result = classifier.classifyArguments(tokens, idx)!;
            assert.ok(result);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].kind, 'literal_numeric');
            assert.strictEqual(result[0].inferredType, 'LONG');
        });

        test('inst.Append(\'x\') — dotted-method call, single literal_string', () => {
            // Tokenizer produces "inst.Append" as a single StructureField token,
            // not separate Variable/./Variable. The classifier should walk forward
            // from that token's index, find the (...), and classify the args.
            const src = [
                "  MEMBER('test')",
                "MainProc PROCEDURE",
                "inst       MyClass",
                "  CODE",
                "  inst.Append('x')"
            ].join('\n');
            const tokens = tokenize(src);
            const callLine = 4;
            const callNameIdx = tokens.findIndex(t =>
                t.line === callLine && t.type === TokenType.StructureField && /\.append$/i.test(t.value));
            assert.ok(callNameIdx >= 0,
                `tokenizer must produce a StructureField ending in .Append on call line — got tokens: ${
                    tokens.filter(t => t.line === callLine).map(t => `${TokenType[t.type]}("${t.value}")`).join(', ')
                }`);
            const result = classifier.classifyArguments(tokens, callNameIdx)!;
            assert.ok(result, 'classifier must classify a call when name is StructureField (dotted) form');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].kind, 'literal_string');
            assert.strictEqual(result[0].inferredType, 'STRING');
        });

        test('zero-arg call Foo() → empty array', () => {
            const src = [
                "  PROGRAM",
                "  CODE",
                "  Foo()"
            ].join('\n');
            const tokens = tokenize(src);
            const idx = findCallNameIdx(tokens, 'Foo');
            const result = classifier.classifyArguments(tokens, idx);
            assert.deepStrictEqual(result, [], 'empty parens should yield empty arg array');
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // (C) Slice-expression inference — RED pin for #181 item 3
    //     (SetValue overload over-count, task 32b59484)
    // ───────────────────────────────────────────────────────────────────────
    //
    // BUG: a substring-slice argument such as `blobField[0:128]` currently
    // falls into the 'unknown' bucket (no slice handling in classifyMultiToken),
    // leaving inferredType undefined → the overload resolver's conservative
    // match-all path counts the call toward EVERY SetValue overload, including
    // the class-typed SetValue(StringTheory). Over-count.
    //
    // CONTRACT (Bob-locked 2026-06-22): the discriminator is BASE-TYPE resolution
    // (string-typed base → any index/slice of it yields STRING), NOT bracket-
    // content shape — Phase A proved the tokenizer collapses `ident:ident` slices
    // (`someStringField[a:b]`) into a single StructurePrefix token, byte-identical
    // to a prefix array-subscript `arr[LOC:I]`, so colon-presence alone cannot
    // tell them apart. A standalone Delimiter(':') (numeric slices `[0:128]`)
    // remains as a secondary fallback when the base cannot be resolved.
    //
    // Post-fix expectation (this whole suite is RED until Eve's GREEN):
    //   - `<stringBase>[ ... ]`  → inferredType === 'STRING'   (both [0:128] and [a:b])
    //   - `<nonStringBase>[i]`   → NOT retyped to STRING        (non-X regression guard)
    //   - `<unresolvedBase>[0:128]` (standalone colon) → 'STRING' via fallback
    suite('slice-expr inference (#181 item 3 — base-type discriminator)', () => {

        function tokenize(source: string): Token[] {
            const doc = TextDocument.create('file:///slice.clw', 'clarion', 1, source);
            return new ClarionTokenizer(doc.getText()).tokenize();
        }

        /** Classify the single argument of the first call to `name` in `src`. */
        function classifyFirstArg(src: string, name: string, ctx?: ClassifierContext): ArgClassification {
            const full = ["  PROGRAM", "  CODE", "  " + src].join('\n');
            const tokens = tokenize(full);
            let idx = -1;
            for (let i = 0; i < tokens.length; i++) {
                const v = tokens[i].value.toLowerCase();
                if (v === name.toLowerCase() || v.endsWith('.' + name.toLowerCase())) { idx = i; break; }
            }
            assert.ok(idx >= 0, `tokenizer must produce a '${name}' call token for: ${src}`);
            const args = classifier.classifyArguments(tokens, idx, ctx)!;
            assert.ok(args && args.length === 1,
                `expected exactly one classified arg for: ${src}; got ${args ? args.length : 'null'}`);
            return args[0];
        }

        // Resolver: string-typed for the named string fields, non-string for arrays.
        const stringBases = new Set(['blobfield', 'somestringfield', 'svalue', 'buf']);
        const ctx: ClassifierContext = {
            resolveSymbolType: (name) => {
                const n = name.toLowerCase();
                if (stringBases.has(n)) return 'STRING';
                if (n === 'arr') return 'LONG';   // array of LONG — non-string element
                return undefined;
            }
        };

        test('numeric slice — blobField[0:128] with STRING base → inferredType STRING', () => {
            const a = classifyFirstArg("Foo(blobField[0:128])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `substring slice of a STRING base must infer STRING; got kind='${a.kind}' inferredType='${a.inferredType}'. ` +
                `Pre-fix: slice falls to 'unknown'/undefined → conservative match-all over-counts SetValue(StringTheory).`);
        });

        test('var:var slice — someStringField[a:b] (StructurePrefix-collapsed) with STRING base → inferredType STRING', () => {
            // Phase A: `a:b` collapses to a single StructurePrefix token, so this
            // slice is byte-identical to a prefix array-subscript at the token
            // level. Base-type resolution is the only signal that disambiguates.
            const a = classifyFirstArg("Foo(someStringField[a:b])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `ident:ident substring slice of a STRING base must infer STRING; got kind='${a.kind}' inferredType='${a.inferredType}'. ` +
                `colon-presence alone cannot catch this (StructurePrefix collapse) — base-type discriminator must.`);
        });

        test('non-X regression guard — arr[i] with non-string base must NOT be retyped to STRING', () => {
            // Single subscript of a non-string array. Indexing it yields the
            // element type (LONG here), never STRING. The fix must leave this
            // alone (un-retyped) so it does not get force-counted toward a
            // STRING overload.
            const a = classifyFirstArg("Foo(arr[i])", 'Foo', ctx);
            assert.notStrictEqual(a.inferredType, 'STRING',
                `array-element access on a non-string base must NOT be retyped to STRING; got inferredType='${a.inferredType}'. ` +
                `This is the non-X sentinel: the slice fix must key on base type, not 'has brackets'.`);
        });

        test('standalone-colon fallback — blobField[0:128] with UNRESOLVED base → STRING via colon signal', () => {
            // When the base cannot be resolved, a standalone Delimiter(':') inside
            // the brackets is an almost-certain string slice — secondary fallback.
            const noResolver: ClassifierContext = { resolveSymbolType: () => undefined };
            const a = classifyFirstArg("Foo(blobField[0:128])", 'Foo', noResolver);
            assert.strictEqual(a.inferredType, 'STRING',
                `standalone-colon numeric slice must infer STRING even when base is unresolved; got inferredType='${a.inferredType}'.`);
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // (D) Slice-expression inference — dotted + prefixed bases (#192 / e0988953)
    //     Follow-up to #181 item 3: widen the bare-variable slice discriminator
    //     to dotted (SELF.field[a:b]) and prefixed (PRE:Field[a:b]) bases.
    // ───────────────────────────────────────────────────────────────────────
    //
    // BUG (pre-fix): looksLikeSliceAccess hard-gates base.type===TokenType.Variable,
    // so a slice whose base is dotted or prefixed never reaches the STRING-inference
    // path → it falls to the 'unknown' bucket (inferredType undefined) → the overload
    // resolver's conservative match-all over-counts the call toward SetValue(StringTheory).
    //
    // PHASE A (empirical, real ClarionTokenizer) — token shapes for `Foo(<expr>)`:
    //   - DOTTED   SELF.field[a:b]  → StructureField("SELF.field") [ StructurePrefix("a:b") ]
    //                                 base is a SINGLE StructureField token, '[' at idx 1.
    //   - DOTTED   SELF.field[0:128]→ StructureField("SELF.field") [ Number : Number ]
    //   - DOTTED   SELF.field[i]    → StructureField("SELF.field") [ Variable("i") ]
    //   - PREFIXED PRE:Field[a:b]   → Attribute("PRE") Delimiter(":") Variable("Field") [ ... ]
    //                                 base spans 3 tokens, '[' at idx 3.
    //
    // EXTRACTION CONTRACT (decided in Phase A — for Eve's item-4 GREEN):
    //   - base name = ONLY the tokens before '['. Dotted → first.value ("SELF.field");
    //     prefixed → join significant[0..2] ("PRE:Field"). joinDotPath over the FULL
    //     significant array is UNSAFE — it sweeps an index Variable("i") into the name
    //     (→ "SELF.fieldi"); test `SELF.field[i]` below pins that the index is excluded.
    //
    // Resolver is a stub here (unit isolation): the FAR-integration coverage that exercises
    // the real var-type index lives in ReferencesProvider.SliceArgDottedPrefixed*.test.ts.
    // NOTE: prefixed base-type resolution is a real-index gap (PRE-group fields are keyed
    // by bare label "field", not "pre:field") — these unit tests prove the CLASSIFIER
    // extraction contract independent of that; the prefixed FAR pin is gated on a
    // resolver decision (see task e0988953 continuation notes, fork A/B).
    suite('slice-expr inference — dotted + prefixed bases (#192)', () => {

        function tokenize(source: string): Token[] {
            const doc = TextDocument.create('file:///slice192.clw', 'clarion', 1, source);
            return new ClarionTokenizer(doc.getText()).tokenize();
        }

        /** Classify the single argument of the first call to `name` in `src`. */
        function classifyFirstArg(src: string, name: string, ctx?: ClassifierContext): ArgClassification {
            const full = ["  PROGRAM", "  CODE", "  " + src].join('\n');
            const tokens = tokenize(full);
            let idx = -1;
            for (let i = 0; i < tokens.length; i++) {
                const v = tokens[i].value.toLowerCase();
                if (v === name.toLowerCase() || v.endsWith('.' + name.toLowerCase())) { idx = i; break; }
            }
            assert.ok(idx >= 0, `tokenizer must produce a '${name}' call token for: ${src}`);
            const args = classifier.classifyArguments(tokens, idx, ctx)!;
            assert.ok(args && args.length === 1,
                `expected exactly one classified arg for: ${src}; got ${args ? args.length : 'null'}`);
            return args[0];
        }

        // Resolver stub: dotted string class field + prefixed string group field are STRING;
        // their non-string siblings are LONG; everything else unresolved.
        const ctx: ClassifierContext = {
            resolveSymbolType: (name) => {
                const n = name.toLowerCase();
                if (n === 'self.field' || n === 'pre:field') return 'STRING';
                if (n === 'self.longfield' || n === 'pre:longfield') return 'LONG';
                return undefined;
            }
        };

        // ── item 1: dotted base ────────────────────────────────────────────
        test('dotted var:var — SELF.field[a:b] with STRING base → inferredType STRING', () => {
            const a = classifyFirstArg("Foo(SELF.field[a:b])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `dotted ident:ident substring slice of a STRING base must infer STRING; got kind='${a.kind}' inferredType='${a.inferredType}'. ` +
                `Pre-fix: base is a single StructureField token → looksLikeSliceAccess (Variable-only gate) rejects → 'unknown'.`);
        });

        test('dotted single-subscript — SELF.field[i] with STRING base → STRING (pins base = tokens before "[" only)', () => {
            // Index `i` is a Variable token; if base extraction sweeps the full
            // significant array (e.g. joinDotPath) it becomes "SELF.fieldi" → resolver
            // miss → wrong. Correct extraction stops at '[' → "SELF.field" → STRING.
            const a = classifyFirstArg("Foo(SELF.field[i])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `string-base single-subscript must infer STRING and must NOT sweep the index var into the base name; ` +
                `got kind='${a.kind}' inferredType='${a.inferredType}'.`);
        });

        test('dotted numeric slice — SELF.field[0:128] with STRING base → STRING', () => {
            const a = classifyFirstArg("Foo(SELF.field[0:128])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `dotted numeric substring slice of a STRING base must infer STRING; got kind='${a.kind}' inferredType='${a.inferredType}'.`);
        });

        // ── item 2: prefixed base ──────────────────────────────────────────
        test('prefixed var:var — PRE:Field[a:b] with STRING base → inferredType STRING', () => {
            const a = classifyFirstArg("Foo(PRE:Field[a:b])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `prefixed ident:ident substring slice of a STRING base must infer STRING; got kind='${a.kind}' inferredType='${a.inferredType}'. ` +
                `Pre-fix: base spans 3 tokens [Attribute(':')Variable], first is Attribute not Variable → no path matches → 'unknown'.`);
        });

        test('prefixed numeric slice — PRE:Field[0:128] with STRING base → STRING', () => {
            const a = classifyFirstArg("Foo(PRE:Field[0:128])", 'Foo', ctx);
            assert.strictEqual(a.inferredType, 'STRING',
                `prefixed numeric substring slice of a STRING base must infer STRING (via base-type resolution, not the colon fallback); ` +
                `got kind='${a.kind}' inferredType='${a.inferredType}'.`);
        });

        // ── item 3: non-X regression sentinels ─────────────────────────────
        test('non-X sentinel — dotted NON-string base SELF.longField[i] must NOT be retyped to STRING', () => {
            const a = classifyFirstArg("Foo(SELF.longField[i])", 'Foo', ctx);
            assert.notStrictEqual(a.inferredType, 'STRING',
                `array/element access on a non-string dotted base must NOT be retyped to STRING; got inferredType='${a.inferredType}'. ` +
                `The fix must key on base type, not 'has dotted base + brackets'.`);
        });

        test('non-X sentinel — prefixed NON-string base PRE:LongField[i] must NOT be retyped to STRING', () => {
            const a = classifyFirstArg("Foo(PRE:LongField[i])", 'Foo', ctx);
            assert.notStrictEqual(a.inferredType, 'STRING',
                `array/element access on a non-string prefixed base must NOT be retyped to STRING; got inferredType='${a.inferredType}'.`);
        });
    });
});
