import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';

/**
 * #261 — sentinel for the routine-local DATA variable lookup guarantee.
 *
 * Review #3 predicted that `tokenizeRoutineVariables()` splicing tokens into the
 * array AFTER `processDocumentStructure()` built its indexes would make the cached
 * structure's line index MISS routine-local variables. Empirical probe disproved
 * the user-visible half: the variable's ORIGINAL token (produced by the normal
 * tokenize pass) is in the index; what the splice adds is a phantom DUPLICATE
 * token that only exists in the raw array (tracked separately as its own issue).
 *
 * This test pins the guarantee that matters to consumers: a routine-local DATA
 * variable is findable both through the raw token array and through the cached
 * structure's per-line index.
 */
suite('DocumentStructure — routine-local DATA variables are indexed (#261)', () => {

    test('cached structure line index contains the routine-local variable token', () => {
        const source = [
            '   PROGRAM',                 // 0
            '   MAP',                     // 1
            'Foo      PROCEDURE()',       // 2
            '   END',                     // 3
            '   CODE',                    // 4
            '   RETURN',                  // 5
            '',                           // 6
            'Foo      PROCEDURE()',       // 7
            '   CODE',                    // 8
            '   DO MyRoutine',            // 9
            '',                           // 10
            'MyRoutine  ROUTINE',         // 11
            '   DATA',                    // 12
            'RtnVar       LONG',          // 13 — routine-local DATA variable
            '   CODE',                    // 14
            '   RtnVar = 1',              // 15
        ].join('\n');

        TokenCache.getInstance().clearAllTokens();
        const doc = TextDocument.create('file:///t261-routine.clw', 'clarion', 1, source);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const structure = TokenCache.getInstance().getStructure(doc);

        // Raw array sees the variable.
        assert.ok(tokens.some(t => t.line === 13 && t.value === 'RtnVar'),
            'raw token array must contain RtnVar at line 13');

        // The cached structure's line index sees it too — the #261 guarantee.
        const line13 = structure.getTokensByLine(13);
        assert.ok(line13 && line13.some(t => t.value === 'RtnVar'),
            `structure.getTokensByLine(13) must include RtnVar; got [${(line13 ?? []).map(t => t.value).join(', ')}]`);
    });
});
