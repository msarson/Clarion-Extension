import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { scanConditionalCompile } from '../utils/ConditionalCompile';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';

/**
 * A COMPILE/OMIT terminator written after `!` closes the block, quoted or not, and so does one in
 * the comment of the directive's own line. A common marker idiom writes the terminator quoted in a
 * comment:
 *
 *     COMPILE('*Debug*', _Debug_)
 *     INCLUDE('Debug.inc'), ONCE
 *     !'*Debug*'
 *
 * or on one line:
 *
 *     COMPILE('*Debug*', _Debug_); DebugBreak()  !'*Debug*'
 *
 * Both compile with the switch off, so the compiler closes the block on those lines. The scans
 * stripped every quoted string from the line before looking for the terminator, the comment's
 * included, and never looked at the directive's own line: with the switch off the block ran to
 * the end of the file, every INCLUDE after it counted as not compiled, and the missing-include
 * check reported each class those INCLUDEs declare.
 *
 * How the compiler reads a block's end depends on whether it skips the block or compiles it (both
 * checked on Clarion 11.1 and 12). Skipping, it searches the raw text: the terminator closes the
 * block anywhere on a line, inside a string (`MESSAGE('***')`) or inside a word too. Compiling, it
 * reads through string literals: a terminator inside a string does not close the block, one in code
 * or in a comment does, and a `!` inside a string does not start a comment (`MESSAGE('Hi! ***')`).
 * The match is case-sensitive either way.
 */
const included = (lines: string[], known: Record<string, number> = {}) =>
    scanConditionalCompile(lines, { lookup: name => known[name.toLowerCase()] })
        .includes.filter(i => i.active).map(i => i.file);

suite('COMPILE/OMIT terminator in a comment', () => {
    suite('conditional scan (INCLUDEs followed)', () => {
        const threeLine = [
            "  COMPILE('*Debug*', _Debug_)   ! on for a debug build",
            "  INCLUDE('Debug.inc'), ONCE",
            "  !'*Debug*'",
            "  INCLUDE('After.inc'), ONCE",
        ];

        test('a quoted terminator after ! closes a block that does not compile', () => {
            assert.deepStrictEqual(included(threeLine, { _debug_: 0 }), ['After.inc']);
        });

        test('control: the same block compiling keeps both INCLUDEs', () => {
            assert.deepStrictEqual(included(threeLine, { _debug_: 1 }), ['Debug.inc', 'After.inc']);
        });

        test('a quoted terminator after ! closes an OMIT that omits', () => {
            assert.deepStrictEqual(included([
                "  OMIT('**Old**')",
                "  INCLUDE('Old.inc'), ONCE",
                "  ! end of the old part: '**Old**'",
                "  INCLUDE('After.inc'), ONCE",
            ]), ['After.inc']);
        });

        test('a terminator in the comment of the directive line closes the block there', () => {
            assert.deepStrictEqual(included([
                "      COMPILE('*Debug*', _Debug_); DebugBreak()  !'*Debug*'",
                "  INCLUDE('After.inc'), ONCE",
            ], { _debug_: 0 }), ['After.inc']);
            assert.deepStrictEqual(included([
                "  OMIT('**')  ! one line only **",
                "  INCLUDE('After.inc'), ONCE",
            ]), ['After.inc']);
        });

        test('the directive\'s own terminator argument does not close its block', () => {
            assert.deepStrictEqual(included([
                "  OMIT('**')",
                "  INCLUDE('Old.inc'), ONCE",
                '  **',
                "  INCLUDE('After.inc'), ONCE",
            ]), ['After.inc']);
        });

        test('a terminator inside a string closes a block that is skipped', () => {
            assert.deepStrictEqual(included([
                "  OMIT('***')",
                "  MESSAGE('Hi! ***')",
                "  INCLUDE('Now.inc'), ONCE",
                "  INCLUDE('After.inc'), ONCE",
            ]), ['Now.inc', 'After.inc']);
            assert.deepStrictEqual(included([
                "  COMPILE('***', _Debug_)",
                "  S = '***'",
                "  INCLUDE('Now.inc'), ONCE",
            ], { _debug_: 0 }), ['Now.inc']);
        });

        test('a terminator inside a word closes a block that is skipped', () => {
            assert.deepStrictEqual(included([
                "  OMIT('ENDX')",
                '  V = NoENDXInside',
                "  INCLUDE('Now.inc'), ONCE",
            ]), ['Now.inc']);
        });

        test('a terminator inside a string does not close a block that is compiled', () => {
            // Undecided, so read as compiled; what the block sets is unknown up to its real end.
            const scan = scanConditionalCompile([
                "  COMPILE('***', _Maybe_)",
                "  MESSAGE('Hi! ***')",
                'Inside    EQUATE(1)',
                '  ***',
                'After     EQUATE(2)',
            ]);
            assert.strictEqual(scan.equates.has('inside'), false);
            assert.strictEqual(scan.equates.get('after'), 2);
        });

        test('the match is case-sensitive', () => {
            assert.deepStrictEqual(included([
                "  OMIT('ENDX')",
                '  !endx',
                "  INCLUDE('Old.inc'), ONCE",
                '  !ENDX',
                "  INCLUDE('After.inc'), ONCE",
            ]), ['After.inc']);
        });

        test('a string after the directive\'s argument closes a skipped block on that line', () => {
            assert.deepStrictEqual(included([
                "  OMIT('***'); S = '***'",
                "  INCLUDE('After.inc'), ONCE",
            ]), ['After.inc']);
        });
    });

    suite('OmitCompileDetector (omitted lines)', () => {
        const blocksOf = (lines: string[]) => {
            const code = lines.join('\n');
            return OmitCompileDetector.findDirectiveBlocks(
                new ClarionTokenizer(code).tokenize(),
                TextDocument.create('test://test.clw', 'clarion', 1, code));
        };

        test('a quoted terminator after ! closes the block', () => {
            const blocks = blocksOf([
                "  OMIT('**Old**')",
                'Hidden    EQUATE(1)',
                "  !'**Old**'",
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(blocks.map(b => [b.startLine, b.endLine]), [[0, 2]]);
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false);
        });

        test('a terminator in the comment of the directive line closes the block there', () => {
            const blocks = blocksOf([
                "  OMIT('**')  ! one line only **",
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(blocks.map(b => [b.startLine, b.endLine]), [[0, 0]]);
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), false);
        });

        test('a terminator inside a string closes an OMIT (skipped)', () => {
            const blocks = blocksOf([
                "  OMIT('***')",
                "  MESSAGE('Hi! ***')",
                '  ***',
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(blocks.map(b => [b.startLine, b.endLine]), [[0, 1]]);
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(2, blocks), false);
        });

        test('a terminator inside a string does not close a COMPILE (compiled)', () => {
            const blocks = blocksOf([
                "  COMPILE('***')",
                "  MESSAGE('Hi! ***')",
                '  ***',
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(blocks.map(b => [b.startLine, b.endLine]), [[0, 2]]);
        });

        test('a string after the directive\'s argument closes an OMIT on that line, not a COMPILE', () => {
            const omit = blocksOf([
                "  OMIT('***'); S = '***'",
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(omit.map(b => [b.startLine, b.endLine]), [[0, 0]]);
            const compile = blocksOf([
                "  COMPILE('***'); S = '***'",
                'Kept      EQUATE(1)',
                '  ***',
            ]);
            assert.deepStrictEqual(compile.map(b => [b.startLine, b.endLine]), [[0, 2]]);
        });

        test('a terminator inside a word closes an OMIT; the match is case-sensitive', () => {
            assert.deepStrictEqual(blocksOf([
                "  OMIT('ENDX')",
                '  V = NoENDXInside',
                'Visible   EQUATE(2)',
            ]).map(b => [b.startLine, b.endLine]), [[0, 1]]);
            assert.deepStrictEqual(blocksOf([
                "  OMIT('ENDX')",
                '  !endx',
                '  !ENDX',
            ]).map(b => [b.startLine, b.endLine]), [[0, 2]]);
        });

        test('a comment after the directive is not a condition argument', () => {
            const blocks = blocksOf([
                "  OMIT('**Old**')   ! the old way",
                'Hidden    EQUATE(1)',
                '  **Old**',
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(blocks.map(b => [b.startLine, b.endLine]), [[0, 2]]);
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true);
        });

        test('control: a conditional directive with a comment is still not a block', () => {
            assert.deepStrictEqual(blocksOf([
                "  OMIT('**Old**', _Old_)   ! the old way",
                'Maybe     EQUATE(1)',
                '  **Old**',
            ]), []);
        });
    });
});
