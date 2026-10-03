/**
 * #622 (#609 phase 3, step A) — the single "class of this method" resolver.
 *
 * Pins the behaviour the six scattered copies had between them, taking the most correct of each:
 * the routine hop fires only for a ROUTINE, and the line pattern accepts the 3-part
 * `Class.Interface.Method` form and colon-bearing labels (#247).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { resolveEnclosingClassName, classNameFromMethodLabel, isMethodImplementationLabel } from '../utils/EnclosingClassResolver';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    "  MEMBER('prog.clw')",                       // 0
    '  MAP',                                      // 1
    '  END',                                      // 2
    '',                                           // 3
    'PlainProc PROCEDURE()',                      // 4  — not a method
    '  CODE',                                     // 5
    '  RETURN',                                   // 6
    '',                                           // 7
    'MyClass.MyMethod PROCEDURE()',               // 8  — 2-part
    '  CODE',                                     // 9
    '  RETURN',                                   // 10
    '',                                           // 11
    'MyOwn:CLASS.My:My:Method PROCEDURE()',       // 12 — colon labels both sides (#247)
    '  CODE',                                     // 13
    '  RETURN',                                   // 14
    '',                                           // 15
    'HostClass.IFace.Run PROCEDURE()',            // 16 — 3-part interface form
    '  CODE',                                     // 17
    '  RETURN',                                   // 18
    '',                                           // 19
    'OwnerClass.WithRoutine PROCEDURE()',         // 20
    '  CODE',                                     // 21
    '  DO Helper',                                // 22
    'Helper ROUTINE',                             // 23 — a routine inside a method
    '  DATA',                                     // 24
    'NDX  LONG',                                  // 25
    '  CODE',                                     // 26
    '  NDX = 1',                                  // 27
].join('\r\n');

function docAndStructure() {
    const doc = TextDocument.create('file:///c:/tmp/enclosing.clw', 'clarion', 1, SOURCE);
    TokenCache.getInstance().getTokens(doc);   // populates the cached structure
    return doc;
}

suite('EnclosingClassResolver — class of this method (#622)', () => {
    setup(() => setServerInitialized(true));
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const cases: Array<[string, number, string | null]> = [
        ['a plain procedure body has no class',            5,  null],
        ['a 2-part method body',                            9,  'MyClass'],
        ['colon-bearing labels on both sides (#247)',      13,  'MyOwn:CLASS'],
        ['the 3-part Class.Interface.Method form',         17,  'HostClass'],
        ['a method body that owns a routine',              21,  'OwnerClass'],
        ['a ROUTINE body asks its parent procedure',       27,  'OwnerClass'],
        ["a routine's DATA section likewise",              25,  'OwnerClass'],
    ];

    for (const [label, line, expected] of cases) {
        test(label, () => {
            const doc = docAndStructure();
            assert.strictEqual(resolveEnclosingClassName(doc, line), expected,
                `line ${line}: ${JSON.stringify(SOURCE.split(/\r?\n/)[line])}`);
        });
    }

    test('a line outside any scope resolves to null', () => {
        const doc = docAndStructure();
        assert.strictEqual(resolveEnclosingClassName(doc, 3), null);
    });

    suite('label splitters', () => {
        test('a dotted label is a method implementation', () => {
            assert.strictEqual(isMethodImplementationLabel('MyClass.MyMethod'), true);
            assert.strictEqual(isMethodImplementationLabel('PlainProc'), false);
        });
        test('the class is the part before the FIRST dot', () => {
            assert.strictEqual(classNameFromMethodLabel('MyClass.MyMethod'), 'MyClass');
            assert.strictEqual(classNameFromMethodLabel('HostClass.IFace.Run'), 'HostClass');
            assert.strictEqual(classNameFromMethodLabel('MyOwn:CLASS.My:My:Method'), 'MyOwn:CLASS');
        });
        test('a label with no dot carries no class', () => {
            assert.strictEqual(classNameFromMethodLabel('PlainProc'), null);
            assert.strictEqual(classNameFromMethodLabel('.Leading'), null);
        });
    });
});
