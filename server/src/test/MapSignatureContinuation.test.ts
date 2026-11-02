import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateMissingMapDeclarations, validateMissingImplementations } from '../providers/diagnostics/MapDeclarationDiagnostics';

/**
 * The MAP signature checks compared the FIRST line of a prototype with the FIRST line of
 * its implementation. A signature continued with `|` has no closing `)` on that line, so
 * its parameter list read as empty:
 *
 *   - continued on one side only: a false `map-signature-mismatch` (5 parameters vs 0);
 *   - continued on both sides: always a "match", so a real mismatch went unreported.
 *
 * The same first-line read let a `,DLL` attribute on a continuation line go unseen, and
 * `missing-map-implementation` reported the external prototype as unimplemented.
 */

let tmpRoot: string;

function toUri(file: string): string {
    return 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

/** Writes parent.clw (MAP lines) and member.clw (body lines); returns both documents. */
function setupFiles(mapLines: string[], memberBody: string[], eol = '\n') {
    const parent = [
        '  PROGRAM',
        '',
        '  MAP',
        "    MODULE('member.clw')",
        ...mapLines,
        '    END',
        '  END',
        '',
        '  CODE',
        '  RETURN',
        ''
    ].join(eol);
    const member = ["  MEMBER('parent.clw')", '', ...memberBody, ''].join(eol);
    const parentFile = path.join(tmpRoot, 'parent.clw');
    const memberFile = path.join(tmpRoot, 'member.clw');
    fs.writeFileSync(parentFile, parent);
    fs.writeFileSync(memberFile, member);
    return {
        parent: TextDocument.create(toUri(parentFile), 'clarion', 1, parent),
        member: TextDocument.create(toUri(memberFile), 'clarion', 1, member)
    };
}

async function memberSide(mapLines: string[], memberBody: string[], eol = '\n'): Promise<string[]> {
    const { member } = setupFiles(mapLines, memberBody, eol);
    const diags = await validateMissingMapDeclarations(new ClarionTokenizer(member.getText()).tokenize(), member);
    return (diags ?? []).map(d => String(d.code));
}

async function parentSide(mapLines: string[], memberBody: string[]): Promise<string[]> {
    const { parent } = setupFiles(mapLines, memberBody);
    const diags = await validateMissingImplementations(new ClarionTokenizer(parent.getText()).tokenize(), parent);
    return (diags ?? []).map(d => String(d.code));
}

const CONTINUED_DECL = [
    'MyProc   PROCEDURE(*SomeClass pObj, STRING pName, STRING pValue, |',
    '                   *CSTRING pOut),LONG  ! a comment after the closing line'
];
const ONE_LINE_DECL = ['MyProc   PROCEDURE(*SomeClass pObj, STRING pName, STRING pValue, *CSTRING pOut),LONG'];
const ONE_LINE_IMPL = [
    'MyProc PROCEDURE(*SomeClass pObj, STRING pName, STRING pValue, *CSTRING pOut)',
    '  CODE',
    '  RETURN 0'
];
const CONTINUED_IMPL = [
    'MyProc PROCEDURE(*SomeClass pObj, STRING pName, |  ! comment before the break',
    '                 STRING pValue, *CSTRING pOut)',
    '  CODE',
    '  RETURN 0'
];

suite('MAP signature checks read |-continued signatures whole', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'map-sig-cont-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('continued MAP prototype, one-line implementation: no mismatch', async () => {
        const codes = await memberSide(CONTINUED_DECL, ONE_LINE_IMPL);
        assert.deepStrictEqual(codes, []);
    });

    test('continued MAP prototype, one-line implementation, CRLF: no mismatch', async () => {
        const codes = await memberSide(CONTINUED_DECL, ONE_LINE_IMPL, '\r\n');
        assert.deepStrictEqual(codes, []);
    });

    test('one-line MAP prototype, continued implementation: no mismatch', async () => {
        const codes = await memberSide(ONE_LINE_DECL, CONTINUED_IMPL);
        assert.deepStrictEqual(codes, []);
    });

    test('both continued, same parameters: no mismatch', async () => {
        const codes = await memberSide(CONTINUED_DECL, CONTINUED_IMPL);
        assert.deepStrictEqual(codes, []);
    });

    test('both continued, a parameter differs after the break: mismatch reported', async () => {
        const impl = [
            'MyProc PROCEDURE(*SomeClass pObj, STRING pName, |',
            '                 STRING pValue, LONG pOut)',
            '  CODE',
            '  RETURN 0'
        ];
        const codes = await memberSide(CONTINUED_DECL, impl);
        assert.deepStrictEqual(codes, ['map-signature-mismatch']);
    });

    test('self-declared in the member\'s own MAP, continued prototype: no mismatch', async () => {
        const member = [
            "  MEMBER('parent.clw')",
            '',
            '  MAP',
            "    MODULE('member.clw')",
            ...CONTINUED_DECL,
            '    END',
            '  END',
            '',
            ...ONE_LINE_IMPL,
            ''
        ].join('\n');
        fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), '  PROGRAM\n  MAP\n  END\n  CODE\n');
        const file = path.join(tmpRoot, 'member.clw');
        fs.writeFileSync(file, member);
        const doc = TextDocument.create(toUri(file), 'clarion', 1, member);
        const diags = await validateMissingMapDeclarations(new ClarionTokenizer(member).tokenize(), doc);
        assert.deepStrictEqual((diags ?? []).map(d => String(d.code)), []);
    });

    test('PROGRAM side: continued MAP prototype, one-line implementation: no mismatch', async () => {
        const codes = await parentSide(CONTINUED_DECL, ONE_LINE_IMPL);
        assert.deepStrictEqual(codes, []);
    });

    test('PROGRAM side: both continued, a parameter differs: mismatch reported', async () => {
        const impl = [
            'MyProc PROCEDURE(*SomeClass pObj, STRING pName, |',
            '                 STRING pValue, LONG pOut)',
            '  CODE',
            '  RETURN 0'
        ];
        const codes = await parentSide(CONTINUED_DECL, impl);
        assert.deepStrictEqual(codes, ['map-impl-signature-mismatch']);
    });

    test('PROGRAM side: ,DLL on a continuation line is an external prototype, not unimplemented', async () => {
        const decl = [
            'ExternalProc   PROCEDURE(STRING pName, |',
            '                         LONG pFlags),LONG,DLL(1)'
        ];
        const codes = await parentSide(decl, ONE_LINE_IMPL);
        assert.deepStrictEqual(codes, []);
    });
});
