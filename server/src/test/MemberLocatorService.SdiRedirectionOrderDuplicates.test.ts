/**
 * findAllMembersInClass treated EVERY multi-candidate SDI result as ambiguous and fell
 * through to the include-chain walk (load + tokenize each reachable INC until the class
 * turns up). A project that keeps its own copy of a shared library header hits that for
 * every class it declares, because the SDI legitimately indexes both copies.
 *
 * The copies are not ambiguous: the compiler binds to whichever search path the
 * redirection file lists first, and the index already stores declarations in that order
 * (buildIndex scans extractSearchPaths(...) in .red order and pushes as it goes). So the
 * first entry is the compiler's pick and the walk only rediscovers it.
 *
 * Pins:
 *   1. Several copies of the SAME filename resolve from the redirection-first copy,
 *      without walking the include chain.
 *   2. A TYPE-attributed first copy still wins over a non-TYPE later one — a DLL-mode
 *      codebase marks every declaration TYPE, so that preference must not reorder
 *      precedence (this also pins that the later copy does not win).
 *   3. DIFFERENT filenames keep the include-chain walk — the generated-per-module shape
 *      the original guard protects, where chain proximity decides.
 *   4. A single candidate is unaffected.
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

function writeFixtureIn(dir: string, name: string, lines: string[]): string {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
}

function makeDoc(dir: string, name: string, lines: string[]): TextDocument {
    const p = writeFixtureIn(dir, name, lines);
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, lines.join('\n'));
}

function sdiEntry(
    name: string,
    filePath: string,
    isType = false
): StructureDeclarationInfo {
    return {
        name,
        filePath,
        line: 0,
        structureType: 'CLASS',
        isType,
        lineContent: `${name} CLASS`,
    } as StructureDeclarationInfo;
}

suite('MemberLocatorService — same-filename SDI copies resolve in redirection order', () => {

    const CHAIN_DEPTH = 6;
    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let projectDir: string;      // '.\' in the .red — listed FIRST
    let sharedDir: string;       // a shared library path — listed LATER
    let projectCopy: string;
    let sharedCopy: string;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlsredir_'));
        projectDir = path.join(tmpDir, 'project');
        sharedDir = path.join(tmpDir, 'shared');

        // Same filename, two search paths. The project copy is the one the compiler binds to.
        projectCopy = writeFixtureIn(projectDir, 'widget.inc', [
            'WidgetClass  CLASS,TYPE',
            'ProjectOnly    PROCEDURE()',
            'Shared         PROCEDURE(),BYTE',
            '             END',
        ]);
        sharedCopy = writeFixtureIn(sharedDir, 'widget.inc', [
            'WidgetClass  CLASS,TYPE',
            'SharedOnly     PROCEDURE()',
            'Shared         PROCEDURE(),BYTE',
            '             END',
        ]);

        // An include chain that reaches the SHARED copy, so a walk resolves to the wrong one.
        for (let i = 0; i < CHAIN_DEPTH; i++) {
            const next = i === CHAIN_DEPTH - 1
                ? path.join(sharedDir, 'widget.inc').replace(/\\/g, '/')
                : `chain${i + 1}.inc`;
            writeFixtureIn(projectDir, `chain${i}.inc`, [
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

    function callerDoc(name: string): TextDocument {
        return makeDoc(projectDir, name, [
            "  MEMBER('prog.clw')",
            "  INCLUDE('chain0.inc'),ONCE",
            'Caller PROCEDURE',
            '  CODE',
        ]);
    }

    test('same filename in two search paths: enumerated from the first, no chain walk', async () => {
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widgetclass'
                ? [sdiEntry('WidgetClass', projectCopy), sdiEntry('WidgetClass', sharedCopy)]
                : []
        ) as typeof origSdiFind;

        const doc = callerDoc('mainredir_a.clw');
        const svc = new MemberLocatorService();
        const loads = spyLoads(svc);
        const members = await svc.enumerateMembersInClass('WidgetClass', doc, 'WidgetClass');

        assert.ok(members.some(m => m.name === 'ProjectOnly'),
            'must enumerate the redirection-first copy (got: ' + members.map(m => m.name).join(',') + ')');
        assert.ok(loads.count() <= 2,
            `duplicates are not ambiguous — expected <=2 loads, got ${loads.count()} (chain walk ran)`);
    });

    test('a TYPE-attributed first copy still wins over a non-TYPE later copy', async () => {
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widgetclass'
                ? [sdiEntry('WidgetClass', projectCopy, true), sdiEntry('WidgetClass', sharedCopy, false)]
                : []
        ) as typeof origSdiFind;

        const doc = callerDoc('mainredir_c.clw');
        const svc = new MemberLocatorService();
        const members = await svc.enumerateMembersInClass('WidgetClass', doc, 'WidgetClass');

        assert.ok(members.some(m => m.name === 'ProjectOnly'),
            'a non-TYPE preference must not reorder redirection precedence (got: '
            + members.map(m => m.name).join(',') + ')');
        assert.ok(!members.some(m => m.name === 'SharedOnly'),
            'the TYPE attribute is not a tiebreak between copies of one file');
    });

    test('regression guard: DIFFERENT filenames still defer to the include-chain walk', async () => {
        // Distinct names are the generated-per-module shape: proximity decides, not order.
        // Both fixtures sit beside the chain so the walk can resolve plain-filename INCLUDEs,
        // matching the layout the pre-existing multi-candidate test already uses.
        const chainTarget = writeFixtureIn(projectDir, 'chaintarget.inc', [
            'OtherClass  CLASS,TYPE',
            'ChainMember   PROCEDURE()',
            '            END',
        ]);
        const decoy = writeFixtureIn(projectDir, 'decoy.inc', [
            'OtherClass  CLASS,TYPE',
            'DecoyMember   PROCEDURE()',
            '            END',
        ]);
        writeFixtureIn(projectDir, 'otherchain.inc', [
            "  INCLUDE('chaintarget.inc'),ONCE",
        ]);
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'otherclass'
                ? [sdiEntry('OtherClass', decoy), sdiEntry('OtherClass', chainTarget)]
                : []
        ) as typeof origSdiFind;

        const doc = makeDoc(projectDir, 'mainredir_d.clw', [
            "  MEMBER('prog.clw')",
            "  INCLUDE('otherchain.inc'),ONCE",
            'Caller PROCEDURE',
            '  CODE',
        ]);
        const svc = new MemberLocatorService();
        const members = await svc.enumerateMembersInClass('OtherClass', doc, 'OtherClass');

        assert.ok(members.some(m => m.name === 'ChainMember'),
            'distinct filenames must still let the include chain decide (got: '
            + members.map(m => m.name).join(',') + ')');
        assert.ok(!members.some(m => m.name === 'DecoyMember'),
            'must not blindly pick the first of several DIFFERENTLY-named candidates');
    });

    test('regression guard: a single SDI candidate is unaffected', async () => {
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widgetclass' ? [sdiEntry('WidgetClass', projectCopy)] : []
        ) as typeof origSdiFind;

        const doc = callerDoc('mainredir_e.clw');
        const svc = new MemberLocatorService();
        const members = await svc.enumerateMembersInClass('WidgetClass', doc, 'WidgetClass');

        assert.ok(members.some(m => m.name === 'ProjectOnly'), 'unambiguous tier must still resolve');
    });
});
