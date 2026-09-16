/**
 * A structure declared WITH a type argument may also add its own inline fields:
 *
 *     ItemQ QUEUE(ItemQueueType)
 *     CategoryName  STRING(16)
 *     SourceSystem  STRING(32)
 *           END
 *
 * Clarion gives `ItemQ` the type's fields PLUS those two. Field hover resolved the
 * declared TYPE and searched only there, so hovering `ItemQ.Code` (an ItemQueueType field)
 * worked while `ItemQ.CategoryName` — declared right there in the block — returned
 * nothing: no type lookup can ever reach an inline field.
 *
 * The block search must also be SCOPE-AWARE. A type name is unique per file, but a VARIABLE
 * name repeats across procedures, and taking the first match in the file can land on an
 * unrelated, empty block of the same name declared elsewhere in the file.
 */

import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { StructureFieldResolver } from '../providers/hover/StructureFieldResolver';

const SOURCE = [
    '  MEMBER()',                        // 0
    '',                                  // 1
    'FirstProc PROCEDURE()',             // 2
    'ItemQ QUEUE(ItemQueueType)',        // 3  <- decoy: same name, NO inline fields
    '      END',                         // 4
    '  CODE',                            // 5
    '  RETURN',                          // 6
    '',                                  // 7
    'SecondProc PROCEDURE()',            // 8
    'ItemQ QUEUE(ItemQueueType)',        // 9  <- the real block
    'CategoryName  STRING(16)',          // 10
    'SourceSystem  STRING(32)',          // 11
    '      END',                         // 12
    '  CODE',                            // 13
    "  ItemQ.CategoryName = 'x'",        // 14 <- hover happens here
    '  RETURN',                          // 15
].join('\n');

suite('StructureFieldHover — inline fields of a structure declared with a type argument', () => {

    function resolver(): any {
        // findFieldInTokens uses only the formatter's locationLink on this path.
        const formatter = { locationLink: (uri: string, line: number) => `[${uri}:${line}]` };
        return new StructureFieldResolver(formatter as never, undefined as never, undefined as never) as any;
    }

    const tokens = new ClarionTokenizer(SOURCE).tokenize();
    const uri = 'file:///c:/temp/inline-fields.clw';

    test('an inline field of the in-scope declaration is found', () => {
        const hover = resolver().findFieldInTokens('ItemQ', 'CategoryName', tokens, uri, 14);
        assert.ok(hover, 'the inline field declared in the block must resolve');
        const text = JSON.stringify(hover);
        assert.ok(text.includes('CategoryName'), `hover should name the field: ${text}`);
        assert.ok(text.includes('STRING'), `hover should carry the field type: ${text}`);
    });

    test('the second inline field resolves too', () => {
        const hover = resolver().findFieldInTokens('ItemQ', 'SourceSystem', tokens, uri, 14);
        assert.ok(hover, 'SourceSystem must resolve');
    });

    test('scope-aware: the decoy declaration above does not win', () => {
        // Line 10 (CategoryName) is inside the SECOND block. Without atLine the search takes
        // the FIRST `ItemQ` in the file (line 3), whose block is empty, and finds nothing.
        const withScope = resolver().findFieldInTokens('ItemQ', 'CategoryName', tokens, uri, 14);
        const withoutScope = resolver().findFieldInTokens('ItemQ', 'CategoryName', tokens, uri);
        assert.ok(withScope, 'scope-aware lookup finds the field');
        assert.strictEqual(withoutScope, null,
            'first-match-in-file lands on the empty decoy block — this is exactly why atLine exists');
    });

    test('a field that is in NEITHER the block nor the file still returns null', () => {
        const hover = resolver().findFieldInTokens('ItemQ', 'NoSuchField', tokens, uri, 14);
        assert.strictEqual(hover, null);
    });

    test('a field belonging to the TYPE (not inline) is not invented by the block search', () => {
        // `Code` lives in ItemQueueType, in another file — the block search must not claim it;
        // the SDI/type tier answers that one.
        const hover = resolver().findFieldInTokens('ItemQ', 'Code', tokens, uri, 14);
        assert.strictEqual(hover, null);
    });
});
