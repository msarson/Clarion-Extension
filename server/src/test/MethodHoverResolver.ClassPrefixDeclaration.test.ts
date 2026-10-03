import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Hovering the CLASS PREFIX of a method implementation line (`MyClass.Method PROCEDURE`)
 * answers "where is MyClass declared?" — never anything about the method, which is what
 * hovering the method name is for.
 *
 * The prefix hover used to take the first column-0 token in the CURRENT document matching
 * the class name. That is right only by coincidence, for one file shape:
 *
 *   - Generated app code declares `AppWin CLASS(...)` in the same .clw it implements, above
 *     the methods, so "first column-0 match" IS the declaration. Covered below so the fix
 *     cannot regress it.
 *   - A library class is declared in an .inc and implemented in a .clw. The .clw holds no
 *     declaration at all, so the search matched the first METHOD IMPLEMENTATION prefix and
 *     reported an unrelated method as the "class declaration".
 *   - A procedure-local CLASS is declared INDENTED, and one module may declare the same name
 *     in several procedures — a column-0 search cannot see it, and a name-only search cannot
 *     tell the copies apart.
 *
 * Fixtures live on REAL FILES on disk for the same reason as
 * MethodHoverResolver.LocalDerivedMethodAmbiguity.test.ts: the resolver reads document paths
 * with fs.readFileSync, so an in-memory-only document makes fallbacks fail with ENOENT and
 * assertions pass vacuously.
 */

// ── Library shape: declaration in the .inc, implementations in the .clw ──────────────
//
// The declaration is padded down to line 6 so the assertion cannot pass on a stray ':1'.
//
// 6 MyLib CLASS(BaseLib),TYPE,MODULE('lib.clw')   <- the only real declaration, in the OTHER file
const LIB_INC = [
    '! library class fixture',
    '! padding, so the declaration lands on a distinctive line number',
    '! padding',
    '! padding',
    '! padding',
    "MyLib CLASS(BaseLib),TYPE,MODULE('lib.clw')",
    'First    PROCEDURE()',
    'Second   PROCEDURE()',
    '    END',
    ''
].join('\n');

//  1   MEMBER()
//  2   INCLUDE('lib.inc'),ONCE
//  4 MyLib.First PROCEDURE()    <- first column-0 'MyLib': the OLD wrong answer
//  8 MyLib.Second PROCEDURE()   <- hover the prefix here
const LIB_CLW = [
    '  MEMBER()',
    "  INCLUDE('lib.inc'),ONCE",
    '',
    'MyLib.First PROCEDURE()',
    '  CODE',
    '  RETURN',
    '',
    'MyLib.Second PROCEDURE()',
    '  CODE',
    '  RETURN',
    ''
].join('\n');

// ── Generated-app shape: declared AND implemented in one .clw ────────────────────────
//
//  5 AppWin CLASS(WindowManager)   <- the declaration, above its methods
// 12 AppWin.Init PROCEDURE()
// 16 AppWin.Kill PROCEDURE()       <- hover the prefix here
const APP_CLW = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'AppWin CLASS(WindowManager)',
    'Init   PROCEDURE(),BYTE',
    'Kill   PROCEDURE(),BYTE',
    '    END',
    '',
    '  CODE',
    '',
    'AppWin.Init PROCEDURE()',
    '  CODE',
    '  RETURN 0',
    '',
    'AppWin.Kill PROCEDURE()',
    '  CODE',
    '  RETURN 0',
    ''
].join('\n');

// ── Procedure-local shape: same class name declared in two procedures ────────────────
//
// A local class's LABEL sits at column 0 like any Clarion label — only its END is indented —
// so what distinguishes the two is the procedure they belong to, never their column.
// ProcA's has no parent and ProcB's does, which also pins that the right one is read.
//
//  6 SharedName CLASS             <- ProcA's; the OLD wrong answer for BOTH
// 13 SharedName.Run PROCEDURE     <- hover here for the parentless case
// 18 SharedName CLASS(LocalBase)  <- ProcB's
// 25 SharedName.Run PROCEDURE     <- hover the prefix here; must resolve to 18, not 6
const LOCAL_CLW = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'ProcA PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'AVar LONG',
    '  CODE',
    '  AVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  AVar = 2',
    '',
    'ProcB PROCEDURE',
    'SharedName CLASS(LocalBase)',
    'Run PROCEDURE',
    '  END',
    'BVar LONG',
    '  CODE',
    '  BVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  BVar = 2',
    ''
].join('\n');

suite('MethodHoverResolver — hovering the class prefix resolves the CLASS declaration', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;
    let tmpRoot: string;
    let savedLibsrc: string[];
    let savedRed: string;
    let savedSm: SolutionManager | null;
    const indexer = StructureDeclarationIndexer.getInstance();

    suiteSetup(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'class-prefix-hover-'));
        fs.writeFileSync(path.join(tmpRoot, 'lib.inc'), LIB_INC, 'utf8');

        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;

        // One project rooted at the fixture dir, so the fixture path is a PROJECT key.
        const projects = [{ path: tmpRoot, sourceFiles: [] }];
        const findProjectForFile = (fp: string) =>
            path.normalize(fp).toLowerCase().startsWith(path.normalize(tmpRoot).toLowerCase() + path.sep)
                ? projects[0] : undefined;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects },
            findProjectForFile,
            getProjectPathForFile: (fp: string) => findProjectForFile(fp)?.path ?? path.dirname(fp),
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;

        // getOrBuildIndex short-circuits to an empty UNCACHED index without one.
        serverSettings.redirectionFile = 'test.red';
        serverSettings.libsrcPaths = [tmpRoot];
        indexer.clearCache();
        // getOrBuildIndex, not buildIndex: only the former registers the result in the
        // project-index map that find()/findFor() read.
        await indexer.getOrBuildIndex(tmpRoot);
    });

    suiteTeardown(async () => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        indexer.clearCache();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: unknown): string {
        const h = hover as { contents?: unknown } | null;
        if (!h || !h.contents) return '';
        const c = h.contents;
        return typeof c === 'string' ? c : ('value' in (c as object) ? (c as { value: string }).value : '');
    }

    function diskDoc(name: string, content: string): TextDocument {
        const filePath = path.join(tmpRoot, name);
        fs.writeFileSync(filePath, content, 'utf8');
        const uri = `file:///${filePath.replace(/\\/g, '/')}`;
        const doc = TextDocument.create(uri, 'clarion', 1, content);
        tokenCache.getTokens(doc);
        return doc;
    }

    test('library class: resolves to the .inc declaration, not the first method implementation in the .clw', async () => {
        const doc = diskDoc('lib.clw', LIB_CLW);

        // 0-based line 7 = 'MyLib.Second PROCEDURE()'; character 2 is inside 'MyLib'.
        const content = hoverText(await provider.provideHover(doc, Position.create(7, 2)));

        assert.ok(content.includes('Class declaration'),
            `should be a class declaration hover; got: ${content}`);
        assert.ok(content.includes('lib.inc:6'),
            `should cite the CLASS declaration at lib.inc:6; got: ${content}`);
        assert.ok(!content.includes('lib.clw:4'),
            `must NOT report the first method implementation (lib.clw:4) as the declaration; got: ${content}`);
        assert.ok(!/Second|First/.test(content.replace(/MyLib/g, '')),
            `must say nothing about any method; got: ${content}`);
        // #634 — tier 3 (cross-file index) carries parentName, so the card names it.
        assert.ok(/Extends.*BaseLib/.test(content),
            `should name the parent class BaseLib; got: ${content}`);
    });

    test('generated app class: still resolves to the CLASS line declared in the same .clw', async () => {
        const doc = diskDoc('app.clw', APP_CLW);

        // 0-based line 15 = 'AppWin.Kill PROCEDURE()'; character 2 is inside 'AppWin'.
        const content = hoverText(await provider.provideHover(doc, Position.create(15, 2)));

        assert.ok(content.includes('Class declaration'),
            `should be a class declaration hover; got: ${content}`);
        assert.ok(content.includes('app.clw:5'),
            `should cite the CLASS line at app.clw:5; got: ${content}`);
        assert.ok(!content.includes('app.clw:12'),
            `must NOT cite the first method implementation at app.clw:12; got: ${content}`);
        // #634 — the generated-app case, and the reason this matters: which framework class
        // a window manager derives from is the fact you hover the prefix to find out.
        assert.ok(/Extends.*WindowManager/.test(content),
            `should name the parent class WindowManager; got: ${content}`);
    });

    test('procedure-local class: resolves to the declaration in the hovered method\'s OWN procedure', async () => {
        const doc = diskDoc('local.clw', LOCAL_CLW);

        // 0-based line 24 = ProcB's 'SharedName.Run PROCEDURE'; character 2 is inside 'SharedName'.
        const content = hoverText(await provider.provideHover(doc, Position.create(24, 2)));

        assert.ok(content.includes('Class declaration'),
            `should be a class declaration hover; got: ${content}`);
        assert.ok(content.includes('local.clw:18'),
            `should cite ProcB's own local CLASS at local.clw:18; got: ${content}`);
        assert.ok(!content.includes('local.clw:6'),
            `must NOT cite ProcA's same-named local CLASS at local.clw:6; got: ${content}`);
        // #634 — tier 1 reads the parent off the declaration it picked, so naming LocalBase
        // is also a second, independent check that it picked ProcB's and not ProcA's.
        assert.ok(/Extends.*LocalBase/.test(content),
            `should name ProcB's parent class LocalBase; got: ${content}`);
    });

    // #634 — a class with no parent must not render an empty "Extends:" line.
    test('a class declared without a parent names no parent', async () => {
        const doc = diskDoc('local.clw', LOCAL_CLW);

        // 0-based line 12 = ProcA's 'SharedName.Run PROCEDURE'; ProcA's class has no parent.
        const content = hoverText(await provider.provideHover(doc, Position.create(12, 2)));

        assert.ok(content.includes('Class declaration'),
            `should be a class declaration hover; got: ${content}`);
        assert.ok(content.includes('local.clw:6'),
            `should cite ProcA's own local CLASS at local.clw:6; got: ${content}`);
        assert.ok(!/Extends/.test(content),
            `a parentless class must not render an Extends line; got: ${content}`);
        assert.ok(!/LocalBase/.test(content),
            `must not borrow ProcB's parent; got: ${content}`);
    });
});
