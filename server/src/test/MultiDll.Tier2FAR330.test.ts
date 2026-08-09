import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ExpExportIndex } from '../services/ExpExportIndex';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { TokenCache } from '../TokenCache';
import { serverSettings } from '../serverSettings';

/**
 * #330 tier 2 — cross-project FAR for DLL-exported procedures.
 *
 * The defining project (IBSCom) exports Fetch via IBSCOM.EXP (compiler-truth
 * export list, real decorated format). Two consumers (AP, BM) re-declare it
 * in their global MAPs inside MODULE('IBSCOM.DLL') and call it — the exact
 * generated shape verified on the Direct10 substrate. FAR from ANY of the
 * positions must return the unified family: impl + defining declaration +
 * each consumer's re-declaration + each consumer's call sites.
 *
 * Perf contract pinned implicitly: the .exp is parsed lazily by the FAR
 * request (ExpExportIndex) — nothing here runs at "solution load" (the
 * fixture builds projects without touching the index).
 *
 * Sentinels:
 *  - LocalOnly is declared/implemented in IBSCom but NOT exported → FAR must
 *    NOT leak into consumers (AP carries a same-named local variable as the
 *    observable decoy).
 *  - Ghost is re-declared in AP against MODULE('VUFT3.DLL') — a third-party
 *    DLL with no in-solution project → FAR stays AP-local, no crash.
 *  - crossProjectDll:false (the rename path, #325 generated-code caveat)
 *    returns only defining-project locations from the impl label.
 */

const CONSUMER_AP =
    "  PROGRAM\n" +                              // 0
    "  MAP\n" +                                  // 1
    "    MODULE('IBSCOM.DLL')\n" +               // 2
    "Fetch     PROCEDURE(LONG pMode),DLL\n" +    // 3
    "    END\n" +                                // 4
    "    MODULE('VUFT3.DLL')\n" +                // 5
    "Ghost     PROCEDURE(),DLL\n" +              // 6
    "    END\n" +                                // 7
    "  END\n" +                                  // 8
    "LocalOnly   LONG\n" +                       // 9  — decoy for the non-export sentinel
    "  CODE\n" +                                 // 10
    "  Fetch(1)\n" +                             // 11
    "  Ghost()\n" +                              // 12
    "  LocalOnly = 1\n" +                        // 13
    "  RETURN\n";                                // 14

const CONSUMER_BM =
    "  PROGRAM\n" +                              // 0
    "  MAP\n" +                                  // 1
    "    MODULE('IBSCOM.DLL')\n" +               // 2
    "Fetch     PROCEDURE(LONG pMode),DLL\n" +    // 3
    "    END\n" +                                // 4
    "  END\n" +                                  // 5
    "  CODE\n" +                                 // 6
    "  Fetch(2)\n" +                             // 7
    "  RETURN\n";                                // 8

const DEFINING_MAIN =
    "  PROGRAM\n" +                              // 0
    "  MAP\n" +                                  // 1
    "    MODULE('fetch_ibscom.clw')\n" +         // 2
    "Fetch       PROCEDURE(LONG pMode)\n" +      // 3
    "LocalOnly   PROCEDURE()\n" +                // 4  — NOT exported
    "    END\n" +                                // 5
    "  END\n" +                                  // 6
    "  CODE\n" +                                 // 7
    "  RETURN\n";                                // 8

const DEFINING_MEMBER =
    "  MEMBER('ibscom.clw')\n" +                 // 0
    "  MAP\n" +                                  // 1
    "  END\n" +                                  // 2
    "Fetch  PROCEDURE(LONG pMode)\n" +           // 3
    "  CODE\n" +                                 // 4
    "  RETURN\n" +                               // 5
    "LocalOnly  PROCEDURE()\n" +                 // 6
    "  CODE\n" +                                 // 7
    "  RETURN\n";                                // 8

// Real decorated .exp shape (banked #330 research): procedure = NAME@F<argcodes>
// (non-digit after @F); method = digit after @F; data = $NAME. LocalOnly absent.
const IBSCOM_EXP =
    "  LIBRARY 'IBSCOM' GUI\n" +
    "\n" +
    "  EXPORTS\n" +
    "    FETCH@FRl\n" +
    "    $SOMEGLOBAL\n" +
    "    INIT@F7MYCLASSRl\n";

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/');
}

function keyed(refs: Location[] | null | undefined): string[] {
    return (refs ?? [])
        .map(r => `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`)
        .sort();
}

function cursorOn(source: string, line: number, needle: string, offset = 1) {
    const idx = source.split(/\r?\n/)[line].indexOf(needle);
    if (idx === -1) throw new Error(`'${needle}' not on line ${line}`);
    return { line, character: idx + offset };
}

suite('Multi-DLL tier-2 FAR (#330)', () => {

    let tmpRoot: string;
    let apUri: string;
    let implUri: string;
    let savedSm: SolutionManager | null;
    let savedRedirectionFile: string;
    let savedLibsrc: string[];

    setup(() => {
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        TokenCache.getInstance().clearAllTokens();
        ExpExportIndex.getInstance().reset();

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multidll330t2-'));
        const apDir = path.join(tmpRoot, 'AP');
        const bmDir = path.join(tmpRoot, 'BM');
        const ibsDir = path.join(tmpRoot, 'IBSCom');
        for (const d of [apDir, bmDir, ibsDir]) {
            fs.mkdirSync(d, { recursive: true });
            fs.writeFileSync(path.join(d, 'Clarion110.red'), '[Common]\n*.clw = .\n*.inc = .\n*.exp = .\n');
        }

        fs.writeFileSync(path.join(apDir, 'ap.clw'), CONSUMER_AP);
        fs.writeFileSync(path.join(bmDir, 'bm.clw'), CONSUMER_BM);
        fs.writeFileSync(path.join(ibsDir, 'ibscom.clw'), DEFINING_MAIN);
        fs.writeFileSync(path.join(ibsDir, 'fetch_ibscom.clw'), DEFINING_MEMBER);
        fs.writeFileSync(path.join(ibsDir, 'IBSCom.exp'), IBSCOM_EXP);
        apUri = toUri(path.join(apDir, 'ap.clw'));
        implUri = toUri(path.join(ibsDir, 'fetch_ibscom.clw'));

        const pAP = new ClarionProjectServer('AP', 'app', apDir, '{AP-330T2}');
        pAP.sourceFiles.push(new ClarionSourcerFileServer('ap.clw', 'ap.clw', pAP));
        pAP.projectReferences.push({ name: 'IBSCom', project: 'IBSCom.cwproj' });

        const pBM = new ClarionProjectServer('BM', 'app', bmDir, '{BM-330T2}');
        pBM.sourceFiles.push(new ClarionSourcerFileServer('bm.clw', 'bm.clw', pBM));
        pBM.projectReferences.push({ name: 'IBSCom', project: 'IBSCom.cwproj' });

        const pIBS = new ClarionProjectServer('IBSCom', 'app', ibsDir, '{IBS-330T2}');
        pIBS.sourceFiles.push(new ClarionSourcerFileServer('ibscom.clw', 'ibscom.clw', pIBS));
        pIBS.sourceFiles.push(new ClarionSourcerFileServer('fetch_ibscom.clw', 'fetch_ibscom.clw', pIBS));

        const projects = [pAP, pBM, pIBS];
        // Mirror the REAL findProjectForFile semantics (full-path match, then
        // basename fallback across sourceFiles) — the global FAR branch passes
        // a basename, and a prefix-only fake would silently fall through to
        // the search-all-projects fallback and mask the tier-2 gap.
        const findProjectForFile = (fp: string) => {
            const norm = path.normalize(fp).toLowerCase();
            const byPath = projects.find(p =>
                norm.startsWith(path.normalize(p.path).toLowerCase() + path.sep));
            if (byPath) return byPath;
            const base = path.basename(norm);
            return projects.find(p =>
                p.sourceFiles.some(sf => sf.name.toLowerCase() === base));
        };
        const fakeSm = {
            solution: { projects },
            findProjectForFile,
            getProjectPathForFile: (fp: string) => findProjectForFile(fp)?.path ?? path.dirname(fp),
        } as unknown as SolutionManager;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrc;
        ExpExportIndex.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const UNIFIED = [
        'ap.clw:3', 'ap.clw:11',        // AP re-declaration + call
        'bm.clw:3', 'bm.clw:7',         // BM re-declaration + call
        'fetch_ibscom.clw:3',           // implementation
        'ibscom.clw:3',                 // defining MAP declaration
    ].sort();

    test('FAR from the implementation label spans defining + both consumers', async () => {
        const doc = TextDocument.create(implUri, 'clarion', 1, DEFINING_MEMBER);
        const refs = await new ReferencesProvider().provideReferences(
            doc, cursorOn(DEFINING_MEMBER, 3, 'Fetch'), { includeDeclaration: true });
        assert.deepStrictEqual(keyed(refs), UNIFIED,
            'impl-side FAR must return the unified DLL family');
    });

    test('FAR from a consumer call site returns the same unified set (agreement)', async () => {
        const doc = TextDocument.create(apUri, 'clarion', 1, CONSUMER_AP);
        const refs = await new ReferencesProvider().provideReferences(
            doc, cursorOn(CONSUMER_AP, 11, 'Fetch'), { includeDeclaration: true });
        assert.deepStrictEqual(keyed(refs), UNIFIED,
            'consumer-side FAR must agree with impl-side FAR');
    });

    test('FAR from the consumer MAP re-declaration returns the unified set', async () => {
        const doc = TextDocument.create(apUri, 'clarion', 1, CONSUMER_AP);
        const refs = await new ReferencesProvider().provideReferences(
            doc, cursorOn(CONSUMER_AP, 3, 'Fetch'), { includeDeclaration: true });
        assert.deepStrictEqual(keyed(refs), UNIFIED);
    });

    test('sentinel: a NON-exported procedure stays inside the defining project', async () => {
        const doc = TextDocument.create(implUri, 'clarion', 1, DEFINING_MEMBER);
        const refs = await new ReferencesProvider().provideReferences(
            doc, cursorOn(DEFINING_MEMBER, 6, 'LocalOnly'), { includeDeclaration: true });
        const hits = keyed(refs);
        assert.ok(!hits.some(h => h.startsWith('ap.clw') || h.startsWith('bm.clw')),
            `LocalOnly is not in the .exp — consumer files must not appear (AP even has a same-named local); got: ${hits.join(', ')}`);
        assert.ok(hits.includes('fetch_ibscom.clw:6'), `defining-project hits expected; got: ${hits.join(', ')}`);
    });

    test('sentinel: third-party MODULE(VUFT3.DLL) with no in-solution project stays local', async () => {
        const doc = TextDocument.create(apUri, 'clarion', 1, CONSUMER_AP);
        const refs = await new ReferencesProvider().provideReferences(
            doc, cursorOn(CONSUMER_AP, 12, 'Ghost'), { includeDeclaration: true });
        const hits = keyed(refs);
        assert.ok(hits.length > 0, 'Ghost FAR must still work locally');
        assert.ok(hits.every(h => h.startsWith('ap.clw')),
            `third-party DLL references stay in the consumer; got: ${hits.join(', ')}`);
    });

    test('rename gate: crossProjectDll:false keeps FAR inside the defining project', async () => {
        const doc = TextDocument.create(implUri, 'clarion', 1, DEFINING_MEMBER);
        // Signature-agnostic call (stash-RED discipline, the #329 lesson): the
        // opts key doesn't exist pre-fix; JS ignoring it IS the pre-fix bug.
        const provider = new ReferencesProvider() as unknown as {
            provideReferences(d: TextDocument, p: { line: number; character: number },
                c: { includeDeclaration: boolean }, t?: undefined,
                o?: { crossProjectDll?: boolean }): Promise<Location[] | null>;
        };
        const refs = await provider.provideReferences(
            doc, cursorOn(DEFINING_MEMBER, 3, 'Fetch'), { includeDeclaration: true },
            undefined, { crossProjectDll: false });
        const hits = keyed(refs);
        assert.ok(hits.length > 0, 'gated FAR must still return defining-project hits');
        assert.ok(!hits.some(h => h.startsWith('ap.clw') || h.startsWith('bm.clw')),
            `rename path must never see generated consumer MAPs; got: ${hits.join(', ')}`);
    });
});
