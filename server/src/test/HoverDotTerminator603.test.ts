/**
 * #603 — hover claims a member access on a line where the dot is a statement terminator.
 *
 * `StructureFieldResolver.resolveFieldAccess` locates the member access from LINE TEXT:
 *
 *     const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
 *     const rawBeforeDot   = line.substring(0, dotBeforeIndex).trim();
 *     const afterDot       = line.substring(dotBeforeIndex + 1).trim();
 *
 * It never consults the token at that offset, and the `.trim()` on `afterDot` discards the very
 * whitespace that decides the question. So on `Obj.   Method(42)` it reports `Obj.Method` as a
 * member access while the tokenizer — correctly — has an `EndStatement` there.
 *
 * Both after-the-dot forms are COMPILER-VERIFIED invalid on Clarion 12 (#574 fixture,
 * `F:\PlayGround\TestDottedCall`), with identical errors:
 *
 *     (n,12) Warning!! : Unusual type conversion        read `Result = Obj`, object into a LONG
 *     (n,22) Error : Expected: <statement> <EOF> ...    the dot ended the statement
 *     (n,31) Error : No matching prototype available    Method(42) as a bare call
 *
 * So the rule is the one #574 established: a space AFTER the dot ends the statement, whatever
 * precedes it. Hover must not present those lines as member accesses — it tells the developer their
 * code is fine when it will not build, and it disagrees with our own structure tracking, which
 * closes a structure on that same dot.
 *
 * SCOPE, measured rather than assumed. DefinitionProvider and ImplementationProvider scan the line
 * for the dot the same way, so the same guard was tried there and then removed: F12 on the member
 * half lands on the method declaration for ALL FOUR forms and for a bare `Method(42)` too, because a
 * later fallback resolves the bare name regardless of the dot. The guard changed nothing there, so
 * there is nothing to pin, and adding it would only disable a branch whose fallback already decides
 * the answer. Whether F12 should answer at all on an invalid bare call is a separate question — it
 * is the #517 unresolved-call territory, not this one. The same held for hover's OTHER entry point,
 * `resolveStructureAccess` (cursor on the RECEIVER): it reports `MyGroup — GROUP` for every form,
 * including a bare `Result = MyGroup`, so the dot plays no part in that answer either.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

suite('Hover and the dot-as-terminator (#603)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    teardown(() => TokenCache.getInstance().clearAllTokens());

    /** First line of the hover card for the member name on the single CODE line. */
    async function hoverOnMember(codeLine: string): Promise<string | null> {
        const text = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'TestClass       CLASS',
            'Count             LONG',
            'GetByID           PROCEDURE(LONG pID),LONG',
            '                END',
            'Result          LONG',
            '  CODE',
            codeLine,
            '  RETURN',
            'TestClass.GetByID  PROCEDURE(LONG pID)',
            '  CODE',
            '  RETURN(pID)',
        ].join('\r\n');
        const uri = `file:///c:/tmp/h603_${Math.random().toString(36).slice(2)}.clw`;
        const doc = TextDocument.create(uri, 'clarion', 1, text);
        TokenCache.getInstance().getTokens(doc);
        const character = codeLine.indexOf('GetByID') + 2;
        const hover = await new HoverProvider().provideHover(doc, { line: 9, character });
        if (!hover || !hover.contents) return null;
        const body = typeof hover.contents === 'string'
            ? hover.contents
            : (hover.contents as { value: string }).value;
        return body.split('\n')[0];
    }

    const claimsMember = (card: string | null) => !!card && card.includes('·');

    test('the valid forms still report the class member', async () => {
        assert.ok(claimsMember(await hoverOnMember('  Result = TestClass.GetByID(42)')),
            'no whitespace — must still resolve the member');
        assert.ok(claimsMember(await hoverOnMember('  Result = TestClass   .GetByID(42)')),
            'whitespace BEFORE the dot is valid Clarion (#574) — must still resolve the member');
    });

    test('whitespace AFTER the dot is not a member access', async () => {
        const card = await hoverOnMember('  Result = TestClass.   GetByID(42)');
        assert.ok(!claimsMember(card),
            `the dot is a statement terminator here; hover must not claim a member, got ${JSON.stringify(card)}`);
    });

    test('whitespace on BOTH sides is not a member access', async () => {
        const card = await hoverOnMember('  Result = TestClass . GetByID(42)');
        assert.ok(!claimsMember(card),
            `the dot is a statement terminator here; hover must not claim a member, got ${JSON.stringify(card)}`);
    });

    /** First line of the hover card for `Field1` on the single CODE line of a GROUP fixture. */
    async function hoverOnGroupField(codeLine: string): Promise<string | null> {
        const text = [
            '  PROGRAM',
            'MyGroup         GROUP',
            'Field1            LONG',
            '                END',
            'Result          LONG',
            '  MAP',
            '  END',
            '  CODE',
            codeLine,
            '  RETURN',
        ].join('\r\n');
        const uri = `file:///c:/tmp/g603_${Math.random().toString(36).slice(2)}.clw`;
        const doc = TextDocument.create(uri, 'clarion', 1, text);
        TokenCache.getInstance().getTokens(doc);
        const character = codeLine.indexOf('Field1') + 2;
        const hover = await new HoverProvider().provideHover(doc, { line: 8, character });
        if (!hover || !hover.contents) return null;
        const body = typeof hover.contents === 'string'
            ? hover.contents
            : (hover.contents as { value: string }).value;
        return body.split('\n')[0];
    }

    test('a GROUP field goes the same way — the other card the guard covers', async () => {
        // A different formatter than the class-method card above, reached through the same dot scan,
        // so it is worth pinning both: a field card names the owning structure ("MyGroup Field:").
        assert.ok((await hoverOnGroupField('  Result = MyGroup.Field1'))?.includes('Field1'),
            'no whitespace — must still resolve the field');
        assert.ok((await hoverOnGroupField('  Result = MyGroup   .Field1'))?.includes('Field1'),
            'whitespace BEFORE the dot is valid Clarion (#574) — must still resolve the field');
        assert.strictEqual(await hoverOnGroupField('  Result = MyGroup.   Field1'), null,
            'whitespace AFTER the dot: the dot ends the statement, so there is no field access');
        assert.strictEqual(await hoverOnGroupField('  Result = MyGroup . Field1'), null,
            'whitespace on both sides: the same, per variant D');
    });

    test('a bare call is unaffected', async () => {
        // The control that shows this is about the dot, not about hover finding any name it can:
        // a bare call already reported a weaker, non-member card and must keep doing so.
        const card = await hoverOnMember('  Result = GetByID(42)');
        assert.ok(!claimsMember(card), `expected no member claim for a bare call, got ${JSON.stringify(card)}`);
    });
});
