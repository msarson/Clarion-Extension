/**
 * #779 — `SELF.IFace.F()`, in a class that IMPLEMENTS(IFace) and has its own `F` returning BYTE,
 * calls the interface's F, which returns nothing. #773 resolves `SELF.IFace` to the INTERFACE, but
 * the chain walks then took that member's type (the keyword INTERFACE) for the next class: the
 * discarded-return check warned, using the class's own F, and hover on F showed nothing.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { setServerInitialized } from '../serverState';

suite('SELF.InterfaceName.Method goes to the interface (#779)', () => {
    // The shape of the reporter's test program.
    const CODE = [
        '               PROGRAM',          // 0
        '               MAP',              // 1
        '                 Test()',         // 2
        '               END',              // 3
        'IFace          INTERFACE',        // 4
        'F                PROCEDURE ()',   // 5
        'G                PROCEDURE (),LONG', // 6
        '               END',              // 7
        'Cls            CLASS,TYPE,IMPLEMENTS(IFace)', // 8
        'F                PROCEDURE (),BYTE', // 9
        '               END',              // 10
        '  CODE',                          // 11
        '  Test()',                        // 12
        'Test  PROCEDURE ()',              // 13
        'obj        Cls,AUTO',             // 14
        '  CODE',                          // 15
        '  RETURN',                        // 16
        'Cls.F  PROCEDURE ()',             // 17
        '  CODE',                          // 18
        '  SELF.IFace.F()',                // 19: the interface's F returns nothing
        '  SELF.IFace.G()',                // 20: the interface's G returns LONG
        '  RETURN 1',                      // 21
        'Cls.IFace.F  PROCEDURE ()',       // 22
        '  CODE',                          // 23
        '  RETURN',                        // 24
        'Cls.IFace.G  PROCEDURE ()',       // 25
        '  CODE',                          // 26
        '  RETURN 0',                      // 27
    ];

    let dir = '';
    let doc: TextDocument;
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iface779-'));
        const file = path.join(dir, 'test779.clw');
        const text = CODE.join('\r\n') + '\r\n';
        fs.writeFileSync(file, text);
        doc = TextDocument.create('file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, l) => l + '%3A'), 'clarion', 1, text);
    });
    teardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

    test('only the interface method that returns a value is a discarded return', async () => {
        const diags = await DiagnosticProvider.validateDiscardedReturnValues(TokenCache.getInstance().getTokens(doc), doc, new MemberLocatorService());
        assert.deepStrictEqual(diags.filter(d => /discarded/.test(String(d.message))).map(d => d.range.start.line), [20],
            JSON.stringify(diags.map(d => [d.range.start.line, d.message])));
    });

    test('hover on the method shows the interface\'s prototype', async () => {
        const h = await new HoverProvider().provideHover(doc, { line: 19, character: CODE[19].lastIndexOf('F') });
        const card = (h?.contents as { value?: string } | undefined)?.value ?? '';
        assert.ok(/PROCEDURE \(\)/.test(card) && !/BYTE/.test(card), card || '(no hover)');
    });

    test('regression: F12 on the method goes to the interface\'s F', async () => {
        const d = await new DefinitionProvider().provideDefinition(doc, { line: 19, character: CODE[19].lastIndexOf('F') });
        const loc = Array.isArray(d) ? d[0] : d;
        assert.strictEqual((loc as { range: { start: { line: number } } } | null)?.range.start.line, 5, JSON.stringify(d));
    });
});
