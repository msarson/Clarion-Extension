import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * Issue #131 — 3rd shape: chained `SELF.inner.SetValue(args)` overload resolution.
 *
 * Unlike the SELF / PARENT shapes (covered in-memory by
 * SelfParentChainedOverloadResolution.test.ts), the chained shape routes through
 * `ChainedPropertyResolver`, whose intermediate-segment walk resolves member
 * types via the `StructureDeclarationIndexer` (SDI). The SDI only indexes
 * on-disk `.inc`/`.equ` files reachable through a redirection file + libsrc
 * paths — it does NOT see an in-memory-only TextDocument. So this shape cannot
 * be exercised by a pure in-memory fixture; it needs files on disk and a
 * (mock) loaded solution, which is the "disk-based fixture mirroring Mark's
 * compilation model" that #131's Verify-shape section calls for.
 *
 * Phase A finding (empirical, via DefinitionProvider.provideDefinition against
 * the disk fixture below):
 *   - chained `SELF.inner.SetValue('s')` → WRONG: the chain walked to the right
 *     class (StringTheory) but the final lookup was paramCount-only, so it
 *     picked the first-declared same-arity overload regardless of arg type.
 *
 * Root cause: `ChainedPropertyResolver.resolve` step 3 used a paramCount-only
 * `findMemberInNamedStructure`. The #125 arg-classification overlay
 * (`tryArgClassifyResolve`) was wired into the SELF / PARENT / typed-var
 * branches of DefinitionProvider but NOT the chained branch.
 *
 * Fix: `ChainedPropertyResolver.resolveFinalClassName` exposes the chain's
 * resolved final class; the DefinitionProvider chained branch runs the same
 * arg-classification overlay against it before the paramCount-only fallback.
 *
 * Discriminator (shared with the #125 Mark-repro): `SetValue(STRING,LONG=default)`
 * vs `SetValue(StringTheory)`. A STRING-literal call must resolve to the STRING
 * overload, pinned in BOTH declaration orders so the fix is proven argument-aware
 * rather than order-dependent (per feedback_bidirectional_pin_assertion).
 */

const STRING_DECL = 'SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL';
const CLASSREF_DECL = 'SetValue PROCEDURE(StringTheory newValue),VIRTUAL';

interface DiskFixture {
    tmpRoot: string;
    callerUri: string;
    callerDoc: TextDocument;
    /** 0-based line of the SELF-rooted call site `SELF.inner.SetValue('Hello World')`. */
    selfCallLine: number;
    /** 0-based line of the typed-var-rooted call site `outer.inner.SetValue('Hello World')`. */
    varCallLine: number;
}

let _savedSm: SolutionManager | null = null;
let _savedRedirectionFile = '';
let _savedLibsrcPaths: string[] = [];
let _active = false;

/**
 * Build a self-contained disk fixture: a tmp dir holding a `.red`, a `.inc`
 * declaring `StringTheory` (two SetValue overloads) + `OuterClass` (with an
 * `inner &StringTheory` member), and a caller `.clw`. Wires `serverSettings`
 * + a `SolutionManager` mock so the SDI indexes the tmp dir.
 *
 * @param classRefFirst when true, the StringTheory class-ref overload is
 *   declared on `.inc` line 1 and STRING on line 2 (so the STRING target is
 *   line 2); when false the order is swapped (STRING target is line 1).
 */
function buildDiskFixture(classRefFirst: boolean): DiskFixture {
    if (_active) {
        throw new Error('Chained disk fixture already active — teardown first');
    }
    _active = true;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '131-chained-'));

    const decls = classRefFirst
        ? [CLASSREF_DECL, STRING_DECL]   // STRING target → .inc line 2
        : [STRING_DECL, CLASSREF_DECL];  // STRING target → .inc line 1
    const incContent = [
        'StringTheory CLASS,TYPE',
        decls[0],                 // .inc line 1
        decls[1],                 // .inc line 2
        '        END',
        '',
        'OuterClass CLASS,TYPE',
        'inner       &StringTheory',
        'DoIt        PROCEDURE',
        '        END',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpRoot, 'myclasses.inc'), incContent);

    // Minimal redirection file — must exist + parse without throwing so the SDI
    // gate passes; the actual scan dir is supplied via serverSettings.libsrcPaths.
    fs.writeFileSync(path.join(tmpRoot, 'test.red'), '[Copy]\n*.inc = .\n');

    // Two chained call sites, exercising both routing paths in DefinitionProvider:
    //   - SELF-rooted chain  → the SELF/PARENT chained branch
    //   - typed-var-rooted chain (`outer.inner...`) → the typed-var chained branch
    const callerContent = [
        '  MEMBER()',
        "  INCLUDE('myclasses.inc')",
        'outer       &OuterClass',                  // line 2 — typed var
        '',
        'OuterClass.DoIt PROCEDURE',
        '  CODE',
        "  SELF.inner.SetValue('Hello World')",     // SELF call site, line 6
        "  outer.inner.SetValue('Hello World')",    // typed-var call site, line 7
        '  RETURN',
    ].join('\n');
    const callerPath = path.join(tmpRoot, 'caller.clw');
    fs.writeFileSync(callerPath, callerContent);
    const callerUri = `file:///${callerPath.replace(/\\/g, '/')}`;

    // Wire settings: redirectionFile is a filename joined to the project path;
    // libsrcPaths supplies the dir the SDI scans directly.
    _savedRedirectionFile = serverSettings.redirectionFile;
    _savedLibsrcPaths = serverSettings.libsrcPaths;
    serverSettings.redirectionFile = 'test.red';
    serverSettings.libsrcPaths = [tmpRoot];

    const fakeProject = {
        name: 'TestProj',
        path: tmpRoot,
        sourceFiles: [{ relativePath: 'caller.clw', getAbsolutePath: () => callerPath }],
        getRedirectionParser: () => ({ findFile: (_: string) => null })
    };
    const fakeSm = {
        solution: { projects: [fakeProject] },
        findProjectForFile: () => fakeProject,
        getProjectPathForFile: () => tmpRoot,
        getEquatesTokens: () => null,
        getEquatesPath: () => null
    } as unknown as SolutionManager;

    _savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;

    // Fresh SDI so it rebuilds against this fixture's dir.
    StructureDeclarationIndexer.getInstance().clearCache();

    const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
    TokenCache.getInstance().getTokens(callerDoc);

    return { tmpRoot, callerUri, callerDoc, selfCallLine: 6, varCallLine: 7 };
}

function teardownDiskFixture(fix: DiskFixture | null): void {
    if (!_active) return;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _savedSm;
    _savedSm = null;
    serverSettings.redirectionFile = _savedRedirectionFile;
    serverSettings.libsrcPaths = _savedLibsrcPaths;
    StructureDeclarationIndexer.getInstance().clearCache();
    if (fix) {
        TokenCache.getInstance().clearTokens(fix.callerUri);
        try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    _active = false;
}

function lineOf(result: Location | Location[] | null | undefined): number {
    if (!result) return -1;
    if (Array.isArray(result)) return result.length > 0 ? result[0].range.start.line : -1;
    return result.range.start.line;
}

suite('Issue #131 — chained SELF.inner.Method(args) overload resolution (disk fixture)', () => {

    let fix: DiskFixture | null = null;

    teardown(() => {
        teardownDiskFixture(fix);
        fix = null;
    });

    // Cursor sits inside SetValue at each call site:
    //   SELF:     `  SELF.inner.SetValue(...)`  → 2 + "SELF.inner." (11) = 13; char 15 inside.
    //   typed-var:`  outer.inner.SetValue(...)` → 2 + "outer.inner." (12) = 14; char 16 inside.
    const SELF_CALL_CHAR = 15;
    const VAR_CALL_CHAR = 16;

    // ── SELF-rooted chain → SELF/PARENT chained branch ────────────────────────
    test("SELF.inner.SetValue('s') resolves to STRING overload (class-ref declared first)", async () => {
        fix = buildDiskFixture(/* classRefFirst */ true);
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(fix.callerDoc, { line: fix.selfCallLine, character: SELF_CALL_CHAR }));
        assert.strictEqual(line, 2, `chained SELF.inner must resolve to STRING overload (.inc line 2); got ${line}`);
        assert.notStrictEqual(line, 1, 'must NOT pick the StringTheory class-ref overload');
    });

    test("SELF.inner.SetValue('s') resolves to STRING overload (STRING declared first)", async () => {
        fix = buildDiskFixture(/* classRefFirst */ false);
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(fix.callerDoc, { line: fix.selfCallLine, character: SELF_CALL_CHAR }));
        assert.strictEqual(line, 1, `chained SELF.inner must resolve to STRING overload (.inc line 1); got ${line}`);
        assert.notStrictEqual(line, 2, 'must NOT pick the StringTheory class-ref overload');
    });

    // ── Typed-var-rooted chain → typed-var chained branch ─────────────────────
    // The shape from #131's own example (`obj.a.b.Method(args)`) and the session
    // handoff probe spec (`outer.inner.SetValue('s')`). A separate routing path.
    test("outer.inner.SetValue('s') resolves to STRING overload (class-ref declared first)", async () => {
        fix = buildDiskFixture(/* classRefFirst */ true);
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(fix.callerDoc, { line: fix.varCallLine, character: VAR_CALL_CHAR }));
        assert.strictEqual(line, 2, `chained outer.inner must resolve to STRING overload (.inc line 2); got ${line}`);
        assert.notStrictEqual(line, 1, 'must NOT pick the StringTheory class-ref overload');
    });

    test("outer.inner.SetValue('s') resolves to STRING overload (STRING declared first)", async () => {
        fix = buildDiskFixture(/* classRefFirst */ false);
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(fix.callerDoc, { line: fix.varCallLine, character: VAR_CALL_CHAR }));
        assert.strictEqual(line, 1, `chained outer.inner must resolve to STRING overload (.inc line 1); got ${line}`);
        assert.notStrictEqual(line, 2, 'must NOT pick the StringTheory class-ref overload');
    });
});
