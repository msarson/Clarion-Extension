import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateViewProjectFields } from '../providers/diagnostics/StructureDiagnostics';

/**
 * Issue #817 — `PROJECT(Cus:Notes)` where `Notes` is a MEMO of the VIEW's file was
 * reported as "not a field on FILE".
 *
 * The Language Reference says a MEMO and a BLOB "must be declared before the RECORD
 * structure": they are children of the FILE, not of its RECORD. The validator built
 * its field set from the RECORD alone, so neither was ever found.
 *
 * Compiler-verified on Clarion 10.0.12567 against test-programs/ViewJoinTest (see its
 * README): a MEMO and a BLOB declared before the RECORD both compile in a PROJECT, of
 * the VIEW's file and of a JOINed file; a MEMO of the other file in a PROJECT fails
 * with `Field not found in parent FILE`, so the owner scoping must still apply.
 */

function diagnose(lines: string[]) {
    const doc = TextDocument.create('file:///c:/test817/view.clw', 'clarion', 1, lines.join('\r\n'));
    const tokens = new ClarionTokenizer(doc.getText()).tokenize();
    return validateViewProjectFields(tokens, doc);
}

const FILES = [
    "Customer    FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    'CusKey        KEY(CUS:ID)',
    'Notes         MEMO(1000)',
    'Photo         BLOB',
    'Record        RECORD',
    'ID              LONG',
    'Name            STRING(30)',
    '              END',
    '            END',
    '',
    "Orders      FILE,DRIVER('TOPSPEED'),PRE(ORD)",
    'OrdKey        KEY(ORD:ID)',
    'Remarks       MEMO(500),BINARY',
    'Scan          BLOB,BINARY',
    'Record        RECORD',
    'ID              LONG',
    'CusID           LONG',
    '              END',
    '            END',
    ''
];

const messages = (lines: string[]) => diagnose([...FILES, ...lines]).map(d => d.message);

suite('Issue #817 — MEMO and BLOB fields in a VIEW PROJECT', () => {

    test('a MEMO of the VIEW file is a field', () => {
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(CUS:ID)',
            '              PROJECT(CUS:Notes)',
            '            END'
        ]), []);
    });

    test('a BLOB of the VIEW file is a field', () => {
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(CUS:Photo)',
            '            END'
        ]), []);
    });

    test('a MEMO and a BLOB with attributes, in a JOINed file, are fields', () => {
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(CUS:Notes, CUS:Photo)',
            '              JOIN(ORD:OrdKey, CUS:ID)',
            '                PROJECT(ORD:Remarks, ORD:Scan)',
            '              END',
            '            END'
        ]), []);
    });

    test('the bare and dotted forms of a MEMO are fields', () => {
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(Customer.Notes)',
            '              PROJECT(Notes)',
            '            END'
        ]), []);
    });

    test('a field that does not exist is still reported', () => {
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(CUS:Notes)',
            '              PROJECT(CUS:NoSuchMemo)',
            '            END'
        ]), ["'CUS:NoSuchMemo' is not a field on FILE 'Customer'."]);
    });

    test('a MEMO of another file is still reported', () => {
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(ORD:Remarks)',
            '              JOIN(ORD:OrdKey, CUS:ID)',
            '                PROJECT(CUS:Notes)',
            '              END',
            '            END'
        ]), [
            "'ORD:Remarks' is not a field on FILE 'Customer'.",
            "'CUS:Notes' is not a field on FILE 'Orders'."
        ]);
    });

    test('a KEY of the file is not a projectable field', () => {
        // Keys are FILE children too; widening the field set to the FILE must not
        // let a KEY label through.
        assert.deepStrictEqual(messages([
            'V           VIEW(Customer)',
            '              PROJECT(CUS:CusKey)',
            '            END'
        ]), ["'CUS:CusKey' is not a field on FILE 'Customer'."]);
    });
});
