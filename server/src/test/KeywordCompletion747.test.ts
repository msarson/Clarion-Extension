import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionItemKind, CompletionTriggerKind } from 'vscode-languageserver/node';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { KeywordService } from '../utils/KeywordService';

/**
 * #747 — typing `END` and pressing Enter gave `ENDPAGE`. The list offered every word starting
 * with END except END itself, so a longer word sat on top and Enter accepted it. A keyword typed
 * in full must be offered as itself: VS Code then puts the exact match first, and Enter leaves
 * the word as it was typed.
 */

let counter = 0;

/** The completion items with `typed` written at the start of a statement in CODE. */
async function completeStatement(typed: string): Promise<CompletionItem[]> {
    const lines = ['  PROGRAM', '  MAP', '  END', 'Num LONG', '  CODE', '  ' + typed, ''];
    const doc = TextDocument.create(`file:///C:/temp/kw747-${++counter}.clw`, 'clarion', 1, lines.join('\r\n'));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    return new CompletionProvider().onCompletion({
        textDocument: { uri: doc.uri },
        position: { line: 5, character: 2 + typed.length },
        context: { triggerKind: CompletionTriggerKind.Invoked },
    }, doc);
}

suite('Keywords typed in full are offered as themselves (#747)', () => {
    suiteSetup(() => setServerInitialized(true));

    // END, BY and TO each have longer words on offer (ENDPAGE, BYTES, TOOLBAR) that Enter would accept
    for (const keyword of ['END', 'BY', 'TO', 'GOTO', 'ROUTINE', 'PROGRAM', 'PROCEDURE']) {
        test(`${keyword} is offered as a keyword`, async () => {
            const items = await completeStatement(keyword);
            const own = items.find(i => String(i.label).toUpperCase() === keyword);
            assert.ok(own, `${keyword} not offered; got ${items.map(i => i.label).join(', ')}`);
            assert.strictEqual(own!.kind, CompletionItemKind.Keyword);
        });
    }

    test('END still offers the longer words after it', async () => {
        const labels = (await completeStatement('END')).map(i => String(i.label).toUpperCase());
        assert.ok(labels.includes('END') && labels.includes('ENDPAGE'), labels.join(', '));
    });

    // Not Win32 language: Clarion# exception handling, and a legacy statement
    for (const word of ['TRY', 'CATCH', 'FINALLY', 'THROW', 'FUNCTION']) {
        test(`${word} is not offered`, async () => {
            const labels = (await completeStatement(word)).map(i => String(i.label).toUpperCase());
            assert.ok(!labels.includes(word), labels.join(', '));
        });
    }

    // Clarion 10 and 12 reject it: `X = BNOT 5` is `Unknown identifier: BNOT`, `BNOT(5)` `Unknown function label`
    test('BNOT, which Clarion does not have, is not in the keyword catalog', () => {
        assert.strictEqual(KeywordService.getInstance().getKeyword('BNOT'), undefined);
    });
});
