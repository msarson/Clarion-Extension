/**
 * #643 - Go to Implementation, and hover's link to the body, open the body of the overload the
 * call binds to.
 *
 * `WindowManager.AddItem` has eight overloads; generated code calls the two-parameter one as
 * `SELF.AddItem(?Control, Action)`. Go to Definition picked that overload's declaration, but the
 * body lookup that follows it landed on the first same-named body, a single-parameter one -
 * when the method is inherited through a class in between (an application's own window class
 * between ThisWindow and WindowManager, as generated code has). With the declaring class as the
 * direct parent it already worked; those cases stay as controls.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    "Manager    CLASS,TYPE,MODULE('mgr.clw')",           // 0
    'Init         PROCEDURE(),BYTE,VIRTUAL',             // 1  (Holder below: a chained receiver)
    'AddItem      PROCEDURE(Manager Other)',             // 2
    'AddItem      PROCEDURE(Helper H)',                  // 3
    'AddItem      PROCEDURE(SIGNED Control,BYTE Action)', // 4
    '           END',                                    // 5
    "Helper     CLASS,TYPE,MODULE('mgr.clw')",           // 6
    '           END',                                    // 7
];
const MGR = [
    '  MEMBER()',                                        // 0
    "  INCLUDE('mgr.inc')",                              // 1
    'Manager.Init PROCEDURE()',                          // 2
    '  CODE',                                            // 3
    'Manager.AddItem PROCEDURE(Manager Other)',          // 4
    '  CODE',                                            // 5
    'Manager.AddItem PROCEDURE(Helper H)',               // 6
    '  CODE',                                            // 7
    'Manager.AddItem PROCEDURE(SIGNED Control, BYTE Action)', // 8  <- the two-parameter body
    '  CODE',                                            // 9
];
const MID_INC = [
    "  INCLUDE('mgr.inc'),ONCE",                       // 0
    "MidManager CLASS(Manager),TYPE,MODULE('mid.clw')", // 1
    'Extra        PROCEDURE()',                          // 2
    'Pal          &Manager',                             // 3
    '           END',                                    // 4
];
const MID = [
    '  MEMBER()',                                        // 0
    "  INCLUDE('mid.inc')",                              // 1
    'MidManager.Extra PROCEDURE()',                      // 2
    '  CODE',                                            // 3
];
const CLW = [
    '  MEMBER()',                                        // 0
    "  INCLUDE('mid.inc')",                              // 1
    '  MAP',                                             // 2
    '  END',                                             // 3
    'RequestCancelled EQUATE(2)',                        // 4
    'Browse PROCEDURE',                                  // 5
    'Win                  WINDOW(\'x\'),AT(,,10,10)',    // 6
    '                       BUTTON(\'Cancel\'),USE(?Ok:Cancel)', // 7
    '                     END',                          // 8
    'Other                Manager',                      // 9
    'Viewer               MidManager',                   // 10
    'ThisWindow           CLASS(Manager)',               // 11
    'Init                   PROCEDURE(),BYTE,DERIVED',   // 12
    '                     END',                          // 13
    'Deep                 CLASS(MidManager)',            // 14
    'Init                   PROCEDURE(),BYTE,DERIVED',   // 15
    '                     END',                          // 16
    '  CODE',                                            // 17
    '  Other.AddItem(?Ok:Cancel, RequestCancelled)',     // 18  typed variable, direct
    '  Viewer.AddItem(?Ok:Cancel, RequestCancelled)',    // 19  typed variable, through MidManager
    'ThisWindow.Init PROCEDURE()',                       // 20
    '  CODE',                                            // 21
    '  SELF.AddItem(?Ok:Cancel, RequestCancelled)',      // 22  SELF, direct
    '  SELF.AddItem(1, 2)',                              // 23  SELF, plain literals
    '  PARENT.AddItem(?Ok:Cancel, RequestCancelled)',    // 24  PARENT, direct
    'Deep.Init PROCEDURE()',                             // 25
    '  CODE',                                            // 26
    '  SELF.AddItem(?Ok:Cancel, RequestCancelled)',      // 27  SELF, through MidManager
    '  PARENT.AddItem(?Ok:Cancel, RequestCancelled)',    // 28  PARENT, through MidManager
    '  SELF.Pal.AddItem(?Ok:Cancel, RequestCancelled)',  // 29  chained
];

suite('Go to Implementation opens the body of the overload the call binds to (#643)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'mgr.inc': INC, 'mgr.clw': MGR, 'mid.inc': MID_INC, 'mid.clw': MID, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);

    async function at(line: number) {
        const doc = fx.open('caller.clw');
        const position = { line, character: CLW[line].indexOf('AddItem') + 1 };
        const impl = await new ImplementationProvider().provideImplementation(doc, position);
        return {
            f12: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            impl: show(definitionLocations(impl as Location | Location[] | null)),
        };
    }

    for (const [name, line] of [
        ['SELF.AddItem(?Control, Equate), direct parent', 22],
        ['SELF.AddItem(1, 2), direct parent', 23],
        ['PARENT.AddItem(?Control, Equate), direct parent', 24],
        ['Other.AddItem(?Control, Equate), direct parent', 18],
        ['SELF.AddItem(?Control, Equate), through a middle class', 27],
        ['PARENT.AddItem(?Control, Equate), through a middle class', 28],
        ['Viewer.AddItem(?Control, Equate), through a middle class', 19],
        ['SELF.Pal.AddItem(?Control, Equate), a chained receiver', 29],
    ] as const) {
        test(`${name}: F12 names the two-parameter overload`, async () => {
            assert.deepStrictEqual((await at(line)).f12, ['mgr.inc:4']);
        });
        test(`${name}: Ctrl+F12 opens that overload's body`, async () => {
            assert.deepStrictEqual((await at(line)).impl, ['mgr.clw:8']);
        });
        test(`${name}: hover links that overload's declaration and body`, async () => {
            assert.deepStrictEqual((await at(line)).hover, ['mgr.inc:4', 'mgr.clw:8']);
        });
    }
});
