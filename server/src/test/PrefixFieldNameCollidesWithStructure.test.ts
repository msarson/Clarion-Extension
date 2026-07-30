import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * A PRE()'d FILE/QUEUE/GROUP field can coincidentally share its name with the enclosing
 * structure itself — a real shape in dictionary-generated code (e.g. a FILE `Evl` whose
 * RECORD has a field also named `Evl`, "System Event ident"). `findPrefixFieldInTokens`
 * matched by `structurePrefix` alone, and StructureProcessor stamps that same prefix on
 * the declaring structure token too — so `EVL:Evl` resolved to the FILE's own declaration
 * line instead of the field, with type "UNKNOWN" instead of the field's real type.
 *
 * A second, independent bug in the same area: DocumentStructure pushes a structure onto
 * its stack the moment the structure's own keyword token (FILE/QUEUE/...) is seen, so any
 * later Variable/StructurePrefix-type token on THAT SAME declaration line — e.g. the
 * `GLOB:Owner` argument of `OWNER(GLOB:Owner)`, or a `PRE(Evl)` argument — gets mistagged
 * isStructureField=true with the structure's own prefix too, even though it's an
 * attribute argument, not a real field. This fixture's OWNER(...) attribute reproduces
 * that noise directly so the fix's line-based exclusion is pinned, not just the
 * name-collision fix.
 */

const CONTENT =
    "  PROGRAM\n" +
    "Evl   FILE,PRE(Evl),OWNER(GLOB:Owner)\n" +
    "Key1                KEY(+Evl:Lic),DUP\n" +
    "Record                RECORD,PRE()\n" +
    "Lic                     LONG\n" +
    "Evl                     LONG\n" +
    "                      END\n" +
    "                    END\n" +
    "  MAP\n" +
    "  END\n" +
    "DoStuff PROCEDURE\n" +
    "  CODE\n" +
    "  EVL:Evl = 1\n" +
    "  EVL:Lic = 2\n" +
    "  RETURN\n";

const evlFieldLine = 5; // 0-based line of "Evl   LONG" (the field, not the FILE)
const licFieldLine = 4; // 0-based line of "Lic   LONG"

function cursorOn(source: string, needle: string, offset = 0): Position {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) return { line: i, character: idx + offset };
    }
    throw new Error(`cursorOn: '${needle}' not found`);
}

suite('PRE:Field resolution when the field shares its structure\'s own name', () => {

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    test('EVL:Evl resolves to the FIELD declaration, not the FILE\'s own declaration line', async () => {
        const doc = TextDocument.create('file:///c%3A/test/collide.clw', 'clarion', 1, CONTENT);
        const provider = new HoverProvider();

        // Cursor on the "Evl" in "EVL:Evl = 1" (the reference, in CODE)
        const pos = cursorOn(CONTENT, 'EVL:Evl', 4);
        const hover = await provider.provideHover(doc, pos);
        assert.ok(hover, 'hover must resolve EVL:Evl');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');

        assert.ok(text.includes('LONG'), `must show the field's real type LONG, not UNKNOWN; got:\n${text}`);
        assert.ok(text.includes(`collide.clw:${evlFieldLine + 1}`),
            `must cite the field's own line (${evlFieldLine + 1}), not the FILE's declaration line; got:\n${text}`);
        assert.ok(!text.includes('DRIVER'),
            `must NOT show the FILE's own attribute list (proves it didn't match the FILE declaration token); got:\n${text}`);
    });

    test('EVL:Lic still resolves correctly alongside the name-colliding EVL:Evl field', async () => {
        const doc = TextDocument.create('file:///c%3A/test/collide.clw', 'clarion', 1, CONTENT);
        const provider = new HoverProvider();

        const pos = cursorOn(CONTENT, 'EVL:Lic', 4);
        const hover = await provider.provideHover(doc, pos);
        assert.ok(hover, 'hover must resolve EVL:Lic even with the name-colliding Evl field present');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');

        assert.ok(text.includes(`collide.clw:${licFieldLine + 1}`),
            `must cite the Lic field's own line (${licFieldLine + 1}); got:\n${text}`);
    });
});
