/**
 * #483 — two projects in one solution declare the same procedure name. From a
 * call site in project A, hover and Find All References resolved to project B's
 * procedure while F12 / Ctrl+F12 correctly stayed in A.
 *
 * The shape that triggers it, reproduced from app1.sln (app1 vs lib1):
 *   - A prototypes the procedure in its PROGRAM's own MAP, inside a
 *     MODULE('forms_a.clw') block. The structure-declaration index only scans
 *     .inc/.equ files, so A's prototype is NEVER indexed.
 *   - B prototypes the same name in a module-callout INC (`FORMS_B.INC`), which
 *     IS indexed — and, because both projects' sources share redirection paths,
 *     it lands in A's index too.
 *   - So the index reports exactly ONE hit for the name: B's. The #362 "unique
 *     hit is safe" fast paths (MapProcedureResolver for hover, SymbolFinderService
 *     for FAR) trusted it without asking whether the calling file can reach it.
 *
 * A hit is only a valid answer for a caller that can reach the declaring file
 * through its own MAP / INCLUDE / MEMBER chain. B's INC is included only by B's
 * modules, whose PROGRAM is b.clw — never by anything under a.clw.
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
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('Cross-project same-named procedure (#483)', () => {
    let root: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    const docs = new Map<string, TextDocument>();

    // Project A (app1-like): prototype lives in the PROGRAM's own MAP — not indexed.
    const aFiles: { [rel: string]: string } = {
        'a.clw': [
            '  PROGRAM',                                      // 0
            '  MAP',                                          // 1
            "    MODULE('caller_a.clw')",                     // 2
            'CallerA PROCEDURE',                              // 3
            '    END',                                        // 4
            "    MODULE('forms_a.clw')",                      // 5
            'Forms1099Misc PROCEDURE',                        // 6 — A's prototype
            '    END',                                        // 7
            '  END',                                          // 8
            '  CODE',                                         // 9
            '  CallerA',                                      // 10
        ].join('\r\n'),
        'caller_a.clw': [
            "  MEMBER('a.clw')",                              // 0
            '  MAP',                                          // 1
            '  END',                                          // 2
            'CallerA PROCEDURE',                              // 3
            '  CODE',                                         // 4
            '  START(Forms1099Misc, 25000)',                  // 5 — A's call site
            '  RETURN',                                       // 6
        ].join('\r\n'),
        'forms_a.clw': [
            "  MEMBER('a.clw')",                              // 0
            '  MAP',                                          // 1
            '  END',                                          // 2
            'Forms1099Misc PROCEDURE',                        // 3 — A's implementation
            '  CODE',                                         // 4
            '  RETURN',                                       // 5
        ].join('\r\n'),
    };

    // Project B (lib1-like): module-callout INC — indexed, and visible to A's index too.
    const bFiles: { [rel: string]: string } = {
        'b.clw': [
            '  PROGRAM',                                      // 0
            '  MAP',                                          // 1
            "    INCLUDE('FORMS_B.INC'),ONCE",                // 2
            "    MODULE('main_b.clw')",                       // 3
            'MainB PROCEDURE',                                // 4
            '    END',                                        // 5
            '  END',                                          // 6
            '  CODE',                                         // 7
            '  MainB',                                        // 8
        ].join('\r\n'),
        'FORMS_B.INC': [
            "  MODULE('FORMS_B.CLW')",                        // 0
            'Forms1099Misc PROCEDURE',                        // 1 — B's prototype (the only indexed one)
            '  END',                                          // 2
        ].join('\r\n'),
        'forms_b.clw': [
            "  MEMBER('b.clw')",                              // 0
            '  MAP',                                          // 1
            "    INCLUDE('FORMS_B.INC'),ONCE",                // 2
            '  END',                                          // 3
            'Forms1099Misc PROCEDURE',                        // 4 — B's implementation
            '  CODE',                                         // 5
            '  RETURN',                                       // 6
        ].join('\r\n'),
        'main_b.clw': [
            "  MEMBER('b.clw')",                              // 0
            '  MAP',                                          // 1
            "    INCLUDE('FORMS_B.INC'),ONCE",                // 2
            '  END',                                          // 3
            'MainB PROCEDURE',                                // 4
            '  CODE',                                         // 5
            '  START(Forms1099Misc, 25000)',                  // 6 — B's call site (control)
            '  RETURN',                                       // 7
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'xproj483-'));
        const aDir = path.join(root, 'A');
        const bDir = path.join(root, 'B');
        fs.mkdirSync(aDir, { recursive: true });
        fs.mkdirSync(bDir, { recursive: true });

        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        const paths: string[] = [];
        const write = (baseDir: string, map: { [rel: string]: string }) => {
            for (const [rel, content] of Object.entries(map)) {
                const p = path.join(baseDir, rel);
                fs.writeFileSync(p, content);
                paths.push(p);
                const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
                tc.getTokens(doc);
                docs.set(rel, doc);
            }
        };
        write(bDir, bFiles);
        write(aDir, aFiles);

        // B FIRST, as lib1 sorts before app1 — any first-hit hunt lands on B.
        const pB = new ClarionProjectServer('B', 'app', bDir, '{B-483}');
        for (const rel of Object.keys(bFiles)) pB.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pB));
        const pA = new ClarionProjectServer('A', 'app', aDir, '{A-483}');
        for (const rel of Object.keys(aFiles)) pA.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pA));
        const projects = [pB, pA];
        const findProjectForFile = (fp: string) => {
            const norm = path.normalize(fp).toLowerCase();
            const byPath = projects.find(p => norm.startsWith(path.normalize(p.path).toLowerCase() + path.sep));
            if (byPath) return byPath;
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
        await FileRelationshipGraph.getInstance().buildInBackground(paths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(paths);

        // Shared search paths, as in a generated multi-app solution whose sources all
        // sit in one redirected folder: B's INC is indexed for BOTH projects, A's
        // PROGRAM-MAP prototype for neither (the SDI scans .inc/.equ only).
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [bDir, aDir];
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().buildIndex(bDir);
        await StructureDeclarationIndexer.getInstance().buildIndex(aDir);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        StructureDeclarationIndexer.getInstance().clearCache();
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    function keyed(refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): string[] {
        return (refs ?? []).map(r =>
            `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`).sort();
    }

    function hoverText(h: { contents: unknown } | null | undefined): string {
        if (!h) return '';
        const c = h.contents as { value?: string } | string;
        return typeof c === 'string' ? c : (c.value ?? JSON.stringify(c));
    }

    test('precondition: the index holds B\'s INC prototype — the hit the callers used to trust blindly', () => {
        // Originally the ONLY indexed hit (the SDI scanned .inc/.equ alone). Since the
        // #483 follow-up indexes PROGRAM-file MAPs, A's prototype is indexed too and
        // the resolvers must choose by reachability, not by uniqueness — the
        // behavioural tests below cover both states.
        const hits = StructureDeclarationIndexer.getInstance().findProcedure('Forms1099Misc');
        assert.ok(hits.some(h => path.basename(h.filePath).toLowerCase() === 'forms_b.inc'),
            `B's INC prototype must be indexed; got [${hits.map(h => path.basename(h.filePath)).join(', ')}]`);
    });

    test('F12 from A\'s call site stays in A (control — already correct)', async () => {
        const def = await new DefinitionProvider().provideDefinition(docs.get('caller_a.clw')!, { line: 5, character: 10 });
        const got = keyed(Array.isArray(def) ? def : def ? [def as { uri: string; range: { start: { line: number } } }] : []);
        assert.deepStrictEqual(got, ['a.clw:6'], `F12 must land on A's prototype; got [${got.join(', ')}]`);
    });

    test('hover on A\'s call site links A\'s prototype and body, never B\'s', async () => {
        const h = await new HoverProvider().provideHover(docs.get('caller_a.clw')!, { line: 5, character: 10 });
        const text = hoverText(h).toLowerCase();
        assert.ok(text.includes('forms1099misc'), `expected a procedure card; got: ${text.slice(0, 200)}`);
        assert.ok(!text.includes('forms_b'), `hover must not link B's INC/CLW; got: ${text}`);
        assert.ok(text.includes('a.clw') && text.includes('forms_a.clw'),
            `hover must link a.clw (prototype) and forms_a.clw (body); got: ${text}`);
    });

    test('FAR from A\'s call site returns A\'s call site, prototype and body — nothing from B', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('caller_a.clw')!, { line: 5, character: 10 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('caller_a.clw:5'), `the call site under the cursor must be listed; got [${got.join(', ')}]`);
        assert.ok(got.includes('a.clw:6'), `A's MAP prototype; got [${got.join(', ')}]`);
        assert.ok(got.includes('forms_a.clw:3'), `A's implementation; got [${got.join(', ')}]`);
        assert.ok(!got.some(k => k.includes('_b.') || k.includes('forms_b')),
            `B's same-named family must not leak in; got [${got.join(', ')}]`);
    });

    test('control: FAR from B\'s call site returns B\'s family only', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('main_b.clw')!, { line: 6, character: 10 }, { includeDeclaration: true });
        const got = keyed(refs);
        assert.ok(got.includes('main_b.clw:6'), `B's call site; got [${got.join(', ')}]`);
        assert.ok(got.includes('forms_b.inc:1'), `B's INC prototype; got [${got.join(', ')}]`);
        assert.ok(got.includes('forms_b.clw:4'), `B's implementation; got [${got.join(', ')}]`);
        assert.ok(!got.some(k => k.includes('_a.')), `nothing from A; got [${got.join(', ')}]`);
    });

    test('control: hover on B\'s call site links B\'s INC and body', async () => {
        const h = await new HoverProvider().provideHover(docs.get('main_b.clw')!, { line: 6, character: 10 });
        const text = hoverText(h).toLowerCase();
        assert.ok(text.includes('forms_b'), `hover must link B's family; got: ${text}`);
        assert.ok(!text.includes('forms_a'), `hover must not link A; got: ${text}`);
    });
});
