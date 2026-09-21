/**
 * #522 — the file graph walks the referenced-file closure, not just the .cwproj seeds.
 *
 * The build used to scan only the files each .cwproj lists and deliberately never
 * enqueued the targets, so a class implementation compiled through LINK() (never a
 * Compile item) had no node: no document links, and invisible to every consumer that
 * starts from the graph. Measured on app1.sln (40 projects, 2,987 seeds) the closure is
 * +3,425 distinct files, 84% of them generated .inc files in the solution's own
 * folders and only 534 from libsrc + Accessory: affordable, and the mtime disk cache
 * makes warm starts near free. Issue #522 has the numbers.
 *
 * Layout (all resolved through the project's .red, with a loaded solution so the
 * no-solution per-document fallback cannot mask a miss):
 *
 *   main.clw (the only seed)
 *     └─ INCLUDE ctLinked.inc                       hop 1
 *          ├─ INCLUDE shared.inc                    hop 2
 *          │    └─ INCLUDE lib\deep.inc             hop 3 (redirected sub-folder)
 *          └─ CLASS ... MODULE('ctLinked.clw')      hop 2 (LINK-only implementation)
 *               ├─ INCLUDE member.inc               hop 3
 *               └─ INCLUDE ctLinked.inc             (already a node)
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentLinkProvider } from '../providers/DocumentLinkProvider';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { TokenCache } from '../TokenCache';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

suite('FileRelationshipGraph #522 — referenced-file closure', () => {
    let projDir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];
    const f = (name: string) => path.join(projDir, name);
    const write = (name: string, lines: string[]) => fs.writeFileSync(f(name), lines.join('\r\n') + '\r\n');

    setup(() => {
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frg522-'));
        fs.mkdirSync(f('lib'));
        write('Clarion110.red', ['[Common]', '*.inc = .;lib', '*.clw = .']);
        write('main.clw', [
            '  PROGRAM',
            "  INCLUDE('ctLinked.inc'),ONCE",
            '  MAP',
            "    MODULE('Win32')",
            '      Beep(LONG),PASCAL',
            '    END',
            '  END',
            'Obj  ctLinked',
            '  CODE',
            '  Obj.Init()',
        ]);
        write('ctLinked.inc', [
            "  INCLUDE('shared.inc'),ONCE",
            "ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')",
            'Count      LONG',
            'Init       PROCEDURE()',
            '         END',
        ]);
        write('shared.inc', ["  INCLUDE('deep.inc'),ONCE", 'SharedEq EQUATE(1)']);
        write(path.join('lib', 'deep.inc'), ['DeepEq EQUATE(2)']);
        write('member.inc', ['  MEMBER()']);
        write('ctLinked.clw', [
            "  INCLUDE('member.inc')",
            "  INCLUDE('ctLinked.inc'),ONCE",
            '  MAP',
            '  END',
            'ctLinked.Init PROCEDURE()',
            '  CODE',
            '  SELF.Count = 1',
        ]);
        const project = new ClarionProjectServer('LinkedClassTest', 'app', projDir, '{TEST-GUID-522}');
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance =
            { solution: { projects: [project] } } as unknown as SolutionManager;
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        serverSettings.redirectionFile = savedRed;
        serverSettings.libsrcPaths = savedLibsrc;
        FileRelationshipGraph.getInstance().reset();
        try { fs.rmSync(projDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const build = async () => {
        const frg = FileRelationshipGraph.getInstance();
        await frg.buildInBackground([f('main.clw')]);
        return frg;
    };
    const targets = (frg: FileRelationshipGraph, file: string, type?: string) =>
        frg.getForwardEdges(f(file)).filter(e => !type || e.type === type).map(e => path.basename(e.toFile)).sort();
    const includers = (frg: FileRelationshipGraph, file: string) =>
        frg.getIncludingFiles(f(file)).map(p => path.basename(p)).sort();

    test('every file the seed reaches, transitively, becomes a node with its own edges', async () => {
        const frg = await build();
        assert.deepStrictEqual(targets(frg, 'ctLinked.inc', 'INCLUDE'), ['shared.inc'], 'hop 1: the included .inc is scanned');
        assert.deepStrictEqual(targets(frg, 'ctLinked.inc', 'CLASS_MODULE'), ['ctlinked.clw'], 'hop 1: its CLASS MODULE edge exists');
        assert.deepStrictEqual(targets(frg, 'shared.inc', 'INCLUDE'), ['deep.inc'], 'hop 2: an include of an include is scanned');
        assert.deepStrictEqual(targets(frg, 'ctLinked.clw', 'INCLUDE'), ['ctlinked.inc', 'member.inc'],
            'hop 2: the LINK-only class implementation is scanned via its CLASS MODULE edge');
        assert.deepStrictEqual(includers(frg, path.join('lib', 'deep.inc')), ['shared.inc'],
            'hop 3: a redirected sub-folder target has its reverse edge');
    });

    test('the class-module index knows a class declared only in a reached .inc', async () => {
        const frg = await build();
        const edges = frg.getEdgesForClass('ctLinked');
        assert.strictEqual(edges.length, 1, 'one CLASS_MODULE edge for ctLinked');
        assert.strictEqual(path.basename(edges[0].fromFile), 'ctlinked.inc');
        assert.strictEqual(path.basename(edges[0].toFile), 'ctlinked.clw');
    });

    test('build stats count the closure separately from the seeds', async () => {
        const frg = await build();
        const stats = frg.lastBuildStats!;
        assert.strictEqual(stats.files, 6, 'seed + 5 closure files processed');
        assert.strictEqual(stats.closureFiles, 5, 'ctLinked.inc, shared.inc, deep.inc, ctLinked.clw, member.inc');
    });

    test('a binary MODULE target is still not a node', async () => {
        const frg = await build();
        assert.ok(!frg.getAllEdges().some(e => /win32/i.test(e.toFile)), "MODULE('Win32') must not produce an edge or a node");
    });

    test('document links appear in the LINK-only class implementation (the #470 screenshot)', async () => {
        await build();
        const clw = f('ctLinked.clw');
        const doc = TextDocument.create(toUri(clw), 'clarion', 1, fs.readFileSync(clw, 'utf8'));
        const links = new DocumentLinkProvider().provideDocumentLinks(doc);
        assert.deepStrictEqual(
            links.map(l => `${l.range.start.line + 1}:${path.basename(decodeURIComponent(l.target!))}`).sort(),
            ['1:member.inc', '2:ctlinked.inc'],
            'both includes in the class file are linked');
    });

    test('editing a file that names a new include pulls that include, and its own includes, into the graph', async () => {
        const frg = await build();
        write('late.inc', ["  INCLUDE('later.inc'),ONCE", 'LateEq EQUATE(3)']);
        write('later.inc', ['LaterEq EQUATE(4)']);
        fs.appendFileSync(f('ctLinked.clw'), "  INCLUDE('late.inc'),ONCE\r\n");
        await frg.updateFile(toUri(f('ctLinked.clw')));
        assert.deepStrictEqual(targets(frg, 'ctLinked.clw', 'INCLUDE'), ['ctlinked.inc', 'late.inc', 'member.inc'], 'the edited file re-scanned');
        assert.deepStrictEqual(targets(frg, 'late.inc', 'INCLUDE'), ['later.inc'], 'the newly named include was scanned in turn');
        assert.deepStrictEqual(includers(frg, 'later.inc'), ['late.inc']);
    });
});
