/**
 * Find All References on a `?Name` field equate lists the control's declaration and its uses.
 *
 * Hover and F12 already resolve a `?Name` to its control (#614); references returned nothing.
 * `getWordRangeAtPosition` drops the `?`, the word ladder then searched for a bare `OkButton`
 * (no symbol has that name) and, with the cursor on the sigil itself, bailed before searching.
 *
 * Scope is the control, not the spelling: `?OkButton` in another procedure's window is a
 * different control, and each hit is resolved by the rule hover and F12 use
 * (utils/FieldEquateResolver), so the ABC shape (uses inside the methods of the procedure's
 * local WindowManager subclass) belongs to the procedure that declares the window.
 *
 * Ranges cover the name without the `?`, which is what rename replaces.
 */
import * as assert from 'assert';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { RenameProvider } from '../providers/RenameProvider';
import { TextEdit } from 'vscode-languageserver-protocol';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'WinMgr     CLASS,TYPE',                                                 // 0
    'FirstField   SIGNED',                                                   // 1
    'Init         PROCEDURE(),BYTE,VIRTUAL',                                 // 2
    '           END',                                                        // 3
];
const CLW = [
    '  MEMBER()',                                                            // 0
    "  INCLUDE('classes.inc')",                                              // 1
    '  MAP',                                                                 // 2
    '  END',                                                                 // 3
    'SelectDate PROCEDURE',                                                  // 4
    'LOC:Year             LONG',                                             // 5
    "Window WINDOW('Pick'),AT(,,100,50)",                                    // 6
    "       PROMPT('Year:'),AT(4,8),USE(?LOC:Year:Prompt)",                  // 7
    '       ENTRY(@n4),AT(40,8),USE(LOC:Year)',                              // 8
    "       BUTTON('OK'),AT(4,30),USE(?OkButton)",                           // 9
    '     END',                                                              // 10
    'ThisWindow           CLASS(WinMgr)',                                    // 11
    'Init                   PROCEDURE(),BYTE,DERIVED',                       // 12
    '                     END',                                              // 13
    '  CODE',                                                                // 14
    '  ThisWindow.Init()',                                                   // 15
    '  ?OkButton{PROP:Disable} = TRUE   ! ?OkButton in a comment',          // 16
    "  MESSAGE('?OkButton in a string')",                                    // 17
    '',                                                                      // 18
    'ThisWindow.Init PROCEDURE',                                             // 19
    '  CODE',                                                                // 20
    '  SELF.FirstField = ?LOC:Year:Prompt',                                  // 21
    '  SELECT(?OkButton)',                                                   // 22
    '  RETURN 0',                                                            // 23
    '',                                                                      // 24
    'OtherProc PROCEDURE',                                                   // 25
    "Window WINDOW('Other'),AT(,,100,50)",                                   // 26
    "       BUTTON('OK'),AT(4,30),USE(?OkButton)",                           // 27
    '     END',                                                              // 28
    '  CODE',                                                                // 29
    '  ACCEPT',                                                              // 30
    '    CASE FIELD()',                                                      // 31
    '    OF ?OkButton',                                                      // 32
    '      BREAK',                                                           // 33
    '    END',                                                               // 34
    '  END',                                                                 // 35
];

suite('Find All References on a ?Name field equate', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW }); });
    suiteTeardown(() => fx.dispose());

    async function refs(line: number, character: number, includeDeclaration = true): Promise<string[]> {
        const doc = fx.open('caller.clw');
        const locations = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration });
        return (locations ?? [])
            .map(l => `${l.uri.split('/').pop()}:${l.range.start.line}:${l.range.start.character}-${l.range.end.character}`)
            .sort();
    }

    /** `line:start-end` of the name (without the `?`) in a CLW line. */
    const at = (line: number, name: string, occurrence = 0) => {
        let idx = -1;
        for (let i = 0; i <= occurrence; i++) idx = CLW[line].indexOf(`?${name}`, idx + 1);
        return `caller.clw:${line}:${idx + 1}-${idx + 1 + name.length}`;
    };

    const selectDateOk = [at(9, 'OkButton'), at(16, 'OkButton'), at(22, 'OkButton')].sort();
    const otherProcOk = [at(27, 'OkButton'), at(32, 'OkButton')].sort();

    test('from the USE(?Name) declaration: the declaration and every use of that control', async () => {
        assert.deepStrictEqual(await refs(9, CLW[9].indexOf('?OkButton') + 3), selectDateOk);
    });

    test('from a use in the procedure body', async () => {
        assert.deepStrictEqual(await refs(16, CLW[16].indexOf('?OkButton') + 3), selectDateOk);
    });

    test('from a use inside a method of the local WindowManager class', async () => {
        assert.deepStrictEqual(await refs(22, CLW[22].indexOf('?OkButton') + 3), selectDateOk);
    });

    test('with the cursor on the ? sigil', async () => {
        assert.deepStrictEqual(await refs(22, CLW[22].indexOf('?OkButton')), selectDateOk);
    });

    test('the same name in another procedure is a different control', async () => {
        assert.deepStrictEqual(await refs(32, CLW[32].indexOf('?OkButton') + 3), otherProcOk);
    });

    test('includeDeclaration false leaves out the USE(?Name)', async () => {
        assert.deepStrictEqual(await refs(22, CLW[22].indexOf('?OkButton') + 3, false), [at(16, 'OkButton'), at(22, 'OkButton')].sort());
    });

    test('rename rewrites this window\'s control and its uses, keeping the ?', async () => {
        const doc = fx.open('caller.clw');
        const edit = await new RenameProvider().provideRename(doc, { line: 22, character: CLW[22].indexOf('?OkButton') + 3 }, 'SaveButton');
        const edits = (edit?.documentChanges ?? []).flatMap(c => 'edits' in c ? c.edits as TextEdit[] : []);
        const lines = CLW.slice();
        for (const e of [...edits].sort((a, b) => b.range.start.character - a.range.start.character)) {
            const l = lines[e.range.start.line];
            lines[e.range.start.line] = l.slice(0, e.range.start.character) + e.newText + l.slice(e.range.end.character);
        }
        assert.strictEqual(lines[9], "       BUTTON('OK'),AT(4,30),USE(?SaveButton)");
        assert.strictEqual(lines[16], '  ?SaveButton{PROP:Disable} = TRUE   ! ?OkButton in a comment');
        assert.strictEqual(lines[17], CLW[17]);
        assert.strictEqual(lines[22], '  SELECT(?SaveButton)');
        assert.strictEqual(lines[27], CLW[27]);
        assert.strictEqual(lines[32], CLW[32]);
    });

    test('a colon-named equate is one name', async () => {
        assert.deepStrictEqual(await refs(21, CLW[21].lastIndexOf('Prompt') + 2), [at(7, 'LOC:Year:Prompt'), at(21, 'LOC:Year:Prompt')].sort());
    });
});
