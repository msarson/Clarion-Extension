import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentHighlight, DocumentHighlightKind } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DocumentHighlightProvider } from '../providers/DocumentHighlightProvider';
import { setServerInitialized } from '../serverState';

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('DocumentHighlightProvider', () => {
    let provider: DocumentHighlightProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new DocumentHighlightProvider();
    });

    test('returns null when no symbol at cursor', async () => {
        const doc = createDocument('MyProc PROCEDURE\nCODE\n  RETURN');
        seedCache(doc);
        const result = await provider.provideDocumentHighlights(doc, { line: 2, character: 0 });
        assert.strictEqual(result, null);
    });

    test('highlights all occurrences of a local variable', async () => {
        const code = [
            'MyProc PROCEDURE',
            '  Counter  LONG',
            'CODE',
            '  Counter = 0',
            '  Counter += 1',
            '  IF Counter > 10',
            '    Counter = 0',
            '  END',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const highlights = await provider.provideDocumentHighlights(doc, { line: 3, character: 3 });
        assert.ok(highlights !== null, 'Should return highlights');
        assert.ok(highlights!.length >= 3, `Expected at least 3 highlights, got ${highlights!.length}`);
    });

    test('declaration is marked as Write kind', async () => {
        const code = [
            'MyProc PROCEDURE',
            '  MyVar  LONG',
            'CODE',
            '  MyVar = 5',
            '  MyVar += 1',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const highlights: DocumentHighlight[] | null = await provider.provideDocumentHighlights(doc, { line: 3, character: 3 });
        assert.ok(highlights !== null);

        const writeHighlights = highlights!.filter((h: DocumentHighlight) => h.kind === DocumentHighlightKind.Write);
        assert.ok(writeHighlights.length >= 1, 'Should have at least one Write highlight for declaration');
    });

    test('usages are marked as Read kind', async () => {
        const code = [
            'MyProc PROCEDURE',
            '  MyVar  LONG',
            'CODE',
            '  MyVar = 5',
            '  MyVar += 1',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const highlights: DocumentHighlight[] | null = await provider.provideDocumentHighlights(doc, { line: 3, character: 3 });
        assert.ok(highlights !== null);

        const readHighlights = highlights!.filter((h: DocumentHighlight) => h.kind === DocumentHighlightKind.Read);
        assert.ok(readHighlights.length >= 1, 'Should have at least one Read highlight for usages');
    });

    test('only returns highlights for current file (no cross-file results)', async () => {
        const code = [
            'MyProc PROCEDURE',
            '  Counter  LONG',
            'CODE',
            '  Counter = 0',
        ].join('\n');
        const doc = createDocument(code, 'file:///myfile.clw');
        seedCache(doc);

        const highlights: DocumentHighlight[] | null = await provider.provideDocumentHighlights(doc, { line: 3, character: 3 });
        assert.ok(highlights !== null);
        assert.ok(
            highlights!.every((h: DocumentHighlight) => h.kind !== undefined),
            'All highlights should have a kind'
        );
        // Highlights don't carry URI — just ranges, all from current doc by definition
        assert.ok(highlights!.length >= 1);
    });

    test('all highlight ranges cover only the symbol name', async () => {
        const code = [
            'MyProc PROCEDURE',
            '  MyVar  LONG',
            'CODE',
            '  MyVar = 5',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const highlights = await provider.provideDocumentHighlights(doc, { line: 3, character: 3 });
        assert.ok(highlights !== null && highlights!.length > 0);
        for (const h of highlights! as DocumentHighlight[]) {
            const len = (h as DocumentHighlight).range.end.character - (h as DocumentHighlight).range.start.character;
            assert.strictEqual(len, 'MyVar'.length, `Range should span 5 chars, got ${len}`);
        }
    });
});
