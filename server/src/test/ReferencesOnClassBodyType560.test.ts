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
 * #560 — inside a CLASS body every cursor was routed as a member of that class
 * (`SELF.<word>`). On `ViewMetric &ctViewMetric` the cursor on the TYPE asked for a member
 * named ctViewMetric, found none, and returned no results. Only the line's label names a
 * member; a type, a parameter type or an attribute is resolved like any other word.
 */
suite('Find All References on a type name inside a CLASS body (#560)', () => {
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
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bodytype560-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        const project = new ClarionProjectServer('prog', 'app', dir, '{PROG-560}');
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

    test('bug-pin: cursor on the type of a reference field finds the class', async () => {
        const hits = await refs('walls.inc', 2, 'ctThing');
        assert.ok(hits.includes('thing.inc:0'), `declaration listed: ${JSON.stringify(hits)}`);
        assert.ok(hits.includes('walls.clw:4'), `a use in a module listed: ${JSON.stringify(hits)}`);
    });

    test('cursor on a parameter type in a method prototype finds the class', async () => {
        const hits = await refs('walls.inc', 3, 'ctThing');
        assert.ok(hits.includes('thing.inc:0'), JSON.stringify(hits));
    });

    test('from the type and from the declaration, the same list', async () => {
        assert.deepStrictEqual(await refs('walls.inc', 2, 'ctThing'), await refs('thing.inc', 0, 'ctThing'));
    });

    test('cursor on the field label still lists the member\'s uses', async () => {
        const hits = await refs('walls.inc', 2, 'ViewMetric');
        assert.ok(hits.includes('walls.inc:2'), JSON.stringify(hits));
        assert.ok(hits.includes('walls.clw:6'), JSON.stringify(hits));
    });
});
