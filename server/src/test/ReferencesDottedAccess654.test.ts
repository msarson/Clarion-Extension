/**
 * #654 (#638 step 4) — Find All References anchors a member access on the declaration hover and Go
 * to Definition name, through DottedAccessResolver.
 *
 * References resolved `obj.member` through its own chain walk and a "Tier 2" typed-variable lookup
 * (its scope-type index), which reads a local `ThisWindow CLASS(Base)` as a variable of type Base -
 * the #642 bug, here. So `ThisWindow.Kill()` on a local class that overrides Kill anchored on
 * Base.Kill and listed the parent's family, while F12 goes to the override.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { definitionLocations } from './support/hoverDefinitionAgreement';

const LINES = [
    '  MEMBER()',                                        // 0
    'Base       CLASS,TYPE',                             // 1
    'Kill         PROCEDURE(),BYTE,VIRTUAL',             // 2
    '           END',                                    // 3
    'Browse PROCEDURE',                                  // 4
    'ThisWindow           CLASS(Base)',                  // 5
    'Kill                   PROCEDURE(),BYTE,DERIVED',   // 6  the override
    '                     END',                          // 7
    '  CODE',                                            // 8
    '  x# = ThisWindow.Kill()',                          // 9
    'Base.Kill PROCEDURE()',                             // 10
    '  CODE',                                            // 11
    'ThisWindow.Kill PROCEDURE()',                       // 12
    '  CODE',                                            // 13
    '  RETURN PARENT.Kill()',                            // 14
];

suite('Find All References on obj.member anchors where F12 goes (#654)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test654/refs.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    async function refsAt(line: number, word: string): Promise<number[]> {
        const col = LINES[line].lastIndexOf(word);
        const r = await new ReferencesProvider().provideReferences(doc, { line, character: col + 1 }, { includeDeclaration: true });
        return (r ?? []).map(l => l.range.start.line).sort((a, b) => a - b);
    }

    test('CONTROL: F12 on ThisWindow.Kill() goes to the local override', async () => {
        const col = LINES[9].lastIndexOf('Kill');
        const def = await new DefinitionProvider().provideDefinition(doc, { line: 9, character: col + 1 });
        assert.deepStrictEqual(definitionLocations(def).map(l => l.line), [6]);
    });

    test('ThisWindow.Kill() lists what References on the override\'s own declaration lists', async () => {
        const fromDeclaration = await refsAt(6, 'Kill');
        assert.ok(fromDeclaration.includes(6) && fromDeclaration.includes(9), `fixture: ${fromDeclaration}`);
        assert.deepStrictEqual(await refsAt(9, 'Kill'), fromDeclaration);
    });
});
