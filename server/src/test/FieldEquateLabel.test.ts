import * as assert from 'assert';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';

function tokenize(source: string): Token[] {
    return new ClarionTokenizer(source).tokenize();
}

function fieldEquateTokens(tokens: Token[]): Token[] {
    return tokens.filter(t => t.type === TokenType.FieldEquateLabel);
}

suite('Tokenizer — FieldEquateLabel', () => {

    test('regression: ?Identifier is still a FieldEquateLabel', () => {
        const code = `Win WINDOW
       BUTTON('OK'),AT(120,160),USE(?MyOk)
     END`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        assert.ok(labels.some(t => t.value === '?MyOk'),
            `expected to find ?MyOk among FieldEquateLabel tokens. Got values: ${labels.map(t => t.value).join(',')}`);
    });

    test('bare ? inside USE() is a FieldEquateLabel', () => {
        const code = `Win WINDOW
       BUTTON('OK'),AT(120,160),USE(?)
     END`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        assert.ok(labels.some(t => t.value === '?'),
            `expected bare ? to be a FieldEquateLabel. Got values: ${labels.map(t => t.value).join(',')}`);
    });

    test('mix of named and bare USE() in the same window — both produce FieldEquateLabel tokens', () => {
        const code = `Win WINDOW
       BUTTON('OK'),AT(120,160),USE(?BtnOk)
       BUTTON('Cancel'),AT(200,160),USE(?)
       LIST,AT(20,40),USE(?ListBox)
     END`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        const values = labels.map(t => t.value).sort();
        // Expect at least: ?, ?BtnOk, ?ListBox
        assert.ok(values.includes('?'),         `expected bare ?,  got: ${values.join(',')}`);
        assert.ok(values.includes('?BtnOk'),    `expected ?BtnOk, got: ${values.join(',')}`);
        assert.ok(values.includes('?ListBox'),  `expected ?ListBox, got: ${values.join(',')}`);
    });

    test('? inside a string literal is NOT a FieldEquateLabel', () => {
        // The String pattern wins; the ? sits inside the string and never reaches
        // the FieldEquateLabel matcher.
        const code = `MyProc PROCEDURE
CODE
  Trace('hello ? world')
  RETURN`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        assert.strictEqual(labels.length, 0,
            `unexpected FieldEquateLabel(s) inside a string literal: ${labels.map(t => t.value).join(',')}`);
    });

    test('? followed immediately by an identifier consumes the whole token (no split)', () => {
        const code = `Win WINDOW
       USE(?Hello)
     END`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        assert.strictEqual(labels.length, 1);
        assert.strictEqual(labels[0].value, '?Hello',
            `expected greedy match of ?Hello (not bare ? + Hello). Got: ${labels[0].value}`);
    });

    // #174 — compound `?Prefix:Suffix` field equates must tokenize as ONE token.
    // Pre-fix, the suffix was split off and re-classified (as TokenType.Attribute
    // when the suffix happened to match an attribute-keyword like EXTERNAL/HIDE/TRN),
    // driving the `AttributeDiagnostics` false positive Mark surfaced from
    // `Frame_AcctsMap.clw:816`. The Label pattern at TokenPatterns.ts:89 already
    // includes `:` in its character class; FieldEquateLabel was the outlier — now
    // symmetric.
    test('#174 — ?Prefix:Suffix is a single FieldEquateLabel token (no split on colon)', () => {
        const code = `Win WINDOW
       STRING('Foo'),AT(10,10,50,14),USE(?SL_Clients:External)
     END`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        // Bidirectional-pin per feedback_bidirectional_pin_assertion:
        // (positive) the compound name IS captured as ONE token
        assert.ok(labels.some(t => t.value === '?SL_Clients:External'),
            `expected greedy match of ?SL_Clients:External as ONE token. Got values: ${labels.map(t => t.value).join(',')}`);
        // (negative — split-shape regression sentinel) no `?SL_Clients`-only token
        // appears (which would prove the suffix got split off as a separate token)
        assert.ok(!labels.some(t => t.value === '?SL_Clients'),
            `regression: ?SL_Clients should NOT appear as a separate token (means the suffix got split off). Got: ${labels.map(t => t.value).join(',')}`);
    });

    test('#174 — multi-colon compound names also tokenize as one (?A:B:C)', () => {
        // Defensive coverage for chained suffix-style names. The character class
        // [A-Za-z0-9_:]* matches multiple colons by construction.
        const code = `Win WINDOW
       STRING('Foo'),USE(?Multi:Colon:Suffix)
     END`;
        const tokens = tokenize(code);
        const labels = fieldEquateTokens(tokens);
        assert.ok(labels.some(t => t.value === '?Multi:Colon:Suffix'),
            `expected greedy match of ?Multi:Colon:Suffix as ONE token. Got values: ${labels.map(t => t.value).join(',')}`);
    });
});
