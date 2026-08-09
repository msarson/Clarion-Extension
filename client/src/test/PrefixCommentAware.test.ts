import * as assert from 'assert';
import {
    firstCommentIndex,
    findPrefixMatchesOutsideComments,
} from '../utils/clarionCommentScanner';

/**
 * #397 — prefix highlighting bleeds through comments. When a line is commented
 * (a leading `!`, or a trailing `!`/`|` after code), the user expects the whole
 * comment to read as a comment; the custom prefix colours (lc:, gn:, …) must not
 * paint the prefixed variables that sit inside the comment.
 *
 * Both helpers are pure and vscode-free, so they run in the client mocha suite.
 */

// The exact prefix regex the decorator builds: \b(lc|ln|gc|gn):(\w+)\b, global.
const prefixRegex = () => /\b(lc|ln|gc|gn):(\w+)\b/g;

suite('#397 firstCommentIndex', () => {
    test('no comment → -1', () => {
        assert.strictEqual(firstCommentIndex('message(lc:val1 & gn:decimal)'), -1);
    });

    test('leading ! at column 0 → 0', () => {
        assert.strictEqual(firstCommentIndex('!message(lc:val1)'), 0);
    });

    test('trailing ! after code → index of the !', () => {
        const line = 'lc:foo = 1  ! lc:bar';
        assert.strictEqual(firstCommentIndex(line), line.indexOf('!'));
    });

    test('! inside a single-quoted string is not a comment', () => {
        assert.strictEqual(firstCommentIndex("lc:foo = 'a!b'"), -1);
    });

    test('real comment ! after a string with a bang inside it', () => {
        const line = "lc:foo = 'a!b'  ! lc:bar";
        assert.strictEqual(firstCommentIndex(line), line.lastIndexOf('!'));
    });

    test('doubled quote is an escape, still inside the string', () => {
        // The '' is an escaped quote, so the ! stays inside the string literal.
        assert.strictEqual(firstCommentIndex("x = 'don''t! stop'"), -1);
    });

    test('| line-continuation begins a comment region', () => {
        const line = 'message(lc:foo | gn:bar continued';
        assert.strictEqual(firstCommentIndex(line), line.indexOf('|'));
    });

    test('| inside a string is not a comment', () => {
        assert.strictEqual(firstCommentIndex("lc:foo = 'a|b'"), -1);
    });
});

suite('#397 findPrefixMatchesOutsideComments', () => {
    test('fully commented line yields no matches (the reported bug)', () => {
        const line = "!message(lc:val2 &' : '& lc:val1 &' : '& gn:decimal)";
        const matches = findPrefixMatchesOutsideComments(line, prefixRegex());
        assert.deepStrictEqual(matches, []);
    });

    test('uncommented line yields all prefix matches', () => {
        const line = 'message(lc:val2 & lc:val1 & gn:decimal)';
        const matches = findPrefixMatchesOutsideComments(line, prefixRegex());
        assert.deepStrictEqual(matches.map(m => `${m.prefix}:${m.identifier}`),
            ['lc:val2', 'lc:val1', 'gn:decimal']);
    });

    test('code before a trailing comment is highlighted; prefixes in the comment are not', () => {
        const line = 'lc:foo = gn:bar  ! lc:hidden gn:hidden';
        const matches = findPrefixMatchesOutsideComments(line, prefixRegex());
        assert.deepStrictEqual(matches.map(m => `${m.prefix}:${m.identifier}`),
            ['lc:foo', 'gn:bar']);
        // Ranges point at the real code, not the comment.
        assert.strictEqual(matches[0].start, 0);
        assert.strictEqual(matches[0].end, 'lc:foo'.length);
    });

    test('start/end offsets are correct for a mid-line match', () => {
        const line = '  gc:total = 0';
        const [m] = findPrefixMatchesOutsideComments(line, prefixRegex());
        assert.strictEqual(line.slice(m.start, m.end), 'gc:total');
    });
});
