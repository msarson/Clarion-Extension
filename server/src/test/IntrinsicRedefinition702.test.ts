import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { TokenCache } from '../TokenCache';
import { DIAGNOSTIC_CHECKS } from '../../../common/diagnosticChecks';

/**
 * #702 — the compiler warns "Redefining system intrinsic: SELF / PARENT / NULL", and the
 * redefinition is real (a `Self` local makes SELF.Draw fail in that method). Compiler-verified on
 * Clarion 10 and 12, including where it stays silent; each case below is one of those builds:
 *  - SELF / PARENT as a method's parameter: on the implementation's header, not the CLASS prototype,
 *    and not for an ordinary procedure's parameter;
 *  - SELF / PARENT as a method's local, a ROUTINE's DATA inside a method included (not an ordinary
 *    procedure's local);
 *  - NULL as a PROCEDURE or method name: on the MAP prototype or CLASS member, not the implementation.
 */
let seq = 0;
const warnings = (lines: string[]) => {
    const doc = TextDocument.create(`file:///c%3A/t702/case${++seq}.clw`, 'clarion', 1, lines.join('\r\n'));
    TokenCache.getInstance().clearTokens(doc.uri);
    return DiagnosticProvider.validateDocument(doc)
        .filter(d => String(d.message).includes('Redefining system intrinsic'))
        .map(d => ({ line: d.range.start.line, col: d.range.start.character, word: /intrinsic: ([A-Z]+)/.exec(String(d.message))?.[1], severity: d.severity }));
};
const at = (list: { line: number; word?: string }[]) => list.map(w => `${w.word}@${w.line}`);

const CLASS_HEAD = ['  PROGRAM', '  MAP', '  END', 'Shape    CLASS', 'Draw       PROCEDURE(LONG Self)', 'Fill       PROCEDURE', '         END', '  CODE'];

suite('Redefined SELF, PARENT and NULL are reported as the compiler does (#702)', () => {
    test('bug-pin: SELF and PARENT as a method\'s locals, each on its own line, as a warning', () => {
        const w = warnings([...CLASS_HEAD,
            'Shape.Draw PROCEDURE(LONG P)', '  CODE',
            'Shape.Fill PROCEDURE', 'Parent   LONG', 'Self     LONG', '  CODE']);
        assert.deepStrictEqual(at(w), ['PARENT@11', 'SELF@12']);
        assert.ok(w.every(x => x.severity === DiagnosticSeverity.Warning));
    });

    test('bug-pin: SELF as a method\'s parameter, on the implementation header (not the CLASS prototype)', () => {
        const w = warnings([...CLASS_HEAD, 'Shape.Draw PROCEDURE(LONG Self)', '  CODE', 'Shape.Fill PROCEDURE', '  CODE']);
        assert.deepStrictEqual(at(w), ['SELF@8']);
        assert.strictEqual(w[0].col, 'Shape.Draw PROCEDURE(LONG '.length, 'on the parameter\'s name');
    });

    test('bug-pin: SELF in a ROUTINE\'s DATA inside a method', () => {
        const w = warnings([...CLASS_HEAD,
            'Shape.Draw PROCEDURE(LONG P)', '  CODE',
            'Shape.Fill PROCEDURE', '  CODE', '  DO R', 'R ROUTINE', '  DATA', 'Self LONG', '  CODE', '  EXIT']);
        assert.deepStrictEqual(at(w), ['SELF@15']);
    });

    test('bug-pin: NULL as a MAP prototype and as a CLASS member, not on the implementations', () => {
        const w = warnings(['  PROGRAM', '  MAP', 'Null     PROCEDURE', '  END',
            'Shape    CLASS', 'Null       PROCEDURE', '         END',
            '  CODE',
            'Null     PROCEDURE', '  CODE',
            'Shape.Null PROCEDURE', '  CODE']);
        assert.deepStrictEqual(at(w), ['NULL@2', 'NULL@5']);
    });

    test('silent where the compiler is: an ordinary procedure\'s parameter and local, global data, a field', () => {
        assert.deepStrictEqual(warnings(['  PROGRAM', '  MAP', 'P PROCEDURE(LONG Self)', '  END', 'Parent   LONG',
            'G   GROUP', 'Self  LONG', '    END', '  CODE', 'P PROCEDURE(LONG Self)', 'Self   LONG', '  CODE']), []);
    });

    test('silent for a global PROCEDURE named Self or Parent', () => {
        assert.deepStrictEqual(warnings(['  PROGRAM', '  MAP', 'Self     PROCEDURE', 'Parent   PROCEDURE', '  END', '  CODE',
            'Self     PROCEDURE', '  CODE', 'Parent   PROCEDURE', '  CODE']), []);
    });

    test('the check is in the table, on by default', () => {
        assert.strictEqual(DIAGNOSTIC_CHECKS.find(c => (c.id as string) === 'intrinsicRedefinitions')?.default, true);
    });
});
