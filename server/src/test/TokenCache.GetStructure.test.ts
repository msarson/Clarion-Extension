import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';

/**
 * #258 — TokenCache.getStructure() contract.
 *
 * Pre-fix, getStructure():
 *   - captured `cached = this.cache.get(uri)` BEFORE calling getTokens(), so on a
 *     cold cache the snapshot was undefined, the cache-warming write went to a
 *     detached object (or nowhere), and the structure getTokens() had just built
 *     and cached was DISCARDED in favor of a redundantly re-processed one;
 *   - unconditionally re-built + re-processed on every cache miss — the exact
 *     "second pass on shared tokens" hazard the class's own comments warn about.
 *
 * Post-fix: getStructure() re-checks the cache after getTokens() and returns the
 * structure the tokenize pipeline already built — same instance on every call for
 * an unchanged document.
 */
suite('TokenCache.getStructure (#258)', () => {

    const SOURCE = [
        '   PROGRAM',
        '   MAP',
        'Foo      PROCEDURE()',
        '   END',
        '   CODE',
        '   RETURN',
        '',
        'Foo      PROCEDURE()',
        '   CODE',
        '   RETURN',
    ].join('\n');

    setup(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    test('cold cache: two getStructure() calls return the SAME instance', () => {
        const doc = TextDocument.create('file:///t258-cold.clw', 'clarion', 1, SOURCE);
        const cache = TokenCache.getInstance();

        // No getTokens() first — getStructure is the first touch (cold cache).
        const s1 = cache.getStructure(doc);
        const s2 = cache.getStructure(doc);

        assert.ok(s1, 'first getStructure returns a structure');
        assert.strictEqual(s1, s2,
            'getStructure must return the cached instance on repeat calls — ' +
            'a different instance means the cold-cache call discarded the cached one and re-processed');
    });

    test('warm cache: getStructure() returns the structure the tokenize pipeline cached', () => {
        const doc = TextDocument.create('file:///t258-warm.clw', 'clarion', 1, SOURCE);
        const cache = TokenCache.getInstance();

        cache.getTokens(doc);            // tokenize + process once, caches structure
        const s1 = cache.getStructure(doc);
        const s2 = cache.getStructure(doc);

        assert.strictEqual(s1, s2, 'warm-path getStructure must be stable');
    });

    test('getTokens() array identity is stable per (uri, version)', () => {
        // Pinned here because the #257 ScopeTypeIndexService caching plan depends on it.
        const doc = TextDocument.create('file:///t258-identity.clw', 'clarion', 1, SOURCE);
        const cache = TokenCache.getInstance();

        const t1 = cache.getTokens(doc);
        const t2 = cache.getTokens(doc);
        assert.strictEqual(t1, t2, 'same (uri, version) must return the same Token[] instance');
    });
});
