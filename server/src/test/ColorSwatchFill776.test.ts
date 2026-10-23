import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionColorResolver } from '../ClarionColorResolver';

/**
 * #776 — the editor showed a colour swatch for each colour in COLOR(...) but none for FILL(...),
 * which takes one colour (an RGB value or a COLOR: equate) the same way.
 */
suite('Colour swatches on FILL (#776)', () => {
    function swatches(code: string): string[] {
        const doc = TextDocument.create('test://fill776.clw', 'clarion', 1, code);
        return ClarionColorResolver.provideDocumentColors(new ClarionTokenizer(code).tokenize(), doc)
            .map(c => `${c.range.start.line}:${doc.getText(c.range)}`);
    }

    const WINDOW = [
        "Win WINDOW('x'),AT(,,200,100)",                                        // 0
        '      BOX,AT(10,10,20,20),COLOR(COLOR:Black),FILL(COLOR:Yellow)',       // 1
        '      REGION,AT(40,10,20,20),FILL(0FF00H)',                             // 2
        '      BOX,AT(70,10,20,20),FILL(COLOR:Red),COLOR(COLOR:Red)',            // 3
        '    END',                                                              // 4
        ''].join('\n');

    test('FILL gets a swatch beside COLOR', () => {
        assert.deepStrictEqual(swatches(WINDOW).filter(s => s.startsWith('1:')), ['1:COLOR:Black', '1:COLOR:Yellow']);
    });

    test('an RGB value in FILL gets a swatch', () => {
        assert.deepStrictEqual(swatches(WINDOW).filter(s => s.startsWith('2:')), ['2:0FF00H']);
    });

    test('the same colour in FILL and COLOR on one line gets a swatch at each', () => {
        const doc = TextDocument.create('test://fill776.clw', 'clarion', 1, WINDOW);
        const at = ClarionColorResolver.provideDocumentColors(new ClarionTokenizer(WINDOW).tokenize(), doc)
            .filter(c => c.range.start.line === 3).map(c => c.range.start.character).sort((a, b) => a - b);
        const line = WINDOW.split('\n')[3];
        assert.deepStrictEqual(at, [line.indexOf('COLOR:Red'), line.lastIndexOf('COLOR:Red')]);
    });
});
