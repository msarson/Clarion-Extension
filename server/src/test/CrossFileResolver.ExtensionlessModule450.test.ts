import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { CrossFileResolver } from '../utils/CrossFileResolver';

/**
 * #450 — characterisation of `findMapDeclarationInMemberFile` against a parent
 * PROGRAM whose MAP names this file with and without a file extension.
 *
 * Read this before assuming these tests pin the #450 change: **they do not**. Both
 * pass with the fix reverted, because this resolver does not depend solely on the
 * `MODULE(...)` target comparison — it has a broader fallback that locates the
 * declaration regardless. The comparison corrected in #450 is one of several
 * routes, so making it extension-aware is defensive here rather than curative.
 *
 * They are kept because they characterise the behaviour a user relies on — hover,
 * F12 and the MAP diagnostic all come through this resolver, and the hover's
 * `decl → impl` footer is built from its result — and because a future change that
 * narrows the fallback would then be caught here rather than in the field.
 *
 * A third test was written and removed: it asserted that a `MODULE` naming a
 * DIFFERENT file must not resolve this one. That fails both with and against the
 * fix — the resolver matches anyway. Pre-existing behaviour, unrelated to #450,
 * and recorded on the issue rather than silently encoded as expected here.
 */
suite('#450 — parent MAP module target, with and without an extension', () => {

    let tmpDir: string;

    const writeCrlf = (file: string, lines: string[]) =>
        fs.writeFileSync(path.join(tmpDir, file), lines.join('\r\n'), { encoding: 'latin1' });

    setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clw450_')); });
    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        TokenCache.getInstance().clearAllTokens();
    });

    /** Resolves Alpha through a parent whose MAP names this file as `moduleTarget`. */
    async function resolveThroughParent(moduleTarget: string) {
        writeCrlf('parent.clw', [
            '  PROGRAM',
            '  MAP',
            "    MODULE('" + moduleTarget + "')",
            'Alpha PROCEDURE()',
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
            ''
        ]);
        writeCrlf('member.clw', ["  MEMBER('parent')", '', 'Alpha PROCEDURE()', '  CODE', '  RETURN', '']);

        const p = path.join(tmpDir, 'member.clw');
        const doc = TextDocument.create(
            'file:///' + p.split(path.sep).join('/'), 'clarion', 1, fs.readFileSync(p, 'latin1')
        );
        TokenCache.getInstance().getTokens(doc);
        const resolver = new CrossFileResolver(TokenCache.getInstance());
        return resolver.findMapDeclarationInMemberFile('Alpha', 'parent', doc, undefined, undefined);
    }

    test("MODULE('member') — the extension-less form resolves", async () => {
        const result = await resolveThroughParent('member');
        assert.ok(result, "MODULE('member') names member.clw and must resolve");
        assert.strictEqual(path.basename(result!.file).toLowerCase(), 'parent.clw');
    });

    test("MODULE('member.clw') — the explicit form resolves", async () => {
        const result = await resolveThroughParent('member.clw');
        assert.ok(result);
        assert.strictEqual(path.basename(result!.file).toLowerCase(), 'parent.clw');
    });

    test("an extension-less MEMBER target still finds the parent", async () => {
        // This half IS load-bearing — it is the #447 fix, and the resolver's first
        // step returns null without it, so nothing below it can run.
        const result = await resolveThroughParent('member.clw');
        assert.ok(result, "MEMBER('parent') must resolve parent.clw");
    });
});
