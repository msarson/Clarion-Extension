import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * #891 (from #883's review) — #883 gave a column-0 label spelled like a keyword its own card in a
 * GROUP,TYPE and as a variable. The same holds for a field of a QUEUE and a property of a
 * CLASS, which #883's tests did not cover.
 */
suite('Hover on a keyword-named label in a QUEUE or a CLASS (#891)', () => {
    setup(() => TokenCache.getInstance().clearAllTokens());
    teardown(() => TokenCache.getInstance().clearAllTokens());

    async function hoverAt(uri: string, lines: string[], line: number, character: number): Promise<string> {
        const doc = TextDocument.create(uri, 'clarion', 1, lines.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
        const h = await new HoverProvider().provideHover(doc, Position.create(line, character));
        const c = (h as { contents: unknown } | null)?.contents;
        return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
    }

    const SRC = [
        '  PROGRAM',                      // 0
        '  MAP',                          // 1
        '  END',                          // 2
        'ErrQ       QUEUE,TYPE',          // 3
        'Code         LONG',              // 4  a QUEUE field named Code
        'Map          STRING(20)',        // 5  a QUEUE field named Map
        '           END',                 // 6
        'Logger     CLASS,TYPE',          // 7
        'Code         LONG',              // 8  a CLASS property named Code
        '           END',                 // 9
        '  CODE',                         // 10
    ];

    test('a QUEUE field named Code shows the field, not the CODE keyword card', async () => {
        const text = await hoverAt('file:///kw891-q.clw', SRC, 4, 1);
        assert.ok(!/Begins the executable code section/.test(text), text);
        assert.ok(/\bCode\b/.test(text) && /LONG/.test(text), text || '(no hover)');
    });

    test('a QUEUE field named Map shows the field, not the MAP keyword card', async () => {
        const text = await hoverAt('file:///kw891-q.clw', SRC, 5, 1);
        assert.ok(!/external procedure prototypes/i.test(text), text);
        assert.ok(/\bMap\b/.test(text) && /STRING/.test(text), text || '(no hover)');
    });

    test('a CLASS property named Code shows the property, not the CODE keyword card', async () => {
        const text = await hoverAt('file:///kw891-q.clw', SRC, 8, 1);
        assert.ok(!/Begins the executable code section/.test(text), text);
        assert.ok(/\bCode\b/.test(text) && /LONG/.test(text), text || '(no hover)');
    });

    test('the CODE statement still shows the keyword card', async () => {
        const text = await hoverAt('file:///kw891-q.clw', SRC, 10, 3);
        assert.ok(/Begins the executable code section/.test(text), text || '(no hover)');
    });
});
