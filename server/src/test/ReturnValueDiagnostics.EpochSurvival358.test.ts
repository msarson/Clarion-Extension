/**
 * #358 — RVD class-member enumeration memo survives unrelated cross-file epoch bumps.
 *
 * `validateDiscardedReturnValues` enumerates each receiver class once (StringTheory
 * 1394 members, ErrorClass 184) and memoizes it. Pre-fix, ANY workspace file change
 * bumped the #340 cross-file epoch and WHOLESALE-cleared that memo, so every warm
 * re-validation / tab-switch re-walked unchanged library classes (~2.3s the whole
 * point of this issue — "warm is cold-in-disguise").
 *
 * The fix validates each entry against the mtimes of the file(s) that actually
 * declared its members: a class whose declaring file is unchanged survives the bump;
 * a class whose file changed is dropped and re-enumerated. Classes declared in the
 * open doc stay pinned by the rvdDocKey content-hash (dirty-doc guard), not by mtime.
 *
 * Pins:
 *   1. Survival — an epoch bump with the declaring file UNCHANGED does NOT re-enumerate
 *      (the RED assertion: pre-fix the wholesale clear forced a second enumeration).
 *   2. Correctness — the same warnings are produced across the bump.
 *   3. Invalidation — an epoch bump AFTER the declaring file's mtime changes DOES
 *      re-enumerate (guards the fix from being too sticky).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
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

suite('ReturnValueDiagnostics #358 — class-members memo survives unrelated epoch bumps', () => {

    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvd358_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    setup(() => {
        origSdiFind = StructureDeclarationIndexer.prototype.find;
        origSdiBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origSdiBuild;
    });
    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origSdiBuild;
        TokenCache.getInstance().clearAllTokens();
    });

    test('unchanged declaring file: epoch bump does NOT re-enumerate the class', async () => {
        const incPath = writeFixture('rvdinc358a.inc', [
            'MyClass358A  CLASS,TYPE',
            'DoA            PROCEDURE(),LONG',
            '             END',
        ]);
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'myclass358a' ? [sdiEntry('MyClass358A', incPath)] : []
        ) as typeof origSdiFind;

        const doc = makeDoc('host358a.clw', [
            "  MEMBER('prog.clw')",
            "  INCLUDE('rvdinc358a.inc'),ONCE",
            '  MAP',
            '  END',
            'obj  MyClass358A',
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.DoA()',
        ]);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const counts = instrument(locator);

        const diags1 = await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(discarded(diags1).length, 1, 'obj.DoA (LONG, no PROC) must warn on the first pass');
        assert.strictEqual(counts.enumerateMembersInClass, 1, 'class enumerated once on the first pass');

        bumpCrossFileEpoch(); // an UNRELATED workspace file changed — rvdinc358a.inc did NOT

        const diags2 = await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(discarded(diags2).length, 1, 'warning must be identical across the bump');
        assert.strictEqual(counts.enumerateMembersInClass, 1,
            `declaring file unchanged across the epoch bump → memo must survive, not re-enumerate ` +
            `(got ${counts.enumerateMembersInClass})`);
    });

    test('changed declaring file: epoch bump DOES re-enumerate the class', async () => {
        const incPath = writeFixture('rvdinc358b.inc', [
            'MyClass358B  CLASS,TYPE',
            'DoA            PROCEDURE(),LONG',
            '             END',
        ]);
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'myclass358b' ? [sdiEntry('MyClass358B', incPath)] : []
        ) as typeof origSdiFind;

        const doc = makeDoc('host358b.clw', [
            "  MEMBER('prog.clw')",
            "  INCLUDE('rvdinc358b.inc'),ONCE",
            '  MAP',
            '  END',
            'obj  MyClass358B',
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.DoA()',
        ]);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const counts = instrument(locator);

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.enumerateMembersInClass, 1, 'class enumerated once on the first pass');

        // Advance the declaring file's mtime, then bump the epoch (a real change to it).
        const cur = fs.statSync(incPath);
        const advanced = new Date(cur.mtimeMs + 5000);
        fs.utimesSync(incPath, advanced, advanced);
        bumpCrossFileEpoch();

        await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(counts.enumerateMembersInClass, 2,
            `declaring file changed → stale memo entry must be dropped and re-enumerated ` +
            `(got ${counts.enumerateMembersInClass})`);
    });
});
