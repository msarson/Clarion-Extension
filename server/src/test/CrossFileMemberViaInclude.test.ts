import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * MEMBER hidden behind an INCLUDE shim (real-world project convention: swap which
 * PROGRAM a shared source tree belongs to by swapping one small generated file,
 * e.g. `INCLUDE('member.clw')` where member.clw contains the actual `MEMBER('parent')`
 * statement, rather than writing MEMBER directly in every member module).
 * TokenHelper.findMemberHeaderToken() only sees literal tokens in the file it's given,
 * so both MemberLocatorService (hover) and SymbolFinderService (F12) need to follow the
 * INCLUDE to find it — this pins that fix for both surfaces, mirroring
 * CrossFilePrefixField327's direct-MEMBER case.
 *
 * The walk is FIRST-STATEMENT-ONLY: MEMBER/PROGRAM must be the first statement of a
 * compiled module (only comments may precede it), so a shim INCLUDE is only legal as the
 * file's first statement, and the shim chain is followed one first-statement INCLUDE at a
 * time (bounded hops + cycle guard). A MEMBER behind any LATER include would not compile —
 * the 'does NOT resolve' test below pins that no all-includes sweep creeps back in (the
 * sweep was both a perf hazard on the miss-path and a correctness hazard).
 *
 * `MEMBER('parent')` deliberately omits the `.clw` extension — idiomatic Clarion (the
 * compiler infers it), and the exact shape that exposed a second bug: resolveFilePath /
 * resolveViaProjectRedirection's redirection lookup matches by extension mask, so an
 * extension-less name never matched and silently failed. A fixture using the (less
 * common in the wild, but what the earlier version of this test used)
 * `MEMBER('parent.clw')` form would never have caught that.
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

const SHIM_CONTENT =
    "  MEMBER('parent')\n";

const MEMBER_CONTENT =
    "  INCLUDE('shim.clw')\n" +
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

suite('Cross-file MEMBER-via-INCLUDE resolution', () => {

    let tmpRoot: string;
    let memberUri: string;
    let memberDocText: string;
    const parentFieldLine = 2; // 0-based line of "Amount     LONG" in parent.clw

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xfile-member-include-'));
        fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), PARENT_CONTENT);
        fs.writeFileSync(path.join(tmpRoot, 'shim.clw'), SHIM_CONTENT);
        const memberFile = path.join(tmpRoot, 'child.clw');
        fs.writeFileSync(memberFile, MEMBER_CONTENT);
        memberUri = toUri(memberFile);
        memberDocText = MEMBER_CONTENT;
    });

    teardown(() => {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('F12 on GLO:Amount resolves the parent PROGRAM queue field through the INCLUDE shim', async () => {
        const doc = TextDocument.create(memberUri, 'clarion', 1, memberDocText);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(memberDocText, 'GLO:Amount', 5));
        assert.ok(result, 'F12 must resolve the MEMBER hidden behind INCLUDE(\'shim.clw\')');
        const loc = (Array.isArray(result) ? result[0] : result) as Location;

        assert.ok(loc.uri.toLowerCase().endsWith('parent.clw'),
            `F12 must land in parent.clw, got ${loc.uri}`);
        assert.strictEqual(loc.range.start.line, parentFieldLine,
            `F12 must land on the Amount field (line ${parentFieldLine}), got ${loc.range.start.line}`);
    });

    test('hover on GLO:Amount shows the parent PROGRAM queue field through the INCLUDE shim', async () => {
        const doc = TextDocument.create(memberUri, 'clarion', 1, memberDocText);
        const provider = new HoverProvider();

        const hover = await provider.provideHover(doc, cursorOn(memberDocText, 'GLO:Amount', 5));
        assert.ok(hover, 'hover must resolve the MEMBER hidden behind INCLUDE(\'shim.clw\')');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');

        assert.ok(text.includes(`parent.clw:${parentFieldLine + 1}`),
            `hover must cite parent.clw:${parentFieldLine + 1} (the Amount field); got:\n${text}`);
    });

    test('F12 resolves a CHAINED shim (first-statement INCLUDE -> INCLUDE -> MEMBER)', async () => {
        // Legal-but-rare: the shim's own first statement is another INCLUDE that
        // carries the MEMBER. Still one file read per hop, still first-statement-only.
        fs.writeFileSync(path.join(tmpRoot, 'shim.clw'), "  INCLUDE('shim2.clw')\n");
        fs.writeFileSync(path.join(tmpRoot, 'shim2.clw'), "  MEMBER('parent')\n");

        const doc = TextDocument.create(memberUri, 'clarion', 1, memberDocText);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(memberDocText, 'GLO:Amount', 5));
        assert.ok(result, 'F12 must resolve MEMBER through a two-hop shim chain');
        const loc = (Array.isArray(result) ? result[0] : result) as Location;
        assert.ok(loc.uri.toLowerCase().endsWith('parent.clw'),
            `F12 must land in parent.clw, got ${loc.uri}`);
    });

    test('a MEMBER behind a NON-first-statement INCLUDE does NOT resolve (no all-includes sweep)', async () => {
        // The file's first statement is a data declaration, so it cannot be a member
        // module — the compiler requires MEMBER (or the shim INCLUDE carrying it) to be
        // the FIRST statement. The old sweep walked every INCLUDE token and would have
        // "found" the MEMBER in shim.clw anyway: wrong (the compiler rejects this file)
        // and the reason a miss used to cold-tokenize every include.
        const notAMember =
            "SomeVar  LONG\n" +
            "  INCLUDE('shim.clw')\n" +
            "Child  PROCEDURE\n" +
            "  CODE\n" +
            "  GLO:Amount += 1\n" +
            "  RETURN\n";
        const otherFile = path.join(tmpRoot, 'notmember.clw');
        fs.writeFileSync(otherFile, notAMember);

        const doc = TextDocument.create(toUri(otherFile), 'clarion', 1, notAMember);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(notAMember, 'GLO:Amount', 5));
        const locs = result ? (Array.isArray(result) ? result : [result]) as Location[] : [];
        assert.ok(!locs.some(l => l.uri.toLowerCase().endsWith('parent.clw')),
            'GLO:Amount must NOT resolve into parent.clw — the shim INCLUDE is not the first statement');
    });

    test('a self-including shim terminates without resolving (cycle guard)', async () => {
        fs.writeFileSync(path.join(tmpRoot, 'shim.clw'), "  INCLUDE('shim.clw')\n");

        const doc = TextDocument.create(memberUri, 'clarion', 1, memberDocText);
        const provider = new DefinitionProvider();

        // The assertion is twofold: it returns (no infinite include loop), and it
        // finds nothing in parent.clw (the chain never reached a MEMBER).
        const result = await provider.provideDefinition(doc, cursorOn(memberDocText, 'GLO:Amount', 5));
        const locs = result ? (Array.isArray(result) ? result : [result]) as Location[] : [];
        assert.ok(!locs.some(l => l.uri.toLowerCase().endsWith('parent.clw')),
            'a cyclic shim chain must not resolve a MEMBER parent');
    });
});
