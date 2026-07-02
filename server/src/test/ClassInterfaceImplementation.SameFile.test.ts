import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';

/**
 * Issue #181 — a CLASS can be declared AND implemented in the same source module
 * (a PROGRAM/MEMBER `.clw`) with no `,MODULE('x.clw')` attribute. In that case the
 * interface implementations are three-part `Class.Interface.Method PROCEDURE`
 * definitions in THIS file's CODE section.
 *
 * The diagnostic must scan the current document for those impls when there's no
 * MODULE attribute AND the document is itself an implementation module
 * (PROGRAM/MEMBER). A declaration-only `.inc` (getDocumentKind() === undefined)
 * with no MODULE is still skipped — its impls live in an unknown module.
 *
 * Bidirectional pin:
 *   - Bug-pin: same-file class missing one three-part impl → warns, names it.
 *   - Sentinel: same-file class implementing all methods → no warning.
 *   - Overload sentinel: same-name interface methods with different param counts
 *     are matched independently.
 */

let docCounter = 0;
function makeDoc(lines: string[]): TextDocument {
    return TextDocument.create(`file:///samefile-iface-${++docCounter}.clw`, 'clarion', 1, lines.join('\n'));
}
async function diags(lines: string[]) {
    const doc = makeDoc(lines);
    const tokens = TokenCache.getInstance().getTokens(doc);
    const svc = new MemberLocatorService();
    return validateClassInterfaceImplementationAsync(tokens, doc, svc);
}

suite('Issue #181 — same-file class+interface implementation (no MODULE attribute)', () => {

    test('class missing a three-part impl in the same PROGRAM module — warns and names it', async () => {
        const d = await diags([
            '  PROGRAM',
            '  MAP',
            '  END',
            'IGreeter  INTERFACE,TYPE',
            'Hello       PROCEDURE',
            'Goodbye     PROCEDURE',
            '          END',
            'MyGreeter CLASS,IMPLEMENTS(IGreeter)',
            'Init        PROCEDURE',
            '          END',
            '  CODE',
            'MyGreeter.IGreeter.Hello PROCEDURE',
            '  CODE',
            '  RETURN',
            'MyGreeter.Init PROCEDURE',
            '  CODE',
            '  RETURN',
        ]);
        assert.strictEqual(d.length, 1,
            `expected one missing-impl warning (Goodbye); got: ${JSON.stringify(d.map(x => x.message))}`);
        assert.ok(/Goodbye/i.test(d[0].message), `should name Goodbye; got: ${d[0].message}`);
    });

    test('class implementing all interface methods in the same module — no warning', async () => {
        const d = await diags([
            '  PROGRAM',
            '  MAP',
            '  END',
            'IGreeter  INTERFACE,TYPE',
            'Hello       PROCEDURE',
            'Goodbye     PROCEDURE',
            '          END',
            'MyGreeter CLASS,IMPLEMENTS(IGreeter)',
            '          END',
            '  CODE',
            'MyGreeter.IGreeter.Hello PROCEDURE',
            '  CODE',
            '  RETURN',
            'MyGreeter.IGreeter.Goodbye PROCEDURE',
            '  CODE',
            '  RETURN',
        ]);
        assert.strictEqual(d.length, 0,
            `fully-implemented same-file class must not warn; got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('derived class inherits interface implementations from parent — no warning', async () => {
        const d = await diags([
            '  PROGRAM',
            '  MAP',
            '  END',
            'IGreeter  INTERFACE,TYPE',
            'Hello       PROCEDURE',
            'Goodbye     PROCEDURE',
            '          END',
            'BaseGreeter CLASS,IMPLEMENTS(IGreeter)',
            'Init        PROCEDURE',
            '          END',
            'DerivedGreeter CLASS(BaseGreeter),IMPLEMENTS(IGreeter)',
            '          END',
            '  CODE',
            'BaseGreeter.IGreeter.Hello PROCEDURE',
            '  CODE',
            '  RETURN',
            'BaseGreeter.IGreeter.Goodbye PROCEDURE',
            '  CODE',
            '  RETURN',
            'BaseGreeter.Init PROCEDURE',
            '  CODE',
            '  RETURN',
        ]);
        assert.strictEqual(d.length, 0,
            `derived class must inherit interface implementations from parent; got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('same-name interface overloads are matched by parameter count', async () => {
        const d = await diags([
            '  PROGRAM',
            '  MAP',
            '  END',
            'IWorker   INTERFACE,TYPE',
            'DoThing     PROCEDURE',
            'DoThing     PROCEDURE(LONG)',
            '          END',
            'MyWorker CLASS,IMPLEMENTS(IWorker)',
            '          END',
            '  CODE',
            'MyWorker.IWorker.DoThing PROCEDURE',
            '  CODE',
            '  RETURN',
            'MyWorker.IWorker.DoThing PROCEDURE(LONG)',
            '  CODE',
            '  RETURN',
        ]);
        assert.strictEqual(d.length, 0,
            `same-name overloads should be matched by parameter count; got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('declaration-only .inc with no MODULE — skipped (impls live in an unknown module)', async () => {
        // No PROGRAM/MEMBER → getDocumentKind() undefined → cannot locate impls → skip.
        const doc = TextDocument.create(`file:///decl-only-${++docCounter}.inc`, 'clarion', 1, [
            'IGreeter  INTERFACE,TYPE',
            'Hello       PROCEDURE',
            '          END',
            'MyGreeter CLASS,IMPLEMENTS(IGreeter)',
            '          END',
        ].join('\n'));
        const tokens = TokenCache.getInstance().getTokens(doc);
        const d = await validateClassInterfaceImplementationAsync(tokens, doc, new MemberLocatorService());
        assert.strictEqual(d.length, 0,
            `declaration-only .inc must be skipped (no false positive); got: ${JSON.stringify(d.map(x => x.message))}`);
    });
});
