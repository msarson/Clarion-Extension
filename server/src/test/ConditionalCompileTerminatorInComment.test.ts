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
 * A terminator inside a string in code still does not close a block (`MESSAGE('***')`), and a `!`
 * inside a string does not start a comment (`MESSAGE('Hi! ***')`).
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

        test('a terminator inside a string in code still does not close the block', () => {
            assert.deepStrictEqual(included([
                "  OMIT('***')",
                "  MESSAGE('Hi! ***')",
                "  INCLUDE('Old.inc'), ONCE",
                '  ***',
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

        test('a terminator inside a string in code still does not close the block', () => {
            const blocks = blocksOf([
                "  OMIT('***')",
                "  MESSAGE('Hi! ***')",
                '  ***',
                'Visible   EQUATE(2)',
            ]);
            assert.deepStrictEqual(blocks.map(b => [b.startLine, b.endLine]), [[0, 2]]);
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
