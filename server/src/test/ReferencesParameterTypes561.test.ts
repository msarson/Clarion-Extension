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

/**
 * #561 — Find All References on a class listed fields, variables and the declaration, but not
 * parameter types: `Init PROCEDURE(*ctThing pThing)` in the class declaration and
 * `ctWalls.Init PROCEDURE(*ctThing pThing)` in its implementation were missing, from the
 * declaration and from a type cursor alike. A parameter type is a use of the type.
 * Same fixture as #560.
 */
suite('Find All References on a class lists parameter types (#561)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string[] } = {
        'prog.clw': ['  PROGRAM', "  INCLUDE('thing.inc'),ONCE", "  INCLUDE('walls.inc'),ONCE", '  MAP', '  END', '  CODE'],
        'thing.inc': [
            "ctThing   CLASS,TYPE,MODULE('thing.clw'),LINK('thing.clw')",   // 0
            'Kick        PROCEDURE()',                                       // 1
            '          END',                                                 // 2
        ],
        'walls.inc': [
            "ctWalls   CLASS,TYPE,MODULE('walls.clw'),LINK('walls.clw')",   // 0
            'Metric      LONG',                                              // 1
            'ViewMetric  &ctThing !<-- injected',                            // 2
            'Init        PROCEDURE(*ctThing pThing)',                        // 3
            '          END',                                                 // 4
        ],
        'walls.clw': [
            "  MEMBER('prog')",                                              // 0
            '  MAP',                                                         // 1
            '  END',                                                         // 2
            'ctWalls.Init PROCEDURE(*ctThing pThing)',                       // 3
            'Spare       ctThing',                                           // 4 — a local of the method
            '  CODE',                                                        // 5
            '  SELF.ViewMetric &= pThing',                                   // 6
            '  RETURN',                                                      // 7
        ],
        'thing.clw': ["  MEMBER('prog')", '  MAP', '  END', 'ctThing.Kick PROCEDURE()', '  CODE', '  RETURN'],
        'solo.clw': ["  MEMBER('prog')", '  MAP', 'Solo        PROCEDURE(*ctThing p)', '  END'],  // the only use is a pointer parameter
        'protos.clw': [
            "  MEMBER('prog')",                                              // 0
            '  MAP',                                                         // 1
            'OptPtr      PROCEDURE(<*ctThing pThing>)',                      // 2
            'ByRef       PROCEDURE(&ctThing pThing)',                        // 3
            'Unnamed     PROCEDURE(*ctThing)',                               // 4
            'Spaced      PROCEDURE(* ctThing pThing)',                       // 5
            'Two         PROCEDURE(<ctThing pThing>, *ctThing q)',           // 6
            'Longer      PROCEDURE(*ctThingy pThing)',                       // 7
            'Plain       PROCEDURE(ctThing pThing, LONG n)',                 // 8 — a CLASS passes by address with or without the star
            '  END',                                                         // 9
        ],
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paramtype561-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        const project = new ClarionProjectServer('prog', 'app', dir, '{PROG-561}');
        const seeds: string[] = [];
        for (const [rel, lines] of Object.entries(files)) {
            const p = path.join(dir, rel);
            const text = lines.join('\r\n');
            fs.writeFileSync(p, text);
            project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
            seeds.push(p);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, text);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getProjectCwprojForFile: () => null,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seeds);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seeds);
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().getOrBuildIndex(dir);
    });

    teardown(async () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        await (sdi as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        sdi.clearCache();
        serverSettings.redirectionFile = savedRed;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    const refs = async (file: string, line: number, word: string, occurrence = 0) => {
        const doc = docs.get(file)!;
        const text = doc.getText().split(/\r?\n/)[line];
        let at = -1;
        for (let i = 0; i <= occurrence; i++) at = text.indexOf(word, at + 1);
        const locs = await new ReferencesProvider().provideReferences(doc, { line, character: at + 1 }, { includeDeclaration: true });
        return (locs ?? []).map(l => `${path.basename(decodeURIComponent(l.uri)).toLowerCase()}:${l.range.start.line}`).sort();
    };

    test('precondition: the fields, the local and the declaration are listed', async () => {
        const hits = await refs('thing.inc', 0, 'ctThing');
        for (const expected of ['thing.inc:0', 'walls.inc:2', 'walls.clw:4']) {
            assert.ok(hits.includes(expected), `${expected} listed: ${JSON.stringify(hits)}`);
        }
    });

    test('the parameter type in the method prototype of the class declaration is listed', async () => {
        const hits = await refs('thing.inc', 0, 'ctThing');
        assert.ok(hits.includes('walls.inc:3'), JSON.stringify(hits));
    });

    test('the parameter type in the method implementation is listed', async () => {
        const hits = await refs('thing.inc', 0, 'ctThing');
        assert.ok(hits.includes('walls.clw:3'), JSON.stringify(hits));
    });

    test('from a parameter-type cursor, the same list as from the declaration', async () => {
        assert.deepStrictEqual(await refs('walls.inc', 3, 'ctThing'), await refs('thing.inc', 0, 'ctThing'));
    });

    test('every spelling of a parameter type in a MAP prototype is listed, once per use', async () => {
        const hits = await refs('thing.inc', 0, 'ctThing');
        const count = (line: number) => hits.filter(h => h === `protos.clw:${line}`).length;
        assert.deepStrictEqual([2, 3, 4, 5, 6, 7].map(count), [1, 1, 1, 1, 2, 0], JSON.stringify(hits));
    });

    test('the same parameter written without the star is listed too', async () => {
        // A complex type is always passed by address, so PROCEDURE(ctThing p) and
        // PROCEDURE(*ctThing p) declare the same parameter; both spellings are uses of the class.
        const hits = await refs('thing.inc', 0, 'ctThing');
        assert.strictEqual(hits.filter(h => h === 'protos.clw:8').length, 1, JSON.stringify(hits));
    });

    test('a module whose only use is a pointer parameter is searched, not skipped by the index pre-filter', async () => {
        const hits = await refs('thing.inc', 0, 'ctThing');
        assert.ok(hits.includes('solo.clw:2'), JSON.stringify(hits));
    });

    test('the match covers the type name only, not the pointer star', async () => {
        const doc = docs.get('protos.clw')!;
        const locs = await new ReferencesProvider().provideReferences(docs.get('thing.inc')!, { line: 0, character: 1 }, { includeDeclaration: true });
        const onLine = (line: number) => (locs ?? []).filter(l => l.uri === doc.uri && l.range.start.line === line)
            .map(l => doc.getText().split(/\r?\n/)[line].slice(l.range.start.character, l.range.end.character));
        assert.deepStrictEqual(onLine(5), ['ctThing']);
        assert.deepStrictEqual(onLine(2), ['ctThing']);
    });

    test('the parameter name is not listed as a use of the class', async () => {
        const hits = await refs('thing.inc', 0, 'ctThing');
        const lines = (file: string, line: number) => hits.filter(h => h === `${file}:${line}`).length;
        assert.ok(lines('walls.inc', 3) <= 1 && lines('walls.clw', 3) <= 1, JSON.stringify(hits));
    });
});
