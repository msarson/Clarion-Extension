/**
 * #636 - Go to Implementation must be consistent with Go to Definition.
 *
 * Three pieces:
 *
 *  1. The rule itself (classifyImplementation and the two line readers under it), on
 *     hand-written answers, so a change to the rule shows here before it moves a sweep.
 *  2. Every shape ProcedureCallDetector recognises, with and without a local of the same name
 *     in scope, through all three features that read the detector: hover, F12 and Ctrl+F12.
 *     #631 widened the detector and tested two of the three; Ctrl+F12 regressed unseen (#635).
 *     A new shape added to the detector belongs in SHAPES, and then fails here for every
 *     feature that does not handle it.
 *  3. #627's case, judged by the rule rather than by an expected line, so the rule is shown to
 *     catch the defect it exists for (it did not exist when #627 was fixed).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import {
    callableOnLine, opensBody, classifyImplementation, classifyAgreement, definitionLocations, normaliseFile
} from './support/hoverDefinitionAgreement';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const at = (file: string, line: number) => ({ uri: `file:///c:/x/${file}`, range: { start: { line, character: 0 }, end: { line, character: 0 } } });

suite('Go to Implementation agreement: the rule (#636)', () => {
    test('callableOnLine reads a prototype, a body, the MAP shorthand and a routine', () => {
        assert.deepStrictEqual(callableOnLine('Work        PROCEDURE(LONG n),DERIVED'), { name: 'WORK', params: ['LONG'], isRoutine: false, owner: undefined });
        assert.deepStrictEqual(callableOnLine('Thing.Work PROCEDURE(LONG n)'), { name: 'WORK', params: ['LONG'], isRoutine: false, owner: 'THING' });
        assert.deepStrictEqual(callableOnLine('        Helper(),LONG'), { name: 'HELPER', params: [], isRoutine: false, owner: undefined });
        assert.deepStrictEqual(callableOnLine('    Take PROCEDURE(LONG n)'), { name: 'TAKE', params: ['LONG'], isRoutine: false, owner: undefined });
        assert.deepStrictEqual(callableOnLine('Tidy      ROUTINE'), { name: 'TIDY', params: [], isRoutine: true, owner: undefined });
        assert.deepStrictEqual(callableOnLine('Name        STRING(20)'), null);
        assert.deepStrictEqual(callableOnLine('  CODE'), null);
    });

    test('parameter types drop names, defaults and optional brackets, and keep * and &', () => {
        assert.deepStrictEqual(callableOnLine('Go PROCEDURE(<*STRING s>, BYTE b=0, &Queue q, LONG)')!.params,
            ['*STRING', 'BYTE', '&QUEUE', 'LONG']);
        assert.deepStrictEqual(callableOnLine('Run PROCEDURE(USHORT,BYTE),BYTE')!.params,
            callableOnLine('WinMgr.Run PROCEDURE(USHORT Number,BYTE Request)')!.params,
            'a prototype that omits names matches the body that has them');
    });

    test('opensBody tells a body from a prototype in a MAP, in a CLASS, and in a local CLASS before CODE', () => {
        const lines = [
            '  MAP',                                        // 0
            'Helper      PROCEDURE()',                      // 1  prototype
            '  END',                                        // 2
            'Helper      PROCEDURE()',                      // 3  body, local data with a structure
            'Q             QUEUE',                          // 4
            'F               LONG',                         // 5
            '              END',                            // 6
            'Win         CLASS',                            // 7
            'Run           PROCEDURE()',                    // 8  prototype in a local class
            '            END',                              // 9
            '  CODE',                                       // 10
            'Tidy      ROUTINE',                            // 11
        ];
        assert.strictEqual(opensBody(lines, 1), false);
        assert.strictEqual(opensBody(lines, 3), true);
        assert.strictEqual(opensBody(lines, 8), false);
        assert.strictEqual(opensBody(lines, 11), true);
    });

    test('opensBody: an indented statement before CODE is not the next procedure', () => {
        const lines = [
            'Browse      PROCEDURE(LONG n)',                // 0
            "    omit('***',Flag=1)",                       // 1  looks like the MAP shorthand
            "    ***",                                      // 2
            '  CODE',                                       // 3
        ];
        assert.strictEqual(opensBody(lines, 0), true);
    });

    test('opensBody: a variable named like a structure keyword opens nothing', () => {
        const lines = [
            'Browse      PROCEDURE',                        // 0
            'Toolbar       ToolbarClass',                   // 1  a variable, not a TOOLBAR
            'Window        WINDOW(\'x\'),AT(,,10,10)',      // 2  a real structure
            '              END',                            // 3
            '  CODE',                                       // 4
        ];
        assert.strictEqual(opensBody(lines, 0), true);
    });

    test('a class-typed parameter matches with or without * (the vendor writes both)', () => {
        const lines = [
            'Init        PROCEDURE(Worker W,<Printer P>)',  // 0  prototype
            '          END',                                // 1
            'Mgr.Init    PROCEDURE(*Worker W,<*Printer P>)', // 2
            '  CODE',                                       // 3
        ];
        const readLines = (f: string) => (f === normaliseFile('file:///c:/x/b.clw') ? lines : undefined);
        assert.strictEqual(classifyImplementation('Init', at('b.clw', 0), at('b.clw', 2), readLines), 'agree');
    });

    test('the body must belong to the class that declares the member', () => {
        const lines = [
            'Base        CLASS,TYPE',                       // 0
            'Run           PROCEDURE()',                    // 1
            '            END',                              // 2
            'Win         CLASS(Base)',                      // 3
            'Run           PROCEDURE(),DERIVED',            // 4  F12 on Win.Run() lands here
            '            END',                              // 5
            'Base.Run    PROCEDURE()',                      // 6  the parent's body
            '  CODE',                                       // 7
            'Win.Run     PROCEDURE()',                      // 8  the override's own body
            '  CODE',                                       // 9
        ];
        const readLines = (f: string) => (f === normaliseFile('file:///c:/x/c.clw') ? lines : undefined);
        assert.strictEqual(classifyImplementation('Run', at('c.clw', 4), at('c.clw', 8), readLines), 'agree');
        assert.strictEqual(classifyImplementation('Run', at('c.clw', 4), at('c.clw', 6), readLines), 'wrong-target',
            'the DERIVED override declared in Win must not open Base.Run');
    });

    const FILE = [
        'Work        PROCEDURE(LONG n)',                // 0  prototype
        'Work        PROCEDURE(STRING s)',              // 1  another overload
        '          END',                                // 2
        'Thing.Work  PROCEDURE(LONG n)',                // 3
        '  CODE',                                       // 4
        'Thing.Work  PROCEDURE(STRING s)',              // 5
        '  CODE',                                       // 6
        'Total       LONG',                             // 7
    ];
    const read = (f: string) => (f === normaliseFile('file:///c:/x/a.clw') ? FILE : undefined);

    test('verdicts', () => {
        const v = (word: string, def: any, impl: any) => classifyImplementation(word, def, impl, read);
        assert.strictEqual(v('Work', at('a.clw', 0), at('a.clw', 3)), 'agree', 'the overload\'s own body');
        assert.strictEqual(v('Work', at('a.clw', 0), at('a.clw', 5)), 'wrong-target', 'another overload\'s body (#627)');
        assert.strictEqual(v('Work', at('a.clw', 0), null), 'no-body');
        assert.strictEqual(v('Work', at('a.clw', 0), at('a.clw', 0)), 'no-body', 'the prototype itself');
        assert.strictEqual(v('Work', at('a.clw', 3), at('a.clw', 3)), 'agree', 'F12 already on the body');
        assert.strictEqual(v('Total', at('a.clw', 7), null), 'agree');
        assert.strictEqual(v('Total', at('a.clw', 7), at('a.clw', 7)), 'declaration');
        assert.strictEqual(v('Total', at('a.clw', 7), at('a.clw', 3)), 'impl-on-data', 'a variable sent to a body (#635)');
        assert.strictEqual(v('n', at('a.clw', 0), null), 'agree', 'a parameter lands on its PROCEDURE line and is still data');
        assert.strictEqual(v('Total', null, at('a.clw', 3)), 'impl-only');
        assert.strictEqual(v('Total', null, null), 'no-location');
    });
});

/**
 * A MAP procedure named by each detector shape, once where nothing else has its name and once
 * inside a procedure that declares a local `Helper LONG`.
 */
const LINES = [
    '    MEMBER',                   // 0
    '    MAP',                      // 1
    '        Helper(),LONG',        // 2
    '        Take(LONG n)',         // 3
    '    END',                      // 4
    '',                             // 5
    'Helper        PROCEDURE()',    // 6
    '  CODE',                       // 7
    '  RETURN 0',                   // 8
    '',                             // 9
    'Take          PROCEDURE(LONG n)', // 10
    '  CODE',                       // 11
    '',                             // 12
    'Plain         PROCEDURE',      // 13
    '  CODE',                       // 14
    '  x# = Helper()',              // 15
    '  START(Helper)',              // 16
    '  Helper',                     // 17
    '  Take(Helper)',               // 18
    '',                             // 19
    'Shadowed      PROCEDURE',      // 20
    'Helper          LONG',         // 21
    '  CODE',                       // 22
    '  x# = Helper()',              // 23
    '  START(Helper)',              // 24
    '  Helper',                     // 25
    '  Take(Helper)',               // 26
];
const BODY = 6;
const LOCAL = 21;

/**
 * [shape, line without a local, line with one, what F12 must name when shadowed].
 * `procedure` / `local` where the language settles it: a name passed as an argument is the
 * local in scope (#631, #635); START binds the procedure whatever is in scope (#632,
 * compiler-verified). A call with parentheses and a bare statement are left to consistency
 * alone: the three features must agree with each other, whichever they pick.
 */
const SHAPES: Array<[string, number, number, 'procedure' | 'local' | 'either']> = [
    ['call Helper()',        15, 23, 'either'],
    ['START(Helper)',        16, 24, 'procedure'],
    ['standalone Helper',    17, 25, 'either'],
    ['argument Take(Helper)', 18, 26, 'local'],
];

suite('Every ProcedureCallDetector shape through hover, F12 and Ctrl+F12 (#636)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test636/Shapes.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    async function answers(line: number) {
        const position = { line, character: LINES[line].indexOf('Helper') + 1 };
        const hover = await new HoverProvider().provideHover(doc, position);
        const def = await new DefinitionProvider().provideDefinition(doc, position);
        const impl = await new ImplementationProvider().provideImplementation(doc, position);
        const read = (f: string) => (f === normaliseFile(doc.uri) ? LINES : undefined);
        return {
            hover: classifyAgreement(hover, def),
            impl: classifyImplementation('Helper', def, impl, read),
            f12: definitionLocations(def).map(l => l.line),
            ctrlF12: definitionLocations(impl).map(l => l.line),
        };
    }

    for (const [shape, plain, shadowed, expected] of SHAPES) {
        test(`${shape}, nothing else named Helper: all three name the procedure`, async () => {
            const a = await answers(plain);
            const detail = JSON.stringify(a);
            assert.strictEqual(a.hover, 'agree', `hover vs F12: ${detail}`);
            assert.strictEqual(a.impl, 'agree', `Ctrl+F12 vs F12: ${detail}`);
            assert.ok(a.f12.length > 0 && !a.f12.includes(LOCAL), `F12 names the procedure: ${detail}`);
            assert.deepStrictEqual(a.ctrlF12, [BODY], `Ctrl+F12 opens the body: ${detail}`);
        });

        test(`${shape}, a local Helper in scope: the three agree${expected === 'either' ? '' : ` on the ${expected}`}`, async () => {
            const a = await answers(shadowed);
            const detail = JSON.stringify(a);
            assert.strictEqual(a.hover, 'agree', `hover vs F12: ${detail}`);
            assert.strictEqual(a.impl, 'agree', `Ctrl+F12 vs F12: ${detail}`);
            if (expected === 'local') {
                assert.deepStrictEqual(a.f12, [LOCAL], `F12 names the local: ${detail}`);
                assert.deepStrictEqual(a.ctrlF12, [], `a variable has no implementation: ${detail}`);
            } else if (expected === 'procedure') {
                assert.ok(a.f12.length > 0 && !a.f12.includes(LOCAL), `F12 names the procedure: ${detail}`);
                assert.deepStrictEqual(a.ctrlF12, [BODY], `Ctrl+F12 opens the body: ${detail}`);
            }
        });
    }
});

suite('The rule catches #627 (#636)', () => {
    // #627's own fixture (ImplSelfReceiverOverload627.test.ts): SELF.Run() binds the inherited
    // no-argument Run, whose body is in classes.clw; the local override's body takes two.
    const INC = [
        "WinMgr     CLASS,TYPE,MODULE('classes.clw')",
        'Run          PROCEDURE(),BYTE,VIRTUAL,PROC',
        'Run          PROCEDURE(USHORT Number,BYTE Request),BYTE,VIRTUAL,PROC',
        '           END',
    ];
    const CLASSES_CLW = [
        '  MEMBER()',
        "  INCLUDE('classes.inc')",
        'WinMgr.Run PROCEDURE()',
        '  CODE',
        '  RETURN 0',
        'WinMgr.Run PROCEDURE(USHORT Number,BYTE Request)',
        '  CODE',
        '  RETURN 0',
    ];
    const CLW = [
        '  MEMBER()',
        "  INCLUDE('classes.inc')",
        '  MAP',
        '  END',
        'Browse PROCEDURE',
        'ReturnValue          BYTE',
        'ThisWindow           CLASS(WinMgr)',
        'Init                   PROCEDURE(),BYTE,PROC',
        'Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC,DERIVED',
        '                     END',
        '  CODE',
        '  ReturnValue = ThisWindow.Run()',
        'ThisWindow.Init PROCEDURE()',
        '  CODE',
        '  ReturnValue = SELF.Run()',       // 14
        '  ReturnValue = SELF.Run(1,2)',    // 15
        '  RETURN ReturnValue',
        'ThisWindow.Run PROCEDURE(USHORT Number,BYTE Request)',
        '  CODE',
        '  RETURN 0',
    ];
    const FILES: Record<string, string[]> = { 'classes.inc': INC, 'classes.clw': CLASSES_CLW, 'caller.clw': CLW };
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution(FILES);
    });
    suiteTeardown(() => fx.dispose());

    for (const line of [14, 15]) {
        test(`${CLW[line].trim()}: Ctrl+F12 opens the body of the overload F12 names`, async () => {
            const doc = fx.open('caller.clw');
            const position = { line, character: CLW[line].indexOf('Run') + 1 };
            const def = await new DefinitionProvider().provideDefinition(doc, position);
            const impl = await new ImplementationProvider().provideImplementation(doc, position);
            const read = (f: string) => {
                const name = Object.keys(FILES).find(n => normaliseFile(fx.uriOf(n)) === f);
                return name ? FILES[name] : undefined;
            };
            const show = (d: any) => definitionLocations(d).map(l => `${l.file.split('/').pop()}:${l.line}`).join(', ');
            assert.strictEqual(classifyImplementation('Run', def, impl, read), 'agree',
                `F12 -> ${show(def)}; Ctrl+F12 -> ${show(impl)}`);
        });
    }
});
