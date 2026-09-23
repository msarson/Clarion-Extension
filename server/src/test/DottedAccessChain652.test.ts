/**
 * #652 (#638 step 2) — chains (`SELF.a.b`, `obj.a.b`) name their declaration through the same
 * resolver as a single-level access (#651), so the chain's root is read the same way:
 *
 *  - `SELF` in the second of two same-named local classes is that second class (#650), so the
 *    first segment is looked up there, not in the first procedure's class;
 *  - a root that is itself a local CLASS (`ThisWindow.Helper.Get()`) is that class, not its parent
 *    (#611/#642), so a member it overrides counts;
 *  - the argument-type pick at the end of the chain runs on the class that declares the member,
 *    for hover and Go to Definition alike (#651).
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    "PartA      CLASS,TYPE,MODULE('parts.clw')",     // 0
    'Get          PROCEDURE(),LONG',                 // 1
    '           END',                                // 2
    "PartB      CLASS,TYPE,MODULE('parts.clw')",     // 3
    'Get          PROCEDURE(),LONG',                 // 4
    '           END',                                // 5
    "Base       CLASS,TYPE,MODULE('parts.clw')",     // 6
    'Helper       &PartA',                           // 7  Base's Helper is a PartA
    'AddItem      PROCEDURE(STRING s)',              // 8
    'AddItem      PROCEDURE(LONG n)',                // 9
    '           END',                                // 10
    "Holder     CLASS(Base),TYPE,MODULE('parts.clw')", // 11  inherits AddItem
    '           END',                                // 12
];
const PARTS = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('parts.inc')",                        // 1
    'PartA.Get PROCEDURE()',                         // 2
    '  CODE',                                        // 3
    'PartB.Get PROCEDURE()',                         // 4
    '  CODE',                                        // 5
    'Base.AddItem PROCEDURE(STRING s)',              // 6
    '  CODE',                                        // 7
    'Base.AddItem PROCEDURE(LONG n)',                // 8
    '  CODE',                                        // 9
];
const CLW = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('parts.inc')",                        // 1
    '  MAP',                                         // 2
    '  END',                                         // 3
    'FirstProc PROCEDURE',                           // 4
    'ThisWindow           CLASS(Base)',              // 5
    'Part                   &PartA',                 // 6
    'Init                   PROCEDURE()',            // 7
    '                     END',                      // 8
    '  CODE',                                        // 9
    'ThisWindow.Init PROCEDURE()',                   // 10
    '  CODE',                                        // 11
    '  x# = SELF.Part.Get()',                        // 12  first procedure: PartA.Get
    'SecondProc PROCEDURE',                          // 13
    'Count                LONG',                     // 14
    'Pal                  &Holder',                  // 15
    'ThisWindow           CLASS(Base)',              // 16
    'Part                   &PartB',                 // 17  same label, a PartB here
    'Helper                 &PartB',                 // 18  overrides Base's Helper (a PartA)
    'Init                   PROCEDURE()',            // 19
    '                     END',                      // 20
    '  CODE',                                        // 21
    '  x# = ThisWindow.Helper.Get()',                // 22  local CLASS root: PartB.Get
    'ThisWindow.Init PROCEDURE()',                   // 23
    '  CODE',                                        // 24
    '  x# = SELF.Part.Get()',                        // 25  second procedure: PartB.Get
    '  SELF.Helper.Get()',                           // 26  SELF root, overridden member: PartB.Get
];
const CLW2 = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('parts.inc')",                        // 1
    'Other PROCEDURE',                               // 2
    'Count                LONG',                     // 3
    'Box                  CLASS',                    // 4
    'Pal                    &Holder',                // 5
    '                     END',                      // 6
    '  CODE',                                        // 7
    '  Box.Pal.AddItem(Count)',                      // 8  chain, inherited same-arity overloads: AddItem(LONG)
];

suite('Chains name their declaration through the dotted-access resolver (#652)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'parts.inc': INC, 'parts.clw': PARTS, 'caller.clw': CLW, 'other.clw': CLW2 });
    });
    suiteTeardown(() => fx.dispose());

    async function at(file: string, lines: string[], line: number, word: string) {
        const doc = fx.open(file);
        const position = { line, character: lines[line].lastIndexOf(word) + 1 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            f12: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
        };
    }

    test('CONTROL: SELF.Part.Get() in the first procedure is PartA.Get', async () => {
        assert.deepStrictEqual((await at('caller.clw', CLW, 12, 'Get')).f12, ['parts.inc:1']);
    });
    test('SELF.Part.Get() in the second procedure is PartB.Get, on hover and F12', async () => {
        assert.deepStrictEqual(await at('caller.clw', CLW, 25, 'Get'), { f12: ['parts.inc:4'], hover: ['parts.inc:4', 'parts.clw:4'] });
    });
    test('ThisWindow.Helper.Get() with a local CLASS root that overrides Helper is PartB.Get', async () => {
        assert.deepStrictEqual(await at('caller.clw', CLW, 22, 'Get'), { f12: ['parts.inc:4'], hover: ['parts.inc:4', 'parts.clw:4'] });
    });
    test('SELF.Helper.Get() where the local class overrides Helper is PartB.Get', async () => {
        assert.deepStrictEqual(await at('caller.clw', CLW, 26, 'Get'), { f12: ['parts.inc:4'], hover: ['parts.inc:4', 'parts.clw:4'] });
    });
    test('Box.Pal.AddItem(Count): the inherited AddItem(LONG) overload, on hover and F12', async () => {
        assert.deepStrictEqual(await at('other.clw', CLW2, 8, 'AddItem'), { f12: ['parts.inc:9'], hover: ['parts.inc:9', 'parts.clw:8'] });
    });
});
