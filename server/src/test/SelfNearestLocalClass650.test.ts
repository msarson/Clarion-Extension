/**
 * #650 - `SELF.member` in the second of two same-named local classes resolves against that
 * second class, in hover, Go to Definition and Go to Implementation.
 *
 * Generated modules declare `ThisWindow` in every procedure. #608 fixed "the first ThisWindow
 * in the file wins" in ClassMemberResolver; #626 then moved SELF onto
 * MemberLocatorService.findMemberInClass, which took a class name and no line, so the bug came
 * back on all three features while the #608 test - pinned to ClassMemberResolver - stayed green.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const LINES = [
    '  MEMBER()',                                   // 0
    'FirstProc PROCEDURE',                          // 1
    'ThisWindow   CLASS(Base)',                     // 2
    'Init           PROCEDURE',                     // 3
    'Size           LONG',                          // 4
    '             END',                             // 5
    '  CODE',                                       // 6
    'ThisWindow.Init PROCEDURE',                    // 7
    '  CODE',                                       // 8
    '  SELF.Init()',                                // 9
    '  SELF.Size = 1',                              // 10
    'SecondProc PROCEDURE',                         // 11
    'ThisWindow   CLASS(Other)',                    // 12
    'Init           PROCEDURE',                     // 13
    'Size           LONG',                          // 14
    '             END',                             // 15
    '  CODE',                                       // 16
    'ThisWindow.Init PROCEDURE',                    // 17
    '  CODE',                                       // 18
    '  SELF.Init()',                                // 19
    '  SELF.Size = 2',                              // 20
];

suite('SELF.member in the second of two same-named local classes (#650)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test650/Two.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    async function at(line: number, word: string) {
        const position = { line, character: LINES[line].indexOf(word) + 1 };
        const lines = (l: { line: number }[]) => l.map(x => x.line);
        return {
            f12: lines(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
            hover: lines(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            impl: lines(definitionLocations(await new ImplementationProvider().provideImplementation(doc, position) as Location | null)),
        };
    }

    test('SELF.Init() in the second procedure: the second ThisWindow\'s Init, on all three', async () => {
        assert.deepStrictEqual(await at(19, 'Init'), { f12: [13], hover: [13, 17], impl: [17] });
    });
    test('SELF.Size in the second procedure: the second ThisWindow\'s Size', async () => {
        const got = await at(20, 'Size');
        assert.deepStrictEqual({ f12: got.f12, hover: got.hover }, { f12: [14], hover: [14] });
    });
    test('CONTROL: SELF.Init() in the first procedure: the first ThisWindow\'s Init', async () => {
        assert.deepStrictEqual(await at(9, 'Init'), { f12: [3], hover: [3, 7], impl: [7] });
    });
});
