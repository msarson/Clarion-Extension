import * as assert from 'assert';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier, ArgClassification } from '../utils/CallSiteArgumentClassifier';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * Issue #241 — a Clarion implicit variable (undeclared, named by a type-suffix) passed as a
 * call argument must be classified by the type its suffix implies, not left as `unknown`.
 * Otherwise overload resolution falls back to conservative match-all and hover/go-to-definition
 * pick the wrong overload.
 *
 *   #  → implicit LONG        $  → implicit REAL        "  → implicit STRING(32)
 *
 * Unlike an EQUATE (#240, a constant → literal), an implicit variable is a real addressable
 * variable → it stays `kind:'variable'` (can bind the base type OR a `*TYPE` ref parameter).
 */
suite('CallSiteArgumentClassifier — implicit variables (#241)', () => {
    let classifier: CallSiteArgumentClassifier;
    setup(() => { classifier = new CallSiteArgumentClassifier(); });

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

    function firstArgsOf(src: string, callName = 'Foo'): ArgClassification[] {
        const tokens = new ClarionTokenizer(src).tokenize();
        return callIndices(tokens, callName).map(idx => {
            const args = classifier.classifyArguments(tokens, idx);
            assert.ok(args && args.length === 1, `expected 1 arg for call at token ${idx}`);
            return args![0];
        });
    }

    // Counter# (LONG), Percent$ (REAL), Address" (STRING)
    const SRC = `MyProc PROCEDURE
  CODE
  Foo(Counter#)
  Foo(Percent$)
  Foo(Address")
`;

    test('# suffix → variable inferred LONG', () => {
        const a = firstArgsOf(SRC)[0];
        assert.strictEqual(a.kind, 'variable');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('$ suffix → variable inferred REAL', () => {
        const a = firstArgsOf(SRC)[1];
        assert.strictEqual(a.kind, 'variable');
        assert.strictEqual(a.inferredType, 'REAL');
    });

    test('" suffix → variable inferred STRING', () => {
        const a = firstArgsOf(SRC)[2];
        assert.strictEqual(a.kind, 'variable');
        assert.strictEqual(a.inferredType, 'STRING');
    });

    suite('overload selection (classifier + resolver, no ctx)', () => {
        const CANDIDATES = ['PROCEDURE(LONG value)', 'PROCEDURE(STRING value)'];
        function pickOverload(src: string, callName: string) {
            const tokens = new ClarionTokenizer(src).tokenize();
            const idx = callIndices(tokens, callName)[0];
            const args = classifier.classifyArguments(tokens, idx);
            assert.ok(args, 'call args should classify');
            return new MethodOverloadResolver().findOverloadByArgClassifications(args!, CANDIDATES);
        }

        test('implicit LONG (#) selects the LONG overload (not match-all)', () => {
            const r = pickOverload(`MyProc PROCEDURE
  CODE
  Set(Counter#)
`, 'Set');
            assert.strictEqual(r.matchedAll, false);
            assert.strictEqual(r.matchedIndex, 0);
        });

        test('implicit STRING (") selects the STRING overload', () => {
            const r = pickOverload(`MyProc PROCEDURE
  CODE
  Set(Address")
`, 'Set');
            assert.strictEqual(r.matchedAll, false);
            assert.strictEqual(r.matchedIndex, 1);
        });
    });
});
