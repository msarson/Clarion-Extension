import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { TokenHelper } from '../utils/TokenHelper';

/**
 * Issue #342 — `DocumentStructure.extractFilenameAfterKeyword` required the
 * token after the filename string to be `)`, so every MULTI-argument file-ref
 * form left `referencedFile` unset:
 *
 *   INCLUDE('sections.clw','SmokeSection')   — section include
 *   LINK('CopyPaste.clw',_LinkMode_)         — flagged link
 *
 * Everything downstream keys off `referencedFile`: the FileRelationshipGraph
 * edge (→ document link), `TokenHelper.getFileRefArgStringToken` (→ the #265
 * file-link hover and F12's file-ref exception), IncludeVerifier walks.
 * Found by Mark on SmokeTest101: no hover/link on the section-form INCLUDE
 * while the one-arg INCLUDE above it had both.
 *
 * Section-ARGUMENT navigation (hover/F12 on 'SmokeSection' itself) is #343.
 */

const SOURCE = [
    "  MEMBER('Prog.clw')",
    "  INCLUDE('CopyPasteManager.inc'),ONCE",                     // 1 — one-arg (regression)
    "  INCLUDE('sections.clw','SmokeSection'),ONCE",              // 2 — two-arg (the bug)
    "MyClass CLASS,TYPE,MODULE('MyClass.clw'),LINK('MyClass.clw',_LinkMode_),DLL(_DllMode_)", // 3
    "Init      PROCEDURE()",
    "        END",
].join('\n');

function tokenize() {
    return new ClarionTokenizer(SOURCE).tokenize();
}

suite('Issue #342 — multi-argument file-ref forms', () => {

    test("two-arg INCLUDE('file','section') sets referencedFile (the bug)", () => {
        const tokens = tokenize();
        const inc = tokens.find(t =>
            t.line === 2 && t.value.toUpperCase() === 'INCLUDE');
        assert.ok(inc, 'INCLUDE token not found on line 2');
        assert.strictEqual(inc!.referencedFile, 'sections.clw',
            'section-form INCLUDE must reference its file — no referencedFile means no link, no hover, no FRG edge');
    });

    test("flagged LINK('file',flag) sets referencedFile", () => {
        const tokens = tokenize();
        const link = tokens.find(t =>
            t.line === 3 && t.value.toUpperCase() === 'LINK');
        assert.ok(link, 'LINK token not found');
        assert.strictEqual(link!.referencedFile, 'MyClass.clw');
    });

    test('regression: one-arg INCLUDE and MODULE unchanged', () => {
        const tokens = tokenize();
        const inc = tokens.find(t => t.line === 1 && t.value.toUpperCase() === 'INCLUDE');
        assert.strictEqual(inc?.referencedFile, 'CopyPasteManager.inc');
        const mod = tokens.find(t => t.line === 3 && t.value.toUpperCase() === 'MODULE');
        assert.strictEqual(mod?.referencedFile, 'MyClass.clw');
    });

    test('hover detector fires on the FILE arg of the section form, not on the section arg', () => {
        const tokens = tokenize();
        const line2 = SOURCE.split('\n')[2];

        const onFile = TokenHelper.getFileRefArgStringToken(tokens, 2, line2.indexOf('sections.clw') + 3);
        assert.ok(onFile, 'file-arg cursor must be recognized as a file-ref position');
        assert.strictEqual(onFile!.value, "'sections.clw'");

        // Section-argument hover/F12 is #343 — pinned here as out of scope so a
        // future change is deliberate, not accidental.
        const onSection = TokenHelper.getFileRefArgStringToken(tokens, 2, line2.indexOf('SmokeSection') + 3);
        assert.strictEqual(onSection, null, 'section arg stays a non-file position until #343');
    });
});
