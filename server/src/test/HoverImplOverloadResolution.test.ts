import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location, Hover } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';

/**
 * Issue #182 — substrate-symmetry follow-up to #131. The argument-classification
 * overload overlay that #125/#131 wired into Goto Definition for typed-var /
 * SELF / PARENT / chained dot-access calls should hold equally in **Hover** and
 * **Go-to-Implementation**.
 *
 * Phase A finding (empirical, via the providers below): Hover had NO
 * arg-classification at all on the SELF/PARENT branches, and Implementation
 * used paramCount-only resolution on SELF/PARENT — both pick the first
 * same-arity overload regardless of argument type.
 *
 * This file covers the in-memory shapes (SELF / PARENT); chained shapes need
 * the SDI (disk + redirection) and live in ChainedOverloadResolution.DiskFixture.test.ts.
 *
 * Discriminator (shared with #125/#131): `SetValue(STRING, LONG=default)` vs
 * `SetValue(StringTheory)`. A STRING-literal call must resolve to the STRING
 * overload. The STRING decl carries the unique token `pClip`; the class-ref
 * decl carries the unique fragment `StringTheory newValue`. Pinned in BOTH
 * declaration orders so the fix is proven argument-aware, not order-dependent
 * (per feedback_bidirectional_pin_assertion).
 */

const STRING_DECL = 'SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL';
const CLASSREF_DECL = 'SetValue PROCEDURE(StringTheory newValue),VIRTUAL';

const URI = 'file:///hover-impl-overload.clw';

function createDoc(code: string): TextDocument {
    return TextDocument.create(URI, 'clarion', 1, code);
}

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
    return (c as { value?: string }).value ?? '';
}

function implLine(result: Location | Location[] | null | undefined): number {
    if (!result) return -1;
    if (Array.isArray(result)) return result.length > 0 ? result[0].range.start.line : -1;
    return result.range.start.line;
}

suite('Issue #182 — Hover overload resolution (SELF / PARENT)', () => {

    const tokenCache = TokenCache.getInstance();
    teardown(() => tokenCache.clearTokens(URI));

    async function hover(code: string, pos: Position): Promise<string> {
        const provider = new HoverProvider();
        return hoverText(await provider.provideHover(createDoc(code), pos));
    }

    // ── SELF ──────────────────────────────────────────────────────────────────
    test("SELF.SetValue('s') hover shows STRING overload (class-ref declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            CLASSREF_DECL,            // line 1
            STRING_DECL,              // line 2 ← expected
            'DoIt     PROCEDURE',
            '        END',
            '',
            'StringTheory.DoIt PROCEDURE',
            '  CODE',
            "  SELF.SetValue('Hello World')",  // line 8
            '  RETURN',
        ].join('\n');
        const text = await hover(code, { line: 8, character: 9 });
        assert.ok(text.includes('pClip'), `hover must show the STRING overload (pClip); got:\n${text}`);
        assert.ok(!text.includes('StringTheory newValue'), `hover must NOT show the class-ref overload; got:\n${text}`);
    });

    test("SELF.SetValue('s') hover shows STRING overload (STRING declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            STRING_DECL,              // line 1 ← expected
            CLASSREF_DECL,            // line 2
            'DoIt     PROCEDURE',
            '        END',
            '',
            'StringTheory.DoIt PROCEDURE',
            '  CODE',
            "  SELF.SetValue('Hello World')",  // line 8
            '  RETURN',
        ].join('\n');
        const text = await hover(code, { line: 8, character: 9 });
        assert.ok(text.includes('pClip'), `hover must show the STRING overload (pClip); got:\n${text}`);
        assert.ok(!text.includes('StringTheory newValue'), `hover must NOT show the class-ref overload; got:\n${text}`);
    });

    // ── PARENT ──────────────────────────────────────────────────────────────────
    test("PARENT.SetValue('s') hover shows STRING overload (class-ref declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            CLASSREF_DECL,            // line 1
            STRING_DECL,              // line 2 ← expected
            '        END',
            '',
            'MyDerived CLASS(StringTheory)',
            'DoIt     PROCEDURE',
            '        END',
            '',
            'MyDerived.DoIt PROCEDURE',
            '  CODE',
            "  PARENT.SetValue('Hello World')",  // line 11
            '  RETURN',
        ].join('\n');
        const text = await hover(code, { line: 11, character: 11 });
        assert.ok(text.includes('pClip'), `PARENT hover must show the STRING overload (pClip); got:\n${text}`);
        assert.ok(!text.includes('StringTheory newValue'), `PARENT hover must NOT show the class-ref overload; got:\n${text}`);
    });

    test("PARENT.SetValue('s') hover shows STRING overload (STRING declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            STRING_DECL,              // line 1 ← expected
            CLASSREF_DECL,            // line 2
            '        END',
            '',
            'MyDerived CLASS(StringTheory)',
            'DoIt     PROCEDURE',
            '        END',
            '',
            'MyDerived.DoIt PROCEDURE',
            '  CODE',
            "  PARENT.SetValue('Hello World')",  // line 11
            '  RETURN',
        ].join('\n');
        const text = await hover(code, { line: 11, character: 11 });
        assert.ok(text.includes('pClip'), `PARENT hover must show the STRING overload (pClip); got:\n${text}`);
        assert.ok(!text.includes('StringTheory newValue'), `PARENT hover must NOT show the class-ref overload; got:\n${text}`);
    });
});

suite('Issue #182 — Go-to-Implementation overload resolution (SELF / PARENT)', () => {

    const tokenCache = TokenCache.getInstance();
    teardown(() => tokenCache.clearTokens(URI));

    async function impl(code: string, pos: Position): Promise<number> {
        const provider = new ImplementationProvider();
        return implLine(await provider.provideImplementation(createDoc(code), pos));
    }

    // Both overloads have implementations in the same file. A STRING-literal call
    // must target the STRING implementation, not the (lower-arity) class-ref one.
    // The class-ref impl has 1 param; the STRING impl has 2 — so a paramCount-only
    // match on the 1-arg call wrongly targets the class-ref impl.
    const CLASSREF_IMPL = 'StringTheory.SetValue PROCEDURE(StringTheory newValue)';
    const STRING_IMPL = 'StringTheory.SetValue PROCEDURE(STRING newValue, LONG pClip=0)';

    test("SELF.SetValue('s') impl targets the STRING implementation (class-ref declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            CLASSREF_DECL,            // 1
            STRING_DECL,              // 2
            'DoIt     PROCEDURE',
            '        END',
            '',
            CLASSREF_IMPL,            // 6  (class-ref impl)
            '  CODE',
            '  RETURN',
            STRING_IMPL,              // 9  (STRING impl) ← expected
            '  CODE',
            '  RETURN',
            'StringTheory.DoIt PROCEDURE',
            '  CODE',
            "  SELF.SetValue('Hello World')",  // 14
            '  RETURN',
        ].join('\n');
        const line = await impl(code, { line: 14, character: 9 });
        assert.strictEqual(line, 9, `SELF impl must target the STRING implementation (line 9); got ${line}`);
        assert.notStrictEqual(line, 6, 'must NOT target the class-ref implementation');
    });

    // Both class declarations precede all implementations — mirrors the real
    // compilation layout and keeps scope detection (getParentClassInfo) clean
    // (interleaving method impls between class decls confuses the scope walk).
    test("PARENT.SetValue('s') impl targets the STRING implementation (class-ref declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',          // 0
            CLASSREF_DECL,                      // 1
            STRING_DECL,                        // 2
            '        END',                      // 3
            '',                                 // 4
            'MyDerived CLASS(StringTheory)',    // 5
            'DoIt     PROCEDURE',               // 6
            '        END',                      // 7
            '',                                 // 8
            CLASSREF_IMPL,                      // 9  (class-ref impl)
            '  CODE',                           // 10
            '  RETURN',                         // 11
            STRING_IMPL,                        // 12 (STRING impl) ← expected
            '  CODE',                           // 13
            '  RETURN',                         // 14
            'MyDerived.DoIt PROCEDURE',         // 15
            '  CODE',                           // 16
            "  PARENT.SetValue('Hello World')", // 17
            '  RETURN',                         // 18
        ].join('\n');
        const line = await impl(code, { line: 17, character: 11 });
        assert.strictEqual(line, 12, `PARENT impl must target the STRING implementation (line 12); got ${line}`);
        assert.notStrictEqual(line, 9, 'must NOT target the class-ref implementation');
    });
});
