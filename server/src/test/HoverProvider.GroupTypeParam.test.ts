/**
 * Tests for issue #215 — hover on structure fields accessed through GROUP,TYPE parameters
 * (e.g. `Info.Maximized` where `Info` is declared `*WindowInfo` in the PROCEDURE header).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

suite('HoverProvider — GROUP,TYPE parameter field access (#215)', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        return typeof hover?.contents === 'string'
            ? hover.contents
            : hover?.contents && 'value' in hover.contents ? hover.contents.value : '';
    }

    test('provides hover for field accessed on *GROUP,TYPE parameter (Info.Maximized)', async () => {
        const code = [
            'WindowInfo         GROUP,TYPE',
            'X                    SIGNED',
            'Y                    SIGNED',
            'Maximized            BYTE',
            'Minimized            BYTE',
            '  END',
            '',
            'TestProc PROCEDURE(STRING ProcName, *WindowInfo Info)',
            'CODE',
            '  IF Info.Maximized',
            '    RETURN',
            '  END',
        ].join('\n');

        const doc = TextDocument.create('test://group-param-#215.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        // Line 9: "  IF Info.Maximized" — "Maximized" starts at char 10
        const hover = await provider.provideHover(doc, Position.create(9, 12));
        assert.ok(hover !== null && hover !== undefined, 'Should provide hover for "Maximized" field accessed via *GROUP,TYPE parameter');
        const text = hoverText(hover);
        assert.ok(text.toLowerCase().includes('maximized'), `Hover should mention "Maximized", got: ${text}`);
    });

    test('provides hover for field accessed on *GROUP,TYPE parameter (pass-by-value variant)', async () => {
        const code = [
            'MyGroup            GROUP,TYPE',
            'Count                SHORT',
            'Total                LONG',
            '  END',
            '',
            'CalcProc PROCEDURE(*MyGroup G)',
            'CODE',
            '  G.Count += 1',
        ].join('\n');

        const doc = TextDocument.create('test://group-param2-#215.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        // Line 7: "  G.Count += 1" — "Count" starts at char 4
        const hover = await provider.provideHover(doc, Position.create(7, 5));
        assert.ok(hover !== null && hover !== undefined, 'Should provide hover for field "Count" accessed via *GROUP,TYPE parameter');
        const text = hoverText(hover);
        assert.ok(text.toLowerCase().includes('count'), `Hover should mention "Count", got: ${text}`);
    });
});
