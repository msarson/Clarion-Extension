/**
 * validateDiscardedReturnValues — colon-named receiver and method.
 *
 * Clarion labels legally contain ':' (the tokenizer's own Label pattern
 * documents this — `[A-Za-z_][A-Za-z0-9_:]*`), so a local class instance
 * commonly named e.g. `My:StringTheory`, or a class member named e.g.
 * `My:Method`, are valid dot-call participants.
 *
 * DOTCALL_PREFIX previously matched both the receiver and the method name as
 * `[A-Za-z_][A-Za-z0-9_]*` (no colon), so `My:StringTheory.IsEmpty()` never
 * matched at all — the whole line was skipped before any resolution ran, and
 * a discarded non-PROC return value on a colon-named receiver went completely
 * undiagnosed (compiler still warns "Calling function as procedure"; the
 * extension stayed silent). A receiver with the identical shape but no colon
 * (`St.IsEmpty()`) diagnosed correctly, which is what made the gap
 * colon-specific rather than a general dot-call miss.
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

suite('ReturnValueDiagnostics — colon-named receiver (My:StringTheory)', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdColon_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: string }[]) =>
        diags.filter(d => /is discarded/.test(d.message));

    test('colon-named receiver: discarded non-PROC return warns, same as a plain-named receiver', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'IsEmpty    PROCEDURE(),LONG',
            '         END',
            'My:Obj  MyClass',
            'St      MyClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  My:Obj.IsEmpty()',
            '  St.IsEmpty()',
        ].join('\n');
        const doc = createDoc('rvdColon.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 2,
            `both the colon-named and plain-named receiver must warn; got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns.some(w => w.message.includes("'My:Obj.IsEmpty'")),
            'colon-named receiver call must be flagged');
        assert.ok(warns.some(w => w.message.includes("'St.IsEmpty'")),
            'plain-named receiver call must still be flagged');
    });

    test('colon-named receiver: PROC-attributed method stays silent', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'IsEmpty    PROCEDURE(),LONG,PROC',
            '         END',
            'My:Obj  MyClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  My:Obj.IsEmpty()',
        ].join('\n');
        const doc = createDoc('rvdColonProc.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 0, 'PROC-attributed method must not warn');
    });

    // Note: a receiver that is itself a bare local CLASS instance (`MyOwn:CLASS CLASS
    // ... END`, no `,TYPE`, no separate instance variable) hits a SEPARATE, colon-independent
    // gap in MemberLocatorService.extractTypeFromToken, which resolves bare QUEUE/GROUP/FILE
    // self-instances but deliberately returns null for bare CLASS. Tracked separately —
    // not part of this DOTCALL_PREFIX fix. See _notes/issue-bare-class-self-instance-receiver.md.
    test('colon-named method on a normally-resolved instance warns (Obj.My:Method)', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'My:Method  PROCEDURE(), LONG',
            '         END',
            'Obj  MyClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  Obj.My:Method()',
        ].join('\n');
        const doc = createDoc('rvdColonMethod.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `colon-named method on a resolvable receiver must warn; got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns[0].message.includes("'Obj.My:Method'"),
            'warning must name the full colon-qualified receiver.method');
    });
});
