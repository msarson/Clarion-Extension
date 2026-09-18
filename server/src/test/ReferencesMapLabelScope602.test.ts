/**
 * #602 — a MAP prototype written at column 0 is resolved as a MODULE VARIABLE, which narrows the
 * reference search to a graph-derived subset of the program instead of the whole program.
 *
 * On ap1.sln, settled, `PrintForm` is declared at `DMCommon.clw:152` inside
 * `MODULE('IBSPRINTFORM.DLL')` and called from four of DMCommon's member modules:
 *
 *     from DECLARATION  Scope="module" -> 70 file(s)  -> 7 refs
 *     from CALL SITE    Scope="global" -> 156 file(s) -> 8 refs
 *
 * The server's own SymbolFinderService trace names the culprit:
 *
 *     🔍 Finding symbol: "PrintForm" at line 152
 *     No scope found, checking module/global only
 *     Finding module variable: "PrintForm"
 *     ✅ Found module variable: PrintForm at line 152
 *
 * `findModuleVariable` looks for a `Label` at column 0 with no parent, before the first procedure
 * implementation — which is exactly the shape of a MAP prototype written in the explicit-keyword
 * form. It is a procedure declaration, not module data, and resolving it as data gives it `module`
 * scope, which then takes the "a module-level MAP procedure is only available within the current
 * MEMBER module" branch.
 *
 * That branch is correct as written — the Language Reference's MAP page gives three tiers: a MAP in
 * the PROGRAM source module declares procedures "available for use throughout the program", a MAP in
 * a MEMBER module only within that module, and a PROCEDURE-local MAP only within the procedure. This
 * declaration is tier 1, so the whole program is right and the narrow branch is being applied a level
 * too high.
 *
 * COLUMN MATTERS, which is why three earlier fixtures failed to reproduce this: an INDENTED
 * keyword-less prototype produces no `Label` token at all, so `findModuleVariable` never sees it and
 * the symbol resolves correctly. Both forms are below, and the indented one is the control.
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

suite('FAR on a column-0 MAP prototype (#602)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'parent.clw': [
            '  PROGRAM',                                      // 0
            '  MAP',                                          // 1
            "    MODULE('helper.dll')",                       // 2
            'ColZeroProc            PROCEDURE(LONG),LONG,DLL', // 3  column 0 — the reported shape
            '      IndentedProc(LONG),LONG,DLL',              // 4  indented — the control
            '    END',                                        // 5
            '  END',                                          // 6
            '  CODE',                                          // 7
            '  RETURN',                                        // 8
        ].join('\r\n'),
        // A member the parent's MAP never mentions, calling both. Mirrors
        // BrowseDMWorkTicket_DMCommon.clw, whose own procedure is not prototyped in DMCommon's MAP.
        'member.clw': [
            "  MEMBER('parent.clw')",                          // 0
            'UndeclaredProc PROCEDURE()',                      // 1
            '  CODE',                                          // 2
            '  ColZeroProc(1)',                                // 3
            '  IndentedProc(2)',                               // 4
            '  RETURN',                                        // 5
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far602-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
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
        const project = new ClarionProjectServer('parent', 'app', dir, '{MLS-602}');
        for (const rel of Object.keys(files)) project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        const seedPaths = Object.keys(files).map(rel => path.join(dir, rel));
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seedPaths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seedPaths);
        serverSettings.libsrcPaths = [dir];
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
        (refs ?? []).map(r => `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`).sort();

    async function far(rel: string, line: number, character: number) {
        return new ReferencesProvider().provideReferences(docs.get(rel)!, { line, character }, { includeDeclaration: true });
    }

    test('control: the INDENTED prototype reaches the member (no Label token, so no misresolution)', async () => {
        const refs = keyed(await far('parent.clw', 4, 8));
        assert.ok(refs.includes('member.clw:4'),
            `the indented form should reach the member, got ${JSON.stringify(refs)}`);
    });

    test('control: from the call site, the column-0 prototype resolves completely', async () => {
        const refs = keyed(await far('member.clw', 3, 4));
        assert.ok(refs.includes('parent.clw:3') && refs.includes('member.clw:3'),
            `the call-site query should find both ends, got ${JSON.stringify(refs)}`);
    });

    test('a column-0 MAP prototype reaches the member too', async () => {
        const refs = keyed(await far('parent.clw', 3, 2));
        assert.ok(refs.includes('member.clw:3'),
            `expected the call in member.clw:3, got ${JSON.stringify(refs)}`);
    });

    test('the two directions agree for the column-0 prototype', async () => {
        const fromDecl = keyed(await far('parent.clw', 3, 2));
        const fromCall = keyed(await far('member.clw', 3, 4));
        assert.deepStrictEqual(fromDecl, fromCall,
            `the same symbol must not answer differently depending on where it is asked:\n` +
            `  from declaration: ${JSON.stringify(fromDecl)}\n  from call site:   ${JSON.stringify(fromCall)}`);
    });
});
