/**
 * #639 - Go to Implementation answers for the method only when the cursor is on the method's
 * name.
 *
 * `ImplementationProvider.extractMethodCall` accepted the cursor anywhere inside an
 * `obj.Method(...)` match - the receiver, the SELF / PARENT keyword, any argument - and answered
 * each as the method, opening its body. The chained branch (`SELF.a.b`) read the member after
 * the last dot before the cursor, whatever word the cursor was on. F12 at those positions goes to
 * the receiver, the class or the argument, so Ctrl+F12 contradicted it (found by the #636
 * agreement sweep, by far its largest group).
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "Manager    CLASS,TYPE,MODULE('mgr.clw')",   // 0
    'Init         PROCEDURE(),BYTE,VIRTUAL',     // 1
    'Run          PROCEDURE(),BYTE,VIRTUAL',     // 2
    'Get          PROCEDURE(),LONG',             // 3
    'Q            &RowQueue',                    // 4
    'Helper       &Manager',                     // 5
    '           END',                            // 6
    'RowQueue   QUEUE,TYPE',                     // 7
    'Field        LONG',                         // 8
    '           END',                            // 9
];
const MGR = [
    '  MEMBER()',                                // 0
    "  INCLUDE('mgr.inc')",                      // 1
    'Manager.Init PROCEDURE()',                  // 2
    '  CODE',                                    // 3
    'Manager.Run PROCEDURE()',                   // 4
    '  CODE',                                    // 5
    'Manager.Get PROCEDURE()',                   // 6
    '  CODE',                                    // 7
];
const CLW = [
    '  MEMBER()',                                // 0
    "  INCLUDE('mgr.inc')",                      // 1
    '  MAP',                                     // 2
    '  END',                                     // 3
    'Browse PROCEDURE',                          // 4
    'Result               BYTE',                 // 5
    'Count                LONG',                 // 6
    'Other                Manager',              // 7
    'ThisWindow           CLASS(Manager)',       // 8
    'Init                   PROCEDURE(),BYTE,DERIVED', // 9
    'Take                   PROCEDURE(LONG n)',  // 10
    '                     END',                  // 11
    '  CODE',                                    // 12
    '  Result = ThisWindow.Run()',               // 13
    '  ThisWindow.Take(Count)',                  // 14
    '  ThisWindow.Take(Other.Get())',            // 15
    '  Result = ThisWindow.Run() + Count',       // 16
    'ThisWindow.Init PROCEDURE()',               // 17
    '  CODE',                                    // 18
    '  SELF.Run()',                              // 19
    '  SELF.Q.Field = CHOOSE(Count % 2, 1, 2)',  // 20
    '  SELF.Helper.Get()',                       // 21
    '  RETURN PARENT.Init()',                    // 22
    'ThisWindow.Take PROCEDURE(LONG n)',         // 23
    '  CODE',                                    // 24
];

suite('Go to Implementation answers only on the method name (#639)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'mgr.inc': INC, 'mgr.clw': MGR, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function implAt(line: number, word: string, nth = 0): Promise<string[]> {
        const doc = fx.open('caller.clw');
        let col = -1;
        for (let i = 0; i <= nth; i++) col = CLW[line].indexOf(word, col + 1);
        assert.ok(col >= 0, `fixture: "${word}" not on line ${line}`);
        const res = await new ImplementationProvider().provideImplementation(doc, { line, character: col + 1 });
        const list: Location[] = !res ? [] : Array.isArray(res) ? res : [res];
        return list.map(l => `${l.uri.split('/').pop()}:${l.range.start.line}`);
    }

    // The positions that must answer nothing: F12 goes to a variable, a class or a keyword there.
    test('the receiver of obj.Method()', async () => {
        assert.deepStrictEqual(await implAt(13, 'ThisWindow'), []);
    });
    test('the SELF keyword', async () => {
        assert.deepStrictEqual(await implAt(19, 'SELF'), []);
    });
    test('the PARENT keyword', async () => {
        assert.deepStrictEqual(await implAt(22, 'PARENT'), []);
    });
    test('a variable passed as an argument', async () => {
        assert.deepStrictEqual(await implAt(14, 'Count'), []);
    });
    test('the receiver of a dotted argument', async () => {
        assert.deepStrictEqual(await implAt(15, 'Other'), []);
    });
    test('a variable after the call on the same line', async () => {
        assert.deepStrictEqual(await implAt(16, 'Count'), []);
    });
    test('a word after a chained member on the same line', async () => {
        assert.deepStrictEqual(await implAt(20, 'CHOOSE'), []);
        assert.deepStrictEqual(await implAt(20, 'Count'), []);
    });

    // Controls: the method name itself still opens the body.
    test('CONTROL: the method name of obj.Method()', async () => {
        assert.deepStrictEqual(await implAt(13, 'Run'), ['mgr.clw:4']);
    });
    test('CONTROL: the method name with an argument', async () => {
        assert.deepStrictEqual(await implAt(14, 'Take'), ['caller.clw:23']);
    });
    test('the inner call of a nested call opens its own body, not the outer one', async () => {
        assert.deepStrictEqual(await implAt(15, 'Get'), ['mgr.clw:6']);
    });
    test('CONTROL: SELF.Method()', async () => {
        assert.deepStrictEqual(await implAt(19, 'Run'), ['mgr.clw:4']);
    });
    test('CONTROL: the last member of a chain', async () => {
        assert.deepStrictEqual(await implAt(21, 'Get'), ['mgr.clw:6']);
    });
});
