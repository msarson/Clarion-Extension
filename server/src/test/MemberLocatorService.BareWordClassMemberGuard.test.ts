/**
 * A bare, undeclared word that happens to share its name with some unrelated
 * CLASS's method/property was resolving to that method via
 * findVariableTokenInParentChain's MEMBER-parent/INCLUDE-chain walk — the
 * walk's isVariableLookupCandidate() gate accepted any column-0 or
 * procedure-shaped token with no check for CLASS/INTERFACE containment, even
 * though a class member is only reachable via qualified access (SELF.X /
 * instance.X), never as a bare word. Repro: hovering an undeclared local
 * named the same as some class's method resolved that method's signature
 * instead of correctly finding nothing.
 *
 * Pins:
 *   1. A bare word matching a CLASS member's name resolves to null.
 *   2. A bare word matching an INTERFACE member's name resolves to null.
 *   3. A genuine top-level global reachable through the SAME include chain
 *      still resolves — the guard must not overreach.
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

suite('MemberLocatorService — bare-word lookup must not match CLASS/INTERFACE members', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mls_bareword_'));

        writeFixture('declarations.inc', [
            'SomeClass  CLASS,TYPE',
            'DoWork       PROCEDURE( *? )',
            '           END',
            '',
            'SomeInterface  INTERFACE',
            'Handle           PROCEDURE()',
            '               END',
            '',
            'GlobalFlag  LONG',
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
            "  INCLUDE('declarations.inc'),ONCE",
            'Caller PROCEDURE',
            '  CODE',
        ]);
    }

    test('a bare word matching a CLASS method name resolves to nothing', async () => {
        const doc = makeMainDoc('bareword_class.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('DoWork', doc);
        assert.strictEqual(result, null, 'a CLASS member must never satisfy a bare-word lookup');
    });

    test('a bare word matching an INTERFACE method name resolves to nothing', async () => {
        const doc = makeMainDoc('bareword_interface.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('Handle', doc);
        assert.strictEqual(result, null, 'an INTERFACE member must never satisfy a bare-word lookup');
    });

    test('a genuine top-level global in the same include chain still resolves', async () => {
        const doc = makeMainDoc('bareword_global.clw');
        const svc = new MemberLocatorService();
        const result = await svc.findVariableTokenInParentChain('GlobalFlag', doc);
        assert.ok(result, 'a real top-level global must still resolve through the include-chain walk');
        assert.strictEqual(result!.token.label, 'GlobalFlag');
    });
});
