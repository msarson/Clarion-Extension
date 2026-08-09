import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * #362 step 2 — the SDI now builds a parallel procedure index (`findProcedure`)
 * from the same cheap regex scan, persisted in the disk cache. The load-bearing
 * check is the CACHE ROUND-TRIP: a warm (cache-trusted, #355) build must rebuild
 * the procedure index from the persisted `procs`, or the whole point is lost.
 * Also pinned: procedures must NOT leak into the type `find()` (#361 hover gate).
 */
suite('StructureDeclarationIndexer - procedure index (#362)', () => {

    let tmpDir: string;
    let savedLibsrc: string[] = [];
    const indexer = StructureDeclarationIndexer.getInstance();

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdi-procindex-362-'));
        // A .inc the SDI scans, carrying a MAP prototype and a type declaration.
        fs.writeFileSync(path.join(tmpDir, 'lib.inc'), [
            'MyType   QUEUE,TYPE',
            'F          LONG',
            '         END',
            '  MAP',
            "    MODULE('lib.clw')",
            'MyProc     PROCEDURE(LONG id),STRING',
            '    END',
            '  END'
        ].join('\n'));
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [tmpDir];
        indexer.clearCache();
    });

    teardown(async () => {
        await (indexer as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        await (indexer as unknown as { whenValidated(p: string): Promise<void> }).whenValidated(tmpDir);
        serverSettings.libsrcPaths = savedLibsrc;
        indexer.clearCache();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('cold build indexes procedures via findProcedure', async () => {
        await indexer.buildIndex(tmpDir);
        const hits = indexer.findProcedure('MyProc', tmpDir);
        assert.strictEqual(hits.length, 1, 'MyProc found in the procedure index');
        assert.ok(hits[0].signature.includes('LONG id'), 'signature captured');
    });

    test('procedures do NOT appear in the type index (protects the #361 hover gate)', async () => {
        // Inspect the built index's type map directly (buildIndex populates the
        // procedure index but does not store into this.indexes — only
        // getOrBuildIndex does — so assert on the returned index, not find()).
        const idx = await indexer.buildIndex(tmpDir);
        assert.ok(!idx.byName.has('myproc'), 'a procedure name must not be in the type index');
        assert.ok(idx.byName.has('mytype'), 'the QUEUE type IS in the type index');
        // And the procedure index does hold it.
        assert.ok(indexer.findProcedure('MyProc', tmpDir).length > 0, 'MyProc is in the procedure index');
    });

    test('CACHE ROUND-TRIP: procedures survive a warm (cache-trusted) rebuild', async () => {
        await indexer.buildIndex(tmpDir);       // cold — writes the disk cache (with procs)
        indexer.clearCache();                    // drop the in-memory indexes
        await indexer.buildIndex(tmpDir);        // warm — cache-trusted path (#355)
        const hits = indexer.findProcedure('MyProc', tmpDir);
        assert.strictEqual(hits.length, 1,
            'the warm cache-trusted build must rebuild the procedure index from the persisted procs');
    });
});
