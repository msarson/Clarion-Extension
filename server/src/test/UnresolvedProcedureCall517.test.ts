import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateUnresolvedProcedureCalls } from '../providers/diagnostics/UnresolvedProcedureCallDiagnostics';

// #517 — opt-in diagnostic for a call to a procedure that resolves to no
// declaration anywhere. The SDI predicate is injected so the check runs without
// a live index. `known` is the set of procedure names the solution index knows.

// The cross-file fallback is stubbed as "declared nowhere else" so these tests stay
// in-memory; the fallback itself is covered in UnresolvedProcedureCall517.Fallback.test.ts.
async function run(code: string, known: string[] = [], ready = true): Promise<Diagnostic[]> {
    const doc = TextDocument.create('file:///t.clw', 'clarion', 1, code);
    const tokens = new ClarionTokenizer(code).tokenize();
    const set = new Set(known.map(n => n.toLowerCase()));
    return validateUnresolvedProcedureCalls(tokens, doc, name => set.has(name.toLowerCase()), ready,
        async () => 'unresolved');
}
const flagged = (d: Diagnostic[]) => d.map(x => String(x.message).replace(/^Procedure '/, '').replace(/'.*$/, '')).sort();

suite('#517 unresolved procedure calls', () => {

    test('a call to a procedure declared nowhere is flagged', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', '  DoesNotExist()', '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), ['DoesNotExist']);
    });

    test('flagged in a PROGRAM main CODE section too (#516 parity)', async () => {
        const d = await run(['  PROGRAM', '  MAP', '  END', '  CODE', '  Gone()', '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), ['Gone']);
    });

    test('a bare (parameterless) call statement is flagged', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', '  MissingProc', '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), ['MissingProc']);
    });

    test('a call to a procedure declared in this file\'s MAP is NOT flagged', async () => {
        const d = await run([
            '  PROGRAM',
            '  MAP',
            'RealProc PROCEDURE()',
            '  END',
            '  CODE',
            '  RealProc()',
            '  RETURN',
        ].join('\n'));
        assert.deepStrictEqual(flagged(d), []);
    });

    test('a procedure known to the solution index is NOT flagged', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', '  LibraryProc()', '  RETURN'].join('\n'), ['LibraryProc']);
        assert.deepStrictEqual(flagged(d), []);
    });

    test('a built-in function is NOT flagged', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', '  MESSAGE(\'hi\')', '  HALT()', '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), []);
    });

    test('a method / qualified call is out of scope (NOT flagged)', async () => {
        const d = await run(['MyProc PROCEDURE()', 'obj &MyClass', '  CODE', '  obj.DoesNotExist()', '  SELF.AlsoMissing()', '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), []);
    });

    test('a name declared as a local/global variable is NOT flagged', async () => {
        const d = await run([
            '  PROGRAM',
            'CallbackProc LONG',
            '  CODE',
            '  CallbackProc()',
            '  RETURN',
        ].join('\n'));
        assert.deepStrictEqual(flagged(d), []);
    });

    test('a procedure REFERENCE (START/ADDRESS) is not a call', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', '  START(SomeThread)', '  x = ADDRESS(SomeProc)', '  RETURN'].join('\n'), ['START', 'ADDRESS']);
        // START/ADDRESS are builtins; their arguments are references, never flagged.
        assert.deepStrictEqual(flagged(d), []);
    });

    // A colon-prefixed procedure (`CommonLib:Kill PROCEDURE,DLL` — every generated
    // DLL-init/kill pair) tokenizes in two shapes: one token when the prefix is 8
    // characters or fewer (`ABC:Init`), Variable ':' Function above that
    // (`CommonLib` ':' `Kill`). The real-solution trial flagged `Kill` on the
    // second shape because only the part after the colon was looked up.
    const PREFIXED = [
        '  PROGRAM',
        '  MAP',
        'CommonLib:Kill  PROCEDURE,DLL',
        'ABC:Init        PROCEDURE,DLL',
        '  END',
        '  CODE',
        '  CommonLib:Kill()',
        '  ABC:Init()',
        '  RETURN',
    ];

    test('a colon-prefixed call declared in the MAP is NOT flagged (both tokenizer shapes)', async () => {
        assert.deepStrictEqual(flagged(await run(PREFIXED.join('\n'))), []);
    });

    test('a colon-prefixed call declared nowhere is flagged under its FULL name', async () => {
        const d = await run([...PREFIXED.slice(0, 8), '  CommonLib:Missing()', '  ABC:Gone()', '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), ['ABC:Gone', 'CommonLib:Missing']);
        const long = d.find(x => String(x.message).includes('CommonLib:Missing'))!;
        assert.strictEqual(long.range.start.character, 2, 'the squiggle starts at the prefix, not at the colon');
    });

    test('a call with a space before its paren — `Name (args)` — is a call (#509 real-solution find)', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', "  Gone ('x')", '  RETURN'].join('\n'));
        assert.deepStrictEqual(flagged(d), ['Gone']);
    });

    test('nothing is flagged when the procedure index is not ready', async () => {
        const d = await run(['MyProc PROCEDURE()', '  CODE', '  DoesNotExist()', '  RETURN'].join('\n'), [], /* ready */ false);
        assert.deepStrictEqual(flagged(d), []);
    });
});
