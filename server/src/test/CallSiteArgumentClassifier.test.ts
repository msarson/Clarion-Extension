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
});
