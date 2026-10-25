import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * #807 — the token path: an INCLUDE in a COMPILE/OMIT block decided not to compile gets no
 * referencedFile, so the walkers that follow INCLUDE tokens (the include chains, the file graph's
 * token path, completion, the MAP checks) pass it by, and it is flagged for those that match the
 * INCLUDE keyword and its string instead. Reading an INCLUDEd file's EQUATEs is tested in
 * ConditionalIncludes807; here the switch is in the same file.
 */
const includes = (lines: string[]) => new ClarionTokenizer(lines.join('\r\n')).tokenize()
    .filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.type !== TokenType.Comment)
    .map(t => ({ line: t.line, file: t.referencedFile ?? null, inactive: !!t.inactiveByCondition }));

suite('#807 — INCLUDE tokens in a block that will not compile', () => {
    test('the version EQUATE in the file decides: the other version\'s INCLUDE is not followed', () => {
        assert.deepStrictEqual(includes([
            '  MEMBER()',
            'LibXL:Version  EQUATE(520)',
            "  COMPILE ('###', LibXL:Version = 411)",
            "     INCLUDE('LibXL.411.INT'),ONCE",
            '! ###',
            "  COMPILE ('###', LibXL:Version = 520)",
            "     INCLUDE('LibXL.520.INT'),ONCE",
            '! ###',
        ]), [
            { line: 3, file: null, inactive: true },
            { line: 6, file: 'LibXL.520.INT', inactive: false },
        ]);
    });

    test('an unconditional OMIT drops its INCLUDE; an undecided block keeps it', () => {
        assert.deepStrictEqual(includes([
            '  MEMBER()',
            "  OMIT('**')",
            "  INCLUDE('Gone.inc')",
            '**',
            "  COMPILE('**', Somewhere:Else)",
            "  INCLUDE('Kept.inc')",
            '**',
        ]), [
            { line: 2, file: null, inactive: true },
            { line: 5, file: 'Kept.inc', inactive: false },
        ]);
    });

    test('no OMIT or COMPILE: every INCLUDE is followed, as before', () => {
        assert.deepStrictEqual(includes(['  MEMBER()', "  INCLUDE('A.inc')"]), [{ line: 1, file: 'A.inc', inactive: false }]);
    });
});
