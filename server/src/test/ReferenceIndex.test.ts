import * as assert from 'assert';
import { ReferenceIndex, ReferenceSite } from '../services/ReferenceIndex';

/**
 * #189 Phase 1 — unit tests for the ReferenceIndex data structure, focusing on
 * the count/lookup API and the per-file incremental invalidation (the part that
 * must be correct for Phase 3's edit-time updates not to drift).
 */

const site = (uri: string, line: number, character = 0): ReferenceSite => ({ uri, line, character });

suite('#189 ReferenceIndex', () => {

    test('count + references reflect added sites', () => {
        const idx = new ReferenceIndex();
        idx.add('method:st.addline', site('file:///a.clw', 10));
        idx.add('method:st.addline', site('file:///b.clw', 20));
        idx.add('proc:doThing', site('file:///a.clw', 5));

        assert.strictEqual(idx.count('method:st.addline'), 2);
        assert.strictEqual(idx.count('proc:doThing'), 1);
        assert.strictEqual(idx.count('method:unknown'), 0);
        assert.strictEqual(idx.references('method:st.addline').length, 2);
        assert.deepStrictEqual(idx.references('method:unknown'), []);
    });

    test('references() returns a copy (caller cannot mutate internal state)', () => {
        const idx = new ReferenceIndex();
        idx.add('proc:x', site('file:///a.clw', 1));
        const refs = idx.references('proc:x');
        refs.push(site('file:///b.clw', 2));
        assert.strictEqual(idx.count('proc:x'), 1, 'mutating the returned array must not affect the index');
    });

    test('removeFile drops only that file\'s sites', () => {
        const idx = new ReferenceIndex();
        idx.add('method:st.addline', site('file:///a.clw', 10));
        idx.add('method:st.addline', site('file:///b.clw', 20));

        idx.removeFile('file:///a.clw');

        assert.strictEqual(idx.count('method:st.addline'), 1, 'only b.clw\'s site should remain');
        assert.strictEqual(idx.references('method:st.addline')[0].uri, 'file:///b.clw');
    });

    test('removeFile deletes the symbol entry when no sites remain', () => {
        const idx = new ReferenceIndex();
        idx.add('proc:only', site('file:///a.clw', 3));
        idx.removeFile('file:///a.clw');
        assert.strictEqual(idx.count('proc:only'), 0);
    });

    test('removeFile is case-insensitive on the URI', () => {
        const idx = new ReferenceIndex();
        idx.add('proc:x', site('file:///C:/Proj/A.clw', 1));
        idx.removeFile('file:///c:/proj/a.clw');
        assert.strictEqual(idx.count('proc:x'), 0, 'URI case must not prevent invalidation');
    });

    test('reindexFile replaces a file\'s contributions, leaves other files intact', () => {
        const idx = new ReferenceIndex();
        idx.add('method:st.addline', site('file:///a.clw', 10)); // a contributes 1
        idx.add('method:st.addline', site('file:///b.clw', 20)); // b contributes 1

        // a.clw edited: now references addline twice and also references removeline.
        idx.reindexFile('file:///a.clw', [
            { symbolKey: 'method:st.addline', site: site('file:///a.clw', 11) },
            { symbolKey: 'method:st.addline', site: site('file:///a.clw', 12) },
            { symbolKey: 'method:st.removeline', site: site('file:///a.clw', 30) },
        ]);

        assert.strictEqual(idx.count('method:st.addline'), 3, 'b\'s 1 + a\'s new 2');
        assert.strictEqual(idx.count('method:st.removeline'), 1, 'a\'s new contribution');
        // b.clw untouched
        assert.ok(idx.references('method:st.addline').some(s => s.uri === 'file:///b.clw'));
    });

    test('reindexFile to empty removes the file\'s prior contributions', () => {
        const idx = new ReferenceIndex();
        idx.add('proc:x', site('file:///a.clw', 1));
        idx.reindexFile('file:///a.clw', []);
        assert.strictEqual(idx.count('proc:x'), 0);
    });

    test('keysReferencingFile lists the symbols with sites in a file', () => {
        const idx = new ReferenceIndex();
        idx.add('proc:a', site('file:///x.clw', 1));
        idx.add('proc:b', site('file:///x.clw', 2));
        idx.add('proc:c', site('file:///y.clw', 3));

        const inX = idx.keysReferencingFile('file:///x.clw').sort();
        assert.deepStrictEqual(inX, ['proc:a', 'proc:b']);
        assert.deepStrictEqual(idx.keysReferencingFile('file:///y.clw'), ['proc:c']);
        assert.deepStrictEqual(idx.keysReferencingFile('file:///none.clw'), []);
    });

    test('keysReferencingFile is case-insensitive on the URI', () => {
        const idx = new ReferenceIndex();
        idx.add('proc:a', site('file:///C:/P/X.clw', 1));
        assert.deepStrictEqual(idx.keysReferencingFile('file:///c:/p/x.clw'), ['proc:a']);
    });

    test('removeSymbol drops the symbol from every file it touched', () => {
        const idx = new ReferenceIndex();
        idx.add('method:st.addline', site('file:///a.clw', 10));
        idx.add('method:st.addline', site('file:///b.clw', 20));
        idx.add('proc:other', site('file:///a.clw', 5));

        idx.removeSymbol('method:st.addline');

        assert.strictEqual(idx.count('method:st.addline'), 0);
        // its keys are gone from both files, but the other symbol survives
        assert.deepStrictEqual(idx.keysReferencingFile('file:///a.clw'), ['proc:other']);
        assert.deepStrictEqual(idx.keysReferencingFile('file:///b.clw'), []);
        assert.strictEqual(idx.count('proc:other'), 1);
    });

    test('ready flag + clear', () => {
        const idx = new ReferenceIndex();
        assert.strictEqual(idx.isReady(), false);
        idx.setReady(true);
        assert.strictEqual(idx.isReady(), true);
        idx.add('proc:x', site('file:///a.clw', 1));
        idx.clear();
        assert.strictEqual(idx.count('proc:x'), 0);
        assert.strictEqual(idx.isReady(), false);
    });
});
