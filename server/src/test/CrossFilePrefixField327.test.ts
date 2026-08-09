import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #327 row 3 — cross-file PRE:Field agreement pin.
 *
 * Two independent stacks resolve a prefixed field declared in the MEMBER
 * parent: F12 reaches SymbolFinderService.findPrefixedField (via findSymbol);
 * hover reaches MemberLocatorService.findPrefixFieldTokenInChain (via
 * findInIncludesAndEquates). Same-file agreement is pinned in
 * HoverF12.VariableAgreement.test.ts; this pins the cross-file halves: a
 * GLO:Amount reference in a MEMBER module must resolve to the parent
 * PROGRAM's queue field on both surfaces.
 *
 * Disk fixture (not in-memory): both stacks read the MEMBER parent via the
 * token cache first and the filesystem on miss — the real user path.
 */

const PARENT_CONTENT =
    "  PROGRAM\n" +
    "GloQ     QUEUE,PRE(GLO)\n" +
    "Amount     LONG\n" +
    "         END\n" +
    "  MAP\n" +
    "  END\n" +
    "  CODE\n" +
    "  RETURN\n";

const MEMBER_CONTENT =
    "  MEMBER('parent.clw')\n" +
    "  MAP\n" +
    "  END\n" +
    "Child  PROCEDURE\n" +
    "  CODE\n" +
    "  GLO:Amount += 1\n" +
    "  RETURN\n";

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

function cursorOn(source: string, needle: string, offset = 0): Position {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) return { line: i, character: idx + offset };
    }
    throw new Error(`cursorOn: '${needle}' not found`);
}

suite('Cross-file PRE:Field hover/F12 agreement (#327)', () => {

    let tmpRoot: string;
    let memberUri: string;
    let memberDocText: string;
    const parentFieldLine = 2; // 0-based line of "Amount     LONG" in parent.clw

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xfile-prefix-327-'));
        fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), PARENT_CONTENT);
        const memberFile = path.join(tmpRoot, 'member.clw');
        fs.writeFileSync(memberFile, MEMBER_CONTENT);
        memberUri = toUri(memberFile);
        memberDocText = MEMBER_CONTENT;
    });

    teardown(() => {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('F12 on GLO:Amount in a MEMBER resolves the parent PROGRAM queue field', async () => {
        const doc = TextDocument.create(memberUri, 'clarion', 1, memberDocText);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(memberDocText, 'GLO:Amount', 5));
        assert.ok(result, 'F12 must resolve the cross-file prefixed field');
        const loc = (Array.isArray(result) ? result[0] : result) as Location;

        assert.ok(loc.uri.toLowerCase().endsWith('parent.clw'),
            `F12 must land in parent.clw, got ${loc.uri}`);
        assert.strictEqual(loc.range.start.line, parentFieldLine,
            `F12 must land on the Amount field (line ${parentFieldLine}), got ${loc.range.start.line}`);
    });

    test('hover on GLO:Amount in a MEMBER shows the parent PROGRAM queue field', async () => {
        const doc = TextDocument.create(memberUri, 'clarion', 1, memberDocText);
        const provider = new HoverProvider();

        const hover = await provider.provideHover(doc, cursorOn(memberDocText, 'GLO:Amount', 5));
        assert.ok(hover, 'hover must resolve the cross-file prefixed field');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');

        assert.ok(text.includes(`parent.clw:${parentFieldLine + 1}`),
            `hover must cite parent.clw:${parentFieldLine + 1} (the Amount field); got:\n${text}`);
    });
});
