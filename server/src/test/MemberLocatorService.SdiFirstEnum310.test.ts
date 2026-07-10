/**
 * #310 — findAllMembersInClass locates out-of-document classes by walking the
 * INCLUDE chain (loading + tokenizing every INC until the class turns up)
 * BEFORE consulting the SDI, which already knows the declaring file. On Mark's
 * VM that made each cold ancestor enumeration ~1.2s (8.5s for the 7 receiver
 * hierarchies of one generated module).
 *
 * Pins:
 *   1. When the SDI unambiguously names the declaring file, members are
 *      enumerated from it directly — the include chain is NOT walked.
 *   2. When the SDI has MULTIPLE candidate files for the name, the scoped
 *      include-chain walk still decides (correctness guard: generated names
 *      like ThisWindow exist in every module).
 *   3. When the SDI has no entry, the include-chain fallback still resolves.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
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

function sdiEntry(name: string, filePath: string, line: number): StructureDeclarationInfo {
    return {
        name,
        filePath,
        line,
        structureType: 'CLASS',
        isType: false,
        lineContent: `${name} CLASS`,
    } as StructureDeclarationInfo;
}

suite('MemberLocatorService #310 — SDI-first class location for member enumeration', () => {

    const CHAIN_DEPTH = 6;
    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let basePath: string;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mls310_'));

        // Include chain: chain0.inc → chain1.inc → … → base at the END of the chain.
        basePath = writeFixture('wmbase.inc', [
            'WindowMgrX  CLASS,TYPE',
            'OpenIt        PROCEDURE(),BYTE',
            'CloseIt       PROCEDURE()',
            '            END',
        ]);
        for (let i = 0; i < CHAIN_DEPTH; i++) {
            const next = i === CHAIN_DEPTH - 1 ? 'wmbase.inc' : `chain${i + 1}.inc`;
            writeFixture(`chain${i}.inc`, [
                `  INCLUDE('${next}'),ONCE`,
                `SomeEquate${i}  EQUATE(${i})`,
            ]);
        }
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

    /** Instrument loadDocument — the unit of "file loaded by the walk". */
    function spyLoads(svc: MemberLocatorService): { count: () => number } {
        const target = svc as unknown as { loadDocument(p: string): Promise<unknown> };
        const orig = target.loadDocument.bind(svc);
        let n = 0;
        target.loadDocument = (p: string) => { n++; return orig(p); };
        return { count: () => n };
    }

    test('unambiguous SDI hit: members come straight from the declaring file, no chain walk', async () => {
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'windowmgrx' ? [sdiEntry('WindowMgrX', basePath, 0)] : []
        ) as typeof origSdiFind;

        const doc = makeDoc('main310a.clw', [
            "  MEMBER('prog.clw')",
            "  INCLUDE('chain0.inc'),ONCE",
            'Caller PROCEDURE',
            '  CODE',
        ]);
        const svc = new MemberLocatorService();
        const loads = spyLoads(svc);
        const members = await svc.enumerateMembersInClass('WindowMgrX', doc, 'WindowMgrX');

        assert.ok(members.some(m => m.name === 'OpenIt'), 'members must resolve');
        assert.ok(loads.count() <= 2,
            `SDI names the file — expected <=2 loads (declaring file [+ parent probe]), got ${loads.count()} (chain walk ran)`);
    });

    test('ambiguous SDI (multiple files): scoped include-chain walk still decides', async () => {
        // A second, WRONG copy of the class that the SDI lists FIRST.
        const wrongPath = writeFixture('wrongcopy.inc', [
            'WindowMgrX  CLASS,TYPE',
            'WrongMember   PROCEDURE()',
            '            END',
        ]);
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'windowmgrx'
                ? [sdiEntry('WindowMgrX', wrongPath, 0), sdiEntry('WindowMgrX', basePath, 0)]
                : []
        ) as typeof origSdiFind;

        const doc = makeDoc('main310b.clw', [
            "  MEMBER('prog.clw')",
            "  INCLUDE('chain0.inc'),ONCE",
            'Caller PROCEDURE',
            '  CODE',
        ]);
        const svc = new MemberLocatorService();
        const members = await svc.enumerateMembersInClass('WindowMgrX', doc, 'WindowMgrX');

        assert.ok(members.some(m => m.name === 'OpenIt'),
            'ambiguous SDI must defer to the include-chain copy (got: ' + members.map(m => m.name).join(',') + ')');
        assert.ok(!members.some(m => m.name === 'WrongMember'),
            'the SDI-first tier must not blindly pick the first of several candidates');
    });

    // ── #310 part 2: resolveTypeAlias's LIKE-dereference walk ────────────────
    // resolveVariableType found `udpt UltimateDebugX` locally in ms, then spent
    // 4.2s COLD walking the generated MEMBER parent + its whole include chain
    // just to conclude the TYPE NAME is not a LIKE alias. If the SDI knows the
    // name as a concrete structure (and no local declaration shadows it), the
    // walk is pointless.
    test('type-alias check: SDI-known class type skips the cross-file dereference walk', async () => {
        // Parent with a deep include chain the OLD alias check would walk.
        writeFixture('parent310.clw', [
            '  PROGRAM',
            "  INCLUDE('chain0.inc'),ONCE",
            '  MAP',
            '  END',
        ]);
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'windowmgrx' ? [sdiEntry('WindowMgrX', basePath, 0)] : []
        ) as typeof origSdiFind;

        const doc = makeDoc('main310d.clw', [
            "  MEMBER('parent310.clw')",
            'Caller PROCEDURE',
            'wm  WindowMgrX',
            '  CODE',
            '  wm.OpenIt()',
        ]);
        const svc = new MemberLocatorService();
        const loads = spyLoads(svc);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const result = await svc.resolveVariableType('wm', tokens, doc);

        assert.ok(result, 'type must resolve');
        assert.strictEqual(result!.typeName, 'WindowMgrX');
        assert.strictEqual(result!.isClass, true);
        assert.strictEqual(loads.count(), 0,
            `SDI knows WindowMgrX is a structure — the alias check must not walk the MEMBER parent chain (loaded ${loads.count()} files)`);
    });

    test('type-alias check: cross-file LIKE alias still dereferences when SDI misses', async () => {
        writeFixture('parentalias310.clw', [
            '  PROGRAM',
            '  MAP',
            '  END',
            'BaseQ  QUEUE,TYPE',
            'Name     STRING(20)',
            '       END',
            'AliasQ LIKE(BaseQ)',
        ]);
        StructureDeclarationIndexer.prototype.find = (() => []) as typeof origSdiFind;

        const doc = makeDoc('main310e.clw', [
            "  MEMBER('parentalias310.clw')",
            'Caller PROCEDURE',
            'rq  &AliasQ',
            '  CODE',
        ]);
        const svc = new MemberLocatorService();
        const tokens = TokenCache.getInstance().getTokens(doc);
        const result = await svc.resolveVariableType('rq', tokens, doc);

        assert.ok(result, 'reference type must resolve');
        assert.strictEqual(result!.typeName, 'BaseQ', 'cross-file LIKE alias must still dereference to the base type');
    });

    test('SDI miss: include-chain fallback still resolves', async () => {
        StructureDeclarationIndexer.prototype.find = (() => []) as typeof origSdiFind;

        const doc = makeDoc('main310c.clw', [
            "  MEMBER('prog.clw')",
            "  INCLUDE('chain0.inc'),ONCE",
            'Caller PROCEDURE',
            '  CODE',
        ]);
        const svc = new MemberLocatorService();
        const members = await svc.enumerateMembersInClass('WindowMgrX', doc, 'WindowMgrX');

        assert.ok(members.some(m => m.name === 'OpenIt'), 'chain fallback must still find the class');
    });
});
