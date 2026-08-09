import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { SolutionManager } from '../solution/solutionManager';
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

    teardown(async () => {
        // #357: drain any deferred validation left by a test before settling.
        await (indexer as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        // #355: let any in-flight background validation settle before tearing the
        // fixture down — a straggler would otherwise mutate stats mid-next-test.
        await (indexer as unknown as { whenValidated(p: string): Promise<void> }).whenValidated(tmpDir);
        (indexer as unknown as { deferBackgroundValidation: boolean }).deferBackgroundValidation = false;
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

        // Pin flexed under #355: the rebuild serves the trusted cache first and the
        // rescan happens in the background — the guarantee is now "after validation
        // completes, the change is reflected" (mid-session changes stay covered by
        // the #340 watcher, which evicts rather than trusts).
        const rebuilt = await indexer.buildIndex(tmpDir);
        await indexer.whenValidated(tmpDir);
        assert.strictEqual(indexer.lastValidationStats!.scanned, 1, 'changed file rescanned by background validation');
        assert.ok(rebuilt.byName.has('otherclass'), 'new declaration picked up');
        assert.ok(rebuilt.byName.has('myclass'), 'existing declaration retained');
    });

    test('#357: with deferBackgroundValidation set, a cache-trusted build does NOT auto-run the sweep', async () => {
        // Cold build writes the cache; clear the in-memory index so the next build is cache-trusted.
        await indexer.buildIndex(tmpDir);
        indexer.clearCache();
        indexer.lastValidationStats = null;

        const ext = indexer as unknown as {
            deferBackgroundValidation: boolean;
            runDeferredValidations(): Promise<void>;
        };
        ext.deferBackgroundValidation = true;

        // Change a file so a sweep WOULD detect drift — proving the sweep truly didn't run.
        const file = path.join(tmpDir, 'MyClass.inc');
        fs.appendFileSync(file, '\nOtherClass CLASS,TYPE\n        END\n');
        const future = new Date(Date.now() + 5_000);
        fs.utimesSync(file, future, future);

        const built = await indexer.buildIndex(tmpDir);
        // Give any (erroneously-launched) background sweep a chance to run.
        await new Promise<void>(resolve => setTimeout(resolve, 50));
        assert.strictEqual(indexer.lastValidationStats as unknown, null,
            'deferred mode must not auto-launch the validation sweep');
        assert.ok(!built.byName.has('otherclass'),
            'index still serves the trusted snapshot; the change is not yet reflected');

        // Draining the lane runs the sweep and reconciles the drift.
        await ext.runDeferredValidations();
        const stats = indexer.lastValidationStats as { scanned: number } | null;
        assert.ok(stats, 'runDeferredValidations executed the sweep');
        assert.strictEqual(stats!.scanned, 1, 'the changed file was rescanned');
        assert.ok(built.byName.has('otherclass'), 'index reconciled in place after draining');
    });

    test('#357: runDeferredValidations runs multiple projects strictly one at a time', async () => {
        // Second project dir with its own cache.
        const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sdi-cache-357b-'));
        fs.writeFileSync(path.join(tmpDir2, 'Other.inc'), 'OtherClass CLASS,TYPE\n        END\n');
        const savedLib = serverSettings.libsrcPaths;
        const ext = indexer as unknown as {
            deferBackgroundValidation: boolean;
            runDeferredValidations(): Promise<void>;
            statScanFiles: (files: string[], cache: unknown) => Promise<unknown>;
        };
        try {
            // Warm both caches.
            serverSettings.libsrcPaths = [tmpDir];
            await indexer.buildIndex(tmpDir);
            serverSettings.libsrcPaths = [tmpDir2];
            await indexer.buildIndex(tmpDir2);
            indexer.clearCache();
            ext.deferBackgroundValidation = true;

            // Instrument statScanFiles to record concurrent entries.
            const original = ext.statScanFiles.bind(indexer);
            let inFlight = 0;
            let maxInFlight = 0;
            ext.statScanFiles = async (files: string[], cache: unknown) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise<void>(resolve => setTimeout(resolve, 20));
                const result = await original(files, cache);
                inFlight--;
                return result;
            };

            serverSettings.libsrcPaths = [tmpDir];
            await indexer.buildIndex(tmpDir);
            serverSettings.libsrcPaths = [tmpDir2];
            await indexer.buildIndex(tmpDir2);

            await ext.runDeferredValidations();
            assert.strictEqual(maxInFlight, 1,
                'deferred validations must never overlap — one disk sweep at a time');

            ext.statScanFiles = original;
        } finally {
            serverSettings.libsrcPaths = savedLib;
            try { fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    test('#290: with a solution loaded, a non-project (dirname) key redirects to the existing index — no rogue scan', async () => {
        const smSlot = SolutionManager as unknown as { instance: unknown };
        const savedSm = smSlot.instance;
        const savedRedFile = serverSettings.redirectionFile;
        try {
            serverSettings.redirectionFile = 'Clarion110.red';
            smSlot.instance = { solution: { projects: [{ path: tmpDir }] } };

            // Build the (sole) project index, then request an arbitrary directory key —
            // must return the existing index instead of scanning that directory.
            const projectIndex = await indexer.getOrBuildIndex(tmpDir);
            indexer.lastBuildStats = null;
            const otherDir = path.join(tmpDir, 'no-such-subdir');
            const redirected = await indexer.getOrBuildIndex(otherDir);
            assert.strictEqual(redirected, projectIndex, 'redirected to the existing project index');
            assert.strictEqual(indexer.lastBuildStats, null, 'no new scan was launched');

            // find() with the unknown key falls through to the cross-index search.
            assert.ok(indexer.find('MyClass', otherDir).length > 0, 'find falls back across indexes');
        } finally {
            smSlot.instance = savedSm;
            serverSettings.redirectionFile = savedRedFile;
        }
    });

    test('#355: warm start trusts the disk cache — declarations served before any stat sweep', async () => {
        // Cold build writes the disk cache.
        await indexer.buildIndex(tmpDir);
        indexer.clearCache();

        // Delete the source file AFTER the cache was written. A build that
        // stat-validates every file before serving would drop the declaration;
        // a cache-trusted build serves it immediately and reconciles in the
        // background (the #340 watcher contract, extended to startup).
        fs.rmSync(path.join(tmpDir, 'MyClass.inc'));

        const ext = indexer as unknown as {
            whenValidated?: (projectPath: string) => Promise<void>;
            onDrift?: (projectPath: string) => void;
        };
        assert.ok(typeof ext.whenValidated === 'function',
            'indexer.whenValidated must exist (#355 background validation handle)');

        const drifted: string[] = [];
        ext.onDrift = p => drifted.push(p);
        try {
            const trusted = await indexer.buildIndex(tmpDir);
            assert.ok(trusted.byName.has('myclass'),
                'trusted startup serves the cached declaration without statting the file set');

            await ext.whenValidated!(tmpDir);
            assert.ok(!trusted.byName.has('myclass'),
                'background validation reconciles the deletion in place');
            assert.strictEqual(drifted.length, 1, 'drift callback fired once');
        } finally {
            ext.onDrift = undefined;
        }
    });

    test('#355: background validation picks up a changed file and updates the index in place', async () => {
        await indexer.buildIndex(tmpDir);
        indexer.clearCache();

        const file = path.join(tmpDir, 'MyClass.inc');
        fs.appendFileSync(file, '\nOtherClass CLASS,TYPE\n        END\n');
        const future = new Date(Date.now() + 5_000);
        fs.utimesSync(file, future, future);

        const ext = indexer as unknown as {
            whenValidated?: (projectPath: string) => Promise<void>;
            onDrift?: (projectPath: string) => void;
        };
        const drifted: string[] = [];
        ext.onDrift = p => drifted.push(p);
        try {
            const trusted = await indexer.buildIndex(tmpDir);
            assert.ok(!trusted.byName.has('otherclass'), 'trusted snapshot predates the change');
            assert.ok(trusted.byName.has('myclass'), 'existing declaration served from cache');

            await ext.whenValidated!(tmpDir);
            assert.ok(trusted.byName.has('otherclass'), 'changed file rescanned in background, index updated in place');
            assert.ok(trusted.byName.has('myclass'), 'existing declaration retained');
            assert.strictEqual(drifted.length, 1, 'drift callback fired once');
        } finally {
            ext.onDrift = undefined;
        }
    });

    test('#355: clean validation (no drift) fires no callback', async () => {
        await indexer.buildIndex(tmpDir);
        indexer.clearCache();

        const ext = indexer as unknown as {
            whenValidated?: (projectPath: string) => Promise<void>;
            onDrift?: (projectPath: string) => void;
        };
        const drifted: string[] = [];
        ext.onDrift = p => drifted.push(p);
        try {
            const trusted = await indexer.buildIndex(tmpDir);
            assert.ok(trusted.byName.has('myclass'));
            await ext.whenValidated!(tmpDir);
            assert.ok(trusted.byName.has('myclass'), 'index unchanged after clean validation');
            assert.strictEqual(drifted.length, 0, 'no drift → no callback');
        } finally {
            ext.onDrift = undefined;
        }
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
