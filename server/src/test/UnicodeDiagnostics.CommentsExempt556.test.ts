import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateUnicodeCharacters } from '../providers/diagnostics/UnicodeDiagnostics';

/**
 * #556 — a hand-coded module with an ASCII-art banner in comments (box-drawing
 * characters) got 256 warnings, one per character, saying the file "will corrupt the
 * file for the Clarion compiler". It compiles: the compiler never reads a comment's
 * bytes. Comments are exempt; outside them the warning stays, one per line, and says
 * what is true — the character has no ANSI encoding.
 */
suite('Unicode check: comments are exempt, one warning per line elsewhere (#556)', () => {

    let v = 0;
    const run = (lines: string[]) =>
        validateUnicodeCharacters(TextDocument.create('file:///unicode556.clw', 'clarion', ++v, lines.join('\r\n')));

    const BANNER = [
        '  PROGRAM',
        '!  ██████╗ █████╗ ██╗     ██╗',
        '! ██╔════╝██╔══██╗██║     ██║',
        '! ╚═════╝ ╚═╝  ╚═╝╚══════╝',
        '  MAP',
        '  END',
        '  CODE',
        '  RETURN',
    ];

    test('bug-pin: a box-drawing banner in comments yields no diagnostic', () => {
        assert.deepStrictEqual(run(BANNER), []);
    });

    test('a trailing comment after code is exempt too', () => {
        assert.deepStrictEqual(run(['  PROGRAM', '  CODE', "  x = 1   ! ╚═╝ done", '  RETURN']), []);
    });

    test('the same characters in a string literal are reported — once for the line', () => {
        const d = run(['  PROGRAM', 'S  STRING(20)', '  CODE', "  S = '██╗ box ██'", '  RETURN']);
        assert.strictEqual(d.length, 1, 'one warning for the line, not one per character');
        assert.strictEqual(d[0].range.start.line, 3);
        assert.strictEqual(d[0].range.start.character, "  S = '".length, 'the range starts at the first such character');
        const msg = String(d[0].message);
        assert.ok(/U\+2588/.test(msg), msg);
        assert.ok(!/corrupt/i.test(msg), `must not claim corruption; got: ${msg}`);
        assert.ok(/ANSI/.test(msg), msg);
        assert.strictEqual(d[0].code, 'invalid-encoding');
    });

    test('a mixed line warns only for the part before the comment marker', () => {
        assert.deepStrictEqual(run(['  PROGRAM', '  CODE', "  x = 1 ! ██", '  RETURN']), []);
        const d = run(['  PROGRAM', '  CODE', "  MESSAGE('██') ! ██", '  RETURN']);
        assert.strictEqual(d.length, 1);
        assert.strictEqual(d[0].range.start.character, "  MESSAGE('".length);
    });

    test("a ! inside a string does not start a comment: characters after it still count", () => {
        const d = run(['  PROGRAM', '  CODE', "  MESSAGE('a!b ██')", '  RETURN']);
        assert.strictEqual(d.length, 1);
    });

    test('several offending lines give several warnings, and a count of how many characters each line holds', () => {
        const d = run(['  PROGRAM', '  CODE', "  MESSAGE('██')", "  MESSAGE('╗')", '  RETURN']);
        assert.deepStrictEqual(d.map(x => x.range.start.line), [2, 3]);
        assert.ok(/2 characters/.test(String(d[0].message)), `first line holds two; got: ${String(d[0].message)}`);
    });
});
