import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';

/**
 * #760 — follow-up to #759. A prototype named like a control (`BOX(...)` in libsrc's
 * builtins.clw, a `Line` method) opens its line, so its attributes were judged against
 * that control: "'NAME' is not applicable to BOX". A control is only declared inside a
 * WINDOW, APPLICATION or REPORT, so only there is an attribute checked against one.
 */

function diagnosticsFor(lines: string[]): string[] {
    const text = lines.join('\r\n');
    const doc = TextDocument.create('file:///c:/t760/t760.clw', 'clarion', 1, text);
    return validateAttributeApplicability(new ClarionTokenizer(text).tokenize(), doc).map(d => String(d.message));
}

function program(data: string[], map: string[] = []): string[] {
    return ['  PROGRAM', '  MAP', ...map, '  END', ...data, '  CODE', '  RETURN'];
}

suite('A control-named prototype outside a WINDOW or REPORT (#760)', () => {
    test('BOX and LINE prototypes in a MODULE, as in builtins.clw', () => {
        assert.deepStrictEqual(diagnosticsFor(program([], [
            "    MODULE('C%V%RUN%X%')",
            "      BOX(SIGNED x, SIGNED y, SIGNED width, SIGNED height),NAME('Cla$BOX')",
            "      LINE(SIGNED x, SIGNED y, SIGNED width, SIGNED height),NAME('Cla$LINE')",
            '    END',
        ])), []);
    });

    test('a MAP procedure named Image', () => {
        assert.deepStrictEqual(diagnosticsFor(program([], [
            'Image         PROCEDURE(),LONG,PRIVATE',
        ])), []);
    });

    test('a CLASS method named Line', () => {
        assert.deepStrictEqual(diagnosticsFor(program([
            'MyClass       CLASS,TYPE',
            'Line            PROCEDURE(),VIRTUAL',
            '              END',
        ])), []);
    });

    test('a control in a REPORT band is still checked', () => {
        assert.deepStrictEqual(diagnosticsFor(program([
            'Rpt           REPORT,AT(1000,1000,6000,9000)',
            'Detail          DETAIL,AT(,,6000,500)',
            '                  TEXT,AT(10,10,500,200),USE(?T),PRIVATE',
            '                END',
            '              END',
        ])), ["'PRIVATE' is not applicable to TEXT (valid for: DATA_TYPE, METHOD, PROPERTY)"]);
    });
});
