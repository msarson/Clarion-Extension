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

/**
 * A module headed by an INCLUDEd shim (`INCLUDE('member.clw')`, the shim holding
 * `MEMBER('app1.clw')`) is a module of that program, as one with its own MEMBER is. The file
 * graph records the MEMBER edge on the shim, so the program's module list held the shim and not
 * the modules that include it, and Find All References never searched them for a use of the
 * program's global data:
 *  - a class method called through a program global (`Obj.Method()`), searched from its
 *    implementation: the class's .inc is reached by the program only through another .inc, and
 *    the calling module does not include it;
 *  - a plain program global (`Counter`), searched from its declaration.
 * From the call site itself the hit was found, because the cursor's own file is always searched.
 */
suite('References reach modules headed by an INCLUDEd MEMBER shim', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'app1.clw': [
            '  PROGRAM',                                  // 0
            "  INCLUDE('wrap.inc'),ONCE",                 // 1
            '  MAP',                                      // 2
            "    MODULE('browse.clw')",                   // 3
            '      Browse PROCEDURE()',                   // 4
            '    END',                                    // 5
            '  END',                                      // 6
            'Obj      &ctThing',                          // 7
            'Counter  LONG',                              // 8
            '  CODE',                                     // 9
            '  Obj &= NEW(ctThing)',                      // 10
            '  Obj.Method()',                             // 11
            '  Counter = 1',                              // 12
        ].join('\r\n'),
        // The program reaches the class only through this file.
        'wrap.inc': [
            "  INCLUDE('ctThing.inc'),ONCE",              // 0
        ].join('\r\n'),
        'ctThing.inc': [
            "ctThing CLASS,TYPE,MODULE('ctThing.clw')",   // 0
            'Method     PROCEDURE()',                     // 1
            '         END',                               // 2
        ].join('\r\n'),
        // The shim: the only file with a MEMBER statement.
        'member.clw': [
            "  MEMBER('app1.clw')",                       // 0
        ].join('\r\n'),
        'ctThing.clw': [
            "  INCLUDE('member.clw')",                    // 0
            "  INCLUDE('ctThing.inc'),ONCE",              // 1
            '  MAP',                                      // 2
            '  END',                                      // 3
            'ctThing.Method PROCEDURE()',                 // 4
            '  CODE',                                     // 5
            '  RETURN',                                   // 6
        ].join('\r\n'),
        // Calls the method through the program global without including the class's .inc.
        'browse.clw': [
            "  INCLUDE('member.clw')",                    // 0
            '  MAP',                                      // 1
            '  END',                                      // 2
            'Browse PROCEDURE()',                         // 3
            '  CODE',                                     // 4
            '  Obj.Method()',                             // 5
            '  Counter += 1',                             // 6
        ].join('\r\n'),
        // A module with its own MEMBER, in the same program: both shapes are searched.
        'other.clw': [
            "  MEMBER('app1.clw')",                       // 0
            '  MAP',                                      // 1
            '  END',                                      // 2
            'Other PROCEDURE()',                          // 3
            '  CODE',                                     // 4
            '  Obj.Method()',                             // 5
            '  Counter += 2',                             // 6
        ].join('\r\n'),
        // A second program in the same project, with its own shim and its own global Counter:
        // none of its modules is a module of app1, and app1's searches must not reach them.
        'app2.clw': [
            '  PROGRAM',                                  // 0
            '  MAP',                                      // 1
            "    MODULE('report.clw')",                   // 2
            '      Report PROCEDURE()',                   // 3
            '    END',                                    // 4
            '  END',                                      // 5
            'Counter  LONG',                              // 6
            '  CODE',                                     // 7
            '  Counter = 5',                              // 8
        ].join('\r\n'),
        'member2.clw': [
            "  MEMBER('app2.clw')",                       // 0
        ].join('\r\n'),
        'report.clw': [
            "  INCLUDE('member2.clw')",                   // 0
            '  MAP',                                      // 1
            '  END',                                      // 2
            'Report PROCEDURE()',                         // 3
            '  CODE',                                     // 4
            '  Counter += 10',                            // 5
        ].join('\r\n'),
        'plain2.clw': [
            "  MEMBER('app2.clw')",                       // 0
            '  MAP',                                      // 1
            '  END',                                      // 2
            'Plain PROCEDURE()',                          // 3
            '  CODE',                                     // 4
            '  Counter += 20',                            // 5
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-shim-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        ExpExportIndex.getInstance().reset();
        docs.clear();
        const project = new ClarionProjectServer('app1', 'app', dir, '{APP1-SHIM}');
        // app2 is its own project in the same folder, as two programs of one solution often are.
        const project2 = new ClarionProjectServer('app2', 'app', dir, '{APP2-SHIM}');
        const ofApp2 = new Set(['app2.clw', 'member2.clw', 'report.clw', 'plain2.clw']);
        const projectOf = (file: string): ClarionProjectServer =>
            ofApp2.has(path.basename(file).toLowerCase()) ? project2 : project;
        const seedPaths: string[] = [];
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            const owner = projectOf(rel);
            if (rel !== 'member.clw' && rel !== 'member2.clw') owner.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, owner));
            seedPaths.push(p);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project, project2] },
            findProjectForFile: (file: string) => projectOf(file),
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

    const hits = async (file: string, line: number, word: string): Promise<string[]> => {
        const character = files[file].split('\r\n')[line].indexOf(word) + 1;
        const locs = await new ReferencesProvider().provideReferences(docs.get(file)!, { line, character }, { includeDeclaration: true });
        return [...new Set((locs ?? []).map(l => `${path.basename(decodeURIComponent(l.uri)).toLowerCase()}:${l.range.start.line}`))].sort();
    };
    const METHOD = ['app1.clw:11', 'browse.clw:5', 'ctthing.clw:4', 'ctthing.inc:1', 'other.clw:5'];
    const COUNTER = ['app1.clw:12', 'app1.clw:8', 'browse.clw:6', 'other.clw:6'];

    test('the program\'s modules include the modules that INCLUDE its MEMBER shim', () => {
        const modules = FileRelationshipGraph.getInstance().getMemberFiles(path.join(dir, 'app1.clw'))
            .map(f => path.basename(f).toLowerCase()).sort();
        assert.deepStrictEqual(modules, ['browse.clw', 'ctthing.clw', 'member.clw', 'other.clw']);
    });

    test('a second program\'s modules, shim-headed or not, are its own and not the first\'s', () => {
        const modulesOf = (program: string): string[] => FileRelationshipGraph.getInstance()
            .getMemberFiles(path.join(dir, program)).map(f => path.basename(f).toLowerCase()).sort();
        assert.deepStrictEqual(modulesOf('app2.clw'), ['member2.clw', 'plain2.clw', 'report.clw']);
        for (const m of modulesOf('app1.clw')) assert.ok(!modulesOf('app2.clw').includes(m), `${m} is in both programs`);
    });

    test('a second program\'s global of the same name gets only its own modules\' uses', async () => {
        const COUNTER2 = ['app2.clw:6', 'app2.clw:8', 'plain2.clw:5', 'report.clw:5'];
        assert.deepStrictEqual(await hits('app2.clw', 6, 'Counter'), COUNTER2);
        assert.deepStrictEqual(await hits('report.clw', 5, 'Counter'), COUNTER2);
        assert.deepStrictEqual(await hits('plain2.clw', 5, 'Counter'), COUNTER2);
    });

    test('control: from the call in the shim-headed module, every site is found', async () => {
        assert.deepStrictEqual(await hits('browse.clw', 5, 'Method'), METHOD);
    });

    test('control: from the class declaration, every site is found', async () => {
        assert.deepStrictEqual(await hits('ctThing.inc', 1, 'Method'), METHOD);
    });

    test('from the implementation, the call in the shim-headed module is found', async () => {
        assert.deepStrictEqual(await hits('ctThing.clw', 4, 'Method'), METHOD);
    });

    test('from the program call site, the call in the shim-headed module is found', async () => {
        assert.deepStrictEqual(await hits('app1.clw', 11, 'Method'), METHOD);
    });

    test('a plain program global, from its declaration, is found in the shim-headed module', async () => {
        assert.deepStrictEqual(await hits('app1.clw', 8, 'Counter'), COUNTER);
    });

    test('control: a plain program global, from its use in either kind of module, gets every use', async () => {
        assert.deepStrictEqual(await hits('browse.clw', 6, 'Counter'), COUNTER);
        assert.deepStrictEqual(await hits('other.clw', 6, 'Counter'), COUNTER);
    });
});
