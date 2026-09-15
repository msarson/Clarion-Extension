/**
 * #523 — find-all-references must search a class implementation that is compiled
 * through LINK() and is therefore NOT a .cwproj Compile item.
 *
 * #522 gave such files a node in the file graph (they are reached through the CLASS
 * MODULE edge of the .inc that declares them). The references search set, however,
 * was still built from `project.sourceFiles` — the .cwproj lists — so the
 * implementation file, and every call made inside it, stayed invisible to FAR and
 * rename.
 *
 * Layout (one project; main.clw is the only source-file item, exactly as the
 * LinkedClassTest fixture and the #470 report):
 *
 *   main.clw        seed — INCLUDE ctLinked.inc, `Obj.Kill()` call site
 *   ctLinked.inc    ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')
 *   ctLinked.clw    implementation — `ctLinked.Kill PROCEDURE()` and a `SELF.Kill()` call
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

suite('FAR reaches a LINK-only class implementation (#523)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'main.clw': [
            '  PROGRAM',                              // 0
            "  INCLUDE('ctLinked.inc'),ONCE",         // 1
            '  MAP',                                  // 2
            '    Helper PROCEDURE()',                 // 3 — global procedure declaration
            '  END',                                  // 4
            'GlobalCount LONG',                       // 5 — global variable (PROGRAM data: FAR keeps it file-local by design, not a #523 case)
            'Obj  ctLinked',                          // 6
            '  CODE',                                 // 7
            '  Obj.Init()',                           // 8
            '  Obj.Kill()',                           // 9 — call site in the seed
            'Helper PROCEDURE()',                     // 10 — implementation
            '  CODE',                                 // 11
            '  GlobalCount += 1',                     // 12
        ].join('\r\n'),
        'ctLinked.inc': [
            "ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')",  // 0
            'Count      LONG',                                                    // 1
            'Init       PROCEDURE()',                                             // 2
            'Kill       PROCEDURE()',                                             // 3 — declaration
            '         END',                                                       // 4
        ].join('\r\n'),
        'ctLinked.clw': [
            '  MEMBER()',                             // 0
            "  INCLUDE('ctLinked.inc'),ONCE",         // 1
            '  MAP',                                  // 2
            '  END',                                  // 3
            'ctLinked.Init PROCEDURE()',              // 4
            '  CODE',                                 // 5
            '  SELF.Count = 1',                       // 6
            '  SELF.Kill()',                          // 7 — call site inside the LINK-only file
            'ctLinked.Kill PROCEDURE()',              // 8 — implementation
            '  CODE',                                 // 9
            '  SELF.Count = 0',                       // 10
            '  Helper()',                             // 11 — global procedure called from the LINK-only file
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far523-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            // The LINK-only implementation is NOT open: FAR must find it on disk through the search set.
            if (rel !== 'ctLinked.clw') tc.getTokens(doc);
            docs.set(rel, doc);
        }
        // Only main.clw is a .cwproj item — the class files are compiled via LINK().
        const project = new ClarionProjectServer('LinkedClassTest', 'app', dir, '{LINK-523}');
        project.sourceFiles.push(new ClarionSourcerFileServer('main.clw', 'main.clw', project));
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
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground([path.join(dir, 'main.clw')]);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground([path.join(dir, 'main.clw')]);
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

    test('the graph knows the LINK-only implementation (sanity, #522)', () => {
        assert.ok(FileRelationshipGraph.getInstance().hasNode(path.join(dir, 'ctLinked.clw')));
    });

    test('references from the method declaration in the .inc include the implementation and the call inside it', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('ctLinked.inc')!, { line: 3, character: 2 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('ctlinked.clw:8'), `implementation line in the LINK-only file; got [${got.join(', ')}]`);
        assert.ok(got.includes('ctlinked.clw:7'), `SELF.Kill() call inside the LINK-only file; got [${got.join(', ')}]`);
        assert.ok(got.includes('main.clw:9'), `Obj.Kill() call in the seed; got [${got.join(', ')}]`);
    });

    test('references from the call site in the seed reach into the LINK-only file', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('main.clw')!, { line: 9, character: 7 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('ctlinked.clw:8'), `implementation line; got [${got.join(', ')}]`);
        assert.ok(got.includes('ctlinked.clw:7'), `SELF.Kill() call; got [${got.join(', ')}]`);
    });

    test('references to a MAP procedure declared in the seed include the call inside the LINK-only file', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('main.clw')!, { line: 3, character: 6 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('ctlinked.clw:11'), `Helper() call inside the LINK-only file; got [${got.join(', ')}]`);
        assert.ok(got.includes('main.clw:10'), `Helper implementation in the seed; got [${got.join(', ')}]`);
    });
});
