import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { PatternMatcher } from '../tokenizer/PatternMatcher';

/**
 * `PatternMatcher.getCharClass` returns 'whitespace' for ' ' and '\t', but
 * `charClassGroups` had no 'whitespace' entry — so the lookup in
 * `ClarionTokenizer.tokenizeLines` fell back to "test every pattern". That
 * fallback silently compensated for a second gap: TokenType.EndStatement was
 * listed in the 'upper' group but not in 'lower'.
 *
 * So an INDENTED lowercase `end` only tokenized correctly because the
 * whitespace fallback matched EndStatement's /^\s*(END)\b/ alternative at the
 * space BEFORE it, while a column-0 lowercase `end` — where there is no
 * preceding whitespace to match at — had no pattern that would accept it and
 * lost its leading 'e' to the single-character fallback advance, surfacing as
 * Variable 'nd'.
 *
 * These pin both halves: lowercase `end` is an EndStatement wherever it
 * appears, and the 'whitespace' class exists so the fallback can never quietly
 * paper over a missing entry again.
 */

function endTokens(src: string) {
    return new ClarionTokenizer(src).tokenize()
        .filter(t => t.line === 2);
}

suite('ClarionTokenizer — lowercase END and the whitespace char class', () => {

    test('column-0 lowercase `end` is an EndStatement, not Variable "nd"', () => {
        const toks = endTokens('MyQ  QUEUE\nF      LONG\nend\n');
        assert.deepStrictEqual(
            toks.map(t => [TokenType[t.type], t.value]),
            [['EndStatement', 'end']],
            'a column-0 lowercase `end` must not lose its leading character'
        );
    });

    test('column-0 uppercase `END` is an EndStatement', () => {
        const toks = endTokens('MyQ  QUEUE\nF      LONG\nEND\n');
        assert.deepStrictEqual(toks.map(t => [TokenType[t.type], t.value]), [['EndStatement', 'END']]);
    });

    test('indented lowercase `end` is still an EndStatement', () => {
        const toks = endTokens('MyQ  QUEUE\nF      LONG\n        end\n');
        assert.deepStrictEqual(toks.map(t => [TokenType[t.type], t.value]), [['EndStatement', 'end']]);
    });

    test("EndStatement is present in BOTH the 'upper' and 'lower' char classes", () => {
        const byClass = PatternMatcher.getPatternsByCharClass();
        assert.ok(byClass.get('upper')!.includes(TokenType.EndStatement), "missing from 'upper'");
        assert.ok(byClass.get('lower')!.includes(TokenType.EndStatement), "missing from 'lower'");
    });

    test("a 'whitespace' char class is defined, so the lookup never falls back to all patterns", () => {
        const byClass = PatternMatcher.getPatternsByCharClass();
        assert.notStrictEqual(
            byClass.get('whitespace'), undefined,
            "getCharClass returns 'whitespace'; without a group the lexer tests every pattern at every space"
        );
    });
});
