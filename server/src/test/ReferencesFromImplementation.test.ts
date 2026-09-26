/**
 * FAR asked from a procedure's IMPLEMENTATION label in a MEMBER module returned only that label.
 *
 * The PROGRAM's MAP declares `Target` inside `MODULE('impl.clw')`; `caller.clw` calls it directly
 * and through `START(Target, 25000)`. From the MAP line or either call site, FAR answers all four
 * places. From `Target PROCEDURE` in impl.clw it answered one:
 *
 *     [FAR] Scope="module" (MAP procedure) -> searching 1 file(s)
 *
 * findSymbol resolves the implementation label as its own module-scope declaration, and the
 * module-procedure branch of getFilesToSearch widens only through the declaring file's forward
 * MODULE edges and its includers. An implementation module has neither: the edge runs the other
 * way, from the PROGRAM's MAP to it. Go to Definition from the same label already follows that
 * edge back (CrossFileResolver.findMapDeclarationInMemberFile); FAR now does the same and searches
 * with the MAP declaration, so #602's PROGRAM-MAP widening applies from this end too.
 *
 * The control is a procedure declared in the MEMBER module's own MAP: a MEMBER MAP makes it
 * available only within that module, so FAR from its implementation must stay in that module.
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
import { RenameProvider } from '../providers/RenameProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('FAR from a procedure implementation in a MEMBER module', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'prog.clw': [
            '   PROGRAM',                        // 0
            '',                                  // 1
            '   MAP',                            // 2
            "     MODULE('caller.clw')",         // 3
            '       Main',                       // 4
            '     END',                          // 5
            "     MODULE('impl.clw')",           // 6
            '       Target',                     // 7
            '     END',                          // 8
            '   END',                            // 9
            '',                                  // 10
            '  CODE',                            // 11
            '  Main()',                          // 12
        ].join('\r\n'),
        'caller.clw': [
            "   MEMBER('prog.clw')",             // 0
            '',                                  // 1
            'Main PROCEDURE',                    // 2
            '  CODE',                            // 3
            '  Target()',                        // 4
            '  START(Target, 25000)',            // 5
        ].join('\r\n'),
        'impl.clw': [
            "   MEMBER('prog.clw')",             // 0
            '',                                  // 1
            '   MAP',                            // 2
            '     Helper',                       // 3  MEMBER-module MAP: this module only
            '   END',                            // 4
            '',                                  // 5
            'Target PROCEDURE',                  // 6
            '  CODE',                            // 7
            '  Helper()',                        // 8
            '  RETURN',                          // 9
            '',                                  // 10
            'Helper PROCEDURE',                  // 11
            '  CODE',                            // 12
            '  RETURN',                          // 13
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farimpl-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const full = path.join(dir, rel);
            fs.writeFileSync(full, content);
            const doc = TextDocument.create('file:///' + full.split(path.sep).join('/'), 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        const project = new ClarionProjectServer('prog', 'app', dir, '{FAR-IMPL}');
        for (const rel of Object.keys(files)) project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        const seedPaths = Object.keys(files).map(rel => path.join(dir, rel));
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

    async function far(rel: string, line: number, character: number) {
        return new ReferencesProvider().provideReferences(docs.get(rel)!, { line, character }, { includeDeclaration: true });
    }

    const ALL_TARGET = ['caller.clw:4', 'caller.clw:5', 'impl.clw:6', 'prog.clw:7'];

    test('control: from the PROGRAM MAP line, all four places', async () => {
        assert.deepStrictEqual(keyed(await far('prog.clw', 7, 8)), ALL_TARGET);
    });

    test('control: from the START argument, all four places', async () => {
        assert.deepStrictEqual(keyed(await far('caller.clw', 5, 9)), ALL_TARGET);
    });

    test('from the implementation label, all four places', async () => {
        assert.deepStrictEqual(keyed(await far('impl.clw', 6, 0)), ALL_TARGET);
    });

    test('Rename from the implementation label renames the prototype and both calls', async () => {
        const edit = await new RenameProvider().provideRename(docs.get('impl.clw')!, { line: 6, character: 0 }, 'Renamed');
        const got: string[] = [];
        for (const dc of (edit?.documentChanges ?? []) as { textDocument: { uri: string }; edits: { range: { start: { line: number } } }[] }[]) {
            for (const e of dc.edits) got.push(`${path.basename(decodeURIComponent(dc.textDocument.uri)).toLowerCase()}:${e.range.start.line}`);
        }
        assert.deepStrictEqual(got.sort(), ALL_TARGET);
    });

    test('control: a procedure declared in the MEMBER module\'s own MAP stays in that module', async () => {
        const refs = keyed(await far('impl.clw', 11, 0));
        assert.deepStrictEqual(refs, ['impl.clw:11', 'impl.clw:3', 'impl.clw:8'].sort(),
            `a MEMBER-MAP procedure is available only within its module, got ${JSON.stringify(refs)}`);
    });
});
