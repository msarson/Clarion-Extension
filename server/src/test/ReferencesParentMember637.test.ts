/**
 * #637 - Find All References on `PARENT.Member` finds the parent's member.
 *
 * ReferencesProvider resolved `SELF.x` and `PARENT.x` alike, with
 * ClassMemberResolver.findClassMemberInfo, which starts at SELF's class. So on `PARENT.Kill()`
 * inside an override it anchored on the override itself and returned the override's family -
 * not even the line it was invoked from. It now names each class the way hover and F12 do
 * (#626 for SELF, #648 for PARENT) and asks MemberLocatorService.findMemberInClass.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                    // 0
    'Mid        CLASS,TYPE',                         // 1
    'Kill         PROCEDURE(),BYTE,VIRTUAL',         // 2  the parent's Kill
    '           END',                                // 3
    'Browse PROCEDURE',                              // 4
    'ThisWindow           CLASS(Mid)',               // 5
    'Kill                   PROCEDURE(),BYTE,DERIVED', // 6  the override
    '                     END',                      // 7
    '  CODE',                                        // 8
    'Mid.Kill PROCEDURE()',                          // 9
    '  CODE',                                        // 10
    'ThisWindow.Kill PROCEDURE()',                   // 11
    '  CODE',                                        // 12
    '  RETURN PARENT.Kill()',                        // 13
    '  x# = SELF.Kill()',                            // 14
];

suite('Find All References on PARENT.Member finds the parent\'s member (#637)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test637/refs.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    async function refsAt(line: number): Promise<number[]> {
        const col = LINES[line].lastIndexOf('Kill');
        const r = await new ReferencesProvider().provideReferences(doc, { line, character: col + 1 }, { includeDeclaration: true });
        return (r ?? []).map(l => l.range.start.line).sort((a, b) => a - b);
    }

    // Whatever References lists for the parent's member itself - it also lists uses through a
    // subclass, which is its own question and not pinned here - PARENT.Kill() must list the same.
    test('PARENT.Kill() inside the override answers as the parent\'s Kill does', async () => {
        const fromParentsOwnDeclaration = await refsAt(2);
        assert.ok([2, 9, 13].every(l => fromParentsOwnDeclaration.includes(l)),
            `fixture: the parent's own list holds its declaration, body and the PARENT call: ${fromParentsOwnDeclaration}`);
        assert.deepStrictEqual(await refsAt(13), fromParentsOwnDeclaration);
    });
    test('CONTROL: SELF.Kill(): the override\'s declaration, body and this call', async () => {
        assert.deepStrictEqual(await refsAt(14), [6, 11, 14]);
    });
});
