/**
 * #644 - Go to Implementation on a member of a colon-named receiver.
 *
 * The Ctrl+F12 counterpart of #612. `Relate:Cust.Open()`, `Access:Cust.TryFetch(...)` and
 * `ThisListManager:Browse:1.Init(...)` are how every generated procedure opens files and drives
 * its list managers. extractMethodCall read the receiver with `\w+`, which stops at the colon
 * (`Cust`, `1`), so nothing resolved it, and the last fallback took any same-named body in the
 * file: another class's `Init`.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "RelMgr     CLASS,TYPE,MODULE('classes.clw')",      // 0
    'Open         PROCEDURE(),BYTE,PROC',               // 1
    'Close        PROCEDURE()',                         // 2
    '           END',                                   // 3
    "ListMgr    CLASS,TYPE,MODULE('classes.clw')",      // 4
    'Init         PROCEDURE(LONG a)',                   // 5
    '           END',                                   // 6
    "WinMgr     CLASS,TYPE,MODULE('classes.clw')",      // 7
    'Init         PROCEDURE(),BYTE,VIRTUAL',            // 8
    '           END',                                   // 9
];
const CLASSES_CLW = [
    '  MEMBER()',                                       // 0
    "  INCLUDE('classes.inc')",                         // 1
    'RelMgr.Open PROCEDURE()',                          // 2
    '  CODE',                                           // 3
    'RelMgr.Close PROCEDURE()',                         // 4
    '  CODE',                                           // 5
    'ListMgr.Init PROCEDURE(LONG a)',                   // 6
    '  CODE',                                           // 7
    'WinMgr.Init PROCEDURE()',                          // 8
    '  CODE',                                           // 9
];
const CLW = [
    '  MEMBER()',                                       // 0
    "  INCLUDE('classes.inc')",                         // 1
    'Relate:Cust          &RelMgr',                     // 2
    '  MAP',                                            // 3
    '  END',                                            // 4
    'Browse PROCEDURE',                                 // 5
    'ThisListManager:Browse:1 ListMgr',                 // 6
    'ThisWindow           CLASS(WinMgr)',               // 7
    'Init                   PROCEDURE(),BYTE,DERIVED',  // 8
    '                     END',                         // 9
    '  CODE',                                           // 10
    '  Relate:Cust.Open()',                             // 11
    '  Relate:Cust.Close',                              // 12
    '  ThisListManager:Browse:1.Init(1)',               // 13
    'ThisWindow.Init PROCEDURE()',                      // 14  a same-named body of another class
    '  CODE',                                           // 15
];

suite('Go to Implementation on a member of a colon-named receiver (#644)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'classes.inc': INC, 'classes.clw': CLASSES_CLW, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function implAt(line: number, word: string, fromEnd = true): Promise<string[]> {
        const doc = fx.open('caller.clw');
        const col = fromEnd ? CLW[line].lastIndexOf(word) : CLW[line].indexOf(word);
        assert.ok(col >= 0, `fixture: "${word}" not on line ${line}`);
        const res = await new ImplementationProvider().provideImplementation(doc, { line, character: col + 1 });
        const list: Location[] = !res ? [] : Array.isArray(res) ? res : [res];
        return list.map(l => `${l.uri.split('/').pop()}:${l.range.start.line}`);
    }

    test('Relate:File.Open() opens the manager\'s body', async () => {
        assert.deepStrictEqual(await implAt(11, 'Open'), ['classes.clw:2']);
    });
    test('Relate:File.Close without parens opens the manager\'s body', async () => {
        assert.deepStrictEqual(await implAt(12, 'Close'), ['classes.clw:4']);
    });
    test('ThisListManager:Browse:1.Init(1) opens ListMgr.Init, not another class\'s Init', async () => {
        assert.deepStrictEqual(await implAt(13, 'Init'), ['classes.clw:6']);
    });
    test('the colon-named receiver itself has no implementation (#639)', async () => {
        assert.deepStrictEqual(await implAt(13, 'ThisListManager', false), []);
        assert.deepStrictEqual(await implAt(11, 'Relate', false), []);
    });
});
