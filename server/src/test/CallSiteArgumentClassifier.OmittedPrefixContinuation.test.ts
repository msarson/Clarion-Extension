import * as assert from 'assert';
import { TokenType } from '../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier, ClassifierContext } from '../utils/CallSiteArgumentClassifier';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * #250 — three classifier bugs, each corrupting classification for common,
 * valid Clarion syntax (real-tokenizer fixtures throughout):
 *
 *   1. OMITTED arguments (`GET(Q,,3)`, `F(a,)`, `F(,a)`) were silently dropped
 *      from the slice list — the arg count shrank and every following argument
 *      shifted position, so per-position overload type-checks compared the wrong
 *      pairs. Omitted args are core Clarion (omittable `<param>`s).
 *
 *   2. A plain `PRE:Field` argument whose prefix collides with a keyword
 *      (`PRE`, `NAME`, `MAX`, …) tokenizes as Attribute ':' Variable — the
 *      prefix-namespace branch only accepted Variable-headed slices, so the
 *      argument fell through to 'unknown' and the resolver was never consulted.
 *      (The slice form `PRE:Field[a:b]` was fixed for this in #192/#193; the
 *      plain form was missed.)
 *
 *   3. A `|` line-continuation token inside an argument list was swept into the
 *      following argument's slice, corrupting its kind ('unknown') and rawText
 *      (leading '|'). Multi-line wrapped calls are standard Clarion formatting.
 */
suite('CallSiteArgumentClassifier — omitted args / PRE: prefix / | continuation (#250)', () => {

    let classifier: CallSiteArgumentClassifier;

    setup(() => {
        classifier = new CallSiteArgumentClassifier();
    });

    /** Tokenize a code fragment and locate the call-name token by value. */
    function tokensAndCallIdx(code: string, callName: string) {
        const tokens = new ClarionTokenizer(code).tokenize();
        const callNameIdx = tokens.findIndex(t => t.value.toUpperCase() === callName.toUpperCase());
        assert.ok(callNameIdx >= 0, `call name ${callName} not found in token stream`);
        return { tokens, callNameIdx };
    }

    // ── 1. Omitted arguments keep their position ──────────────────────────

    test('GET(Q,,3): middle omitted arg is REPRESENTED — 3 args, "3" stays at position 2', () => {
        const { tokens, callNameIdx } = tokensAndCallIdx('  Foo(Q,,3)', 'Foo');
        const args = classifier.classifyArguments(tokens, callNameIdx);
        assert.ok(args, 'expected an argument list');
        assert.strictEqual(args!.length, 3,
            `expected 3 args (incl. omitted middle), got ${args!.length}: [${args!.map(a => a.rawText).join('|')}]`);
        assert.strictEqual(args![1].rawText, '', 'position 1 should be the omitted arg');
        assert.strictEqual(args![2].kind, 'literal_numeric', 'position 2 should be the numeric literal 3');
        assert.strictEqual(args![2].rawText, '3');
    });

    test('F(a,): trailing omitted arg is represented — 2 args', () => {
        const { tokens, callNameIdx } = tokensAndCallIdx('  Foo(a,)', 'Foo');
        const args = classifier.classifyArguments(tokens, callNameIdx);
        assert.ok(args);
        assert.strictEqual(args!.length, 2,
            `expected 2 args (a + trailing omitted), got ${args!.length}`);
        assert.strictEqual(args![0].rawText, 'a');
        assert.strictEqual(args![1].rawText, '', 'position 1 should be the omitted trailing arg');
    });

    test('F(,a): leading omitted arg is represented — 2 args, "a" at position 1', () => {
        const { tokens, callNameIdx } = tokensAndCallIdx('  Foo(,a)', 'Foo');
        const args = classifier.classifyArguments(tokens, callNameIdx);
        assert.ok(args);
        assert.strictEqual(args!.length, 2,
            `expected 2 args (leading omitted + a), got ${args!.length}`);
        assert.strictEqual(args![0].rawText, '', 'position 0 should be the omitted leading arg');
        assert.strictEqual(args![1].rawText, 'a', 'a should be at position 1, not shifted to 0');
    });

    test('regression guard: Foo() still classifies as zero args', () => {
        const { tokens, callNameIdx } = tokensAndCallIdx('  Foo()', 'Foo');
        const args = classifier.classifyArguments(tokens, callNameIdx);
        assert.ok(args);
        assert.strictEqual(args!.length, 0, 'zero-arg call must stay an empty array');
    });

    test('regression guard: Foo(a,b) unchanged — 2 args, no phantom omissions', () => {
        const { tokens, callNameIdx } = tokensAndCallIdx('  Foo(a,b)', 'Foo');
        const args = classifier.classifyArguments(tokens, callNameIdx);
        assert.ok(args);
        assert.strictEqual(args!.length, 2);
        assert.strictEqual(args![0].rawText, 'a');
        assert.strictEqual(args![1].rawText, 'b');
    });

    // ── 2. Plain PRE:Field argument (keyword-colliding prefix → Attribute head) ──

    test('Foo(PRE:Field): classifies prefixed_var and consults the resolver', () => {
        const { tokens, callNameIdx } = tokensAndCallIdx('  Foo(PRE:Field)', 'Foo');

        // Precondition — this fixture only pins the bug if PRE really tokenizes
        // as a keyword-colliding Attribute head (the #193 asymmetry).
        const preTok = tokens.find(t => t.value.toUpperCase() === 'PRE');
        assert.ok(preTok, 'PRE token present');
        assert.strictEqual(preTok!.type, TokenType.Attribute,
            'fixture precondition: PRE must tokenize as Attribute (keyword-colliding prefix)');

        const resolved: string[] = [];
        const ctx: ClassifierContext = {
            resolveSymbolType: (name) => { resolved.push(name); return 'CUSTGROUP'; }
        };
        const args = classifier.classifyArguments(tokens, callNameIdx, ctx);
        assert.ok(args && args.length === 1);
        assert.strictEqual(args![0].kind, 'prefixed_var',
            `expected prefixed_var, got ${args![0].kind} — Attribute-headed prefix falls through to unknown`);
        assert.ok(resolved.includes('PRE:Field'),
            `resolver should be consulted with "PRE:Field"; calls: [${resolved.join(', ')}]`);
        assert.strictEqual(args![0].inferredType, 'CUSTGROUP');
    });

    // ── 3. | line-continuation inside an argument list ────────────────────

    test('wrapped call: arg after | continuation classifies cleanly (no stray |)', () => {
        const code = '  MyFunc(a, b, |\n    c, d)';
        const { tokens, callNameIdx } = tokensAndCallIdx(code, 'MyFunc');
        const args = classifier.classifyArguments(tokens, callNameIdx);
        assert.ok(args, 'expected an argument list');
        assert.strictEqual(args!.length, 4,
            `expected 4 args, got ${args!.length}: [${args!.map(a => a.rawText).join('|')}]`);
        assert.strictEqual(args![2].kind, 'variable',
            `arg after | should classify as variable, got ${args![2].kind}`);
        assert.strictEqual(args![2].rawText, 'c',
            `arg after | should have clean rawText 'c', got '${args![2].rawText}'`);
        assert.strictEqual(args![3].rawText, 'd');
    });
});
