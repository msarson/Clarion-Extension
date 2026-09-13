/**
 * validateDiscardedReturnValues — bare local CLASS self-instance receiver.
 *
 * `Label CLASS ... END` with no `,TYPE` and no separate instance variable — the
 * label doubles as both the class and its single instance, exactly like a bare
 * `Label QUEUE/GROUP/FILE ... END` local. The compiler warns "Calling function
 * as procedure" on a discarded non-PROC return through this receiver just like
 * any other; the extension previously stayed silent because
 * MemberLocatorService.extractTypeFromToken returned null for a bare CLASS
 * specifically (QUEUE/GROUP/FILE already resolved to themselves).
 *
 * The real-world repro that surfaced this also had colons in the receiver AND
 * method names (`MyOwn:CLASS.My:My:Method()`). That half is a separate fix —
 * the `DOTCALL_PREFIX` widening in `ReturnValueDiagnostics.ts` — which the
 * author noted as not yet landed when this branch was written, so the combined
 * case was left as a manual check rather than an automated cross-branch
 * dependency.
 *
 * It has since landed (#427, merged), so `DOTCALL_PREFIX` already accepts `:`
 * in both the receiver and the method name. The combined case is therefore
 * exercisable here after all, and is pinned by the third test below — the
 * shape a user actually reported, now covered end-to-end through the real
 * diagnostic rather than by hand.
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

function createDoc(filename: string, code: string): TextDocument {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, code);
}

suite('ReturnValueDiagnostics — bare local CLASS self-instance receiver', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdBareClass_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: unknown }[]) =>
        diags.filter(d => /is discarded/.test(String(d.message)));

    test('plain-name repro (no colons anywhere) — full pipeline, end to end', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass CLASS',
            'Method  PROCEDURE(), LONG',
            '      END',
            'Caller PROCEDURE()',
            '  CODE',
            '  MyClass.Method()',
        ].join('\n');
        const doc = createDoc('rvdBareClassPlain.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `plain-name bare CLASS self-instance must warn too — confirms the gap was never colon-specific; got: ${warns.map(w => String(w.message)).join(' | ')}`);
        assert.ok(String(warns[0].message).includes("'MyClass.Method'"));
    });

    test('PROC-attributed method on a bare CLASS self-instance stays silent', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass CLASS',
            'Method  PROCEDURE(), LONG, PROC',
            '      END',
            'Caller PROCEDURE()',
            '  CODE',
            '  MyClass.Method()',
        ].join('\n');
        const doc = createDoc('rvdBareClassProc.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 0, 'PROC-attributed method must not warn');
    });

    test('the original reported repro — colons in BOTH receiver and method — end to end', async () => {
        // `MyOwn:CLASS.My:My:Method()`. This needs two independent fixes to reach
        // the diagnostic at all: #427's DOTCALL_PREFIX widening so the line matches
        // as a dot-call, and the bare-CLASS receiver resolution this file covers.
        // Both are now on this branch, so the shape a user actually reported is
        // pinned end-to-end instead of by hand. If either regresses, this fails
        // while the plain-name test above may still pass — that asymmetry is the
        // point of keeping both.
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyOwn:CLASS CLASS',
            'My:My:Method  PROCEDURE(), LONG',
            '            END',
            'Caller PROCEDURE()',
            '  CODE',
            '  MyOwn:CLASS.My:My:Method()',
        ].join('\n');
        const doc = createDoc('rvdBareClassColon.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `colon-named bare CLASS self-instance must warn exactly once; got: ${warns.map(w => String(w.message)).join(' | ')}`);
        assert.ok(String(warns[0].message).includes("'MyOwn:CLASS.My:My:Method'"),
            `the message must name the full colon-bearing receiver and method; got: ${warns[0].message}`);
    });
});
