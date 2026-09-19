/**
 * F12 on an ITEMIZE equate reached through an INCLUDE (#615).
 *
 * Found by the #609 agreement sweep on ap1: `FuzzyMatcher.SetOption(MatchOption:NoCase, 1)` in
 * glc.clw - hover went to the ITEMIZE entry in ABFUZZY.INC (`ITEMIZE(),PRE(MatchOption)`), F12 to
 * nothing. F12's prefix resolver looked in the current file and its MEMBER parent only; hover's
 * walks the INCLUDE chain too.
 */
import * as assert from 'assert';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    'MaxResults  EQUATE(20)',                           // 0
    '  ITEMIZE(),PRE(MatchOption)',                     // 1
    'NoCase          EQUATE',                           // 2
    'WordOnly        EQUATE',                           // 3
    '  END',                                            // 4
];
const PROG = [
    '  PROGRAM',                                        // 0
    "  INCLUDE('fuzzy.inc'),ONCE",                      // 1
    '  MAP',                                            // 2
    '  END',                                            // 3
    'Opt  LONG',                                        // 4
    '  CODE',                                           // 5
    '  Opt = MatchOption:NoCase',                       // 6
    '  Opt = MatchOption:WordOnly + MaxResults',        // 7
];
const MEMBERMOD = [
    "  MEMBER('prog.clw')",                             // 0
    'Search PROCEDURE',                                 // 1
    'o  LONG',                                          // 2
    '  CODE',                                           // 3
    '  o = MatchOption:NoCase',                         // 4
];

suite('F12 on an ITEMIZE equate reached through an INCLUDE (#615)', () => {
    let fx: DiskSolution;

    suiteSetup(() => { setServerInitialized(true); fx = createDiskSolution({ 'fuzzy.inc': INC, 'prog.clw': PROG, 'member.clw': MEMBERMOD }); });
    suiteTeardown(() => fx.dispose());

    async function targets(file: string, lines: string[], line: number, word: string) {
        const doc = fx.open(file);
        const position = { line, character: lines[line].indexOf(word) + word.length - 2 };
        const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            def: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
        };
    }

    const cases: Array<[string, string, string[], number, string, string]> = [
        ['in the PROGRAM that includes it',        'prog.clw',   PROG,      6, 'MatchOption:NoCase',   'fuzzy.inc:2'],
        ['a second entry',                         'prog.clw',   PROG,      7, 'MatchOption:WordOnly', 'fuzzy.inc:3'],
        ['in a MEMBER module of that PROGRAM',     'member.clw', MEMBERMOD, 4, 'MatchOption:NoCase',   'fuzzy.inc:2'],
    ];

    for (const [name, file, lines, line, word, expected] of cases) {
        test(`F12: ${name}`, async () => {
            const { def } = await targets(file, lines, line, word);
            assert.deepStrictEqual(def, [expected]);
        });
        test(`hover agrees: ${name}`, async () => {
            const { hover } = await targets(file, lines, line, word);
            assert.ok(hover.includes(expected), `hover -> ${JSON.stringify(hover)}`);
        });
    }
});
