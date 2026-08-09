import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import {
    validateViewProjectFields,
    getViewProjectFieldsComputeCount
} from '../providers/diagnostics/StructureDiagnostics';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { setServerInitialized } from '../serverState';

/**
 * Issue #345 phase 4 — cross-pass validator caches.
 *
 * Mark's IBSWorking startup ran the SAME document through 4 validation passes
 * (open / change / sdiReady / crossFileUpdate); viewProjectFields re-resolved
 * and re-tokenized the MEMBER parent on each (4.3s × 4), RVD re-resolved
 * receiver types (GlobalErrors 2.5s × pass), and a restart re-read the include
 * universe for the reachable-set BFS (7.2s).
 */
suite('#345 phase 4 — cross-pass validator caches', () => {

    setup(() => setServerInitialized(true));

    const VIEW_CODE = [
        "Customer FILE,DRIVER('TopSpeed'),PRE(Cus)",
        'Record RECORD',
        'Id   LONG',
        '     END',
        '     END',
        '',
        'MyView VIEW(Customer)',
        '       PROJECT(Cus:Id)',
        '       END',
    ].join('\n');

    test('viewProjectFields memo — same doc content computes ONCE across passes', () => {
        const doc = TextDocument.create('test://phase4-a.clw', 'clarion', 1, VIEW_CODE);
        const tokens = new ClarionTokenizer(VIEW_CODE).tokenize();

        const before = getViewProjectFieldsComputeCount();
        const d1 = validateViewProjectFields(tokens, doc);
        const d2 = validateViewProjectFields(tokens, doc);
        const d3 = validateViewProjectFields(tokens, doc);
        assert.strictEqual(getViewProjectFieldsComputeCount() - before, 1,
            'three passes over the same (uri, version, content) must compute once');
        assert.deepStrictEqual(d2, d1);
        assert.deepStrictEqual(d3, d1);
    });

    test('viewProjectFields memo — same uri+version with DIFFERENT content recomputes (#340 identity)', () => {
        const codeA = VIEW_CODE;
        const codeB = VIEW_CODE.replace('PROJECT(Cus:Id)', 'PROJECT(Cus:Bogus)');
        const docA = TextDocument.create('test://phase4-b.clw', 'clarion', 1, codeA);
        const docB = TextDocument.create('test://phase4-b.clw', 'clarion', 1, codeB);

        const dA = validateViewProjectFields(new ClarionTokenizer(codeA).tokenize(), docA);
        const dB = validateViewProjectFields(new ClarionTokenizer(codeB).tokenize(), docB);
        assert.strictEqual(dA.length, 0);
        assert.strictEqual(dB.length, 1,
            'different content behind the same uri+version must NOT be served the cached result');
    });

    test('viewProjectFields memo — cross-file epoch bump invalidates', () => {
        const doc = TextDocument.create('test://phase4-c.clw', 'clarion', 1, VIEW_CODE);
        const tokens = new ClarionTokenizer(VIEW_CODE).tokenize();

        validateViewProjectFields(tokens, doc);
        const before = getViewProjectFieldsComputeCount();
        bumpCrossFileEpoch();  // the #340 watcher path — a workspace file changed
        validateViewProjectFields(tokens, doc);
        assert.strictEqual(getViewProjectFieldsComputeCount() - before, 1,
            'an epoch bump means cross-file inputs may have changed — the memo must recompute');
    });

    test('IncludeVerifier disk lists — a fresh instance answers mtime-matched files without re-reading', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '345p4-iv-'));
        try {
            const midPath = path.join(tmpRoot, 'mid.inc');
            fs.writeFileSync(midPath, "  INCLUDE('target.inc'),ONCE\r\n");
            fs.writeFileSync(path.join(tmpRoot, 'target.inc'), 'TVar LONG\r\n');

            const hostCode = [
                '   PROGRAM',
                "   INCLUDE('mid.inc'),ONCE",
                '   CODE',
            ].join('\n');
            const hostPath = path.join(tmpRoot, 'host.clw');
            fs.writeFileSync(hostPath, hostCode);
            const hostDoc = TextDocument.create(
                'file:///' + hostPath.replace(/\\/g, '/'), 'clarion', 1, hostCode);

            // First instance: full parse, then flush the disk lists.
            (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
            const v1 = IncludeVerifier.getInstance();
            assert.strictEqual(await v1.isClassIncluded('target.inc', hostDoc), true,
                'transitive include must be found (mid.inc → target.inc)');
            await v1.flushDiskIncludeListsForTest();

            // Fresh instance (simulated restart): the mtime-matched entry must
            // answer without a re-read of mid.inc.
            (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
            const v2 = IncludeVerifier.getInstance();
            const parsesBefore = IncludeVerifier.getFileParseCount();
            assert.strictEqual(await v2.isClassIncluded('target.inc', hostDoc), true,
                'transitive include must still be found after the simulated restart');
            const midReparsed = IncludeVerifier.getFileParseCount() - parsesBefore;
            assert.strictEqual(midReparsed, 0,
                `mtime-matched include lists must come from the disk cache, not re-reads; got ${midReparsed} re-parse(s)`);
        } finally {
            (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
            try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
        }
    });
});
