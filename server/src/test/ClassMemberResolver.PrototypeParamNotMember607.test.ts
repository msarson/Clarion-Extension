/**
 * SELF.member lookup in the current document (#607): only a declaration's label names
 * a class member, and the scan ends at the CLASS's own END.
 *
 * Reported from ap1's generated APAccountFile_IBSCommon.clw: `SELF.Request` hovered as
 * "Class Property · ThisWindow" and F12 went to
 * `Run PROCEDURE(USHORT Number,BYTE Request)` - the parameter name in a method
 * prototype had been taken for a member. The real property is the inherited
 * `WindowManager.Request`. The same scan stopped only at an END in column 0, so past a
 * generated local class (whose END is indented) it read on through the rest of the file.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                                                  // 0
    'ThisProc PROCEDURE',                                                          // 1
    'ThisWindow           CLASS',                                                  // 2
    'Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC',      // 3 — parameter named Request
    'Request                BYTE',                                                 // 4 — the real member
    'Init                   PROCEDURE(),BYTE,PROC',                                // 5
    'SetMode                PROCEDURE(LONG Mode)',                                 // 6 — Mode: a parameter only
    '                     END',                                                    // 7 — indented END, as generated
    '  CODE',                                                                      // 8
    '',                                                                            // 9
    'ThisWindow.Init PROCEDURE',                                                   // 10
    '  CODE',                                                                      // 11
    '  SELF.Request = 1',                                                          // 12
    '  SELF.Mode = 2',                                                             // 13
    '  SELF.Tally = 3',                                                            // 14
    '  RETURN 0',                                                                  // 15
    '',                                                                            // 16
    'OtherProc PROCEDURE',                                                         // 17
    'Tally      LONG',                                                             // 18 — a later procedure's local, after the CLASS
    '  CODE',                                                                      // 19
];
const SOURCE = LINES.join('\r\n');

suite('Class member lookup: prototype parameters are not members (#607)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test607/ThisProc.clw', 'clarion', 1, SOURCE);
    });

    function lookup(member: string, atLine: number) {
        const tokens = TokenCache.getInstance().getTokens(doc);
        return new ClassMemberResolver().findClassMemberInfo(member, doc, atLine, tokens, undefined);
    }

    test('SELF.Request resolves to the Request property, not to Run\'s parameter', () => {
        const info = lookup('Request', 12);
        assert.ok(info, 'Request should resolve');
        assert.strictEqual(info!.line, 4, `resolved to line ${info!.line}: ${LINES[info!.line]}`);
    });

    test('a name that is only a prototype parameter is not a member', () => {
        const info = lookup('Mode', 13);
        assert.strictEqual(info, null, info ? `resolved to line ${info.line}: ${LINES[info.line]}` : '');
    });

    test('the member scan stops at the CLASS\'s own END, even when it is indented', () => {
        const info = lookup('Tally', 14);
        assert.strictEqual(info, null, info ? `resolved to line ${info.line}: ${LINES[info.line]}` : '');
    });

    test('a derived CLASS naming this class as its parent is not this class\'s body', () => {
        // `Child CLASS(Base)` carries the token `Base` on its CLASS line; the lookup took
        // that for Base's own declaration and read Child's members as Base's.
        const src = [
            '  MEMBER()',                                       // 0
            'Child      CLASS(Base)',                           // 1
            'Extra        LONG',                                // 2 — Child's member, not Base's
            '           END',                                   // 3
            '',                                                 // 4
            'Base.Work PROCEDURE',                              // 5
            '  CODE',                                           // 6
            '  SELF.Extra = 1',                                 // 7
        ].join('\r\n');
        const d = TextDocument.create('file:///c:/test607/Child.clw', 'clarion', 1, src);
        const tokens = TokenCache.getInstance().getTokens(d);
        const info = new ClassMemberResolver().findClassMemberInfo('Extra', d, 7, tokens, undefined);
        assert.strictEqual(info, null, info ? `resolved to line ${info.line}` : '');
    });

    test('F12 on SELF.Request goes to the property line', async () => {
        const character = LINES[12].indexOf('Request') + 2;
        const loc = await new DefinitionProvider().provideDefinition(doc, { line: 12, character });
        const arr = Array.isArray(loc) ? loc : (loc ? [loc] : []);
        assert.ok(arr.length > 0, 'F12 should resolve');
        assert.strictEqual((arr[0] as any).range.start.line, 4);
    });
});
