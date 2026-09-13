import * as assert from 'assert';
import { Hover } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * Hover had NO `?Name` field-equate handling at all: `getWordRangeAtPosition`
 * treats `?` as a non-word character, so the sigil was dropped before any
 * resolver saw the word and hover resolved the bare remainder instead. When that
 * remainder happened to name something else in scope the card was confidently
 * wrong — a `?Cancel` control reported an unrelated `Cancel` EQUATE, a `?List`
 * control reported the `LIST` keyword — and when it named nothing there was no
 * hover at all. With the cursor on the `?` glyph itself the range collapsed to
 * empty and the context builder bailed before the ladder even started.
 *
 * A `?Name` only ever refers to a control declared in a window structure. That is
 * normally the current procedure's own window, but the window may live in a class
 * or another source, and the same name — `?Cancel` most of all — recurs across
 * unrelated windows. Hover therefore resolves from the `FieldEquateLabel` token
 * against the current procedure's windows first, labels anything found elsewhere
 * in the file with its owner, and stays silent rather than choosing between
 * same-named candidates.
 */

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
    return (c as { value?: string }).value ?? '';
}

// The local `Cancel` EQUATE and the `LIST` control are deliberate: they are the
// name collisions that made the old bare-word lookup answer wrongly rather than
// silently, so they are what proves the fix resolves the control instead. The
// second and third procedures cover a name shared between two windows and a
// reference made from a procedure owning no window at all.
const SOURCE = [
    '  PROGRAM',
    '  MAP',
    'MyProc     PROCEDURE()',
    'OtherProc  PROCEDURE()',
    'ThirdProc  PROCEDURE()',
    '  END',
    '  CODE',
    '  MyProc()',
    '  RETURN',
    '',
    'MyProc  PROCEDURE()',
    'Cancel    EQUATE(7)',
    'Msg       STRING(32)',
    "Window WINDOW('Caption'),AT(,,119,93),GRAY",
    "      BUTTON('&OK'),AT(19,75,41,14),USE(?OkButton),DEFAULT",
    "      BUTTON('&Cancel'),AT(64,75,42,14),USE(?Cancel)",
    "      LIST,AT(8,105,273,90),USE(?List),FROM('One|Two')",
    '      ENTRY(@s20),AT(55,23),USE(?Name:Entry)',
    "      BUTTON('X'),AT(1,1),USE(?)",
    '   END',
    '  CODE',
    '  OPEN(Window)',
    '  ACCEPT',
    '    CASE FIELD()',
    '    OF ?OkButton',
    '    OF ?Cancel',
    '    END',
    '    HIDE(?Cancel )',
    '    IF FIELD() = ?NotDeclaredAnywhere',
    '    END',
    '    IF FIELD() = ?OnlyInOther',
    '    END',
    "    Msg = 'a ?Cancel inside a string'",
    '  END',
    '  RETURN',
    '',
    'OtherProc  PROCEDURE()',
    "OtherWin WINDOW('Other'),AT(,,100,80),GRAY",
    "      BUTTON('&Cancel'),AT(10,10,42,14),USE(?Cancel)",
    "      CHECK('Flag'),AT(10,30),USE(?OnlyInOther)",
    '   END',
    '  CODE',
    '  OPEN(OtherWin)',
    '  RETURN',
    '',
    'ThirdProc  PROCEDURE()',
    '  CODE',
    '  IF FIELD() = ?Cancel',
    '  END',
    '  RETURN',
].join('\n');

const URI = 'file:///c:/fixtures/field-equate-hover.clw';
const LINES = SOURCE.split('\n');

suite('Hover — ?Name field equates (window controls)', () => {
    let doc: TextDocument;
    let provider: HoverProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create(URI, 'clarion', 1, SOURCE);
        TokenCache.getInstance().getTokens(doc);
        provider = new HoverProvider();
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    /** Index of the one line containing `marker` — ambiguity is a fixture bug, not a pass. */
    function lineOf(marker: string): number {
        const hits = LINES.map((l, i) => (l.includes(marker) ? i : -1)).filter(i => i >= 0);
        assert.strictEqual(hits.length, 1,
            `fixture marker ${JSON.stringify(marker)} must match exactly one line, matched ${hits.length}`);
        return hits[0];
    }

    /** Hover text with the cursor `offsetInName` chars into the `feq` occurrence on `marker`'s line. */
    async function hoverOn(marker: string, feq: string, offsetInName = 2): Promise<string> {
        const line = lineOf(marker);
        const at = LINES[line].indexOf(feq);
        assert.ok(at >= 0, `line must contain ${feq}`);
        return hoverText(await provider.provideHover(doc, { line, character: at + offsetInName }));
    }

    test('a ?Name reference resolves to its control, not a same-named EQUATE', async () => {
        const text = await hoverOn('OF ?Cancel', '?Cancel');

        assert.ok(text.length > 0, 'hover must fire on a ?Name reference');
        assert.ok(text.includes('?Cancel'),
            `card must name the control, not the bare word; got:\n${text}`);
        assert.ok(text.includes('BUTTON'),
            `card must report the control's own type keyword; got:\n${text}`);
        assert.ok(!text.includes('EQUATE'),
            `the local Cancel EQUATE is a name collision, not this control; got:\n${text}`);
    });

    test('a ?Name whose bare word names nothing still resolves (was: no hover)', async () => {
        const text = await hoverOn('OF ?OkButton', '?OkButton');

        assert.ok(text.length > 0,
            'hover must fire — OkButton names nothing on its own, which is why this was silent');
        assert.ok(text.includes('?OkButton') && text.includes('BUTTON'),
            `card must name the control and its type; got:\n${text}`);
    });

    test('the cursor on the ? glyph itself resolves the control', async () => {
        // offset 0 — directly on `?`, where the word range used to collapse to empty.
        const text = await hoverOn('OF ?Cancel', '?Cancel', 0);

        assert.ok(text.includes('?Cancel') && text.includes('BUTTON'),
            `the sigil position must resolve like the name does; got:\n${text}`);
    });

    test('a control named after a Clarion keyword resolves to the control', async () => {
        const text = await hoverOn('USE(?List)', '?List');

        assert.ok(text.includes('?List'),
            `card must name the control, not the LIST keyword it collides with; got:\n${text}`);
        assert.ok(text.includes('WINDOW'),
            `card must name the owning structure; got:\n${text}`);
    });

    test('hover on the USE(?Name) declaration itself resolves the control', async () => {
        const text = await hoverOn("BUTTON('&Cancel'),AT(64,75", '?Cancel');

        assert.ok(text.includes('?Cancel') && text.includes('BUTTON'),
            `the declaration site must resolve too; got:\n${text}`);
    });

    test('a ?Name argument with trailing whitespace resolves', async () => {
        const text = await hoverOn('HIDE(?Cancel )', '?Cancel');

        assert.ok(text.includes('?Cancel') && text.includes('BUTTON'),
            `\`HIDE(?Cancel )\` is the same reference; got:\n${text}`);
    });

    test('a compound ?Prefix:Suffix control resolves as one name', async () => {
        const text = await hoverOn('USE(?Name:Entry)', '?Name:Entry');

        assert.ok(text.includes('?Name:Entry'),
            `the colon-bearing name is one field equate, not two; got:\n${text}`);
        assert.ok(text.includes('ENTRY'),
            `card must report the control type; got:\n${text}`);
    });

    test('the same ?Name in two windows resolves to the current procedure\'s own control', async () => {
        const ownDecl = lineOf("BUTTON('&Cancel'),AT(64,75");
        const otherDecl = lineOf("BUTTON('&Cancel'),AT(10,10");
        const text = await hoverOn('OF ?Cancel', '?Cancel');

        assert.ok(text.includes(`:${ownDecl + 1}]`),
            `must point at this procedure's own ?Cancel (line ${ownDecl + 1}); got:\n${text}`);
        assert.ok(!text.includes(`:${otherDecl + 1}]`),
            `must not point at another window's identically named control; got:\n${text}`);
    });

    test('a ?Name owned by another procedure is labelled, not claimed as this one\'s', async () => {
        const text = await hoverOn('IF FIELD() = ?OnlyInOther', '?OnlyInOther');

        assert.ok(text.includes('?OnlyInOther'), `card must name the control; got:\n${text}`);
        assert.ok(text.includes('CHECK'), `card must report the control type; got:\n${text}`);
        assert.ok(/not in this procedure/i.test(text),
            `a control found outside the current procedure must say so; got:\n${text}`);
        assert.ok(text.includes('OtherProc'),
            `card must name the owning procedure; got:\n${text}`);
    });

    test('an ambiguous ?Name lists candidates instead of picking one', async () => {
        // ThirdProc declares no window, so its ?Cancel matches two unrelated windows.
        const text = await hoverOn('IF FIELD() = ?Cancel', '?Cancel');

        assert.ok(/2 windows/i.test(text),
            `an ambiguous field equate must report how many candidates exist; got:\n${text}`);
        assert.ok(text.includes('MyProc') && text.includes('OtherProc'),
            `both owning procedures must be listed; got:\n${text}`);
    });

    test('a ?Name that is declared nowhere produces no card', async () => {
        const text = await hoverOn('?NotDeclaredAnywhere', '?NotDeclaredAnywhere');

        assert.strictEqual(text, '',
            `an unresolvable field equate must stay silent rather than name something ` +
            `that merely shares its spelling; got:\n${text}`);
    });

    test('a ?Name inside a string literal is not a control reference', async () => {
        const text = await hoverOn("Msg = 'a ?Cancel inside", '?Cancel');

        assert.ok(!text.includes('BUTTON'),
            `text inside a string literal is not a field equate; got:\n${text}`);
    });

    test('the bare USE(?) anonymous-control marker produces no card', async () => {
        const line = lineOf('USE(?)');
        const got = hoverText(await provider.provideHover(
            doc, { line, character: LINES[line].indexOf('USE(?)') + 4 }));

        assert.ok(!got.includes('control'),
            `a bare ? names nothing, so there is nothing to resolve; got:\n${got}`);
    });

    test('the hover range covers the whole ?Name, sigil included', async () => {
        const line = lineOf('OF ?Cancel');
        const at = LINES[line].indexOf('?Cancel');
        const h = await provider.provideHover(doc, { line, character: at + 2 });

        assert.ok(h?.range, 'card must carry a range');
        assert.strictEqual(h!.range!.start.character, at,
            'range must start at the ? — excluding it under-highlights the reference');
        assert.strictEqual(h!.range!.end.character, at + '?Cancel'.length,
            'range must span the whole field equate');
    });
});

/**
 * The generated-ABC shape, which is where most `?Name` references actually live: the
 * procedure holds the WINDOW in its local data and its event handling in the methods
 * of a locally declared `WindowManager` subclass. A `?Name` inside such a method is
 * outside that method's own line range, so scoping to the innermost procedure alone
 * never resolves it — the method has to climb to the procedure whose local data
 * declared its CLASS.
 */
const ABC_SOURCE = [
    "  MEMBER('main')",
    '',
    'MyFormProc PROCEDURE (LONG pId)',
    '',
    "Window WINDOW('Form'),AT(,,200,140),GRAY",
    "       BUTTON('&OK'),AT(100,113,52,18),USE(?OkButton),DEFAULT",
    "       BUTTON('&Cancel'),AT(160,113,51,18),USE(?CancelButton),STD(STD:Close)",
    '     END',
    '',
    'ThisWindow           CLASS(WindowManager)',
    'Init                   PROCEDURE(),BYTE,PROC,DERIVED',
    'TakeAccepted           PROCEDURE(),BYTE,PROC,DERIVED',
    '                     END',
    '',
    '  CODE',
    '  ThisWindow.Run()',
    '',
    'ThisWindow.Init PROCEDURE',
    'ReturnValue          BYTE,AUTO',
    '  CODE',
    '  ReturnValue = PARENT.Init()',
    '  RETURN ReturnValue',
    '',
    'ThisWindow.TakeAccepted PROCEDURE',
    'ReturnValue          BYTE,AUTO',
    '  CODE',
    '  CASE ACCEPTED()',
    '  OF ?OkButton',
    '    SELECT(?CancelButton)',
    '  END',
    '  ReturnValue = PARENT.TakeAccepted()',
    '  RETURN ReturnValue',
].join('\n');

const ABC_URI = 'file:///c:/fixtures/field-equate-abc.clw';
const ABC_LINES = ABC_SOURCE.split('\n');

suite('Hover — ?Name field equates in generated-ABC local class methods', () => {
    let doc: TextDocument;
    let provider: HoverProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create(ABC_URI, 'clarion', 1, ABC_SOURCE);
        TokenCache.getInstance().getTokens(doc);
        provider = new HoverProvider();
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    function abcLineOf(marker: string): number {
        const hits = ABC_LINES.map((l, i) => (l.includes(marker) ? i : -1)).filter(i => i >= 0);
        assert.strictEqual(hits.length, 1,
            `fixture marker ${JSON.stringify(marker)} must match exactly one line, matched ${hits.length}`);
        return hits[0];
    }

    async function abcHoverOn(marker: string, feq: string): Promise<string> {
        const line = abcLineOf(marker);
        const at = ABC_LINES[line].indexOf(feq);
        assert.ok(at >= 0, `line must contain ${feq}`);
        return hoverText(await provider.provideHover(doc, { line, character: at + 2 }));
    }

    test('a ?Name used inside a local class method resolves to the procedure\'s window', async () => {
        const decl = abcLineOf("USE(?CancelButton)");
        const text = await abcHoverOn('SELECT(?CancelButton)', '?CancelButton');

        assert.ok(text.includes('?CancelButton') && text.includes('BUTTON'),
            `card must resolve the control; got:\n${text}`);
        assert.ok(text.includes(`:${decl + 1}]`),
            `card must point at the window's declaration (line ${decl + 1}); got:\n${text}`);
        assert.ok(!/not in this procedure/i.test(text),
            `the window belongs to the procedure declaring this method's CLASS — it is in scope, ` +
            `so the card must not disclaim it; got:\n${text}`);
    });

    test('a ?Name in a CASE label inside a local class method resolves too', async () => {
        const text = await abcHoverOn('OF ?OkButton', '?OkButton');

        assert.ok(text.includes('?OkButton') && text.includes('BUTTON'),
            `card must resolve the control; got:\n${text}`);
        assert.ok(text.includes('WINDOW'),
            `card must name the owning structure; got:\n${text}`);
    });
});
