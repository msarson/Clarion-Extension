import * as assert from 'assert';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateUnresolvedFileReferences } from '../providers/diagnostics/UnresolvedFileReferenceDiagnostics';
import { DIAGNOSTIC_CHECKS } from '../../../common/diagnosticChecks';

/**
 * #695 — an INCLUDE or MEMBER naming a file that cannot be found is a compile error (a missing
 * MEMBER program, compiler-verified on C12: `Error(3): cif$fileopen NoSuchProg.CLW`), but nothing
 * said so before a build. The check flags the quoted name, through the resolver the file graph and
 * the #687 report use. A MODULE name is never flagged: for an external library it "may contain any
 * unique identifier" (Language Reference). Nor is anything inside OMIT or COMPILE.
 */
const FILE = 'c:\\app\\module.clw';
const EXISTS = new Set(['main.clw', 'equates.clw', 'shared.inc']);
// Like the graph's resolver, a name without an extension is also tried as .clw (#449).
const resolve = (target: string) =>
    [target, `${target}.clw`].find(t => EXISTS.has(t.toLowerCase())) ? `c:\\app\\${target}` : null;
const check = (lines: string[]) =>
    validateUnresolvedFileReferences(TextDocument.create('file:///c%3A/app/module.clw', 'clarion', 1, lines.join('\r\n')), FILE, resolve);
const where = (lines: string[]) => check(lines).map(d =>
    `${d.range.start.line}:${d.range.start.character}-${d.range.end.character}`);

suite('An INCLUDE or MEMBER whose file cannot be found (#695)', () => {
    test('bug-pin: a MEMBER program that cannot be found is an error on its name', () => {
        const diags = check(["  MEMBER('NoSuchProg')", '  MAP', '  END']);
        assert.strictEqual(diags.length, 1);
        assert.deepStrictEqual(where(["  MEMBER('NoSuchProg')", '  MAP', '  END']), ['0:10-20']);
        assert.strictEqual(diags[0].severity, DiagnosticSeverity.Error);
        assert.match(String(diags[0].message), /NoSuchProg/);
        assert.match(String(diags[0].message), /MEMBER/);
    });

    test('bug-pin: an INCLUDE that cannot be found is an error on its name', () => {
        const lines = ["  MEMBER('Main')", "  INCLUDE('Gone.inc'),ONCE", "  INCLUDE('shared.inc'),ONCE"];
        assert.deepStrictEqual(where(lines), ['1:11-19']);
        assert.match(String(check(lines)[0].message), /Gone\.inc/);
    });

    test('a file that resolves is not flagged', () => {
        assert.deepStrictEqual(check(["  MEMBER('Main')", "  INCLUDE('Equates.clw')"]), []);
    });

    test('a MODULE name is never flagged, in a MAP or on a CLASS', () => {
        assert.deepStrictEqual(check([
            "  MEMBER('Main')",
            '  MAP',
            "    MODULE('Win32')",
            '      Beep(LONG),PASCAL',
            '    END',
            "    MODULE('Missing.clw')",
            '      Proc()',
            '    END',
            '  END',
            "Obj CLASS,MODULE('NoSource.clw'),LINK('NoSource.clw')",
            '    END',
        ]), []);
    });

    test('a bare MEMBER() names no program', () => {
        assert.deepStrictEqual(check(['  MEMBER()', '  MAP', '  END']), []);
    });

    test('inside OMIT or COMPILE, and in a comment, nothing is flagged', () => {
        assert.deepStrictEqual(check([
            "  MEMBER('Main')",
            "  OMIT('***')",
            "  INCLUDE('Gone.inc')",
            '  ***',
            "  COMPILE('!end', _Flag_)",
            "  INCLUDE('Gone2.inc')",
            '  !end',
            "! INCLUDE('Gone3.inc')",
        ]), []);
    });

    test('the check is in the table, on by default', () => {
        assert.strictEqual(DIAGNOSTIC_CHECKS.find(c => (c.id as string) === 'unresolvedFileReferences')?.default, true);
    });
});
