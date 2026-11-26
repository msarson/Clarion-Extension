/**
 * #844 — Find All References on a parameter in a method implementation's header.
 *
 * From the header (`Cls.Fetch PROCEDURE(LONG answer)`) the search returned nothing; from the
 * parameter's use in the body it returned the parameter and its use. Both now agree.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const CLW = [
    '  PROGRAM',                                   // 0
    '  MAP',                                       // 1
    'Plain        PROCEDURE(LONG answer)',          // 2
    '  END',                                       // 3
    'Cls          CLASS,TYPE',                     // 4
    'Fetch          PROCEDURE(LONG answer)',        // 5
    'Store          PROCEDURE(STRING name, |',     // 6
    '                         LONG answer)',       // 7
    '             END',                            // 8
    '  CODE',                                      // 9
    '  RETURN',                                    // 10
    'Cls.Fetch    PROCEDURE(LONG answer)',          // 11 the header
    '  CODE',                                      // 12
    '  answer += 1',                               // 13 its use
    'Cls.Store    PROCEDURE(STRING name, |',       // 14
    '                       LONG answer)',         // 15 the header, continued
    '  CODE',                                      // 16
    '  answer = 2',                                // 17 its use
    'Plain        PROCEDURE(LONG answer)',          // 18 a procedure's header
    '  CODE',                                      // 19
    '  answer = 3',                                // 20 its use
];

suite('Find All References on a parameter in an implementation header (#844)', () => {
    let fx: DiskSolution;
    let clw: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'hdrparam.clw': CLW });
        clw = fx.open('hdrparam.clw');
    });
    suiteTeardown(() => fx.dispose());

    async function refs(line: number): Promise<number[]> {
        const character = CLW[line].lastIndexOf('answer') + 1;
        const r: Location[] | null = await new ReferencesProvider().provideReferences(clw, { line, character }, { includeDeclaration: true });
        return [...new Set((r ?? []).map(l => l.range.start.line))].sort((a, b) => a - b);
    }

    test('control: from the use in the method body', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(13), [11, 13]);
    });

    test('from the method implementation header', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(11), [11, 13]);
    });

    test('from a continued method implementation header', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(15), await refs(17));
        assert.ok((await refs(15)).includes(17), `no use: ${(await refs(15)).join(', ')}`);
    });

    test('control: from a procedure implementation header', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(18), await refs(20));
        assert.ok((await refs(18)).includes(20));
    });
});
