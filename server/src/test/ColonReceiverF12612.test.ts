/**
 * F12 on a member of a colon-named receiver (#612).
 *
 * Found by the #609 agreement sweep (8 of 456 app1 positions): hover resolved `Relate:ACMDUC.Open()`,
 * `ACCESS:X.TryFetch(...)` and `ThisListManager:Browse:1.Init(...)`, F12 returned nothing. Every
 * generated procedure opens and closes its files this way. F12 took the receiver as the word
 * before the dot with `\w+`, which stops at the colon - `ACMDUC`, not `Relate:ACMDUC`.
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    'RelMgr     CLASS,TYPE',                            // 0
    'Open         PROCEDURE(),BYTE,PROC',               // 1
    'Close        PROCEDURE()',                         // 2
    '           END',                                   // 3
    'ListMgr    CLASS,TYPE',                            // 4
    'Init         PROCEDURE(LONG a)',                   // 5
    '           END',                                   // 6
];
const CLW = [
    '  MEMBER()',                                       // 0
    "  INCLUDE('classes.inc')",                         // 1
    'Relate:Cust          &RelMgr',                     // 2
    '  MAP',                                            // 3
    '  END',                                            // 4
    'Browse PROCEDURE',                                 // 5
    'ThisListManager:Browse:1 ListMgr',                 // 6
    '  CODE',                                           // 7
    '  Relate:Cust.Open()',                             // 8
    '  Relate:Cust.Close',                              // 9
    '  ThisListManager:Browse:1.Init(1)',               // 10
];

suite('F12 on a member of a colon-named receiver (#612)', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW }); });
    suiteTeardown(() => fx.dispose());

    async function targets(line: number, word: string) {
        const doc = fx.open('caller.clw');
        const position = { line, character: CLW[line].lastIndexOf(word) + 1 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            def: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
        };
    }

    const cases: Array<[string, number, string, string]> = [
        ['Relate:File.Open()',               8,  'Open',  'classes.inc:1'],
        ['Relate:File.Close without parens', 9,  'Close', 'classes.inc:2'],
        ['ThisListManager:Browse:1.Init(1)', 10, 'Init',  'classes.inc:5'],
    ];

    for (const [name, line, word, expected] of cases) {
        test(`F12: ${name}`, async () => {
            const { def } = await targets(line, word);
            assert.deepStrictEqual(def, [expected]);
        });
        test(`hover agrees: ${name}`, async () => {
            const { hover } = await targets(line, word);
            assert.strictEqual(hover[0], expected, `hover -> ${JSON.stringify(hover)}`);
        });
    }
});
