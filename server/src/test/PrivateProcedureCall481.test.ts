import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { validatePrivateProcedureCalls } from '../providers/diagnostics/PrivateProcedureDiagnostics';

/**
 * #481 — a call to a PRIVATE MAP prototype from outside its own module is a compile
 * error ("Invalid use of PRIVATE procedure") that the extension did not report.
 *
 * Every rule pinned here was established by compiling it on Clarion 10.0.12567, one
 * project per case, PROGRAM main.clw + members modA.clw / modB.clw, HiddenProc
 * prototyped in the PROGRAM's MAP inside MODULE('modA.clw'):
 *
 *   ,PRIVATE  called from modB (another member)            -> error
 *   (plain)   called from modB                              -> builds   (control)
 *   ,PRIVATE  called from main.clw (the PROGRAM file)       -> error
 *   ,PRIVATE  called from modA (its own module)             -> builds
 *   ,PRIVATE  no MODULE() wrapper, body in main.clw,
 *             called from modB                              -> error; main's own call builds
 *   ,PRIVATE  `IF HiddenFunc() = 1 THEN.` from modB         -> error    (plain control builds)
 *   ,PRIVATE  bare statement `HiddenProc` (no parens)       -> error
 *   ,PRIVATE  `START(HiddenProc)` from modB                 -> builds
 *   ,PRIVATE  `X = ADDRESS(HiddenProc)` from modB           -> builds
 *
 * So the restriction is on CALLING it: a statement or expression call, with or
 * without parens. Naming it as a procedure reference is not a use.
 *
 * The PRIVATE help topic agrees ("may be called only from another PROCEDURE within
 * the same source MODULE"), and its own example puts ,PRIVATE inside a MAP's
 * MODULE() block.
 *
 * Fixtures are ANSI + CRLF on disk, resolved through the relative-path route (no
 * solution loaded), which is also what a no-solution-open user gets.
 */

function writeCrlf(filePath: string, lines: string[]): void {
    fs.writeFileSync(filePath, lines.join('\r\n') + '\r\n', { encoding: 'latin1' });
}

interface Layout {
    /** Lines of the PROGRAM's MAP, between `MAP` and its `END`. */
    map?: string[];
    /** Extra statements in the PROGRAM's CODE section. */
    mainCode?: string[];
    /** Procedures implemented after the PROGRAM's CODE section. */
    mainProcs?: string[];
    modA?: string[];
    modB?: string[];
    memberTarget?: string;
}

const DEFAULT_MAP = [
    "    MODULE('modA.clw')",
    'HiddenProc PROCEDURE(),PRIVATE',
    'HiddenFunc PROCEDURE(),LONG,PRIVATE',
    'SharedProc PROCEDURE()',
    'CallerA    PROCEDURE()',
    '    END',
    "    MODULE('modB.clw')",
    'CallerB    PROCEDURE()',
    '    END',
];

suite('#481 — a call to a PRIVATE MAP prototype from another module is reported', () => {

    let tmpDir: string;

    setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clw481_')); });

    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        TokenCache.getInstance().clearAllTokens();
    });

    function build(layout: Layout): void {
        const target = layout.memberTarget ?? 'main.clw';
        writeCrlf(path.join(tmpDir, 'main.clw'), [
            '  PROGRAM',
            '  MAP',
            ...(layout.map ?? DEFAULT_MAP),
            '  END',
            '  CODE',
            '  CallerA()',
            '  CallerB()',
            ...(layout.mainCode ?? []),
            ...(layout.mainProcs ?? []),
        ]);
        writeCrlf(path.join(tmpDir, 'modA.clw'), layout.modA ?? [
            `  MEMBER('${target}')`,
            'HiddenProc PROCEDURE',
            '  CODE',
            'HiddenFunc PROCEDURE',
            '  CODE',
            '  RETURN 1',
            'SharedProc PROCEDURE',
            '  CODE',
            'CallerA    PROCEDURE',
            '  CODE',
        ]);
        writeCrlf(path.join(tmpDir, 'modB.clw'), layout.modB ?? [
            `  MEMBER('${target}')`,
            'CallerB    PROCEDURE',
            '  CODE',
        ]);
    }

    /** modB with `statements` in CallerB's CODE section. */
    function modBCalling(statements: string[], memberTarget = 'main.clw'): string[] {
        return [
            `  MEMBER('${memberTarget}')`,
            'CallerB    PROCEDURE',
            'X LONG',
            '  CODE',
            ...statements,
        ];
    }

    async function diagnose(file: string): Promise<{ message: string; line: number; character: number; code?: string | number }[]> {
        const filePath = path.join(tmpDir, file);
        const uri = 'file:///' + filePath.replace(/\\/g, '/');
        const doc = TextDocument.create(uri, 'clarion', 1, fs.readFileSync(filePath, 'latin1'));
        const tokens = TokenCache.getInstance().getTokens(doc);
        const diags = await validatePrivateProcedureCalls(tokens, doc);
        return diags.map(d => ({ message: String(d.message), line: d.range.start.line, character: d.range.start.character, code: d.code }));
    }

    function assertOneWarningFor(diags: { message: string; line: number; character: number; code?: string | number }[], name: string, line: number, character: number): void {
        assert.strictEqual(diags.length, 1, `expected exactly one warning, got: ${JSON.stringify(diags)}`);
        assert.ok(String(diags[0].message).includes(name), `the warning must name ${name}: ${diags[0].message}`);
        assert.ok(/PRIVATE/.test(String(diags[0].message)), `the warning must say why: ${diags[0].message}`);
        assert.strictEqual(diags[0].code, 'private-procedure-call');
        assert.deepStrictEqual({ line: diags[0].line, character: diags[0].character }, { line, character },
            'the warning must sit on the call, not the line start');
    }

    // ── Compiler: error ────────────────────────────────────────────────────────

    test('a call from another member module is reported', async () => {
        build({ modB: modBCalling(['  HiddenProc()']) });
        assertOneWarningFor(await diagnose('modB.clw'), 'HiddenProc', 4, 2);
    });

    test('a call from the PROGRAM file itself is reported — it is not the module named by MODULE()', async () => {
        build({ mainCode: ['  HiddenProc()'] });
        assertOneWarningFor(await diagnose('main.clw'), 'HiddenProc', 15, 2);
    });

    test('a call inside an expression is reported', async () => {
        build({ modB: modBCalling(['  IF HiddenFunc() = 1 THEN.']) });
        assertOneWarningFor(await diagnose('modB.clw'), 'HiddenFunc', 4, 5);
    });

    test('a bare statement call without parens is reported', async () => {
        build({ modB: modBCalling(['  HiddenProc']) });
        assertOneWarningFor(await diagnose('modB.clw'), 'HiddenProc', 4, 2);
    });

    test('a PRIVATE prototype with no MODULE() wrapper belongs to the PROGRAM file', async () => {
        build({
            map: ['LocalPriv  PROCEDURE(),PRIVATE', ...DEFAULT_MAP],
            mainCode: ['  LocalPriv()'],
            mainProcs: ['LocalPriv  PROCEDURE', '  CODE'],
            modB: modBCalling(['  LocalPriv()']),
        });
        assertOneWarningFor(await diagnose('modB.clw'), 'LocalPriv', 4, 2);
        assert.deepStrictEqual(await diagnose('main.clw'), [],
            "the PROGRAM file is that procedure's own module, so its call is legal");
    });

    test('a PRIVATE attribute on a | continuation line still counts', async () => {
        build({
            map: ["    MODULE('modA.clw')", 'HiddenProc PROCEDURE() |', '           ,PRIVATE', '    END'],
            modB: modBCalling(['  HiddenProc()']),
        });
        assertOneWarningFor(await diagnose('modB.clw'), 'HiddenProc', 4, 2);
    });

    test('an extension-less MEMBER target still finds the PROGRAM', async () => {
        build({ memberTarget: 'main', modB: modBCalling(['  HiddenProc()'], 'main') });
        assertOneWarningFor(await diagnose('modB.clw'), 'HiddenProc', 4, 2);
    });

    // ── Compiler: builds ───────────────────────────────────────────────────────

    test('a call from its own module is not reported', async () => {
        build({
            modA: [
                "  MEMBER('main.clw')",
                'HiddenProc PROCEDURE',
                '  CODE',
                'HiddenFunc PROCEDURE',
                '  CODE',
                '  RETURN 1',
                'SharedProc PROCEDURE',
                '  CODE',
                'CallerA    PROCEDURE',
                '  CODE',
                '  HiddenProc()',
                '  IF HiddenFunc() = 1 THEN.',
            ],
        });
        assert.deepStrictEqual(await diagnose('modA.clw'), []);
    });

    test('its own module is still recognised when MODULE() omits the extension', async () => {
        build({
            map: ["    MODULE('modA')", 'HiddenProc PROCEDURE(),PRIVATE', 'CallerA    PROCEDURE()', '    END'],
            modA: ["  MEMBER('main.clw')", 'HiddenProc PROCEDURE', '  CODE', 'CallerA    PROCEDURE', '  CODE', '  HiddenProc()'],
        });
        assert.deepStrictEqual(await diagnose('modA.clw'), []);
    });

    test('control: the same call to a prototype WITHOUT PRIVATE is not reported', async () => {
        build({ modB: modBCalling(['  SharedProc()']) });
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });

    test('a procedure reference is not a call — START and ADDRESS are not reported', async () => {
        build({ modB: modBCalling(['  START(HiddenProc)', '  X = ADDRESS(HiddenProc)']) });
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });

    // ── Not a call at all ──────────────────────────────────────────────────────

    test('the name inside a string literal or a comment is not reported', async () => {
        build({ modB: modBCalling(["  MESSAGE('HiddenProc()')", '  X = 1 ! HiddenProc()']) });
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });

    test('PRIVATE mentioned only in a comment does not make a prototype private', async () => {
        build({
            // `! was ,PRIVATE` splits on its comma into an exact `PRIVATE` part, so this
            // only passes if the comment is stripped before the attributes are read.
            map: ["    MODULE('modA.clw')", 'HiddenProc PROCEDURE() ! was ,PRIVATE', '    END'],
            modB: modBCalling(['  HiddenProc()']),
        });
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });

    test('a PRIVATE CLASS method is a different rule and is not swept in', async () => {
        // Same keyword, different meaning: a PRIVATE method is private to its CLASS's
        // module. It is not a MAP prototype and must not become one here.
        build({
            map: ["    MODULE('modB.clw')", 'CallerB    PROCEDURE()', '    END', "    MODULE('modA.clw')", 'CallerA    PROCEDURE()', '    END'],
            modA: ["  MEMBER('main.clw')", 'CallerA    PROCEDURE', '  CODE'],
            modB: [
                "  MEMBER('main.clw')",
                'Widget     CLASS',
                'Tick         PROCEDURE(),PRIVATE',
                '           END',
                'CallerB    PROCEDURE',
                '  CODE',
                '  Widget.Tick()',
                'Widget.Tick PROCEDURE',
                '  CODE',
            ],
        });
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });

    test("a MAP prototype is a declaration, not a call — even the keyword-less form", async () => {
        // `HiddenProc(),PRIVATE` tokenizes like a call; the `Name PROCEDURE` form does
        // not, so only this shape proves MAP contents are excluded. Compiles clean.
        build({
            map: ["    MODULE('modA.clw')", '      HiddenProc(),PRIVATE', 'CallerA    PROCEDURE()', '    END',
                  "    MODULE('modB.clw')", 'CallerB    PROCEDURE()', '    END'],
        });
        assert.deepStrictEqual(await diagnose('main.clw'), []);
    });

    // ── Keyword-less prototypes ────────────────────────────────────────────────
    //
    // The tokenizer parents `HiddenProc(),PRIVATE` to the MAP, not to the MODULE()
    // around it (the `Name PROCEDURE` form is parented to the MODULE). Read naively,
    // the wrapper vanishes and the prototype looks like it belongs to the PROGRAM.

    const KEYWORDLESS_MAP = ["    MODULE('modA.clw')", '      HiddenProc(),PRIVATE', 'CallerA    PROCEDURE()', '    END',
                             "    MODULE('modB.clw')", 'CallerB    PROCEDURE()', '    END'];

    test('a keyword-less PRIVATE prototype still belongs to its MODULE() — its own module may call it', async () => {
        build({
            map: KEYWORDLESS_MAP,
            modA: ["  MEMBER('main.clw')", 'HiddenProc PROCEDURE', '  CODE', 'CallerA    PROCEDURE', '  CODE', '  HiddenProc()'],
        });
        assert.deepStrictEqual(await diagnose('modA.clw'), []);
    });

    test('a keyword-less PRIVATE prototype called from another module names the right owner', async () => {
        build({
            map: KEYWORDLESS_MAP,
            modA: ["  MEMBER('main.clw')", 'HiddenProc PROCEDURE', '  CODE', 'CallerA    PROCEDURE', '  CODE'],
            modB: modBCalling(['  HiddenProc()']),
        });
        const diags = await diagnose('modB.clw');
        assertOneWarningFor(diags, 'HiddenProc', 4, 2);
        assert.ok(String(diags[0].message).includes('modA.clw'), `must name the owning module: ${diags[0].message}`);
    });

    // ── Overloads ──────────────────────────────────────────────────────────────

    test('overloads: a call is not reported unless every overload of the name is PRIVATE', async () => {
        // Compiler: with Helper() public and Helper(LONG),PRIVATE, calling Helper() from
        // another module builds, while Helper(1) fails. Telling those apart needs
        // overload resolution, so only the all-PRIVATE case is reported — Helper(1) is
        // a known miss, never a false alarm on Helper().
        build({
            map: ["    MODULE('modA.clw')", 'Helper     PROCEDURE()', 'Helper     PROCEDURE(LONG pN),PRIVATE', 'CallerA    PROCEDURE()', '    END',
                  "    MODULE('modB.clw')", 'CallerB    PROCEDURE()', '    END'],
            modA: ["  MEMBER('main.clw')", 'Helper     PROCEDURE()', '  CODE', 'Helper     PROCEDURE(LONG pN)', '  CODE', 'CallerA    PROCEDURE', '  CODE'],
            modB: modBCalling(['  Helper()']),
        });
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });

    // ── Every MAP, not just the PROGRAM's ──────────────────────────────────────

    /** PROGRAM whose procedure Worker has a local MAP declaring LocalHelper in modA. */
    function buildLocalMap(attr: string): void {
        writeCrlf(path.join(tmpDir, 'main.clw'), [
            '  PROGRAM',
            '  MAP',
            "    MODULE('modA.clw')",
            'CallerA    PROCEDURE()',
            '    END',
            'Worker     PROCEDURE()',
            '  END',
            '  CODE',
            '  CallerA()',
            '  Worker()',
            'Worker     PROCEDURE',
            '  MAP',
            "    MODULE('modA.clw')",
            `LocalHelper PROCEDURE()${attr}`,
            '    END',
            '  END',
            '  CODE',
            '  LocalHelper()',
        ]);
        writeCrlf(path.join(tmpDir, 'modA.clw'), [
            "  MEMBER('main.clw')",
            '  MAP',
            'LocalHelper PROCEDURE()',
            '  END',
            'CallerA    PROCEDURE',
            '  CODE',
            'LocalHelper PROCEDURE',
            '  CODE',
        ]);
    }

    test("a PRIVATE prototype in a procedure's local MAP is enforced too", async () => {
        // Compiler: error at the call in Worker — the local MAP's MODULE() names modA.
        buildLocalMap(',PRIVATE');
        assertOneWarningFor(await diagnose('main.clw'), 'LocalHelper', 17, 2);
    });

    test("control: the same local MAP prototype without PRIVATE is not reported", async () => {
        buildLocalMap('');
        assert.deepStrictEqual(await diagnose('main.clw'), []);
    });

    /** modB whose own module-level MAP declares MemberHelper in modA. */
    function buildMemberMap(attr: string): void {
        build({
            map: ["    MODULE('modA.clw')", 'CallerA    PROCEDURE()', '    END', "    MODULE('modB.clw')", 'CallerB    PROCEDURE()', '    END'],
            modA: ["  MEMBER('main.clw')", '  MAP', 'MemberHelper PROCEDURE()', '  END', 'CallerA    PROCEDURE', '  CODE', 'MemberHelper PROCEDURE', '  CODE'],
            modB: [
                "  MEMBER('main.clw')",
                '  MAP',
                "    MODULE('modA.clw')",
                `MemberHelper PROCEDURE()${attr}`,
                '    END',
                '  END',
                'CallerB    PROCEDURE',
                '  CODE',
                '  MemberHelper()',
            ],
        });
    }

    test("a PRIVATE prototype in a MEMBER's own MAP is enforced when MODULE() names another file", async () => {
        // Compiler: error — a MEMBER's MAP confines visibility, not the PRIVATE rule.
        buildMemberMap(',PRIVATE');
        assertOneWarningFor(await diagnose('modB.clw'), 'MemberHelper', 8, 2);
    });

    test("control: the same MEMBER MAP prototype without PRIVATE is not reported", async () => {
        buildMemberMap('');
        assert.deepStrictEqual(await diagnose('modB.clw'), []);
    });
});
