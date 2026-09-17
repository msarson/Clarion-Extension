import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { validateUnresolvedProcedureCalls } from '../providers/diagnostics/UnresolvedProcedureCallDiagnostics';

/**
 * #517 — the index-existence check alone false-positives on procedures the declaration
 * index never scanned but F12 resolves: a third-party addon declared in a MODULE block of
 * an INC that the PROGRAM's MAP includes (QwInit in CTSQW10.CLW on the real solution).
 * On an index miss the validator must fall back to the same resolution F12 uses — this
 * file's MAP including its MAP INCLUDE files, the MEMBER parent's MAP, and the walk of
 * the MAP-included INCs — before flagging anything.
 *
 * Layout (real temp files, no solution; same-dir fallbacks carry resolution):
 *   main517.clw    PROGRAM whose MAP declares ParentProc and include('addon517.inc')
 *   addon517.inc   module('addon517.clw') → AddonProc(),long   (the QwInit shape)
 *   usage517.clw   MEMBER('main517.clw') calling both, plus a PRAGMA and a genuine typo
 *
 * The index predicate is injected as "knows nothing" with the index reported READY, so
 * every name reaches the fallback; that is exactly the QwInit situation.
 */

let tmpDir: string;

function writeFixture(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\r\n'));
    return p;
}

function openDoc(name: string): TextDocument {
    const p = path.join(tmpDir, name);
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(p, 'utf8'));
}

async function run(name: string): Promise<Diagnostic[]> {
    const doc = openDoc(name);
    const tokens = TokenCache.getInstance().getTokens(doc);
    return validateUnresolvedProcedureCalls(tokens, doc, () => false, /* sdiReady */ true);
}

const flagged = (d: Diagnostic[]) =>
    d.map(x => String(x.message).replace(/^Procedure '/, '').replace(/'.*$/, '')).sort();

suite('#517 unresolved procedure calls — F12-resolver fallback on index misses', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unresolved517_'));
        writeFixture('main517.clw', [
            '  PROGRAM',
            '  MAP',
            'ParentProc   PROCEDURE()',
            "  include('addon517.inc')",
            '  END',
            '  CODE',
        ]);
        writeFixture('addon517.inc', [
            "  module('addon517.clw')",
            "    AddonProc(),long,name('AddonProc')",
            '  end',
        ]);
        writeFixture('usage517.clw', [
            "  MEMBER('main517.clw')",
            '  MAP',
            '  END',
            'Caller PROCEDURE()',
            '  CODE',
            "  PRAGMA('link(addon517.lib)')",
            '  AddonProc()',
            '  ParentProc()',
            '  Typo517()',
            '  RETURN',
        ]);
        writeFixture('orphan517.clw', [
            "  MEMBER('nowhere517.clw')",
            '  MAP',
            '  END',
            'Caller PROCEDURE()',
            '  CODE',
            '  Whatever517()',
            '  RETURN',
        ]);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('an addon procedure declared in a MODULE block of a MAP-included INC is NOT flagged (the QwInit case)', async () => {
        const d = await run('usage517.clw');
        assert.ok(!flagged(d).includes('AddonProc'), `AddonProc resolves through the parent MAP's include; got ${flagged(d)}`);
    });

    test("a procedure declared in the MEMBER parent's own MAP is NOT flagged", async () => {
        const d = await run('usage517.clw');
        assert.ok(!flagged(d).includes('ParentProc'), `ParentProc is in main517.clw's MAP; got ${flagged(d)}`);
    });

    test('a directive such as PRAGMA is NOT flagged', async () => {
        const d = await run('usage517.clw');
        assert.ok(!flagged(d).includes('PRAGMA'), `PRAGMA is a directive, not a call; got ${flagged(d)}`);
    });

    test('sentinel: a genuine typo is still flagged after the fallback finds nothing', async () => {
        const d = await run('usage517.clw');
        assert.deepStrictEqual(flagged(d), ['Typo517']);
    });

    test('a MEMBER whose parent cannot be found on disk flags nothing (unknown, not unresolved)', async () => {
        const d = await run('orphan517.clw');
        assert.deepStrictEqual(flagged(d), []);
    });
});
