/**
 * SELF.member / PARENT.member in a module that declares the same local CLASS label in
 * two procedures (#608): the method belongs to the declaration nearest above it, not to
 * the first one in the file.
 *
 * app1's UpdateUserEmails_ACMMenu.clw declares `ThisWindow` twice. The lookups took the
 * first, so the second procedure's methods resolved SELF members, and PARENT's class,
 * against the first procedure's ThisWindow.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                   // 0
    'FirstProc PROCEDURE',                          // 1
    'ThisWindow   CLASS(Base)',                     // 2
    'Init           PROCEDURE',                     // 3
    '             END',                             // 4
    '  CODE',                                       // 5
    'ThisWindow.Init PROCEDURE',                    // 6
    '  CODE',                                       // 7
    '  SELF.Init()',                                // 8
    'SecondProc PROCEDURE',                         // 9
    'ThisWindow   CLASS(Other)',                    // 10
    'Init           PROCEDURE',                     // 11
    '             END',                             // 12
    '  CODE',                                       // 13
    'ThisWindow.Init PROCEDURE',                    // 14
    '  CODE',                                       // 15
    '  SELF.Init()',                                // 16
];
const SOURCE = LINES.join('\r\n');

suite('SELF/PARENT resolve against the nearest same-named local CLASS (#608)', () => {
    let doc: TextDocument;
    let resolver: ClassMemberResolver;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test608/Two.clw', 'clarion', 1, SOURCE);
        resolver = new ClassMemberResolver();
    });

    const tokens = () => TokenCache.getInstance().getTokens(doc);

    test('SELF.Init in the second procedure is the second ThisWindow\'s Init', () => {
        const info = resolver.findClassMemberInfo('Init', doc, 16, tokens(), 0);
        assert.ok(info, 'Init should resolve');
        assert.strictEqual(info!.line, 11);
    });

    test('SELF.Init in the first procedure is still the first ThisWindow\'s Init', () => {
        const info = resolver.findClassMemberInfo('Init', doc, 8, tokens(), 0);
        assert.ok(info, 'Init should resolve');
        assert.strictEqual(info!.line, 3);
    });

    test('PARENT in the second procedure is the second ThisWindow\'s parent', async () => {
        const info = await resolver.getParentClassInfo(doc, 16, tokens());
        assert.strictEqual(info?.parentClassName, 'Other');
    });

    test('PARENT in the first procedure is still Base', async () => {
        const info = await resolver.getParentClassInfo(doc, 8, tokens());
        assert.strictEqual(info?.parentClassName, 'Base');
    });
});
