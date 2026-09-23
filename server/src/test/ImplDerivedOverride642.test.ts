/**
 * #642 - Go to Implementation on `ThisWindow.Run()` opens the local class's own override.
 *
 * Every generated window declares `ThisWindow CLASS(WindowManager)` in the procedure, overrides
 * some of its methods with `,DERIVED`, and calls `ThisWindow.Run()`. F12 goes to the override's
 * declaration in the local class and hover links its body, but Ctrl+F12 opened the parent's
 * `WindowManager.Run` body instead of `ThisWindow.Run`.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "Manager    CLASS,TYPE,MODULE('mgr.clw')",       // 0
    'Init         PROCEDURE(),BYTE,VIRTUAL',         // 1
    'Run          PROCEDURE(),BYTE,VIRTUAL',         // 2
    'Kill         PROCEDURE(),BYTE,VIRTUAL',         // 3
    '           END',                                // 4
];
const MGR = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('mgr.inc')",                          // 1
    'Manager.Init PROCEDURE()',                      // 2
    '  CODE',                                        // 3
    'Manager.Run PROCEDURE()',                       // 4
    '  CODE',                                        // 5
    'Manager.Kill PROCEDURE()',                      // 6
    '  CODE',                                        // 7
];
const CLW = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('mgr.inc')",                          // 1
    '  MAP',                                         // 2
    '  END',                                         // 3
    'Browse PROCEDURE',                              // 4
    'Result               BYTE',                     // 5
    'ThisWindow           CLASS(Manager)',           // 6
    'Init                   PROCEDURE(),BYTE,DERIVED', // 7
    'Run                    PROCEDURE(),BYTE,DERIVED', // 8
    '                     END',                      // 9
    '  CODE',                                        // 10
    '  Result = ThisWindow.Run()',                   // 11  overridden
    '  Result = ThisWindow.Kill()',                  // 12  inherited, not overridden
    'ThisWindow.Init PROCEDURE()',                   // 13
    '  CODE',                                        // 14
    '  RETURN SELF.Run()',                           // 15
    'ThisWindow.Run PROCEDURE()',                    // 16  the override's body
    '  CODE',                                        // 17
    '  RETURN PARENT.Run()',                         // 18
];

suite('Go to Implementation on a DERIVED override opens the override (#642)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'mgr.inc': INC, 'mgr.clw': MGR, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function implAt(line: number, word: string): Promise<string[]> {
        const doc = fx.open('caller.clw');
        const col = CLW[line].lastIndexOf(word);
        assert.ok(col >= 0, `fixture: "${word}" not on line ${line}`);
        const res = await new ImplementationProvider().provideImplementation(doc, { line, character: col + 1 });
        const list: Location[] = !res ? [] : Array.isArray(res) ? res : [res];
        return list.map(l => `${l.uri.split('/').pop()}:${l.range.start.line}`);
    }

    test('ThisWindow.Run() opens ThisWindow.Run, not the parent\'s Manager.Run', async () => {
        assert.deepStrictEqual(await implAt(11, 'Run'), ['caller.clw:16']);
    });
    test('CONTROL: a method the local class does not override opens the parent\'s body', async () => {
        assert.deepStrictEqual(await implAt(12, 'Kill'), ['mgr.clw:6']);
    });
    test('CONTROL: SELF.Run() inside the class opens the override', async () => {
        assert.deepStrictEqual(await implAt(15, 'Run'), ['caller.clw:16']);
    });
    test('CONTROL: PARENT.Run() inside the override opens the parent\'s body', async () => {
        assert.deepStrictEqual(await implAt(18, 'Run'), ['mgr.clw:4']);
    });
});
