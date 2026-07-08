import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, Position } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * #272 — hovering an overloaded built-in keyword/statement (ADD, GET, PUT, …)
 * must resolve WHICH overload applies from the call-site argument types and show
 * only that one, instead of listing every FILE/QUEUE/VIEW candidate.
 *
 * Signature help already does this via the shared argument-classification stack
 * (CallSiteArgumentClassifier → ArgumentTypeResolver → MethodOverloadResolver);
 * see Providers.SignatureHelpMemberArg.test.ts's GET(Self.Probs) case. This suite
 * pins the SAME convergence for hover.
 *
 * Discriminator: the first argument is a QUEUE instance, so the FILE-first
 * overloads must be filtered out. A dotted-member arg (`Self.Probs`) is used so
 * the pre-#272 crude `firstArgType` narrowing (which only reads a bare first-arg
 * Label's structureType) cannot pass the test by accident — it resolves nothing
 * for a dotted path and falls through to showing ALL overloads.
 */

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
    return (c as { value?: string }).value ?? '';
}

suite('Hover — built-in overload resolution from argument types (#272)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    // A named QUEUE type, a class holding a reference member to it, and a complete
    // GET(queue, position) call. GET's QUEUE+LONG overload is index 2; the FILE
    // overloads are 0/1/3.
    const GET_SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        '  END',                           // 2
        '',                                // 3
        'problems  QUEUE,TYPE',            // 4
        'Name        STRING(20)',          // 5
        '          END',                   // 6
        '',                                // 7
        'ThisWindow  CLASS,TYPE',          // 8
        'Probs         &problems',         // 9
        'Init          PROCEDURE()',       // 10
        '            END',                 // 11
        '',                                // 12
        '  CODE',                          // 13
        '',                                // 14
        'ThisWindow.Init  PROCEDURE()',    // 15
        '  CODE',                          // 16
        '  GET(Self.Probs, 1)',            // 17  ← hover on GET
    ].join('\n');

    test('GET(Self.Probs, 1) resolves to the QUEUE overload, hiding the FILE overloads', async () => {
        const doc = TextDocument.create('file:///hover-builtin-272-get.clw', 'clarion', 1, GET_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();
        const pos: Position = { line: 17, character: '  GET'.indexOf('GET') + 1 };

        const text = hoverText(await provider.provideHover(doc, pos)).toUpperCase();
        assert.ok(text.includes('QUEUE QUEUE'),
            `hover must show the QUEUE overload (QUEUE queue, LONG position); got:\n${text}`);
        assert.ok(!text.includes('FILE FILE'),
            `hover must NOT show the FILE overloads once the arg is a QUEUE; got:\n${text}`);
    });

    // A plain QUEUE-typed local + a single-arg ADD. ADD's QUEUE overload is index 2,
    // the FILE overload is index 0.
    const ADD_SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        '  END',                           // 2
        '',                                // 3
        'problems  QUEUE,TYPE',            // 4
        'Name        STRING(20)',          // 5
        '          END',                   // 6
        '',                                // 7
        'MainProc  PROCEDURE',             // 8
        'q           problems',            // 9   instance of the queue type
        '  CODE',                          // 10
        '  ADD(q)',                        // 11  ← hover on ADD
    ].join('\n');

    test('ADD(q) with a QUEUE-typed local resolves to the QUEUE overload', async () => {
        const doc = TextDocument.create('file:///hover-builtin-272-add.clw', 'clarion', 1, ADD_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();
        const pos: Position = { line: 11, character: '  ADD'.indexOf('ADD') + 1 };

        const text = hoverText(await provider.provideHover(doc, pos)).toUpperCase();
        assert.ok(text.includes('QUEUE QUEUE'),
            `hover must show ADD's QUEUE overload; got:\n${text}`);
        assert.ok(!text.includes('FILE FILE'),
            `hover must NOT show ADD's FILE overload for a QUEUE arg; got:\n${text}`);
    });

    // The reported repro: members typed as an INLINE structure-kind reference (`&WINDOW`) —
    // there is no named user TYPE, so the kind itself (WINDOW) is the overload discriminator.
    // OPEN's two-WINDOW overload is index 4; the other two-arg overloads are FILE+LONG (1) and
    // APPLICATION+WINDOW (6). Both arguments are dotted members, so the legacy `firstArgType`
    // narrowing resolves nothing and (pre-fix) hover fell back to listing all three.
    const OPEN_WINDOW_SRC = [
        '  PROGRAM',                                 // 0
        '  MAP',                                     // 1
        '  END',                                     // 2
        '',                                          // 3
        'ThisWindow  CLASS,TYPE',                    // 4
        'MyWindow      &WINDOW',                     // 5
        'OwnerWindow   &WINDOW',                     // 6
        'Init          PROCEDURE()',                 // 7
        '            END',                           // 8
        '',                                          // 9
        '  CODE',                                    // 10
        '',                                          // 11
        'ThisWindow.Init  PROCEDURE()',              // 12
        '  CODE',                                    // 13
        '  OPEN(SELF.MyWindow, SELF.OwnerWindow)',   // 14  ← hover on OPEN
    ].join('\n');

    test('OPEN(SELF.MyWindow, SELF.OwnerWindow) with &WINDOW members resolves to the WINDOW+WINDOW overload', async () => {
        const doc = TextDocument.create('file:///hover-builtin-272-open.clw', 'clarion', 1, OPEN_WINDOW_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();
        const pos: Position = { line: 14, character: '  OPEN'.indexOf('OPEN') + 1 };

        const text = hoverText(await provider.provideHover(doc, pos)).toUpperCase();
        assert.ok(text.includes('WINDOW WINDOW') && text.includes('WINDOW OWNER'),
            `hover must resolve to OPEN(WINDOW window, WINDOW owner); got:\n${text}`);
        assert.ok(!text.includes('FILE FILE') && !text.includes('APPLICATION APP'),
            `hover must NOT show the FILE or APPLICATION overloads for &WINDOW args; got:\n${text}`);
    });
});
