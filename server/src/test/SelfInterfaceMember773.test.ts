/**
 * #773 — `SELF.IHasProgress`, inside a method of a class that IMPLEMENTS(IHasProgress), names the
 * class's own implementation of that interface (how a class passes itself as the interface). The
 * SELF lookup found no member of that name, so hover showed nothing and F12 went nowhere. It now
 * resolves to the INTERFACE declaration, for the class's own IMPLEMENTS and an ancestor's.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { selfMemberAt } from './support/selfMemberLookup';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

suite('SELF.InterfaceName resolves to the IMPLEMENTS interface (#773)', () => {
    let dir = '';
    let doc: TextDocument;
    let incPath = '';

    const INC = [
        'IHasProgress  INTERFACE,TYPE',                       // 0
        'Step            PROCEDURE()',                         // 1
        '              END',                                   // 2
        'IOther        INTERFACE,TYPE',                       // 3
        'Ping            PROCEDURE()',                         // 4
        '              END',                                   // 5
        'BaseDlg       CLASS,TYPE,IMPLEMENTS(IOther)',         // 6
        'Ping2           PROCEDURE()',                         // 7
        '              END',                                   // 8
        'ProgressDlg   CLASS(BaseDlg),TYPE,IMPLEMENTS(IHasProgress)', // 9
        'Invoke          PROCEDURE(IHasProgress p)',           // 10
        'DoEvent         PROCEDURE()',                         // 11
        '              END',                                   // 12
    ];
    const CLW = [
        '  MEMBER()',                                          // 0
        "  INCLUDE('Prog773.inc'),ONCE",                       // 1
        '  MAP',                                               // 2
        '  END',                                               // 3
        'ProgressDlg.DoEvent  PROCEDURE()',                    // 4
        '  CODE',                                              // 5
        '  SELF.Invoke(SELF.IHasProgress)',                    // 6
        '  SELF.Invoke(SELF.IOther)',                          // 7
        '  SELF.Invoke(SELF.INoSuch)',                         // 8
    ];

    function uriOf(file: string): string {
        return 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    }

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'self773-'));
        incPath = path.join(dir, 'Prog773.inc');
        fs.writeFileSync(incPath, INC.join('\r\n') + '\r\n');
        const clw = path.join(dir, 'Prog773.clw');
        fs.writeFileSync(clw, CLW.join('\r\n') + '\r\n');
        doc = TextDocument.create(uriOf(clw), 'clarion', 1, CLW.join('\r\n') + '\r\n');
    });

    teardown(() => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    test('the SELF lookup lands on the interface the class implements', async () => {
        const info = await selfMemberAt(doc, 6, 'IHasProgress');
        assert.ok(info, 'SELF.IHasProgress should resolve');
        // MemberInfo.file is a file URI
        assert.strictEqual(path.normalize(decodeURIComponent(info!.file.replace(/^file:\/\/\//i, ''))).toLowerCase(), path.normalize(incPath).toLowerCase());
        assert.strictEqual(info!.line, 0);
    });

    test('an interface an ancestor implements resolves too', async () => {
        const info = await selfMemberAt(doc, 7, 'IOther');
        assert.ok(info, 'SELF.IOther should resolve through BaseDlg');
        assert.strictEqual(info!.line, 3);
    });

    test('a name that is neither a member nor an implemented interface still resolves to nothing', async () => {
        assert.strictEqual(await selfMemberAt(doc, 8, 'INoSuch'), null);
    });

    test('hover on SELF.IHasProgress shows the interface', async () => {
        const at = CLW[6].indexOf('IHasProgress') + 2;
        const h = await new HoverProvider().provideHover(doc, { line: 6, character: at });
        const text = (h?.contents as { value?: string } | undefined)?.value ?? '';
        assert.ok(/IHasProgress/.test(text) && /INTERFACE/i.test(text), text || '(no hover)');
    });

    test('F12 on SELF.IHasProgress goes to the INTERFACE declaration', async () => {
        const at = CLW[6].indexOf('IHasProgress') + 2;
        const def = await new DefinitionProvider().provideDefinition(doc, { line: 6, character: at });
        const loc = Array.isArray(def) ? def[0] : def;
        assert.ok(loc, 'F12 should go somewhere');
        assert.strictEqual(decodeURIComponent(loc!.uri).toLowerCase().endsWith('prog773.inc'), true, loc!.uri);
        assert.strictEqual(loc!.range.start.line, 0);
    });
});
