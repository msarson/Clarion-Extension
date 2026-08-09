/**
 * A bare, undeclared word was resolving to an unrelated PROCEDURE's *local*
 * variable in the MEMBER parent file. findVariableTokenInParentChain's
 * isVariableLookupCandidate() gate checked token shape and CLASS/INTERFACE
 * containment (#391) but had no module-scope boundary, so a column-0 label in
 * a procedure's local data section — shaped identically to module-level global
 * data — was accepted as a cross-file global.
 *
 * Both same-file siblings already stop at the module boundary
 * (SymbolFinderService.findModuleVariable and .findGlobalVariableInCurrentFile
 * each cut off at the first PROCEDURE); the cross-file walks had no boundary at all.
 *
 * The guard is opt-in per call site via isVariableLookupCandidate's `crossFile`
 * parameter and applies ONLY when the searched document is not the one the lookup
 * started in. Same-file lookups legitimately see procedure locals and do their own
 * finer filtering (#304's excludedRanges keeps a ROUTINE's parent-procedure data and
 * an ABC `ThisWindow CLASS(WindowManager)` method impl's host-procedure locals
 * visible) — MemberLocatorService.test.ts pins those, and they must keep passing
 * alongside this suite.
 *
 * Repro: an undeclared bare word in a MEMBER module resolved to a same-named
 * local of an unrelated procedure thousands of lines into the PROGRAM file, and
 * was reported to the user as "📦 Module variable".
 *
 * Pins:
 *   1. A procedure's local variable never satisfies a cross-file lookup.
 *   2. A procedure's local QUEUE (the reported shape) likewise resolves to null.
 *   3. A ROUTINE's DATA-section local likewise resolves to null.
 *   4. A genuine module-level global still resolves — the guard must not overreach.
 *   5. A MAP prototype inside MODULE('...') still resolves. (It reaches file scope via
 *      the `chain` branch, so `scope` is null — the subtype list stays explicit anyway.)
 *   6. A global procedure's own implementation label still resolves.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function writeFixture(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
}

function makeDoc(name: string, lines: string[]): TextDocument {
    const p = writeFixture(name, lines);
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, lines.join('\n'));
}

suite('MemberLocatorService — cross-file lookup must not match a PROCEDURE/ROUTINE local', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mls_proclocal_'));

        writeFixture('prog.clw', [
            '  PROGRAM',
            'GlobalFlag        LONG',
            '  MAP',
            '    MODULE(\'other.clw\')',
            'MappedProc          PROCEDURE()',
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
            '',
            'HostProc PROCEDURE()',
            'ProcLocal         LONG',
            'LocalQ          QUEUE',
            'Field1              STRING(64)',
            '                  END',
            '  CODE',
            '  DO SomeRoutine',
            '  RETURN',
            'SomeRoutine ROUTINE',
            '  DATA',
            'RoutineLocal      LONG',
            '  CODE',
            '  RETURN',
        ]);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    function makeMainDoc(name: string): TextDocument {
        return makeDoc(name, [
            "  MEMBER('prog.clw')",
            'Caller PROCEDURE',
            '  CODE',
        ]);
    }

    test("a procedure's local variable never satisfies a cross-file lookup", async () => {
        const doc = makeMainDoc('proclocal_scalar.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('ProcLocal', doc);
        assert.strictEqual(result, null, "a procedure local is unreachable from another file");
    });

    test("a procedure's local QUEUE never satisfies a cross-file lookup", async () => {
        const doc = makeMainDoc('proclocal_queue.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('LocalQ', doc);
        assert.strictEqual(result, null, 'the reported repro shape — a local QUEUE — must not resolve');
    });

    test("a ROUTINE's DATA-section local never satisfies a cross-file lookup", async () => {
        const doc = makeMainDoc('proclocal_routine.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('RoutineLocal', doc);
        assert.strictEqual(result, null, 'a routine local is unreachable from another file');
    });

    test('a genuine module-level global still resolves', async () => {
        const doc = makeMainDoc('proclocal_global.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('GlobalFlag', doc);
        assert.ok(result, 'a real module-level global must still resolve through the parent walk');
        assert.strictEqual(result!.token.value, 'GlobalFlag');
    });

    test("a MAP prototype inside MODULE('...') still resolves", async () => {
        const doc = makeMainDoc('proclocal_mapproto.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('MappedProc', doc);
        assert.ok(result, 'a MAP MODULE prototype is a genuine global declaration and must still resolve');
    });

    test("a global procedure's own implementation label still resolves", async () => {
        const doc = makeMainDoc('proclocal_procimpl.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('HostProc', doc);
        assert.ok(result, "a procedure's own label is at file scope, not inside itself");
    });
});
