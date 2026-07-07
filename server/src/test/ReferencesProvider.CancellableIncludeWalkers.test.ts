import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CancellationToken } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * #256 — the three recursive INCLUDE-chain walkers in ReferencesProvider did
 * synchronous per-file work with no CancellationToken check: a deep/wide .inc
 * chain made a single FAR request stall the LSP event loop un-cancellably
 * (multiplied by the #189 per-procedure CodeLens precompute).
 *
 * These pin: (a) a cancelled token early-outs each walker, (b) the walkers
 * still find their targets with a live token, and (c) the source read prefers
 * the live editor buffer over the stale on-disk copy (unsaved INCLUDE edits
 * are honored).
 */

const CANCELLED: CancellationToken = {
    isCancellationRequested: true,
    onCancellationRequested: () => ({ dispose: () => { /* no-op */ } })
};

suite('ReferencesProvider — cancellable INCLUDE-chain walkers (#256)', () => {
    let tmpDir: string;
    let mainPath: string;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't256-'));
        // main.clw → INCLUDE('decls.inc') → decls.inc declares a label, a class,
        // and a MAP procedure; also chains onward to more.inc.
        mainPath = path.join(tmpDir, 'main.clw');
        fs.writeFileSync(mainPath, [
            '  PROGRAM',
            "  INCLUDE('decls.inc'),ONCE",
            '  CODE',
            '  RETURN',
        ].join('\n'), 'utf-8');
        fs.writeFileSync(path.join(tmpDir, 'decls.inc'), [
            "  INCLUDE('more.inc'),ONCE",
            'MyLabel    LONG',
            'MyClass    CLASS,TYPE',
            'DoIt         PROCEDURE()',
            '           END',
            '  MAP',
            'MapProc      PROCEDURE(LONG),LONG',
            '  END',
        ].join('\n'), 'utf-8');
        fs.writeFileSync(path.join(tmpDir, 'more.inc'), [
            'DeepLabel  LONG',
        ].join('\n'), 'utf-8');
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('findLabelInIncludes: finds through the chain, but a cancelled token early-outs', async () => {
        const provider = new ReferencesProvider() as any;
        const hit = await provider.findLabelInIncludes('deeplabel', mainPath);
        assert.ok(hit, 'sanity: the nested include declares DeepLabel — the walker must find it');
        assert.ok(hit.uri.toLowerCase().endsWith('more.inc'));

        const cancelled = await provider.findLabelInIncludes('deeplabel', mainPath, new Set(), CANCELLED);
        assert.strictEqual(cancelled, null,
            'a cancelled token must early-out the walk instead of reading the whole chain');
    });

    test('findClassDeclarationInIncludes: finds the class, cancelled token early-outs', async () => {
        const provider = new ReferencesProvider() as any;
        const hit = await provider.findClassDeclarationInIncludes('MyClass', mainPath);
        assert.ok(hit, 'sanity: decls.inc declares MyClass');
        const cancelled = await provider.findClassDeclarationInIncludes('MyClass', mainPath, new Set(), CANCELLED);
        assert.strictEqual(cancelled, null);
    });

    test('findProcedureInMapIncludes: finds the MAP proc, cancelled token early-outs', async () => {
        const provider = new ReferencesProvider() as any;
        // Use a broad subtype set — the standalone-tokenized .inc assigns MAP-block subtypes.
        const { TokenType } = require('../ClarionTokenizer');
        const subTypes = new Set([
            TokenType.GlobalProcedure, TokenType.MapProcedure,
            TokenType.MethodDeclaration, TokenType.MethodImplementation
        ]);
        const hit = await provider.findProcedureInMapIncludes('mapproc', mainPath, subTypes);
        assert.ok(hit, 'sanity: decls.inc declares MapProc inside a MAP');
        const cancelled = await provider.findProcedureInMapIncludes('mapproc', mainPath, subTypes, new Set(), CANCELLED);
        assert.strictEqual(cancelled, null);
    });

    test('walkers read the LIVE buffer for open files (unsaved INCLUDE edits honored)', async () => {
        // On disk, main.clw has the include; the OPEN buffer removed it. The walk
        // must honor the buffer and find nothing.
        const uri = 'file:///' + mainPath.replace(/\\/g, '/');
        const liveDoc = TextDocument.create(uri, 'clarion', 1, [
            '  PROGRAM',
            '  CODE',
            '  RETURN',
        ].join('\n'));
        TokenCache.getInstance().getTokens(liveDoc);

        const provider = new ReferencesProvider() as any;
        const hit = await provider.findLabelInIncludes('deeplabel', mainPath);
        assert.strictEqual(hit, null,
            'the open buffer has no INCLUDE line — walking the stale on-disk copy means unsaved edits are ignored');
    });
});
