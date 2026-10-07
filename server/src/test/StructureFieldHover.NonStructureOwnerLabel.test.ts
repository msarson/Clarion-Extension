/**
 * `Owner.Field` hover must take `Owner` from a label that OPENS a structure.
 *
 * A data block often has a plain field named like a FILE elsewhere, and a field of the same
 * name as one of that FILE's fields:
 *
 *     ItemQType  QUEUE,TYPE
 *     Widget       LONG                      <- plain field, same name as the FILE
 *     Notes        LIKE(Widget.Notes)        <- hover `Notes` here
 *                END
 *
 * findFieldInTokens took the nearest column-0 `Widget` label as the owner without checking that
 * it opens a structure. `Widget LONG` opens none, so the search range never closed, and the
 * first `Notes` after it - the declaring line itself - was reported as `Widget Field: Notes`.
 * The hover pointed at its own line instead of the FILE's field.
 */

import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { StructureFieldResolver } from '../providers/hover/StructureFieldResolver';

const SOURCE = [
    'ItemQType  QUEUE,TYPE',               // 0
    'Widget       LONG',                   // 1  <- not a structure
    'Comment      STRING(30)',             // 2
    'Notes        LIKE(Widget.Notes)',     // 3  <- hover happens here
    '           END',                      // 4
    '',                                    // 5
    'Holder     GROUP',                    // 6
    'Notes        STRING(20)',             // 7
    '           END',                      // 8
].join('\n');

suite('StructureFieldHover - an owner label that opens no structure', () => {

    function resolver(): any {
        const formatter = { locationLink: (uri: string, line: number) => `[${uri}:${line}]` };
        // A LIKE field's card asks the variable resolver what LIKE names (#656).
        const variableResolver = { likeFor: async () => null };
        return new StructureFieldResolver(formatter as never, undefined as never, variableResolver as never) as any;
    }

    const tokens = new ClarionTokenizer(SOURCE).tokenize();
    const uri = 'file:///c:/temp/non-structure-owner.inc';

    test('a plain field named like the owner is not taken as the owner (scoped lookup)', async () => {
        const hover = await resolver().findFieldInTokens('Widget', 'Notes', tokens, uri, 3);
        assert.strictEqual(hover, null, `must not resolve to the declaring line itself: ${JSON.stringify(hover)}`);
    });

    test('a plain field named like the owner is not taken as the owner (first-in-file lookup)', async () => {
        const hover = await resolver().findFieldInTokens('Widget', 'Notes', tokens, uri);
        assert.strictEqual(hover, null, `must not resolve to the declaring line itself: ${JSON.stringify(hover)}`);
    });

    test('a real structure owner still resolves its field', async () => {
        const hover = await resolver().findFieldInTokens('Holder', 'Notes', tokens, uri, 8);
        assert.ok(hover, 'Holder.Notes must resolve');
        assert.ok(JSON.stringify(hover).includes('STRING'), `got: ${JSON.stringify(hover)}`);
    });
});
