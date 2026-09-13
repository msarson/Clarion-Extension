import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Issue #480 — a prototype declared in the PROGRAM's MAP inside a `MODULE(...)` block
 * was labelled "📦 Module Procedure". It is callable throughout the program, so the
 * label should read "🌍 Global Procedure".
 *
 * `MODULE()` names the source file that CONTAINS the implementation; it does not
 * narrow who may call it. Only `PRIVATE` does that.
 *
 * Settled three ways:
 *
 *  - Compiler (Clarion 10.0.12567): one prototype in the PROGRAM's MAP inside
 *    `MODULE('modA.clw')`, implemented in modA.clw, called from modB.clw. Plain, it
 *    builds (exit 0); with `,PRIVATE` the call site fails with
 *    "Invalid use of PRIVATE procedure".
 *  - MAP help topic: "A MAP declared in the PROGRAM source module declares prototypes
 *    of PROCEDUREs available for use throughout the program", versus a MAP in a MEMBER
 *    module, whose prototypes are "explicitly available in that MEMBER module".
 *  - PRIVATE help topic: the attribute restricts a procedure to "the same source
 *    MODULE", and its own example places `,PRIVATE` on a prototype inside a MAP's
 *    `MODULE()` block — which would be redundant if the wrapper already restricted it.
 *
 * The shape matters because it is what template-generated apps emit for virtually
 * every procedure, so the wrong label was the common case.
 */

let tmpRoot: string;

interface Fixture { uri: string; text: string; }

/**
 * A PROGRAM whose MAP wraps two prototypes in `MODULE('member.clw')` — one plain, one
 * `,PRIVATE` — and a MEMBER that carries its own local MAP, calls all three procedures
 * and implements them. One fixture covers all three scope rules.
 */
function buildFixture(): Fixture {
    fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), [
        '  PROGRAM',
        '',
        '  MAP',
        "    MODULE('member.clw')",
        '      Caller        PROCEDURE()',
        '      SharedProc    PROCEDURE()',
        '      HiddenProc    PROCEDURE(),PRIVATE',
        '    END',
        '  END',
        '',
        '  CODE',
        '  RETURN',
        ''
    ].join('\n'));

    const text = [
        "  MEMBER('parent.clw')",
        '',
        '  MAP',
        '    LocalOnly     PROCEDURE()',
        '  END',
        '',
        'Caller PROCEDURE()',
        '',
        '  CODE',
        '  SharedProc()',
        '  HiddenProc()',
        '  LocalOnly()',
        '  RETURN',
        '',
        'SharedProc PROCEDURE()',
        '  CODE',
        '  RETURN',
        '',
        'HiddenProc PROCEDURE()',
        '  CODE',
        '  RETURN',
        '',
        'LocalOnly PROCEDURE()',
        '  CODE',
        '  RETURN',
        ''
    ].join('\n');
    const file = path.join(tmpRoot, 'member.clw');
    fs.writeFileSync(file, text);

    return {
        uri: 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A'),
        text
    };
}

/** Hovers the call site of `procName` inside member.clw. */
async function hoverCallSite(fix: Fixture, procName: string): Promise<string> {
    const lines = fix.text.split('\n');
    const line = lines.findIndex(l => l.trim() === `${procName}()`);
    assert.notStrictEqual(line, -1, `fixture must contain a call site for ${procName}`);
    const character = lines[line].indexOf(procName) + 2;

    const doc = TextDocument.create(fix.uri, 'clarion', 1, fix.text);
    const hover = await new HoverProvider().provideHover(doc, { line, character }) as Hover | null;
    if (!hover || !hover.contents) return '';
    const c = hover.contents as { value?: string } | string;
    return typeof c === 'string' ? c : (c.value ?? '');
}

suite("Issue #480 — a MODULE()-wrapped prototype in the PROGRAM's MAP is global, not module-scoped", () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-480-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test("a plain prototype in the PROGRAM's MAP reads Global, despite the MODULE() wrapper", async () => {
        const text = await hoverCallSite(buildFixture(), 'SharedProc');
        assert.notStrictEqual(text, '', 'a call site must produce a hover');

        // Deliberately case-sensitive: the generic symbol card reads
        // "🌍 Global procedure", so a case-insensitive match would pass on the very
        // fallback card #452 was about. Only the capital P is the procedure card.
        assert.ok(/🌍 Global Procedure/.test(text),
            `expected the global procedure card; got: ${text || '(no hover at all)'}`);
        assert.ok(!/📦 Module Procedure/.test(text),
            `MODULE() names where the body lives, it does not narrow scope; got: ${text}`);
    });

    test('a ,PRIVATE prototype in the same MAP stays module-scoped, and says so', async () => {
        const text = await hoverCallSite(buildFixture(), 'HiddenProc');
        assert.notStrictEqual(text, '', 'a call site must produce a hover');

        // Check the HEADER line only. The card also echoes the prototype in a code
        // block, so `,PRIVATE` appears in the body whatever the header says — a
        // whole-card match would pass without the label ever mentioning it.
        const header = text.split('\n')[0];
        assert.ok(/📦 Module Procedure/.test(header),
            `PRIVATE restricts the procedure to its own module; got header: ${header || '(no hover at all)'}`);
        assert.ok(/Private/.test(header),
            `the reason for the narrower scope must be visible in the header; got header: ${header}`);
    });

    test("a prototype in the MEMBER's own MAP stays module-scoped", async () => {
        const text = await hoverCallSite(buildFixture(), 'LocalOnly');
        assert.notStrictEqual(text, '', 'a call site must produce a hover');

        assert.ok(/📦 Module Procedure/.test(text),
            `a MEMBER's MAP declares procedures available in that module only; got: ${text || '(no hover at all)'}`);
        assert.ok(!/🌍 Global Procedure/.test(text),
            `must not be promoted to global; got: ${text}`);
    });
});
