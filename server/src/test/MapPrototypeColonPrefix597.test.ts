import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { resolvePrefixedName } from '../utils/PrefixChain';

/**
 * #597 — a colon-carrying shorthand MAP prototype, written indented as prototypes
 * actually are, is either mislabelled or not recognised at all.
 *
 * At column 0 a prefixed name tokenizes as one `Label` carrying the whole thing and
 * everything downstream works. Indented, the tokenizer's PREFIX:Field pattern takes
 * over — and that pattern captures EXACTLY ONE COLON. That single detail produces
 * every failure here, and it is why the old type tests caught only some of the
 * shapes:
 *
 *   WIN:ShowExits      -> StructurePrefix("WIN:ShowExits")                   one token
 *   reg:WIN:ShowExits  -> StructurePrefix("reg:WIN") ':' Function("ShowExits")  three
 *   a:b:c:d            -> StructurePrefix("a:b")     ':' StructurePrefix("c:d") three
 *   LONGPREFIX:Name    -> Variable("LONGPREFIX")     ':' Attribute("Name")      three
 *
 * `processShorthandProcedures` accepted only Function | Variable | Label, and its
 * bare-declaration branch additionally required the name to START its line. So the
 * one-token shapes were skipped on type, and the three-token shapes were either
 * labelled with the tail alone (the prefix silently dropped) or rejected because a
 * prefix chain sat in front of the name.
 *
 * Every consumer that matches a call-site word against a declaration's `label` misses
 * as a result, because getWordRangeAtPosition keeps the colons at the call site: F12,
 * hover, workspace/symbol and the #517 unresolved-call check.
 *
 * Reported inside #593 by @bill-atchison against a prefixed 38-project solution.
 */

const INDENT = '                        ';

/** MapProcedure labels of a MAP built from `body`, in source order. */
function prototypeLabels(body: string[]): string[] {
    return labelsOf([
        '                      MEMBER()',
        '',
        '                      MAP',
        ...body.map(l => INDENT + l),
        '                      END',
        ''
    ]);
}

function labelsOf(lines: string[]): string[] {
    return new ClarionTokenizer(lines.join('\n')).tokenize()
        .filter(t => t.subType === TokenType.MapProcedure)
        .map(t => t.label ?? t.value);
}

suite('#597 — colon-prefixed shorthand MAP prototypes', () => {

    suite('with a parameter list', () => {

        test('one colon: the whole name is the label, not nothing', () => {
            assert.deepStrictEqual(prototypeLabels(['WIN:ShowExits()']), ['WIN:ShowExits']);
        });

        test('two colons: the prefix is kept, not stripped to the tail', () => {
            assert.deepStrictEqual(prototypeLabels(['reg:WIN:ShowExits()']), ['reg:WIN:ShowExits']);
        });

        test('three colons, where both halves tokenize as StructurePrefix', () => {
            assert.deepStrictEqual(prototypeLabels(['a:b:c:d()']), ['a:b:c:d']);
        });

        test('a prefix too long for the PREFIX:Field pattern still joins', () => {
            // LONGPREFIX exceeds the pattern's prefix cap, so this splits as
            // Variable ':' Attribute — and the tail is the NAME attribute keyword,
            // which the attribute guard rejected. Behind a prefix chain a token
            // cannot be an attribute, so it is a name fragment.
            assert.deepStrictEqual(prototypeLabels(['LONGPREFIX:Name()']), ['LONGPREFIX:Name']);
        });

        test('parameters and a return type do not disturb the label', () => {
            assert.deepStrictEqual(
                prototypeLabels(['reg:WIN:Plain(LONG pX),LONG']), ['reg:WIN:Plain']);
        });
    });

    suite('bare, with no parameter list', () => {

        test('one colon', () => {
            assert.deepStrictEqual(prototypeLabels(['WIN:BareOne']), ['WIN:BareOne']);
        });

        test('two colons', () => {
            assert.deepStrictEqual(prototypeLabels(['reg:WIN:BareTwo']), ['reg:WIN:BareTwo']);
        });

        test('an attribute tail continues the entry, as #466 established', () => {
            assert.deepStrictEqual(prototypeLabels(['WIN:Proc,LONG']), ['WIN:Proc']);
        });
    });

    suite('shapes that already worked keep working', () => {

        test('unprefixed, with and without a parameter list', () => {
            assert.deepStrictEqual(
                prototypeLabels(['PlainProc()', 'PlainBare']), ['PlainProc', 'PlainBare']);
        });

        test('the explicit-keyword form at column 0', () => {
            assert.deepStrictEqual(labelsOf([
                '                      MEMBER()',
                '',
                '                      MAP',
                '                        MODULE(\'regItem.clw\')',
                'reg:ITEM:CashOutExists  FUNCTION(),LONG',
                '                        END',
                '                      END',
                ''
            ]), ['reg:ITEM:CashOutExists']);
        });

        test('a MODULE block is not a prototype', () => {
            assert.deepStrictEqual(
                prototypeLabels(['MODULE(\'x.clw\')', '  WIN:Inner()', 'END']),
                ['WIN:Inner']);
        });
    });

    suite('guards — a prefixed name that is not a prototype', () => {

        test('a prefixed TYPE ARGUMENT in a parameter list is not a second prototype', () => {
            // `CFG:Type` is a StructurePrefix inside the parens. Only the name that
            // starts the line is a prototype.
            assert.deepStrictEqual(
                prototypeLabels(['BuildIt(GROUP(CFG:Type) pG),LONG']), ['BuildIt']);
        });

        test('and the same line with a prefixed prototype name yields exactly one', () => {
            assert.deepStrictEqual(
                prototypeLabels(['WIN:BuildIt(GROUP(CFG:Type) pG),LONG']), ['WIN:BuildIt']);
        });

        test('INCLUDE inside a MAP is not a prototype', () => {
            assert.deepStrictEqual(
                prototypeLabels(['INCLUDE(\'regWindow.inc\'),ONCE', 'WIN:After()']),
                ['WIN:After']);
        });
    });

    suite('resolvePrefixedName', () => {

        /** Tokens of a single line of MAP body. */
        function tokensOf(line: string) {
            return new ClarionTokenizer([
                '                      MEMBER()',
                '',
                '                      MAP',
                INDENT + line,
                '                      END',
                ''
            ].join('\n')).tokenize();
        }

        test('a token with no chain in front of it resolves to itself', () => {
            const tokens = tokensOf('PlainProc()');
            const i = tokens.findIndex(t => t.value === 'PlainProc');
            const r = resolvePrefixedName(tokens, i);
            assert.strictEqual(r.name, 'PlainProc');
            assert.strictEqual(r.startIndex, i);
        });

        test('a single StructurePrefix token carries its own whole name', () => {
            const tokens = tokensOf('WIN:ShowExits()');
            const i = tokens.findIndex(t => t.value === 'WIN:ShowExits');
            assert.strictEqual(resolvePrefixedName(tokens, i).name, 'WIN:ShowExits');
        });

        test('a chain is joined, and startIndex points at its first token', () => {
            const tokens = tokensOf('reg:WIN:ShowExits()');
            const i = tokens.findIndex(t => t.value === 'ShowExits');
            const r = resolvePrefixedName(tokens, i);
            assert.strictEqual(r.name, 'reg:WIN:ShowExits');
            assert.strictEqual(tokens[r.startIndex].value, 'reg:WIN');
            assert.strictEqual(r.start, tokens[r.startIndex].start);
        });

        test('a chain does not cross a line boundary', () => {
            const tokens = new ClarionTokenizer([
                '                      MEMBER()',
                '',
                '                      MAP',
                INDENT + 'reg:WIN',
                INDENT + 'ShowExits()',
                '                      END',
                ''
            ].join('\n')).tokenize();
            const i = tokens.findIndex(t => t.value === 'ShowExits');
            assert.strictEqual(resolvePrefixedName(tokens, i).name, 'ShowExits');
        });
    });
});
