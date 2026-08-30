import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #420 — the MEMBER-parent / INCLUDE-chain walk behind hover's cross-file
 * global lookup used to `loadDocument` (read + TOKENIZE) every reachable file
 * before it could say "not found" — 10.5s on a generated PROGRAM module with
 * 203 direct INCLUDEs, per new undeclared word.
 *
 * The walk's candidate predicate can only match a token whose label sits at
 * column 0, so a file whose raw text has no line starting with the name cannot
 * declare it. The walk now reads each file's text and regex-checks for the
 * label BEFORE tokenizing; a file that fails the check is skipped, but its
 * INCLUDEs are still extracted from the text and followed.
 *
 * These tests pin: (1) resolution through a skipped intermediate file still
 * works, (2) only files that can declare the name get tokenized/cached,
 * (3) a miss tokenizes nothing, (4) case-insensitivity does not break
 * the pre-check, (5) the end-to-end hover is unchanged.
 */

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
const cachedBasenames = (cache: CrossFileCache) =>
    cache.getStats().entries.map(e => path.basename(e).toLowerCase()).sort();

const PARENT =
    "  PROGRAM\n" +
    "  INCLUDE('a.inc'),ONCE\n" +
    "ParentOnly   LONG\n" +
    "  MAP\n" +
    "  END\n" +
    "  CODE\n" +
    "  RETURN\n";
// a.inc does NOT mention DeepGlob — it must be SKIPPED (never tokenized) yet its INCLUDE followed.
const A_INC =
    "  INCLUDE('b.inc'),ONCE\n" +
    "OtherA       LONG\n";
const B_INC =
    "DeepGlob     LONG\n" +
    "  ! a comment mentioning DeepGlob must not matter\n";
const CHILD =
    "  MEMBER('parent')\n" +
    "  MAP\n" +
    "  END\n" +
    "Child  PROCEDURE\n" +
    "  CODE\n" +
    "  DeepGlob += 1\n" +
    "  RETURN\n";

suite('MemberLocatorService — column-0 text pre-filter on the include walk (#420)', () => {
    let tmpRoot: string;
    let childDoc: TextDocument;

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-prefilter-420-'));
        fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), PARENT);
        fs.writeFileSync(path.join(tmpRoot, 'a.inc'), A_INC);
        fs.writeFileSync(path.join(tmpRoot, 'b.inc'), B_INC);
        const childFile = path.join(tmpRoot, 'child.clw');
        fs.writeFileSync(childFile, CHILD);
        childDoc = TextDocument.create(toUri(childFile), 'clarion', 1, CHILD);
    });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('resolves a global two INCLUDE hops down through an intermediate file that is never tokenized', async () => {
        const cache = new CrossFileCache(TokenCache.getInstance());
        const svc = new MemberLocatorService(cache);
        const result = await svc.findVariableTokenInParentChain('DeepGlob', childDoc);
        assert.ok(result, 'DeepGlob must resolve through parent.clw -> a.inc -> b.inc');
        assert.ok(result!.doc.uri.toLowerCase().endsWith('b.inc'), `must land in b.inc, got ${result!.doc.uri}`);
        assert.strictEqual(result!.token.line, 0);
        // Only b.inc could declare the name, so only b.inc was loaded + tokenized.
        assert.deepStrictEqual(cachedBasenames(cache), ['b.inc'],
            'parent.clw and a.inc contain no column-0 DeepGlob and must not have been tokenized');
    });

    test('a miss tokenizes nothing at all (the 10.5s case)', async () => {
        const cache = new CrossFileCache(TokenCache.getInstance());
        const svc = new MemberLocatorService(cache);
        const result = await svc.findVariableTokenInParentChain('dll_mode', childDoc);
        assert.strictEqual(result, null);
        assert.deepStrictEqual(cachedBasenames(cache), [], 'no reachable file can declare dll_mode — none may be tokenized');
    });

    test('a name that appears only as a comment or in the middle of a line is still a miss (anchored at column 0)', async () => {
        fs.writeFileSync(path.join(tmpRoot, 'b.inc'),
            "  ! DeepGlob mentioned in a comment\n" +
            "Something     LIKE(DeepGlob)\n");
        const cache = new CrossFileCache(TokenCache.getInstance());
        const svc = new MemberLocatorService(cache);
        const result = await svc.findVariableTokenInParentChain('DeepGlob', childDoc);
        assert.strictEqual(result, null, 'DeepGlob is never a column-0 label here');
    });

    test('the pre-check is case-insensitive (Clarion labels are)', async () => {
        // (A UTF-8 BOM in front of the label is a pre-existing tokenizer limitation —
        // the label is not at column 0 for the tokenizer either — so it is not pinned here;
        // the probe strips a BOM before matching purely so it never rejects more than
        // the tokenizer would.)
        fs.writeFileSync(path.join(tmpRoot, 'b.inc'), "DEEPGLOB     LONG\n");
        const cache = new CrossFileCache(TokenCache.getInstance());
        const svc = new MemberLocatorService(cache);
        const result = await svc.findVariableTokenInParentChain('deepglob', childDoc);
        assert.ok(result, 'DEEPGLOB must be found for the lower-case query');
        assert.ok(result!.doc.uri.toLowerCase().endsWith('b.inc'));
    });

    test('a longer colon-suffixed label is not a false hit (`DeepGlob:Extra` vs `DeepGlob`)', async () => {
        fs.writeFileSync(path.join(tmpRoot, 'b.inc'), "DeepGlob:Extra   LONG\n");
        const cache = new CrossFileCache(TokenCache.getInstance());
        const svc = new MemberLocatorService(cache);
        const result = await svc.findVariableTokenInParentChain('DeepGlob', childDoc);
        assert.strictEqual(result, null, 'DeepGlob:Extra is a different label');
    });

    test('end-to-end hover from the MEMBER module still cites the declaring include', async () => {
        const hover = await new HoverProvider().provideHover(childDoc, cursorOn(CHILD, 'DeepGlob', 2));
        assert.ok(hover, 'hover must resolve DeepGlob cross-file');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');
        assert.ok(text.includes('b.inc:1'), `hover must cite b.inc:1; got:\n${text}`);
    });
});
