import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { setServerInitialized } from '../serverState';

/**
 * Issue #243 — resolve a dotted-member / reference argument's TYPE so overload resolution
 * (here, signature help) selects the type-matching overload. `Self.Probs` is a reference
 * member (`Probs &problems`) to a QUEUE type; passing it should highlight the overload whose
 * parameter is that queue type (`*Problems`), NOT the unrelated `LONG` overload.
 *
 * Overloads are ordered LONG-first so a conservative match-all (which falls back to index 0)
 * cannot make this pass by accident — the correct answer is index 1.
 */
suite('SignatureHelpProvider — dotted-member / reference argument type (#243)', () => {
    setup(() => setServerInitialized(true));
    teardown(() => TokenCache.getInstance().clearAllTokens());

    // Single file: a QUEUE type, a class with a reference member to it, a global overload set
    // (LONG at index 0, *Problems at index 1), and a method calling DoIt(Self.Probs).
    const SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        'DoIt  PROCEDURE(LONG n)',         // 2  overload index 0
        'DoIt  PROCEDURE(*problems q)',    // 3  overload index 1
        '  END',                           // 4
        '',                                // 5
        'problems  QUEUE,TYPE',            // 6
        'Name        STRING(20)',          // 7
        '          END',                   // 8
        '',                                // 9
        'MyClass  CLASS,TYPE',             // 10
        'Probs      &problems',            // 11  reference member to the queue type
        'Run        PROCEDURE()',          // 12
        '         END',                    // 13
        '',                                // 14
        '  CODE',                          // 15
        '',                                // 16
        'MyClass.Run  PROCEDURE()',        // 17
        '  CODE',                          // 18
        '  DoIt(Self.Probs',               // 19  call site; cursor at end of line
    ].join('\n');

    test('Self.Probs (reference to a QUEUE type) highlights the *problems overload (index 1)', async () => {
        const doc = TextDocument.create('file:///member-arg-243.clw', 'clarion', 1, SRC);
        TokenCache.getInstance().getTokens(doc); // prime cache
        const provider = new SignatureHelpProvider();
        const cursor = { line: 19, character: '  DoIt(Self.Probs'.length };

        const result = await provider.provideSignatureHelp(doc, cursor);
        assert.ok(result, 'signature help must return a result');
        assert.ok(result!.signatures.length >= 2, `expected both overloads, got ${result!.signatures.length}`);
        assert.strictEqual(result!.activeSignature, 1,
            'Self.Probs should resolve to the queue type and highlight the *problems overload (index 1)');
    });

    // A direct reference-typed local variable (not dotted) exercises the resolveVariableType
    // (&-dereference) branch.
    const REF_VAR_SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        'DoIt  PROCEDURE(LONG n)',         // 2  index 0
        'DoIt  PROCEDURE(*problems q)',    // 3  index 1
        '  END',                           // 4
        '',                                // 5
        'problems  QUEUE,TYPE',            // 6
        'Name        STRING(20)',          // 7
        '          END',                   // 8
        '',                                // 9
        'Consume  PROCEDURE()',            // 10
        'lq         &problems',            // 11  local reference to the queue type
        '  CODE',                          // 12
        '  DoIt(lq',                       // 13  call site
    ].join('\n');

    test('a reference-typed local (lq &problems) highlights the *problems overload (index 1)', async () => {
        const doc = TextDocument.create('file:///member-arg-243b.clw', 'clarion', 1, REF_VAR_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(doc, { line: 13, character: '  DoIt(lq'.length });
        assert.ok(result && result.signatures.length >= 2, 'expected both overloads');
        assert.strictEqual(result!.activeSignature, 1,
            'a &problems reference variable should highlight the *problems overload');
    });

    // The ACTUAL reported repro: a built-in whose overloads are typed by structure KIND.
    // GET has 8 overloads; the QUEUE-first ones are indices 2/5/6/7, FILE ones are 0/1/3.
    // Self.Probs is a QUEUE, so the highlighted overload must have a QUEUE first parameter,
    // NOT the default FILE one (index 0).
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
        '  GET(Self.Probs',                // 17  call site (first arg is the queue)
    ].join('\n');

    test('GET(Self.Probs) highlights a QUEUE overload, not the FILE default (real repro)', async () => {
        const doc = TextDocument.create('file:///member-arg-243-get.clw', 'clarion', 1, GET_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(doc, { line: 17, character: '  GET(Self.Probs'.length });
        assert.ok(result && result.signatures.length >= 4, `expected GET overloads, got ${result?.signatures.length}`);
        const active = result!.signatures[result!.activeSignature as number];
        const label = (typeof active.label === 'string' ? active.label : '').toUpperCase();
        assert.ok(/\(\s*QUEUE\b/.test(label),
            `Self.Probs is a QUEUE — active overload first param must be QUEUE, got: ${active.label}`);
    });
});
