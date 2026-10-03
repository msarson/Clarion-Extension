/**
 * F12 on a `?Name` field equate goes to the control, as hover does (#614).
 *
 * Found by the #609 agreement sweep on app1: `SELF.FirstField = ?LOC:REPORT_DATE:Prompt` - hover
 * showed the PROMPT, F12 went to `Prompt EQUATE(2)` in claedgeequ.inc (the name stripped to its
 * last colon segment); `?LOC:YEAR_1099:Prompt` gave F12 nothing. Only hover read the `?Name`
 * token; F12 treated it as an ordinary colon name.
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    'Prompt     EQUATE(2)',                                                  // 0 — the stripped-name trap
    'WinMgr     CLASS,TYPE',                                                 // 1
    'FirstField   SIGNED',                                                   // 2
    'Init         PROCEDURE(),BYTE,VIRTUAL',                                 // 3
    '           END',                                                        // 4
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
    '',                                                                      // 16
    'ThisWindow.Init PROCEDURE',                                             // 17
    '  CODE',                                                                // 18
    '  SELF.FirstField = ?LOC:Year:Prompt',                                  // 19
    '  SELECT(?OkButton)',                                                   // 20
    '  RETURN 0',                                                            // 21
];

suite('F12 on a ?Name field equate goes to the control (#614)', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW }); });
    suiteTeardown(() => fx.dispose());

    async function targets(line: number, character: number) {
        const doc = fx.open('caller.clw');
        const position = { line, character };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            def: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
        };
    }

    const feq = CLW[19].indexOf('?LOC');
    const cases: Array<[string, number, number, string]> = [
        ['cursor on the ? sigil',                     19, feq,                                   'caller.clw:7'],
        ['cursor on the first segment',               19, feq + 2,                               'caller.clw:7'],
        ['cursor on the last segment (Prompt)',       19, CLW[19].lastIndexOf('Prompt') + 2,     'caller.clw:7'],
        ['a plain ?Name',                             20, CLW[20].indexOf('?OkButton') + 3,      'caller.clw:9'],
    ];

    for (const [name, line, character, expected] of cases) {
        test(`F12: ${name}`, async () => {
            const { def } = await targets(line, character);
            assert.deepStrictEqual(def, [expected]);
        });
        test(`hover agrees: ${name}`, async () => {
            const { hover } = await targets(line, character);
            assert.ok(hover.includes(expected), `hover -> ${JSON.stringify(hover)}`);
        });
    }
});
