import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { DirectoryFileIndex } from '../solution/DirectoryFileIndex';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { serverSettings } from '../serverSettings';
import { rebuildGraph, GraphStatus } from '../solution/ProjectFileChange';

/**
 * #694 — the Tools pane's Graph row is fed by `clarion/graphStatus`, which only the startup build
 * sent. The .cwproj rebuild (#317/#692) and the configuration rebuild (#564) sent nothing, so the
 * row kept the startup build's numbers. Every rebuild now reports `building`, then `built`.
 */
suite('A graph rebuild reports its status to the Graph row (#694)', () => {
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

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graph694-'));
        projDir = path.join(tmpRoot, 'Proj');
        fs.mkdirSync(projDir, { recursive: true });
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n');
        fs.writeFileSync(path.join(projDir, 'Main.clw'), '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n');
        fs.writeFileSync(path.join(projDir, 'Added.clw'), "  MEMBER('Main')\r\n");
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw']));
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        DirectoryFileIndex.getInstance().clear();
        FileRelationshipGraph.getInstance().reset();
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrc;
        DirectoryFileIndex.getInstance().clear();
        FileRelationshipGraph.getInstance().reset();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('bug-pin: a rebuild after a .cwproj change reports building, then built with the new counts', async () => {
        const project = new ClarionProjectServer('Proj', 'app', projDir, '{PROJ-694}');
        await project.loadSourceFilesFromProjectFile();
        fs.writeFileSync(path.join(projDir, 'Proj.cwproj'), cwproj(['Main.clw', 'Added.clw', 'Gone.clw']));

        const statuses: GraphStatus[] = [];
        const graph = FileRelationshipGraph.getInstance();
        await rebuildGraph(graph, [project], { reloadProjects: true, onStatus: s => statuses.push(s) });

        assert.deepStrictEqual(statuses.map(s => s.status), ['building', 'built']);
        assert.deepStrictEqual(statuses[0], { status: 'building', fileCount: 2, sourceFileCount: 3, unresolvedCount: 1 });
        const built = statuses[1];
        assert.deepStrictEqual([built.fileCount, built.edgeCount, built.sourceFileCount, built.unresolvedCount],
            [graph.fileCount, graph.edgeCount, 3, 1]);
        assert.strictEqual(typeof built.durationMs, 'number');
    });
});
