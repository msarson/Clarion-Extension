/**
 * #668 — follow-up to #657, same rule (#488: one card for a field at its declaration, in PRE form
 * and in dot form). Two shapes still broke it: a structure whose TYPE is declared in another file
 * (`Rows QUEUE(RowType)` with RowType in the program file) showed the older "RowType Field:" card,
 * and a field of a nested GROUP reached through a chain (`Mine.Inner.Flag`) showed the class-member
 * card, "Class Property".
 */
import * as assert from 'assert';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const PROG = [
    '  PROGRAM',                        // 0
    '  MAP',                            // 1
    '  END',                            // 2
    'RowType   QUEUE,TYPE',             // 3
    'Field       LONG',                 // 4
    '          END',                    // 5
    'Features  GROUP,TYPE',             // 6
    'IniFile     GROUP',                // 7
    'Enabled       BYTE',               // 8
    '            END',                  // 9
    '          END',                    // 10
    '  CODE',                           // 11
];
const MEM = [
    "  MEMBER('prog.clw')",             // 0
    'Browse PROCEDURE',                 // 1
    'Rows      QUEUE(RowType)',         // 2
    '          END',                    // 3
    'Feats     GROUP(Features)',        // 4
    '          END',                    // 5
    'Local     GROUP,TYPE',             // 6
    'Inner       GROUP',                // 7
    'Flag          BYTE',               // 8
    '            END',                  // 9
    '          END',                    // 10
    'Mine      GROUP(Local)',           // 11
    '          END',                    // 12
    '  CODE',                           // 13
    '  Rows.Field = 1',                 // 14
    '  Feats.IniFile.Enabled = 1',      // 15
    '  Mine.Inner.Flag = 1',            // 16
];

const hoverText = (h: Hover | null | undefined) => {
    if (!h) return '';
    const c = h.contents as { value?: string } | string;
    return typeof c === 'string' ? c : c.value ?? '';
};
// #488's comparison: the type in the title, and the scope badge line.
const typeOf = (t: string) => (/— `([^`]+)`/.exec(t.split('\n')[0]) ?? [])[1];
const badge = (t: string) => t.split('\n').find(l => /^(🔧|🔐|📦|🌍|🔷)/.test(l)) ?? '';

suite('Field cards in dot form match the declaration: other-file types and nested GROUPs (#668)', () => {
    let fx: DiskSolution;
    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'prog.clw': PROG, 'member.clw': MEM });
    });
    suiteTeardown(() => fx.dispose());

    async function hover(file: 'prog.clw' | 'member.clw', line: number, word: string) {
        const lines = file === 'prog.clw' ? PROG : MEM;
        const character = (line >= 14 ? lines[line].lastIndexOf(word) : lines[line].indexOf(word)) + 1;
        return hoverText(await new HoverProvider().provideHover(fx.open(file), { line, character }));
    }

    const cases: Array<[string, number, string, 'prog.clw' | 'member.clw', number]> = [
        ['bug-pin: Rows.Field, the QUEUE\'s type declared in the program file', 14, 'Field', 'prog.clw', 4],
        ['bug-pin: Feats.IniFile, a nested GROUP of a type in the program file', 15, 'IniFile', 'prog.clw', 7],
        ['bug-pin: Mine.Inner.Flag, a chain into a nested GROUP of a type in this file', 16, 'Flag', 'member.clw', 8],
        ['Mine.Inner, a nested GROUP of a type in this file (already right)', 16, 'Inner', 'member.clw', 7],
    ];
    for (const [name, line, word, declFile, declLine] of cases) {
        test(`${name}: the dot-form card matches the declaration's (#488)`, async () => {
            const use = await hover('member.clw', line, word);
            const decl = await hover(declFile, declLine, word);
            assert.ok(!/ · /.test(use.split('\n')[0]), `not a member card: ${use.split('\n')[0]}`);
            assert.strictEqual(typeOf(use), typeOf(decl), `title type: use "${use.split('\n')[0]}" vs declaration "${decl.split('\n')[0]}"`);
            assert.strictEqual(badge(use), badge(decl), `badge: use "${badge(use)}" vs declaration "${badge(decl)}"`);
        });
    }

    // #652's rule keeps the member card for a chain into a structure declared in ANOTHER file,
    // and StructuredTypeMemberLabel's rule is that a GROUP / QUEUE member is never called a class
    // property. The chain into the program file's nested GROUP broke the second.
    test('bug-pin: Feats.IniFile.Enabled, a chain into a GROUP type in another file, is a Group Field, not a Class Property', async () => {
        const first = (await hover('member.clw', 15, 'Enabled')).split('\n')[0];
        assert.ok(!/Class Property/.test(first), first);
        assert.ok(/Group Field/.test(first) || /— `BYTE`/.test(first), first);
    });
});
