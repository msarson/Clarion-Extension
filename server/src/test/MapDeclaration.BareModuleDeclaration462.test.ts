import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * Issue #462 — a BARE MAP entry (no PROCEDURE keyword, no parameter list) was
 * left with `subType === undefined`, so every consumer that asks "is this a MAP
 * declaration?" — all of which test subType against MapProcedure — could not see
 * it. `missing-map-declaration` then fired on procedures that ARE declared.
 *
 *     MAP
 *       MODULE('demoleg002.clw')
 *         BrowseInvoice          ! bare: no PROCEDURE keyword, no ( )
 *       END
 *     END
 *
 * processShorthandProcedures() had two patterns and both key off a '(' — the
 * name-and-paren-in-one-token form, and the name-followed-by-'(' form. A bare
 * name has no '(' at all and matched neither.
 *
 * This is the shape template-generated apps emit for parameterless procedures,
 * so it reproduces on a stock example that ships with Clarion
 * (Clarion10Examples\Capesoft\RecentLookups\Legacy\demoleg.sln): BrowseInvoice
 * in demoleg002.clw and Main in demoleg001.clw were both flagged while both are
 * declared in demoleg.clw's MAP.
 *
 * The parenting assertion is the half that protects #338: a bare entry directly
 * in a MAP is a self-declaration, while one inside MODULE('other.clw') declares
 * a procedure implemented in that file. Collapsing the two would trade this
 * false positive for a different one.
 */

function tokenize(lines: string[]) {
    const doc = TextDocument.create('file:///c:/test462/prog.clw', 'clarion', 1, lines.join('\n'));
    return new ClarionTokenizer(doc.getText()).tokenize();
}

suite('Issue #462 — bare MAP entries are procedure declarations', () => {

    test('bare entry inside MODULE(...) is a MapProcedure, parented to the MODULE', () => {
        const tokens = tokenize([
            '  PROGRAM',
            '',
            '  MAP',
            "    MODULE('other.clw')",
            '      BrowseInvoice',
            '    END',
            '  END',
            '',
            '  CODE',
            '  RETURN'
        ]);

        const decl = tokens.find(t => t.value === 'BrowseInvoice');
        assert.ok(decl, 'BrowseInvoice token should exist');
        assert.strictEqual(
            decl!.subType, TokenType.MapProcedure,
            'a bare MODULE entry must be classified MapProcedure (was undefined => invisible to every MAP-declaration lookup)'
        );
        assert.strictEqual(decl!.label, 'BrowseInvoice', 'label should carry the procedure name');
        assert.strictEqual(
            decl!.parent?.value.toUpperCase(), 'MODULE',
            'must be parented to the MODULE, not the outer MAP — #338 relies on that distinction'
        );
    });

    test('bare entry directly in the MAP is a MapProcedure, parented to the MAP (#338 shape)', () => {
        const tokens = tokenize([
            "  MEMBER('sample.clw')",
            '',
            '  MAP',
            '    ComputeIt',
            '  END',
            '',
            'ComputeIt PROCEDURE',
            '  CODE',
            '  RETURN'
        ]);

        const decl = tokens.find(t => t.value === 'ComputeIt' && t.subType === TokenType.MapProcedure);
        assert.ok(decl, 'bare module-level MAP entry should be a MapProcedure');
        assert.strictEqual(
            decl!.parent?.value.toUpperCase(), 'MAP',
            'a bare entry with no MODULE wrapper stays parented to the MAP'
        );
    });

    test('entries WITH a parameter list keep working (patterns 1 and 2 unchanged)', () => {
        const tokens = tokenize([
            '  PROGRAM',
            '  MAP',
            '    SaveRecord(LONG pId)',
            "    MODULE('other.clw')",
            '      Compute(LONG pA)',
            '    END',
            '  END',
            '  CODE',
            '  RETURN'
        ]);

        for (const name of ['SaveRecord', 'Compute']) {
            const decl = tokens.find(t => (t.label === name || t.value.startsWith(name)) &&
                                          t.subType === TokenType.MapProcedure);
            assert.ok(decl, `${name} should still be a MapProcedure`);
        }
    });

    test('does not claim attributes or multi-token lines as declarations', () => {
        // A MAP entry carrying attributes is not a lone identifier on its line, so
        // the bare-entry rule must not fire on the attribute tokens.
        const tokens = tokenize([
            '  PROGRAM',
            '  MAP',
            '    DoWork(LONG pId),PASCAL,RAW',
            '  END',
            '  CODE',
            '  RETURN'
        ]);

        for (const attr of ['PASCAL', 'RAW']) {
            const bogus = tokens.find(t => t.value.toUpperCase() === attr &&
                                           t.subType === TokenType.MapProcedure);
            assert.strictEqual(bogus, undefined, `${attr} must not be classified as a procedure declaration`);
        }
    });
});
