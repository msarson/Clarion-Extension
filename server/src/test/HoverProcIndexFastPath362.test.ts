import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { TokenCache } from '../TokenCache';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';

/**
 * #362 step 3 — the hover procedure walk (findDeclarationInMapIncludes) now
 * consults the procedure index first: a UNIQUE index hit is resolved by loading
 * only the declaring file and confirming it with the SAME module-scoped check the
 * walk uses (parity by construction) — no include-chain tokenize.
 *
 * The test proves the fast-path by giving the host a MAP with NO include of the
 * declaring file: the walk alone CANNOT reach it, so a non-null result can only
 * come from the index fast-path — and it must be the correct declaration.
 */
suite('MapProcedureResolver - hover proc index fast-path (#362)', () => {

    let tmpDir: string;
    let hostPath: string;
    let savedLibsrc: string[] = [];
    const indexer = StructureDeclarationIndexer.getInstance();

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-procidx-362-'));
        // lib.inc: a MODULE block declaring IdxFastProc (a MAP-style prototype).
        fs.writeFileSync(path.join(tmpDir, 'lib.inc'), [
            "  MODULE('lib.clw')",
            'IdxFastProc     PROCEDURE(LONG id),STRING',
            '  END'
        ].join('\n'));
        // host.clw: a MAP with NO include — the walk cannot reach lib.inc.
        hostPath = path.join(tmpDir, 'host.clw');
        fs.writeFileSync(hostPath, ['  MEMBER()', '  MAP', '  END', '  CODE'].join('\n'));
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

    test('a unique index hit resolves the declaration without the include walk', async () => {
        await indexer.buildIndex(tmpDir);
        assert.strictEqual(indexer.findProcedure('IdxFastProc').length, 1, 'precondition: unique index hit');

        const cache = new CrossFileCache(TokenCache.getInstance());
        let loads = 0;
        const orig = cache.getOrLoadDocument.bind(cache);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cache as any).getOrLoadDocument = async (p: string) => { loads++; return orig(p); };
        const resolver = new MapProcedureResolver(cache);

        bumpCrossFileEpoch(); // clean the #361 result cache
        const content = fs.readFileSync(hostPath, 'utf8');
        const doc = TextDocument.create('file:///' + hostPath.replace(/\\/g, '/'), 'clarion', 1, content);
        const tokens = new ClarionTokenizer(content).tokenize();

        const hit = await resolver.findDeclarationInMapIncludes('IdxFastProc', doc, tokens);

        assert.ok(hit, 'the index fast-path resolves a proc the host does not even INCLUDE (walk alone could not)');
        assert.ok(hit!.doc.uri.toLowerCase().includes('lib.inc'), 'resolved to the declaring file');
        assert.strictEqual(hit!.declLine, 1, 'declaration line is the IdxFastProc prototype (0-based line 1)');
        assert.strictEqual(loads, 1, 'loaded ONLY the declaring file — no include-chain walk');
    });

    test('an ambiguous (multi-file) index hit falls back to the walk', async () => {
        // A second file declaring the SAME proc name → findProcedure returns 2 →
        // the fast-path must NOT fire (it only trusts a unique hit).
        fs.writeFileSync(path.join(tmpDir, 'lib2.inc'), [
            "  MODULE('lib2.clw')",
            'IdxFastProc     PROCEDURE(),LONG',
            '  END'
        ].join('\n'));
        await indexer.buildIndex(tmpDir);
        assert.strictEqual(indexer.findProcedure('IdxFastProc').length, 2, 'precondition: ambiguous');

        const resolver = new MapProcedureResolver(new CrossFileCache(TokenCache.getInstance()));
        bumpCrossFileEpoch();
        const content = fs.readFileSync(hostPath, 'utf8');
        const doc = TextDocument.create('file:///' + hostPath.replace(/\\/g, '/'), 'clarion', 1, content);
        const tokens = new ClarionTokenizer(content).tokenize();

        // Host has no include, so the walk finds nothing → null (fast-path correctly
        // declined the ambiguous hit rather than guessing).
        const hit = await resolver.findDeclarationInMapIncludes('IdxFastProc', doc, tokens);
        assert.strictEqual(hit, null, 'ambiguous hit must not be guessed; falls back to the (empty) walk');
    });
});
