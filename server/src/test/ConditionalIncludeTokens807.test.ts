import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from '../utils/TokenHelper';
import { DocumentLinkProvider } from '../providers/DocumentLinkProvider';

/**
 * #807 — the token path: an INCLUDE in a COMPILE/OMIT block decided not to compile gets no
 * referencedFile, so the walkers that follow INCLUDE tokens (the include chains, the file graph's
 * token path, completion, the MAP checks) pass it by, and it is flagged for those that match the
 * INCLUDE keyword and its string instead. It keeps its file name for navigation (inactiveFile).
 * TokenCache decides, where the file's path is known; reading an INCLUDEd file's EQUATEs is tested
 * in ConditionalIncludes807.
 */
let n = 0;
const INCLUDE = (t: { type: TokenType; value: string }) => t.type === TokenType.Directive && t.value.toUpperCase() === 'INCLUDE';
const show = (tokens: { type: TokenType; value: string; line: number; referencedFile?: string; inactiveFile?: string; inactiveByCondition?: boolean }[]) =>
    tokens.filter(INCLUDE).map(t => `${t.line}:${t.referencedFile ?? '-'}:${t.inactiveByCondition ? `off(${t.inactiveFile})` : 'on'}`);
const open = (lines: string[], uri = `file:///c%3A/t807/tok-${++n}.clw`, version = 1) =>
    TokenCache.getInstance().getTokens(TextDocument.create(uri, 'clarion', version, lines.join('\r\n')));

const VERSIONED = (ver: number) => [
    '  MEMBER()',
    `LibXL:Version  EQUATE(${ver})`,
    "  COMPILE ('###', LibXL:Version = 411)",
    "     INCLUDE('LibXL.411.INT'),ONCE",
    '! ###',
    "  COMPILE ('###', LibXL:Version = 520)",
    "     INCLUDE('LibXL.520.INT'),ONCE",
    '! ###',
];

suite('#807 — INCLUDE tokens in a block that will not compile', () => {
    test('the version EQUATE in the file decides; the other version\'s INCLUDE keeps its name for navigation only', () => {
        assert.deepStrictEqual(show(open(VERSIONED(520))), ['3:-:off(LibXL.411.INT)', '6:LibXL.520.INT:on']);
    });

    test('an unconditional OMIT drops its INCLUDE; an undecided block keeps it', () => {
        assert.deepStrictEqual(show(open([
            '  MEMBER()',
            "  OMIT('**')",
            "  INCLUDE('Gone.inc')",
            '**',
            "  COMPILE('**', Somewhere:Else)",
            "  INCLUDE('Kept.inc')",
            '**',
        ])), ['2:-:off(Gone.inc)', '5:Kept.inc:on']);
    });

    // The reviews: the flag was only ever set, so after an edit (incremental re-tokenize) the INCLUDE
    // that compiles again stayed out of the walk.
    test('an edit that makes the other version compile brings its INCLUDE back', () => {
        const uri = `file:///c%3A/t807/edit-${++n}.clw`;
        assert.deepStrictEqual(show(open(VERSIONED(520), uri, 1)), ['3:-:off(LibXL.411.INT)', '6:LibXL.520.INT:on']);
        assert.deepStrictEqual(show(open(VERSIONED(411), uri, 2)), ['3:LibXL.411.INT:on', '6:-:off(LibXL.520.INT)']);
    });

    test('a closed file: the version EQUATE is read from the INCLUDE beside it, and a change to it is seen', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok807-'));
        try {
            const ver = path.join(dir, 'LibXLVer.INC');
            fs.writeFileSync(ver, 'LibXL:Version  EQUATE(520)\r\n');
            const file = path.join(dir, 'LibXL.INC');
            fs.writeFileSync(file, [
                "  INCLUDE('LibXLVer.INC'),ONCE",
                "  COMPILE ('###', LibXL:Version = 411)",
                "     INCLUDE('LibXL.411.INT'),ONCE",
                '! ###',
                "  COMPILE ('###', LibXL:Version = 520)",
                "     INCLUDE('LibXL.520.INT'),ONCE",
                '! ###',
            ].join('\r\n'));
            const uri = pathToFileURL(file).toString();
            assert.deepStrictEqual(show(TokenCache.getInstance().getTokensForClosedFile(uri)),
                ['0:LibXLVer.INC:on', '2:-:off(LibXL.411.INT)', '5:LibXL.520.INT:on']);
            // Only the version file changes; the includer keeps its time.
            fs.writeFileSync(ver, 'LibXL:Version  EQUATE(411)\r\n');
            const later = new Date(Date.now() + 5000);
            fs.utimesSync(ver, later, later);
            assert.deepStrictEqual(show(TokenCache.getInstance().getTokensForClosedFile(uri)),
                ['0:LibXLVer.INC:on', '2:LibXL.411.INT:on', '5:-:off(LibXL.520.INT)']);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('an open document is decided again when its version file changes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok807o-'));
        try {
            const ver = path.join(dir, 'LibXLVer.INC');
            fs.writeFileSync(ver, 'LibXL:Version  EQUATE(520)\r\n');
            const file = path.join(dir, 'Main.clw');
            const lines = [
                '  MEMBER()',
                "  INCLUDE('LibXLVer.INC'),ONCE",
                "  COMPILE ('###', LibXL:Version = 411)",
                "     INCLUDE('LibXL.411.INT'),ONCE",
                '! ###',
            ];
            const uri = pathToFileURL(file).toString();
            assert.deepStrictEqual(show(open(lines, uri, 1)), ['1:LibXLVer.INC:on', '3:-:off(LibXL.411.INT)']);
            fs.writeFileSync(ver, 'LibXL:Version  EQUATE(411)\r\n');
            const later = new Date(Date.now() + 5000);
            fs.utimesSync(ver, later, later);
            assert.deepStrictEqual(show(open(lines, uri, 1)), ['1:LibXLVer.INC:on', '3:LibXL.411.INT:on']);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    // The bug hunt: F12, hover and Ctrl+click on the file name of an INCLUDE in an inactive block
    // (every plain OMIT('***') too) stopped working when it lost referencedFile.
    test('F12 and hover still find the file name of an INCLUDE that is not followed, and its SECTION', () => {
        const tokens = open([
            '  MEMBER()',
            "  OMIT('**')",
            "  INCLUDE('Gone.inc','Part'),ONCE",
            '**',
        ]);
        const fileArg = TokenHelper.getFileRefArgStringToken(tokens, 2, 13);
        assert.strictEqual(fileArg?.value, "'Gone.inc'");
        const section = TokenHelper.getIncludeSectionArgStringToken(tokens, 2, 25);
        assert.deepStrictEqual(section && [section.section.value, section.includeFile], ["'Part'", 'Gone.inc']);
    });

    test('Ctrl+click: a document link to the file of an INCLUDE that is not followed', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnk807-'));
        try {
            fs.writeFileSync(path.join(dir, 'Gone.inc'), '! gone\r\n');
            const file = path.join(dir, 'Main.clw');
            const text = ['  MEMBER()', "  OMIT('**')", "  INCLUDE('Gone.inc'),ONCE", '**'].join('\r\n');
            fs.writeFileSync(file, text);
            const doc = TextDocument.create(pathToFileURL(file).toString(), 'clarion', 1, text);
            TokenCache.getInstance().getTokens(doc);
            const links = new DocumentLinkProvider().provideDocumentLinks(doc);
            const link = links.find(l => l.range.start.line === 2);
            assert.ok(link, JSON.stringify(links));
            assert.match(decodeURIComponent(String(link!.target)).toLowerCase(), /gone\.inc$/);
            assert.strictEqual(text.split('\r\n')[2].slice(link!.range.start.character, link!.range.end.character), "'Gone.inc'");
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('no OMIT or COMPILE: every INCLUDE is followed, as before', () => {
        assert.deepStrictEqual(show(open(['  MEMBER()', "  INCLUDE('A.inc')"])), ['1:A.inc:on']);
    });
});
