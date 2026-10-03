/**
 * #651 (#638 step 1) — hover and Go to Definition name the declaration of `SELF.x`, `PARENT.x` and
 * `obj.x` through one call, DottedAccessResolver.
 *
 * They walked the same steps in parallel code and differed in one: the argument-type pick among
 * same-arity overloads ran on the RECEIVER's class in Go to Definition and on the class that
 * DECLARES the member in hover. For an overload set inherited from a parent the two picked
 * differently: `SELF.AddItem(Count)` with `Count LONG`, where the parent declares
 * AddItem(STRING) before AddItem(LONG).
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    "Base       CLASS,TYPE,MODULE('base.clw')",      // 0
    'AddItem      PROCEDURE(STRING s)',              // 1  same arity, declared first
    'AddItem      PROCEDURE(LONG n)',                // 2  the one a LONG argument binds to
    '           END',                                // 3
];
const BASE = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('base.inc')",                         // 1
    'Base.AddItem PROCEDURE(STRING s)',              // 2
    '  CODE',                                        // 3
    'Base.AddItem PROCEDURE(LONG n)',                // 4
    '  CODE',                                        // 5
];
const CLW = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('base.inc')",                         // 1
    '  MAP',                                         // 2
    '  END',                                         // 3
    'Browse PROCEDURE',                              // 4
    'Count                LONG',                     // 5
    'Other                Base',                     // 6
    'ThisWindow           CLASS(Base)',              // 7
    'Init                   PROCEDURE()',            // 8
    '                     END',                      // 9
    'Deep                 CLASS(ThisWindow)',        // 10
    'Kill                   PROCEDURE()',            // 11
    '                     END',                      // 12
    '  CODE',                                        // 13
    '  ThisWindow.AddItem(Count)',                   // 14  explicit receiver, inherited overloads
    'ThisWindow.Init PROCEDURE()',                   // 15
    '  CODE',                                        // 16
    '  SELF.AddItem(Count)',                         // 17  SELF, inherited overloads
    'Deep.Kill PROCEDURE()',                         // 18
    '  CODE',                                        // 19
    '  PARENT.AddItem(Count)',                       // 20  PARENT, inherited two levels up
];

suite('Hover and F12 name one declaration for SELF.x, PARENT.x and obj.x (#651)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'base.inc': INC, 'base.clw': BASE, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function at(line: number) {
        const doc = fx.open('caller.clw');
        const position = { line, character: CLW[line].indexOf('AddItem') + 1 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            f12: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
        };
    }

    for (const [name, line] of [['SELF.AddItem(Count)', 17], ['ThisWindow.AddItem(Count)', 14], ['PARENT.AddItem(Count)', 20]] as const) {
        test(`${name}: F12 goes to the AddItem(LONG) overload`, async () => {
            assert.deepStrictEqual((await at(line)).f12, ['base.inc:2']);
        });
        test(`${name}: hover shows the same declaration, and its body`, async () => {
            assert.deepStrictEqual((await at(line)).hover, ['base.inc:2', 'base.clw:4']);
        });
    }
});
