/**
 * validateDiscardedReturnValues — chained (3+ segment) dot-call receiver.
 *
 * DOTCALL_PREFIX previously matched only a single dot pair (`object.method`),
 * so a call reached through an intermediate field — e.g. a QUEUE holding a
 * reference to a CLASS instance (`RecordQ.Item.Recalculate(...)`) — parsed as
 * objectName="RecordQ", methodName="Item", leaving ".Recalculate(...)" as
 * unconsumed trailing text after the presumed call. That failed the
 * "anything after the closing paren?" guard, so the whole line was silently
 * skipped: the compiler still warns ("Calling function as procedure"), the
 * extension stayed silent. A 2-segment call on the same class continued to
 * diagnose correctly, which is what made the gap chain-depth-specific.
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

suite('ReturnValueDiagnostics — chained receiver (Queue.RefField.Method)', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdChain_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: string }[]) =>
        diags.filter(d => /is discarded/.test(d.message));

    test('3-segment chain through a QUEUE reference field: discarded non-PROC return warns', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'ItemClass   CLASS,TYPE',
            'Recalculate   PROCEDURE(LONG p), LONG',
            '            END',
            'RecordQ     QUEUE(),PRE(RecordQ)',
            'Item          &ItemClass',
            '            END',
            'Caller PROCEDURE()',
            '  CODE',
            '  RecordQ.Item.Recalculate(1)',
        ].join('\n');
        const doc = createDoc('rvdChain.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `chained receiver call must warn; got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns[0].message.includes("'RecordQ.Item.Recalculate'"),
            'warning must name the full chain, not just the first dot pair');
    });

    test('3-segment chain: PROC-attributed method at the end of the chain stays silent', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'ItemClass   CLASS,TYPE',
            'Recalculate   PROCEDURE(LONG p), LONG, PROC',
            '            END',
            'RecordQ     QUEUE(),PRE(RecordQ)',
            'Item          &ItemClass',
            '            END',
            'Caller PROCEDURE()',
            '  CODE',
            '  RecordQ.Item.Recalculate(1)',
        ].join('\n');
        const doc = createDoc('rvdChainProc.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 0, 'PROC-attributed chained method must not warn');
    });

    test('2-segment call on the same class is unaffected by the chain-walk change', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'ItemClass   CLASS,TYPE',
            'Recalculate   PROCEDURE(LONG p), LONG',
            '            END',
            'Item   ItemClass',
            'Caller PROCEDURE()',
            '  CODE',
            '  Item.Recalculate(1)',
        ].join('\n');
        const doc = createDoc('rvdPlain.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1, `plain 2-segment call must still warn; got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns[0].message.includes("'Item.Recalculate'"));
    });

    test('two chains sharing a root but ending at different classes resolve independently (cache-key regression guard)', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'ClassA   CLASS,TYPE',
            'Foo   PROCEDURE(), LONG',
            '     END',
            'ClassB   CLASS,TYPE',
            'Foo   PROCEDURE(), LONG, PROC',
            '     END',
            'Holder   QUEUE(),PRE(Holder)',
            'RefA       &ClassA',
            'RefB       &ClassB',
            '         END',
            'Caller PROCEDURE()',
            '  CODE',
            '  Holder.RefA.Foo()',
            '  Holder.RefB.Foo()',
        ].join('\n');
        const doc = createDoc('rvdChainCacheGuard.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `only the non-PROC chain (RefA.Foo) may warn; got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns[0].message.includes("'Holder.RefA.Foo'"),
            'RefA.Foo (ClassA, non-PROC) must warn');
        assert.ok(!warns.some(w => w.message.includes('RefB')),
            'RefB.Foo (ClassB, PROC) must not warn even though it shares a root and method name with RefA.Foo');
    });
});
