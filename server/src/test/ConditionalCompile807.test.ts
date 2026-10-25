import * as assert from 'assert';
import { scanConditionalCompile, evaluateCondition } from '../utils/ConditionalCompile';

/**
 * #807 — COMPILE and OMIT blocks decided from their conditions, so an INCLUDE in a block that
 * will not compile is not followed. The help (Language Reference > Compiler Directives):
 * - `COMPILE(terminator [,expression])` / `OMIT(...)`; the block ends at the line that contains
 *   the terminator, which is part of it; COMPILE keeps its body when the expression is true, OMIT
 *   when it is false.
 * - expression: `<equate>` or `<equate> = <> > < >= <= <integer constant>`.
 * - a switch is an EQUATE, a project define, or a PRAGMA define.
 * Ours, for safety: a condition naming anything whose value is not known is not decided, and its
 * block is treated as compiled (the compiler would read an undefined name as 0, but the extension
 * may simply not see where it is defined).
 */
const scan = (lines: string[], known: Record<string, number> = {}, fromIncludes: Record<string, Record<string, number>> = {}) =>
    scanConditionalCompile(lines, {
        lookup: name => known[name.toLowerCase()],
        equatesOfInclude: file => {
            const e = fromIncludes[file.toLowerCase()];
            return e ? new Map(Object.entries(e)) : undefined;
        },
    });
const includes = (lines: string[], known: Record<string, number> = {}, fromIncludes: Record<string, Record<string, number>> = {}) =>
    scan(lines, known, fromIncludes).includes.filter(i => i.active).map(i => i.file);

suite('#807 — COMPILE/OMIT conditions', () => {
    test('the expression forms the help lists', () => {
        const v = (name: string) => ({ a: 5, flag: 1, off: 0 } as Record<string, number>)[name.toLowerCase()];
        assert.strictEqual(evaluateCondition('flag', v), true);
        assert.strictEqual(evaluateCondition('off', v), false);
        assert.strictEqual(evaluateCondition('A = 5', v), true);
        assert.strictEqual(evaluateCondition('A <> 5', v), false);
        assert.strictEqual(evaluateCondition('A > 4', v), true);
        assert.strictEqual(evaluateCondition('A < 4', v), false);
        assert.strictEqual(evaluateCondition('A >= 5', v), true);
        assert.strictEqual(evaluateCondition('A <= 4', v), false);
        assert.strictEqual(evaluateCondition('Unknown = 1', v), undefined, 'an unknown name is not decided');
        assert.strictEqual(evaluateCondition('A + 1', v), undefined, 'not a form the help lists');
    });

    test('the reported layout: the version EQUATE comes from an earlier INCLUDE, only its block is followed', () => {
        const lines = [
            "  INCLUDE('LibXLVer.INC'),ONCE",
            "  COMPILE ('###', LibXL:Version = 411)",
            "     INCLUDE('LibXLEqu.411.INC'),ONCE",
            "     INCLUDE('LibXL.411.INT'),ONCE",
            'LibXL:Feature1  EQUATE(0)',
            '! ###',
            "  COMPILE ('###', LibXL:Version = 520)",
            "     INCLUDE('LibXLEqu.520.INC'),ONCE",
            "     INCLUDE('LibXL.520.INT'),ONCE",
            '! ###',
        ];
        assert.deepStrictEqual(includes(lines, {}, { 'libxlver.inc': { 'libxl:version': 520 } }),
            ['LibXLVer.INC', 'LibXLEqu.520.INC', 'LibXL.520.INT']);
        // Without the version known, every block is followed, as before.
        assert.deepStrictEqual(includes(lines).length, 5);
    });

    test('an EQUATE earlier in the same file decides; one after the directive does not', () => {
        assert.deepStrictEqual(includes([
            'Ver  EQUATE(2)',
            "  OMIT('**', Ver = 2)",
            "  INCLUDE('Old.inc')",
            '**',
            "  INCLUDE('Always.inc')",
        ]), ['Always.inc']);
        assert.deepStrictEqual(includes([
            "  OMIT('**', Ver = 2)",
            "  INCLUDE('Old.inc')",
            '**',
            'Ver  EQUATE(2)',
        ]), ['Old.inc'], 'not defined yet when the directive is read: not decided, so followed');
    });

    test('a project define or a PRAGMA define is a switch too', () => {
        assert.deepStrictEqual(includes([
            "  COMPILE('***', _ABCDllMode_)",
            "  INCLUDE('Dll.inc')",
            '***',
            "  OMIT('***', _ABCDllMode_)",
            "  INCLUDE('Link.inc')",
            '***',
        ], { _abcdllmode_: 1 }), ['Dll.inc']);
        assert.deepStrictEqual(includes([
            "  PRAGMA('project(#pragma define(UseNew=>on))')",
            "  COMPILE('!!', UseNew)",
            "  INCLUDE('New.inc')",
            '!!',
            "  OMIT('!!', UseNew)",
            "  INCLUDE('Old.inc')",
            '!!',
        ]), ['New.inc']);
    });

    test('an unconditional OMIT drops its body; an unconditional COMPILE keeps it', () => {
        assert.deepStrictEqual(includes([
            "  OMIT('**END**')",
            "  INCLUDE('Gone.inc')",
            '**END**',
            "  COMPILE('**END**')",
            "  INCLUDE('Kept.inc')",
            '**END**',
        ]), ['Kept.inc']);
    });

    test('the terminator line belongs to the block, and is found anywhere on the line', () => {
        const r = scan([
            "  OMIT('***')",
            "  INCLUDE('A.inc')",
            "  INCLUDE('B.inc') ! *** end",
            "  INCLUDE('C.inc')",
        ]);
        assert.deepStrictEqual(r.includes.map(i => [i.file, i.active]), [['A.inc', false], ['B.inc', false], ['C.inc', true]]);
    });

    test('blocks nest; inside an omitted block nothing else is read', () => {
        assert.deepStrictEqual(includes([
            'On  EQUATE(1)',
            "  COMPILE('[1]', On)",
            "    INCLUDE('Outer.inc')",
            "    OMIT('[2]', On)",
            "      INCLUDE('Inner.inc')",
            "      COMPILE('[3]', On)",
            "        INCLUDE('Deep.inc')",
            '      [3]',
            '    [2]',
            "    INCLUDE('After.inc')",
            '  [1]',
        ]), ['Outer.inc', 'After.inc']);
    });

    test('an EQUATE inside a block that will not compile does not count', () => {
        assert.deepStrictEqual(includes([
            "  OMIT('**')",
            'Ver  EQUATE(9)',
            '**',
            "  COMPILE('**', Ver = 9)",
            "  INCLUDE('Nine.inc')",
            '**',
        ]), ['Nine.inc'], 'Ver is unknown after the OMIT, so the COMPILE is not decided and is followed');
    });

    test('an undecided block is followed, and so are the blocks inside it', () => {
        assert.deepStrictEqual(includes([
            "  COMPILE('**', Mystery)",
            "  INCLUDE('A.inc')",
            '**',
        ]), ['A.inc']);
    });

    test('an INCLUDE\'s EQUATEs are asked for only when a condition needs a name not yet known', () => {
        const asked: string[] = [];
        const ctx = { equatesOfInclude: (f: string) => { asked.push(f); return new Map([['ver', 2]]); } };
        scanConditionalCompile([
            "  INCLUDE('A.inc')",
            "  OMIT('**')",              // unconditional: nothing to look up
            "  INCLUDE('B.inc')",
            '**',
            'Local  EQUATE(1)',
            "  COMPILE('**', Local)",     // decided by the file itself
            '**',
        ], ctx);
        assert.deepStrictEqual(asked, [], 'no condition needed an INCLUDE');
        const r = scanConditionalCompile([
            "  INCLUDE('A.inc')",
            "  INCLUDE('C.inc')",
            "  COMPILE('**', Ver = 2)",
            "  INCLUDE('Two.inc')",
            '**',
        ], ctx);
        assert.deepStrictEqual(asked, ['A.inc', 'C.inc'], 'the INCLUDEs before it, in order, once');
        assert.deepStrictEqual(r.includes.filter(i => i.active).map(i => i.file), ['A.inc', 'C.inc', 'Two.inc']);
    });

    test('a name no source defines as an EQUATE (a project switch) does not make the INCLUDEs be read', () => {
        // The perf rig: 2,200 generated modules test _ABCDllMode_-style switches; reading every
        // earlier INCLUDE to look for an EQUATE nobody defines blocked the server for 2 s.
        const asked: string[] = [];
        const ctx = {
            equatesOfInclude: (f: string) => { asked.push(f); return new Map([['ver', 2]]); },
            includesDefining: (name: string) => name.toLowerCase() === 'ver' ? undefined : () => false,
        };
        scanConditionalCompile(["  INCLUDE('A.inc')", "  COMPILE('**', _ABCDllMode_)", '**'], ctx);
        assert.deepStrictEqual(asked, [], 'a switch only a project defines');
        scanConditionalCompile(["  INCLUDE('A.inc')", "  COMPILE('**', Ver = 2)", '**'], ctx);
        assert.deepStrictEqual(asked, ['A.inc'], 'a name some file defines as an EQUATE');
    });

    test('with the files that define a name known, only those INCLUDEs are read for it', () => {
        // Cold perf rig: reading every earlier INCLUDE (and theirs) for a name defined in one
        // library file cost seconds; the index knows which file defines it.
        const asked: string[] = [];
        const ctx = {
            equatesOfInclude: (f: string) => { asked.push(f); return f === 'Ver.inc' ? new Map([['ver', 2]]) : new Map(); },
            includesDefining: (name: string) => name.toLowerCase() === 'ver' ? (f: string) => f.toLowerCase() === 'ver.inc' : () => false,
        };
        const r = scanConditionalCompile([
            "  INCLUDE('Big1.inc')",
            "  INCLUDE('Ver.inc')",
            "  INCLUDE('Big2.inc')",
            "  COMPILE('**', Ver = 2)",
            "  INCLUDE('Two.inc')",
            '**',
            "  COMPILE('**', _ABCDllMode_)",
            '**',
        ], ctx);
        assert.deepStrictEqual(asked, ['Ver.inc']);
        assert.ok(r.includes.find(i => i.file === 'Two.inc')!.active);
    });

    test('an EQUATE in the file after an INCLUDE wins over the INCLUDE\'s, as the compiler reads them in order', () => {
        const ctx = { equatesOfInclude: () => new Map([['ver', 1]]) };
        assert.deepStrictEqual(scanConditionalCompile([
            "  INCLUDE('A.inc')",
            'Ver  EQUATE(2)',
            "  COMPILE('**', Mystery)",   // unknown: makes the INCLUDE be read
            '**',
            "  OMIT('**', Ver = 2)",
            "  INCLUDE('Two.inc')",
            '**',
        ], ctx).includes.filter(i => i.active).map(i => i.file), ['A.inc']);
    });

    // The bug hunt: a name set inside a block that is not decided may or may not be compiled, so
    // it cannot decide a later block (an old header pattern: `OMIT('***',_c55_)` around
    // `_ABCDllMode_ EQUATE(0)`, _c55_ being a switch only the compiler knows).
    test('an EQUATE or PRAGMA define inside an undecided block does not decide anything later', () => {
        assert.deepStrictEqual(includes([
            "  OMIT('***', _c55_)",
            '_ABCDllMode_  EQUATE(0)',
            '  ***',
            "  COMPILE('***', _ABCDllMode_)",
            "  INCLUDE('Dll.inc')",
            '  ***',
        ]), ['Dll.inc']);
        assert.deepStrictEqual(includes([
            "  COMPILE('!!', Mystery)",
            "  PRAGMA('project(#pragma define(UseNew=>on))')",
            '!!',
            "  OMIT('**', UseNew)",
            "  INCLUDE('Old.inc')",
            '**',
        ]), ['Old.inc']);
        const r = scanConditionalCompile(["  COMPILE('**', Mystery)", 'Ver  EQUATE(2)', '**'], {});
        assert.strictEqual(r.equates.has('ver'), false, 'not exported to an includer either');
    });

    test('a name set in both branches of an undecided pair stays unknown', () => {
        assert.deepStrictEqual(includes([
            "  COMPILE('***', _C11_)",
            'VER  EQUATE(11)',
            '***',
            "  OMIT('***', _C11_)",
            'VER  EQUATE(10)',
            '***',
            "  COMPILE('***', VER = 11)",
            "  INCLUDE('v11.inc'),ONCE",
            '***',
        ]), ['v11.inc']);
    });

    test('a terminator inside a string does not close the block', () => {
        assert.deepStrictEqual(includes([
            "  OMIT('***')",
            "  MESSAGE('***')",
            "  INCLUDE('a.inc')",
            '***',
        ]), []);
    });

    test('an EQUATE local to a procedure, or a member of an ITEMIZE, is not a switch', () => {
        assert.deepStrictEqual(includes([
            '  MEMBER()',
            'Proc  PROCEDURE',
            'Ver     EQUATE(2)',
            '  CODE',
            "  OMIT('**', Ver = 2)",
            "  INCLUDE('Two.inc')",
            '**',
        ]), ['Two.inc'], 'a procedure\'s local EQUATE');
        assert.deepStrictEqual(includes([
            'Colors  ITEMIZE,PRE(Col)',
            'Ver       EQUATE(2)',
            '        END',
            "  OMIT('**', Ver = 2)",
            "  INCLUDE('Two.inc')",
            '**',
        ]), ['Two.inc'], 'Col:Ver, not Ver');
    });

    test('a PRAGMA define in a comment is not one', () => {
        assert.deepStrictEqual(includes([
            "! PRAGMA('define(_X_=>1)')",
            "  OMIT('**', _X_)",
            "  INCLUDE('X.inc')",
            '**',
        ]), ['X.inc']);
    });

    test('inactive lines are reported for other uses', () => {
        const r = scan(['Ver  EQUATE(1)', "  OMIT('**', Ver)", 'x LONG', '**', 'y LONG']);
        assert.deepStrictEqual([0, 1, 2, 3, 4].map(l => r.isInactive(l)), [false, true, true, true, false]);
    });
});
