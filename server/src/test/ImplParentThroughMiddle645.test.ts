/**
 * #645 - Go to Implementation on `PARENT.Method()` when the method is inherited through a class
 * in between.
 *
 * Generated code puts an application-wide window class between `ThisWindow` and the vendor's
 * `WindowManager`, so `PARENT.Init()` inside `ThisWindow.Init` names a method the direct parent
 * does not declare. F12 and hover walked up to the declaring class; Ctrl+F12 looked for the body
 * only in the direct parent (`MidManager.Init`) and found nothing.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "Manager    CLASS,TYPE,MODULE('mgr.clw')",       // 0
    'Init         PROCEDURE(),BYTE,VIRTUAL',         // 1
    'Kill         PROCEDURE(),BYTE,VIRTUAL',         // 2
    '           END',                                // 3
];
const MGR = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('mgr.inc')",                          // 1
    'Manager.Init PROCEDURE()',                      // 2
    '  CODE',                                        // 3
    'Manager.Kill PROCEDURE()',                      // 4
    '  CODE',                                        // 5
];
const MID_INC = [
    "  INCLUDE('mgr.inc'),ONCE",                     // 0
    "MidManager CLASS(Manager),TYPE,MODULE('mid.clw')", // 1
    'Kill         PROCEDURE(),BYTE,DERIVED',         // 2  the middle class overrides Kill only
    '           END',                                // 3
];
const MID = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('mid.inc')",                          // 1
    'MidManager.Kill PROCEDURE()',                   // 2
    '  CODE',                                        // 3
];
const CLW = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('mid.inc')",                          // 1
    '  MAP',                                         // 2
    '  END',                                         // 3
    'Browse PROCEDURE',                              // 4
    'ThisWindow           CLASS(MidManager)',        // 5
    'Init                   PROCEDURE(),BYTE,DERIVED', // 6
    'Kill                   PROCEDURE(),BYTE,DERIVED', // 7
    '                     END',                      // 8
    '  CODE',                                        // 9
    'ThisWindow.Init PROCEDURE()',                   // 10
    '  CODE',                                        // 11
    '  RETURN PARENT.Init()',                        // 12  declared two levels up
    'ThisWindow.Kill PROCEDURE()',                   // 13
    '  CODE',                                        // 14
    '  RETURN PARENT.Kill()',                        // 15  overridden by the direct parent
];

suite('Go to Implementation on PARENT.Method() inherited through a middle class (#645)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'mgr.inc': INC, 'mgr.clw': MGR, 'mid.inc': MID_INC, 'mid.clw': MID, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function implAt(line: number, word: string): Promise<string[]> {
        const doc = fx.open('caller.clw');
        const col = CLW[line].lastIndexOf(word);
        const res = await new ImplementationProvider().provideImplementation(doc, { line, character: col + 1 });
        const list: Location[] = !res ? [] : Array.isArray(res) ? res : [res];
        return list.map(l => `${l.uri.split('/').pop()}:${l.range.start.line}`);
    }

    test('PARENT.Init() opens Manager.Init, the class that declares it', async () => {
        assert.deepStrictEqual(await implAt(12, 'Init'), ['mgr.clw:2']);
    });
    test('CONTROL: PARENT.Kill() opens the direct parent\'s own override', async () => {
        assert.deepStrictEqual(await implAt(15, 'Kill'), ['mid.clw:2']);
    });
});
