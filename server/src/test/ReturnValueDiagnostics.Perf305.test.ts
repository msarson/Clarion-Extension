/**
 * #305 — validateDiscardedReturnValues per-class member enumeration.
 *
 * The dot-call loop previously ran a full multi-tier cross-file resolution PER
 * (receiver, method) pair: 22 sites on one generated document = 16s of startup
 * (each inherited SELF.* member paid full include-chain walk misses before the
 * parent-chain tier hit). Receivers repeat heavily, so the fix enumerates each
 * unique receiver class ONCE (one inheritance-chain walk) and answers every
 * method lookup from that enumeration.
 *
 * Pins here:
 *   1. Behavior — warn decisions are unchanged (non-PROC return warns, PROC /
 *      void / captured calls don't), for object receivers and SELF sites.
 *   2. Efficiency — findMemberInClass is NOT called per site anymore; the
 *      enumeration runs once per unique receiver class. (Call counts, not
 *      wall-clock: deterministic on any machine.)
 *   3. Fallback — a receiver whose class can't be enumerated still goes through
 *      the old per-site path (and an unresolvable receiver is skipped quietly).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateDiscardedReturnValues } from '../providers/diagnostics/ReturnValueDiagnostics';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

// findMemberInClass tier 0 resolves the current document THROUGH DISK
// (loadDocument bails on fs.existsSync), so fixtures must be real files.
function createDoc(filename: string, code: string): TextDocument {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, code);
}

/** Wraps a locator instance with call counters on the resolution entry points. */
function instrument(locator: MemberLocatorService) {
    const counts = { findMemberInClass: 0, enumerateMembersInClass: 0, resolveVariableType: 0 };
    const origFind = locator.findMemberInClass.bind(locator);
    const origEnum = locator.enumerateMembersInClass.bind(locator);
    const origType = locator.resolveVariableType.bind(locator);
    locator.findMemberInClass = ((...args: Parameters<MemberLocatorService['findMemberInClass']>) => {
        counts.findMemberInClass++;
        return origFind(...args);
    }) as MemberLocatorService['findMemberInClass'];
    locator.enumerateMembersInClass = ((...args: Parameters<MemberLocatorService['enumerateMembersInClass']>) => {
        counts.enumerateMembersInClass++;
        return origEnum(...args);
    }) as MemberLocatorService['enumerateMembersInClass'];
    locator.resolveVariableType = ((...args: Parameters<MemberLocatorService['resolveVariableType']>) => {
        counts.resolveVariableType++;
        return origType(...args);
    }) as MemberLocatorService['resolveVariableType'];
    return counts;
}

suite('ReturnValueDiagnostics #305 — per-class enumeration for dot-call sites', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvd305_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: string }[]) =>
        diags.filter(d => /is discarded/.test(d.message));

    test('object receiver: warn decisions unchanged across multiple methods of one class', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'DoA        PROCEDURE(),LONG',
            'DoB        PROCEDURE(STRING pX),LONG',
            'DoC        PROCEDURE(),LONG,PROC',
            'DoD        PROCEDURE()',
            '         END',
            'obj  MyClass',
            'Caller PROCEDURE()',
            'Res  LONG',
            '  CODE',
            "  obj.DoA()",
            "  obj.DoB('x')",
            "  obj.DoC()",
            "  obj.DoD()",
            '  Res = obj.DoA()',
        ].join('\n');
        const doc = createDoc('perf305a.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 2, `expected DoA + DoB warnings, got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns.some(w => w.message.includes("'obj.DoA'")), 'DoA (LONG, no PROC) must warn');
        assert.ok(warns.some(w => w.message.includes("'obj.DoB'")), 'DoB (LONG, no PROC) must warn');
    });

    test('efficiency: one enumeration per unique class, no per-site findMemberInClass', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'DoA        PROCEDURE(),LONG',
            'DoB        PROCEDURE(),LONG',
            'DoC        PROCEDURE(),LONG',
            'DoD        PROCEDURE(),LONG',
            '         END',
            'obj  MyClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.DoA()',
            '  obj.DoB()',
            '  obj.DoC()',
            '  obj.DoD()',
        ].join('\n');
        const doc = createDoc('perf305b.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const counts = instrument(locator);
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 4, 'all four sites warn');
        assert.strictEqual(counts.enumerateMembersInClass, 1,
            `4 methods on ONE class must enumerate that class exactly once (got ${counts.enumerateMembersInClass})`);
        assert.strictEqual(counts.findMemberInClass, 0,
            `per-site tiered lookups must be gone when enumeration succeeds (got ${counts.findMemberInClass})`);
        assert.strictEqual(counts.resolveVariableType, 1,
            `receiver type resolved once per object name (got ${counts.resolveVariableType})`);
    });

    // Status-quo pin, NOT desired behavior: the dotted implementation label tokenizes as
    // Label("MyClass") + Variable("DoWork"), so getCodeBlockRanges derives selfClassName=null
    // and every SELF/PARENT dot-call site is skipped without any resolution. Mark's production
    // trace confirms it (no SELF.* resolution lines among the 22 sites). Enabling SELF
    // validation is a diagnostic behavior change tracked separately — see #305 comments.
    test('SELF sites: currently skipped (selfClassName underivable) — no resolution work', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'DoA        PROCEDURE(),LONG',
            'DoB        PROCEDURE(),LONG,PROC',
            'DoWork     PROCEDURE()',
            '         END',
            'MyClass.DoWork PROCEDURE',
            '  CODE',
            '  SELF.DoA()',
            '  SELF.DoB()',
        ].join('\n');
        const doc = createDoc('perf305c.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const counts = instrument(locator);
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 0, 'SELF sites are skipped today');
        assert.strictEqual(counts.enumerateMembersInClass + counts.findMemberInClass, 0,
            'no resolution work is spent on skipped SELF sites');
    });

    test('fallback: unresolvable receiver produces no warning and no crash', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'Caller PROCEDURE()',
            '  CODE',
            '  mystery.DoThing()',
        ].join('\n');
        const doc = createDoc('perf305d.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);
        assert.strictEqual(discarded(diags).length, 0, 'unknown receiver stays silent');
    });
});
