/**
 * #527 — rename spans the DLL family for hand-coded files and reports why occurrences
 * in generated files were left alone.
 *
 * Rename called the references engine with cross-project expansion off (#330: consumer
 * re-declarations are generated, the durable edit belongs in the .app). Since #526 that
 * also kept a rename of an exported global inside the cursor's project, which for a
 * hand-coded multi-DLL solution silently left the definer and the other consumers
 * untouched and broke the build.
 *
 * The generator marks every Compile item it writes with `<Generated>true</Generated>`,
 * so the split is a fact from the .cwproj, not a guess. Rule (Mark, 2026-09-15): a
 * generated file is never rewritten by rename, whichever project it is in. Occurrences
 * there are skipped and reported (file + occurrence count, and where the durable change
 * belongs), and a rename started IN a generated file is refused with that reason.
 *
 * Same fixture as #526, with ap2 marked generated.
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

const EXTERNAL_DECL = 'GVF:Owner            STRING(256),EXTERNAL,DLL(_ABCDllMode_)';

suite('Rename spans the DLL family for hand-coded files (#527)', () => {
    let root: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();
    const built: ClarionProjectServer[] = [];

    const projects: { [dir: string]: { [rel: string]: string } } = {
        IBSCommon: {
            'ibscommon.clw': ['  PROGRAM', '  MAP', '  END', '  CODE', '  RETURN'].join('\r\n'),
            'IBSCOGLO.CLW': [
                '    MEMBER',
                '! Global Data to be included before file declaration',
                'GVF:Owner            STRING(256)',           // 2 — the definition
                'GVF:DriverString     STRING(512)',
            ].join('\r\n'),
            'IBSCommon.exp': ['LIBRARY', 'EXPORTS', '  $GVF:DRIVERSTRING   @?', '  $GVF:OWNER   @?'].join('\n'),
        },
        ap1: {
            'ap1.clw': [
                '  PROGRAM', '  MAP', "    MODULE('worker.clw')", '      Work PROCEDURE()', '    END', '  END',
                EXTERNAL_DECL,                                // 6
                '  CODE',
                "  GVF:Owner = 'ap1'",                        // 8
            ].join('\r\n'),
            'worker.clw': [
                "  MEMBER('ap1.clw')", '  MAP', '  END', 'Work PROCEDURE()', '  CODE',
                "  IF GVF:Owner = '' THEN RETURN.",           // 5
            ].join('\r\n'),
        },
        ap2: {
            'ap2.clw': [
                '  PROGRAM', '  MAP', '  END',
                EXTERNAL_DECL,                                // 3
                '  CODE',
                "  GVF:Owner = 'ap2'",                        // 5
            ].join('\r\n'),
        },
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'rename527-'));
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        ExpExportIndex.getInstance().reset();
        docs.clear();
        built.length = 0;
        const seedPaths: string[] = [];
        for (const [name, files] of Object.entries(projects)) {
            const dir = path.join(root, name);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n*.exp = .\r\n');
            const project = new ClarionProjectServer(name, 'app', dir, `{${name}-527}`);
            for (const [rel, content] of Object.entries(files)) {
                const p = path.join(dir, rel);
                fs.writeFileSync(p, content);
                if (rel.toLowerCase().endsWith('.exp')) continue;
                const sf = new ClarionSourcerFileServer(rel, rel, project);
                if (name === 'ap2') sf.generated = true;       // the generated consumer
                project.sourceFiles.push(sf);
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
        serverSettings.libsrcPaths = [];   // project folders are NOT libsrc: rename's standard-library guard must not fire
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

    const editsByFile = (edit: { documentChanges?: unknown[] } | null): Map<string, number> => {
        const out = new Map<string, number>();
        for (const dc of (edit?.documentChanges ?? []) as { textDocument: { uri: string }; edits: unknown[] }[]) {
            out.set(path.basename(decodeURIComponent(dc.textDocument.uri)).toLowerCase(), dc.edits.length);
        }
        return out;
    };

    test('rename from a hand-coded consumer rewrites its own files, the hand-coded definer, and skips the generated consumer', async () => {
        const provider = new RenameProvider();
        const edit = await provider.provideRename(docs.get('ap1.clw')!, { line: 6, character: 4 }, 'GVF:Proprietor');
        const got = editsByFile(edit);
        assert.deepStrictEqual([...got.entries()].sort(), [['ap1.clw', 2], ['ibscoglo.clw', 1], ['worker.clw', 1]], `edits: ${JSON.stringify([...got])}`);
        const report = provider.getLastRenameReport();
        assert.ok(report, 'a report is produced when generated files were left alone');
        assert.deepStrictEqual(report!.skipped.map(s => `${path.basename(s.file).toLowerCase()}:${s.count}`), ['ap2.clw:2']);
        assert.ok(/\.app/i.test(report!.message) && /generated/i.test(report!.message), `message explains why: ${report!.message}`);
    });

    test('a generated file in the cursor\'s own project is skipped and reported too', async () => {
        // The Generated flag is about who owns the file, not which project it is in.
        const ap1 = built.find(p => p.name === 'ap1')!;
        ap1.sourceFiles.find(sf => sf.name === 'worker.clw')!.generated = true;
        const provider = new RenameProvider();
        const edit = await provider.provideRename(docs.get('ap1.clw')!, { line: 6, character: 4 }, 'GVF:Proprietor');
        const got = editsByFile(edit);
        assert.deepStrictEqual([...got.entries()].sort(), [['ap1.clw', 2], ['ibscoglo.clw', 1]], `edits: ${JSON.stringify([...got])}`);
        const report = provider.getLastRenameReport();
        assert.ok(report);
        assert.deepStrictEqual(report!.skipped.map(s => `${path.basename(s.file).toLowerCase()}:${s.count}`).sort(), ['ap2.clw:2', 'worker.clw:1']);
    });

    test('rename is refused, with the reason, when the file under the cursor is generated', async () => {
        for (const p of built) for (const sf of p.sourceFiles) sf.generated = true;
        const provider = new RenameProvider();
        await assert.rejects(
            () => provider.prepareRename(docs.get('ap1.clw')!, { line: 6, character: 4 }),
            (err: Error) => {
                assert.ok(/generated/i.test(err.message) && /\.app/i.test(err.message), `prepareRename rejected with: ${err.message}`);
                return true;
            });
        await assert.rejects(
            () => provider.provideRename(docs.get('ap1.clw')!, { line: 6, character: 4 }, 'GVF:Proprietor'),
            (err: Error) => /generated/i.test(err.message),
            'provideRename must reject too, in case the client skipped prepareRename');
    });

    test('no report when nothing was left alone', async () => {
        for (const p of built) for (const sf of p.sourceFiles) sf.generated = false;
        const provider = new RenameProvider();
        const edit = await provider.provideRename(docs.get('ap1.clw')!, { line: 6, character: 4 }, 'GVF:Proprietor');
        assert.strictEqual(editsByFile(edit).size, 4, 'all four files rewritten');
        assert.strictEqual(provider.getLastRenameReport(), null);
    });

    test('the project parser reads the Generated flag from the .cwproj', async () => {
        const dir = path.join(root, 'flagproj');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'gen.clw'), '  PROGRAM\r\n  CODE\r\n');
        fs.writeFileSync(path.join(dir, 'hand.clw'), "  MEMBER('gen.clw')\r\n");
        fs.writeFileSync(path.join(dir, 'FlagProj.cwproj'), [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
            '  <ItemGroup>',
            '    <Compile Include="gen.clw">',
            '      <Generated>true</Generated>',
            '    </Compile>',
            '    <Compile Include="hand.clw"/>',
            '  </ItemGroup>',
            '</Project>',
        ].join('\r\n'));
        const project = new ClarionProjectServer('FlagProj', 'app', dir, '{FLAG-527}');
        await project.loadSourceFilesFromProjectFile();
        const byName = new Map(project.sourceFiles.map(sf => [sf.name.toLowerCase(), sf.generated]));
        assert.strictEqual(byName.get('gen.clw'), true, 'Generated true read');
        assert.strictEqual(byName.get('hand.clw'), false, 'absent flag reads as hand-coded');
    });
});
