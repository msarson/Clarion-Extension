import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Issue #127 — Goto Definition / Hover / Implementation still mis-resolve
 * overloads when the CLASS is in an INCLUDE'd file (Mark's real-world repro;
 * not pinned by #125's single-file RED contract).
 *
 * ─── Test-discipline lesson (Bob 2026-05-11) ────────────────────────────────
 *
 * #125 RED used inline CLASS — tests passed but Mark's real-world bug
 * remained because the production code path (cross-file CLASS via INCLUDE)
 * wasn't exercised. Going forward: **RED contracts for user-reported bugs
 * use fixtures matching the user's reported shape.** If Mark says
 * "StringTheory call", the fixture has StringTheory as a real INCLUDE'd
 * CLASS on disk, not an inline declaration in the call-site file.
 *
 * ─── Root cause ─────────────────────────────────────────────────────────────
 *
 * `MethodOverloadResolver.findAllMethodDeclarations:74-81` is current-file
 * only per its docstring. For cross-file CLASS calls:
 *   1. Provider's arg-classify path calls findAllMethodDeclarations → empty
 *   2. Falls through to legacy findMethodDeclaration (paramCount-only)
 *   3. findMethodDeclaration calls findMethodDeclarationInIncludes which DOES
 *      find candidates but picks one via selectBestOverload (paramCount-only)
 *      BEFORE returning
 *   4. Wrong overload picked — arg-classify never sees the candidate set
 *
 * ─── Phase B fix (Alice) ────────────────────────────────────────────────────
 *
 * 1. New public method on MethodOverloadResolver:
 *      findAllMethodDeclarationsIncludingIncludes(className, methodName, document, tokens)
 *        : MethodDeclarationInfo[]
 *    Returns union of current-file + cross-file INCLUDE'd candidates.
 *    Refactors INCLUDE-walking in findMethodDeclarationInIncludes to expose
 *    a candidate-gathering primitive that doesn't auto-pick.
 *
 * 2. Provider re-wire (one-line swap in arg-classify path per provider):
 *    findAllMethodDeclarations → findAllMethodDeclarationsIncludingIncludes
 *
 *    Affected: DefinitionProvider, MethodHoverResolver, ImplementationProvider.
 *
 * ─── Disk-fixture setup ─────────────────────────────────────────────────────
 *
 * findMethodDeclarationInIncludes reads INCLUDE files from disk via
 * fs.readFileSync. To exercise that code path, the test writes real files
 * to a temp directory. The relative-path fallback at lines 286-291 then
 * resolves Caller.clw's `INCLUDE('StringTheoryStub.inc')` against currentDir.
 *
 * (MultiFileFARFixture's in-memory SolutionManager mock doesn't support
 * project.getRedirectionParser() for the INCLUDE-walker path, so disk-based
 * setup is the right shape here.)
 */

const STRING_THEORY_STUB = [
    "StringTheory CLASS,TYPE",                                          // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",        // line 1 — STRING overload (Mark's expected target)
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",                // line 2 — StringTheory overload (wrongly picked today)
    "        END",                                                      // line 3
].join('\n');

const CALLER_CLW = [
    "  MEMBER",                                  // line 0
    "  INCLUDE('StringTheoryStub.inc')",         // line 1
    "  MAP",                                     // line 2
    "  END",                                     // line 3
    "",                                          // line 4
    "TestProc PROCEDURE()",                      // line 5
    "st &StringTheory",                          // line 6
    "  CODE",                                    // line 7
    "  st &= NEW(StringTheory)",                 // line 8
    "  st.SetValue('Hello World')",              // line 9 — CALL SITE (cursor goes here)
    "  RETURN",                                  // line 10
].join('\n');

/** Cursor on the `SetValue` method-name token at the call site (line 9). */
const SETVALUE_CALL_POS: Position = { line: 9, character: 6 };

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

interface DiskFixture {
    tmpDir: string;
    stubPath: string;
    callerPath: string;
    callerUri: string;
    callerDoc: TextDocument;
}

function setupDiskFixture(): DiskFixture {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-127-'));
    const stubPath = path.join(tmpDir, 'StringTheoryStub.inc');
    const callerPath = path.join(tmpDir, 'Caller.clw');
    fs.writeFileSync(stubPath, STRING_THEORY_STUB, 'utf8');
    fs.writeFileSync(callerPath, CALLER_CLW, 'utf8');
    const callerUri = 'file:///' + callerPath.replace(/\\/g, '/');
    const callerDoc = TextDocument.create(callerUri, 'clarion', 1, CALLER_CLW);
    // Seed TokenCache so providers can tokenize.
    TokenCache.getInstance().getTokens(callerDoc);
    return { tmpDir, stubPath, callerPath, callerUri, callerDoc };
}

function teardownDiskFixture(fx: DiskFixture): void {
    TokenCache.getInstance().clearTokens(fx.callerUri);
    try { fs.unlinkSync(fx.stubPath); } catch { /* ignore */ }
    try { fs.unlinkSync(fx.callerPath); } catch { /* ignore */ }
    try { fs.rmdirSync(fx.tmpDir); } catch { /* ignore */ }
}

// ─── (1) DefinitionProvider — cross-file CLASS via INCLUDE ──────────────────

suite("DefinitionProvider — cross-file overload resolution (#127 Phase A, Mark's real-world repro)", () => {

    let fx: DiskFixture;

    setup(() => { fx = setupDiskFixture(); });
    teardown(() => { teardownDiskFixture(fx); });

    test("st.SetValue('Hello World') resolves to STRING overload at StringTheoryStub.inc:1, NOT StringTheory at :2", async () => {
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(fx.callerDoc, SETVALUE_CALL_POS);

        assert.ok(result, 'definition must resolve to a Location (cross-file INCLUDE walker must reach StringTheoryStub.inc)');
        const uri = getLocationUri(result);
        const line = getLocationLine(result);
        assert.ok(uri.toLowerCase().includes('stringtheorystub.inc'),
            `definition must point into StringTheoryStub.inc; got URI: ${uri}`);
        assert.strictEqual(line, 1,
            `Goto Definition must target STRING overload at StringTheoryStub.inc:1; got line ${line}. ` +
            `Pre-fix: findAllMethodDeclarations returns empty for cross-file → falls through to findMethodDeclarationInIncludes which paramCount-picks BEFORE arg-classify can intervene. ` +
            `Post-fix: new findAllMethodDeclarationsIncludingIncludes exposes the candidate set so arg-classify picks the right overload.`);
        assert.notStrictEqual(line, 2,
            'StringTheory overload at :2 must NOT be selected for a STRING-literal call');
    });
});

// ─── (2) HoverProvider — cross-file CLASS via INCLUDE ───────────────────────

suite("HoverProvider — cross-file overload resolution (#127 Phase A, Mark's real-world repro)", () => {

    let fx: DiskFixture;

    setup(() => { fx = setupDiskFixture(); });
    teardown(() => { teardownDiskFixture(fx); });

    test("hover on st.SetValue('Hello World') shows STRING overload signature from StringTheoryStub.inc", async () => {
        const provider = new HoverProvider();
        const result = await provider.provideHover(fx.callerDoc, SETVALUE_CALL_POS);

        assert.ok(result, 'hover must resolve to a Hover result');
        const contents = typeof result.contents === 'string' ? result.contents :
            Array.isArray(result.contents) ? result.contents.map(c => typeof c === 'string' ? c : c.value).join('\n') :
            (result.contents as { value?: string }).value ?? '';
        assert.ok(/STRING\b/.test(contents),
            `hover content must mention STRING overload; got: ${contents.slice(0, 300)}...`);
        assert.ok(/LONG\s+pClip/.test(contents) || /pClip\s*=\s*0/.test(contents),
            `hover must include the default-param ('pClip=0'); confirms STRING+default overload is the resolved target`);
        assert.ok(!/StringTheory\s+newValue/.test(contents),
            `hover must NOT mention 'StringTheory newValue' (the wrong overload's signature)`);
    });
});

// ─── (3) ImplementationProvider — cross-file CLASS via INCLUDE ──────────────

suite("ImplementationProvider — cross-file overload resolution (#127 Phase A, Mark's real-world repro)", () => {

    let fx: DiskFixture;

    setup(() => { fx = setupDiskFixture(); });
    teardown(() => { teardownDiskFixture(fx); });

    test("F12 from st.SetValue('Hello World') call targets STRING overload's decl in StringTheoryStub.inc", async () => {
        // Path-1 (findMethodImplementation:323 typed-var dot access) — same fix shape as DefinitionProvider.
        // With no separate impl file in the fixture, result targets the decl line; substantive
        // assertion is that paramCount-only resolution doesn't pick line 2 (StringTheory overload).
        const provider = new ImplementationProvider();
        const result = await provider.provideImplementation(fx.callerDoc, SETVALUE_CALL_POS);

        assert.ok(result, 'implementation must resolve to a Location');
        const uri = getLocationUri(result);
        const line = getLocationLine(result);
        assert.ok(uri.toLowerCase().includes('stringtheorystub.inc'),
            `implementation must target StringTheoryStub.inc; got URI: ${uri}`);
        assert.strictEqual(line, 1,
            `Goto Implementation must target STRING overload at StringTheoryStub.inc:1; got line ${line}.`);
        assert.notStrictEqual(line, 2,
            'StringTheory overload at :2 must NOT be the impl target');
    });
});
