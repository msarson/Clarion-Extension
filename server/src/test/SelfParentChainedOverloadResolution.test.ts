import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';

/**
 * Issue #131 — verify-first: SELF / PARENT / chained dot-access overload
 * resolution. #127's close-out claimed these "share the SAME code path as the
 * typed-var dot-access case" and were "lifted as a side-effect" by the #128
 * substrate change. Per Pattern A, lifted side-effects must be verified.
 *
 * Phase A finding (empirical, via DefinitionProvider.provideDefinition):
 *   - typed-var `obj.SetValue('s')`        → CORRECT (the #125 arg-classification
 *                                             overlay at DefinitionProvider's
 *                                             typed-var branch)
 *   - `SELF.SetValue('s')`                 → WRONG: always picks the StringTheory
 *                                             (class-ref) overload regardless of
 *                                             declaration order — arg-UNAWARE
 *   - `PARENT.SetValue('s')`               → WRONG: always picks the first-declared
 *                                             overload regardless of arg — the
 *                                             "GREEN when STRING is declared first"
 *                                             was luck, not skill
 *
 * Root cause: the SELF and PARENT branches in DefinitionProvider used
 * paramCount-only resolution; the #125 `tryArgClassifyResolve` overlay was wired
 * only into the typed-var branch. Fix: call the same overlay in the SELF/PARENT
 * branches, using the enclosing class (SELF) / parent class (PARENT) name.
 *
 * Discriminator (from the #125 Mark-repro): `SetValue(STRING, LONG=default)` vs
 * `SetValue(StringTheory)`. A STRING-literal call must resolve to the STRING
 * overload. Each shape is pinned in BOTH declaration orders so the fix is proven
 * argument-aware rather than order-dependent (per feedback_bidirectional_pin).
 */

const URI = 'file:///self-parent-overload.clw';

function createDoc(code: string): TextDocument {
    return TextDocument.create(URI, 'clarion', 1, code);
}
function lineOf(result: Location | Location[] | null | undefined): number {
    if (!result) return -1;
    if (Array.isArray(result)) return result.length > 0 ? result[0].range.start.line : -1;
    return result.range.start.line;
}

const STRING_DECL = 'SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL';
const CLASSREF_DECL = 'SetValue PROCEDURE(StringTheory newValue),VIRTUAL';

suite('Issue #131 — SELF / PARENT overload resolution', () => {

    const tokenCache = TokenCache.getInstance();
    teardown(() => tokenCache.clearTokens(URI));

    async function f12(code: string, pos: Position): Promise<number> {
        const provider = new DefinitionProvider();
        const doc = createDoc(code);
        return lineOf(await provider.provideDefinition(doc, pos));
    }

    // ── SELF ────────────────────────────────────────────────────────────────
    // Class-ref overload declared FIRST → the STRING target is line 2. A
    // STRING-literal SELF call must resolve to line 2, NOT line 1.
    test("SELF.SetValue('s') resolves to STRING overload (class-ref declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            CLASSREF_DECL,            // line 1
            STRING_DECL,              // line 2  ← expected
            'DoIt     PROCEDURE',
            '        END',
            '',
            'StringTheory.DoIt PROCEDURE',
            '  CODE',
            "  SELF.SetValue('Hello World')",  // line 8
            '  RETURN',
        ].join('\n');
        const line = await f12(code, { line: 8, character: 9 });
        assert.strictEqual(line, 2, `SELF must resolve to STRING overload (line 2); got ${line}`);
        assert.notStrictEqual(line, 1, 'must NOT pick the StringTheory class-ref overload');
    });

    // STRING overload declared FIRST → target is line 1. Proves the fix is
    // arg-aware, not just "pick the other one".
    test("SELF.SetValue('s') resolves to STRING overload (STRING declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            STRING_DECL,              // line 1  ← expected
            CLASSREF_DECL,            // line 2
            'DoIt     PROCEDURE',
            '        END',
            '',
            'StringTheory.DoIt PROCEDURE',
            '  CODE',
            "  SELF.SetValue('Hello World')",  // line 8
            '  RETURN',
        ].join('\n');
        const line = await f12(code, { line: 8, character: 9 });
        assert.strictEqual(line, 1, `SELF must resolve to STRING overload (line 1); got ${line}`);
        assert.notStrictEqual(line, 2, 'must NOT pick the StringTheory class-ref overload');
    });

    // ── PARENT ──────────────────────────────────────────────────────────────
    test("PARENT.SetValue('s') resolves to parent STRING overload (class-ref declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            CLASSREF_DECL,            // line 1
            STRING_DECL,              // line 2  ← expected
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
        const line = await f12(code, { line: 11, character: 11 });
        assert.strictEqual(line, 2, `PARENT must resolve to parent STRING overload (line 2); got ${line}`);
        assert.notStrictEqual(line, 1, 'must NOT pick the StringTheory class-ref overload');
    });

    test("PARENT.SetValue('s') resolves to parent STRING overload (STRING declared first)", async () => {
        const code = [
            'StringTheory CLASS,TYPE',
            STRING_DECL,              // line 1  ← expected
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
        const line = await f12(code, { line: 11, character: 11 });
        assert.strictEqual(line, 1, `PARENT must resolve to parent STRING overload (line 1); got ${line}`);
        assert.notStrictEqual(line, 2, 'must NOT pick the StringTheory class-ref overload');
    });

    // Note: the 3rd #131 shape — chained `SELF.inner.SetValue(args)` — routes
    // through ChainedPropertyResolver, whose chain walk depends on the
    // StructureDeclarationIndexer (disk + redirection). It cannot be exercised
    // in this in-memory suite, so its coverage lives in the disk-backed
    // ChainedOverloadResolution.DiskFixture.test.ts.
});
