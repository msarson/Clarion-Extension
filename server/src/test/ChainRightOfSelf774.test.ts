/**
 * #774 — a member chain rooted on an ordinary variable, to the right of a SELF on the same line
 * (`SELF.List {PROP:Text} = glo.UI.Font`), got no hover, and its last member no Go to Definition.
 * The receiver of `.UI` was taken from the last SELF on the line, so it read
 * `SELF.List {PROP:Text} = glo` instead of `glo`.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

suite('A member chain to the right of SELF on the same line (#774)', () => {
    let dir = '';
    let doc: TextDocument;

    const UI_INC = [
        "UIClass       CLASS,TYPE,MODULE('UI774.clw')",       // 0
        'Font            STRING(20)',                          // 1
        '              END',                                   // 2
    ];
    const GLO_INC = [
        "  INCLUDE('UI774.inc'),ONCE",                         // 0
        'Glo774        CLASS,TYPE',                            // 1
        'UI              &UIClass',                            // 2
        '              END',                                   // 3
        'Dlg774        CLASS,TYPE',                            // 4
        'W               &WINDOW',                             // 5
        'List            SIGNED',                              // 6
        'SetStyles       PROCEDURE()',                         // 7
        '              END',                                   // 8
    ];
    const CLW = [
        '  MEMBER()',                                          // 0
        "  INCLUDE('Glo774.inc'),ONCE",                        // 1
        '  MAP',                                               // 2
        '  END',                                               // 3
        'Dlg774.SetStyles  PROCEDURE ()',                      // 4
        'glo        &Glo774,AUTO',                             // 5
        '  CODE',                                              // 6
        '  SELF.W $ SELF.List {PROPSTYLE:TextColor, 1} = 0 + glo.UI.Font', // 7
        '  SELF.List {PROP:Text} = glo.UI.Font',               // 8
        '  x = glo.UI.Font',                                   // 9
    ];

    function uriOf(file: string): string {
        return 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    }

    async function hoverOn(line: number, member: string): Promise<string> {
        const ch = CLW[line].indexOf('glo.UI.Font') + 'glo.UI.Font'.indexOf(member) + 1;
        const h = await new HoverProvider().provideHover(doc, { line, character: ch });
        return (h?.contents as { value?: string } | undefined)?.value ?? '';
    }

    async function definitionOf(line: number, member: string): Promise<Location | null> {
        const ch = CLW[line].indexOf('glo.UI.Font') + 'glo.UI.Font'.indexOf(member) + 1;
        const d = await new DefinitionProvider().provideDefinition(doc, { line, character: ch });
        return (Array.isArray(d) ? d[0] : d) as Location | null;
    }

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain774-'));
        fs.writeFileSync(path.join(dir, 'UI774.inc'), UI_INC.join('\r\n') + '\r\n');
        fs.writeFileSync(path.join(dir, 'Glo774.inc'), GLO_INC.join('\r\n') + '\r\n');
        const clw = path.join(dir, 'Dlg774.clw');
        fs.writeFileSync(clw, CLW.join('\r\n') + '\r\n');
        doc = TextDocument.create(uriOf(clw), 'clarion', 1, CLW.join('\r\n') + '\r\n');
    });

    teardown(() => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    for (const line of [7, 8]) {
        test(`hover on glo.UI after SELF (line ${line})`, async () => {
            const card = await hoverOn(line, 'UI');
            assert.ok(/\bUI\b/.test(card) && /&UIClass/.test(card), card || '(no hover)');
        });

        test(`hover and F12 on glo.UI.Font after SELF (line ${line})`, async () => {
            const card = await hoverOn(line, 'Font');
            assert.ok(/\bFont\b/.test(card) && /STRING\(20\)/.test(card), card || '(no hover)');
            const loc = await definitionOf(line, 'Font');
            assert.ok(loc && /UI774\.inc$/i.test(decodeURIComponent(loc.uri)) && loc.range.start.line === 1, JSON.stringify(loc));
        });
    }

    test('regression: the same chain with no SELF on the line', async () => {
        assert.ok(/&UIClass/.test(await hoverOn(9, 'UI')));
        assert.ok(/STRING\(20\)/.test(await hoverOn(9, 'Font')));
    });
});
