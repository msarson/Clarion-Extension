import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * #290 — mtime-keyed disk persistence for the structure-declaration index. A rebuild reuses the
 * cached scan results for files whose mtime is unchanged (one stat instead of read+scan), rescans
 * changed files, and produces identical lookup results either way.
 */
suite('#290 SDI disk cache', () => {
    let tmpDir: string;
    let savedLibsrc: string[] = [];
    const indexer = StructureDeclarationIndexer.getInstance();

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdi-cache-290-'));
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [tmpDir];
        fs.writeFileSync(path.join(tmpDir, 'MyClass.inc'), [
            'MyClass CLASS,TYPE,MODULE(\'MyClass.clw\')',
            'Init      PROCEDURE()',
            '        END'
        ].join('\n'));
        indexer.clearCache();
    });

    teardown(() => {
        serverSettings.libsrcPaths = savedLibsrc;
        indexer.clearCache();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('cold build scans; warm build reuses from disk with identical results', async () => {
        const cold = await indexer.buildIndex(tmpDir);
        assert.ok(cold.byName.has('myclass'), 'cold build indexes MyClass');
        assert.ok(indexer.lastBuildStats, 'stats recorded');
        assert.strictEqual(indexer.lastBuildStats!.scanned, 1, 'cold build scanned the file');
        assert.strictEqual(indexer.lastBuildStats!.reusedFromDisk, 0);

        const warm = await indexer.buildIndex(tmpDir);
        assert.strictEqual(indexer.lastBuildStats!.reusedFromDisk, 1, 'warm build reused the disk entry');
        assert.strictEqual(indexer.lastBuildStats!.scanned, 0, 'warm build scanned nothing');
        // JSON round-trip drops `undefined`-valued optional properties (parentName etc.) — that's
        // semantically identical for every consumer (`d.parentName` reads undefined either way),
        // so compare the JSON-normalized shapes.
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(warm.byName.get('myclass'))),
            JSON.parse(JSON.stringify(cold.byName.get('myclass'))),
            'warm results identical to cold'
        );
    });

    test('a changed file (new mtime) is rescanned and new declarations appear', async () => {
        await indexer.buildIndex(tmpDir);

        const file = path.join(tmpDir, 'MyClass.inc');
        fs.appendFileSync(file, '\nOtherClass CLASS,TYPE\n        END\n');
        // Force an mtime change even on coarse-resolution file systems.
        const future = new Date(Date.now() + 5_000);
        fs.utimesSync(file, future, future);

        const rebuilt = await indexer.buildIndex(tmpDir);
        assert.strictEqual(indexer.lastBuildStats!.scanned, 1, 'changed file rescanned');
        assert.ok(rebuilt.byName.has('otherclass'), 'new declaration picked up');
        assert.ok(rebuilt.byName.has('myclass'), 'existing declaration retained');
    });

    test('a corrupt disk cache degrades to a full scan (no crash)', async () => {
        await indexer.buildIndex(tmpDir);
        // Locate and corrupt the cache file for this project (hash-named in the SDI temp dir).
        const cacheDir = path.join(os.tmpdir(), 'clarion-extension-sdi');
        for (const f of fs.readdirSync(cacheDir)) {
            const p = path.join(cacheDir, f);
            const content = fs.readFileSync(p, 'utf8');
            if (content.includes(tmpDir.replace(/\\/g, '\\\\')) || content.toLowerCase().includes(tmpDir.toLowerCase().replace(/\\/g, '\\\\'))) {
                fs.writeFileSync(p, '{ not valid json');
            }
        }
        const rebuilt = await indexer.buildIndex(tmpDir);
        assert.ok(rebuilt.byName.has('myclass'), 'full rescan still succeeds');
    });
});
