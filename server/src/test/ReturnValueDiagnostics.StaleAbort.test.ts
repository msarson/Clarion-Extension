/**
 * validateDiscardedReturnValues — a superseded pass stops instead of running to completion.
 *
 * The validator resolves the receiver type of every dot-call in the document and enumerates
 * each receiver class cross-file. On a large module a cold pass runs for seconds. While the
 * user types, each edit schedules a new pass, and the caller's stale-version guard discards
 * the answer of every pass whose document version has moved on — but the guard sat after
 * the validators, so every superseded pass still did all of its work first. Several such
 * passes overlapped and shared the single thread with interactive requests (a member
 * completion measured 24 ms alone and 2.5 s beside two abandoned passes).
 *
 * The validator now accepts an `isStale` callback and checks it at the top of its per-line
 * loop: once the caller reports a newer version, it returns an empty result and does not
 * resolve or enumerate anything further.
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

function createDoc(filename: string, lines: string[]): TextDocument {
    const code = lines.join('\r\n');
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, code);
}

// Four discarded-return call sites, each on its own line, so the loop has several
// iterations at which the stale check can fire after the first receiver resolution.
const FIXTURE = [
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
    '  obj.Method()',
    '  obj.Method()',
    '  obj.Method()',
];

/** A real locator whose receiver-type resolutions are counted (and optionally observed). */
function countingLocator(onResolve?: () => void) {
    const locator = new MemberLocatorService();
    let resolveCalls = 0;
    const original = locator.resolveVariableType.bind(locator);
    (locator as any).resolveVariableType = async (...args: unknown[]) => {
        resolveCalls++;
        const result = await (original as any)(...args);
        onResolve?.();
        return result;
    };
    return { locator, resolveCalls: () => resolveCalls };
}

suite('ReturnValueDiagnostics — a superseded pass stops early (isStale)', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdStaleAbort_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: unknown }[]) =>
        diags.filter(d => /is discarded/.test(String(d.message)));

    test('control: without isStale every discarded call is reported', async () => {
        const doc = createDoc('rvdStaleControl.clw', FIXTURE);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const { locator, resolveCalls } = countingLocator();

        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 4, 'all four call sites warn when the pass is not superseded');
        assert.ok(resolveCalls() >= 1, 'the receiver type is resolved at least once');
    });

    test('stale from the start: returns nothing and never resolves a receiver', async () => {
        const doc = createDoc('rvdStaleFromStart.clw', FIXTURE);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const { locator, resolveCalls } = countingLocator();

        const diags = await validateDiscardedReturnValues(tokens, doc, locator, undefined, () => true);

        assert.deepStrictEqual(diags, [], 'a pass that is already superseded produces no diagnostics');
        assert.strictEqual(resolveCalls(), 0, 'no receiver-type resolution is attempted once the pass is stale');
    });

    test('superseded mid-pass: stops after the resolution in flight, reports nothing', async () => {
        const doc = createDoc('rvdStaleMidPass.clw', FIXTURE);
        const tokens = TokenCache.getInstance().getTokens(doc);
        let stale = false;
        // The document "changes" the moment the first receiver resolution completes.
        const { locator, resolveCalls } = countingLocator(() => { stale = true; });

        const diags = await validateDiscardedReturnValues(tokens, doc, locator, undefined, () => stale);

        assert.deepStrictEqual(diags, [], 'the partial answer of a superseded pass is not reported');
        assert.strictEqual(resolveCalls(), 1, 'the resolution already in flight completes; nothing new is started');
    });
});
