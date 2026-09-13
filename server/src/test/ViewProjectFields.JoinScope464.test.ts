import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateViewProjectFields } from '../providers/diagnostics/StructureDiagnostics';

/**
 * Issue #464 — every PROJECT in a VIEW was resolved against the VIEW's FROM file,
 * so PROJECTs nested inside a JOIN ... END (which project fields of the JOINED
 * file) were all reported as missing:
 *
 *     VIEW(Invoice)
 *       PROJECT(INV:ID)
 *       JOIN(CUS:Key,INV:CustomerId)
 *         PROJECT(CUS:Name)        ! 'CUS:Name' is not a field on FILE 'Invoice'.
 *       END
 *     END
 *
 * This is generated browse code, so it was not rare: 12 false positives across 5
 * files of one stock example that ships with Clarion (Capesoft\RecentLookups).
 *
 * Two things had to be true for the fix to be a fix rather than a mute:
 *   1. joined fields stop being flagged against the wrong file, AND
 *   2. a genuinely bad joined field is still flagged — against the JOINED file.
 * The second is what the `Bogus` assertions below exist for. An early version of
 * the fix passed (1) while silently skipping every JOIN-scoped field, because a
 * JOIN names a KEY (`CUS:Key`), not a file, so the owner never resolved.
 */

function diagnose(lines: string[]) {
    const doc = TextDocument.create('file:///c:/test464/view.clw', 'clarion', 1, lines.join('\n'));
    const tokens = new ClarionTokenizer(doc.getText()).tokenize();
    return validateViewProjectFields(tokens, doc);
}

/** Two FILEs with PRE() prefixes, as a dictionary-generated module declares them. */
const FILES = [
    "Invoice     FILE,DRIVER('TOPSPEED'),PRE(INV)",
    'InvKey        KEY(INV:ID)',
    'Record        RECORD',
    'ID              LONG',
    'CustomerId      LONG',
    '              END',
    '            END',
    '',
    "Customer    FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    'CusKey        KEY(CUS:CustomerID)',
    'Record        RECORD',
    'CustomerID      LONG',
    'Name            STRING(30)',
    '              END',
    '            END',
    ''
];

suite('Issue #464 — PROJECT fields are scoped to their JOIN', () => {

    test('fields projected inside a JOIN are not flagged against the VIEW FROM file', () => {
        const diags = diagnose([
            ...FILES,
            'BRW1::View:Browse    VIEW(Invoice)',
            '                       PROJECT(INV:ID)',
            '                       PROJECT(INV:CustomerId)',
            '                       JOIN(CUS:Key,INV:CustomerId)',
            '                         PROJECT(CUS:Name)',
            '                         PROJECT(CUS:CustomerID)',
            '                       END',
            '                     END'
        ]);

        assert.deepStrictEqual(
            diags.map(d => d.message), [],
            'a correct VIEW with a JOIN should produce no diagnostics'
        );
    });

    test('a bad field inside a JOIN is still flagged, against the JOINED file', () => {
        const diags = diagnose([
            ...FILES,
            'BRW1::View:Browse    VIEW(Invoice)',
            '                       PROJECT(INV:ID)',
            '                       JOIN(CUS:Key,INV:CustomerId)',
            '                         PROJECT(CUS:NoSuchField)',
            '                       END',
            '                     END'
        ]);

        assert.strictEqual(diags.length, 1, 'the bogus joined field must still be reported');
        assert.ok(
            diags[0].message.includes("'CUS:NoSuchField'"),
            `expected the bogus field to be named, got: ${diags[0].message}`
        );
        assert.ok(
            diags[0].message.includes("FILE 'Customer'"),
            `must be attributed to the JOINED file, not the FROM file. Got: ${diags[0].message}`
        );
    });

    test('a bad field outside any JOIN is still flagged against the FROM file', () => {
        const diags = diagnose([
            ...FILES,
            'BRW1::View:Browse    VIEW(Invoice)',
            '                       PROJECT(INV:NoSuchField)',
            '                       JOIN(CUS:Key,INV:CustomerId)',
            '                         PROJECT(CUS:Name)',
            '                       END',
            '                     END'
        ]);

        assert.strictEqual(diags.length, 1, 'the bogus primary field must still be reported');
        assert.ok(
            diags[0].message.includes("'INV:NoSuchField'") && diags[0].message.includes("FILE 'Invoice'"),
            `expected INV:NoSuchField against Invoice, got: ${diags[0].message}`
        );
    });

    test('ownership is restored after the JOIN ends', () => {
        // A PROJECT that follows the JOIN's END belongs to the FROM file again. If the
        // owner stack failed to pop, this would be checked against Customer and pass
        // for the wrong reason — so the field chosen here exists on Invoice only.
        const diags = diagnose([
            ...FILES,
            'BRW1::View:Browse    VIEW(Invoice)',
            '                       JOIN(CUS:Key,INV:CustomerId)',
            '                         PROJECT(CUS:Name)',
            '                       END',
            '                       PROJECT(INV:CustomerId)',
            '                     END'
        ]);

        assert.deepStrictEqual(
            diags.map(d => d.message), [],
            'INV:CustomerId after the JOIN END should resolve against Invoice'
        );
    });
});
