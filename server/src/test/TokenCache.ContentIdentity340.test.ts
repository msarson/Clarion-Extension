import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../ClarionTokenizer';

/**
 * Issue #340 — TokenCache's hit test was `uri + version` only. Synthetic
 * documents (cross-file loaders create them at version 1) collide with cached
 * entries for a file whose content changed OUTSIDE the editor (appgen
 * regeneration, git, scripted edits): the cache returned STALE tokens paired
 * with FRESH content, so line-indexed consumers read the wrong lines —
 * Mark's smoke saw a phantom "signature does not match its implementation"
 * after the fixture was edited on disk while the session had it cached.
 *
 * Fix under test: the version-equal hit also requires `documentText` identity;
 * a mismatch falls through to incremental/full re-tokenization.
 */

const OLD_CONTENT = [
    '  MEMBER',
    '  MAP',
    '  END',
    'MyProc PROCEDURE()',      // line 3
    '  CODE',
    '  RETURN',
].join('\r\n');

// Three lines inserted above the implementation — the smoke's exact shape.
const NEW_CONTENT = [
    '  MEMBER',
    '  MAP',
    "    MODULE('self.clw')",
    'Other  PROCEDURE()',
    '    END',
    '  END',
    'MyProc PROCEDURE()',      // line 6 now
    '  CODE',
    '  RETURN',
].join('\r\n');

suite('Issue #340 — TokenCache content identity', () => {

    let uriCounter = 0;
    function freshUri(): string {
        return `file:///c:/test340/module-${++uriCounter}.clw`;
    }

    test('same uri+version with CHANGED content returns fresh tokens (outside-editor edit shape)', () => {
        const cache = TokenCache.getInstance();
        const uri = freshUri();

        // Seed: old content, version 1 (a synthetic cross-file load).
        cache.getTokens(TextDocument.create(uri, 'clarion', 1, OLD_CONTENT));

        // The file changed on disk; a later loader reads fresh content and
        // builds another version-1 synthetic document.
        const tokens = cache.getTokens(TextDocument.create(uri, 'clarion', 1, NEW_CONTENT));

        const impl = tokens.find(t => t.label === 'MyProc' && t.subType === TokenType.GlobalProcedure);
        assert.ok(impl, 'MyProc implementation token not found');
        assert.strictEqual(impl!.line, 6,
            `token must reflect the NEW content (impl at line 6); got line ${impl!.line} — stale tokens paired with fresh content`);
    });

    test('regression: same uri+version+content stays a cache hit (same array instance)', () => {
        const cache = TokenCache.getInstance();
        const uri = freshUri();

        const first = cache.getTokens(TextDocument.create(uri, 'clarion', 1, OLD_CONTENT));
        const second = cache.getTokens(TextDocument.create(uri, 'clarion', 1, OLD_CONTENT));

        assert.strictEqual(second, first, 'identical content at the same version must remain a cache hit');
    });

    test('regression: version bump with changed content still re-tokenizes (open-file edit path)', () => {
        const cache = TokenCache.getInstance();
        const uri = freshUri();

        cache.getTokens(TextDocument.create(uri, 'clarion', 1, OLD_CONTENT));
        const tokens = cache.getTokens(TextDocument.create(uri, 'clarion', 2, NEW_CONTENT));

        const impl = tokens.find(t => t.label === 'MyProc' && t.subType === TokenType.GlobalProcedure);
        assert.strictEqual(impl!.line, 6);
    });
});
