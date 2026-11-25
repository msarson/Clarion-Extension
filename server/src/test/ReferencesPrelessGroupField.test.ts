/**
 * Find All References on a field of a procedure-local GROUP without PRE(), used as
 * `Group.Field`.
 *
 * From the field's declaration only the declaration came back; from a use site
 * (`Tally.Rows`) the uses in the procedure were missing and every other `X.Rows`
 * in the searched files was listed instead; from the group label the qualifiers of
 * `Tally.Rows` were missing.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  PROGRAM',                                  // 0
    '  MAP',                                      // 1
    'LoadIt     PROCEDURE()',                     // 2
    'OtherProc  PROCEDURE()',                     // 3
    '  END',                                      // 4
    '  CODE',                                     // 5
    'LoadIt     PROCEDURE()',                     // 6
    'Tally    GROUP',                             // 7
    'Rows        LONG(0)',                        // 8
    'Skipped      LONG(0)',                       // 9
    '           END',                             // 10
    '  CODE',                                     // 11
    '  Tally.Rows += 1',                          // 12
    '  IF Tally.Rows > 10',                       // 13
    '    MESSAGE(Tally.Rows)',                    // 14
    '  END',                                      // 15
    'OtherProc  PROCEDURE()',                     // 16
    'Summary      GROUP',                         // 17
    'Rows        LONG(0)',                        // 18
    '           END',                             // 19
    '  CODE',                                     // 20
    '  Summary.Rows = 1',                         // 21
];

const TALLY_ROWS = [8, 12, 13, 14];

suite('References on a field of a PRE-less local GROUP used as Group.Field', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test-groupfield/refs.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    async function refsAt(line: number, character: number): Promise<number[]> {
        const r = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
        return [...new Set((r ?? []).map(l => l.range.start.line))].sort((a, b) => a - b);
    }

    test('from the field declaration: the declaration and every Tally.Rows', async () => {
        assert.deepStrictEqual(await refsAt(8, 1), TALLY_ROWS);
    });

    test('from Rows in a use site: the same list, without the other group\'s Summary.Rows', async () => {
        const col = LINES[13].indexOf('Rows');
        assert.deepStrictEqual(await refsAt(13, col + 1), TALLY_ROWS);
    });

    test('from Tally in a use site: the same list as from the field declaration', async () => {
        const col = LINES[13].indexOf('Tally');
        assert.deepStrictEqual(await refsAt(13, col + 1), [7, 12, 13, 14]);
    });

    test('from the group label: the declaration and every Tally. qualifier', async () => {
        assert.deepStrictEqual(await refsAt(7, 1), [7, 12, 13, 14]);
    });

    test('from the other group\'s field: only its own declaration and use', async () => {
        assert.deepStrictEqual(await refsAt(18, 1), [18, 21]);
    });

    test('a field of a QUEUE,TYPE reached through an instance is not narrowed to the type\'s label', async () => {
        const typed = [
            '  PROGRAM',                          // 0
            '  MAP',                              // 1
            'LoadIt     PROCEDURE()',             // 2
            '  END',                              // 3
            'BaseQ      QUEUE,TYPE',              // 4
            'Name         STRING(20)',            // 5
            '           END',                     // 6
            '  CODE',                             // 7
            'LoadIt     PROCEDURE()',             // 8
            'MyQ        QUEUE(BaseQ)',            // 9
            '           END',                     // 10
            '  CODE',                             // 11
            "  MyQ.Name = 'x'",                   // 12
        ];
        doc = TextDocument.create('file:///c:/test-groupfield/typed.clw', 'clarion', 1, typed.join('\r\n'));
        const lines = await refsAt(12, typed[12].indexOf('Name') + 1);
        assert.ok(lines.includes(5), `the TYPE's field declaration should stay in the list: ${lines}`);
    });
});
