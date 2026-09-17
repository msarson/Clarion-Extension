import * as assert from 'assert';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * #580 — `isInsideParamsOrTemplate` (#415) counted every `<` as an optional-parameter bracket and
 * every `>` as its close, so a comparison left a bracket "open" and a later structure keyword on the
 * line was demoted to a plain keyword: in `IF P<2 THEN x=1. ; IF P THEN c=2.` only the first IF was a
 * structure (Clarion 10 libsrc CBWndPreview.clw lines 4293 and 5027). A `<` only opens an optional
 * parameter where a parameter can start, and a `>` only closes one where a parameter can end.
 */
const tokensOn = (lines: string[], line: number): Token[] =>
    new ClarionTokenizer(lines.join('\r\n')).tokenize().filter(t => t.line === line);
const kinds = (tokens: Token[], word: string) =>
    tokens.filter(t => t.value.toUpperCase() === word).map(t => TokenType[t.type]);

suite('A comparison does not hide a structure keyword later on the line (#580)', () => {
    const inCode = (statement: string) => tokensOn(['P PROCEDURE', '  CODE', `  ${statement}`, '  RETURN'], 2);

    test('less-than before a second one-line IF', () => {
        assert.deepStrictEqual(kinds(inCode('IF P<2 THEN x=1. ; IF P THEN c=2.'), 'IF'), ['Structure', 'Structure']);
    });

    test('the CBWndPreview.clw 4293 line', () => {
        assert.deepStrictEqual(kinds(inCode('IF M1<M2 THEN M1=M2. ; IF M1<M3 THEN M1=M3. ; IF M1<M4 THEN M1=M4. ; RETURN M1'), 'IF'),
            ['Structure', 'Structure', 'Structure']);
    });

    test('greater-than, not-equal and the two-character comparisons', () => {
        assert.deepStrictEqual(kinds(inCode('IF a > b THEN LOOP ; BREAK ; END'), 'LOOP'), ['Structure']);
        assert.deepStrictEqual(kinds(inCode('IF a <> b THEN x=1. ; IF c >= d THEN y=1. ; IF e <= f THEN z=1.'), 'IF'),
            ['Structure', 'Structure', 'Structure']);
        assert.deepStrictEqual(kinds(inCode("IF x > 0 AND CHOOSE(a<b,1,2) THEN y=1. ; CASE z ; OF 1 ; END"), 'CASE'), ['Structure']);
    });

    test('guard: a structure keyword used as an optional parameter type is not a structure', () => {
        const noStructure = (lines: string[], line: number) =>
            assert.deepStrictEqual(tokensOn(lines, line).filter(t => t.type === TokenType.Structure).map(t => t.value), [], lines[line]);
        noStructure(['  MAP', 'A PROCEDURE(<*QUEUE q>)', '  END'], 1);
        noStructure(['  MAP', 'B PROCEDURE(LONG a, <FILE f>, <KEY k>)', '  END'], 1);
        noStructure(['  MAP', 'C PROCEDURE(LONG a, |', '           <QUEUE q>)', '  END'], 2);
        noStructure(['  MAP', 'D PROCEDURE(LONG a, |', '           <GROUP g>, <QUEUE q>)', '  END'], 2);
        noStructure(['P PROCEDURE', '  CODE', '  x = CALLIT(a, <QUEUE>)', '  RETURN'], 2);
    });
});
