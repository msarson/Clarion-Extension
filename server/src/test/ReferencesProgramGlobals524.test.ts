/**
 * #524 — find-all-references on PROGRAM global data.
 *
 * Language rule (Clarion help, MEMBER page): global data is declared in the PROGRAM
 * module, between PROGRAM and CODE, including anything INCLUDEd at that level. It is
 * visible to every `MEMBER('app')` module of that program. A bare `MEMBER()` is a
 * "universal member module" that must carry its own MAP and equates and sees nothing
 * declared in the PROGRAM. Data a MEMBER module declares before its first PROCEDURE is
 * Member Local data, visible only inside that module.
 *
 * Layout:
 *   main.clw        PROGRAM — INCLUDE globals.inc, `GlobalCount LONG`, MAP with two MODULEs
 *   globals.inc     `IncGlobal LONG` (global by inclusion)
 *   worker.clw      MEMBER('main.clw') — uses GlobalCount and IncGlobal      (must be found)
 *   universal.clw   MEMBER() — mentions GlobalCount                          (must NOT be found)
 *   ctLinked.inc    ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')
 *   ctLinked.clw    MEMBER('main.clw'), LINK-only — uses GlobalCount        (must be found, via #522/#523)
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

suite('FAR on PROGRAM globals reaches named MEMBER modules only (#524)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'main.clw': [
            '  PROGRAM',                              // 0
            "  INCLUDE('globals.inc'),ONCE",          // 1
            "  INCLUDE('ctLinked.inc'),ONCE",         // 2
            '  MAP',                                  // 3
            "    MODULE('worker.clw')",               // 4
            '      Work PROCEDURE()',                 // 5
            '    END',                                // 6
            "    MODULE('universal.clw')",            // 7
            '      Uni PROCEDURE()',                  // 8
            '    END',                                // 9
            '  END',                                  // 10
            'GlobalCount LONG',                       // 11 — PROGRAM global
            'Obj  ctLinked',                          // 12
            '  CODE',                                 // 13
            '  GlobalCount = 1',                      // 14
            '  Work()',                               // 15
        ].join('\r\n'),
        'globals.inc': [
            'IncGlobal LONG',                         // 0 — global by inclusion at PROGRAM level
        ].join('\r\n'),
        'worker.clw': [
            "  MEMBER('main.clw')",                   // 0
            '  MAP',                                  // 1
            '  END',                                  // 2
            'ModuleData LONG',                        // 3 — module data, visible here only
            'Work PROCEDURE()',                       // 4
            '  CODE',                                 // 5
            '  GlobalCount += 1',                     // 6 — global use in a named member
            '  IncGlobal = GlobalCount',              // 7 — included-global use
            '  ModuleData = 2',                       // 8
        ].join('\r\n'),
        'universal.clw': [
            '  MEMBER()',                             // 0 — universal module: sees no globals
            '  MAP',                                  // 1
            '    Uni PROCEDURE()',                    // 2
            '  END',                                  // 3
            'GlobalCount LONG',                       // 4 — its OWN module data, same name
            'Uni PROCEDURE()',                        // 5
            '  CODE',                                 // 6
            '  GlobalCount = 9',                      // 7 — refers to line 4, not the PROGRAM global
        ].join('\r\n'),
        'ctLinked.inc': [
            "ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')",  // 0
            'Init       PROCEDURE()',                                             // 1
            '         END',                                                       // 2
        ].join('\r\n'),
        'ctLinked.clw': [
            "  MEMBER('main.clw')",                   // 0 — named: sees the PROGRAM globals
            "  INCLUDE('ctLinked.inc'),ONCE",         // 1
            '  MAP',                                  // 2
            '  END',                                  // 3
            'ctLinked.Init PROCEDURE()',              // 4
            '  CODE',                                 // 5
            '  GlobalCount = 3',                      // 6 — global use in a LINK-only member
        ].join('\r\n'),
    };
    const seeds = ['main.clw', 'worker.clw', 'universal.clw'];

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far524-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            // Only the PROGRAM file and the .inc are "open"; the members are found on disk.
            if (rel === 'main.clw' || rel === 'globals.inc') tc.getTokens(doc);
            docs.set(rel, doc);
        }
        const project = new ClarionProjectServer('Globals524', 'app', dir, '{GLOB-524}');
        for (const rel of seeds) project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
        const projects = [project];
        const findProjectForFile = (fp: string) => {
            const norm = path.normalize(fp).toLowerCase();
            if (norm.startsWith(path.normalize(dir).toLowerCase() + path.sep)) return project;
            const base = path.basename(norm);
            return projects.find(p => p.sourceFiles.some(sf => sf.name.toLowerCase() === base));
        };
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects },
            findProjectForFile,
            getProjectPathForFile: (fp: string) => findProjectForFile(fp)?.path ?? path.dirname(fp),
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        const seedPaths = seeds.map(rel => path.join(dir, rel));
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

    test('a PROGRAM global is found in a MEMBER(program) module and in a LINK-only MEMBER(program) class file', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('main.clw')!, { line: 11, character: 2 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('main.clw:14'), `use in the PROGRAM file; got [${got.join(', ')}]`);
        assert.ok(got.includes('worker.clw:6'), `use in the named MEMBER module; got [${got.join(', ')}]`);
        assert.ok(got.includes('worker.clw:7'), `second use in the named MEMBER module; got [${got.join(', ')}]`);
        assert.ok(got.includes('ctlinked.clw:6'), `use in the LINK-only MEMBER(program) class file; got [${got.join(', ')}]`);
    });

    test('a bare MEMBER() universal module is not searched for a PROGRAM global', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('main.clw')!, { line: 11, character: 2 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(!got.some(k => k.startsWith('universal.clw')),
            `the universal module has its own GlobalCount and cannot see the PROGRAM's; got [${got.join(', ')}]`);
    });

    test('a global declared in an .inc the PROGRAM includes is found in the named MEMBER module', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('globals.inc')!, { line: 0, character: 2 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('worker.clw:7'), `IncGlobal use in the named MEMBER module; got [${got.join(', ')}]`);
    });

    test('module data declared in a MEMBER module stays module-local', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('worker.clw')!, { line: 3, character: 2 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.deepStrictEqual(got.filter(k => !k.startsWith('worker.clw')), [],
            `ModuleData must only be reported inside worker.clw; got [${got.join(', ')}]`);
        assert.ok(got.includes('worker.clw:8'), `its use inside the module; got [${got.join(', ')}]`);
    });
});
