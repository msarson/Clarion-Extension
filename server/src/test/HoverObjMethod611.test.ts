/**
 * Hover on `obj.Method(...)` shows the member F12 goes to (#611).
 *
 * Found by the #609 agreement sweep on app1 (13 of 456 positions), F12 right and hover wrong:
 * - `ThisWindow.Run()`: the local ThisWindow overrides only Run(USHORT Number,BYTE Request); hover
 *   showed that two-argument override for a zero-argument call instead of the inherited Run().
 * - `EnhancedFocusManager.Init(...)`, a variable of EnhancedFocusClassType: hover showed the Init of
 *   the procedure's local ThisWindow class - another class altogether.
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    'WinMgr     CLASS,TYPE',                                              // 0
    'Run          PROCEDURE(),BYTE,VIRTUAL,PROC',                         // 1
    'Run          PROCEDURE(USHORT Number,BYTE Request),BYTE,VIRTUAL,PROC', // 2
    'Init         PROCEDURE(),BYTE,VIRTUAL,PROC',                         // 3
    '           END',                                                     // 4
    'FocusType  CLASS,TYPE',                                              // 5
    'Init         PROCEDURE(LONG a,LONG b,LONG c)',                       // 6
    '           END',                                                     // 7
];
const CLW = [
    '  MEMBER()',                                                         // 0
    "  INCLUDE('classes.inc')",                                           // 1
    '  MAP',                                                              // 2
    '  END',                                                              // 3
    'Browse PROCEDURE',                                                   // 4
    'Focus                FocusType',                                     // 5
    'ThisWindow           CLASS(WinMgr)',                                 // 6
    'Init                   PROCEDURE(),BYTE,PROC,DERIVED',               // 7
    'Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC,DERIVED', // 8
    '                     END',                                           // 9
    '  CODE',                                                             // 10
    '  GlobalResponse = ThisWindow.Run()',                                // 11
    '  x# = ThisWindow.Run(1,2)',                                         // 12
    '  Focus.Init(1,2,3)',                                                // 13
    '  x# = ThisWindow.Init()',                                           // 14
    '  x# = ThisWindow.Number',                                           // 15 — only a Run() parameter name
];

suite('Hover on obj.Method(...) shows the member F12 goes to (#611)', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW }); });
    suiteTeardown(() => fx.dispose());

    async function targets(line: number, word: string, nth = 0) {
        const doc = fx.open('caller.clw');
        let col = -1;
        for (let i = 0; i <= nth; i++) col = CLW[line].indexOf(word, col + 1);
        const position = { line, character: col + 1 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            def: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
        };
    }

    const cases: Array<[string, number, string, string]> = [
        ['ThisWindow.Run() is the inherited no-argument Run',       11, 'Run',  'classes.inc:1'],
        ['ThisWindow.Run(1,2) is the local two-argument override',  12, 'Run',  'caller.clw:8'],
        ['Focus.Init(1,2,3) is FocusType.Init, not ThisWindow.Init', 13, 'Init', 'classes.inc:6'],
        ['ThisWindow.Init() is the local override',                 14, 'Init', 'caller.clw:7'],
    ];

    test('a prototype parameter name is not a member of the class (#607 shape, MemberLocatorService)', async () => {
        const { hover, def } = await targets(15, 'Number');
        assert.ok(!hover.includes('caller.clw:8'), `hover -> ${JSON.stringify(hover)}`);
        assert.ok(!def.includes('caller.clw:8'), `F12 -> ${JSON.stringify(def)}`);
    });

    for (const [name, line, word, expected] of cases) {
        test(`hover: ${name}`, async () => {
            const { hover } = await targets(line, word);
            assert.strictEqual(hover[0], expected, `hover -> ${JSON.stringify(hover)}`);
        });
        test(`F12: ${name}`, async () => {
            const { def } = await targets(line, word);
            assert.deepStrictEqual(def, [expected]);
        });
    }
});
