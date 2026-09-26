import * as assert from 'assert';
import { scanReferences, unresolvedReferences } from '../utils/UnresolvedReferences';

/**
 * #687 (experimental) — a report of the file references that do not resolve. The graph drops an
 * unresolved INCLUDE / MEMBER / MODULE target silently, so the report rescans the graph's files and
 * asks the same resolver.
 *
 * Only an INCLUDE that does not resolve is reported as missing. The Language Reference says of
 * MODULE, in a MAP and as a CLASS attribute alike: "If the sourcefile is an external library, this
 * string may contain any unique identifier" - so a MODULE name with no file behind it (even one
 * ending .clw) may be a library's label, and is informational, with its LINK and DLL attributes as
 * evidence. MEMBER names the PROGRAM source file; what a missing one does is not documented, so it
 * has its own category.
 */
const src = (...lines: string[]) => lines.join('\r\n');

suite('Unresolved file references report (#687)', () => {
    test('finds INCLUDE, MEMBER, MAP MODULE and CLASS MODULE with their lines', () => {
        const refs = scanReferences(src(
            "  MEMBER('app.clw')",
            "  INCLUDE('keys.inc'),ONCE",
            "  MAP",
            "    MODULE('util.clw')",
            "    END",
            "  END",
            "Cls CLASS,MODULE('cls.clw'),TYPE",
        ));
        assert.deepStrictEqual(refs.map(r => [r.kind, r.target, r.line, r.classModule]), [
            ['MEMBER', 'app.clw', 0, false],
            ['INCLUDE', 'keys.inc', 1, false],
            ['MODULE', 'util.clw', 3, false],
            ['MODULE', 'cls.clw', 6, true],
        ]);
    });

    test('MEMBER counts only as the first statement; comments are ignored', () => {
        const refs = scanReferences(src(
            "! MEMBER('not.clw')",
            "  PROGRAM",
            "  MEMBER('late.clw')",
            "  INCLUDE('x.inc') ! INCLUDE('y.inc')",
        ));
        assert.deepStrictEqual(refs.map(r => r.target), ['x.inc']);
    });

    test('references inside OMIT and COMPILE blocks are conditional', () => {
        const refs = scanReferences(src(
            "  OMIT('***')",
            "  INCLUDE('old.inc')",
            "  ***",
            "  COMPILE('!end', _C60_)",
            "  INCLUDE('c60.inc')",
            "  !end",
            "  INCLUDE('always.inc')",
        ));
        assert.deepStrictEqual(refs.map(r => [r.target, r.conditional]), [
            ['old.inc', true], ['c60.inc', true], ['always.inc', false],
        ]);
    });

    test('a CLASS MODULE carries its LINK and DLL attributes, across continuation lines', () => {
        const refs = scanReferences(src(
            "Err CLASS,TYPE,IMPLEMENTS(ErrorLogInterface),|",
            "      MODULE('ABERROR.CLW'),LINK('ABERROR.CLW',_ABCLinkMode_), |",
            "      DLL(_ABCDllMode_)",
            "Usage LONG",
            "  END",
            "Fe CLASS(),TYPE,MODULE('fe.clw')",
            "  END",
            "Lib CLASS,MODULE('x.clw'),LINK('xlib.lib')",
            "  END",
        ));
        assert.deepStrictEqual(refs.map(r => [r.target, r.line, r.link, r.dll]), [
            ['ABERROR.CLW', 1, 'ABERROR.CLW', true],
            ['fe.clw', 5, undefined, false],
            ['x.clw', 7, 'xlib.lib', false],
        ]);
    });

    test('a MAP MODULE is marked DLL when its prototypes are', () => {
        const refs = scanReferences(src(
            "  MAP",
            "    MODULE('STDFuncs')",
            "Func50 PROCEDURE(SREAL),REAL,PASCAL,DLL(dll_mode)",
            "    END",
            "    MODULE('local.clw')",
            "Local PROCEDURE",
            "    END",
            "  END",
        ));
        assert.deepStrictEqual(refs.map(r => [r.target, r.dll]), [['STDFuncs', true], ['local.clw', false]]);
    });

    test('categories: INCLUDE missing, MEMBER, every MODULE informational, conditional; binaries ignored', () => {
        const files: Record<string, string> = {
            'c:/app/main.clw': src(
                "  MEMBER('noprog')",
                "  INCLUDE('found.inc')",
                "  INCLUDE('gone.inc')",
                "  MAP",
                "    MODULE('Windows API')",
                "    END",
                "    MODULE('win32.lib')",
                "    END",
                "    MODULE('lost.clw')",
                "    END",
                "  END",
                "Fe CLASS,MODULE('fe.clw')",
                "  END",
                "  OMIT('**')",
                "  INCLUDE('maybe.inc')",
                "  **",
            ),
        };
        const report = unresolvedReferences(Object.keys(files), f => files[f], t => t === 'found.inc' ? 'c:/app/found.inc' : null);
        assert.deepStrictEqual(report.map(e => [e.target, e.line, e.category]), [
            ['noprog', 0, 'member'],
            ['gone.inc', 2, 'missing'],
            ['Windows API', 4, 'module'],
            ['lost.clw', 8, 'module'], // even with an extension: "any unique identifier"
            ['fe.clw', 11, 'module'],
            ['maybe.inc', 14, 'conditional'],
        ]);
        assert.strictEqual(report[0].file, 'c:/app/main.clw');
    });

    test('an unreadable file is skipped, not fatal', () => {
        assert.deepStrictEqual(unresolvedReferences(['c:/x.clw'], () => null, () => null), []);
    });
});
