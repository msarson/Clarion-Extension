/**
 * SELF.member / PARENT.member in a module that declares the same local CLASS label in
 * two procedures (#608): the method belongs to the declaration nearest above it, not to
 * the first one in the file.
 *
 * app1's UpdateUserEmails_ACMMenu.clw declares `ThisWindow` twice. The lookups took the
 * first, so the second procedure's methods resolved SELF members, and PARENT's class,
 * against the first procedure's ThisWindow.
 *
 * #637: pinned ClassMemberResolver.findClassMemberInfo and getParentClassInfo, which are
 * retired; it now asks what hover, F12 and Ctrl+F12 run - the SELF lookup
 * (support/selfMemberLookup.ts) and MemberLocatorService.resolveParentClassAt (#648).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { selfMemberAt } from './support/selfMemberLookup';
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

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test608/Two.clw', 'clarion', 1, SOURCE);
        TokenCache.getInstance().getTokens(doc);
    });

    test('SELF.Init in the second procedure is the second ThisWindow\'s Init', async () => {
        const info = await selfMemberAt(doc, 16, 'Init', 0);
        assert.ok(info, 'Init should resolve');
        assert.strictEqual(info!.line, 11);
    });

    test('SELF.Init in the first procedure is still the first ThisWindow\'s Init', async () => {
        const info = await selfMemberAt(doc, 8, 'Init', 0);
        assert.ok(info, 'Init should resolve');
        assert.strictEqual(info!.line, 3);
    });

    test('PARENT in the second procedure is the second ThisWindow\'s parent', async () => {
        const info = await new MemberLocatorService().resolveParentClassAt(doc, 16);
        assert.strictEqual(info?.parentClassName, 'Other');
    });

    test('PARENT in the first procedure is still Base', async () => {
        const info = await new MemberLocatorService().resolveParentClassAt(doc, 8);
        assert.strictEqual(info?.parentClassName, 'Base');
    });
});
