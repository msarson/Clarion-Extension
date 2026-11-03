import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * #791 — hovering NAME in a MAP prototype's attributes showed the NAME(file) function card, and
 * PROC, DLL, RAW, C and PASCAL there showed nothing: the attribute hover only ran inside a
 * control or CLASS declaration. On a MAP or MODULE prototype, a word in the attribute list (after
 * the parameter list, on the prototype's line or a line continued from it) now gets its attribute
 * card, and NAME the prototype's meaning: the external name the linker uses. NAME(file) in code
 * and NAME on a FILE keep their own cards.
 */
suite('Hover on the attributes of a MAP prototype (#791)', () => {
    const code = [
        '  PROGRAM',                                                                // 0
        '  MAP',                                                                    // 1
        "    XL:Column:S      (SIGNED col),STRING,EXPORT,NAME('__XL_ColumnS')",     // 2
        "Other            (LONG n),PROC,NAME('Other'),DLL(1)",                      // 3
        "Wide             (LONG Name, LONG Raw), |",                                // 4
        "                   C,RAW,NAME('_Wide')",                                   // 5
        "    MODULE('ext.obj')",                                                    // 6
        "AddCount PROCEDURE(LONG),LONG,PASCAL,NAME('_AddCount')",                   // 7
        '    END',                                                                  // 8
        '  END',                                                                    // 9
        "F  FILE,DRIVER('TOPSPEED'),NAME('f.tps')",                                 // 10
        'R    RECORD',                                                              // 11
        'x      LONG',                                                              // 12
        '     END',                                                                 // 13
        '   END',                                                                   // 14
        '  CODE',                                                                   // 15
        '  MESSAGE(NAME(F))',                                                       // 16
    ].join('\n');

    /** Hover over the `nth` `word` on line `line` (0-based). */
    async function hoverAt(line: number, word: string, nth = 0): Promise<string> {
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
        const doc = TextDocument.create('test://proto791.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);
        const lineText = code.split('\n')[line];
        let at = -1;
        for (let i = 0; i <= nth; i++) at = lineText.indexOf(word, at + 1);
        const hover = await new HoverProvider().provideHover(doc, Position.create(line, at + 1));
        tokenCache.clearAllTokens();
        if (!hover) return '';
        const c = hover.contents as { value?: string } | string;
        return typeof c === 'string' ? c : c.value ?? '';
    }

    test('NAME on a prototype is the external name for the linker, not NAME(file)', async () => {
        for (const [line, label] of [[2, 'indented, prefixed label'], [3, 'column 0'], [5, 'continued line'], [7, 'PROCEDURE in a MODULE']] as [number, string][]) {
            const text = await hoverAt(line, 'NAME');
            assert.ok(/Attribute: NAME/.test(text), `${label}: not the attribute card:\n${text}`);
            assert.ok(/linker/i.test(text), `${label}: not the prototype's meaning:\n${text}`);
            assert.ok(!/Built-in Function/.test(text), `${label}: still the NAME(file) card:\n${text}`);
        }
    });

    test('the other prototype attributes get their cards', async () => {
        for (const [line, word] of [[3, 'PROC'], [3, 'DLL'], [5, 'RAW'], [5, 'C'], [7, 'PASCAL']] as [number, string][]) {
            const text = await hoverAt(line, word);
            assert.ok(new RegExp(`Attribute: ${word}\\b`).test(text), `${word}@${line}:\n${text}`);
        }
    });

    test('a parameter named like an attribute is not an attribute', async () => {
        assert.ok(!/Attribute:/.test(await hoverAt(4, 'Name')), 'Name parameter');
        assert.ok(!/Attribute:/.test(await hoverAt(4, 'Raw')), 'Raw parameter');
    });

    test('NAME elsewhere keeps its own card', async () => {
        assert.ok(/Built-in Function: NAME/.test(await hoverAt(16, 'NAME')), 'NAME(F) in code');
        const onFile = await hoverAt(10, 'NAME');
        assert.ok(!/linker/i.test(onFile), `NAME on a FILE took the prototype meaning:\n${onFile}`);
    });
});
