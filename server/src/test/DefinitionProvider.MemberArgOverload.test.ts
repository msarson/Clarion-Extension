import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

/**
 * Issue #245 — go-to-definition must disambiguate an overloaded call by the resolved TYPE of a
 * member / reference / typed-variable argument (the same argument-type resolver signature help
 * uses), not fall back to paramCount-only. Here `pq` is a `&problems` (queue) reference passed
 * to `w.Setup(...)`, whose overloads are `(LONG)` at line 9 and `(*problems)` at line 10 — F12
 * must land on line 10.
 */
suite('DefinitionProvider — overload disambiguation by member/variable arg type (#245)', () => {
    setup(() => setServerInitialized(true));
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        '  END',                           // 2
        '',                                // 3
        'problems  QUEUE,TYPE',            // 4
        'Name        STRING(20)',          // 5
        '          END',                   // 6
        '',                                // 7
        'Widget  CLASS,TYPE',              // 8
        'Setup      PROCEDURE(LONG n)',    // 9   overload A (decl)
        'Setup      PROCEDURE(*problems q)',// 10  overload B (decl) — the target
        '         END',                    // 11
        '',                                // 12
        'Caller  PROCEDURE()',             // 13
        'w          &Widget',              // 14
        'pq         &problems',            // 15
        '  CODE',                          // 16
        '  w.Setup(pq)',                   // 17  F12 on Setup
    ].join('\n');

    function lineOf(result: Location | Location[] | null): number | undefined {
        if (!result) return undefined;
        const loc = Array.isArray(result) ? result[0] : result;
        return loc?.range?.start?.line;
    }

    test('F12 on w.Setup(pq) resolves to the *problems overload (line 10)', async () => {
        const doc = TextDocument.create('test://def-memberarg-245.clw', 'clarion', 1, SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new DefinitionProvider();
        // cursor inside "Setup" on the call line
        const result = await provider.provideDefinition(doc, { line: 17, character: 6 }) as Location | Location[] | null;
        assert.strictEqual(lineOf(result), 10,
            'a &problems (queue) argument must resolve F12 to the *problems overload, not the LONG one');
    });
});
