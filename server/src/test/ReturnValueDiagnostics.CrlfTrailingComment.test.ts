/**
 * validateDiscardedReturnValues — CRLF line + trailing same-line comment.
 *
 * Real Clarion source is always CRLF (the compiler requires it). The comment-
 * stripping step used to read `rawLine.replace(/!.*$/, '').trim()`. On a CRLF
 * file, `docLines` (built from `document.getText().split('\n')`) leaves a
 * trailing '\r' on every line. JavaScript's `.` never matches '\r', and `$`
 * (no /m flag) demands the literal end of the string — so on a line ending in
 * a trailing `!` comment, `!.*$` could never match at all: the comment
 * survived into `stripped` un-stripped. The "anything after the closing
 * paren?" check then saw that leftover comment text as junk after the call
 * and skipped the line via `continue`, so the diagnostic was silently never
 * produced — while the exact same source with the comment removed (or with
 * LF-only line endings) warned correctly. Every existing test in this suite
 * builds its fixtures via `.join('\n')` (LF-only) and none put a trailing
 * comment on the exercised line, so this combination was never exercised
 * before this test.
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

function createCrlfDoc(filename: string, lines: string[]): TextDocument {
    const code = lines.join('\r\n');
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, code);
}

suite('ReturnValueDiagnostics — CRLF line + trailing same-line comment', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdCrlfComment_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: string }[]) =>
        diags.filter(d => /is discarded/.test(d.message));

    test('CRLF file, discarded call WITH a trailing comment on the same line still warns', async () => {
        const lines = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'Method     PROCEDURE(),LONG',
            '         END',
            'obj  MyClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.Method()      ! trailing comment must not suppress the warning',
        ];
        const doc = createCrlfDoc('rvdCrlfWithComment.clw', lines);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `CRLF line with a trailing comment must still warn — got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns[0].message.includes("'obj.Method'"));
    });

    test('CRLF file, discarded call WITHOUT a trailing comment warns (control case)', async () => {
        const lines = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass  CLASS,TYPE',
            'Method     PROCEDURE(),LONG',
            '         END',
            'obj  MyClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.Method()',
        ];
        const doc = createCrlfDoc('rvdCrlfNoComment.clw', lines);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 1,
            'CRLF line with no trailing comment must warn (this direction already worked pre-fix)');
    });
});
