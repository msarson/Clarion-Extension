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
import { ScopeTypeIndexService } from '../services/ScopeTypeIndexService';

/**
 * #550 — Find All References for a class method found a call site in another MEMBER
 * module only when the cursor was in that module. From the implementation, or from the
 * PROGRAM file's call site, browse.clw's `Obj.Method()` was missing — so a rename started
 * at the implementation left a hand-coded caller elsewhere unrenamed, and the #527 report
 * could not list a generated module's calls.
 *
 * Same fixture as the #528 rename suite: a PROGRAM (app1.clw) with an object of a class
 * declared in ctThing.inc / implemented in ctThing.clw, and a second MEMBER module
 * (browse.clw) calling the method.
 */
suite('Class-method references reach every MEMBER module of the program (#550)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'app1.clw': [
            '  PROGRAM',                                  // 0
            "  INCLUDE('ctThing.inc'),ONCE",              // 1
            '  MAP',                                      // 2
            "    MODULE('browse.clw')",                   // 3
            '      Browse PROCEDURE()',                   // 4
            '    END',                                    // 5
            '  END',                                      // 6
            'Obj  ctThing',                               // 7
            '  CODE',                                     // 8
            '  Obj.Method()',                             // 9
        ].join('\r\n'),
        'ctThing.inc': [
            "ctThing CLASS,TYPE,MODULE('ctThing.clw'),LINK('ctThing.clw')",  // 0
            'Method     PROCEDURE()',                                       // 1
            '         END',                                                 // 2
        ].join('\r\n'),
        // The implementation is a bare MEMBER(), as a shipped accessory class is
        // (NYSTemplateHelper.CLW): it belongs to NO program, so a global scope loaded for
        // the cursor's program is empty there — the real-solution shape of the bug.
        'ctThing.clw': [
            '  MEMBER()',                                 // 0
            "  INCLUDE('ctThing.inc'),ONCE",              // 1
            '  MAP',                                      // 2
            '  END',                                      // 3
            'ctThing.Method PROCEDURE()',                 // 4
            '  CODE',                                     // 5
            '  RETURN',                                   // 6
        ].join('\r\n'),
        'browse.clw': [
            "  MEMBER('app1.clw')",                        // 0
            '  MAP',                                      // 1
            '  END',                                      // 2
            'Browse PROCEDURE()',                         // 3
            '  CODE',                                     // 4
            '  Obj.Method()',                             // 5
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refs550-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        ExpExportIndex.getInstance().reset();
        docs.clear();
        const project = new ClarionProjectServer('app1', 'app', dir, '{APP1-550}');
        const seedPaths: string[] = [];
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
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

    const hits = async (file: string, line: number, character: number): Promise<string[]> => {
        const locs = await new ReferencesProvider().provideReferences(docs.get(file)!, { line, character }, { includeDeclaration: true });
        return (locs ?? []).map(l => `${path.basename(decodeURIComponent(l.uri)).toLowerCase()}:${l.range.start.line}`).sort();
    };
    const EXPECTED = ['app1.clw:9', 'browse.clw:5', 'ctthing.clw:4', 'ctthing.inc:1'];

    test('control: from the call site in the other MEMBER module, every site is found', async () => {
        assert.deepStrictEqual(await hits('browse.clw', 5, 8), EXPECTED);
    });

    test('bug-pin: from the implementation, the call in the other MEMBER module is found', async () => {
        assert.deepStrictEqual(await hits('ctThing.clw', 4, 9), EXPECTED);
    });

    test('bug-pin: from the PROGRAM file call site, the call in the other MEMBER module is found', async () => {
        assert.deepStrictEqual(await hits('app1.clw', 9, 8), EXPECTED);
    });

    test('a program\'s global scope is built once per token array, not once per scanned module', () => {
        const svc = new ScopeTypeIndexService(TokenCache.getInstance());
        const first = svc.loadGlobalScopeFromProgramFile(docs.get('app1.clw')!.uri);
        const second = svc.loadGlobalScopeFromProgramFile(docs.get('app1.clw')!.uri);
        assert.strictEqual(second, first, 'the same Map instance comes back while the tokens are unchanged');
        assert.ok(first.has('obj'), 'and it is the real scope: Obj is a PROGRAM global');
    });
});
