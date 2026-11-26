import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * #891 (from #884's review) — #884 leaves out structure keywords and bare CODE / DATA statements
 * as references of a name spelled like a keyword. These pin the forms that must stay references
 * of a WINDOW named Window (a property access, an argument), and that #884's tightened
 * execution-marker rule opens the code section only where a CODE statement stands alone.
 */
suite('A name spelled like a keyword keeps its other reference forms (#891)', () => {
    setup(() => { setServerInitialized(true); TokenCache.getInstance().clearAllTokens(); });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    async function referenceLines(uri: string, lines: string[], line: number, character: number): Promise<string[]> {
        const doc = TextDocument.create(uri, 'clarion', 1, lines.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
        const refs = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
        return [...new Set((refs ?? []).map(r => r.range.start.line))].sort((a, b) => a - b).map(String);
    }

    test('Window{PROP:Text}, OPEN(Window) and CLOSE(Window) are references of the WINDOW named Window', async () => {
        const src = [
            '  PROGRAM',                                      // 0
            '  MAP',                                          // 1
            '  END',                                          // 2
            "Window WINDOW('Caption'),AT(,,100,100)",         // 3  declaration
            '       END',                                     // 4
            'Count  LONG',                                    // 5  not a reference
            '  CODE',                                         // 6
            '  OPEN(Window)',                                 // 7  reference
            "  Window{PROP:Text} = 'x'",                      // 8  reference
            '  CLOSE(Window)',                                // 9  reference
        ];
        assert.deepStrictEqual(await referenceLines('file:///kw891-window.clw', src, 3, 1), ['3', '7', '8', '9']);
    });

    /** The line MyProc's code section starts on, as the document structure (outline) reads it. */
    function codeLine(lines: string[]): number | undefined {
        const tokens = new ClarionTokenizer(lines.join('\r\n')).tokenize();
        const proc = tokens.find(t => t.label?.toLowerCase() === 'myproc' && t.executionMarker !== undefined);
        return proc?.executionMarker?.line;
    }

    test('a CODE after other code on its line does not open the code section; the statement below does', () => {
        const src = [
            '  MEMBER()',                     // 0
            'MyProc PROCEDURE()',             // 1
            'Code   LONG',                    // 2
            'Temp   LONG',                    // 3
            '  CODE',                         // 4  the code section
            '  Temp = Code',                  // 5  Code here is the variable
        ];
        assert.strictEqual(codeLine(src), 4);
    });

    test('a CODE continuing a `|` line is part of that statement, not a code section', () => {
        const src = [
            '  MEMBER()',                     // 0
            'MyProc PROCEDURE()',             // 1
            'Code   LONG',                    // 2
            'Temp   LONG',                    // 3
            '  CODE',                         // 4  the code section
            '  Temp = 1 + |',                 // 5
            '         Code',                  // 6  continues line 5: the variable
        ];
        assert.strictEqual(codeLine(src), 4);
    });
});
