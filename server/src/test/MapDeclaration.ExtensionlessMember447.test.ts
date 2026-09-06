import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { validateMissingMapDeclarations } from '../providers/diagnostics/MapDeclarationDiagnostics';

/**
 * #447 — `MEMBER('Parent')` without a file extension is the idiomatic Clarion
 * form; the compiler infers `.clw`. `CrossFileResolver.resolveFile` inferred
 * nothing, so neither route could find the parent: the redirection masks are
 * extension-based, so `*.clw` cannot match a bare name, and the relative probe
 * looked for a literal extension-less file.
 *
 * `findMapDeclarationInMemberFile` therefore bailed at its first step and EVERY
 * procedure in the module was reported as undeclared — while F12 over the same
 * code navigated to the very declaration the warning said did not exist, because
 * `DefinitionProvider` has other strategies to fall back on.
 *
 * Same defect as #395 fixed in `IncludeVerifier`, in a second site — the shape of
 * #391/#392.
 *
 * Fixtures are written to disk as ANSI + CRLF per the Clarion-fixture rule, and
 * the parent is resolved through the relative-path route (no solution is loaded
 * in these tests), which is the same route a no-solution-open user takes.
 */

function writeCrlf(filePath: string, lines: string[]): void {
    fs.writeFileSync(filePath, lines.join('\r\n'), { encoding: 'latin1' });
}

suite('#447 — extension-less MEMBER resolves to the parent PROGRAM', () => {

    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clw447_'));
    });

    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        TokenCache.getInstance().clearAllTokens();
    });

    /** Parent PROGRAM declaring Alpha (and optionally Beta) for the member module. */
    function writeParent(name: string, declare: string[]): void {
        writeCrlf(path.join(tmpDir, name), [
            '  PROGRAM',
            '  MAP',
            "    MODULE('member.clw')",
            ...declare,
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
            ''
        ]);
    }

    /** Member module implementing Alpha, opening with the given MEMBER target. */
    async function memberDiags(memberTarget: string): Promise<string[]> {
        const clwPath = path.join(tmpDir, 'member.clw');
        writeCrlf(clwPath, [
            `  MEMBER('${memberTarget}')`,
            '',
            'Alpha PROCEDURE()',
            '  CODE',
            '  RETURN',
            ''
        ]);
        const uri = 'file:///' + clwPath.replace(/\\/g, '/');
        const doc = TextDocument.create(uri, 'clarion', 1, fs.readFileSync(clwPath, 'latin1'));
        const tokens = TokenCache.getInstance().getTokens(doc);
        const diags = await validateMissingMapDeclarations(tokens, doc);
        return diags.map(d => d.message);
    }

    test('bug-pin: MEMBER without an extension no longer warns', async () => {
        writeParent('parent.clw', ['Alpha PROCEDURE()']);
        assert.deepStrictEqual(await memberDiags('parent'), [],
            "MEMBER('parent') must resolve to parent.clw — the compiler infers the extension");
    });

    test('control: MEMBER with the extension behaves the same', async () => {
        writeParent('parent.clw', ['Alpha PROCEDURE()']);
        assert.deepStrictEqual(await memberDiags('parent.clw'), [],
            'the explicit form must keep working — the fix tries the name as given first');
    });

    test('sentinel: a genuinely undeclared procedure still warns', async () => {
        // Without this, the two tests above would pass if the diagnostic were
        // simply switched off. The parent declares nothing, so Alpha is a real
        // miss and must still be reported through the extension-less path.
        writeParent('parent.clw', []);
        const msgs = await memberDiags('parent');
        assert.strictEqual(msgs.length, 1, `expected one warning, got: ${msgs.join(' | ')}`);
        assert.ok(msgs[0].includes('Alpha'), msgs[0]);
    });

    test('a MEMBER target that resolves to nothing still warns', async () => {
        // The `.clw` retry must not invent a parent. No parent file exists at all
        // here, so the declaration genuinely cannot be found.
        const msgs = await memberDiags('nosuchparent');
        assert.strictEqual(msgs.length, 1, `expected one warning, got: ${msgs.join(' | ')}`);
    });

    test('an extension-less target does not shadow a real extension-less file', async () => {
        // The name AS GIVEN is tried before the `.clw` retry, so a file literally
        // named `parent` wins over `parent.clw` if both exist. Pins the ordering.
        writeParent('parent', ['Alpha PROCEDURE()']);           // no extension, declares Alpha
        writeParent('parent.clw', []);                          // .clw exists but declares nothing
        assert.deepStrictEqual(await memberDiags('parent'), [],
            'the literal filename must be preferred over the .clw retry');
    });
});
