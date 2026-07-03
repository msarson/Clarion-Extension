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

    test('does not bleed into sibling procedure when same-named local var exists (abutil.clw pattern)', async () => {
        // Mirrors the abutil.clw case: TestClass.Update has `Info LIKE(WindowInfo),AUTO` as a local
        // variable, while TestClass.UpdateWindowInfo has `*WindowInfo Info` as a parameter.
        // Hovering on Info.Maximized inside UpdateWindowInfo must NOT pick up the sibling's local.
        const code = [
            'WindowInfo         GROUP,TYPE',
            'Maximized            BYTE',
            'Minimized            BYTE',
            '  END',
            '',
            'TestClass.Update PROCEDURE()',
            'Info               LIKE(WindowInfo),AUTO',
            '  CODE',
            '  Info.Maximized = 1',
            '',
            'TestClass.UpdateWindowInfo PROCEDURE(*WindowInfo Info)',
            '  CODE',
            '  IF Info.Maximized',
            '    RETURN',
            '  END',
        ].join('\n');

        const doc = TextDocument.create('test://sibling-scope-#215.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        // Line 12: "  IF Info.Maximized" — cursor on "Maximized"
        // "  IF Info.Maximized" → 0=sp,1=sp,2=I,3=F,4=sp,5=I,6=n,7=f,8=o,9=.,10=M...
        const hover = await provider.provideHover(doc, Position.create(12, 12));
        assert.ok(hover !== null && hover !== undefined,
            'Should provide hover for "Maximized" even when same-named local exists in sibling procedure');
        const text = hoverText(hover);
        assert.ok(text.toLowerCase().includes('maximized'), `Hover should mention "Maximized", got: ${text}`);
    });
});
