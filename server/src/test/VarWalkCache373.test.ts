import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';

/**
 * #373 — findVariableTokenInParentChain memoizes its walk result (positive AND
 * negative) keyed by host+varName, invalidated by the cross-file epoch. The walk
 * cold-loads the MEMBER parent's whole INCLUDE chain (~12.5s on a big NetTalk
 * PROGRAM file, surfacing as the `includesAndEquates` hover phase); the first
 * genuine identifier to miss re-paid it in every fresh server process. A
 * NEGATIVE result ("not declared in any reachable include") is the common, most
 * expensive case and is exactly what must be remembered.
 */
suite('MemberLocatorService - findVariableTokenInParentChain result cache (#373)', () => {

    let tmpDir: string;
    let memberPath: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'varwalk-cache-373-'));
        // globals.inc: declares one global equate (NOT the word we search for first).
        fs.writeFileSync(path.join(tmpDir, 'globals.inc'),
            `GLO:KnownEquate    EQUATE(42)\n`);
        // parent.clw: a PROGRAM that includes globals.inc.
        fs.writeFileSync(path.join(tmpDir, 'parent.clw'),
            `  PROGRAM\n  INCLUDE('globals.inc')\n  MAP\n  END\n  CODE\n`);
        // member.clw: a MEMBER of parent.clw — the hover host.
        memberPath = path.join(tmpDir, 'member.clw');
        fs.writeFileSync(memberPath,
            `  MEMBER('parent.clw')\n  MAP\n  END\nMyProc  PROCEDURE()\n  CODE\n  RETURN\n`);
    });

    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function memberDoc(): TextDocument {
        const content = fs.readFileSync(memberPath, 'utf8');
        return TextDocument.create('file:///' + memberPath.replace(/\\/g, '/'), 'clarion', 1, content);
    }

    test('a negative walk result is cached and reused until the epoch bumps', async () => {
        const svc = new MemberLocatorService();
        let loads = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anySvc = svc as any;
        const origLoad = anySvc.loadDocument.bind(svc);
        anySvc.loadDocument = async (p: string) => { loads++; return origLoad(p); };

        const doc = memberDoc();

        // Fresh epoch so the module-level cache starts clean for this host+word.
        bumpCrossFileEpoch();

        const r1 = await svc.findVariableTokenInParentChain('NoSuchGlobal', doc);
        assert.strictEqual(r1, null, 'word is not declared anywhere reachable');
        const afterFirst = loads;
        assert.ok(afterFirst > 0, 'the first walk actually loaded files');

        const r2 = await svc.findVariableTokenInParentChain('NoSuchGlobal', doc);
        assert.strictEqual(r2, null);
        assert.strictEqual(loads, afterFirst, 'the second call must be a pure cache hit — no re-walk');

        // Epoch bump (a workspace file changed) → the memo clears and the walk re-runs.
        bumpCrossFileEpoch();
        const r3 = await svc.findVariableTokenInParentChain('NoSuchGlobal', doc);
        assert.strictEqual(r3, null);
        assert.ok(loads > afterFirst, 'after an epoch bump the walk must re-run');
    });

    test('a positive result is cached and re-derives a live token on repeat', async () => {
        const svc = new MemberLocatorService();
        const doc = memberDoc();
        bumpCrossFileEpoch();

        const r1 = await svc.findVariableTokenInParentChain('GLO:KnownEquate', doc);
        assert.ok(r1, 'the equate declared in the parent include chain must be found');
        assert.strictEqual(r1!.token.value, 'GLO:KnownEquate');

        const r2 = await svc.findVariableTokenInParentChain('GLO:KnownEquate', doc);
        assert.ok(r2, 'repeat lookup must still find it (via the memo)');
        assert.strictEqual(r2!.token.value, 'GLO:KnownEquate');
        assert.strictEqual(r2!.token.line, r1!.token.line);
    });
});
