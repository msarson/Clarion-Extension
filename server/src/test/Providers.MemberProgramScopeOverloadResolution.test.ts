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
 * Issue #128 — Goto Definition on a class method call resolves through the
 * MEMBER → PROGRAM → recursive-INCLUDE chain (Clarion's compilation model).
 *
 * ─── Why prior attempts missed this ─────────────────────────────────────────
 *
 * - #125: inline single-file fixture; cross-file CLASS path never exercised
 * - #127: cross-file INCLUDE'd CLASS from the call-site file (direct INCLUDE);
 *         missed MEMBER files where the class reaches scope only via PROGRAM's
 *         INCLUDE chain
 * - #128: this contract — fixture mirrors Clarion's actual compilation model
 *
 * Mark's real-world MyNextProcedure.clw has ZERO direct INCLUDE statements;
 * StringTheory reaches scope via MEMBER('SimpleNewSln.clw') → that PROGRAM's
 * INCLUDE chain (possibly transitive). Walker must traverse the full chain.
 *
 * ─── Architectural lock (Mark-confirmed 2026-05-11) ─────────────────────────
 *
 * 1. Stop at PROGRAM — PROGRAM IS global scope; no further upward walking
 * 2. Recursive INCLUDE traversal — `Global.inc` may INCLUDE `StringTheory.inc`
 * 3. Cycle protection — canonical-path visited-set; Clarion compiler uses
 *    `,ONCE` attribute; walker uses visited-set at INCLUDE-walk level
 * 4. Substrate: FileRelationshipGraph already tracks MEMBER + INCLUDE edges;
 *    no new FRG API required (`getProgramFile` + `getForwardEdges` compose)
 *
 * ─── Phase B fix (Alice) ────────────────────────────────────────────────────
 *
 * New private method `MethodOverloadResolver.gatherScopeMethodDeclarations`:
 *   1. Resolve current doc canonical path
 *   2. Detect MEMBER directive at top → scan-root = PROGRAM (via FRG.getProgramFile)
 *      Else → scan-root = current doc
 *   3. BFS the INCLUDE chain via FRG.getForwardEdges (filter type='INCLUDE'),
 *      visited-set on canonical-path-lowercase
 *   4. For each file in walk: scan for `^${className}\s+CLASS` then `^\s*${methodName}\s+PROCEDURE`
 *   5. Return aggregated candidates
 *
 * Wire into `findAllMethodDeclarationsIncludingIncludes` — replaces the existing
 * `gatherIncludeMethodDeclarations` call (legacy `findMethodDeclarationInIncludes`
 * keeps the old gather for backward compat).
 *
 * FRG-not-ready edge case: if `frg.isBuilt === false`, walker falls back to
 * existing direct-INCLUDE-only scan (soft degradation per Bob's PM call) with
 * a logger.warn for telemetry on unexpected fires.
 *
 * ─── Test approach ──────────────────────────────────────────────────────────
 *
 * Disk-based fixture (`os.tmpdir()`) per `feedback_red_fixture_matches_user_repro`:
 *   - Real files on disk so the walker's `fs.readFileSync` reads them
 *   - FRG seeded via `seedEdgesForTest` with MEMBER + INCLUDE edges using
 *     canonical paths matching the disk layout
 *   - Provider invocation via standard `provideDefinition(doc, pos)`
 *
 * Bidirectional pin on each positive: right overload IS selected AND wrong
 * overload NOT selected.
 */

const STRING_THEORY_INC = [
    "StringTheory CLASS,TYPE",                                          // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",        // line 1 — STRING overload (expected)
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",                // line 2 — StringTheory overload
    "        END",                                                      // line 3
].join('\n');

const GLOBAL_INC_TRANSITIVE = [
    "  INCLUDE('StringTheory.inc')",
].join('\n');

const SIMPLE_NEW_SLN_TRANSITIVE = [
    "  PROGRAM",
    "  INCLUDE('Global.inc')",                  // transitive: this INCLUDEs Global.inc which INCLUDEs StringTheory.inc
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
].join('\n');

const SIMPLE_NEW_SLN_DIRECT = [
    "  PROGRAM",
    "  INCLUDE('StringTheory.inc')",            // direct INCLUDE of StringTheory.inc — no Global.inc
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
].join('\n');

const MY_NEXT_PROCEDURE_CLW = [
    "  MEMBER('SimpleNewSln.clw')",             // line 0 — MEMBER directive locks scan-root to PROGRAM
    "",                                         // line 1
    "TestProc PROCEDURE()",                     // line 2
    "st &StringTheory",                         // line 3
    "  CODE",                                   // line 4
    "  st &= NEW(StringTheory)",                // line 5
    "  st.SetValue('Hello World')",             // line 6 — CALL SITE (cursor goes here); ZERO direct INCLUDEs
    "  RETURN",                                 // line 7
].join('\n');

/** Cursor on the `SetValue` method-name token at the call site (line 6). */
const SETVALUE_CALL_POS: Position = { line: 6, character: 6 };

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
    files: Record<string, string>; // basename → abs path written
    callerUri: string;
    callerDoc: TextDocument;
}

/**
 * Write the given filename → content map to a fresh temp dir and seed FRG
 * with the supplied edges. Returns the fixture handle.
 */
function setupScopeFixture(
    fileMap: Record<string, string>,
    callerFileName: string,
    callerContent: string,
    edges: FileEdge[]
): ScopeFixture {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-128-'));
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(fileMap)) {
        const fullPath = path.join(tmpDir, name);
        fs.writeFileSync(fullPath, content, 'utf8');
        files[name] = fullPath;
    }
    // Caller doc lives in the same tmpDir but is also tracked as a TextDocument.
    const callerPath = path.join(tmpDir, callerFileName);
    fs.writeFileSync(callerPath, callerContent, 'utf8');
    files[callerFileName] = callerPath;
    const callerUri = 'file:///' + callerPath.replace(/\\/g, '/');
    const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
    TokenCache.getInstance().getTokens(callerDoc);

    // Resolve edges' fromFile/toFile to absolute paths via tmpDir.
    const resolvedEdges: FileEdge[] = edges.map(e => ({
        ...e,
        fromFile: path.join(tmpDir, e.fromFile),
        toFile: path.join(tmpDir, e.toFile),
    }));
    FileRelationshipGraph.getInstance().seedEdgesForTest(resolvedEdges);

    return { tmpDir, files, callerUri, callerDoc };
}

function teardownScopeFixture(fx: ScopeFixture): void {
    TokenCache.getInstance().clearTokens(fx.callerUri);
    FileRelationshipGraph.getInstance().reset();
    for (const p of Object.values(fx.files)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(fx.tmpDir); } catch { /* ignore */ }
}

suite("DefinitionProvider — MEMBER→PROGRAM→recursive-INCLUDE walker (#128 Phase A, Mark's real-world repro)", () => {

    let fx: ScopeFixture;

    teardown(() => {
        if (fx) teardownScopeFixture(fx);
    });

    // ─── Primary fixture — Mark's exact shape (transitive INCLUDE) ─────────

    test("MEMBER → PROGRAM → Global.inc → StringTheory.inc — F12 resolves to STRING overload via transitive walk", async () => {
        fx = setupScopeFixture(
            {
                'SimpleNewSln.clw': SIMPLE_NEW_SLN_TRANSITIVE,
                'Global.inc':       GLOBAL_INC_TRANSITIVE,
                'StringTheory.inc': STRING_THEORY_INC,
            },
            'MyNextProcedure.clw',
            MY_NEXT_PROCEDURE_CLW,
            [
                { type: 'MEMBER',  fromFile: 'MyNextProcedure.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
                { type: 'INCLUDE', fromFile: 'SimpleNewSln.clw',     toFile: 'Global.inc',       fromLine: 1 },
                { type: 'INCLUDE', fromFile: 'Global.inc',           toFile: 'StringTheory.inc', fromLine: 0 },
            ]
        );
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, SETVALUE_CALL_POS);

        assert.ok(result, 'walker must reach StringTheory.inc via transitive INCLUDE chain (MEMBER → PROGRAM → Global.inc → StringTheory.inc)');
        const uri = getLocationUri(result);
        const line = getLocationLine(result);
        assert.ok(uri.toLowerCase().includes('stringtheory.inc'),
            `F12 must target StringTheory.inc; got URI: ${uri}`);
        assert.strictEqual(line, 1,
            `F12 must target STRING overload at StringTheory.inc:1; got line ${line}. ` +
            `Pre-fix: gatherIncludeMethodDeclarations scans current doc only — MyNextProcedure.clw has ZERO INCLUDEs → walker returns empty → arg-classify falls back to legacy paramCount. ` +
            `Post-fix: gatherScopeMethodDeclarations detects MEMBER directive, walks PROGRAM's INCLUDE chain recursively, finds StringTheory.inc transitively.`);
        assert.notStrictEqual(line, 2,
            'StringTheory overload at :2 must NOT be selected for a STRING-literal call');
    });

    // ─── Direct INCLUDE variant (no Global.inc) — non-transitive case ──────

    test("MEMBER → PROGRAM → StringTheory.inc directly — F12 resolves correctly (non-transitive case)", async () => {
        fx = setupScopeFixture(
            {
                'SimpleNewSln.clw': SIMPLE_NEW_SLN_DIRECT,
                'StringTheory.inc': STRING_THEORY_INC,
            },
            'MyNextProcedure.clw',
            MY_NEXT_PROCEDURE_CLW,
            [
                { type: 'MEMBER',  fromFile: 'MyNextProcedure.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
                { type: 'INCLUDE', fromFile: 'SimpleNewSln.clw',     toFile: 'StringTheory.inc', fromLine: 1 },
            ]
        );
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, SETVALUE_CALL_POS);

        assert.ok(result, 'walker must reach StringTheory.inc via PROGRAM\'s direct INCLUDE');
        const line = getLocationLine(result);
        assert.strictEqual(line, 1, 'STRING overload at StringTheory.inc:1 selected');
        assert.notStrictEqual(line, 2, 'StringTheory overload NOT selected');
    });

    // ─── Cycle protection — A.inc INCLUDE(B.inc) + B.inc INCLUDE(A.inc) ──

    test("Cycle protection — A.inc ↔ B.inc mutual INCLUDE — walker terminates without infinite loop", async () => {
        const A_INC = [
            "StringTheory CLASS,TYPE",                                          // line 0
            "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",        // line 1 — STRING overload (target)
            "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",                // line 2
            "        END",                                                      // line 3
            "  INCLUDE('B.inc')",                                               // line 4 — cycle edge into B
        ].join('\n');
        const B_INC = [
            "  INCLUDE('A.inc')",                                               // line 0 — cycle edge back into A
        ].join('\n');
        const PROGRAM_CLW = [
            "  PROGRAM",
            "  INCLUDE('A.inc')",
            "  MAP",
            "  END",
            "  CODE",
            "  RETURN",
        ].join('\n');

        fx = setupScopeFixture(
            {
                'SimpleNewSln.clw': PROGRAM_CLW,
                'A.inc': A_INC,
                'B.inc': B_INC,
            },
            'MyNextProcedure.clw',
            MY_NEXT_PROCEDURE_CLW,
            [
                { type: 'MEMBER',  fromFile: 'MyNextProcedure.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
                { type: 'INCLUDE', fromFile: 'SimpleNewSln.clw',     toFile: 'A.inc', fromLine: 1 },
                { type: 'INCLUDE', fromFile: 'A.inc',                toFile: 'B.inc', fromLine: 4 },
                { type: 'INCLUDE', fromFile: 'B.inc',                toFile: 'A.inc', fromLine: 0 }, // cycle
            ]
        );
        const provider = new DefinitionProvider();
        // If the walker doesn't have visited-set cycle protection, this call hangs
        // indefinitely. Mocha's per-test timeout (default 2s) will fail the test
        // with a timeout rather than producing an infinite loop in CI.
        const result = await provider.provideDefinition(fx.callerDoc, SETVALUE_CALL_POS);

        assert.ok(result, 'walker must terminate + return Location via A.inc (B.inc → A.inc cycle handled)');
        const line = getLocationLine(result);
        assert.strictEqual(line, 1, 'STRING overload at A.inc:1 selected (cycle didn\'t poison the candidate set)');
    });

    // ─── PROGRAM-context variant — cursor in PROGRAM file (no MEMBER) ──────

    test("PROGRAM-context — cursor in PROGRAM file (no MEMBER directive), walker scans from current doc", async () => {
        // Reproducer where the call site IS the PROGRAM file itself.
        // Walker's MEMBER-detection must produce scan-root = current doc, not error.
        const PROGRAM_WITH_CALL = [
            "  PROGRAM",                                                  // line 0
            "  INCLUDE('StringTheory.inc')",                              // line 1
            "  MAP",                                                      // line 2
            "  END",                                                      // line 3
            "",                                                           // line 4
            "TestProc PROCEDURE()",                                       // line 5
            "st &StringTheory",                                           // line 6
            "  CODE",                                                     // line 7
            "  st &= NEW(StringTheory)",                                  // line 8
            "  st.SetValue('Hello World')",                               // line 9 — CALL SITE
            "  RETURN",                                                   // line 10
        ].join('\n');

        fx = setupScopeFixture(
            { 'StringTheory.inc': STRING_THEORY_INC },
            'SimpleNewSln.clw',
            PROGRAM_WITH_CALL,
            [
                { type: 'INCLUDE', fromFile: 'SimpleNewSln.clw', toFile: 'StringTheory.inc', fromLine: 1 },
            ]
        );
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, { line: 9, character: 6 });

        assert.ok(result, 'walker must handle PROGRAM-context (no MEMBER → scan-root = current doc)');
        const line = getLocationLine(result);
        assert.strictEqual(line, 1, 'STRING overload at StringTheory.inc:1 selected from PROGRAM-context call');
    });

    // ─── Counter-example — no StringTheory anywhere in chain ───────────────

    test("Counter-example — PROGRAM+MEMBER with NO StringTheory anywhere — no spurious diagnostic, no arbitrary pick", async () => {
        // Empty INCLUDE chain wrt StringTheory. Walker returns empty candidates;
        // provider falls through to existing legacy logic. Provider may return
        // null (no definition found) which is the right outcome — we don't
        // want a confused diagnostic or arbitrary candidate selection.
        const EMPTY_PROGRAM = [
            "  PROGRAM",
            "  MAP",
            "  END",
            "  CODE",
            "  RETURN",
        ].join('\n');

        fx = setupScopeFixture(
            { 'SimpleNewSln.clw': EMPTY_PROGRAM },
            'MyNextProcedure.clw',
            MY_NEXT_PROCEDURE_CLW,
            [
                { type: 'MEMBER', fromFile: 'MyNextProcedure.clw', toFile: 'SimpleNewSln.clw', fromLine: 0 },
            ]
        );
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, SETVALUE_CALL_POS);

        // If result is non-null, it must NOT be at line 2 of any StringTheory.inc-shaped file.
        // The walker correctly returning empty + falling through to legacy paramCount-only
        // path may produce a different Location (e.g. the typed-var decl line itself).
        // The substantive assertion is: no arbitrary-pick of a non-existent class.
        if (result) {
            const uri = getLocationUri(result);
            assert.ok(!uri.toLowerCase().includes('stringtheory.inc'),
                'when no StringTheory.inc exists in the chain, walker must NOT confabulate a path into it');
        }
        // Otherwise null result is acceptable — the legacy path failed too and that's correct.
    });
});
