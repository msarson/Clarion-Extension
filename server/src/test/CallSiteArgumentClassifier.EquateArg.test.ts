import * as assert from 'assert';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier, ArgClassification } from '../utils/CallSiteArgumentClassifier';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * Issue #240 — an EQUATE constant passed as a call argument must be classified by the
 * literal shape of its VALUE (numeric / string / picture), not left as an untyped
 * `variable`. Otherwise overload resolution falls back to conservative match-all and
 * hover/go-to-definition pick the wrong overload.
 *
 * Uses the real ClarionTokenizer so `Token.dataType='EQUATE'` / `Token.dataValue` are
 * populated (that is where the value lives), and importantly classifies WITHOUT a ctx —
 * the hover/def path has no resolver, so inference must come from the token stream.
 */
suite('CallSiteArgumentClassifier — EQUATE arguments (#240)', () => {
    let classifier: CallSiteArgumentClassifier;
    setup(() => { classifier = new CallSiteArgumentClassifier(); });

    // Returns the call-name token indices for `name`, in source order.
    function callIndices(tokens: Token[], name: string): number[] {
        const out: number[] = [];
        const upper = name.toUpperCase();
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value.toUpperCase() !== upper) continue;
            let j = i + 1;
            while (j < tokens.length && tokens[j].line === tokens[i].line && tokens[j].type === TokenType.Comment) j++;
            if (j < tokens.length && tokens[j].type === TokenType.Delimiter && tokens[j].value === '(') out.push(i);
        }
        return out;
    }

    // Classify the single argument of every `Foo(...)` call, in source order.
    function firstArgsOf(src: string, callName = 'Foo'): ArgClassification[] {
        const tokens = new ClarionTokenizer(src).tokenize();
        return callIndices(tokens, callName).map(idx => {
            const args = classifier.classifyArguments(tokens, idx);
            assert.ok(args && args.length === 1, `expected 1 arg for call at token ${idx}`);
            return args![0];
        });
    }

    const SRC = `  PROGRAM
  MAP
  END

MaxRows    EQUATE(100)
Pie        EQUATE(3.14)
Greeting   EQUATE('hello')
SsnPic     EQUATE(@P###-##-####P)
AliasOn    EQUATE(MaxRows)

  CODE
  Foo(MaxRows)
  Foo(Pie)
  Foo(Greeting)
  Foo(SsnPic)
  Foo(AliasOn)
`;

    test('numeric EQUATE → literal_numeric LONG', () => {
        const a = firstArgsOf(SRC)[0];
        assert.strictEqual(a.kind, 'literal_numeric');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('fractional EQUATE → literal_numeric REAL', () => {
        const a = firstArgsOf(SRC)[1];
        assert.strictEqual(a.kind, 'literal_numeric');
        assert.strictEqual(a.inferredType, 'REAL');
    });

    test('string EQUATE → literal_string STRING', () => {
        const a = firstArgsOf(SRC)[2];
        assert.strictEqual(a.kind, 'literal_string');
        assert.strictEqual(a.inferredType, 'STRING');
    });

    test('picture EQUATE → literal_picture STRING', () => {
        const a = firstArgsOf(SRC)[3];
        assert.strictEqual(a.kind, 'literal_picture');
        assert.strictEqual(a.inferredType, 'STRING');
    });

    test('alias EQUATE resolves transitively to the aliased constant type', () => {
        const a = firstArgsOf(SRC)[4];
        assert.strictEqual(a.kind, 'literal_numeric');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('a plain (non-EQUATE) variable is still classified as variable', () => {
        const src = `MyProc PROCEDURE
Local   LONG
  CODE
  Foo(Local)
`;
        const a = firstArgsOf(src)[0];
        assert.strictEqual(a.kind, 'variable', 'non-EQUATE identifier must not be re-bucketed as a literal');
    });

    // End-to-end: classifier → overload resolver. This is the actual hover/go-to-definition
    // path (which runs with NO ctx), proving the reported symptom is fixed — the correct
    // overload is chosen instead of the conservative match-all fallback.
    suite('overload selection (classifier + resolver, no ctx)', () => {
        const CANDIDATES = ['PROCEDURE(LONG value)', 'PROCEDURE(STRING value)'];

        function pickOverload(src: string, callName: string) {
            const tokens = new ClarionTokenizer(src).tokenize();
            const idx = callIndices(tokens, callName)[0];
            const args = classifier.classifyArguments(tokens, idx);
            assert.ok(args, 'call args should classify');
            return new MethodOverloadResolver().findOverloadByArgClassifications(args!, CANDIDATES);
        }

        test('numeric EQUATE arg selects the LONG overload (not match-all)', () => {
            const r = pickOverload(`  PROGRAM
  MAP
  END

MaxRows  EQUATE(100)
  CODE
  Set(MaxRows)
`, 'Set');
            assert.strictEqual(r.matchedAll, false, 'must not fall back to conservative match-all');
            assert.strictEqual(r.matchedIndex, 0, 'numeric EQUATE resolves to the LONG overload');
        });

        test('string EQUATE arg selects the STRING overload', () => {
            const r = pickOverload(`  PROGRAM
  MAP
  END

Greeting  EQUATE('hi')
  CODE
  Set(Greeting)
`, 'Set');
            assert.strictEqual(r.matchedAll, false, 'must not fall back to conservative match-all');
            assert.strictEqual(r.matchedIndex, 1, 'string EQUATE resolves to the STRING overload');
        });
    });
});
