/**
 * #294 — ReferenceCountIndex: one-pass approximate identifier-occurrence index
 * that replaces per-lens Find-All-References scans for CodeLens counts.
 *
 * Pins:
 *   1. scanContent counts identifiers, excluding string literals, ! comments,
 *      and structural keywords.
 *   2. Cold build → counts across files; warm rebuild reuses every unchanged
 *      file from the mtime-keyed disk cache with identical totals.
 *   3. updateFile adjusts totals by delta (live-buffer sync).
 *   4. getCount: dotted lens symbols query their last segment; undefined until
 *      built (callers fall back to the scan path).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';

let tmpDir: string;

function writeFixture(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
}

suite('ReferenceCountIndex #294', () => {

    let files: string[];

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refidx294_'));
        files = [
            writeFixture('a.clw', [
                '  PROGRAM',
                '  MAP',
                "  MyProc(),long,name('MyProc')   ! MyProc in a comment does not count",
                '  END',
                '  CODE',
                '  MyProc()',
                "  Msg('call MyProc inside a string does not count')",
            ].join('\n')),
            writeFixture('b.clw', [
                "  MEMBER('a.clw')",
                'Caller PROCEDURE()',
                '  CODE',
                '  MyProc()',
                '  MyProc()',
            ].join('\n')),
        ];
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => ReferenceCountIndex.getInstance().reset());

    test('scanContent: strings, comments, and structural keywords excluded', () => {
        const counts = ReferenceCountIndex.scanContent([
            "  Foo = Bar('Baz inside string') ! Qux in comment",
            '  IF Foo THEN Bar END',
        ].join('\n'));

        assert.strictEqual(counts.get('foo'), 2);
        assert.strictEqual(counts.get('bar'), 2);
        assert.strictEqual(counts.get('baz'), undefined, 'string contents excluded');
        assert.strictEqual(counts.get('qux'), undefined, 'comment contents excluded');
        assert.strictEqual(counts.get('if'), undefined, 'keywords excluded');
        assert.strictEqual(counts.get('end'), undefined, 'keywords excluded');
    });

    test('cold build counts across files; warm rebuild reuses the disk cache identically', async () => {
        const idx = ReferenceCountIndex.getInstance();
        assert.strictEqual(idx.getCount('MyProc'), undefined, 'unbuilt index answers undefined');

        await idx.buildInBackground(files);
        // a.clw: declaration + call = 2 (comment + string excluded); b.clw: 2 calls.
        assert.strictEqual(idx.getCount('MyProc'), 4);
        const cold = idx.lastBuildStats!;
        assert.strictEqual(cold.reusedFromDisk + cold.scanned, 2);

        idx.reset();
        await idx.buildInBackground(files);
        const warm = idx.lastBuildStats!;
        assert.strictEqual(warm.scanned, 0, `warm rebuild must scan nothing (scanned=${warm.scanned})`);
        assert.strictEqual(warm.reusedFromDisk, 2);
        assert.strictEqual(idx.getCount('MyProc'), 4, 'replayed totals identical');
    });

    test('updateFile adjusts totals by delta', async () => {
        const idx = ReferenceCountIndex.getInstance();
        await idx.buildInBackground(files);
        assert.strictEqual(idx.getCount('MyProc'), 4);

        // Live edit of b.clw: one call removed, a new name introduced.
        idx.updateFile(files[1], [
            "  MEMBER('a.clw')",
            'Caller PROCEDURE()',
            '  CODE',
            '  MyProc()',
            '  OtherThing()',
        ].join('\n'));

        assert.strictEqual(idx.getCount('MyProc'), 3, 'removed occurrence subtracted');
        assert.strictEqual(idx.getCount('OtherThing'), 1, 'new name counted');
    });

    test('dotted lens symbols scope to files that mention the qualifier (#315)', async () => {
        // Pin flexed by #315: dotted symbols originally queried their bare last
        // segment solution-wide, which produced "3372 references" for ubiquitous
        // member names. They now count only in files where the qualifier co-occurs.
        const idx = ReferenceCountIndex.getInstance();
        await idx.buildInBackground(files);
        assert.strictEqual(idx.getCount('SomeClass.MyProc'), 0, 'qualifier mentioned nowhere → 0');
        assert.strictEqual(idx.getCount('Caller.MyProc'), 2, 'qualifier only in b.clw → b.clw occurrences only');
        assert.strictEqual(idx.getCount('NeverMentioned'), 0, 'built index answers 0 for unknown names');
    });
});
