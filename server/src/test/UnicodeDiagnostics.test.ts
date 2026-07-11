import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateUnicodeCharacters, isUnrepresentableInAnsi } from '../providers/diagnostics/UnicodeDiagnostics';

/**
 * #82 — the invalid-encoding warning must flag only characters representable in NO Windows ANSI code
 * page (genuine Unicode contamination), never legitimate national letters. The original `> 0xFF`
 * heuristic assumed Windows-1252 and flooded CP-1250/1251 users (Edin's report).
 */
suite('#82 validateUnicodeCharacters (code-page-aware)', () => {
    function diags(text: string) {
        return validateUnicodeCharacters(TextDocument.create('file:///t.clw', 'clarion', 1, text));
    }

    test('does NOT flag Central-European (CP-1250) letters č ć š ž đ', () => {
        assert.deepStrictEqual(diags("Msg = 'čćšžđ'"), []);
    });

    test('does NOT flag Cyrillic (CP-1251) letters', () => {
        assert.deepStrictEqual(diags("S = 'Привет'"), []);
    });

    test('does NOT flag Latin-1 accents é ü ñ', () => {
        assert.deepStrictEqual(diags("S = 'éüñ'"), []);
    });

    test('does NOT flag smart quotes / em-dash / ellipsis (valid Windows ANSI punctuation)', () => {
        assert.deepStrictEqual(diags("S = '’“—…'"), []);
    });

    test('flags an emoji once, spanning its surrogate pair', () => {
        const d = diags("S = '\u{1F600}'");
        assert.strictEqual(d.length, 1);
        assert.ok(d[0].message.includes('U+1F600'), d[0].message);
        assert.strictEqual(d[0].range.end.character - d[0].range.start.character, 2, 'range covers both UTF-16 units');
    });

    test('flags box-drawing characters', () => {
        assert.strictEqual(diags('─│').length, 2);
    });

    test('no diagnostics for plain ASCII', () => {
        assert.deepStrictEqual(diags('Count = 42\n  DO Something'), []);
    });

    test('isUnrepresentableInAnsi classifies national letters as valid, Unicode-only as invalid', () => {
        assert.strictEqual(isUnrepresentableInAnsi(0x010D), false, 'č (CP-1250)');
        assert.strictEqual(isUnrepresentableInAnsi(0x0410), false, 'Cyrillic А (CP-1251)');
        assert.strictEqual(isUnrepresentableInAnsi(0x2019), false, 'smart quote (Windows ANSI 0x92)');
        assert.strictEqual(isUnrepresentableInAnsi(0x0041), false, "'A'");
        assert.strictEqual(isUnrepresentableInAnsi(0x1F600), true, 'emoji');
        assert.strictEqual(isUnrepresentableInAnsi(0x2500), true, 'box-drawing');
        assert.strictEqual(isUnrepresentableInAnsi(0x4E00), true, 'CJK');
    });
});
