import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { DataTypeService } from '../utils/DataTypeService';
import { ControlService } from '../utils/ControlService';

/**
 * #750 — clarion-datatypes.json describes the FILE declarations for the data-type card and
 * data-type signature help, and it contradicted the compiler (Clarion 10 and 12, #746/#748):
 * BLOB was given a length (`BLOB(100)` is `Wrong number of parameters`), MEMO's length was
 * optional (a bare MEMO is the same error), MEMO and BLOB listed EXTERNAL and DLL, FILE missed
 * DLL and OEM, and INDEX had no entry. Each entry now agrees with the compiler-checked
 * fileStructures list, and this test keeps the two from drifting apart.
 */

const dataTypes = DataTypeService.getInstance();
const names = (list: string[] | undefined) => (list ?? []).map(a => a.replace('()', '')).sort();

suite('FILE declaration data-type entries agree with the compiler (#750)', () => {
    for (const name of ['FILE', 'KEY', 'INDEX', 'MEMO', 'BLOB']) {
        test(`${name}: its attribute list is the compiler-checked one`, () => {
            const entry = dataTypes.getDataType(name);
            assert.ok(entry, `no data-type entry for ${name}`);
            assert.deepStrictEqual(names(entry!.attributes), names(ControlService.getInstance().getDeclarationStructure(name)?.attributes));
        });
    }

    test('MEMO takes a required length; BLOB takes none', () => {
        const memo = dataTypes.getDataType('MEMO')!;
        assert.strictEqual(memo.parameters.length, 1);
        assert.strictEqual(memo.parameters[0].optional, false);
        assert.deepStrictEqual(dataTypes.getDataType('BLOB')!.parameters, []);
    });

    // An INDEX entry must not turn every variable named Index into the data type (#752 guards it)
    test('a variable named Index still hovers as the variable in code', async () => {
        const lines = ['  PROGRAM', '  MAP', '  END', 'Index   LONG', '  CODE', '  Index += 1'];
        const doc = TextDocument.create('file:///C:/temp/index750.clw', 'clarion', 1, lines.join('\r\n'));
        const hover = await new HoverProvider().provideHover(doc, { line: 5, character: 3 });
        const card = (hover?.contents as { value?: string } | undefined)?.value ?? '';
        assert.ok(card.startsWith('**Index** — `LONG`'), card);
    });

    test('nothing places a MEMO or BLOB in the RECORD, or calls an INDEX unsorted', () => {
        for (const name of ['MEMO', 'BLOB']) {
            const entry = dataTypes.getDataType(name)!;
            assert.ok(!/in RECORD/i.test(`${entry.syntax} ${entry.notes ?? ''}`), `${name}: ${entry.notes}`);
        }
        assert.ok(!/unsorted/i.test(dataTypes.getDataType('KEY')!.notes ?? ''), dataTypes.getDataType('KEY')!.notes);
    });
});
