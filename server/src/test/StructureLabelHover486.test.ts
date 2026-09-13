/**
 * #486 — hovering the LABEL of a structure (FILE, QUEUE, GROUP, CLASS, WINDOW,
 * REPORT, VIEW) badged it "🌍 Global variable". The title named the type; the
 * badge — the line a reader trusts — called a FILE a variable. The variable
 * hover's scope branch knew three kinds (procedure, EQUATE constant, and
 * "variable" for the rest), so every structure label fell into the last.
 *
 * A structure label is badged as a structure in the existing global/module
 * convention, and a FILE card carries the facts a developer hovers it for:
 * driver, PRE prefix, and a keys/fields inventory. Scalars are unchanged.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

suite('Structure label hover badge (#486)', () => {
    const code = [
        '  PROGRAM',                                                        // 0
        '  MAP',                                                            // 1
        '  END',                                                            // 2
        'Orders               FILE,DRIVER(\'TOPSPEED\'),PRE(ORD),CREATE,THREAD', // 3
        'IdKey                  KEY(ORD:ID),PRIMARY',                       // 4
        'CustKey                KEY(ORD:CustID),DUP',                       // 5
        'Record                   RECORD',                                  // 6
        'ID                         LONG',                                  // 7
        'CustID                     LONG',                                  // 8
        'Total                      DECIMAL(9,2)',                          // 9
        '                         END',                                     // 10
        '                     END',                                         // 11
        'LineQ                QUEUE,PRE(LQ)',                               // 12
        'Item                   STRING(20)',                                // 13
        '                     END',                                         // 14
        'Counter              LONG',                                        // 15
        'Settings             GROUP,PRE(SET)',                              // 16
        'Path                   STRING(255)',                               // 17
        '                     END',                                         // 18
        '  CODE',                                                           // 19
        '  OPEN(Orders)',                                                   // 20
        '  FREE(LineQ)',                                                    // 21
        '  Counter += 1',                                                   // 22
        '  CLEAR(Settings)',                                                // 23
    ].join('\n');

    function hoverText(h: unknown): string {
        const c = (h as { contents: unknown } | null)?.contents;
        return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
    }

    async function hoverAt(line: number, character: number): Promise<string> {
        const provider = new HoverProvider();
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
        // No "structure" in the URI — the location link echoes it and the scalar sentinel greps for the word.
        const doc = TextDocument.create('test://label-hover-486.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);
        const hover = await provider.provideHover(doc, Position.create(line, character));
        assert.ok(hover, `expected a hover at ${line}:${character}`);
        return hoverText(hover);
    }

    test('a FILE label is badged as a FILE structure, not a variable', async () => {
        const text = await hoverAt(20, 9); // OPEN(Orders)
        assert.ok(text.includes('Orders'), `card must be for Orders; got: ${text}`);
        assert.ok(!text.includes('Global variable'), `a FILE is not a variable; got: ${text}`);
        assert.ok(/Global FILE structure/.test(text), `expected "Global FILE structure"; got: ${text}`);
    });

    test('the FILE card shows driver, prefix and a keys/fields inventory', async () => {
        const text = await hoverAt(20, 9);
        assert.ok(text.includes('TOPSPEED'), `driver; got: ${text}`);
        assert.ok(/PRE\(ORD\)|prefix.*ORD/i.test(text), `prefix; got: ${text}`);
        assert.ok(/2 keys/.test(text), `two keys; got: ${text}`);
        assert.ok(/3 fields/.test(text), `three record fields; got: ${text}`);
    });

    test('a QUEUE label is badged as a QUEUE structure', async () => {
        const text = await hoverAt(21, 9); // FREE(LineQ)
        assert.ok(!text.includes('Global variable'), `a QUEUE is not a variable; got: ${text}`);
        assert.ok(/Global QUEUE structure/.test(text), `got: ${text}`);
    });

    test('the title shows the structure type, not a later attribute\'s argument (QUEUE, not QUEUE(LQ))', async () => {
        // `LineQ QUEUE,PRE(LQ)` rendered as `QUEUE(LQ)` — the type-arg capture took the
        // first parenthesised group on the line, which belonged to PRE(). Only a group
        // that immediately follows the keyword is a type argument: CLASS(WindowManager).
        const text = await hoverAt(21, 9);
        assert.ok(/\*\*LineQ\*\* — `QUEUE`/.test(text), `expected "LineQ — QUEUE"; got: ${text.split('\n')[0]}`);
        assert.ok(!text.includes('QUEUE(LQ)'), `PRE's argument is not a type; got: ${text.split('\n')[0]}`);
    });

    test('a GROUP label is badged as a GROUP structure', async () => {
        const text = await hoverAt(23, 9); // CLEAR(Settings)
        assert.ok(!text.includes('Global variable'), `a GROUP is not a variable; got: ${text}`);
        assert.ok(/Global GROUP structure/.test(text), `got: ${text}`);
    });

    test('a FILE declared in a MEMBER module is badged as a Module FILE structure, with its declaration as written', async () => {
        const member = [
            "  MEMBER('main.clw')",                                       // 0
            '  MAP',                                                      // 1
            '  END',                                                      // 2
            "LocalF               FILE,DRIVER('ASCII'),PRE(LF)",          // 3
            'Record                   RECORD',                            // 4
            'Line                       STRING(255)',                     // 5
            '                         END',                               // 6
            '                     END',                                   // 7
            'Proc PROCEDURE',                                             // 8
            '  CODE',                                                     // 9
            '  OPEN(LocalF)',                                             // 10
        ].join('\n');
        const provider = new HoverProvider();
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
        const doc = TextDocument.create('test://member-hover-486.clw', 'clarion', 1, member);
        tokenCache.getTokens(doc);
        const text = hoverText(await provider.provideHover(doc, Position.create(10, 9)));
        assert.ok(/Module FILE structure/.test(text), `expected "Module FILE structure"; got: ${text}`);
        assert.ok(!text.includes('Module variable'), `a FILE is not a variable; got: ${text}`);
        assert.ok(text.includes("DRIVER('ASCII')") && text.includes('PRE(LF)') && /1 field/.test(text), `facts; got: ${text}`);
        assert.ok(text.includes("LocalF               FILE,DRIVER('ASCII'),PRE(LF)"), `declaration as written, not token-joined; got: ${text}`);
    });

    test('sentinel: a scalar global keeps its variable badge', async () => {
        const text = await hoverAt(22, 3); // Counter += 1
        assert.ok(text.includes('Global variable'), `Counter LONG is a variable; got: ${text}`);
        assert.ok(!/structure/i.test(text), `no structure wording on a scalar; got: ${text}`);
    });
});
