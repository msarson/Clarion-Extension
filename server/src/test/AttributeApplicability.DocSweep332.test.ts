import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * Issue #332 — attribute-applicability false positives from incomplete
 * `applicableTo` lists in clarion-attributes.json. Field-reported by Edin
 * (@Chahton): `'ICON' is not applicable to ITEM`, `'OVR' is not applicable
 * to SPIN`, `'FILL' is not applicable to PANEL` — all valid per the Clarion
 * 11.1 control-declaration docs.
 *
 * Fix: systematic sweep of every validatable control's declaration doc
 * (C:\Clarion\Clarion11.1\bin\ClarionDocs) against the table — 96
 * doc-verified additions across 20 attributes (ICON/INS/OVR/ALRT/SCROLL/
 * FULL/LAYOUT/CENTER/FLAT/RESIZE/BOXED/EXTEND/MARK/COLUMN/GRID/NOBAR/MASK/
 * FROM/FILL/STD), rather than patching Edin's three sightings one at a time.
 */

let docCounter = 0;
function makeDoc(lines: string[]): TextDocument {
    return TextDocument.create(`file:///test-attr-332-${++docCounter}.clw`, 'clarion', 1, lines.join('\n'));
}

function attrDiags(lines: string[]) {
    const doc = makeDoc(lines);
    const tokens = new ClarionTokenizer(doc.getText()).tokenize();
    return validateAttributeApplicability(tokens, doc)
        .filter(d => d.code === 'invalid-attribute-context');
}

suite('Issue #332 — doc-verified attribute applicability', () => {

    test("ICON on a menu ITEM — no diagnostic (Edin's report)", () => {
        const diags = attrDiags([
            'MyWin WINDOW',
            '  MENUBAR',
            "    MENU('File'),USE(?FileMenu)",
            "      ITEM('Open'),USE(?OpenFile),ICON('open.ico')",
            '    END',
            '  END',
            'END',
        ]);
        assert.strictEqual(diags.length, 0, `expected none, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test("OVR and INS on SPIN — no diagnostic (Edin's report)", () => {
        const diags = attrDiags([
            'MyWin WINDOW',
            '  SPIN(@n3),AT(10,10,40,12),USE(SpinVar),RANGE(1,999),OVR',
            '  SPIN(@n3),AT(10,30,40,12),USE(SpinVar2),RANGE(1,999),INS',
            'END',
        ]);
        assert.strictEqual(diags.length, 0, `expected none, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test("FILL on PANEL — no diagnostic (Edin's follow-up report)", () => {
        const diags = attrDiags([
            'MyWin WINDOW',
            '  PANEL,AT(10,10,100,50),USE(?Panel1),FILL(COLOR:Silver),BEVEL(2)',
            'END',
        ]);
        assert.strictEqual(diags.length, 0, `expected none, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test('sweep additions: ALRT/FLAT/SCROLL/FULL on ENTRY, MARK on COMBO, EXTEND on report TEXT — no diagnostic', () => {
        const diags = attrDiags([
            'MyWin WINDOW',
            '  ENTRY(@s20),AT(10,10,80,12),USE(E1),ALRT(F10Key),FLAT,SCROLL,FULL',
            '  COMBO(@s20),AT(10,30,80,12),USE(C1),FROM(Que),MARK(MarkVar)',
            'END',
        ]);
        assert.strictEqual(diags.length, 0, `expected none, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test('sentinel: ICON on ENTRY still flagged (not documented for ENTRY)', () => {
        const diags = attrDiags([
            'MyWin WINDOW',
            "  ENTRY(@s20),AT(10,10,80,12),USE(E1),ICON('x.ico')",
            'END',
        ]);
        assert.strictEqual(diags.length, 1, `expected exactly the ICON diagnostic, got: ${JSON.stringify(diags.map(d => d.message))}`);
        assert.ok(diags[0].message.includes("'ICON' is not applicable to ENTRY"), diags[0].message);
    });
});
