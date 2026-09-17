import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateUndeclaredVariables } from '../providers/diagnostics/UndeclaredVariableDiagnostics';

// #516 — a PROGRAM's main CODE section is executable code, but the validator only
// checked procedure/method/routine bodies, so undeclared variables in the main
// code were missed (and, worse, treated as declarations).

function run(code: string): Diagnostic[] {
    const doc = TextDocument.create('file:///t.clw', 'clarion', 1, code);
    return validateUndeclaredVariables(new ClarionTokenizer(code).tokenize(), doc);
}
const names = (d: Diagnostic[]) => d.map(x => String(x.message).replace(/^'/, '').replace(/'.*$/, '')).sort();

suite('#516 undeclared variables in a PROGRAM main CODE section', () => {

    test('undeclared identifiers in the main CODE are flagged', () => {
        const diags = run([
            '  PROGRAM',
            'GlobalVar LONG',
            '  MAP',
            '  END',
            '  CODE',
            '  IF a = 1',
            '    b = 2',
            '  ELSE',
            '    b = 3',
            '  END',
            '  RETURN',
        ].join('\n'));
        assert.deepStrictEqual(names(diags), ['a', 'b', 'b']);
    });

    test('a global declared in the PROGRAM data and used in main CODE is NOT flagged', () => {
        const diags = run([
            '  PROGRAM',
            'Counter LONG',
            '  CODE',
            '  Counter = 1',
            '  RETURN',
        ].join('\n'));
        assert.strictEqual(diags.length, 0, `unexpected: ${names(diags).join(', ')}`);
    });

    test('the main-code range does not bleed into a following procedure', () => {
        const diags = run([
            '  PROGRAM',
            '  MAP',
            'MyProc PROCEDURE()',
            '  END',
            '  CODE',
            '  mainUndeclared = 1',
            '  RETURN',
            '',
            'MyProc PROCEDURE()',
            'loc LONG',
            '  CODE',
            '  loc = 2',
            '  RETURN',
        ].join('\n'));
        // main code flags its own undeclared; the procedure's declared local is fine.
        assert.deepStrictEqual(names(diags), ['mainUndeclared']);
    });

    test('a MEMBER file (no main CODE) is unaffected', () => {
        const diags = run([
            "  MEMBER('host')",
            'MyProc PROCEDURE()',
            'loc LONG',
            '  CODE',
            '  loc = 2',
            '  RETURN',
        ].join('\n'));
        assert.strictEqual(diags.length, 0, `unexpected: ${names(diags).join(', ')}`);
    });
});
