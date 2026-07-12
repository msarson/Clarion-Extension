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
