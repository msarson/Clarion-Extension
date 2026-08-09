/**
 * #358 (type-memo half) — RVD receiver-TYPE resolution memo survives unrelated epoch bumps.
 *
 * `validateDiscardedReturnValues` resolves each receiver variable's type once and memoizes
 * it. On Mark's solution the dominant RVD cost is one such resolution — `GlobalErrors`
 * (~1.3–1.7s, a cross-file walk to its global-data declaration). Pre-fix that memo was wiped
 * wholesale on every cross-file epoch bump, so a warm re-validation paid the full walk again.
 *
 * The fix threads a `provenance` Set through `resolveVariableType`: it collects the file(s)
 * whose content determined the type (the variable's declaring file, plus any LIKE-alias file).
 * On an epoch bump each memo entry is validated against those files' mtimes instead of cleared:
 * a stable receiver type survives; a changed declaring file is dropped and re-resolved.
 * A type resolved entirely from the open doc stays pinned by the rvdDocKey content-hash.
 *
 * Pins:
 *   1. Survival — an epoch bump with the declaring file UNCHANGED does NOT re-resolve the type
 *      (RED pre-fix: the wholesale clear forced a second resolveVariableType).
 *   2. Invalidation — an epoch bump AFTER the declaring file's mtime changes DOES re-resolve.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { validateDiscardedReturnValues } from '../providers/diagnostics/ReturnValueDiagnostics';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function writeFixture(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
}

function makeDoc(name: string, lines: string[]): TextDocument {
    const p = writeFixture(name, lines);
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, lines.join('\n'));
}

/** Counts real receiver-type resolutions — the memo only calls this on a miss. */
function instrument(locator: MemberLocatorService) {
    const counts = { resolveVariableType: 0 };
    const orig = locator.resolveVariableType.bind(locator);
    locator.resolveVariableType = ((...args: Parameters<MemberLocatorService['resolveVariableType']>) => {
        counts.resolveVariableType++;
        return orig(...args);
    }) as MemberLocatorService['resolveVariableType'];
    return counts;
}

suite('ReturnValueDiagnostics #358 — receiver-type memo survives unrelated epoch bumps', () => {

    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdtype358_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    setup(() => {
        origSdiFind = StructureDeclarationIndexer.prototype.find;
        origSdiBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        // Hermetic: no real index. The include-chain tier resolves the fixtures.
        StructureDeclarationIndexer.prototype.find = (() => []) as typeof origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origSdiBuild;
    });
    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origSdiBuild;
        TokenCache.getInstance().clearAllTokens();
    });

    // Global receiver whose TYPE lives in an INCLUDE'd file → its declaring file is a real,
    // touchable disk file (unlike the open doc, which is pinned by content-hash).
    const incLines = (cls: string, gvar: string) => [
        `${cls}  CLASS,TYPE`,
        'DoA       PROCEDURE(),LONG',
        '        END',
        `${gvar}  ${cls}`,
    ];
    const hostLines = (inc: string, gvar: string) => [
        "  MEMBER('prog.clw')",
        `  INCLUDE('${inc}'),ONCE`,
        '  MAP',
        '  END',
        'Caller PROCEDURE()',
        '  CODE',
        `  ${gvar}.DoA()`,
    ];

    test('unchanged declaring file: epoch bump does NOT re-resolve the receiver type', async () => {
        const incPath = writeFixture('globals358a.inc', incLines('MyCls358A', 'GObj358A'));
        const doc = makeDoc('hosttype358a.clw', hostLines('globals358a.inc', 'GObj358A'));
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const counts = instrument(locator);

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.resolveVariableType, 1, 'receiver type resolved once on the first pass');
        assert.ok(incPath.length > 0);

        bumpCrossFileEpoch(); // an UNRELATED workspace file changed — globals358a.inc did NOT

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.resolveVariableType, 1,
            `declaring file unchanged across the epoch bump → type memo must survive, not re-resolve ` +
            `(got ${counts.resolveVariableType})`);
    });

    test('changed declaring file: epoch bump DOES re-resolve the receiver type', async () => {
        const incPath = writeFixture('globals358b.inc', incLines('MyCls358B', 'GObj358B'));
        const doc = makeDoc('hosttype358b.clw', hostLines('globals358b.inc', 'GObj358B'));
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const counts = instrument(locator);

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.resolveVariableType, 1, 'receiver type resolved once on the first pass');

        const cur = fs.statSync(incPath);
        const advanced = new Date(cur.mtimeMs + 5000);
        fs.utimesSync(incPath, advanced, advanced);
        bumpCrossFileEpoch();

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.resolveVariableType, 2,
            `declaring file changed → stale type memo entry must be dropped and re-resolved ` +
            `(got ${counts.resolveVariableType})`);
    });
});
