/**
 * FAR on a procedure prototyped in a MAP inside an .inc that the PROGRAM INCLUDEs in its global
 * data, called from MEMBER modules that get their MEMBER through an `INCLUDE('member.clw')` shim.
 *
 *     prog.clw      PROGRAM / INCLUDE('helpers.inc'),ONCE
 *     helpers.inc   MAP / MODULE('helpers.clw') / Helper(LONG),LONG / END / END
 *     helpers.clw   INCLUDE('member.clw') + INCLUDE('helpers.inc') + Helper PROCEDURE
 *     caller.clw    INCLUDE('member.clw') + a call to Helper
 *     member.clw    MEMBER('prog')          — the shim
 *     stale\helpers.inc                     — an older copy in a later .red folder
 *
 * The MAP is the PROGRAM's, so every module may call Helper, but two things kept FAR at the
 * declaring files:
 *   - from the declaration/implementation, the #602 widening asked the project for helpers.inc,
 *     which is not a project source file, and stayed at the .inc, its MODULE target and includers;
 *   - from the call site, #483's reachability check could not find caller.clw's PROGRAM (it has
 *     no MEMBER edge of its own, only the shim does), rejected the real helpers.inc, and resolved
 *     the call to the stale copy the graph never saw — one result, the stale prototype.
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

suite('FAR on a PROGRAM MAP INCLUDEd from an .inc, called from shim-headed members', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const helpersInc = [
        '  MAP',                                  // 0
        "    MODULE('helpers.clw')",              // 1
        '      Helper(LONG pValue),LONG,PROC',    // 2
        '    END',                                // 3
        '  END',                                  // 4
    ];
    const files: { [rel: string]: string } = {
        'prog.clw': [
            '  PROGRAM',                          // 0
            "  INCLUDE('helpers.inc'),ONCE",      // 1
            '  MAP',                              // 2
            '  END',                              // 3
            '  CODE',                             // 4
            '  RETURN',                           // 5
        ].join('\r\n'),
        'member.clw': "  MEMBER('prog')\r\n",
        'helpers.inc': helpersInc.join('\r\n'),
        'helpers.clw': [
            "  INCLUDE('member.clw')",            // 0
            "  INCLUDE('helpers.inc'),ONCE",      // 1
            'Helper PROCEDURE(LONG pValue)',      // 2
            '  CODE',                             // 3
            '  RETURN pValue',                    // 4
        ].join('\r\n'),
        'caller.clw': [
            "  INCLUDE('member.clw')",            // 0
            '  MAP',                              // 1
            '  END',                              // 2
            'Caller PROCEDURE()',                 // 3
            'r LONG',                             // 4
            '  CODE',                             // 5
            '  r = Helper(1)',                    // 6
            '  RETURN',                           // 7
        ].join('\r\n'),
        // An older copy one line longer, so a hit on it is visible as stale\helpers.inc:3.
        [path.join('stale', 'helpers.inc')]: ['! old copy', ...helpersInc].join('\r\n'),
    };
    // What the .cwproj lists: the .clw modules. Neither .inc is a project source file.
    const projectSources = ['prog.clw', 'helpers.clw', 'caller.clw'];

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-incmap-'));
        fs.mkdirSync(path.join(dir, 'stale'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .; stale\r\n*.clw = .; stale\r\n');
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
        const project = new ClarionProjectServer('prog', 'app', dir, '{MLS-INCMAP}');
        for (const rel of projectSources) project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
        // The real lookup's shape: a file belongs to the project only when it is a listed source.
        const findProjectForFile = (p: string) =>
            projectSources.includes(path.basename(p).toLowerCase()) ? project : undefined;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        const seedPaths = projectSources.map(rel => path.join(dir, rel));
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seedPaths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(Object.keys(files).map(rel => path.join(dir, rel)));
        // The declaration index sees both copies, the stale one first.
        serverSettings.libsrcPaths = [path.join(dir, 'stale'), dir];
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
        (refs ?? []).map(r => {
            const p = decodeURIComponent(r.uri).replace(/\\/g, '/').toLowerCase();
            const parts = p.split('/');
            const name = parts[parts.length - 2] === 'stale' ? `stale/${parts[parts.length - 1]}` : parts[parts.length - 1];
            return `${name}:${r.range.start.line}`;
        }).sort();

    async function far(rel: string, line: number, character: number) {
        return new ReferencesProvider().provideReferences(docs.get(rel)!, { line, character }, { includeDeclaration: true });
    }

    const expected = ['caller.clw:6', 'helpers.clw:2', 'helpers.inc:2'];

    test('from the implementation label, the shim-headed caller is found', async () => {
        assert.deepStrictEqual(keyed(await far('helpers.clw', 2, 2)), expected);
    });

    test('from the .inc prototype, the shim-headed caller is found', async () => {
        assert.deepStrictEqual(keyed(await far('helpers.inc', 2, 8)), expected);
    });

    test('from the call site, the real .inc wins over the stale copy', async () => {
        assert.deepStrictEqual(keyed(await far('caller.clw', 6, 8)), expected);
    });

    test('FRG: the included .inc is reachable from a shim-headed member', () => {
        const frg = FileRelationshipGraph.getInstance();
        assert.strictEqual(frg.isDeclarationReachableFrom(path.join(dir, 'helpers.inc'), path.join(dir, 'caller.clw')), true);
    });

    test('FRG: getIncludingProgramFiles names the PROGRAM, not the member that also includes it', () => {
        const got = FileRelationshipGraph.getInstance().getIncludingProgramFiles(path.join(dir, 'helpers.inc'))
            .map(p => path.basename(p).toLowerCase());
        assert.deepStrictEqual(got, ['prog.clw']);
    });
});
