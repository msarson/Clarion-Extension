/**
 * #846 — Find All References keeps a class member and the fields of the class's inline GROUPs
 * apart.
 *
 * `Grp` is an inline GROUP in the class body (a QUEUE is not valid there; the issue's example
 * used one), with a field `Hits` named like a member of the class:
 *
 *  - from the class member `Token.Hits`, `SELF.Grp.Hits` was listed: the chain resolver reads
 *    `SELF.Grp` as the group, but its field answered with the enclosing class as owner, so the
 *    class-family check (#838) kept it. A field a structure declares itself is no class member.
 *  - from the group's field (its declaration, or `SELF.Grp.Hits`), the search was the class
 *    member's: `Token.Hits` and `SELF.Hits` were listed, the field's own declaration was not, and
 *    a rename would have rewritten the class member. It is now searched as that field: every
 *    access whose receiver resolves to that declaration, mid-chain and subscripted ones included.
 *
 * A field a typed structure takes from its type argument (`SELF.TG.Code`, `TG GROUP(GT)`) stays
 * a member of the type; the structure's own fields (`SELF.TG.Extra`) are its own.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'GT         GROUP,TYPE',                       // 0
    'Code         LONG',                           // 1  GT.Code
    '           END',                              // 2
    'Token      CLASS,TYPE',                       // 3
    'Hits         LONG',                           // 4  Token.Hits
    'Sub          LONG',                           // 5  Token.Sub, named like the nested group
    'Grp          GROUP',                          // 6
    'Hits           LONG',                         // 7  Grp.Hits
    'Sub            GROUP',                        // 8  Grp.Sub, a nested group
    'Deep             LONG',                       // 9
    '               END',                          // 10
    '             END',                            // 11
    'TG           GROUP(GT)',                      // 12
    'Extra          LONG',                         // 13 TG's own field
    '             END',                            // 14
    'Arr          GROUP,DIM(3)',                   // 15
    'Hits           LONG',                         // 16 Arr.Hits
    '             END',                            // 17
    'Bump         PROCEDURE()',                    // 18
    '           END',                              // 19
    'Other      CLASS,TYPE',                       // 20
    'Hits         LONG',                           // 21 Other.Hits
    'Grp          GROUP',                          // 22
    'Hits           LONG',                         // 23 Other's Grp.Hits
    '             END',                            // 24
    'Go           PROCEDURE()',                    // 25
    '           END',                              // 26
];

const CLW = [
    '  MEMBER()',                                  // 0
    "  INCLUDE('refs.inc'),ONCE",                  // 1
    '  MAP',                                       // 2
    'ProcA        PROCEDURE',                      // 3
    'ProcB        PROCEDURE',                      // 4
    '  END',                                       // 5
    'Token.Bump PROCEDURE()',                      // 6
    '  CODE',                                      // 7
    '  SELF.Hits = 1',                             // 8  Token.Hits
    '  SELF.Grp.Hits = 2',                         // 9  Grp.Hits
    '  SELF.TG.Code = 3',                          // 10 GT.Code, through the type argument
    '  SELF.TG.Extra = 4',                         // 11 TG.Extra
    '  SELF.Sub = 5',                              // 12 Token.Sub
    '  SELF.Grp.Sub.Deep = 6',                     // 13 Grp.Sub mid-chain
    '  SELF.Arr[1].Hits = 7',                      // 14 Arr.Hits
    'Other.Go PROCEDURE()',                        // 15
    '  CODE',                                      // 16
    '  SELF.Hits = 8',                             // 17 Other.Hits
    '  SELF.Grp.Hits = 9',                         // 18 Other's Grp.Hits
    'ProcA PROCEDURE',                             // 19
    'T          Token',                            // 20
    '  CODE',                                      // 21
    '  T.Grp.Hits = 10',                           // 22 Grp.Hits, through an object
    'ProcB PROCEDURE',                             // 23
    'T          Other',                            // 24 same receiver name, other class
    '  CODE',                                      // 25
    '  T.Grp.Hits = 11',                           // 26 Other's Grp.Hits
];

const USER = [
    '  MEMBER()',                                  // 0
    "  INCLUDE('refs.inc'),ONCE",                  // 1
    '  MAP',                                       // 2
    '  END',                                       // 3
    'ProcC PROCEDURE',                             // 4
    'U          Token',                            // 5
    'Loc:V      Token',                            // 6 a colon-named object (no plain V)
    '  CODE',                                      // 7
    '  U.Grp.Hits = 12',                           // 8 Grp.Hits, from another module
    '  U.Arr[2].Hits = 13',                        // 9 Arr.Hits, from another module
    '  Loc:V.Grp.Hits = 14',                       // 10 Grp.Hits, through the colon-named object
];

suite('Find All References: a class member and its inline GROUP\'s field are apart (#846)', () => {
    let fx: DiskSolution;
    let inc: TextDocument;
    let clw: TextDocument;
    let user: TextDocument;

    // On disk: the inline structure's fields are read from its declaring file.
    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'refs.inc': INC, 'refs.clw': CLW, 'user.clw': USER });
        inc = fx.open('refs.inc');
        clw = fx.open('refs.clw');
        user = fx.open('user.clw');
    });
    suiteTeardown(() => fx.dispose());

    /** Hits as `file:line`, e.g. `refs.clw:9`, sorted, once each. */
    async function refs(doc: TextDocument, lines: string[], line: number, word: string, includeDeclaration = true): Promise<string[]> {
        const character = lines[line].lastIndexOf(word) + 1;
        const r: Location[] | null = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration });
        return [...new Set((r ?? []).map(l => `${decodeURIComponent(l.uri).split('/').pop()}:${l.range.start.line}`))].sort();
    }

    function assertExactly(got: string[], from: string, expected: string[]): void {
        const missing = expected.filter(h => !got.includes(h));
        const extra = got.filter(h => !expected.includes(h));
        assert.deepStrictEqual({ missing, extra }, { missing: [], extra: [] }, `from ${from}, got [${got.join(' ')}]`);
    }

    const TOKEN_HITS = ['refs.inc:4', 'refs.clw:8'];
    const GRP_HITS = ['refs.inc:7', 'refs.clw:9', 'refs.clw:22', 'user.clw:8', 'user.clw:10'];
    const OTHER_GRP_HITS = ['refs.inc:23', 'refs.clw:18', 'refs.clw:26'];

    test('bug-pin: Token.Hits from its declaration lists no group field', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 4, 'Hits'), 'Token.Hits declaration', TOKEN_HITS);
    });

    test('bug-pin: Token.Hits from SELF.Hits lists no group field', async function () {
        this.timeout(10000);
        assertExactly(await refs(clw, CLW, 8, 'Hits'), 'SELF.Hits in Token.Bump', TOKEN_HITS);
    });

    test('Other.Hits lists neither class\'s group field', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 21, 'Hits'), 'Other.Hits declaration', ['refs.inc:21', 'refs.clw:17']);
    });

    test('bug-pin: the group field from its declaration is that field, in every module', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 7, 'Hits'), 'Grp.Hits declaration', GRP_HITS);
    });

    test('bug-pin: the group field from SELF.Grp.Hits is that field', async function () {
        this.timeout(10000);
        assertExactly(await refs(clw, CLW, 9, 'Hits'), 'SELF.Grp.Hits in Token.Bump', GRP_HITS);
    });

    test('the same receiver name in two procedures is resolved in each', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 23, 'Hits'), 'Other Grp.Hits declaration', OTHER_GRP_HITS);
        assertExactly(await refs(clw, CLW, 26, 'Hits'), 'T.Grp.Hits in ProcB', OTHER_GRP_HITS);
    });

    test('a nested group used mid-chain, and a class member of the same name, are apart', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 8, 'Sub'), 'Grp.Sub declaration', ['refs.inc:8', 'refs.clw:13']);
        assertExactly(await refs(inc, INC, 5, 'Sub'), 'Token.Sub declaration', ['refs.inc:5', 'refs.clw:12']);
    });

    test('a field of a DIM\'d group is found behind a subscript', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 16, 'Hits'), 'Arr.Hits declaration', ['refs.inc:16', 'refs.clw:14', 'user.clw:9']);
    });

    test('the group field from an access through a colon-named object', async function () {
        this.timeout(10000);
        assertExactly(await refs(user, USER, 10, 'Hits'), 'Loc:V.Grp.Hits', GRP_HITS);
    });

    test('a typed GROUP\'s own field is that structure\'s', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 13, 'Extra'), 'TG.Extra declaration', ['refs.inc:13', 'refs.clw:11']);
    });

    test('without declarations the accesses stay and the declaration goes', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 7, 'Hits', false), 'Grp.Hits declaration, no declarations',
            GRP_HITS.filter(h => h !== 'refs.inc:7'));
    });

    test('a field from the type argument stays a reference of the type\'s field', async function () {
        this.timeout(10000);
        const got = await refs(inc, INC, 1, 'Code');
        // Only inclusion: a search for a field named Code also lists CODE statements (a separate bug).
        for (const h of ['refs.inc:1', 'refs.clw:10']) assert.ok(got.includes(h), `GT.Code: expected ${h} in [${got.join(' ')}]`);
    });
});
