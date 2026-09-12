import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateMissingMapDeclarations } from '../providers/diagnostics/MapDeclarationDiagnostics';

/**
 * Issues #466 and #477 — which MAP prototype shapes are recognised as declarations.
 * `missing-map-declaration` false-positived on every shape that was not.
 *
 * The grammar is the Language Reference's, not a guess (prototype_syntax.htm). Two
 * forms exist; the second is the one at issue:
 *
 *   name PROCEDURE [(parameter list)] [,return type] [,calling convention] [,RAW]
 *        [,NAME( )] [,TYPE] [,DLL( )] [,PROC] [,PRIVATE] [,VIRTUAL] ...
 *   name          [(parameter list)] [,return type] [,calling convention] [,RAW]
 *                 [,NAME( )] [,TYPE] [,DLL( )] [,PROC] [,PRIVATE]
 *
 * "The keyword PROCEDURE is optional in a MAP structure." So the name may stand alone,
 * and everything after it — parentheses included — is optional and repeatable.
 *
 * #466: #463 recognised the fully-bare name by requiring it to be ALONE on its line.
 *       That excluded the whole attribute tail: `MyProc,LONG`, `MyProc,NAME('_x')`,
 *       `Func46(*CSTRING),REAL,C,RAW`. A following comma now continues the entry.
 *
 * #477: two sibling patterns tested `startsWith("map")` / `startsWith("module")` to
 *       skip the keywords, and so skipped every procedure whose NAME merely begins
 *       with those letters — MapFields, Mapper, ModuleList. That one is nastier than
 *       #466: no edit to the MAP could silence it, because the name was the problem.
 *
 * The shapes below are compiler-verified on Clarion 10.0.12567: the implementable
 * subset builds and links clean with these exact prototypes. The non-implementable
 * ones (TYPE, RAW, C, PASCAL, DLL) prototype external or passed-as-parameter
 * procedures — they must still be RECOGNISED as declarations, which is what is
 * asserted here.
 */

let tmpRoot: string;

/** Declares `proto` in a parent MAP, implements `name` in the MEMBER, returns the diagnostics. */
async function diagnose(proto: string, name: string, implParams = ''): Promise<string[]> {
    const parent = [
        '  PROGRAM',
        '',
        '  MAP',
        "    MODULE('member.clw')",
        '      ' + proto,
        '    END',
        '  END',
        '',
        '  CODE',
        '  RETURN',
        ''
    ].join('\n');
    fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), parent);

    const member = [
        "  MEMBER('parent.clw')",
        '',
        name + ' PROCEDURE' + implParams,
        '  CODE',
        '  RETURN',
        ''
    ].join('\n');
    const file = path.join(tmpRoot, 'member.clw');
    fs.writeFileSync(file, member);

    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, member);
    const diags = await validateMissingMapDeclarations(new ClarionTokenizer(member).tokenize(), doc);
    return (diags ?? []).map(d => d.message);
}

suite('MAP prototype shapes (#466, #477)', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'map-proto-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    // ── #466: the keyword-less form, across the whole documented tail ─────────
    const KEYWORDLESS: Array<[string, string, string]> = [
        ['bare name',                 'P1',                          ''],
        ['empty parens',              'P2()',                        '()'],
        ['parameter list',            'P3(LONG)',                    '(LONG pVal)'],
        ['omittable parameter',       'P4(<*LONG>)',                 '(<*LONG pVal>)'],
        ['parameter default',         'P5(LONG=23)',                 '(LONG pVal)'],
        ['return type, NO parens',    'P6,LONG',                     ''],
        ['return type with parens',   'P7(),LONG',                   '()'],
        ['parameters and return',     'P8(LONG),LONG',               '(LONG pVal)'],
        ['calling convention C',      'P9,C',                        ''],
        ['calling convention PASCAL', 'P10,PASCAL',                  ''],
        ['RAW',                       'P11,RAW',                     ''],
        ['NAME()',                    "P12,NAME('_p12')",            ''],
        ['TYPE',                      'P13,TYPE',                    ''],
        ['DLL()',                     'P14,DLL(1)',                  ''],
        ['PROC',                      'P15,PROC',                    ''],
        ['PRIVATE',                   'P16,PRIVATE',                 ''],
        ['doc example Func46',        'P17(*CSTRING),REAL,C,RAW',    '(*CSTRING pS)'],
        ['doc example Func49',        "P18(SREAL),REAL,C,NAME('_x')", '(SREAL pR)'],
    ];

    for (const [label, proto, implParams] of KEYWORDLESS) {
        test(`#466 recognised: ${label} — ${proto}`, async () => {
            const name = proto.split(/[(, ]/)[0];
            const msgs = await diagnose(proto, name, implParams);
            assert.deepStrictEqual(msgs, [], `'${proto}' is a legal prototype and must be recognised`);
        });
    }

    // ── #477: the name is not the keyword ─────────────────────────────────────
    const PREFIXED: Array<[string, string, string]> = [
        ['Map-prefixed with parens',  'MapFoo(),LONG',   '()'],
        ['Map-prefixed bare',         'Mapper',          ''],
        ['Map-prefixed with attrs',   'MapRecord,LONG',  ''],
        ['Module-prefixed',           'ModuleList(),LONG', '()'],
        ['exactly MAP-cased name',    'MAPThing(),LONG', '()'],
    ];

    for (const [label, proto, implParams] of PREFIXED) {
        test(`#477 recognised: ${label} — ${proto}`, async () => {
            const name = proto.split(/[(, ]/)[0];
            const msgs = await diagnose(proto, name, implParams);
            assert.deepStrictEqual(msgs, [],
                `'${name}' merely starts with a keyword's letters; it is an ordinary procedure name`);
        });
    }

    // ── the guard that must NOT be relaxed ─────────────────────────────────────
    test('an undeclared procedure is still reported', async () => {
        const msgs = await diagnose('SomethingElse', 'NotDeclared');
        assert.strictEqual(msgs.length, 1,
            'a procedure with no prototype at all must still warn — or the fix is a mute');
        assert.ok(msgs[0].includes('NotDeclared'), `got: ${msgs[0]}`);
    });

    test('the MODULE and MAP keywords are still not treated as prototypes', async () => {
        // If MODULE('member.clw') were taken for a prototype named MODULE, an
        // implementation called MODULE would resolve — and the exact-match guard is
        // what stops that while still admitting ModuleList.
        const msgs = await diagnose('RealProc', 'MODULE');
        assert.strictEqual(msgs.length, 1, 'MODULE is a block keyword, never a declared procedure');
    });
});
