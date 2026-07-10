/**
 * #307 — FRG mtime-keyed disk persistence (mirrors the SDI's cache).
 *
 * The graph rebuilt from scratch on every start: 1.9-8.3s (disk-variable) for
 * the same 3,016 unchanged files on Mark's VM. Pins:
 *   1. Warm rebuild replays every unchanged file from the cache (scanned=0)
 *      and produces an identical edge set.
 *   2. An mtime-bumped, content-changed file is re-scanned and its NEW edges
 *      land in the graph (no stale replay).
 *   3. A changed resolution signature discards the cache wholesale.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileRelationshipGraph, FileEdge } from '../FileRelationshipGraph';
import { TokenCache } from '../TokenCache';
import { serverSettings } from '../serverSettings';

let tmpDir: string;

function writeFixture(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
}

function edgeKeys(edges: FileEdge[]): string[] {
    return edges.map(e => `${e.type}|${e.fromFile}|${e.toFile}|${e.fromLine ?? ''}`).sort();
}

suite('FileRelationshipGraph #307 — disk persistence', () => {

    let files: string[];
    let mainPath: string;
    let savedLibsrc: string[] | undefined;

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frg307_'));
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [];

        mainPath = writeFixture('main.clw', [
            '  PROGRAM',
            "  INCLUDE('shared.inc'),ONCE",
            '  MAP',
            "  MODULE('worker.clw')",
            'DoWork PROCEDURE()',
            '  END',
            '  END',
            '  CODE',
        ].join('\n'));
        const workerPath = writeFixture('worker.clw', [
            "  MEMBER('main.clw')",
            "  INCLUDE('shared.inc'),ONCE",
            'DoWork PROCEDURE()',
            '  CODE',
        ].join('\n'));
        const sharedPath = writeFixture('shared.inc', [
            'SharedQ  QUEUE,TYPE',
            'Name       STRING(20)',
            '         END',
        ].join('\n'));
        files = [mainPath, workerPath, sharedPath];
    });

    suiteTeardown(() => {
        serverSettings.libsrcPaths = savedLibsrc ?? [];
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => {
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });

    test('warm rebuild replays from the cache with an identical edge set', async () => {
        const graph = FileRelationshipGraph.getInstance();

        await graph.buildInBackground(files);
        const coldStats = graph.lastBuildStats!;
        const coldEdges = edgeKeys(graph.getAllEdges());
        assert.ok(coldEdges.length > 0, 'fixture must produce edges');
        assert.strictEqual(coldStats.reusedFromDisk + coldStats.scanned, files.length);

        graph.reset();
        await graph.buildInBackground(files);
        const warmStats = graph.lastBuildStats!;

        assert.strictEqual(warmStats.scanned, 0,
            `warm rebuild must scan nothing (scanned=${warmStats.scanned}, reused=${warmStats.reusedFromDisk})`);
        assert.strictEqual(warmStats.reusedFromDisk, files.length, 'every file replayed from cache');
        assert.deepStrictEqual(edgeKeys(graph.getAllEdges()), coldEdges, 'replayed edge set must be identical');
    });

    test('mtime-bumped changed file is re-scanned; its new edges land in the graph', async () => {
        const graph = FileRelationshipGraph.getInstance();
        await graph.buildInBackground(files);   // cold
        graph.reset();
        await graph.buildInBackground(files);   // warm — cache now proven hot

        // Change main.clw: add an INCLUDE edge; bump mtime explicitly.
        graph.reset();
        fs.writeFileSync(mainPath, [
            '  PROGRAM',
            "  INCLUDE('shared.inc'),ONCE",
            "  INCLUDE('extra.inc'),ONCE",
            '  MAP',
            "  MODULE('worker.clw')",
            'DoWork PROCEDURE()',
            '  END',
            '  END',
            '  CODE',
        ].join('\n'));
        writeFixture('extra.inc', 'ExtraEq  EQUATE(1)\n');
        const future = new Date(Date.now() + 5_000);
        fs.utimesSync(mainPath, future, future);

        await graph.buildInBackground(files);
        const stats = graph.lastBuildStats!;

        assert.strictEqual(stats.scanned, 1, `only the changed file re-scans (scanned=${stats.scanned})`);
        assert.strictEqual(stats.reusedFromDisk, files.length - 1);
        const mainEdges = graph.getForwardEdges(mainPath);
        assert.ok(mainEdges.some(e => e.type === 'INCLUDE' && e.toFile.endsWith('extra.inc')),
            'the new INCLUDE edge must be present (no stale replay)');
    });

    test('changed resolution signature discards the cache wholesale', async () => {
        const graph = FileRelationshipGraph.getInstance();
        await graph.buildInBackground(files);   // cold, saves cache under current signature
        graph.reset();

        // Changing libsrcPaths changes how filenames resolve → signature mismatch.
        serverSettings.libsrcPaths = [tmpDir];
        try {
            await graph.buildInBackground(files);
            const stats = graph.lastBuildStats!;
            assert.strictEqual(stats.reusedFromDisk, 0,
                `signature change must force a full re-scan (reused=${stats.reusedFromDisk})`);
        } finally {
            serverSettings.libsrcPaths = [];
        }
    });
});
