import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { applyResolutionEnvironment, ResolutionEnvironmentParams } from '../solution/ResolutionEnvironment';
import { loadIncludeIndex, saveIncludeIndex } from '../services/IncludeIndexDiskCache';

/**
 * #568 — a second `clarion/updatePaths` naming another Clarion install kept resolving through the
 * first one. Headless on VitTransform: Clarion 12 then Clarion 10 in one session still sent Go to
 * Definition on `param.RemoveLines()` to Clarion 12's StringTheory.inc, and the other way round.
 * The solution manager is reused for the same .sln, so its projects kept their redirection
 * parsers (macros captured at construction) and search-path caches, and the disk caches did not
 * know the install: the graph's signature has the red file NAME and libsrc but not its directory
 * or %ROOT%, and the include indexes are keyed by the host file alone.
 *
 * Fixture: two installs whose Clarion110.red both say `*.inc = %ROOT%\libsrc`, each with its own
 * Thing.inc, and no libsrc paths — so only the redirection directory and %ROOT% tell them apart.
 */
suite('A change of Clarion install rebuilds file resolution as on a cold start (#568)', () => {
    let tmpRoot = '';
    let projDir = '';
    let sln = '';
    let main = '';
    let envA: ResolutionEnvironmentParams;
    let envB: ResolutionEnvironmentParams;
    let saved: Record<string, unknown> = {};
    let savedSm: unknown;

    const install = (name: string): ResolutionEnvironmentParams => {
        const root = path.join(tmpRoot, name);
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin, { recursive: true });
        fs.mkdirSync(path.join(root, 'libsrc'), { recursive: true });
        fs.writeFileSync(path.join(bin, 'Clarion110.red'), '[Common]\r\n*.inc = %ROOT%\\libsrc\r\n*.clw = .\r\n');
        fs.writeFileSync(path.join(root, 'libsrc', 'Thing.inc'), `! ${name} copy\r\n`);
        return {
            clarionVersion: `Clarion ${name}`,
            redirectionFile: 'Clarion110.red',
            redirectionPaths: [bin],
            macros: { root, reddir: bin },
            libsrcPaths: [],
        };
    };

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'env568-'));
        projDir = path.join(tmpRoot, 'Proj');
        fs.mkdirSync(projDir, { recursive: true });
        envA = install('InstallA');
        envB = install('InstallB');
        main = path.join(projDir, 'main.clw');
        fs.writeFileSync(main, "  PROGRAM\r\n  INCLUDE('Thing.inc'),ONCE\r\n  MAP\r\n  END\r\n  CODE\r\n");
        sln = path.join(projDir, 'Proj.sln');
        fs.writeFileSync(sln, [
            'Microsoft Visual Studio Solution File, Format Version 12.00',
            'Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Proj", "Proj.cwproj", "{56800000-0000-0000-0000-000000000568}"',
            'EndProject',
            '',
        ].join('\r\n'));
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
            '  <PropertyGroup><ProjectGuid>{56800000-0000-0000-0000-000000000568}</ProjectGuid><OutputType>Exe</OutputType></PropertyGroup>',
            '  <ItemGroup><Compile Include="main.clw" /></ItemGroup>',
            '</Project>',
            '',
        ].join('\r\n'));

        saved = {
            clarionVersion: serverSettings.clarionVersion,
            redirectionFile: serverSettings.redirectionFile,
            redirectionPaths: serverSettings.redirectionPaths,
            macros: serverSettings.macros,
            libsrcPaths: serverSettings.libsrcPaths,
            configuration: serverSettings.configuration,
            solutionFilePath: serverSettings.solutionFilePath,
        };
        serverSettings.configuration = 'Debug';
        serverSettings.solutionFilePath = sln;
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
    });

    teardown(async () => {
        const { FileRelationshipGraph } = await import('../FileRelationshipGraph');
        FileRelationshipGraph.getInstance().reset();
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        Object.assign(serverSettings, saved);
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    /** What the updatePaths handler does: apply the settings, then (re)create the solution manager. */
    const load = async (env: ResolutionEnvironmentParams) => {
        applyResolutionEnvironment(env);
        await SolutionManager.create(sln);
    };
    const thingDir = async () => {
        const found = await SolutionManager.getInstance()!.findFileWithExtension('Thing.inc', main);
        return path.basename(path.dirname(path.dirname(found.path)));
    };

    test('precondition: a load under install B alone resolves its Thing.inc', async () => {
        // Every test builds its own temp folders, so nothing from install A exists in this process.
        await load(envB);
        assert.strictEqual(await thingDir(), 'InstallB');
    });

    test("a new solution manager under another install does not reuse the first install's parse", async () => {
        await load(envA);
        assert.strictEqual(await thingDir(), 'InstallA', 'warm under install A');
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        await load(envB);
        assert.strictEqual(await thingDir(), 'InstallB');
    });

    test('after switching installs in the same session, the lookup answers from the new install', async () => {
        await load(envA);
        assert.strictEqual(await thingDir(), 'InstallA', 'warm under install A');
        await load(envB);
        assert.strictEqual(await thingDir(), 'InstallB');
    });

    test('a file graph rebuilt after the switch resolves the INCLUDE through the new install, not the disk cache', async () => {
        const { FileRelationshipGraph } = await import('../FileRelationshipGraph');
        const graph = FileRelationshipGraph.getInstance();
        const includeInstall = () => {
            const to = graph.getForwardEdges(main).find(e => e.type === 'INCLUDE')?.toFile ?? '(none)';
            return path.basename(path.dirname(path.dirname(to))).toLowerCase();
        };
        await load(envA);
        graph.reset();
        await graph.buildInBackground([main]);
        assert.strictEqual(includeInstall(), 'installa');

        await load(envB);
        graph.reset();
        await graph.buildInBackground([main]);
        assert.strictEqual(includeInstall(), 'installb');
    });

    test('an include index saved under one install is not loaded under another', () => {
        applyResolutionEnvironment(envA);
        saveIncludeIndex('chainindex', main, { signature: 'host', contributing: { [main]: 1 }, payload: { thing: 'InstallA' } });
        try {
            assert.ok(loadIncludeIndex('chainindex', main), 'precondition: reloads under the same install');
            applyResolutionEnvironment(envB);
            assert.strictEqual(loadIncludeIndex('chainindex', main), null);
        } finally {
            applyResolutionEnvironment(envA);
            saveIncludeIndex('chainindex', main, { signature: 'x', contributing: {}, payload: null });
        }
    });

    test('the declaration index keeps a separate disk cache per install', async () => {
        const { StructureDeclarationIndexer } = await import('../utils/StructureDeclarationIndexer');
        const indexer = StructureDeclarationIndexer.getInstance() as unknown as { diskCachePath(p: string): string };
        applyResolutionEnvironment(envA);
        const underA = indexer.diskCachePath(projDir);
        applyResolutionEnvironment(envB);
        assert.notStrictEqual(indexer.diskCachePath(projDir), underA);
    });

    test('the same install sent again is not a change', () => {
        applyResolutionEnvironment(envA);
        assert.strictEqual(applyResolutionEnvironment({ ...envA }), false);
        assert.strictEqual(applyResolutionEnvironment(envB), true);
    });
});
