import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FileRelationshipGraph, FileEdge } from '../FileRelationshipGraph';
import { DocumentLinkProvider } from '../providers/DocumentLinkProvider';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';

// #198 — MODULE('...')/LINK('...') on a CLASS,TYPE declaration line should render as
// clickable document links, including when the file is OPEN in the editor (the warm /
// token path). On a CLASS line MODULE tokenizes as an Attribute and LINK as a Function
// (both carry a resolved referencedFile) — NOT as Structure tokens — so the warm path
// in FileRelationshipGraph missed them entirely and no link appeared. The cold (regex)
// path caught MODULE but mistyped it as MODULE rather than CLASS_MODULE, and the link
// provider only underlined the FIRST quoted string per line so MODULE+LINK could never
// both be links.
suite('#198 — MODULE/LINK on a CLASS line as document links', () => {

    // ─── DocumentLinkProvider: underline EVERY matching filename on the line ─────
    suite('DocumentLinkProvider', () => {
        const docUri = 'file:///f%3A/Proj/MyFunctionsClass.inc';
        const docPath = 'f:\\Proj\\MyFunctionsClass.inc';
        const implPath = 'f:\\Proj\\MyFunctionsClass.clw';
        const classLine = "MyFunctionsClass    CLASS,TYPE,MODULE('MyFunctionsClass.clw'),LINK('MyFunctionsClass.clw')";

        teardown(() => FileRelationshipGraph.getInstance().reset());

        test('underlines BOTH the MODULE and LINK filenames (not just the first quote)', () => {
            const frg = FileRelationshipGraph.getInstance();
            frg.reset();
            // One CLASS_MODULE edge on line 0 pointing at the impl .clw.
            frg.seedEdgesForTest([
                { type: 'CLASS_MODULE', fromFile: docPath, toFile: implPath, fromLine: 0 } as FileEdge,
            ]);

            const doc = TextDocument.create(docUri, 'clarion', 1, classLine);
            const links = new DocumentLinkProvider().provideDocumentLinks(doc);

            assert.strictEqual(links.length, 2,
                `both MODULE('…') and LINK('…') filenames must be links; got ${links.length}`);
            assert.ok(links.every(l => (l.target ?? '').toLowerCase().endsWith('myfunctionsclass.clw')),
                'every link must target the resolved implementation .clw');
            // The two links must sit at DIFFERENT columns (the MODULE quote vs the LINK quote).
            assert.notStrictEqual(links[0].range.start.character, links[1].range.start.character,
                'the two links must underline the two distinct quoted filenames, not the same one twice');
        });

        test('a second quoted argument that is not a file (INCLUDE section) is NOT linked', () => {
            const frg = FileRelationshipGraph.getInstance();
            frg.reset();
            const incPath = 'f:\\Proj\\Equates.inc';
            frg.seedEdgesForTest([
                { type: 'INCLUDE', fromFile: docPath, toFile: incPath, fromLine: 0 } as FileEdge,
            ]);
            const doc = TextDocument.create(docUri, 'clarion', 1, "  INCLUDE('Equates.inc'),ONCE");
            const links = new DocumentLinkProvider().provideDocumentLinks(doc);
            assert.strictEqual(links.length, 1, 'only the filename is a link, not the ONCE/section token');
            assert.ok((links[0].target ?? '').toLowerCase().endsWith('equates.inc'));
        });
    });

    // ─── FileRelationshipGraph: warm/cold parity for CLASS-attribute MODULE ──────
    suite('FileRelationshipGraph CLASS_MODULE edge', () => {
        let tmpDir: string;
        const INC_CONTENT = [
            '  MEMBER',
            "MyFunctionsClass    CLASS,TYPE,MODULE('MyFunctionsClass.clw'),LINK('MyFunctionsClass.clw')",
            'GetNow                PROCEDURE(),LONG',
            '                      END',
        ].join('\r\n');

        setup(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frg198-'));
            fs.writeFileSync(path.join(tmpDir, 'MyFunctionsClass.clw'), '  MEMBER\n', 'utf8');
            // Stub the solution so resolveFile('MyFunctionsClass.clw') finds the temp file.
            (SolutionManager as any).instance = {
                solution: { projects: [{
                    getRedirectionParser: () => ({
                        findFile: (name: string) => {
                            const p = path.join(tmpDir, path.basename(name));
                            return fs.existsSync(p) ? { path: p } : null;
                        }
                    })
                }]}
            };
            TokenCache.getInstance().clearAllTokens();
            FileRelationshipGraph.getInstance().reset();
        });

        teardown(() => {
            FileRelationshipGraph.getInstance().reset();
            (SolutionManager as any).instance = null;
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        });

        function incUriAndPath(): { uri: string; fsPath: string } {
            const fsPath = path.join(tmpDir, 'MyFunctionsClass.inc');
            const uri = 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
            return { uri, fsPath };
        }

        test('WARM (open-in-editor / token path) emits a CLASS_MODULE edge to the impl .clw', async () => {
            const { uri, fsPath } = incUriAndPath();
            const frg = FileRelationshipGraph.getInstance();
            // Seed the token cache → processFile takes the warm (token) path.
            TokenCache.getInstance().getTokens(TextDocument.create(uri, 'clarion', 1, INC_CONTENT));
            await frg.updateFile(uri);

            const edges = frg.getForwardEdges(fsPath);
            const classModule = edges.filter(e => e.type === 'CLASS_MODULE');
            assert.ok(classModule.length >= 1,
                `warm path must emit a CLASS_MODULE edge for the CLASS-attribute MODULE; got edges: ${JSON.stringify(edges.map(e => e.type))}`);
            assert.ok(classModule.some(e => e.toFile.toLowerCase().endsWith('myfunctionsclass.clw')),
                'the CLASS_MODULE edge must point at the implementation .clw');
        });

        test('COLD (regex path) types CLASS,TYPE,MODULE as CLASS_MODULE (warm/cold parity)', async () => {
            const { uri, fsPath } = incUriAndPath();
            // Write the .inc to disk and do NOT seed tokens → processFile takes the cold path.
            fs.writeFileSync(fsPath, INC_CONTENT, 'utf8');
            const frg = FileRelationshipGraph.getInstance();
            await frg.updateFile(uri);

            const edges = frg.getForwardEdges(fsPath);
            assert.ok(edges.some(e => e.type === 'CLASS_MODULE' && e.toFile.toLowerCase().endsWith('myfunctionsclass.clw')),
                `cold path must type CLASS,TYPE,MODULE as CLASS_MODULE (parity with warm); got: ${JSON.stringify(edges.map(e => e.type))}`);
        });
    });
});
