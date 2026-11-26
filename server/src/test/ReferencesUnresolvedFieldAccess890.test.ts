/**
 * #890 — one rule for a `.Field` access whose receiver does not resolve, in both searches of a
 * structure's field.
 *
 * #877's search for a field an inline GROUP declares itself listed only accesses whose receiver
 * resolved to that field; #886's search from a field's declaration kept an access that did not
 * resolve, so a rename misses no use. Both keep it now. Only a receiver ending in the
 * structure's own label can reach one of its fields, so `Lost.Grp.Hits` (Lost undeclared) is
 * listed for each `Grp.Hits`, and `Lost.Hits` for none: the same bias as the other receiver
 * checks in Find All References. A receiver that resolves still goes to its own field only.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'Token      CLASS,TYPE',                       // 0
    'Hits         LONG',                           // 1  Token.Hits
    'Grp          GROUP',                          // 2
    'Hits           LONG',                         // 3  Token's Grp.Hits
    '             END',                            // 4
    'Bump         PROCEDURE()',                    // 5
    '           END',                              // 6
    'Other      CLASS,TYPE',                       // 7
    'Grp          GROUP',                          // 8
    'Hits           LONG',                         // 9  Other's Grp.Hits
    '             END',                            // 10
    '           END',                              // 11
];

const CLW = [
    '  MEMBER()',                                  // 0
    "  INCLUDE('unres.inc'),ONCE",                 // 1
    '  MAP',                                       // 2
    '  END',                                       // 3
    'Token.Bump PROCEDURE()',                      // 4
    '  CODE',                                      // 5
    '  SELF.Grp.Hits = 1',                         // 6  Token's Grp.Hits
    'ProcA PROCEDURE',                             // 7
    'O          Other',                            // 8
    '  CODE',                                      // 9
    '  O.Grp.Hits = 2',                            // 10 Other's Grp.Hits
    '  Lost.Grp.Hits = 3',                         // 11 Lost is declared nowhere: either one
    '  Lost.Hits = 4',                             // 12 no Grp in the receiver: neither field
];

suite('Find All References keeps a field access whose receiver does not resolve (#890)', () => {
    let fx: DiskSolution;
    let inc: TextDocument;
    let clw: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'unres.inc': INC, 'unres.clw': CLW });
        inc = fx.open('unres.inc');
        clw = fx.open('unres.clw');
    });
    suiteTeardown(() => fx.dispose());

    async function refs(doc: TextDocument, lines: string[], line: number, word: string): Promise<string[]> {
        const character = lines[line].lastIndexOf(word) + 1;
        const r: Location[] | null = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
        return [...new Set((r ?? []).map(l => `${decodeURIComponent(l.uri).split('/').pop()}:${l.range.start.line}`))].sort();
    }

    test('from an access to the inline GROUP\'s field (the #877 search)', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(clw, CLW, 6, 'Hits'), ['unres.clw:11', 'unres.clw:6', 'unres.inc:3'].sort());
    });

    test('from the field\'s declaration, the same hits', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(inc, INC, 3, 'Hits'), ['unres.clw:11', 'unres.clw:6', 'unres.inc:3'].sort());
    });

    test('the other class\'s same-named field keeps its own resolved access, and the unresolved one', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(await refs(clw, CLW, 10, 'Hits'), ['unres.clw:10', 'unres.clw:11', 'unres.inc:9'].sort());
    });
});
