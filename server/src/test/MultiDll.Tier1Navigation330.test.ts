import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * #330 tier 1 — multi-DLL procedure navigation, request-time hops.
 *
 * Fixture mirrors the real generated shape verified on Direct10 substrate
 * (F:\TestApps\Direct10Meta): the CONSUMER app re-declares an imported
 * procedure in its global MAP inside MODULE('IBSCOM.DLL') with the DLL
 * attribute; the DEFINING project declares it in its own global MAP inside
 * MODULE('fetch_ibscom.clw') and implements it in that member module. The
 * consumer's cwproj carries a ProjectReference to the defining project
 * (verified 1:1 with the MODULE('x.dll') set on the real app).
 *
 * Contract:
 * - F12 on the consumer call site → the LOCAL MAP re-declaration (cheap,
 *   correct — the local re-decl carries the authoritative signature).
 * - Ctrl+F12 (implementation) from the call site or the re-declaration →
 *   the implementation in the DEFINING project's member module.
 * - Hover on the call site → the procedure signature (must not break on
 *   the ,DLL attribute).
 */

const CONSUMER_SOURCE =
    "  PROGRAM\n" +                              // 0
    "  MAP\n" +                                  // 1
    "    MODULE('IBSCOM.DLL')\n" +               // 2
    "Fetch     PROCEDURE(LONG pMode),DLL\n" +    // 3
    "    END\n" +                                // 4
    "  END\n" +                                  // 5
    "  CODE\n" +                                 // 6
    "  Fetch(1)\n" +                             // 7
    "  RETURN\n";                                // 8

const DEFINING_MAIN =
    "  PROGRAM\n" +                              // 0
    "  MAP\n" +                                  // 1
    "    MODULE('fetch_ibscom.clw')\n" +         // 2
    "Fetch       PROCEDURE(LONG pMode)\n" +      // 3
    "    END\n" +                                // 4
    "  END\n" +                                  // 5
    "  CODE\n" +                                 // 6
    "  RETURN\n";                                // 7

const DEFINING_MEMBER =
    "  MEMBER('ibscom.clw')\n" +                 // 0
    "  MAP\n" +                                  // 1
    "  END\n" +                                  // 2
    "Fetch  PROCEDURE(LONG pMode)\n" +           // 3
    "  CODE\n" +                                 // 4
    "  RETURN\n";                                // 5

const CONSUMER_CALL_LINE = 7;
const CONSUMER_REDECL_LINE = 3;
const IMPL_LINE = 3; // in fetch_ibscom.clw

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

function uriBasename(uri: string): string {
    return path.basename(decodeURIComponent(uri)).toLowerCase();
}

function cursorOn(source: string, line: number, needle: string, offset = 0): Position {
    const text = source.split(/\r?\n/)[line];
    const idx = text.indexOf(needle);
    if (idx === -1) throw new Error(`'${needle}' not on line ${line}`);
    return { line, character: idx + offset };
}

function firstLocation(result: Location | Location[] | null): Location | null {
    if (!result) return null;
    return Array.isArray(result) ? result[0] ?? null : result;
}

suite('Multi-DLL tier-1 navigation (#330)', () => {

    let tmpRoot: string;
    let consumerUri: string;
    let savedSmInstance: SolutionManager | null;
    let savedRedirectionFile: string;
    let savedLibsrcPaths: string[];

    setup(() => {
        savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multidll-330-'));
        const apDir = path.join(tmpRoot, 'AP');
        const ibsDir = path.join(tmpRoot, 'IBSCom');
        fs.mkdirSync(apDir, { recursive: true });
        fs.mkdirSync(ibsDir, { recursive: true });
        for (const d of [apDir, ibsDir]) {
            fs.writeFileSync(path.join(d, 'Clarion110.red'), '[Common]\n*.clw = .\n*.inc = .\n');
        }

        const consumerFile = path.join(apDir, 'ap.clw');
        fs.writeFileSync(consumerFile, CONSUMER_SOURCE);
        fs.writeFileSync(path.join(ibsDir, 'ibscom.clw'), DEFINING_MAIN);
        fs.writeFileSync(path.join(ibsDir, 'fetch_ibscom.clw'), DEFINING_MEMBER);
        consumerUri = toUri(consumerFile);

        const pAP = new ClarionProjectServer('AP', 'app', apDir, '{AP-330}');
        pAP.sourceFiles.push(new ClarionSourcerFileServer('ap.clw', 'ap.clw', pAP));
        pAP.projectReferences.push({ name: 'IBSCom', project: 'IBSCom.cwproj' });

        const pIBS = new ClarionProjectServer('IBSCom', 'app', ibsDir, '{IBS-330}');
        pIBS.sourceFiles.push(new ClarionSourcerFileServer('ibscom.clw', 'ibscom.clw', pIBS));
        pIBS.sourceFiles.push(new ClarionSourcerFileServer('fetch_ibscom.clw', 'fetch_ibscom.clw', pIBS));

        const projects = [pAP, pIBS];
        const fakeSm = {
            solution: { projects },
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

    test('F12 on the call site resolves the LOCAL MAP re-declaration', async () => {
        const doc = TextDocument.create(consumerUri, 'clarion', 1, CONSUMER_SOURCE);
        const result = await new DefinitionProvider().provideDefinition(
            doc, cursorOn(CONSUMER_SOURCE, CONSUMER_CALL_LINE, 'Fetch', 2));
        const loc = firstLocation(result as Location | Location[] | null);

        assert.ok(loc, 'F12 on the call site must resolve');
        assert.strictEqual(uriBasename(loc!.uri), 'ap.clw',
            'call-site F12 stays local (the re-declaration carries the signature)');
        assert.strictEqual(loc!.range.start.line, CONSUMER_REDECL_LINE,
            `expected the MAP re-declaration at line ${CONSUMER_REDECL_LINE}, got ${loc!.range.start.line}`);
    });

    test('implementation from the call site hops to the defining project member module', async () => {
        const doc = TextDocument.create(consumerUri, 'clarion', 1, CONSUMER_SOURCE);
        const result = await new ImplementationProvider().provideImplementation(
            doc, cursorOn(CONSUMER_SOURCE, CONSUMER_CALL_LINE, 'Fetch', 2));
        const loc = firstLocation(result);

        assert.ok(loc, 'Ctrl+F12 from the call site must resolve cross-DLL');
        assert.strictEqual(uriBasename(loc!.uri), 'fetch_ibscom.clw',
            `implementation must land in the defining member module, got ${loc ? loc.uri : 'null'}`);
        assert.strictEqual(loc!.range.start.line, IMPL_LINE,
            `expected the implementation at line ${IMPL_LINE}, got ${loc!.range.start.line}`);
    });

    test('implementation from the MAP re-declaration hops to the defining project member module', async () => {
        const doc = TextDocument.create(consumerUri, 'clarion', 1, CONSUMER_SOURCE);
        const result = await new ImplementationProvider().provideImplementation(
            doc, cursorOn(CONSUMER_SOURCE, CONSUMER_REDECL_LINE, 'Fetch'));
        const loc = firstLocation(result);

        assert.ok(loc, 'Ctrl+F12 on the re-declaration must resolve cross-DLL');
        assert.strictEqual(uriBasename(loc!.uri), 'fetch_ibscom.clw',
            `implementation must land in the defining member module, got ${loc ? loc.uri : 'null'}`);
        assert.strictEqual(loc!.range.start.line, IMPL_LINE,
            `expected the implementation at line ${IMPL_LINE}, got ${loc!.range.start.line}`);
    });

    test('F12 on the MAP re-declaration hops into the defining project', async () => {
        const doc = TextDocument.create(consumerUri, 'clarion', 1, CONSUMER_SOURCE);
        const result = await new DefinitionProvider().provideDefinition(
            doc, cursorOn(CONSUMER_SOURCE, CONSUMER_REDECL_LINE, 'Fetch'));
        const loc = firstLocation(result as Location | Location[] | null);

        assert.ok(loc, 'F12 on the re-declaration must resolve');
        const base = uriBasename(loc!.uri);
        assert.ok(base === 'fetch_ibscom.clw' || base === 'ibscom.clw',
            `F12 on the ,DLL re-declaration should land in the defining project (impl or its MAP declaration), got ${loc!.uri}:${loc!.range.start.line}`);
    });

    test('implementation on a third-party DLL re-declaration (no project) returns null without error', async () => {
        const thirdPartySource = CONSUMER_SOURCE.replace("MODULE('IBSCOM.DLL')", "MODULE('vuFT3.dll')");
        const thirdUri = toUri(path.join(tmpRoot, 'AP', 'ap3.clw'));
        fs.writeFileSync(path.join(tmpRoot, 'AP', 'ap3.clw'), thirdPartySource);
        const doc = TextDocument.create(thirdUri, 'clarion', 1, thirdPartySource);

        const result = await new ImplementationProvider().provideImplementation(
            doc, cursorOn(thirdPartySource, CONSUMER_CALL_LINE, 'Fetch', 2));
        const loc = firstLocation(result);
        // No project owns vuFT3 — a graceful null (or a local-decl answer) is
        // acceptable; landing in IBSCom's module would be a WRONG hop.
        if (loc) {
            assert.notStrictEqual(uriBasename(loc.uri), 'fetch_ibscom.clw',
                'third-party DLL must not mis-hop into an unrelated project');
        }
    });

    test('hover on the call site shows the procedure signature despite the DLL attribute', async () => {
        const doc = TextDocument.create(consumerUri, 'clarion', 1, CONSUMER_SOURCE);
        const hover = await new HoverProvider().provideHover(
            doc, cursorOn(CONSUMER_SOURCE, CONSUMER_CALL_LINE, 'Fetch', 2));

        assert.ok(hover, 'hover on the call site must resolve');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');
        assert.ok(text.includes('Fetch'), `hover must name the procedure; got:\n${text}`);
        assert.ok(/LONG/i.test(text), `hover must carry the signature (LONG pMode); got:\n${text}`);
    });
});
