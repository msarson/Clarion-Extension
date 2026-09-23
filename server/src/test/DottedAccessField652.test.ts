/**
 * #652 (#638 step 2) — a field of a GROUP / QUEUE receiver, and a method of an interface reference,
 * name their declaration through the dotted-access resolver like a class member (#651); Go to
 * Definition goes there. A field keeps the card its dot form has always had (#488's rule: one
 * card for a field at its declaration, in PRE form and in dot form), and a chain that reaches a
 * field of a structure declared here (`Lister.Q.Extra`, as generated `FDB5.Q.Field`) now shows
 * that same card, not the member card (Mark's choice, 2026-09-23, after #488 was weighed). An
 * interface method keeps the member card.
 */
import * as assert from 'assert';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { definitionLocations } from './support/hoverDefinitionAgreement';

const CLW = [
    '  MEMBER()',                                    // 0
    '  MAP',                                         // 1
    '  END',                                         // 2
    'RowType   QUEUE,TYPE',                          // 3
    'Field       LONG',                              // 4
    '          END',                                 // 5
    'IWidget   INTERFACE',                           // 6
    'Do          PROCEDURE()',                       // 7
    '          END',                                 // 8
    'Browse PROCEDURE',                              // 9
    'Grp       GROUP,PRE(GRP)',                      // 10
    'Name        STRING(20)',                        // 11
    '          END',                                 // 12
    'Rows      QUEUE(RowType)',                      // 13
    'Extra       STRING(5)',                         // 14
    '          END',                                 // 15
    'Typed     RowType',                             // 16
    'IRef      &IWidget',                            // 17
    'Lister    CLASS',                               // 18
    'Q           &Rows',                             // 19  a class member referencing the local QUEUE
    '          END',                                 // 20
    '  CODE',                                        // 21
    "  Grp.Name = 'x'",                              // 22  a GROUP's field, by the GROUP's label
    '  Rows.Field = 1',                              // 23  a field the QUEUE takes from its type
    "  Rows.Extra = 'a'",                            // 24  the QUEUE's own field
    '  Typed.Field = 2',                             // 25  a variable of a QUEUE type
    '  IRef.Do()',                                   // 26  an interface reference
    "  Lister.Q.Extra = 'b'",                        // 27  a chain to the local QUEUE's field
];

const hoverText = (h: Hover | null | undefined) => {
    if (!h) return '';
    const c = h.contents as { value?: string } | string;
    return typeof c === 'string' ? c : c.value ?? '';
};

suite('Fields and interface methods through the dotted-access resolver (#652)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    async function hoverAt(line: number, character: number) {
        return hoverText(await new HoverProvider().provideHover(fx.open('caller.clw'), { line, character }));
    }
    async function at(line: number, word: string) {
        const doc = fx.open('caller.clw');
        const position = { line, character: CLW[line].lastIndexOf(word) + 1 };
        return {
            f12: definitionLocations(await new DefinitionProvider().provideDefinition(doc, position)).map(l => l.line),
            hover: await hoverAt(position.line, position.character),
        };
    }
    // #488's comparison: the type in the title, and the scope badge line.
    const typeOf = (t: string) => (/— `([^`]+)`/.exec(t.split('\n')[0]) ?? [])[1];
    const badge = (t: string) => t.split('\n').find(l => /^(🔧|🔐|📦|🌍|🔷)/.test(l)) ?? '';
    const memberCard = (t: string) => / — (Queue|Group) Field · /.test(t.split('\n')[0]);

    const fields: Array<[string, number, string, number]> = [
        ['Grp.Name: a GROUP field', 22, 'Name', 11],
        ['Rows.Field: a field the QUEUE takes from its type', 23, 'Field', 4],
        ['Rows.Extra: the QUEUE\'s own field', 24, 'Extra', 14],
        ['Typed.Field: a variable of a QUEUE type', 25, 'Field', 4],
        ['Lister.Q.Extra: a chain to the local QUEUE\'s field', 27, 'Extra', 14],
    ];
    for (const [name, line, word, declLine] of fields) {
        test(`${name}: F12 goes to the declaration`, async () => {
            assert.deepStrictEqual((await at(line, word)).f12, [declLine]);
        });
        test(`${name}: hover is the field's card, not the member card`, async () => {
            const use = (await at(line, word)).hover;
            assert.ok(use, 'a hover');
            assert.ok(!memberCard(use), `member-style card: ${use.split('\n')[0]}`);
        });
    }

    test('Lister.Q.Extra: the chain shows the same card as the dot form Rows.Extra', async () => {
        const chain = (await at(27, 'Extra')).hover;
        const dot = (await at(24, 'Extra')).hover;
        assert.strictEqual(chain.split('\n')[0], dot.split('\n')[0]);
    });

    // #488's rule, where it holds today: the dot-form card is the declaration's card. (A QUEUE with a
    // type argument does not yet match it for its own fields - `Rows.Extra` shows "Rows Field:" in
    // dot form and a different title at the declaration - which predates #652 and is its own issue.)
    test('Grp.Name: the dot-form card matches the declaration\'s (#488)', async () => {
        const use = (await at(22, 'Name')).hover;
        const decl = await hoverAt(11, 1);
        assert.strictEqual(typeOf(use), typeOf(decl), `title type: use "${use.split('\n')[0]}" vs declaration "${decl.split('\n')[0]}"`);
        assert.strictEqual(badge(use), badge(decl), 'badge');
    });

    test('IRef.Do(): F12 goes to the interface method', async () => {
        assert.deepStrictEqual((await at(26, 'Do')).f12, [7]);
    });
    test('IRef.Do(): hover shows the interface method card', async () => {
        assert.ok(/^\*\*Do\*\* — Interface Method · IWidget\b/.test((await at(26, 'Do')).hover), 'interface method card');
    });
});
