import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { FileRelationshipGraph, FileEdge } from '../FileRelationshipGraph';

/**
 * Issue #129 — Goto Definition on bare procedure calls (`LocalProc1('b')`,
 * `ReallyTestingRename('a')`) must walk MAP scopes per Clarion's compilation
 * model + apply arg-classify for overload disambiguation.
 *
 * Companion to #125-#128 (which fixed class-method-on-typed-var calls).
 * Different code path in DefinitionProvider: bare procedure calls dispatch
 * through `MapProcedureResolver.findMapDeclaration` (DefinitionProvider:281),
 * NOT `MethodOverloadResolver.findMethodDeclaration`.
 *
 * ─── Scope-walking order (Mark-confirmed 2026-05-11, innermost-first) ──────
 *
 *   1. Procedure-local MAP (if call site is inside a procedure with local MAP)
 *   2. Module-level MAP (file-scope)
 *   3. Cross-file MODULE refs (`MODULE('other.clw')` inside MAPs — decl visible
 *      in caller, impl elsewhere)
 *   4. PROGRAM-scope MAPs (via MEMBER chain — reuses #128's FRG substrate)
 *   5. INCLUDE'd content at PROGRAM scope
 *
 * ─── Q4 docs answer — multi-overload-per-MAP IS LEGAL ───────────────────────
 *
 * Per `rules_for_procedure_overloading.htm` + Mark's 2026-05-11 verdict
 * (`project_clarion_overload_resolution_rule.md`): procedure overloading
 * rules apply at ANY scope (MAP, CLASS, INTERFACE). Walker collects ALL
 * candidates across the scope chain; arg-classify disambiguates the union.
 * Innermost-first is a tiebreaker, not an early-exit.
 *
 * ─── Phase B fix (Alice) ────────────────────────────────────────────────────
 *
 * New public method on `MapProcedureResolver`:
 *
 *   findAllProcedureDeclarationsInScope(
 *     procName: string,
 *     document: TextDocument,
 *     callLine: number,
 *   ): MapProcedureCandidate[]  // file, line, signature, scopeLevel:1..5
 *
 * Composes existing primitives — no new substrate API needed:
 *   - DocumentStructure: enclosing procedure, MAP block enumeration
 *   - MapProcedureResolver: existing `extractModuleBlockForProcedure` for MODULE refs
 *   - FileRelationshipGraph: getProgramFile + getForwardEdges (per #128)
 *   - MethodOverloadResolver: findOverloadByArgClassifications for disambiguation
 *
 * DefinitionProvider wires this through `tryArgClassifyResolveProcedure` (parallel
 * to existing `tryArgClassifyResolve` for class methods).
 *
 * ─── Test approach ──────────────────────────────────────────────────────────
 *
 * Disk-based fixture per `feedback_red_fixture_matches_user_repro.md`. Mirrors
 * Mark's `f:/Playground/SimpleNewSln/MyNextProcedure2.clw` reference shape:
 *   - SimpleNewSln.clw (PROGRAM, module-level MAP with cross-file MODULE refs)
 *   - MyLocalProc.clw (the cross-file MODULE'd impl)
 *   - MyNextProcedure2.clw (MEMBER, module-level MAP, proc with 2 local MAPs,
 *     CODE with 4 bare-procedure calls)
 *
 * FRG seeded via `seedEdgesForTest` for MEMBER + INCLUDE relationships.
 *
 * Bidirectional pin per `feedback_bidirectional_pin_assertion` — each positive
 * asserts the right decl IS resolved + the wrong file/scope is NOT resolved.
 */

// Mark's exact MyNextProcedure2.clw shape (per `f:/Playground/SimpleNewSln/MyNextProcedure2.clw`).
const MY_NEXT_PROCEDURE2_CLW = [
    "  MEMBER('SimpleNewSln.clw')",                                                   // line 0
    "",                                                                               // line 1
    "    MAP",                                                                        // line 2
    "        MODULE('MyLocalProc.clw')",                                              // line 3
    "LocalProc1  PROCEDURE(STRING p1)",                                               // line 4 — cross-file MODULE decl
    "        END",                                                                    // line 5
    "    END",                                                                        // line 6
    "",                                                                               // line 7
    "MyNextProcedure2    PROCEDURE(long param1, long param2, string param3, string param4)",  // line 8
    "    MAP",                                                                        // line 9
    "ReallyTestingRename    PROCEDURE(string p1)",                                    // line 10 — proc-local MAP #1
    "    END",                                                                        // line 11
    "",                                                                               // line 12
    "    MAP",                                                                        // line 13
    "ProcLevelMap2    PROCEDURE()",                                                   // line 14 — proc-local MAP #2
    "    END",                                                                        // line 15
    "",                                                                               // line 16
    "    CODE",                                                                       // line 17
    "    ReallyTestingRename('a')",                                                   // line 18 — CALL: proc-local MAP
    "    ProcLevelMap2()",                                                            // line 19 — CALL: proc-local MAP zero-arg
    "    LocalProc1('b')",                                                            // line 20 — CALL: cross-file MODULE
    "    MyNextProcedure2(1,2,'test','test2')",                                       // line 21 — CALL: recursive self
    "",                                                                               // line 22
    "ReallyTestingRename    PROCEDURE(string p1)",                                    // line 23 — impl for line 10
    "    CODE",                                                                       // line 24
    "    RETURN",                                                                     // line 25
    "",                                                                               // line 26
    "ProcLevelMap2    PROCEDURE()",                                                   // line 27 — impl for line 14
    "    CODE",                                                                       // line 28
    "    RETURN",                                                                     // line 29
].join('\n');

const MY_LOCAL_PROC_CLW = [
    "  MEMBER('SimpleNewSln.clw')",                                                   // line 0
    "",                                                                               // line 1
    "LocalProc1    PROCEDURE(STRING p1)",                                             // line 2 — impl referenced via MODULE
    "    CODE",                                                                       // line 3
    "    RETURN",                                                                     // line 4
].join('\n');

const SIMPLE_NEW_SLN_CLW = [
    "  PROGRAM",                                                                      // line 0
    "  MAP",                                                                          // line 1
    "  END",                                                                          // line 2
    "  CODE",                                                                         // line 3
    "  RETURN",                                                                       // line 4
].join('\n');

function getLocationLine(result: Location | Location[] | null | undefined): number {
    if (!result) return -1;
    if (Array.isArray(result)) return result.length > 0 ? result[0].range.start.line : -1;
    return result.range.start.line;
}

function getLocationUri(result: Location | Location[] | null | undefined): string {
    if (!result) return '';
    if (Array.isArray(result)) return result.length > 0 ? result[0].uri : '';
    return result.uri;
}

interface ScopeFixture {
    tmpDir: string;
    files: Record<string, string>;
    callerUri: string;
    callerDoc: TextDocument;
}

function setupFixture(
    fileMap: Record<string, string>,
    callerFileName: string,
    callerContent: string,
    edges: FileEdge[]
): ScopeFixture {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-129-'));
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(fileMap)) {
        const fullPath = path.join(tmpDir, name);
        fs.writeFileSync(fullPath, content, 'utf8');
        files[name] = fullPath;
    }
    const callerPath = path.join(tmpDir, callerFileName);
    fs.writeFileSync(callerPath, callerContent, 'utf8');
    files[callerFileName] = callerPath;
    const callerUri = 'file:///' + callerPath.replace(/\\/g, '/');
    const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
    TokenCache.getInstance().getTokens(callerDoc);

    const resolvedEdges: FileEdge[] = edges.map(e => ({
        ...e,
        fromFile: path.join(tmpDir, e.fromFile),
        toFile: path.join(tmpDir, e.toFile),
    }));
    FileRelationshipGraph.getInstance().seedEdgesForTest(resolvedEdges);

    return { tmpDir, files, callerUri, callerDoc };
}

function teardownFixture(fx: ScopeFixture): void {
    TokenCache.getInstance().clearTokens(fx.callerUri);
    FileRelationshipGraph.getInstance().reset();
    for (const p of Object.values(fx.files)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(fx.tmpDir); } catch { /* ignore */ }
}

const MARK_FIXTURE_FILES = {
    'SimpleNewSln.clw': SIMPLE_NEW_SLN_CLW,
    'MyLocalProc.clw': MY_LOCAL_PROC_CLW,
};

const MARK_FIXTURE_EDGES: FileEdge[] = [
    { type: 'MEMBER', fromFile: 'MyNextProcedure2.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
    { type: 'MEMBER', fromFile: 'MyLocalProc.clw',     toFile: 'SimpleNewSln.clw', fromLine: 0 },
];

suite("DefinitionProvider — bare procedure call scope walker (#129 Phase A, Mark's MyNextProcedure2 repro)", () => {

    let fx: ScopeFixture;

    teardown(() => {
        if (fx) teardownFixture(fx);
    });

    // ─── Pin 1: Proc-local MAP resolution (innermost-first) ─────────────────

    test("ReallyTestingRename('a') resolves to its proc-local MAP decl at MyNextProcedure2.clw:10", async () => {
        fx = setupFixture(MARK_FIXTURE_FILES, 'MyNextProcedure2.clw', MY_NEXT_PROCEDURE2_CLW, MARK_FIXTURE_EDGES);
        const provider = new DefinitionProvider();
        // Cursor on `ReallyTestingRename` at line 18, around character 8
        const result = await provider.provideDefinition(fx.callerDoc, { line: 18, character: 10 });

        assert.ok(result, 'F12 must resolve ReallyTestingRename call to its proc-local MAP decl');
        const line = getLocationLine(result);
        const uri = getLocationUri(result);
        assert.ok(uri.toLowerCase().includes('mynextprocedure2.clw'),
            `F12 must target MyNextProcedure2.clw (proc-local MAP); got URI: ${uri}`);
        assert.strictEqual(line, 10,
            `F12 must target proc-local MAP decl at line 10; got line ${line}. ` +
            `If pointing to line 23 (the impl), the resolver picked impl-over-decl which contradicts Goto-Def semantics. ` +
            `If pointing to a different file, the proc-local MAP scan failed.`);
    });

    // ─── Pin 2: Proc-local MAP zero-arg ─────────────────────────────────────

    test("ProcLevelMap2() resolves to its proc-local MAP decl at MyNextProcedure2.clw:14", async () => {
        fx = setupFixture(MARK_FIXTURE_FILES, 'MyNextProcedure2.clw', MY_NEXT_PROCEDURE2_CLW, MARK_FIXTURE_EDGES);
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, { line: 19, character: 8 });

        assert.ok(result, 'F12 must resolve ProcLevelMap2 call');
        const line = getLocationLine(result);
        assert.strictEqual(line, 14, 'proc-local MAP decl at line 14');
    });

    // ─── Pin 3: Module-level MAP with cross-file MODULE ref ─────────────────

    test("LocalProc1('b') resolves to MyLocalProc.clw via module-level MAP's MODULE('MyLocalProc.clw') ref", async () => {
        fx = setupFixture(MARK_FIXTURE_FILES, 'MyNextProcedure2.clw', MY_NEXT_PROCEDURE2_CLW, MARK_FIXTURE_EDGES);
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, { line: 20, character: 8 });

        assert.ok(result, 'F12 must resolve LocalProc1 via MODULE cross-file ref');
        const uri = getLocationUri(result);
        // Two acceptable outcomes per Goto-Def semantics:
        //   (a) target the decl in MyNextProcedure2.clw line 4 (the MODULE decl)
        //   (b) target the impl in MyLocalProc.clw line 2 (existing resolver behavior may prefer impl)
        // Either is correct; what's WRONG is going to a different file entirely or to a non-existent line.
        const isModule = uri.toLowerCase().includes('mynextprocedure2.clw');
        const isImpl = uri.toLowerCase().includes('mylocalproc.clw');
        assert.ok(isModule || isImpl,
            `F12 must target MyNextProcedure2.clw (MODULE decl) OR MyLocalProc.clw (impl); got URI: ${uri}`);
    });

    // ─── Pin 4: Recursive self-call (PROGRAM-scope or current-file MAP) ─────

    test("MyNextProcedure2(1,2,'test','test2') resolves to its own decl at MyNextProcedure2.clw:8", async () => {
        fx = setupFixture(MARK_FIXTURE_FILES, 'MyNextProcedure2.clw', MY_NEXT_PROCEDURE2_CLW, MARK_FIXTURE_EDGES);
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, { line: 21, character: 8 });

        assert.ok(result, 'F12 must resolve recursive self-call');
        const line = getLocationLine(result);
        const uri = getLocationUri(result);
        assert.ok(uri.toLowerCase().includes('mynextprocedure2.clw'),
            `recursive self-call must target MyNextProcedure2.clw; got URI: ${uri}`);
        assert.strictEqual(line, 8,
            `F12 must target the procedure's own decl at line 8 (the PROCEDURE keyword line); got line ${line}.`);
    });

    // ─── Pin 5: Counter-example — undefined procedure ───────────────────────

    test("Counter-example — UndefinedProc() in CODE resolves to nothing (or non-spurious)", async () => {
        const callerWithUndef = MY_NEXT_PROCEDURE2_CLW.replace(
            "    MyNextProcedure2(1,2,'test','test2')",
            "    UndefinedProc()"
        );
        fx = setupFixture(MARK_FIXTURE_FILES, 'MyNextProcedure2.clw', callerWithUndef, MARK_FIXTURE_EDGES);
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, { line: 21, character: 8 });

        // Walker must return empty for undefined names; provider returns null OR
        // a non-spurious Location (e.g. word-extraction echo). The substantive
        // assertion: NO bogus cross-file resolution to a file/line that doesn't
        // contain an UndefinedProc decl.
        if (result) {
            const line = getLocationLine(result);
            const uri = getLocationUri(result);
            // If result points to a real decl, the walker is fabricating — flag it.
            assert.ok(!uri.toLowerCase().includes('mylocalproc.clw'),
                `undefined name MUST NOT spuriously resolve to MyLocalProc.clw; got URI: ${uri} line: ${line}`);
        }
    });

    // ─── Pin 6: Multi-overload disambiguation (Q4 docs answer) ──────────────

    test("Multi-overload in module-level MAP — STRING-literal call picks STRING overload, not LONG", async () => {
        // Tests that the scope walker collects ALL candidates + arg-classify
        // picks the right overload. Per Q4 docs answer, multi-overload IS LEGAL
        // at any scope (MAP, CLASS, INTERFACE).
        const TWO_OVERLOAD_CLW = [
            "  MEMBER('SimpleNewSln.clw')",
            "",
            "  MAP",
            "    MODULE('MyLocalProc.clw')",
            "MultiProc  PROCEDURE(STRING s)",                  // line 4 — STRING overload
            "MultiProc  PROCEDURE(*StringTheoryX class1)",     // line 5 — complex-type overload (legal pair: scalar vs class)
            "    END",
            "  END",
            "",
            "Caller    PROCEDURE()",
            "    CODE",
            "    MultiProc('hello')",                          // line 11 — STRING-literal call → must pick line 4 STRING overload
            "    RETURN",
        ].join('\n');

        const LOCAL_PROC_CLW = [
            "  MEMBER('SimpleNewSln.clw')",
            "",
            "MultiProc    PROCEDURE(STRING s)",
            "    CODE",
            "    RETURN",
            "",
            "MultiProc    PROCEDURE(*StringTheoryX class1)",
            "    CODE",
            "    RETURN",
        ].join('\n');

        fx = setupFixture(
            {
                'SimpleNewSln.clw': SIMPLE_NEW_SLN_CLW,
                'MyLocalProc.clw': LOCAL_PROC_CLW,
            },
            'CallerFile.clw',
            TWO_OVERLOAD_CLW,
            [
                { type: 'MEMBER', fromFile: 'CallerFile.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
                { type: 'MEMBER', fromFile: 'MyLocalProc.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
            ]
        );
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, { line: 11, character: 8 });

        assert.ok(result, 'F12 must resolve MultiProc call');
        const line = getLocationLine(result);
        // Per Q4 docs answer + Mark's rule 6 (complex-* implicit), the STRING decl is at line 4
        // and the complex-type decl is at line 5. STRING-literal call → STRING overload at line 4.
        assert.strictEqual(line, 4,
            `STRING-literal call MultiProc('hello') must pick STRING overload at line 4; got line ${line}. ` +
            `Pre-fix: paramCount-only logic at the MAP scope walker can't disambiguate (both overloads have arity 1). ` +
            `Post-fix: arg-classify picks STRING overload.`);
        assert.notStrictEqual(line, 5,
            'complex-type (*StringTheoryX) overload at line 5 must NOT be selected for a STRING literal');
    });
});
