/**
 * #528 — rename keys its generated-file refusal on the DECLARATION's file, not the
 * cursor's. A hand-coded class used by a generated app: renaming one of its methods
 * from a call site in a generated module must proceed (rewriting the class .inc and
 * .clw and every other hand-coded file, skipping and listing the generated ones), and
 * renaming a method whose declaration is itself generated stays refused.
 *
 * Fixture (one project, ap1):
 *   ap1.clw      hand-coded PROGRAM: INCLUDE ctThing.inc, `Obj ctThing`, calls Obj.Method()
 *   ctThing.inc  hand-coded: ctThing CLASS ... Method PROCEDURE()
 *   ctThing.clw  hand-coded: ctThing.Method PROCEDURE() implementation
 *   browse.clw   GENERATED module: calls Obj.Method()
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
import { ExpExportIndex } from '../services/ExpExportIndex';
import { RenameProvider } from '../providers/RenameProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('Rename keys the generated refusal on the declaration (#528)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();
    let project: ClarionProjectServer;

    const files: { [rel: string]: string } = {
        'ap1.clw': [
            '  PROGRAM',                                  // 0
            "  INCLUDE('ctThing.inc'),ONCE",              // 1
            '  MAP',                                      // 2
            "    MODULE('browse.clw')",                   // 3
            '      Browse PROCEDURE()',                   // 4
            '    END',                                    // 5
            '  END',                                      // 6
            'Obj  ctThing',                               // 7
            '  CODE',                                     // 8
            '  Obj.Method()',                             // 9 — hand-coded call site
        ].join('\r\n'),
        'ctThing.inc': [
            "ctThing CLASS,TYPE,MODULE('ctThing.clw'),LINK('ctThing.clw')",  // 0
            'Method     PROCEDURE()',                                       // 1 — declaration
            '         END',                                                 // 2
        ].join('\r\n'),
        'ctThing.clw': [
            "  MEMBER('ap1.clw')",                        // 0
            "  INCLUDE('ctThing.inc'),ONCE",              // 1
            '  MAP',                                      // 2
            '  END',                                      // 3
            'ctThing.Method PROCEDURE()',                 // 4 — implementation
            '  CODE',                                     // 5
            '  RETURN',                                   // 6
        ].join('\r\n'),
        'browse.clw': [
            "  MEMBER('ap1.clw')",                        // 0
            '  MAP',                                      // 1
            '  END',                                      // 2
            'Browse PROCEDURE()',                         // 3
            '  CODE',                                     // 4
            '  Obj.Method()',                             // 5 — generated call site
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename528-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        ExpExportIndex.getInstance().reset();
        docs.clear();
        project = new ClarionProjectServer('ap1', 'app', dir, '{AP1-528}');
        const seedPaths: string[] = [];
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            const sf = new ClarionSourcerFileServer(rel, rel, project);
            if (rel === 'browse.clw') sf.generated = true;
            project.sourceFiles.push(sf);
            seedPaths.push(p);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seedPaths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seedPaths);
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().buildIndex(dir);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        ExpExportIndex.getInstance().reset();
        StructureDeclarationIndexer.getInstance().clearCache();
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const editsByFile = (edit: { documentChanges?: unknown[] } | null): [string, number][] =>
        ((edit?.documentChanges ?? []) as { textDocument: { uri: string }; edits: unknown[] }[])
            .map(dc => [path.basename(decodeURIComponent(dc.textDocument.uri)).toLowerCase(), dc.edits.length] as [string, number])
            .sort();
    const setGenerated = (rel: string, value: boolean) => { project.sourceFiles.find(sf => sf.name === rel)!.generated = value; };
    const AT_BROWSE_CALL = { line: 5, character: 8 };   // "Obj.Method()" — on Method

    // #549 — a rename never starts from a generated file, whatever the declaration.
    // (#528 had let this one through; the developer's rule is "never in a generated module".)
    test('a rename started at a generated call site is refused, even for a hand-coded method (#549)', async () => {
        const provider = new RenameProvider();
        await assert.rejects(
            () => provider.prepareRename(docs.get('browse.clw')!, AT_BROWSE_CALL),
            (err: Error) => {
                assert.ok(/generated/i.test(err.message) && /browse\.clw/i.test(err.message), `got: ${err.message}`);
                assert.ok(/hand-written|hand-coded/i.test(err.message), `must point at the hand-written source; got: ${err.message}`);
                return true;
            });
        await assert.rejects(
            () => provider.provideRename(docs.get('browse.clw')!, AT_BROWSE_CALL, 'Renamed'),
            (err: Error) => /generated/i.test(err.message),
            'provideRename must reject too, in case the client skipped prepareRename');
    });

    test('started at the hand-coded implementation, it rewrites the declaration, implementation and callers, and skips the generated module', async () => {
        const provider = new RenameProvider();
        const AT_IMPL = { line: 4, character: 9 };   // ctThing.clw "ctThing.Method PROCEDURE()" — on Method
        const edit = await provider.provideRename(docs.get('ctThing.clw')!, AT_IMPL, 'Renamed');
        assert.deepStrictEqual(editsByFile(edit), [['ap1.clw', 1], ['ctthing.clw', 1], ['ctthing.inc', 1]]);
        // #550 — the generated browse.clw call site is found from the implementation now
        // (the class-method search reaches every MEMBER module of the program), so it is
        // skipped and reported rather than silently absent.
        const report = provider.getLastRenameReport();
        assert.ok(report, 'the generated call site is reported');
        assert.deepStrictEqual(report!.skipped.map(s => `${path.basename(s.file).toLowerCase()}:${s.count}`), ['browse.clw:1']);
        assert.ok(/cannot alter generated code/i.test(report!.message), report!.message);
        assert.ok(/hand-coded/i.test(report!.message) && /\.app/i.test(report!.message), report!.message);
        assert.ok(/3 hand-coded file/i.test(report!.message) && /1 occurrence/i.test(report!.message), report!.message);
    });

    test('a method whose declaration is generated is still refused, from a generated call site and from a hand-coded one', async () => {
        setGenerated('ctThing.inc', true);
        setGenerated('ctThing.clw', true);
        setGenerated('browse.clw', false);
        const provider = new RenameProvider();
        await assert.rejects(() => provider.prepareRename(docs.get('browse.clw')!, AT_BROWSE_CALL),
            (err: Error) => { assert.ok(/generated/i.test(err.message) && /\.app/i.test(err.message), err.message); return true; });
        await assert.rejects(() => provider.prepareRename(docs.get('ap1.clw')!, { line: 9, character: 8 }),
            (err: Error) => { assert.ok(/generated/i.test(err.message), err.message); return true; });
        await assert.rejects(() => provider.provideRename(docs.get('ap1.clw')!, { line: 9, character: 8 }, 'Renamed'),
            (err: Error) => { assert.ok(/generated/i.test(err.message), err.message); return true; });
    });

    test('a rename started in a generated file of a symbol declared in that same generated file is refused', async () => {
        // browse.clw is generated and Browse's declaration lives in the generated ap1 MAP? No —
        // declare a module-local procedure so the declaration is IN the generated file.
        const p = path.join(dir, 'gen2.clw');
        const content = ["  MEMBER('ap1.clw')", '  MAP', '    Helper PROCEDURE()', '  END', 'Helper PROCEDURE()', '  CODE', '  RETURN'].join('\r\n');
        fs.writeFileSync(p, content);
        const sf = new ClarionSourcerFileServer('gen2.clw', 'gen2.clw', project);
        sf.generated = true;
        project.sourceFiles.push(sf);
        const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
        TokenCache.getInstance().getTokens(doc);
        await assert.rejects(() => new RenameProvider().prepareRename(doc, { line: 4, character: 2 }),
            (err: Error) => { assert.ok(/generated/i.test(err.message), err.message); return true; });
    });
});
