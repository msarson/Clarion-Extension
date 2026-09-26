import * as assert from 'assert';
import { scanReferences, unresolvedReferences } from '../utils/UnresolvedReferences';

/**
 * #687 (experimental) — a report of the file references that do not resolve. The graph drops an
 * unresolved INCLUDE / MEMBER / MODULE target silently, so the report rescans the graph's files and
 * asks the same resolver.
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

    test('classifies misses: missing, library-like MODULE name, conditional; binaries ignored', () => {
        const files: Record<string, string> = {
            'c:/app/main.clw': src(
                "  PROGRAM",
                "  INCLUDE('found.inc')",
                "  INCLUDE('gone.inc')",
                "  MAP",
                "    MODULE('Windows API')",
                "    END",
                "    MODULE('win32.lib')",
                "    END",
                "    MODULE('lost')",
                "    END",
                "  END",
                "Lib CLASS,MODULE('Some Class Library')",
                "  OMIT('**')",
                "  INCLUDE('maybe.inc')",
                "  **",
            ),
        };
        const report = unresolvedReferences(Object.keys(files), f => files[f], t => t === 'found.inc' ? 'c:/app/found.inc' : null);
        assert.deepStrictEqual(report.map(e => [e.target, e.line, e.category]), [
            ['gone.inc', 2, 'missing'],
            ['Windows API', 4, 'library'],
            ['lost', 8, 'library'], // no extension: lost.clw, or a library label - cannot tell
            ['Some Class Library', 11, 'library'], // a class's MODULE with no extension too
            ['maybe.inc', 13, 'conditional'],
        ]);
        assert.strictEqual(report[0].file, 'c:/app/main.clw');
    });

    test('an unreadable file is skipped, not fatal', () => {
        assert.deepStrictEqual(unresolvedReferences(['c:/x.clw'], () => null, () => null), []);
    });
});
