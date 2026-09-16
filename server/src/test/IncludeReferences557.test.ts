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
import { serverSettings } from '../serverSettings';

/**
 * #557 — "which file pulls this include into global scope?" Find All References on the
 * type name lists uses of the name; an INCLUDE line never mentions it, so the global
 * include stayed invisible. Cursor on an `INCLUDE('file')` line now lists every INCLUDE
 * of that same file across the solution — direct includers first, then theirs, so the
 * PROGRAM that carries it appears — from the file graph's reverse INCLUDE edges. An
 * include inside a conditional COMPILE block counts like any other.
 */
suite('Find All References on an INCLUDE line lists every includer (#557)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'prog.clw': [
            '  PROGRAM',                           // 0
            "  COMPILE('**flag**', SomeFlag)",     // 1
            "  INCLUDE('lib.inc'),ONCE",           // 2 — inside a conditional block
            '  !**flag**',                         // 3
            '  MAP',                               // 4
            "    MODULE('mod.clw')",               // 5
            '      Modder PROCEDURE()',            // 6
            '    END',                             // 7
            '  END',                               // 8
            '  CODE',                              // 9
        ].join('\r\n'),
        'lib.inc': [
            'ctThing CLASS,TYPE',                  // 0
            'Method     PROCEDURE()',              // 1
            '         END',                        // 2
        ].join('\r\n'),
        'mod.clw': [
            "  MEMBER('prog.clw')",                // 0
            "  INCLUDE('lib.inc'),ONCE",           // 1
            '  MAP',                               // 2
            '  END',                               // 3
            'Modder PROCEDURE()',                  // 4
            '  CODE',                              // 5
            '  RETURN',                            // 6
        ].join('\r\n'),
        'other.clw': [
            "  MEMBER('prog.clw')",                // 0
            "  INCLUDE('unrelated.inc'),ONCE",     // 1
            '  MAP',                               // 2
            '  END',                               // 3
        ].join('\r\n'),
        'unrelated.inc': ['ctOther CLASS,TYPE', '         END'].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'Clarion110.red';
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'increfs557-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        const project = new ClarionProjectServer('prog', 'app', dir, '{PROG-557}');
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
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        serverSettings.redirectionFile = savedRed;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const hits = async (file: string, line: number, character: number): Promise<string[]> => {
        const locs = await new ReferencesProvider().provideReferences(docs.get(file)!, { line, character }, { includeDeclaration: true });
        return (locs ?? []).map(l => `${path.basename(decodeURIComponent(l.uri)).toLowerCase()}:${l.range.start.line}`).sort();
    };
    const BOTH_INCLUDES = ['mod.clw:1', 'prog.clw:2'];

    test('bug-pin: from the module\'s INCLUDE line, the PROGRAM\'s include inside a COMPILE block is listed', async () => {
        assert.deepStrictEqual(await hits('mod.clw', 1, 4), BOTH_INCLUDES);
    });

    test('the cursor may be on the file name inside the quotes', async () => {
        assert.deepStrictEqual(await hits('mod.clw', 1, 14), BOTH_INCLUDES);
    });

    test('from the PROGRAM\'s INCLUDE line, the module\'s include is listed', async () => {
        assert.deepStrictEqual(await hits('prog.clw', 2, 4), BOTH_INCLUDES);
    });

    test('an INCLUDE of a different file is not mixed in', async () => {
        assert.deepStrictEqual(await hits('other.clw', 1, 4), ['other.clw:1']);
    });

    test('the range covers the file name inside the quotes', async () => {
        const locs = await new ReferencesProvider().provideReferences(docs.get('mod.clw')!, { line: 1, character: 4 }, { includeDeclaration: true });
        const mod = (locs ?? []).find(l => /mod\.clw$/i.test(decodeURIComponent(l.uri)))!;
        assert.ok(mod, 'the cursor line itself is listed');
        assert.deepStrictEqual([mod.range.start.character, mod.range.end.character], ["  INCLUDE('".length, "  INCLUDE('lib.inc".length]);
    });
});
