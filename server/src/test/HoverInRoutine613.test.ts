/**
 * Hover on a field of a typed QUEUE whose TYPE the MEMBER parent declares (#613).
 *
 * Found by the #609 agreement sweep on app1: `UvFieldQ.AltIDToolTip` (UvFieldQ QUEUE(tqRwField))
 * and `ssFieldQ.Desc` - hover empty after 3-6s, F12 right. tqRwField is declared in the PROGRAM
 * file acmquery.clw; since #483 the structure index leaves a PROGRAM's data out, and hover's
 * type-field lookup never read the MEMBER parent itself. All the app1 cases sat in ROUTINEs, so
 * the routine shapes stay pinned here too - they were never the cause. (The sweep's third case,
 * `sqlStmt.SetValue`, was inside an OMIT block, where hover shows nothing by design.)
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    'Strings    CLASS,TYPE',                            // 0
    'SetValue     PROCEDURE(STRING s)',                 // 1
    '           END',                                   // 2
    'tqField    QUEUE,TYPE',                            // 3
    'Desc         CSTRING(40)',                         // 4
    'Tip          CSTRING(40)',                         // 5
    '           END',                                   // 6
];
const CLW = [
    '  MEMBER()',                                       // 0
    "  INCLUDE('classes.inc')",                         // 1
    '  MAP',                                            // 2
    '  END',                                            // 3
    'Build PROCEDURE',                                  // 4
    'Stmt          Strings',                            // 5
    'FieldQ        QUEUE(tqField)',                     // 6
    '              END',                                // 7
    '  CODE',                                           // 8
    "  Stmt.SetValue('a')",                             // 9  — control: procedure code
    "  FieldQ.Tip = ''",                                // 10 — control
    '  DO Fill',                                        // 11
    'Fill ROUTINE',                                     // 12
    "  Stmt.SetValue('b')",                             // 13
    "  FieldQ.Tip = ''",                                // 14
    "  FieldQ.Desc = 'x'",                              // 15
];

// The app1 shape: the QUEUE,TYPE lives in the PROGRAM file, the procedure in a MEMBER module of it.
const PROG = [
    '  PROGRAM',
    '  MAP',
    '  END',
    'tqRow      QUEUE,TYPE',                            // 3
    'Desc         CSTRING(40)',                         // 4
    'AltTip       CSTRING(40)',                         // 5
    '           END',
    '  CODE',
];
const MEMBERMOD = [
    "  MEMBER('prog.clw')",                              // 0
    'Report PROCEDURE',                                 // 1
    'RowQ          QUEUE(tqRow)',                       // 2
    '              END',                                // 3
    '  CODE',                                           // 4
    "  RowQ.AltTip = ''",                               // 5 — procedure code
    '  DO Build',                                       // 6
    'Build ROUTINE',                                    // 7
    "  RowQ.AltTip = ''",                               // 8 — routine
];

suite('Hover on typed-QUEUE fields and typed variables, across MEMBER parents and ROUTINEs (#613)', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW, 'prog.clw': PROG, 'member.clw': MEMBERMOD }); });
    suiteTeardown(() => fx.dispose());

    async function targets(line: number, word: string, file = 'caller.clw', lines = CLW) {
        const doc = fx.open(file);
        const position = { line, character: lines[line].indexOf(word) + 1 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            def: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
        };
    }

    const cases: Array<[string, number, string, string]> = [
        ['class method, procedure code (control)',   9,  'SetValue', 'classes.inc:1'],
        ['QUEUE field, procedure code (control)',    10, 'Tip',      'classes.inc:5'],
        ['class method from a routine',              13, 'SetValue', 'classes.inc:1'],
        ['class-typed variable from a routine',      13, 'Stmt',     'caller.clw:5'],
        ['typed QUEUE field from a routine',         14, 'Tip',      'classes.inc:5'],
        ['typed QUEUE first field from a routine',   15, 'Desc',     'classes.inc:4'],
    ];

    const memberCases: Array<[string, number, string, string]> = [
        ['field of a QUEUE,TYPE from the MEMBER parent, procedure code', 5, 'AltTip', 'prog.clw:5'],
        ['field of a QUEUE,TYPE from the MEMBER parent, in a routine',   8, 'AltTip', 'prog.clw:5'],
    ];
    for (const [name, line, word, expected] of memberCases) {
        test(`hover: ${name}`, async () => {
            const { hover } = await targets(line, word, 'member.clw', MEMBERMOD);
            assert.ok(hover.includes(expected), `hover -> ${JSON.stringify(hover)}`);
        });
        test(`F12: ${name}`, async () => {
            const { def } = await targets(line, word, 'member.clw', MEMBERMOD);
            assert.deepStrictEqual(def, [expected]);
        });
    }

    for (const [name, line, word, expected] of cases) {
        test(`hover: ${name}`, async () => {
            const { hover } = await targets(line, word);
            assert.ok(hover.includes(expected), `hover -> ${JSON.stringify(hover)}`);
        });
        test(`F12: ${name}`, async () => {
            const { def } = await targets(line, word);
            assert.deepStrictEqual(def, [expected]);
        });
    }
});
