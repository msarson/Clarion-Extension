import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { UnreachableCodeProvider } from '../providers/UnreachableCodeProvider';

// #808 - each statement of an EXECUTE is its own branch and only one runs, so a
// RETURN on one branch does not make the next branch unreachable. A BEGIN ... END
// block is one branch. With no branch selected (index out of range, no ELSE),
// execution continues after the END, so the code after it stays reachable too.
suite('UnreachableCodeProvider - EXECUTE branches (#808)', () => {
    let docVersion = 0;

    function unreachableLines(code: string): number[] {
        const doc = TextDocument.create('file:///execute808.clw', 'clarion', ++docVersion, code);
        return UnreachableCodeProvider.provideUnreachableRanges(doc).map(r => r.start.line);
    }

    test('RETURN on every EXECUTE branch leaves the following branches reachable', () => {
        const code = [
            'MyProc PROCEDURE(LONG row, LONG col)',     // 0
            '  CODE',                                   // 1
            '  CASE row',                               // 2
            '  OF 0',                                   // 3
            '    EXECUTE col',                          // 4
            '      RETURN 1',                           // 5
            '      RETURN 2',                           // 6
            '      RETURN 3',                           // 7
            '    END',                                  // 8
            '  END',                                    // 9
            '  RETURN 0',                               // 10
        ].join('\n');
        assert.deepStrictEqual(unreachableLines(code), []);
    });

    test('a BEGIN ... END branch is one branch; the next branch is reachable', () => {
        const code = [
            'MyProc PROCEDURE(LONG col)',               // 0
            '  CODE',                                   // 1
            '  EXECUTE col',                            // 2
            '    RETURN 1',                             // 3
            '    BEGIN',                                // 4
            "      MESSAGE('two')",                     // 5
            '      RETURN 2',                           // 6
            '    END',                                  // 7
            '    RETURN 3',                             // 8
            '  ELSE',                                   // 9
            '    RETURN 4',                             // 10
            '  END',                                    // 11
            '  RETURN 0',                               // 12
        ].join('\n');
        assert.deepStrictEqual(unreachableLines(code), []);
    });

    test('code after a RETURN inside a BEGIN branch is still unreachable', () => {
        const code = [
            'MyProc PROCEDURE(LONG col)',               // 0
            '  CODE',                                   // 1
            '  EXECUTE col',                            // 2
            '    BEGIN',                                // 3
            '      RETURN 1',                           // 4
            "      MESSAGE('dead')",                    // 5
            '    END',                                  // 6
            '    RETURN 2',                             // 7
            '  END',                                    // 8
        ].join('\n');
        assert.deepStrictEqual(unreachableLines(code), [5]);
    });

    test('CASE and IF branches after a RETURN are already reachable', () => {
        const code = [
            'MyProc PROCEDURE(LONG row)',               // 0
            '  CODE',                                   // 1
            '  CASE row',                               // 2
            '  OF 1',                                   // 3
            '    RETURN 1',                             // 4
            '  OF 2',                                   // 5
            '    RETURN 2',                             // 6
            '  ELSE',                                   // 7
            '    RETURN 3',                             // 8
            '  END',                                    // 9
            '  IF row = 1',                             // 10
            '    RETURN 1',                             // 11
            '  ELSIF row = 2',                          // 12
            '    RETURN 2',                             // 13
            '  ELSE',                                   // 14
            '    RETURN 3',                             // 15
            '  END',                                    // 16
            '  RETURN 0',                               // 17
        ].join('\n');
        assert.deepStrictEqual(unreachableLines(code), []);
    });
});
