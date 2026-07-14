import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { TokenCache } from '../TokenCache';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';

/**
 * #361 — findDeclarationInMapIncludes memoizes its walk result (positive AND
 * negative) keyed by host+proc, invalidated by the cross-file epoch. The walk is
 * ~89s on a big NetTalk PROGRAM file; hovering repeatedly around a block used to
 * re-pay it every time. A NEGATIVE result (the hovered word is not a reachable
 * MAP procedure — e.g. NetDebugTrace) is the common, most expensive case and is
 * exactly what must be remembered.
 */
suite('MapProcedureResolver - findDeclarationInMapIncludes result cache (#361)', () => {

    let tmpDir: string;
    let hostPath: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapdecl-cache-361-'));
        // procs.inc: a MODULE block declaring OtherProc (NOT the proc we search for).
        fs.writeFileSync(path.join(tmpDir, 'procs.inc'),
            `  MODULE('procs.clw')\nOtherProc     PROCEDURE()\n              END\n`);
        // host.clw: a PROGRAM whose MAP includes procs.inc.
        hostPath = path.join(tmpDir, 'host.clw');
        fs.writeFileSync(hostPath,
            `  PROGRAM\n\n  MAP\n    INCLUDE('procs.inc')\n  END\n\n  CODE\n`);
    });

    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function hostDoc(): { doc: TextDocument; tokens: ReturnType<ClarionTokenizer['tokenize']> } {
        const content = fs.readFileSync(hostPath, 'utf8');
        const uri = 'file:///' + hostPath.replace(/\\/g, '/');
        const doc = TextDocument.create(uri, 'clarion', 1, content);
        return { doc, tokens: new ClarionTokenizer(content).tokenize() };
    }

    test('a negative walk result is cached and reused until the epoch bumps', async () => {
        const cache = new CrossFileCache(TokenCache.getInstance());
        let loads = 0;
        const origLoad = cache.getOrLoadDocument.bind(cache);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cache as any).getOrLoadDocument = async (p: string) => { loads++; return origLoad(p); };

        const resolver = new MapProcedureResolver(cache);
        const { doc, tokens } = hostDoc();

        // Fresh epoch so the module-level cache starts clean for this host+proc.
        bumpCrossFileEpoch();

        const r1 = await resolver.findDeclarationInMapIncludes('NoSuchProc', doc, tokens);
        assert.strictEqual(r1, null, 'proc is not declared anywhere reachable');
        const afterFirst = loads;
        assert.ok(afterFirst > 0, 'the first walk actually loaded files');

        // Second identical call: served from the result cache — no new loads.
        const r2 = await resolver.findDeclarationInMapIncludes('NoSuchProc', doc, tokens);
        assert.strictEqual(r2, null);
        assert.strictEqual(loads, afterFirst,
            'second call must be served from the cache with zero additional file loads');

        // Epoch bump (the #340 watcher / #355 drift path) invalidates → re-walk.
        bumpCrossFileEpoch();
        const r3 = await resolver.findDeclarationInMapIncludes('NoSuchProc', doc, tokens);
        assert.strictEqual(r3, null);
        assert.ok(loads > afterFirst, 'an epoch bump must invalidate the cache and re-walk');
    });
});
