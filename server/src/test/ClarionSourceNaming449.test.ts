import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { validateMissingMapDeclarations } from '../providers/diagnostics/MapDeclarationDiagnostics';
import { clarionSourceCandidates, moduleTargetMatchesFile } from '../utils/ClarionSourceNaming';

/**
 * #449 — the Language Reference gives one rule to every directive that names a
 * source file: an omitted extension means `.CLW`.
 *
 *   MEMBER  — "the filename (without extension) of a PROGRAM source file"
 *   INCLUDE — "If the extension is omitted, .CLW is assumed."
 *   MODULE  — from the help's own example:
 *                MODULE('Loadit')     ! source module loadit.clw
 *
 * We inferred it in some places and not others, so the same source was understood
 * by one feature and misread by another. This had already been reported and fixed
 * twice as separate bugs (#395 IncludeVerifier, #447 CrossFileResolver) before the
 * remaining two sites were found by reading the help rather than waiting for a
 * third report.
 */
suite('#449 — extension-less source targets infer .CLW', () => {

    // ---- the shared rule ----

    suite('clarionSourceCandidates', () => {
        test('an extension-less name gains a .clw retry, tried second', () => {
            assert.deepStrictEqual(clarionSourceCandidates('parent'), ['parent', 'parent.clw'],
                'the name AS GIVEN must be tried first so nothing that resolves today changes');
        });

        test('a name with any extension is left alone', () => {
            assert.deepStrictEqual(clarionSourceCandidates('parent.clw'), ['parent.clw']);
            assert.deepStrictEqual(clarionSourceCandidates('equates.inc'), ['equates.inc'],
                'a .inc target must never gain a .clw retry');
        });
    });

    suite('moduleTargetMatchesFile', () => {
        test('a bare MODULE target matches the .clw file it names', () => {
            assert.strictEqual(moduleTargetMatchesFile('member', 'member.clw'), true);
        });

        test('an explicit target still matches', () => {
            assert.strictEqual(moduleTargetMatchesFile('member.clw', 'member.clw'), true);
        });

        test('unrelated names do not match', () => {
            assert.strictEqual(moduleTargetMatchesFile('other', 'member.clw'), false);
            assert.strictEqual(moduleTargetMatchesFile('member.inc', 'member.clw'), false);
        });

        test('an external-library MODULE matches no source file', () => {
            // MODULE also names external libraries, where the help says the string
            // may be "any unique identifier" rather than a file. Those must simply
            // fail to match, which is the existing behaviour.
            assert.strictEqual(moduleTargetMatchesFile('Win32', 'member.clw'), false);
            assert.strictEqual(moduleTargetMatchesFile('KERNEL32', 'member.clw'), false);
        });

        test('a path-qualified target compares on its basename', () => {
            assert.strictEqual(moduleTargetMatchesFile('src\\member', 'member.clw'), true);
        });
    });

    // ---- site 2, end to end ----

    suite('MAP self-declaration through an extension-less MODULE', () => {

        let tmpDir: string;

        const writeCrlf = (file: string, lines: string[]) =>
            fs.writeFileSync(path.join(tmpDir, file), lines.join('\r\n'), { encoding: 'latin1' });

        setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clw449_')); });
        teardown(() => {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
            TokenCache.getInstance().clearAllTokens();
        });

        /**
         * Member module that declares Alpha in its OWN map via MODULE(target) and
         * implements it. The parent PROGRAM declares NOTHING, so only the
         * self-declaration can suppress the warning — which is what isolates this
         * from the parent-MAP path fixed in #447.
         */
        async function selfDeclaredDiags(target: string): Promise<string[]> {
            writeCrlf('parent.clw', ['  PROGRAM', '  MAP', '  END', '  CODE', '  RETURN', '']);
            writeCrlf('member.clw', [
                "  MEMBER('parent')",
                '  MAP',
                "    MODULE('" + target + "')",
                'Alpha PROCEDURE()',
                '    END',
                '  END',
                '',
                'Alpha PROCEDURE()',
                '  CODE',
                '  RETURN',
                ''
            ]);
            const p = path.join(tmpDir, 'member.clw');
            const doc = TextDocument.create(
                'file:///' + p.split(path.sep).join('/'), 'clarion', 1,
                fs.readFileSync(p, 'latin1')
            );
            const diags = await validateMissingMapDeclarations(TokenCache.getInstance().getTokens(doc), doc);
            return diags.map(d => d.message);
        }

        test('bug-pin: MODULE(name) with no extension is a valid self-declaration', async () => {
            assert.deepStrictEqual(await selfDeclaredDiags('member'), [],
                "MODULE('member') names member.clw — the compiler infers the extension");
        });

        test('control: MODULE(name.clw) is unchanged', async () => {
            assert.deepStrictEqual(await selfDeclaredDiags('member.clw'), []);
        });

        test('sentinel: a MODULE naming a DIFFERENT file does not self-declare', async () => {
            // Without this the fix could be "match anything", which would suppress
            // genuine misses. A MODULE pointing elsewhere is a forward declaration
            // for an external procedure and must not count.
            const msgs = await selfDeclaredDiags('somewhereelse');
            assert.strictEqual(msgs.length, 1, `expected one warning, got: ${msgs.join(' | ')}`);
            assert.ok(msgs[0].includes('Alpha'), msgs[0]);
        });
    });
});
