import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateUnicodeCharacters, declaresUtf8Directive } from '../providers/diagnostics/UnicodeDiagnostics';

/**
 * #403 — a file that declares itself UTF-8 with the Clarion 12 `!UTF8` directive
 * should not be told its Unicode characters will corrupt the build.
 *
 * The Unicode Tester Guide gives three ways a source file declares its encoding —
 * a UTF-8/UTF-16 LE BOM, a first-line `!UTF8`, or `module(encoding=>utf8)` — and
 * states plainly: *"Files with none of these stay ANSI — existing sources compile
 * byte-identically."*
 *
 * That is why the warning is right by default and stays right on Clarion 12: an
 * UNDECORATED file is read as ANSI by every Clarion, so an emoji in one really
 * does corrupt. Only a declared file should go quiet.
 *
 * This covers the `!UTF8` directive only. BOM detection is unresolved (VS Code
 * likely strips it before the LSP sees the content, so it needs a disk read) and
 * `module(encoding=>utf8)` is not yet implemented — both tracked in #403.
 *
 * KNOWN GAP, deliberate: the directive is trusted without checking whether the
 * selected compiler can honour it. A pre-Unicode Clarion reads the bytes as ANSI
 * whatever the file says, so a `!UTF8` file on Clarion 10 now stays silent where
 * a warning would have been right. Trusting an explicit author declaration beats
 * second-guessing it; closing the gap needs the compiler probe in #402.
 */
suite('#403 !UTF8 directive suppresses the ANSI-contamination warning', () => {

    const doc = (text: string) => TextDocument.create('file:///t.clw', 'clarion', 1, text);
    const diags = (text: string) => validateUnicodeCharacters(doc(text));

    const EMOJI_LINE = "  Msg = 'Hello \u{1F600}'";

    test('sanity: without the directive the emoji is still flagged', () => {
        // The bug-pin's control. If this ever goes quiet the suppression has
        // widened and the diagnostic has stopped working rather than stopped
        // misfiring.
        assert.strictEqual(diags(EMOJI_LINE).length, 1);
    });

    test('a leading !UTF8 suppresses the warning entirely', () => {
        assert.deepStrictEqual(diags('!UTF8\n' + EMOJI_LINE), []);
    });

    test('the directive is case-insensitive, like the rest of Clarion', () => {
        assert.deepStrictEqual(diags('!utf8\n' + EMOJI_LINE), []);
        assert.deepStrictEqual(diags('!Utf8\n' + EMOJI_LINE), []);
    });

    test('surrounding whitespace is tolerated', () => {
        assert.deepStrictEqual(diags('   !UTF8   \n' + EMOJI_LINE), []);
    });

    test('it must be the FIRST line', () => {
        // "A file may begin with !UTF8" — a directive further down does not
        // declare the file's encoding and must not silence anything.
        assert.strictEqual(diags('  PROGRAM\n!UTF8\n' + EMOJI_LINE).length, 1,
            'a !UTF8 on line 2 does not declare the file');
    });

    test('ordinary prose mentioning UTF8 does not suppress', () => {
        // The reason the match is strict. A loose test would swallow comments
        // like this one and silence a real problem.
        assert.strictEqual(diags('! UTF8 support added today\n' + EMOJI_LINE).length, 1,
            'a comment that merely mentions UTF8 is not the directive');
        assert.strictEqual(diags('!UTF8 is now supported\n' + EMOJI_LINE).length, 1,
            'trailing prose means this is a comment, not the directive');
    });

    test('a declared file with no unusual characters is unaffected', () => {
        assert.deepStrictEqual(diags("!UTF8\n  Msg = 'plain ascii'"), []);
    });

    test('national letters are still never flagged, declared or not', () => {
        // #82 regression: CP-1250/1251 letters are representable and must not be
        // treated as contamination in either path.
        assert.deepStrictEqual(diags("Msg = 'čćšžđ'"), []);
        assert.deepStrictEqual(diags("!UTF8\nMsg = 'čćšžđ'"), []);
    });

    // ---- the predicate itself ----

    test('declaresUtf8Directive reports the directive directly', () => {
        assert.strictEqual(declaresUtf8Directive(doc('!UTF8\nx = 1')), true);
        assert.strictEqual(declaresUtf8Directive(doc('x = 1')), false);
        assert.strictEqual(declaresUtf8Directive(doc('')), false);
    });

    test('declaresUtf8Directive does not read beyond the first line', () => {
        // The check runs on every diagnostic pass, so it takes a bounded slice
        // rather than the whole document. A very long first line must not throw
        // or falsely match something further on.
        const longFirstLine = 'x'.repeat(5000) + '\n!UTF8\n' + EMOJI_LINE;
        assert.strictEqual(declaresUtf8Directive(doc(longFirstLine)), false);
    });
});
