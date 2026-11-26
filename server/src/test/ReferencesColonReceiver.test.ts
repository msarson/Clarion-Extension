/**
 * Find All References on a class member lists the accesses through an object whose label carries
 * a colon (`Glo:Obj.Hits`, `Loc:Obj.Bump()`), as it lists them through a plain label (`Obj2.Hits`).
 *
 * A colon-named object is the usual shape for program globals (`Glo:Name`) and prefixed locals.
 * Hover and Go to Definition resolve such an access (#653); the references scan skipped it,
 * from every start point, the access itself included. A prefix longer than the tokenizer's
 * PREFIX:Field pattern (`CommonLib:Obj`) or a second colon (`Glo:A:B:Obj`) splits the name into
 * several tokens (see PrefixChain); the receiver is the whole name, not its last piece.
 */
import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'MyCls      CLASS,TYPE',                        // 0
    'Hits         LONG',                            // 1  the target
    'Bump         PROCEDURE()',                     // 2
    '           END',                               // 3
    'Other      CLASS,TYPE',                        // 4
    'Hits         LONG',                            // 5  same name, other class
    '           END',                               // 6
];

const PRG = [
    '  PROGRAM',                                    // 0
    "  INCLUDE('cls.inc'),ONCE",                    // 1
    '  MAP',                                        // 2
    'UseIt        PROCEDURE',                       // 3
    'Third        PROCEDURE',                       // 4
    "    MODULE('member.clw')",                     // 5
    'Helper         PROCEDURE',                     // 6
    '    END',                                      // 7
    '  END',                                        // 8
    'Glo:Obj    MyCls',                             // 9
    'Obj2       MyCls',                             // 10
    'Glo:Other  Other',                             // 11
    '  CODE',                                       // 12
    '  Glo:Obj.Hits = 1',                           // 13 IN
    '  Obj2.Hits = 2',                              // 14 IN
    '  IF Glo:Obj.Hits = 3 THEN RETURN.',           // 15 IN
    '  Glo:Other.Hits = 4',                         // 16 OUT (Other)
    '  Glo:Obj.Bump()',                             // 17 Bump
    'UseIt PROCEDURE',                              // 18
    'Loc:Obj    MyCls',                             // 19
    '  CODE',                                       // 20
    '  Glo:Obj.Hits = 5',                           // 21 IN
    '  Loc:Obj.Hits = 6',                           // 22 IN (colon-named local)
    '  Loc:Obj.Bump()',                             // 23 Bump
    '  Glo:Obj.Hits = Glo:Obj.Hits + 1',            // 24 IN twice
    'Third PROCEDURE',                              // 25
    'CommonLib:Obj  MyCls',                         // 26 a prefix longer than PREFIX:Field takes
    'Glo:A:B:Obj    MyCls',                         // 27 two colons
    'Obj            Other',                         // 28 decoy: the last piece of both names above
    '  CODE',                                       // 29
    '  CommonLib:Obj.Hits = 7',                     // 30 IN
    '  Glo:A:B:Obj.Hits = 8',                       // 31 IN
    '  Obj.Hits = 9',                               // 32 OUT (Other)
];

const MEMBER = [
    "  MEMBER('prog.clw')",                         // 0
    '  MAP',                                        // 1
    '  END',                                        // 2
    'Helper PROCEDURE',                             // 3
    '  CODE',                                       // 4
    '  Glo:Obj.Hits = 7',                           // 5 IN
    '  Glo:Other.Hits = 8',                         // 6 OUT (Other)
    '  Glo:Obj.Bump()',                             // 7 Bump
];

// A module whose MEMBER statement lives in an INCLUDEd shim (`INCLUDE('member.clw')` in place of
// `MEMBER('prog')`, as generated projects have it): the program's globals reach it through the shim.
const SHIM = [
    "  MEMBER('prog.clw')",                         // 0
];

const MODULE = [
    "  INCLUDE('shim.clw')",                        // 0
    "  INCLUDE('cls.inc'),ONCE",                    // 1
    '  MAP',                                        // 2
    '  END',                                        // 3
    'Helper2 PROCEDURE',                            // 4
    '  CODE',                                       // 5
    '  Glo:Obj.Hits = 10',                          // 6 IN
    '  Glo:Other.Hits = 11',                        // 7 OUT (Other)
    '  Glo:Obj.Bump()',                             // 8 Bump
    '  Obj2.Hits = 12',                             // 9 IN (a plain program global, same route)
];

const MYCLS_HITS = ['cls.inc:1', 'prog.clw:13', 'prog.clw:14', 'prog.clw:15', 'prog.clw:21', 'prog.clw:22',
    'prog.clw:24', 'prog.clw:30', 'prog.clw:31', 'member.clw:5', 'module.clw:6', 'module.clw:9'];
const OTHER_HITS = ['cls.inc:5', 'prog.clw:16', 'prog.clw:32', 'member.clw:6', 'module.clw:7'];
const BUMP = ['cls.inc:2', 'prog.clw:17', 'prog.clw:23', 'member.clw:7', 'module.clw:8'];

suite('Find All References through a colon-named object', () => {
    let fx: DiskSolution;
    let inc: TextDocument;
    let prg: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'cls.inc': INC, 'prog.clw': PRG, 'member.clw': MEMBER, 'shim.clw': SHIM, 'module.clw': MODULE });
        inc = fx.open('cls.inc');
        prg = fx.open('prog.clw');
        fx.open('member.clw');
        fx.open('module.clw');
        // The modules' program, as the solution's file graph records it: a MEMBER module sees
        // the program's global data through it, directly or through the shim it INCLUDEs.
        const at = (f: string) => path.join(fx.root, f);
        FileRelationshipGraph.getInstance().reset();
        FileRelationshipGraph.getInstance().seedEdgesForTest([
            { type: 'MEMBER', fromFile: at('member.clw'), toFile: at('prog.clw'), fromLine: 0 },
            { type: 'MEMBER', fromFile: at('shim.clw'), toFile: at('prog.clw'), fromLine: 0 },
            { type: 'INCLUDE', fromFile: at('module.clw'), toFile: at('shim.clw'), fromLine: 0 },
        ]);
    });
    suiteTeardown(() => {
        FileRelationshipGraph.getInstance().reset();
        fx.dispose();
    });

    async function locations(doc: TextDocument, lines: string[], line: number, word: string, includeDeclaration = true): Promise<Location[]> {
        const character = lines[line].indexOf(word) + 1;
        return (await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration })) ?? [];
    }

    /** Hits as `file:line`, e.g. `prog.clw:13`, sorted, once each. */
    async function refs(doc: TextDocument, lines: string[], line: number, word: string, includeDeclaration = true): Promise<string[]> {
        const r = await locations(doc, lines, line, word, includeDeclaration);
        return [...new Set(r.map(l => `${decodeURIComponent(l.uri).split('/').pop()}:${l.range.start.line}`))].sort();
    }

    function assertExactly(got: string[], from: string, expected: string[]): void {
        const missing = expected.filter(h => !got.includes(h));
        const extra = got.filter(h => !expected.includes(h));
        assert.deepStrictEqual({ missing, extra }, { missing: [], extra: [] }, `from ${from}, got [${got.join(' ')}]`);
    }

    test('from the member\'s declaration', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 1, 'Hits'), 'MyCls.Hits declaration', MYCLS_HITS);
    });

    test('from an access through the colon-named global', async function () {
        this.timeout(10000);
        assertExactly(await refs(prg, PRG, 13, 'Hits'), 'Glo:Obj.Hits', MYCLS_HITS);
    });

    test('CONTROL: from an access through a plain global', async function () {
        this.timeout(10000);
        assertExactly(await refs(prg, PRG, 14, 'Hits'), 'Obj2.Hits', MYCLS_HITS);
    });

    test('a long prefix and a second colon belong to the receiver, not to a same-named plain variable', async function () {
        this.timeout(10000);
        assertExactly(await refs(prg, PRG, 30, 'Hits'), 'CommonLib:Obj.Hits', MYCLS_HITS);
        assertExactly(await refs(prg, PRG, 31, 'Hits'), 'Glo:A:B:Obj.Hits', MYCLS_HITS);
    });

    test('the other class\'s member gets only its own accesses', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 5, 'Hits'), 'Other.Hits declaration', OTHER_HITS);
    });

    test('a method called through colon-named objects, from its declaration and from a call', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 2, 'Bump'), 'MyCls.Bump declaration', BUMP);
        assertExactly(await refs(prg, PRG, 23, 'Bump'), 'Loc:Obj.Bump()', BUMP);
    });

    test('two accesses on one line are two references, each on the member name', async function () {
        this.timeout(10000);
        const onLine = (await locations(inc, INC, 1, 'Hits'))
            .filter(l => /prog\.clw$/i.test(decodeURIComponent(l.uri)) && l.range.start.line === 24)
            .map(l => [l.range.start.character, l.range.end.character])
            .sort((a, b) => a[0] - b[0]);
        const first = PRG[24].indexOf('Hits');
        const second = PRG[24].lastIndexOf('Hits');
        assert.deepStrictEqual(onLine, [[first, first + 4], [second, second + 4]]);
    });

    test('without declarations the accesses stay and the declaration goes', async function () {
        this.timeout(10000);
        assertExactly(await refs(inc, INC, 1, 'Hits', false), 'MyCls.Hits declaration, no declarations',
            MYCLS_HITS.filter(h => h !== 'cls.inc:1'));
    });
});
