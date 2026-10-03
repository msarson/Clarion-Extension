/**
 * #600 — find-all-references misses the call sites of a colon-qualified name whose PREFIX is
 * longer than eight characters.
 *
 * Found by the #599 corpus sweep on app1.sln, then reduced to one file: `CommonLib:Init` is declared
 * inside `MODULE('COMMONLIB.DLL')` at CRS.clw:418 and called at CRS.clw:2626, and
 * textDocument/references returned ONLY the declaration from either cursor — in the very file the
 * request was made in, so not a search-set-width problem.
 *
 * The cause is the StructurePrefix pattern's prefix cap:
 *
 *     /\b[A-Z][A-Z0-9_]{0,7}\s*:\s*[A-Za-z_][A-Za-z0-9_]*\/i        1 + up to 7 = eight characters
 *
 * A name at column 0 is a single `Label` carrying the whole thing whatever its length, so the
 * DECLARATION always matches. A call site is indented, and there the cap decides:
 *
 *     GLO:Init          prefix 3   -> StructurePrefix("GLO:Init")              one token
 *     CommonLib:Init    prefix 9   -> Variable("CommonLib") ':' Function("Init")  three tokens
 *
 * `findReferencesInFile` compares `token.value` against the search word, so the three-token form can
 * never match and the call site is invisible. Same root cause as #597 — one name arriving as several
 * tokens — surfacing in the references path instead of the MAP classifier, which is why the fix is
 * `resolvePrefixedName` rather than another special case.
 *
 * The short-prefix control below is the point: it passes before and after, which is what makes the
 * cap (and not "prefixed names" in general) the demonstrated factor.
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
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('FAR on a long-prefix colon name (#600)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    // Mirrors the reported shape: a DLL import declared at column 0 inside a MODULE block, called
    // from the program's main code. `CommonLib` is nine characters, `Short` is five.
    const files: { [rel: string]: string } = {
        'app1.clw': [
            '  PROGRAM',                                  // 0
            '  MAP',                                      // 1
            "    MODULE('common.dll')",                   // 2
            'CommonLib:Init        PROCEDURE(),DLL',      // 3  long prefix — the bug
            'Short:Init            PROCEDURE(),DLL',      // 4  short prefix — the control
            'reg:WIN:ShowExits     PROCEDURE(),DLL',      // 5  two colons — #596 cause 2
            '    END',                                    // 6
            '  END',                                      // 7
            '  CODE',                                     // 8
            '  CommonLib:Init()',                         // 9  call site that was never found
            '  Short:Init()',                             // 10 call site that always worked
            '  reg:WIN:ShowExits()',                      // 11 two colons — #596 cause 2
            '  RETURN',                                   // 12
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far600-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        const project = new ClarionProjectServer('app1', 'app', dir, '{PFX-600}');
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

    const lines = (refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): number[] =>
        (refs ?? []).map(r => r.range.start.line).sort((a, b) => a - b);

    async function far(line: number, character: number) {
        const doc = docs.get('app1.clw')!;
        return new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
    }

    test('the eight-character cap is what splits the call site — the tokens say so', () => {
        const tokens = new ClarionTokenizer(files['app1.clw']).tokenize();
        const at = (line: number) => tokens.filter(t => t.line === line).map(t => `${TokenType[t.type]}(${t.value})`);

        // Short prefix: one token, so `token.value` alone matches the search word.
        assert.deepStrictEqual(at(10).slice(0, 1), ['StructurePrefix(Short:Init)']);

        // Long prefix: three tokens, none of which equals "CommonLib:Init".
        assert.deepStrictEqual(at(9).slice(0, 3),
            ['Variable(CommonLib)', 'Delimiter(:)', 'Function(Init)']);
    });

    test('the short-prefix control finds its call site (before and after — this is the control)', async () => {
        const fromDecl = lines(await far(4, 2));
        assert.ok(fromDecl.includes(10), `short prefix should find the call at line 10, got ${JSON.stringify(fromDecl)}`);
    });

    test('a long-prefix call site is found from the declaration', async () => {
        const refs = lines(await far(3, 2));
        assert.ok(refs.includes(9), `expected the call at line 9, got ${JSON.stringify(refs)}`);
        assert.ok(refs.includes(3), `expected the declaration at line 3, got ${JSON.stringify(refs)}`);
    });

    test('a long-prefix call site is found from the call site itself', async () => {
        const refs = lines(await far(9, 4));
        assert.ok(refs.includes(9), `the call site must list itself, got ${JSON.stringify(refs)}`);
        assert.ok(refs.includes(3), `expected the declaration at line 3, got ${JSON.stringify(refs)}`);
    });

    test('the declaration and the call are one symbol, not two results at one line', async () => {
        const refs = lines(await far(3, 2));
        assert.deepStrictEqual(refs, [3, 9], `expected exactly the declaration and its one call, got ${JSON.stringify(refs)}`);
    });

    // ── #596 cause 2 ────────────────────────────────────────────────────────────────────────────
    // @bill-atchison reported that a TWO-colon call site can never match, and proposed a rejoin in
    // findReferencesInFile. The same cause as this issue: `reg:WIN:ShowExits` splits because
    // StructurePrefix captures exactly ONE colon, so the tail token is `ShowExits` and the search
    // word is the whole name. resolvePrefixedName walks a chain of any length, so the fix here
    // should already cover it — asserted rather than assumed, because "should" is not evidence.
    test('a two-colon call site is found — #596 cause 2, same helper', async () => {
        const tokens = new ClarionTokenizer(files['app1.clw']).tokenize();
        const at11 = tokens.filter(t => t.line === 11).map(t => `${TokenType[t.type]}(${t.value})`);
        assert.deepStrictEqual(at11.slice(0, 3),
            ['StructurePrefix(reg:WIN)', 'Delimiter(:)', 'Function(ShowExits)'],
            'the two-colon call site really does arrive as three tokens');

        const fromDecl = lines(await far(5, 2));
        assert.ok(fromDecl.includes(11), `expected the call at line 11, got ${JSON.stringify(fromDecl)}`);
        assert.ok(fromDecl.includes(5), `expected the declaration at line 5, got ${JSON.stringify(fromDecl)}`);

        const fromCall = lines(await far(11, 4));
        assert.ok(fromCall.includes(11), `the call site must list itself, got ${JSON.stringify(fromCall)}`);
        assert.ok(fromCall.includes(5), `expected the declaration at line 5, got ${JSON.stringify(fromCall)}`);
    });
});
