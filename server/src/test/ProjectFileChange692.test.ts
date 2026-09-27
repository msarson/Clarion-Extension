import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { DirectoryFileIndex } from '../solution/DirectoryFileIndex';
import { serverSettings } from '../serverSettings';
import { reloadProjectSourceFiles, graphSeeds } from '../solution/ProjectFileChange';

/**
 * #692 — a source added to a .cwproj while the solution was open never reached the file graph.
 * The .cwproj-change pass (#317) rebuilt the graph from each project's `sourceFiles`, which were
 * read once, when the solution loaded; nothing re-read the changed project file. The pass now
 * reloads every project's sources first (fresh directory listings, since the load index keeps
 * its listings until cleared), and the graph seeds come from the reloaded lists.
 */
suite('A .cwproj edited while the solution is open reaches the file graph (#692)', () => {
    let tmpRoot = '';
    let projDir = '';
    let savedRedirectionFile = '';
    let savedLibsrc: string[] = [];

    const cwproj = (sources: string[]) => [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        '  <ItemGroup>',
        ...sources.map(s => `    <Compile Include="${s}" />`),
        '  </ItemGroup>',
        '</Project>',
        '',
    ].join('\r\n');
    const names = (project: ClarionProjectServer) => project.sourceFiles.map(f => f.name.toLowerCase()).sort();

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proj692-'));
        projDir = path.join(tmpRoot, 'Proj');
        fs.mkdirSync(projDir, { recursive: true });
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n');
        fs.writeFileSync(path.join(projDir, 'Main.clw'), '  PROGRAM\r\n  CODE\r\n');
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw']));
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        DirectoryFileIndex.getInstance().clear();
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrc;
        DirectoryFileIndex.getInstance().clear();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const loaded = async () => {
        const project = new ClarionProjectServer('Proj', 'app', projDir, '{PROJ-692}');
        await project.loadSourceFilesFromProjectFile();
        return project;
    };

    test('precondition: the project loads its one source', async () => {
        assert.deepStrictEqual(names(await loaded()), ['main.clw']);
    });

    test('bug-pin: a source added to the .cwproj (a new file on disk) is in the graph seeds after the reload', async () => {
        const project = await loaded();
        fs.writeFileSync(path.join(projDir, 'Added.clw'), "  MEMBER('Main')\r\n");
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw', 'Added.clw']));

        await reloadProjectSourceFiles([project]);

        assert.deepStrictEqual(names(project), ['added.clw', 'main.clw']);
        const seeds = graphSeeds([project]);
        assert.ok(seeds.files.some(f => path.basename(f).toLowerCase() === 'added.clw'), `seeds: ${seeds.files.join(', ')}`);
        assert.deepStrictEqual(seeds.unresolved, []);
        assert.strictEqual(project.sourceFiles.find(f => f.name === 'Added.clw')?.project, project, 'the new entry belongs to the live project');
    });

    test('a source removed from the .cwproj leaves the seeds', async () => {
        fs.writeFileSync(path.join(projDir, 'Added.clw'), "  MEMBER('Main')\r\n");
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw', 'Added.clw']));
        const project = await loaded();
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw']));

        await reloadProjectSourceFiles([project]);

        assert.deepStrictEqual(names(project), ['main.clw']);
        assert.deepStrictEqual(graphSeeds([project]).files.map(f => path.basename(f).toLowerCase()), ['main.clw']);
    });

    test('a source listed but not on disk is reported unresolved (the report\'s missing project sources)', async () => {
        const project = await loaded();
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw', 'Gone.clw']));

        await reloadProjectSourceFiles([project]);

        assert.deepStrictEqual(graphSeeds([project]).unresolved, ['Proj/Gone.clw']);
    });
});
