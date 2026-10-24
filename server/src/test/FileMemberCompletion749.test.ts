import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionItemKind, CompletionTriggerKind, InsertTextFormat } from 'vscode-languageserver/node';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #749 — after a label inside a FILE (`MyKey K`), completion offered the window control attribute
 * KEY(keycode) and built-ins such as KEYBOARD. Compiled on Clarion 10 and 12, a labelled line
 * between a FILE's header and its RECORD takes KEY, INDEX, MEMO, BLOB or RECORD and nothing else
 * (a field there is `Illegal data type`); after the RECORD, and inside it, none of them.
 */

let counter = 0;

/** Completes at `¦` in `lines`, as VS Code asks while a word is typed. */
async function complete(lines: string[]): Promise<CompletionItem[]> {
    const line = lines.findIndex(l => l.includes('¦'));
    const character = lines[line].indexOf('¦');
    const doc = TextDocument.create(`file:///C:/temp/filemember749-${++counter}.clw`, 'clarion', 1, lines.map(l => l.replace('¦', '')).join('\r\n'));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    return new CompletionProvider().onCompletion({
        textDocument: { uri: doc.uri },
        position: { line, character },
        context: { triggerKind: CompletionTriggerKind.Invoked },
    }, doc);
}

const labels = (items: CompletionItem[]) => items.map(i => String(i.label)).sort();

/** A program declaring one FILE; `members` go before its RECORD, `fields` inside it. */
function inFile(members: string[], fields: string[] = ['Field1  STRING(20)']): string[] {
    return ['  PROGRAM', '', "MyFile FILE,DRIVER('TOPSPEED'),PRE(MFI)", ...members,
        'RECORD  RECORD', ...fields, '      END', '     END', '',
        'Global  LONG', '  MAP', '  END', '  CODE', '  RETURN'];
}

suite('Completion after a label inside a FILE (#749)', () => {
    suiteSetup(() => setServerInitialized(true));

    test('a typed K offers the KEY declaration alone, not the attribute or KEYBOARD', async () => {
        const items = await complete(inFile(['MyKey K¦']));
        assert.deepStrictEqual(labels(items), ['KEY']);
        assert.strictEqual(items[0].kind, CompletionItemKind.Keyword);
        assert.ok(!/keycode/i.test(String(items[0].detail)), String(items[0].detail));
    });

    test('nothing typed yet: exactly KEY, INDEX, MEMO, BLOB and RECORD', async () => {
        assert.deepStrictEqual(labels(await complete(inFile(['MyKey ¦']))), ['BLOB', 'INDEX', 'KEY', 'MEMO', 'RECORD']);
    });

    test('a declaration with brackets inserts them with the cursor inside', async () => {
        const items = await complete(inFile(['MyKey ¦']));
        const insert = (name: string) => items.find(i => i.label === name)!;
        assert.strictEqual(insert('KEY').insertText, 'KEY(${1:component})');
        assert.strictEqual(insert('KEY').insertTextFormat, InsertTextFormat.Snippet);
        assert.strictEqual(insert('MEMO').insertText, 'MEMO(${1:length})');
        assert.strictEqual(insert('INDEX').insertText, 'INDEX(${1})');
        assert.strictEqual(insert('BLOB').insertText ?? 'BLOB', 'BLOB');
        assert.strictEqual(insert('RECORD').insertText ?? 'RECORD', 'RECORD');
    });

    test('lower case is matched, and a member after another member gets the same list', async () => {
        assert.deepStrictEqual(labels(await complete(inFile(['MyKey   KEY(MFI:Field1)', 'Notes   me¦']))), ['MEMO']);
    });

    test('inside the RECORD a field label gets the word list (data types), not the FILE members', async () => {
        const items = labels(await complete(inFile([], ['Field1  STRING(20)', 'Field2  LO¦'])));
        assert.ok(items.includes('LONG'), items.join(', '));
    });

    test('outside a FILE nothing changes', async () => {
        const lines = inFile([]);
        lines.splice(lines.indexOf('Global  LONG'), 0, 'Other   LO¦');
        const items = labels(await complete(lines));
        assert.ok(items.includes('LONG'), items.join(', '));
    });
});
