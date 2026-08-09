/**
 * #358-cold — the RVD memos persist across a server restart.
 *
 * The warm fix (per-entry contributing-file mtimes) made re-validation cheap
 * WITHIN a session, but a fresh server still paid the full cold enumeration —
 * `thisStartup` alone was ~3.2-6.3s on the real PROGRAM file. The resolved
 * entries are pure JSON and already carry declaring-file provenance, so they are
 * now persisted per open doc through the #295 IncludeIndexDiskCache envelope
 * (bucket 'rvdmemo', signature = the doc's content hash, contributing = the
 * union of every entry's declaring-file mtimes) and seeded on the first pass of
 * the next session.
 *
 * Pins:
 *   1. Restart survival — after a simulated restart (module memos cleared), the
 *      first pass seeds from disk and does NOT re-enumerate (RED pre-fix: it did).
 *   2. Correctness — diagnostics identical across the restart.
 *   3. Invalidation — the declaring file's mtime changed while "down" → the
 *      envelope is stale → the pass re-enumerates (guards against staleness).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { validateDiscardedReturnValues, __resetRvdMemosForTest } from '../providers/diagnostics/ReturnValueDiagnostics';
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

function sdiEntry(name: string, filePath: string): StructureDeclarationInfo {
    return {
        name,
        filePath,
        line: 0,
        structureType: 'CLASS',
        isType: false,
        lineContent: `${name} CLASS`,
    } as StructureDeclarationInfo;
}

/** Counts real enumerations — getClassMembers only calls this on a memo MISS. */
function instrument(locator: MemberLocatorService) {
    const counts = { enumerateMembersInClass: 0 };
    const orig = locator.enumerateMembersInClass.bind(locator);
    locator.enumerateMembersInClass = ((...args: Parameters<MemberLocatorService['enumerateMembersInClass']>) => {
        counts.enumerateMembersInClass++;
        return orig(...args);
    }) as MemberLocatorService['enumerateMembersInClass'];
    return counts;
}

const discarded = (diags: { message: string }[]) => diags.filter(d => /is discarded/.test(d.message));

suite('ReturnValueDiagnostics #358-cold — memos persist across a restart', () => {

    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvd358disk_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    setup(() => {
        origSdiFind = StructureDeclarationIndexer.prototype.find;
        origSdiBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origSdiBuild;
        __resetRvdMemosForTest();
    });
    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origSdiBuild;
        TokenCache.getInstance().clearAllTokens();
        __resetRvdMemosForTest();
    });

    function fixture(tag: string) {
        const incPath = writeFixture(`rvdinc${tag}.inc`, [
            `MyClass${tag}  CLASS,TYPE`,
            'DoA            PROCEDURE(),LONG',
            '             END',
        ]);
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === `myclass${tag}`.toLowerCase() ? [sdiEntry(`MyClass${tag}`, incPath)] : []
        ) as typeof origSdiFind;
        const doc = makeDoc(`host${tag}.clw`, [
            "  MEMBER('prog.clw')",
            `  INCLUDE('rvdinc${tag}.inc'),ONCE`,
            '  MAP',
            '  END',
            `obj  MyClass${tag}`,
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.DoA()',
        ]);
        return { incPath, doc, tokens: TokenCache.getInstance().getTokens(doc) };
    }

    test('restart with unchanged files: first pass seeds from disk, no re-enumeration', async () => {
        const { doc, tokens } = fixture('DiskA');
        const locator = new MemberLocatorService();
        const counts = instrument(locator);

        // Session 1 — cold pass enumerates and (post-fix) persists on completion.
        const diags1 = await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(discarded(diags1).length, 1, 'obj.DoA (LONG, no PROC) must warn on the first pass');
        assert.strictEqual(counts.enumerateMembersInClass, 1, 'class enumerated once in session 1');

        // Simulated restart: module-level memos gone, disk cache remains.
        __resetRvdMemosForTest();

        // Session 2 — first pass must seed from the persisted envelope.
        const diags2 = await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(discarded(diags2).length, 1, 'warning must be identical after the restart');
        assert.strictEqual(counts.enumerateMembersInClass, 1,
            `unchanged declaring files across the restart → the disk seed must prevent re-enumeration ` +
            `(got ${counts.enumerateMembersInClass})`);
    });

    test('declaring file changed while down: envelope stale, pass re-enumerates', async () => {
        const { incPath, doc, tokens } = fixture('DiskB');
        const locator = new MemberLocatorService();
        const counts = instrument(locator);

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.enumerateMembersInClass, 1, 'class enumerated once in session 1');

        // "While the server was down", the declaring file changed.
        const cur = fs.statSync(incPath);
        const advanced = new Date(cur.mtimeMs + 5000);
        fs.utimesSync(incPath, advanced, advanced);
        __resetRvdMemosForTest();

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.enumerateMembersInClass, 2,
            `declaring file changed while down → the stale envelope must NOT seed; re-enumerate ` +
            `(got ${counts.enumerateMembersInClass})`);
    });
});
