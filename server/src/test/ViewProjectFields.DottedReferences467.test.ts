import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { splitDottedReference, validateViewProjectFields } from '../providers/diagnostics/StructureDiagnostics';

/**
 * Issue #467 — dot notation (`File.Key` / `File.Field`) is legal Clarion and was
 * unhandled in both directions:
 *
 *     VIEW(Orders)
 *       PROJECT(Orders.ID)                  ! false warning: not a field on Orders
 *       JOIN(Customer.CusKey, ORD:CusID)    ! target unresolvable -> no checking
 *         PROJECT(Customer.Name)            ! silently unchecked
 *       END
 *     END
 *
 * `Customer.CusKey` arrives as ONE `StructureField` token, so it has no colon for
 * `resolveFileOrPrefixed` to split on, and the whole dotted value matches neither
 * the bare (`NAME`) nor prefixed (`CUS:NAME`) form `collectFieldNames` builds.
 *
 * The two halves MUST be fixed together. Repairing only the resolver makes the
 * JOIN target resolve while the comparison still sees an unsplit dotted value —
 * turning the silent case into a SECOND false positive. That is what
 * `dotted field inside a dotted JOIN is accepted` guards.
 *
 * Legality is compiler-verified, not assumed — `test-programs/ViewJoinTest`
 * compiles and links clean on Clarion 10.0.12567, and the negative controls
 * below mirror errors that build actually emits:
 *   JOIN(Customer.NoSuchKey, ...)                  -> `Field not found: NOSUCHKEY`
 *   PROJECT(Orders.Total) inside a Customer JOIN   -> `Field not found in parent FILE`
 * The second is why the qualifier is ignored for the membership test: the
 * compiler checks the member against the ENCLOSING scope's file, not against the
 * file the qualifier names.
 */

function diagnose(lines: string[]) {
    const doc = TextDocument.create('file:///c:/test467/view.clw', 'clarion', 1, lines.join('\n'));
    const tokens = new ClarionTokenizer(doc.getText()).tokenize();
    return validateViewProjectFields(tokens, doc);
}

/** Mirrors test-programs/ViewJoinTest/viewjoin.clw, the compiled fixture. */
const FILES = [
    "Customer    FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    'CusKey        KEY(CUS:ID)',
    'Record        RECORD',
    'ID              LONG',
    'Name            STRING(30)',
    '              END',
    '            END',
    '',
    "Orders      FILE,DRIVER('TOPSPEED'),PRE(ORD)",
    'OrdKey        KEY(ORD:ID)',
    'Record        RECORD',
    'ID              LONG',
    'CusID           LONG',
    'Total           DECIMAL(9,2)',
    '              END',
    '            END',
    ''
];

suite('Issue #467 — dotted File.Field / File.Key references in a VIEW', () => {

    // ── the normalisation itself ──────────────────────────────────────────────
    test('splitDottedReference splits a dotted reference into file and member', () => {
        assert.deepStrictEqual(
            splitDottedReference('Customer.CusKey'),
            { file: 'Customer', member: 'CusKey' }
        );
    });

    test('splitDottedReference declines names it must not touch', () => {
        assert.strictEqual(splitDottedReference('CUS:Name'), undefined, 'prefixed form is not dotted');
        assert.strictEqual(splitDottedReference('Name'), undefined, 'bare name is not dotted');
        assert.strictEqual(splitDottedReference('.Leading'), undefined, 'no file half');
        assert.strictEqual(splitDottedReference('Trailing.'), undefined, 'trailing dot is a period terminator');
    });

    // ── the false positive (#467 defect 2) ────────────────────────────────────
    test('a dotted field on the VIEW FROM file is accepted', () => {
        const diags = diagnose([
            ...FILES,
            'ViewDotted  VIEW(Orders)',
            '              PROJECT(Orders.ID)',
            '            END'
        ]);

        assert.deepStrictEqual(
            diags.map(d => d.message), [],
            'PROJECT(Orders.ID) compiles — it must not be flagged'
        );
    });

    // ── the silent gap (#467 defect 1), and the reason both halves ship together
    test('a dotted field inside a dotted JOIN is accepted', () => {
        const diags = diagnose([
            ...FILES,
            'ViewDotted  VIEW(Orders)',
            '              PROJECT(Orders.ID)',
            '              JOIN(Customer.CusKey, ORD:CusID)',
            '                PROJECT(Customer.Name)',
            '              END',
            '            END'
        ]);

        assert.deepStrictEqual(
            diags.map(d => d.message), [],
            'resolving the dotted JOIN target must not expose a second false positive'
        );
    });

    // ── non-vacuity: the checking is real, not muted ──────────────────────────
    test('a bogus dotted field on the FROM file is still flagged', () => {
        const diags = diagnose([
            ...FILES,
            'ViewDotted  VIEW(Orders)',
            '              PROJECT(Orders.NoSuchField)',
            '            END'
        ]);

        assert.strictEqual(diags.length, 1, 'a dotted field that does not exist must be reported');
        assert.ok(
            diags[0].message.includes("'Orders.NoSuchField'"),
            `the whole dotted token should be named, got: ${diags[0].message}`
        );
    });

    test('a bogus dotted field inside a dotted JOIN is flagged against the JOINED file', () => {
        const diags = diagnose([
            ...FILES,
            'ViewDotted  VIEW(Orders)',
            '              JOIN(Customer.CusKey, ORD:CusID)',
            '                PROJECT(Customer.NoSuchField)',
            '              END',
            '            END'
        ]);

        assert.strictEqual(diags.length, 1, 'the dotted JOIN target must resolve so its fields get checked');
        assert.ok(
            diags[0].message.includes("FILE 'Customer'"),
            `must be attributed to the JOINED file. Got: ${diags[0].message}`
        );
    });

    test('the qualifier does not override the enclosing JOIN — compiler-verified', () => {
        // Compiling PROJECT(Orders.Total) inside JOIN(Customer.CusKey, ...) fails
        // with `Field not found in parent FILE`, so naming the parent file in the
        // qualifier does NOT make a parent field projectable from inside a JOIN.
        const diags = diagnose([
            ...FILES,
            'ViewDotted  VIEW(Orders)',
            '              JOIN(Customer.CusKey, ORD:CusID)',
            '                PROJECT(Orders.Total)',
            '              END',
            '            END'
        ]);

        assert.strictEqual(diags.length, 1, 'Total is not on Customer — the compiler rejects this too');
        assert.ok(
            diags[0].message.includes("FILE 'Customer'"),
            `must be checked against the JOIN's file, not the qualifier's. Got: ${diags[0].message}`
        );
    });

    // ── regression guards: the untouched forms ────────────────────────────────
    test('the prefixed form still behaves exactly as before', () => {
        const clean = diagnose([
            ...FILES,
            'ViewPrefix  VIEW(Orders)',
            '              PROJECT(ORD:ID)',
            '              JOIN(CUS:CusKey, ORD:CusID)',
            '                PROJECT(CUS:Name)',
            '              END',
            '            END'
        ]);
        assert.deepStrictEqual(clean.map(d => d.message), [], 'the generated form must stay silent');

        const bogus = diagnose([
            ...FILES,
            'ViewPrefix  VIEW(Orders)',
            '              JOIN(CUS:CusKey, ORD:CusID)',
            '                PROJECT(CUS:NoSuchField)',
            '              END',
            '            END'
        ]);
        assert.strictEqual(bogus.length, 1, 'a bogus prefixed field must still be reported');
    });
});
