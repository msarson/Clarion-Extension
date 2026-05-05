import * as assert from 'assert';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';

/**
 * Regression tests for task `7a98d63f`. The Clarion tokenizer used to drop
 * the leading digits of a suffixed numeric literal — `pAdr = 1000h` would
 * silently strip the `1000` Number token and emit `h` as a 1-char
 * `TokenType.Variable`, which then surfaced as a spurious undeclared-variable
 * diagnostic (#62 v2 expansion). The fix in `TokenPatterns.ts:Number`
 * recognises hex / octal / binary suffix forms as a single Number token.
 *
 * Three positives + three negatives + a smoke-test for the Alice repro shape
 * (`pAdr = 1000h`).
 */
suite('Tokenizer — numeric literal suffixes (7a98d63f)', () => {

    function tokenizeRhs(rhs: string): Token[] {
        // Wrap in a minimal procedure so the lexer sees a normal LHS = RHS shape.
        // The line `  x = <rhs>` puts the literal in column ≥6 of a CODE-section
        // line — same shape as Alice's repro.
        const code = `Test PROCEDURE()\nx LONG\n  CODE\n  x = ${rhs}\n`;
        return new ClarionTokenizer(code).tokenize();
    }

    function findFirst(tokens: Token[], value: string): Token | undefined {
        return tokens.find(t => t.value === value);
    }

    suite('positive cases — single Number token spans digits + suffix', () => {

        test('hex literal `1000h` tokenises as one Number', () => {
            const tokens = tokenizeRhs('1000h');
            const numberTokens = tokens.filter(t => t.type === TokenType.Number);
            assert.ok(
                numberTokens.some(t => t.value === '1000h'),
                `expected a single Number token "1000h", got: ${JSON.stringify(numberTokens.map(t => t.value))}`
            );
            // The `h` suffix must NOT emerge as its own Variable token —
            // that's the exact regression mode this test pins.
            const orphanH = tokens.find(t => t.type === TokenType.Variable && t.value === 'h');
            assert.strictEqual(orphanH, undefined,
                'suffix `h` must not split off as a Variable token');
        });

        test('hex literal with letter digits `0FFh` tokenises as one Number', () => {
            const tokens = tokenizeRhs('0FFh');
            const numberTokens = tokens.filter(t => t.type === TokenType.Number);
            assert.ok(
                numberTokens.some(t => t.value === '0FFh'),
                `expected a single Number token "0FFh", got: ${JSON.stringify(numberTokens.map(t => t.value))}`
            );
        });

        test('hex literal `0AFh` (Bob\'s example) tokenises as one Number', () => {
            const tokens = tokenizeRhs('0AFh');
            const numberTokens = tokens.filter(t => t.type === TokenType.Number);
            assert.ok(
                numberTokens.some(t => t.value === '0AFh'),
                `expected a single Number token "0AFh", got: ${JSON.stringify(numberTokens.map(t => t.value))}`
            );
        });

        test('octal literal `777o` tokenises as one Number', () => {
            const tokens = tokenizeRhs('777o');
            const numberTokens = tokens.filter(t => t.type === TokenType.Number);
            assert.ok(
                numberTokens.some(t => t.value === '777o'),
                `expected a single Number token "777o", got: ${JSON.stringify(numberTokens.map(t => t.value))}`
            );
            const orphanO = tokens.find(t => t.type === TokenType.Variable && t.value === 'o');
            assert.strictEqual(orphanO, undefined,
                'suffix `o` must not split off as a Variable token');
        });

        test('binary literal `1010b` tokenises as one Number', () => {
            const tokens = tokenizeRhs('1010b');
            const numberTokens = tokens.filter(t => t.type === TokenType.Number);
            assert.ok(
                numberTokens.some(t => t.value === '1010b'),
                `expected a single Number token "1010b", got: ${JSON.stringify(numberTokens.map(t => t.value))}`
            );
            const orphanB = tokens.find(t => t.type === TokenType.Variable && t.value === 'b');
            assert.strictEqual(orphanB, undefined,
                'suffix `b` must not split off as a Variable token');
        });

        test('plain decimal `1.5` still tokenises as a single Number (no regression)', () => {
            const tokens = tokenizeRhs('1.5');
            assert.ok(
                tokens.some(t => t.type === TokenType.Number && t.value === '1.5'),
                'plain decimal must still match the Number pattern'
            );
        });
    });

    suite('negative cases — bare suffix char alone stays a Variable', () => {

        // These confirm that a bare `h`, `o`, or `b` after whitespace (i.e.
        // not glued to a numeric prefix) is still treated as an identifier
        // and CAN therefore surface as an undeclared-variable diagnostic.
        // If the tokenizer were over-eager it might absorb `h` even without
        // a digit prefix — these tests pin that it doesn't.

        test('bare `h` after whitespace stays a Variable', () => {
            const tokens = tokenizeRhs('h');
            const hToken = findFirst(tokens, 'h');
            assert.ok(hToken, 'expected a token for "h"');
            assert.notStrictEqual(hToken!.type, TokenType.Number,
                'bare `h` must not be classified as a Number');
        });

        test('bare `o` after whitespace stays a Variable', () => {
            const tokens = tokenizeRhs('o');
            const oToken = findFirst(tokens, 'o');
            assert.ok(oToken, 'expected a token for "o"');
            assert.notStrictEqual(oToken!.type, TokenType.Number,
                'bare `o` must not be classified as a Number');
        });

        test('bare `b` after whitespace stays a Variable', () => {
            const tokens = tokenizeRhs('b');
            const bToken = findFirst(tokens, 'b');
            assert.ok(bToken, 'expected a token for "b"');
            assert.notStrictEqual(bToken!.type, TokenType.Number,
                'bare `b` must not be classified as a Number');
        });

        test('identifier starting with a letter `FFh` stays a Variable (no leading digit → not hex)', () => {
            // Per Clarion convention hex literals require a leading decimal
            // digit. `FFh` is invalid hex and must fall through to Variable.
            // This also means the regex MUST require the leading digit —
            // a pattern of `[0-9A-Fa-f]+[hH]` (no leading-digit anchor)
            // would incorrectly match `FFh` and break this test.
            const tokens = tokenizeRhs('FFh');
            const ffhToken = findFirst(tokens, 'FFh');
            // FFh may be a Variable, an ImplicitVariable, or split across
            // tokens in some edge cases — the assertion that matters is
            // that NO Number token has value "FFh".
            const ffhAsNumber = tokens.find(t => t.type === TokenType.Number && t.value === 'FFh');
            assert.strictEqual(ffhAsNumber, undefined,
                'identifier `FFh` (no leading digit) must NOT be classified as a Number');
            assert.ok(ffhToken || tokens.some(t => t.value === 'FF'),
                'expected `FFh` either as a single identifier token, or split into recognisable parts');
        });
    });

    suite('Alice repro shape — `pAdr = 1000h` produces no orphan suffix Variable', () => {

        test('source-text-faithful repro: pAdr = 1000h', () => {
            const code = [
                'Test PROCEDURE()',
                'pAdr ULONG',
                '  CODE',
                '  pAdr = 1000h',
                ''
            ].join('\n');

            const tokens = new ClarionTokenizer(code).tokenize();

            // The bug: prior to 7a98d63f the Variable pattern emitted a
            // 1-char `h` token at the suffix position. Make sure that does
            // NOT happen any more.
            const orphanH = tokens.find(t =>
                t.type === TokenType.Variable && t.value === 'h'
            );
            assert.strictEqual(orphanH, undefined,
                `expected NO orphan "h" Variable token, got tokens: ${JSON.stringify(
                    tokens.filter(t => t.line === 3).map(t => ({ type: t.type, value: t.value }))
                )}`
            );

            // And the literal itself must be a single Number token.
            const literal = tokens.find(t =>
                t.type === TokenType.Number && t.value === '1000h'
            );
            assert.ok(literal, 'expected a single Number token "1000h"');
        });
    });
});
