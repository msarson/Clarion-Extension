/**
 * #626 (#609 phase 3 step C2) — `SELF.Method()` and `obj.Method()` must pick the same overload.
 *
 * #611 established the rule: a class that declares the name but no overload the call fits
 * does not hide an inherited one that does. `ThisWindow.Run()` on a ThisWindow overriding
 * only `Run(USHORT,BYTE)` is the parent's `Run()`.
 *
 * That fix lives in `MemberLocatorService.preferFittingInheritedOverload`, and providers
 * reach MemberLocatorService only for a typed-variable or class-label receiver. A `SELF.`
 * or `PARENT.` receiver is routed to ClassMemberResolver instead — inside the very same
 * method of DefinitionProvider and ImplementationProvider — and that path has no
 * equivalent step. So the same call, written the two ways Clarion allows, should be
 * resolving to two different declarations.
 *
 * The existing #611 test only ever writes the explicit-receiver form, which is why this
 * survived. The control cases here are the point: the explicit form must keep working, and
 * a call that DOES fit the local override must still choose it.
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    'WinMgr     CLASS,TYPE',                                                // 0
    'Run          PROCEDURE(),BYTE,VIRTUAL,PROC',                           // 1  <- the inherited no-arg overload
    'Run          PROCEDURE(USHORT Number,BYTE Request),BYTE,VIRTUAL,PROC', // 2
    'Init         PROCEDURE(),BYTE,VIRTUAL,PROC',                           // 3
    '           END',                                                       // 4
];

const CLW = [
    '  MEMBER()',                                                            // 0
    "  INCLUDE('classes.inc')",                                             // 1
    '  MAP',                                                                 // 2
    '  END',                                                                 // 3
    'Browse PROCEDURE',                                                      // 4
    'ReturnValue          BYTE',                                             // 5
    'ThisWindow           CLASS(WinMgr)',                                    // 6
    'Init                   PROCEDURE(),BYTE,PROC,DERIVED',                  // 7
    'Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC,DERIVED', // 8  <- local override only
    '                     END',                                              // 9
    '  CODE',                                                                // 10
    '  ReturnValue = ThisWindow.Run()',                                      // 11  explicit receiver, no args
    'ThisWindow.Init PROCEDURE()',                                           // 12
    '  CODE',                                                                // 13
    '  ReturnValue = SELF.Run()',                                            // 14  SELF receiver, no args
    '  ReturnValue = SELF.Run(1,2)',                                         // 15  SELF receiver, fits the override
    '  RETURN ReturnValue',                                                  // 16
];

suite('SELF.Method() picks the same overload as obj.Method() (#626)', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW }); });
    suiteTeardown(() => fx.dispose());

    async function targets(line: number, word: string) {
        const doc = fx.open('caller.clw');
        const col = CLW[line].indexOf(word);
        const position = { line, character: col + 1 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            def: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
        };
    }

    test('CONTROL: explicit receiver, no arguments, is the inherited Run() (#611)', async () => {
        const { hover, def } = await targets(11, 'Run');
        assert.deepStrictEqual(def, ['classes.inc:1'], `F12 -> ${JSON.stringify(def)}`);
        assert.strictEqual(hover[0], 'classes.inc:1', `hover -> ${JSON.stringify(hover)}`);
    });

    test('SELF receiver, no arguments, is the inherited Run() too', async () => {
        const { def } = await targets(14, 'Run');
        assert.deepStrictEqual(
            def, ['classes.inc:1'],
            `SELF.Run() should resolve to the inherited no-argument overload, not the local ` +
            `two-argument override at caller.clw:8 -> ${JSON.stringify(def)}`
        );
    });

    test('SELF receiver, no arguments: hover agrees with F12', async () => {
        const { hover } = await targets(14, 'Run');
        assert.strictEqual(
            hover[0], 'classes.inc:1',
            `hover on SELF.Run() -> ${JSON.stringify(hover)}`
        );
    });

    test('CONTROL: SELF receiver with arguments still picks the local override', async () => {
        const { hover, def } = await targets(15, 'Run');
        assert.deepStrictEqual(def, ['caller.clw:8'], `F12 -> ${JSON.stringify(def)}`);
        assert.strictEqual(hover[0], 'caller.clw:8', `hover -> ${JSON.stringify(hover)}`);
    });
});
