/**
 * #525 — find-all-references on a prefixed label (GLO:Name, GVF:Owner).
 *
 * Reported on the live ap1.clw: `GVF:Owner STRING(256),EXTERNAL,DLL(_ABCDllMode_)`,
 * used in 50 modules, "no references". EXTERNAL is not the factor, the colon is. The
 * references provider prunes its search set with `ReferenceCountIndex.mayContain`
 * (since #315), and that index scanned identifiers with a pattern that stops at a
 * colon: `GLO:Plain` was recorded as `glo` and `plain`, never `glo:plain`, so every
 * file answered "not present", every file was skipped, and the result was null.
 * Every generated app declares its globals this way, so this covered most global data.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('FAR on prefixed labels (#525)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();
    const files: { [rel: string]: string } = {
        'ap1.clw': [
            '  PROGRAM',                                                   // 0
            '  MAP',                                                       // 1
            "    MODULE('member1.clw')",                                   // 2
            '      DoThing PROCEDURE()',                                   // 3
            '    END',                                                     // 4
            '  END',                                                       // 5
            'GVF:Owner            STRING(256),EXTERNAL,DLL(_ABCDllMode_)', // 6 — the reported shape
            'GLO:Plain            STRING(20)',                              // 7 — the generated-app convention
            '  CODE',                                                      // 8
            "  GVF:Owner = 'x'",                                           // 9
            "  GLO:Plain = 'y'",                                           // 10
        ].join('\r\n'),
        'member1.clw': [
            "  MEMBER('ap1.clw')",                                         // 0
            '  MAP',                                                       // 1
            '  END',                                                       // 2
            'DoThing PROCEDURE()',                                         // 3
            '  CODE',                                                      // 4
            "  IF GVF:Owner = '' THEN RETURN.",                            // 5
            '  GLO:Plain = GVF:Owner',                                     // 6
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far525-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        const project = new ClarionProjectServer('ap1', 'app', dir, '{PFX-525}');
        for (const rel of Object.keys(files)) project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        const seedPaths = Object.keys(files).map(rel => path.join(dir, rel));
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seedPaths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seedPaths);
        serverSettings.libsrcPaths = [dir];
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().buildIndex(dir);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        StructureDeclarationIndexer.getInstance().clearCache();
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const keyed = (refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): string[] =>
        (refs ?? []).map(r => `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`).sort();

    test('the index records a prefixed label as one name, and still records its segments', () => {
        const counts = ReferenceCountIndex.scanContent("GLO:Plain  STRING(20)\r\n  GLO:Plain = 'y'\r\n  CUS:Street = Other:Thing\r\n");
        assert.strictEqual(counts.get('glo:plain'), 2, 'whole prefixed name');
        assert.strictEqual(counts.get('plain'), 2, 'bare segment kept for field lookups that apply the prefix separately');
        assert.strictEqual(counts.get('cus:street'), 1);
        assert.strictEqual(counts.get('street'), 1, 'segment kept (NAME itself would be skipped as a structural word, by design)');
    });

    test('a routine label with a double colon is not glued into one name', () => {
        const counts = ReferenceCountIndex.scanContent('  DO Menu::MENUBAR1\r\nMenu::MENUBAR1 ROUTINE\r\n');
        assert.strictEqual(counts.get('menu::menubar1'), undefined);
        assert.strictEqual(counts.get('menu'), 2);
        assert.strictEqual(counts.get('menubar1'), 2);
    });

    test('mayContain answers true for files that mention the prefixed name', () => {
        const idx = ReferenceCountIndex.getInstance();
        assert.strictEqual(idx.mayContain(path.join(dir, 'ap1.clw'), 'GLO:Plain'), true);
        assert.strictEqual(idx.mayContain(path.join(dir, 'member1.clw'), 'GVF:Owner'), true);
    });

    test('FAR on a plain prefixed global from its declaration finds the program and the member', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('ap1.clw')!, { line: 7, character: 4 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('ap1.clw:10'), `use in the PROGRAM CODE; got [${got.join(', ')}]`);
        assert.ok(got.includes('member1.clw:6'), `use in the member; got [${got.join(', ')}]`);
    });

    test('FAR on an EXTERNAL,DLL() prefixed global from its declaration finds the program and the member', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('ap1.clw')!, { line: 6, character: 4 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('ap1.clw:9'), `use in the PROGRAM CODE; got [${got.join(', ')}]`);
        assert.ok(got.includes('member1.clw:5') && got.includes('member1.clw:6'), `uses in the member; got [${got.join(', ')}]`);
    });

    test('FAR from a use inside the member finds the declaration and the other uses', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('member1.clw')!, { line: 5, character: 8 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('ap1.clw:6'), `declaration; got [${got.join(', ')}]`);
        assert.ok(got.includes('ap1.clw:9'), `use in the PROGRAM CODE; got [${got.join(', ')}]`);
    });
});
