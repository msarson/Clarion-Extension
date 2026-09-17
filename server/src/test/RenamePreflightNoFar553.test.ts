import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { RenameProvider } from '../providers/RenameProvider';

/**
 * #553 — F2 on a method implementation took 5–14 seconds before the rename box appeared:
 * the pre-flight ran Find All References up front (#528 keyed the generated-file refusal
 * on the declaration and gathered the whole set to find it), and the "is the symbol
 * known" check fell back to a second search. The pre-flight needs only the declaration,
 * which the class and definition resolvers give in milliseconds; the search belongs in
 * the rename itself, after Enter, where the editor shows progress.
 *
 * Pinned by counting calls into the references provider during prepareRename.
 */
suite('Rename pre-flight does not run Find All References (#553)', () => {

    let dir: string;
    const docs = new Map<string, TextDocument>();

    const INC = [
        "MyCls   CLASS,TYPE,MODULE('cls.clw'),LINK('cls.clw')",  // 0
        'Frame     GROUP',                                        // 1
        'Width       LONG',                                       // 2
        '          END',                                          // 3
        'Init      PROCEDURE()',                                  // 4
        '        END',                                            // 5
    ].join('\r\n');
    const CLW = [
        '  MEMBER()',                       // 0
        "  INCLUDE('cls.inc'),ONCE",        // 1
        '  MAP',                            // 2
        'Helper PROCEDURE()',               // 3
        '  END',                            // 4
        'MyCls.Init PROCEDURE()',           // 5
        'Counter  LONG',                    // 6
        '  CODE',                           // 7
        '  Counter = 1',                    // 8
        '  SELF.Frame.Width = Counter',     // 9
        '  Helper()',                       // 10
        '  RETURN',                         // 11
        'Helper PROCEDURE()',               // 12
        '  CODE',                           // 13
        '  RETURN',                         // 14
    ].join('\r\n');

    suiteSetup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename553-'));
        for (const [name, text] of [['cls.inc', INC], ['cls.clw', CLW]] as const) {
            const p = path.join(dir, name);
            fs.writeFileSync(p, text);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, text);
            TokenCache.getInstance().getTokens(doc);
            docs.set(name, doc);
        }
    });
    suiteTeardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

    /** A provider whose references search counts its calls and answers nothing. */
    const spied = () => {
        const provider = new RenameProvider();
        let calls = 0;
        (provider as unknown as { referencesProvider: { provideReferences: () => Promise<null> } }).referencesProvider = {
            provideReferences: async () => { calls++; return null; },
        };
        return { provider, calls: () => calls };
    };

    const cases: Array<[string, number, number]> = [
        ['a method implementation label', 5, 7],   // MyCls.Init — on Init
        ['a local variable', 8, 3],                // Counter
        ['a dotted field through an inline group', 9, 15], // SELF.Frame.Width — on Width
        ['a MAP procedure call site', 10, 3],      // Helper()
    ];

    for (const [what, line, character] of cases) {
        test(`${what}: the box opens without a references search`, async () => {
            const { provider, calls } = spied();
            const range = await provider.prepareRename(docs.get('cls.clw')!, { line, character });
            assert.ok(range, `${what}: prepareRename returns a range`);
            assert.strictEqual(calls(), 0, `${what}: references were searched in the pre-flight`);
        });
    }
});
