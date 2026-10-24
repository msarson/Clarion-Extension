import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';

/**
 * #759 — a parameter named like a control (`STRING Text`, `LONG Button`) gave the
 * attributes after the prototype's `)` that control's context, so a valid
 * `,PRIVATE` on a MAP prototype read "'PRIVATE' is not applicable to TEXT". A control
 * keyword only gives context when it opens its line, optionally after a label.
 */

function diagnosticsFor(lines: string[]): string[] {
    const text = lines.join('\r\n');
    const doc = TextDocument.create('file:///c:/t759/t759.clw', 'clarion', 1, text);
    return validateAttributeApplicability(new ClarionTokenizer(text).tokenize(), doc).map(d => String(d.message));
}

function program(data: string[], map: string[] = []): string[] {
    return ['  PROGRAM', '  MAP', ...map, '  END', ...data, '  CODE', '  RETURN'];
}

suite('A control-named parameter gives no control context (#759)', () => {
    test('PRIVATE on a MAP prototype with a parameter named Text', () => {
        assert.deepStrictEqual(diagnosticsFor(program([], [
            'DeclApply     PROCEDURE(*TBaseGroupClass C,STRING Text,BYTE Sep),LONG,PRIVATE',
        ])), []);
    });

    test('the keyword-less prototype form', () => {
        assert.deepStrictEqual(diagnosticsFor(program([], [
            '    DeclApply(*TBaseGroupClass C,STRING Text,BYTE Sep),LONG,PRIVATE',
        ])), []);
    });

    test('a prototype whose parameters continue onto the next line', () => {
        assert.deepStrictEqual(diagnosticsFor(program([], [
            'DeclApply     PROCEDURE(*TBaseGroupClass C,STRING Text, |',
            '                        BYTE Sep),LONG,PRIVATE',
        ])), []);
    });

    test('VIRTUAL on a CLASS method with a parameter named Button', () => {
        assert.deepStrictEqual(diagnosticsFor(program([
            'MyClass       CLASS,TYPE',
            'Init            PROCEDURE(LONG Button),VIRTUAL',
            '              END',
        ])), []);
    });

    test('an attribute on a real TEXT control is still checked, on its line and its continuation', () => {
        const window = (control: string[]) => program([
            "Win           WINDOW('T'),AT(,,200,100)",
            ...control,
            '              END',
        ]);
        assert.deepStrictEqual(diagnosticsFor(window(['                TEXT,AT(1,1,50,20),USE(?T),PRIVATE'])),
            ["'PRIVATE' is not applicable to TEXT (valid for: DATA_TYPE, METHOD, PROPERTY)"]);
        assert.deepStrictEqual(diagnosticsFor(window(['                TEXT,AT(1,1,50,20), |', '                  USE(?T),PRIVATE'])),
            ["'PRIVATE' is not applicable to TEXT (valid for: DATA_TYPE, METHOD, PROPERTY)"]);
    });
});
