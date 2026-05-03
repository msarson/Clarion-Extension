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
});
