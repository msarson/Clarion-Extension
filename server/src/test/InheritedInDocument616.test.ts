/**
 * SELF/PARENT members inherited from classes declared only in the current document (#616).
 *
 * The parent-chain step asked the structure index alone, so with no index entry (a file outside
 * the solution, an unsaved class) hover found nothing while F12 resolved it. The one-level case
 * is pinned by HoverDefinitionAgreement.test.ts; this covers the climb past the parent.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const LINES = [
    '  PROGRAM',                                // 0
    '  MAP',                                    // 1
    '  END',                                    // 2
    'Root      CLASS,TYPE',                     // 3
    'Depth       LONG',                         // 4
    'Reset       PROCEDURE',                    // 5
    '          END',                            // 6
    'Mid       CLASS(Root),TYPE',               // 7
    'Label       STRING(10)',                   // 8
    '          END',                            // 9
    'Leaf      CLASS(Mid),TYPE',                // 10
    'Show        PROCEDURE',                    // 11
    '          END',                            // 12
    '  CODE',                                   // 13
    'Leaf.Show PROCEDURE',                      // 14
    '  CODE',                                   // 15
    '  SELF.Depth = 1',                         // 16 — from the grandparent
    '  SELF.Label = \'x\'',                     // 17 — from the parent
    '  PARENT.Reset()',                         // 18 — PARENT is Mid; Reset is Root's
];

suite('SELF/PARENT members inherited from classes in the same document (#616)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test616/Chain.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    const cases: Array<[string, number, string, number]> = [
        ['SELF member from the grandparent', 16, 'Depth', 4],
        ['SELF member from the parent',      17, 'Label', 8],
        ['PARENT method the parent inherits', 18, 'Reset', 5],
    ];

    for (const [name, line, word, expected] of cases) {
        test(name, async () => {
            const position = { line, character: LINES[line].indexOf(word) + 1 };
            const hover = hoverLocations(await new HoverProvider().provideHover(doc, position)).map(l => l.line);
            const def = definitionLocations(await new DefinitionProvider().provideDefinition(doc, position)).map(l => l.line);
            assert.ok(hover.includes(expected), `hover -> ${JSON.stringify(hover)}`);
            assert.deepStrictEqual(def, [expected]);
        });
    }
});
