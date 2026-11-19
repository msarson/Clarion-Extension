import * as assert from 'assert';
import { HoverFormatter } from '../providers/hover/HoverFormatter';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenCache } from '../TokenCache';

/**
 * The header line of a method hover (`**Name** — ... Class Method · Owner  returns \`TYPE\``) is built from
 * the member's declaration as written, trailing `!` comment included. `parseMethodModifiers` split that on
 * commas and took the first unknown token as the return type, so the comment leaked into the header:
 *
 *   Count  PROCEDURE(LONG pId),LONG  !Rows found, or -1 when closed  -> returns `LONG  !Rows found`
 *   Upper  PROCEDURE(*STRING pText)  !Upper-cases pText (in place)   -> returns `!Upper-cases pText (in place)`
 *   Reset  PROCEDURE(),LONG,DERIVED  !Parent first, then Refresh     -> no "Derived" ("DERIVED  !Parent first")
 *
 * The comment is now stripped before the attributes are read. The declaration snippet under the header is
 * not touched: it quotes the line, comment and all.
 */
suite('HoverFormatter method header: a trailing comment is not part of the signature', () => {
    const formatter = new HoverFormatter(new ScopeAnalyzer(TokenCache.getInstance(), undefined as never));

    /** The header (first line) of the class-member hover for `type`. The file does not exist, so the
     *  snippet falls back to the type string and nothing is read from disk. */
    function header(name: string, type: string): string {
        const hover = formatter.formatClassMember(name, { type, className: 'SomeClass', line: 0, file: 'test://fixture/none.inc' });
        const value = (hover.contents as { value: string }).value;
        return value.split('\n')[0];
    }

    test('a comment with a comma after the return type -> returns the type alone', () => {
        const h = header('Count', 'PROCEDURE(LONG pId),LONG  !Rows found, or -1 when closed');
        assert.ok(h.endsWith('returns `LONG`'), h);
        assert.ok(!h.includes('!'), h);
    });

    test('a comment and no return type -> no "returns" at all', () => {
        const h = header('Upper', 'PROCEDURE(*STRING pText)  !Upper-cases pText (in place)');
        assert.ok(!h.includes('returns'), h);
        assert.ok(!h.includes('!'), h);
    });

    test('DERIVED before a comment is still read as Derived', () => {
        const h = header('Reset', 'PROCEDURE(),LONG,DERIVED  !Parent first, then Refresh');
        assert.ok(h.includes('Derived Class Method'), h);
        assert.ok(h.endsWith('returns `LONG`'), h);
    });

    test('a ! inside a string literal is not a comment', () => {
        const h = header('Join', "PROCEDURE(STRING pSep='!'),STRING  !Joins with pSep");
        assert.ok(h.endsWith('returns `STRING`'), h);
    });

    test('without a comment the header is unchanged (regression guard)', () => {
        const h = header('Init', 'PROCEDURE(LONG pX),BYTE,VIRTUAL');
        assert.strictEqual(h, '**Init** — Virtual Class Method · SomeClass  returns `BYTE`');
    });
});
