import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';

/**
 * #552 — `SELF.AppFrame.ClientYPos` where AppFrame is an inline GROUP declared inside
 * the CLASS body (Noyantis TemplateHelperClass). The chain walk resolved SELF → class →
 * member AppFrame, then asked for the class named by its type — and a bare `GROUP` names
 * none ("type GROUP of AppFrame is not navigable"), so every field under it was
 * unreachable for F12, hover and references, while F12 on AppFrame itself worked.
 *
 * An inline GROUP / QUEUE / RECORD member is its own type: the next segment is looked
 * up among that structure's own fields, in the declaring file, and a nested inline
 * structure inside it chains the same way.
 */
suite('Chained access through an inline GROUP in a CLASS (#552)', () => {

    let dir: string;
    let incPath: string;
    let clwDoc: TextDocument;

    const INC = [
        "MyCls   CLASS,TYPE,MODULE('cls.clw'),LINK('cls.clw')",  // 0
        'Frame     GROUP',                                        // 1
        'Width       LONG',                                       // 2
        'Height      LONG',                                       // 3
        'Inner       GROUP',                                      // 4
        'Depth         LONG',                                     // 5
        '            END',                                        // 6
        '          END',                                          // 7
        'Other     LONG',                                         // 8
        'Init      PROCEDURE()',                                  // 9
        '        END',                                            // 10
    ].join('\r\n');

    const CLW = [
        '  MEMBER()',                       // 0
        "  INCLUDE('cls.inc'),ONCE",        // 1
        '  MAP',                            // 2
        '  END',                            // 3
        'MyCls.Init PROCEDURE()',           // 4
        '  CODE',                           // 5
        '  SELF.Frame.Width = 1',           // 6
        '  SELF.Frame.Inner.Depth = 2',     // 7
        '  SELF.Frame.Height = 3',          // 8
        '  SELF.Other = 4',                 // 9
        '  RETURN',                         // 10
    ].join('\r\n');

    suiteSetup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain552-'));
        incPath = path.join(dir, 'cls.inc');
        fs.writeFileSync(incPath, INC);
        const clwPath = path.join(dir, 'cls.clw');
        fs.writeFileSync(clwPath, CLW);
        clwDoc = TextDocument.create(`file:///${clwPath.replace(/\\/g, '/')}`, 'clarion', 1, CLW);
        TokenCache.getInstance().getTokens(clwDoc);
    });
    suiteTeardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

    const f12 = async (line: number, character: number): Promise<Location | null> => {
        const r = await new DefinitionProvider().provideDefinition(clwDoc, { line, character });
        if (!r) return null;
        return (Array.isArray(r) ? r[0] : r) as Location;
    };
    const landsOn = (loc: Location | null, incLine: number, what: string) => {
        assert.ok(loc, `${what}: no definition`);
        assert.ok(/cls\.inc$/i.test(decodeURIComponent(loc!.uri)), `${what}: wrong file ${loc!.uri}`);
        assert.strictEqual(loc!.range.start.line, incLine, `${what}: wrong line`);
    };

    test('bug-pin: F12 on a field of an inline GROUP lands on the field', async () => {
        landsOn(await f12(6, 15), 2, 'SELF.Frame.Width');
        landsOn(await f12(8, 15), 3, 'SELF.Frame.Height');
    });

    test('a nested inline GROUP chains one level further', async () => {
        landsOn(await f12(7, 21), 5, 'SELF.Frame.Inner.Depth');
    });

    test('F12 on the GROUP segment itself still lands on the GROUP (unchanged)', async () => {
        landsOn(await f12(6, 8), 1, 'SELF.Frame');
    });

    test('a plain class member is unaffected', async () => {
        landsOn(await f12(9, 8), 8, 'SELF.Other');
    });

    test('the resolver answers the field with its declared type and the owning class', async () => {
        const info = await new ChainedPropertyResolver().resolve('SELF.Frame', 'Height', clwDoc, { line: 8, character: 15 });
        assert.ok(info, 'resolved');
        assert.strictEqual(info!.line, 3);
        assert.strictEqual(info!.className, 'MyCls');
        assert.ok(/^LONG/i.test(info!.type), `type is the field's declaration; got ${info!.type}`);
    });
});
