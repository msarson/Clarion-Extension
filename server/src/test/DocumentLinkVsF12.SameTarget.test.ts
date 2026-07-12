import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentLinkProvider } from '../providers/DocumentLinkProvider';
import { FileDefinitionResolver } from '../utils/FileDefinitionResolver';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * #327 row 1 — DocumentLinkProvider vs F12/FileDefinitionResolver same-target
 * pin under a redirection file (the test gap named on #265).
 *
 * Three paths resolve an INCLUDE filename: F12/hover go through
 * FileDefinitionResolver (project redirection parsers, then relative probe);
 * document links come from FileRelationshipGraph forward edges (redirection
 * parsing at graph-build time). Nothing previously asserted they agree.
 *
 * The fixture places the INCLUDE target ONLY in a redirected subdirectory
 * (`incdir`), never next to the source file — so a relative-path fallback
 * cannot fake agreement; both paths must go through redirection and land on
 * the same physical file. Three-way pin: link target == F12 target ==
 * <projDir>/incdir/MyClass.inc.
 */

const SOURCE_CONTENT =
    "  PROGRAM\n" +
    "  INCLUDE('MyClass.inc')\n" +
    "  CODE\n" +
    "  RETURN\n";

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

function uriToNormPath(uri: string): string {
    return path.normalize(decodeURIComponent(uri.replace(/^file:\/\/\//, '')).replace(/\//g, path.sep)).toLowerCase();
}

suite('DocumentLink vs F12 INCLUDE same-target under redirection (#327)', () => {

    let tmpRoot: string;
    let projDir: string;
    let sourceFile: string;
    let expectedTarget: string;
    let savedSmInstance: SolutionManager | null;
    let savedRedirectionFile: string;
    let savedLibsrcPaths: string[];

    setup(() => {
        savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-f12-327-'));
        projDir = path.join(tmpRoot, 'Proj');
        const incDir = path.join(projDir, 'incdir');
        fs.mkdirSync(incDir, { recursive: true });

        // Target lives ONLY in the redirected dir — never beside the source.
        expectedTarget = path.join(incDir, 'MyClass.inc');
        fs.writeFileSync(expectedTarget, 'MyClass  CLASS,TYPE\n         END\n');
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'),
            '[Common]\n*.inc = incdir\n*.clw = .\n');
        sourceFile = path.join(projDir, 'MyProg.clw');
        fs.writeFileSync(sourceFile, SOURCE_CONTENT);

        const project = new ClarionProjectServer('TestProj', 'app', projDir, '{TEST-GUID-327}');
        const fakeSm = { solution: { projects: [project] } } as unknown as SolutionManager;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;

        FileRelationshipGraph.getInstance().reset();
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSmInstance;
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        FileRelationshipGraph.getInstance().reset();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('document link and F12 resolve the same redirected physical file', async () => {
        const sourceUri = toUri(sourceFile);
        const doc = TextDocument.create(sourceUri, 'clarion', 1, SOURCE_CONTENT);

        // Build the FRG edges for the source file (per-file path used by the
        // watcher); updateFile does not flip the built flag, force it so the
        // provider serves links (same private-access pattern as the FRG suites).
        const frg = FileRelationshipGraph.getInstance();
        await frg.updateFile(sourceUri);
        (frg as unknown as { _built: boolean })._built = true;

        // Path 1: document link target
        const links = new DocumentLinkProvider().provideDocumentLinks(doc);
        const includeLinks = links.filter(l => l.range.start.line === 1);
        assert.strictEqual(includeLinks.length, 1,
            `expected exactly one link on the INCLUDE line; got ${links.length} total: ${JSON.stringify(links)}`);
        const linkTarget = includeLinks[0].target;
        assert.ok(linkTarget, 'link must carry a target');

        // Path 2: F12 / FileDefinitionResolver target
        const f12Location = await new FileDefinitionResolver().findFileDefinition('MyClass.inc', sourceUri);
        assert.ok(f12Location, 'F12 must resolve the INCLUDE filename via redirection');

        // Three-way pin: both paths land on the redirected physical file.
        const expectedNorm = path.normalize(expectedTarget).toLowerCase();
        assert.strictEqual(uriToNormPath(linkTarget!), expectedNorm,
            'document link must resolve to the redirected incdir copy');
        assert.strictEqual(uriToNormPath(f12Location!.uri), expectedNorm,
            'F12 must resolve to the redirected incdir copy');
    });
});

/**
 * #328 — owner-project-first redirection for F12/hover filename resolution.
 *
 * Two projects each redirect `*.inc` to their own local dir and BOTH carry
 * `Shared.inc`. A ProjB source INCLUDEs it: the compiler building ProjB uses
 * ProjB's redirection, so F12 must return ProjB's copy. The pre-#328 loop
 * walked `solution.projects` in solution order and returned ProjA's copy —
 * the same wrong-copy bug the #315 review fixed on the FRG side.
 */
suite('F12 INCLUDE resolution is owner-project-first (#328)', () => {

    let tmpRoot: string;
    let projA: string;
    let projB: string;
    let savedSmInstance: SolutionManager | null;
    let savedRedirectionFile: string;
    let savedLibsrcPaths: string[];

    setup(() => {
        savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-first-328-'));
        projA = path.join(tmpRoot, 'ProjA');
        projB = path.join(tmpRoot, 'ProjB');
        for (const p of [projA, projB]) {
            fs.mkdirSync(path.join(p, 'inc'), { recursive: true });
            fs.writeFileSync(path.join(p, 'Clarion110.red'), '[Common]\n*.inc = inc\n*.clw = .\n');
            fs.writeFileSync(path.join(p, 'inc', 'Shared.inc'), `! ${path.basename(p)} copy\n`);
        }
        fs.writeFileSync(path.join(projB, 'Main.clw'), SOURCE_CONTENT.replace('MyClass.inc', 'Shared.inc'));

        const pA = new ClarionProjectServer('ProjA', 'app', projA, '{A-328}');
        const pB = new ClarionProjectServer('ProjB', 'app', projB, '{B-328}');
        const projects = [pA, pB];
        const fakeSm = {
            solution: { projects },
            // Real SolutionManager matches against project source-file lists;
            // path-prefix is the test-shim equivalent for on-disk fixtures.
            findProjectForFile: (fp: string) => {
                const norm = path.normalize(fp).toLowerCase();
                return projects.find(p =>
                    norm.startsWith(path.normalize(p.path).toLowerCase() + path.sep));
            }
        } as unknown as SolutionManager;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSmInstance;
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test("F12 from a ProjB source resolves ProjB's redirected copy, not ProjA's", async () => {
        const sourceUri = toUri(path.join(projB, 'Main.clw'));
        const location = await new FileDefinitionResolver().findFileDefinition('Shared.inc', sourceUri);
        assert.ok(location, 'F12 must resolve Shared.inc');

        const resultNorm = uriToNormPath(location!.uri);
        const wrongNorm = path.normalize(path.join(projA, 'inc', 'Shared.inc')).toLowerCase();
        const rightNorm = path.normalize(path.join(projB, 'inc', 'Shared.inc')).toLowerCase();

        assert.notStrictEqual(resultNorm, wrongNorm,
            "must NOT resolve through ProjA's redirection (solution-order walk)");
        assert.strictEqual(resultNorm, rightNorm,
            "must resolve through the OWNING project's (ProjB) redirection");
    });

    test('projectsOwnerFirst puts the owning project first and tolerates ownerless paths', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { projectsOwnerFirst } = require('../utils/RedirectionResolution');

        const ordered = projectsOwnerFirst(path.join(projB, 'Main.clw'));
        assert.strictEqual(ordered.length, 2, 'both projects present');
        assert.strictEqual(ordered[0].name, 'ProjB', 'owning project must come first');
        assert.strictEqual(ordered[1].name, 'ProjA', 'other projects follow');

        const unowned = projectsOwnerFirst(path.join(tmpRoot, 'Loose.clw'));
        assert.deepStrictEqual(unowned.map((p: { name: string }) => p.name), ['ProjA', 'ProjB'],
            'ownerless path keeps solution order');
    });

    test("F12 from a file outside every project still resolves via the solution-order fallback", async () => {
        const looseFile = path.join(tmpRoot, 'Loose.clw');
        fs.writeFileSync(looseFile, SOURCE_CONTENT.replace('MyClass.inc', 'Shared.inc'));

        const location = await new FileDefinitionResolver().findFileDefinition('Shared.inc', toUri(looseFile));
        assert.ok(location, 'ownerless file must still resolve via the project-loop fallback');
        const resultNorm = uriToNormPath(location!.uri);
        assert.ok(resultNorm.endsWith(path.normalize('inc\\shared.inc').toLowerCase()),
            `fallback must still find a redirected copy; got ${resultNorm}`);
    });
});
