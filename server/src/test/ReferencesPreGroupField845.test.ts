/**
 * #845 — Find All References on a field of a PRE()'d GROUP lists only that field.
 *
 * A field of a structure with a prefix is reached as `GLO:Answer` or `Glob.Answer`; a bare
 * `answer` is some other variable. The search listed every `answer` in the file, ignoring case:
 * another procedure's parameter, a local of another procedure, and the field of another group.
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
    'Proc1        PROCEDURE(LONG answer)',          // 2
    'Proc2        PROCEDURE',                      // 3
    '  END',                                       // 4
    'Glob         GROUP,PRE(GLO)',                 // 5
    'Answer         LONG',                         // 6  the field searched for
    '             END',                            // 7
    'Other        GROUP,PRE(OTH)',                 // 8
    'Answer         LONG',                         // 9  another group's field
    '             END',                            // 10
    '  CODE',                                      // 11
    '  GLO:Answer = 1',                            // 12 the field
    '  Glob.Answer = 2',                           // 13 the field
    '  OTH:Answer = 3',                            // 14 the other field
    'Proc1        PROCEDURE(LONG answer)',          // 15 a parameter
    '  CODE',                                      // 16
    '  answer += 1',                               // 17 the parameter
    'Proc2        PROCEDURE',                      // 18
    'answer         STRING(10)',                   // 19 a local
    '  CODE',                                      // 20
    "  answer = 'x'",                              // 21 the local
];

suite('Find All References on a PRE() group field lists only that field (#845)', () => {
    let fx: DiskSolution;
    let clw: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'pregrp.clw': CLW });
        clw = fx.open('pregrp.clw');
    });
    suiteTeardown(() => fx.dispose());

    async function refs(line: number, character: number): Promise<number[]> {
        const r: Location[] | null = await new ReferencesProvider().provideReferences(clw, { line, character }, { includeDeclaration: true });
        return [...new Set((r ?? []).map(l => l.range.start.line))].sort((a, b) => a - b);
    }

    test('from the field\'s declaration', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(6, 2), [6, 12, 13]);
    });

    test('from GLO:Answer', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(12, CLW[12].indexOf('Answer') + 1), [6, 12, 13]);
    });

    test('from Glob.Answer', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(13, CLW[13].indexOf('Answer') + 1), [6, 12, 13]);
    });

    test('the other group\'s field keeps to itself', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(9, 2), [9, 14]);
    });
});
