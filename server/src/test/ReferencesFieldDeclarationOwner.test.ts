/**
 * Find All References started on the declaration of a TYPE structure's field lists only the
 * accesses whose receiver reaches that declaration.
 *
 * Two TYPE structures declare a field `Reason`. From either declaration the search matched
 * `.Reason` by name, behind any receiver, so `SELF.Msg.FromQ.Reason` (PairQ's field, through a
 * `&PairQ` reference in the class's inline GROUP) was listed as a use of FaultInfoType.Reason
 * and `SELF.Fault.Reason` as a use of PairQ.Reason. Each access's receiver is now resolved as
 * hover and Go to Definition resolve it, and one that reaches another declaration is dropped;
 * one that does not resolve stays, so a rename misses no use.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'FaultInfoType  GROUP,TYPE',                   // 0
    'Reason           STRING(128)',                // 1  FaultInfoType.Reason
    '               END',                          // 2
    'PairQ          QUEUE,TYPE',                   // 3
    'Reason           CSTRING(64)',                // 4  PairQ.Reason
    '               END',                          // 5
    'Holder         CLASS,TYPE',                   // 6
    'Fault            GROUP(FaultInfoType)',       // 7
    '                 END',                        // 8
    'Msg              GROUP',                      // 9
    'FromQ              &PairQ',                   // 10
    '                 END',                        // 11
    'OwnQ             &PairQ',                     // 12
    'Run              PROCEDURE()',                // 13
    '               END',                          // 14
];

const CLW = [
    '  MEMBER()',                                  // 0
    "  INCLUDE('owner.inc'),ONCE",                 // 1
    '  MAP',                                       // 2
    '  END',                                       // 3
    'Holder.Run PROCEDURE()',                      // 4
    'Txt        STRING(128)',                      // 5
    'LocG       LIKE(FaultInfoType)',              // 6
    'LocQ       &PairQ',                           // 7
    '  CODE',                                      // 8
    "  SELF.Fault.Reason = 'a'",                   // 9  FaultInfoType.Reason
    '  Txt = SELF.Msg.FromQ.Reason',               // 10 PairQ.Reason, through the inline GROUP
    '  Txt = SELF.OwnQ.Reason',                    // 11 PairQ.Reason
    "  LocG.Reason = 'b'",                         // 12 FaultInfoType.Reason
    '  Txt = LocQ.Reason',                         // 13 PairQ.Reason
    '  Txt = Unknown.Reason',                      // 14 does not resolve: kept under both
];

const USER = [
    '  MEMBER()',                                  // 0
    "  INCLUDE('owner.inc'),ONCE",                 // 1
    '  MAP',                                       // 2
    '  END',                                       // 3
    'UseIt PROCEDURE',                             // 4
    'H          Holder',                           // 5
    'Txt        STRING(128)',                      // 6
    '  CODE',                                      // 7
    "  H.Fault.Reason = 'c'",                      // 8  FaultInfoType.Reason, from another module
    '  Txt = H.Msg.FromQ.Reason',                  // 9  PairQ.Reason, from another module
];

suite('Find All References: a TYPE structure field from its declaration', () => {
    let fx: DiskSolution;
    let inc: TextDocument;

    // On disk: a structure's fields are read from its declaring file.
    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'owner.inc': INC, 'owner.clw': CLW, 'user.clw': USER });
        inc = fx.open('owner.inc');
        fx.open('owner.clw');
        fx.open('user.clw');
    });
    suiteTeardown(() => fx.dispose());

    /** Hits as `file:line`, e.g. `owner.clw:9`, sorted, once each. */
    async function refs(doc: TextDocument, lines: string[], line: number, word: string): Promise<string[]> {
        const character = lines[line].lastIndexOf(word) + 1;
        const r: Location[] | null = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
        return [...new Set((r ?? []).map(l => `${decodeURIComponent(l.uri).split('/').pop()}:${l.range.start.line}`))].sort();
    }

    function assertExactly(got: string[], from: string, expected: string[]): void {
        const missing = expected.filter(h => !got.includes(h));
        const extra = got.filter(h => !expected.includes(h));
        assert.deepStrictEqual({ missing, extra }, { missing: [], extra: [] }, `from ${from}, got [${got.join(' ')}]`);
    }

    // `Unknown.Reason` (owner.clw:14) resolves to nothing, so it stays under both declarations.
    const FAULT_HITS = ['owner.inc:1', 'owner.clw:9', 'owner.clw:12', 'owner.clw:14', 'user.clw:8'];
    const PAIR_HITS = ['owner.inc:4', 'owner.clw:10', 'owner.clw:11', 'owner.clw:13', 'owner.clw:14', 'user.clw:9'];

    test('from FaultInfoType.Reason: no access of PairQ.Reason', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 1, 'Reason'), 'FaultInfoType.Reason declaration', FAULT_HITS);
    });

    test('from PairQ.Reason: no access of FaultInfoType.Reason', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 4, 'Reason'), 'PairQ.Reason declaration', PAIR_HITS);
    });
});
