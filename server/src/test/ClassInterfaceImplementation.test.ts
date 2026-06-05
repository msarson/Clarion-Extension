import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateClassInterfaceImplementation } from '../providers/diagnostics/ClassDiagnostics';

/**
 * Issue #165 — implement validateClassInterfaceImplementation.
 *
 * The diagnostic previously extracted the IMPLEMENTS interface name and threw it
 * away (`void implementsInterface`), always returning []. A CLASS that declares
 * `IMPLEMENTS(SomeInterface)` but omits one of the interface's methods was never
 * flagged — a silent false-negative on interface-contract violations.
 *
 * v1 scope (same-file, synchronous):
 *   - The INTERFACE must be declared in the SAME document (cross-file include-chain
 *     resolution is a deferred follow-up — the cited substrate,
 *     MemberLocatorService.findMemberInInterface, is a single-method lookup, not an
 *     enumerator, so cross-file enumeration needs new substrate).
 *   - Classes that derive from a base class (`CLASS(Parent),IMPLEMENTS(...)`) are
 *     SKIPPED: the missing method may be inherited from the parent, and a false
 *     positive there is worse than the false negative. Resolving inherited methods
 *     is a follow-up.
 *
 * Bidirectional pin per feedback_bidirectional_pin_assertion:
 *   - Positive: parentless class missing an interface method → warns (names the method)
 *   - Negative sentinels: all methods present / base-class present / no IMPLEMENTS /
 *     interface declared cross-file → no warning
 */

let docCounter = 0;
function makeDoc(lines: string[]): TextDocument {
    return TextDocument.create(`file:///test-iface-${++docCounter}.clw`, 'clarion', 1, lines.join('\n'));
}
function diags(lines: string[]) {
    const doc = makeDoc(lines);
    const tokens = new ClarionTokenizer(doc.getText()).tokenize();
    return validateClassInterfaceImplementation(tokens, doc);
}

suite('Issue #165 — validateClassInterfaceImplementation', () => {

    test('parentless class missing an interface method — warns and names the method', () => {
        const d = diags([
            'MyIface  INTERFACE',
            'DoThing    PROCEDURE',
            'GetValue   PROCEDURE(),LONG',
            'SetValue   PROCEDURE(STRING)',
            '         END',
            '',
            'MyClass  CLASS,IMPLEMENTS(MyIface)',
            'DoThing    PROCEDURE',
            'GetValue   PROCEDURE(),LONG',
            '         END',
        ]);
        assert.strictEqual(d.length, 1, `expected exactly one missing-method warning; got: ${JSON.stringify(d.map(x => x.message))}`);
        assert.ok(/SetValue/i.test(d[0].message), `message should name the missing method SetValue; got: ${d[0].message}`);
    });

    test('all interface methods implemented — no warning', () => {
        const d = diags([
            'MyIface  INTERFACE',
            'DoThing    PROCEDURE',
            'GetValue   PROCEDURE(),LONG',
            '         END',
            '',
            'MyClass  CLASS,IMPLEMENTS(MyIface)',
            'DoThing    PROCEDURE',
            'GetValue   PROCEDURE(),LONG',
            '         END',
        ]);
        assert.strictEqual(d.length, 0, `expected no warnings; got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('multiple missing methods — one warning each', () => {
        const d = diags([
            'MyIface  INTERFACE',
            'DoThing    PROCEDURE',
            'GetValue   PROCEDURE(),LONG',
            'SetValue   PROCEDURE(STRING)',
            '         END',
            '',
            'MyClass  CLASS,IMPLEMENTS(MyIface)',
            'DoThing    PROCEDURE',
            '         END',
        ]);
        assert.strictEqual(d.length, 2, `expected two warnings (GetValue + SetValue); got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    // ── Negative sentinels — must NOT fire ──────────────────────────────────

    test('class with a base class is skipped (method may be inherited)', () => {
        const d = diags([
            'MyIface  INTERFACE',
            'DoThing    PROCEDURE',
            'SetValue   PROCEDURE(STRING)',
            '         END',
            '',
            'MyClass  CLASS(BaseClass),IMPLEMENTS(MyIface)',
            'DoThing    PROCEDURE',
            '         END',
        ]);
        assert.strictEqual(d.length, 0, `base-class classes must be skipped (no false positive on inherited methods); got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('class with no IMPLEMENTS — no warning', () => {
        const d = diags([
            'MyIface  INTERFACE',
            'DoThing    PROCEDURE',
            '         END',
            '',
            'MyClass  CLASS',
            'SomethingElse PROCEDURE',
            '         END',
        ]);
        assert.strictEqual(d.length, 0, `class without IMPLEMENTS must not be validated; got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('interface not declared in this file (cross-file) — no warning (deferred scope)', () => {
        const d = diags([
            'MyClass  CLASS,IMPLEMENTS(ExternalIface)',
            'DoThing    PROCEDURE',
            '         END',
        ]);
        assert.strictEqual(d.length, 0, `cross-file interface resolution is out of v1 scope — must not false-positive; got: ${JSON.stringify(d.map(x => x.message))}`);
    });
});
