import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';

/**
 * Issue #181 — real-world false-positive guard against the SHIPPING Clarion
 * library. This is the strongest validation that the class-interface-implementation
 * diagnostic does not light up correct interface code: it runs against the actual
 * `abapi.inc` / `abapi.clw`, where `CSocketConnection CLASS,...,IMPLEMENTS
 * (IConnection)` (non-derived, MODULE('ABAPI.CLW')) implements all nine
 * IConnection methods as three-part `CSocketConnection.IConnection.X PROCEDURE`
 * definitions.
 *
 * Auto-skips when Clarion 11.1 isn't installed (e.g. CI), so it only runs on a
 * developer machine with the LibSrc present.
 */

const LIBSRC = 'C:\\Clarion\\Clarion11.1\\LibSrc\\win';
const ABAPI_INC = path.join(LIBSRC, 'abapi.inc');

suite('Issue #181 — real-LibSrc false-positive guard (abapi.inc)', () => {

    let savedSm: SolutionManager | null = null;
    let savedRedirectionFile = '';
    let savedLibsrcPaths: string[] = [];
    let doc: TextDocument | null = null;
    let svc: MemberLocatorService;

    setup(function () {
        if (!fs.existsSync(ABAPI_INC)) {
            this.skip(); // Clarion not installed — skip on CI
        }

        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = '';
        serverSettings.libsrcPaths = [LIBSRC];

        const fakeProject = {
            name: 'LibSrc',
            path: LIBSRC,
            sourceFiles: [],
            // findFile → null forces resolveFilePath's path.join(fromDir, filename)
            // fallback; abapi.inc's INCLUDEs + MODULE all live in the same dir.
            getRedirectionParser: () => ({ findFile: (_: string) => null })
        };
        const fakeSm = {
            solution: { projects: [fakeProject] },
            findProjectForFile: () => fakeProject,
            getProjectPathForFile: () => LIBSRC,
            getEquatesTokens: () => null,
            getEquatesPath: () => null
        } as unknown as SolutionManager;
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;
        StructureDeclarationIndexer.getInstance().clearCache();

        const uri = `file:///${ABAPI_INC.replace(/\\/g, '/')}`;
        doc = TextDocument.create(uri, 'clarion', 1, fs.readFileSync(ABAPI_INC, 'utf-8'));
        TokenCache.getInstance().getTokens(doc);
        svc = new MemberLocatorService();
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        StructureDeclarationIndexer.getInstance().clearCache();
        if (doc) TokenCache.getInstance().clearTokens(doc.uri);
        doc = null;
    });

    test('IConnection resolves through abapi.inc\'s INCLUDE chain (proves real cross-file resolution)', async () => {
        const methods = await svc.enumerateInterfaceMembers('IConnection', doc!);
        assert.ok(methods !== null, 'expected IConnection to resolve via INCLUDE(ITRANS.INT)');
        const lower = methods!.map(m => m.toLowerCase());
        // itrans.int declares 9 IConnection methods.
        assert.ok(lower.includes('closesocket'), `expected CloseSocket; got ${JSON.stringify(methods)}`);
        assert.ok(lower.includes('senddata'), `expected SendData; got ${JSON.stringify(methods)}`);
        assert.strictEqual(methods!.length, 9, `expected 9 IConnection methods; got ${JSON.stringify(methods)}`);
    });

    test('CSocketConnection (fully implemented in abapi.clw) produces NO warning', async () => {
        const tokens = TokenCache.getInstance().getTokens(doc!);
        const d = await validateClassInterfaceImplementationAsync(tokens, doc!, svc);
        const offenders = d.filter(x => /CSocketConnection/.test(x.message));
        assert.strictEqual(offenders.length, 0,
            `CSocketConnection implements all IConnection methods in abapi.clw — must not warn; got: ${JSON.stringify(offenders.map(x => x.message))}`);
    });
});
