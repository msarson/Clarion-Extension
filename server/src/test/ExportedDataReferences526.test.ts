/**
 * #526 — find-all-references on exported global data spans the data DLL that exports
 * it and every project that references that DLL.
 *
 * The multi-DLL shape, verified on ap1.sln: the data DLL project compiles a generated
 * bare-MEMBER globals module (IBSCOGLO.CLW) whose data section DEFINES the globals,
 * and exports them by name in its .exp (`$GVF:OWNER @?`). Every consumer carries a
 * ProjectReference to that project and re-declares the name
 * `EXTERNAL,DLL(_ABCDllMode_)` in its PROGRAM file. Other programs may define a
 * same-named global of their own and must not be pulled in.
 *
 * Fixture:
 *   IBSCommon/  ibscommon.clw (PROGRAM), IBSCOGLO.CLW (bare MEMBER, defines GVF:Owner),
 *               IBSCommon.exp exporting $GVF:OWNER
 *   ap1/        ap1.clw re-declares EXTERNAL and uses; worker.clw MEMBER('ap1.clw') uses;
 *               references IBSCommon
 *   ap2/        ap2.clw re-declares EXTERNAL and uses; references IBSCommon
 *   orphan/     orphan.clw re-declares EXTERNAL and uses; references nothing
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
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

const EXTERNAL_DECL = 'GVF:Owner            STRING(256),EXTERNAL,DLL(_ABCDllMode_)';

suite('FAR on exported global data spans the DLL family (#526)', () => {
    let root: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const projects: { [dir: string]: { [rel: string]: string } } = {
        IBSCommon: {
            'ibscommon.clw': [
                '  PROGRAM',                                  // 0
                '  MAP',                                      // 1
                '  END',                                      // 2
                '  CODE',                                     // 3
                '  RETURN',                                   // 4
            ].join('\r\n'),
            'IBSCOGLO.CLW': [
                '    MEMBER',                                 // 0 — bare: universal member module
                '! Global Data to be included before file declaration',  // 1
                'GVF:Owner            STRING(256)',           // 2 — THE definition (exported module data)
                'GVF:DriverString     STRING(512)',           // 3
            ].join('\r\n'),
            'IBSCommon.exp': [
                'LIBRARY',
                'EXPORTS',
                '  $GVF:DRIVERSTRING                                       @?',
                '  $GVF:OWNER                                              @?',
                '  SOMEPROC@F                                              @?',
            ].join('\n'),
        },
        ap1: {
            'ap1.clw': [
                '  PROGRAM',                                  // 0
                '  MAP',                                      // 1
                "    MODULE('worker.clw')",                   // 2
                '      Work PROCEDURE()',                     // 3
                '    END',                                    // 4
                '  END',                                      // 5
                EXTERNAL_DECL,                                // 6 — consumer re-declaration
                '  CODE',                                     // 7
                "  GVF:Owner = 'ap1'",                        // 8
            ].join('\r\n'),
            'worker.clw': [
                "  MEMBER('ap1.clw')",                        // 0
                '  MAP',                                      // 1
                '  END',                                      // 2
                'Work PROCEDURE()',                           // 3
                '  CODE',                                     // 4
                "  IF GVF:Owner = '' THEN RETURN.",           // 5 — use in a member of a consumer
            ].join('\r\n'),
        },
        ap2: {
            'ap2.clw': [
                '  PROGRAM',                                  // 0
                '  MAP',                                      // 1
                '  END',                                      // 2
                EXTERNAL_DECL,                                // 3
                '  CODE',                                     // 4
                "  GVF:Owner = 'ap2'",                        // 5
            ].join('\r\n'),
        },
        orphan: {
            'orphan.clw': [
                '  PROGRAM',                                  // 0
                '  MAP',                                      // 1
                '  END',                                      // 2
                EXTERNAL_DECL,                                // 3 — EXTERNAL but references nothing in the solution
                '  CODE',                                     // 4
                "  GVF:Owner = 'orphan'",                     // 5
            ].join('\r\n'),
        },
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'far526-'));
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        ExpExportIndex.getInstance().reset();
        docs.clear();
        const built: ClarionProjectServer[] = [];
        const seedPaths: string[] = [];
        for (const [name, files] of Object.entries(projects)) {
            const dir = path.join(root, name);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n*.exp = .\r\n');
            const project = new ClarionProjectServer(name, 'app', dir, `{${name}-526}`);
            for (const [rel, content] of Object.entries(files)) {
                const p = path.join(dir, rel);
                fs.writeFileSync(p, content);
                if (rel.toLowerCase().endsWith('.exp')) continue;
                project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
                seedPaths.push(p);
                const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
                tc.getTokens(doc);
                docs.set(rel, doc);
            }
            if (name === 'ap1' || name === 'ap2') project.projectReferences.push({ name: 'IBSCommon', project: 'IBSCommon.cwproj' });
            built.push(project);
        }
        const findProjectForFile = (fp: string) => {
            const norm = path.normalize(fp).toLowerCase();
            const byPath = built.find(p => norm.startsWith(path.normalize(p.path).toLowerCase() + path.sep));
            if (byPath) return byPath;
            const base = path.basename(norm);
            return built.find(p => p.sourceFiles.some(sf => sf.name.toLowerCase() === base));
        };
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: built },
            findProjectForFile,
            getProjectPathForFile: (fp: string) => findProjectForFile(fp)?.path ?? path.dirname(fp),
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seedPaths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seedPaths);
        serverSettings.libsrcPaths = Object.keys(projects).map(n => path.join(root, n));
        StructureDeclarationIndexer.getInstance().clearCache();
        for (const n of Object.keys(projects)) await StructureDeclarationIndexer.getInstance().buildIndex(path.join(root, n));
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
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const keyed = (refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): string[] =>
        (refs ?? []).map(r => `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`).sort();
    const far = (rel: string, line: number, character: number, opts?: { crossProjectDll?: boolean }) =>
        new ReferencesProvider().provideReferences(docs.get(rel)!, { line, character }, { includeDeclaration: true }, undefined, opts);

    const FAMILY = ['ap1.clw:6', 'ap1.clw:8', 'worker.clw:5', 'ap2.clw:3', 'ap2.clw:5', 'ibscoglo.clw:2'].sort();

    test('the export index reports exported data from the .exp', () => {
        const idx = ExpExportIndex.getInstance();
        const ibs = (SolutionManager.getInstance()!.solution.projects as ClarionProjectServer[]).find(p => p.name === 'IBSCommon')!;
        assert.strictEqual(idx.isExportedData(ibs, 'GVF:Owner'), true, '$GVF:OWNER @? is a data export');
        assert.strictEqual(idx.isExportedData(ibs, 'GVF:Nope'), false);
        assert.strictEqual(idx.isExportedProcedure(ibs, 'GVF:Owner'), false, 'data is not a procedure export');
    });

    test('two projects sharing one folder keep separate .exp parses (the real ap1.sln layout)', () => {
        // Regression pin for the cache-key collision found on the live solution: every
        // .cwproj lives in the same folder, and a folder-only key handed the first parsed
        // .exp to all 40 projects.
        const shared = path.join(root, 'shared');
        fs.mkdirSync(shared, { recursive: true });
        fs.writeFileSync(path.join(shared, 'DataDll.exp'), 'EXPORTS\n  $GVF:SHARED                                             @?\n');
        fs.writeFileSync(path.join(shared, 'App.exp'), 'EXPORTS\n  APPPROC@F                                               @?\n');
        const pData = new ClarionProjectServer('DataDll', 'app', shared, '{SHARED-DATA}');
        const pApp = new ClarionProjectServer('App', 'app', shared, '{SHARED-APP}');
        const idx = ExpExportIndex.getInstance();
        assert.strictEqual(idx.isExportedData(pData, 'GVF:Shared'), true);
        assert.strictEqual(idx.isExportedData(pApp, 'GVF:Shared'), false, 'App in the same folder must not inherit DataDll\'s parse');
        assert.strictEqual(idx.isExportedProcedure(pApp, 'AppProc'), true);
        assert.strictEqual(idx.isExportedProcedure(pData, 'AppProc'), false);
    });

    test('FAR from a consumer re-declaration spans the definer and every referencing consumer, not the orphan', async () => {
        const got = keyed(await far('ap1.clw', 6, 4));
        assert.deepStrictEqual(got, FAMILY, `got [${got.join(', ')}]`);
    });

    test('FAR from a use inside a consumer MEMBER module returns the same family', async () => {
        const got = keyed(await far('worker.clw', 5, 8));
        assert.deepStrictEqual(got, FAMILY, `got [${got.join(', ')}]`);
    });

    test('FAR from the definition in the bare-MEMBER globals module returns the same family', async () => {
        const got = keyed(await far('IBSCOGLO.CLW', 2, 4));
        assert.deepStrictEqual(got, FAMILY, `got [${got.join(', ')}]`);
    });

    test('FAR from an EXTERNAL re-declaration whose references reach no exporter falls back to the whole solution', async () => {
        const got = keyed(await far('orphan.clw', 3, 4));
        assert.ok(got.includes('orphan.clw:3') && got.includes('orphan.clw:5'), `orphan's own; got [${got.join(', ')}]`);
        assert.ok(got.includes('ibscoglo.clw:2'), `the exporter is at least reachable in the fallback; got [${got.join(', ')}]`);
    });

    test('rename gate: crossProjectDll:false keeps FAR inside the declaring project', async () => {
        const got = keyed(await far('ap1.clw', 6, 4, { crossProjectDll: false }));
        assert.deepStrictEqual(got, ['ap1.clw:6', 'ap1.clw:8', 'worker.clw:5'], `got [${got.join(', ')}]`);
    });
});
