/**
 * #627 (#609 phase 3 step C2) — Go to Implementation on `SELF.Method()` must land on the body of
 * the overload the call actually binds to.
 *
 * Same split as #626, one feature further on. `ImplementationProvider.findMethodImplementation`
 * answers a SELF receiver with `ClassMemberResolver.findClassMemberInfo` and a typed-variable
 * receiver with `MemberLocatorService.resolveDotAccess`, and only the second carries #611's
 * rule that a local override the call does not fit cannot hide an inherited overload that does.
 *
 * It is worse here than for F12: the member it picks supplies the CLASS NAME for the
 * cross-file implementation hunt. Pick the wrong overload and the search goes looking for the
 * wrong class's body entirely.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "WinMgr     CLASS,TYPE,MODULE('classes.clw')",                          // 0
    'Run          PROCEDURE(),BYTE,VIRTUAL,PROC',                           // 1  inherited, no args
    'Run          PROCEDURE(USHORT Number,BYTE Request),BYTE,VIRTUAL,PROC', // 2
    '           END',                                                       // 3
];

const CLASSES_CLW = [
    '  MEMBER()',                                                            // 0
    "  INCLUDE('classes.inc')",                                             // 1
    'WinMgr.Run PROCEDURE()',                                                // 2  <- the body the no-arg call binds to
    '  CODE',                                                                // 3
    '  RETURN 0',                                                            // 4
    'WinMgr.Run PROCEDURE(USHORT Number,BYTE Request)',                      // 5
    '  CODE',                                                                // 6
    '  RETURN 0',                                                            // 7
];

const CLW = [
    '  MEMBER()',                                                            // 0
    "  INCLUDE('classes.inc')",                                             // 1
    '  MAP',                                                                 // 2
    '  END',                                                                 // 3
    'Browse PROCEDURE',                                                      // 4
    'ReturnValue          BYTE',                                             // 5
    'ThisWindow           CLASS(WinMgr)',                                    // 6
    'Init                   PROCEDURE(),BYTE,PROC',                          // 7
    'Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC,DERIVED', // 8
    '                     END',                                              // 9
    '  CODE',                                                                // 10
    '  ReturnValue = ThisWindow.Run()',                                      // 11  explicit receiver
    'ThisWindow.Init PROCEDURE()',                                           // 12
    '  CODE',                                                                // 13
    '  ReturnValue = SELF.Run()',                                            // 14  SELF, no args
    '  ReturnValue = SELF.Run(1,2)',                                         // 15  SELF, fits the override
    '  RETURN ReturnValue',                                                  // 16
    'ThisWindow.Run PROCEDURE(USHORT Number,BYTE Request)',                  // 17  <- the override's own body
    '  CODE',                                                                // 18
    '  RETURN 0',                                                            // 19
];

suite('Go to Implementation on SELF.Method() targets the bound overload (#627)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'classes.inc': INC, 'classes.clw': CLASSES_CLW, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function implAt(line: number, word: string) {
        const doc = fx.open('caller.clw');
        const col = CLW[line].indexOf(word);
        const res = await new ImplementationProvider().provideImplementation(doc, { line, character: col + 1 });
        const list: Location[] = !res ? [] : Array.isArray(res) ? res : [res];
        return list.map(l => `${l.uri.split('/').pop()}:${l.range.start.line}`);
    }

    test('CONTROL: explicit receiver, no arguments, lands on the inherited body', async () => {
        assert.deepStrictEqual(await implAt(11, 'Run'), ['classes.clw:2']);
    });

    test('SELF receiver, no arguments, lands on the inherited body too', async () => {
        const got = await implAt(14, 'Run');
        assert.deepStrictEqual(
            got, ['classes.clw:2'],
            `SELF.Run() binds to the inherited no-argument Run, so Go to Implementation must land ` +
            `on its body in classes.clw, not on the two-argument override's body at caller.clw:17 -> ` +
            `${JSON.stringify(got)}`
        );
    });

    test('CONTROL: SELF receiver with arguments lands on the local override body', async () => {
        assert.deepStrictEqual(await implAt(15, 'Run'), ['caller.clw:17']);
    });
});
