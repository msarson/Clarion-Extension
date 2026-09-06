import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #399 — the Clarion 12 Unicode surface in `syntaxes/clarion.tmLanguage.json`.
 *
 * These assert the grammar's own regexes, not a rendered TextMate tokenization:
 * the repo has no `vscode-textmate` dependency, so there is no engine to drive.
 * That means this pins WHAT the patterns match, not how they interact with rule
 * ordering or scope nesting — a real regression in precedence would slip past.
 * It is still worth having: every failure mode this file catches (a name dropped
 * from an alternation, a broken literal prefix, a lost code-point escape) is one
 * a silent edit to a large JSON file could easily introduce.
 *
 * Compiler-verified surface. `TOANSI` and `TOUNICODE` are included because
 * `libsrc\win\builtins.clw` on Clarion 12.0.14204 declares them as real
 * built-ins:
 *
 *     TOANSI(STRING expr, UNSIGNED cp=-1),STRING,NAME('Cla$StackTOANSI')
 *     TOUNICODE(STRING expr, UNSIGNED cp=-1),STRING,NAME('Cla$StackTOUNICODE')
 *     UVAL(STRING str, UNSIGNED pos=1),LONG,NAME('Cla$StackUVAL')
 *
 * The Discourse grammar that SoftVelocity and this project share
 * (discourse-highlightjs-clarion) omits the first two — checked against
 * `builtins.clw` rather than mirrored, so this grammar is the more complete of
 * the pair.
 */

function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'syntaxes', 'clarion.tmLanguage.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('could not locate the repo root from ' + __dirname);
}

interface Rule { match?: string; begin?: string; end?: string; name?: string; patterns?: Rule[]; }

suite('Clarion 12 Unicode syntax highlighting (#399)', () => {

    const grammar = JSON.parse(
        fs.readFileSync(path.join(repoRoot(), 'syntaxes', 'clarion.tmLanguage.json'), 'utf8')
    ) as { repository: Record<string, Rule> };

    const firstMatch = (key: string, text: string): string | null => {
        const rule = grammar.repository[key];
        assert.ok(rule?.match, `repository.${key} should be a match rule`);
        const m = new RegExp(rule.match!).exec(text);
        return m ? m[0] : null;
    };

    // ---- #399 acceptance cases ----

    test('USTRING scopes as a type', () => {
        assert.strictEqual(firstMatch('dataTypes', 'USTRING(24)'), 'USTRING');
    });

    test('UNICODE scopes as an attribute, on REPORT and on BLOB', () => {
        assert.strictEqual(firstMatch('controlAttributes', 'REPORT,UNICODE'), 'UNICODE');
        assert.strictEqual(firstMatch('controlAttributes', ',UNICODE'), 'UNICODE');
    });

    test('the Unicode built-ins scope as functions', () => {
        for (const fn of ['UCHR', 'UVAL', 'TOANSI', 'TOUNICODE']) {
            assert.strictEqual(firstMatch('builtInFunctions', fn + '(x)'), fn,
                `${fn} is declared in builtins.clw and must highlight as a built-in`);
        }
    });

    // ---- U'...' literals ----

    const unicodeLiteral = (): Rule => {
        const variants = grammar.repository.strings.patterns!;
        const u = variants.find(v => v.name === 'string.quoted.single.unicode.clarion');
        assert.ok(u, 'the strings rule must carry a Unicode literal variant');
        return u!;
    };

    test('the Unicode literal variant is tried BEFORE the plain one', () => {
        // Order is load-bearing: TextMate takes the first variant that matches at a
        // position. With the plain rule first it would claim the quote and leave the
        // `U` outside the literal entirely.
        const names = grammar.repository.strings.patterns!.map(v => v.name);
        assert.strictEqual(names[0], 'string.quoted.single.unicode.clarion',
            `plain-string-first would break the U prefix; got order: ${names.join(', ')}`);
    });

    test("U'...' and u'...' both open a Unicode literal", () => {
        const begin = new RegExp(unicodeLiteral().begin!);
        assert.ok(begin.test("x = U'caf'"), 'uppercase prefix');
        assert.ok(begin.test("x = u'abc'"), 'lowercase prefix');
    });

    test('a trailing U of an identifier does not start a literal', () => {
        // The negative lookbehind. Without it `MyU'abc'` reads as a Unicode literal
        // and the highlighting runs away from the real string boundary.
        const begin = new RegExp(unicodeLiteral().begin!);
        assert.ok(!begin.test("MyU'abc'"), 'identifier-adjacent U must not be a prefix');
        assert.ok(!begin.test("A1U'abc'"), 'digit-adjacent U must not be a prefix');
    });

    test('embedded code points are escapes inside the literal', () => {
        const escapes = unicodeLiteral().patterns ?? [];
        const cp = escapes.find(e => e.name === 'constant.character.escape.unicode.clarion');
        assert.ok(cp, 'the literal must scope embedded code points');
        const re = new RegExp(cp!.match!);
        // Decimal, and hex with the Clarion `h` suffix, including astral planes.
        for (const s of ['<937>', '<0D83Dh>', '<1F4A9h>']) {
            assert.ok(re.test(s), `${s} should scope as a code-point escape`);
        }
    });

    test("doubled-quote escaping still works inside a Unicode literal", () => {
        const escapes = unicodeLiteral().patterns ?? [];
        assert.ok(escapes.some(e => e.match === "''"),
            "'' escaping must survive in the Unicode variant, not just the plain one");
    });

    // ---- regression guard ----

    test('plain ANSI strings are unaffected', () => {
        const plain = grammar.repository.strings.patterns!
            .find(v => v.name === 'string.quoted.single.clarion');
        assert.ok(plain, 'the original plain-string variant must still exist');
        assert.ok(new RegExp(plain!.begin!).test("x = 'hello'"));
        assert.ok((plain!.patterns ?? []).some(e => e.match === "''"),
            'doubled-quote escaping must be preserved');
    });

    test('existing type and attribute names were not disturbed', () => {
        // Cheap guard against an alternation edit eating a neighbour.
        assert.strictEqual(firstMatch('dataTypes', 'CSTRING(2)'), 'CSTRING');
        assert.strictEqual(firstMatch('dataTypes', 'STRING(2)'), 'STRING');
        assert.strictEqual(firstMatch('builtInFunctions', 'CHR(65)'), 'CHR');
        assert.strictEqual(firstMatch('controlAttributes', ',RTF'), 'RTF');
    });
});
