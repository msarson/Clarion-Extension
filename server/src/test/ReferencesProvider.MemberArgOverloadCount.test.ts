import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * Issue #246 — REGRESSION SENTINEL. Investigation found that Find-All-References ALREADY
 * resolves member / reference argument types (via its `lookupVarTypeAtLine` ctx) and
 * correctly attributes an overloaded call by argument type — no code change was needed
 * (the hypothesized gap didn't manifest; wiring FAR's hot loop onto the shared async
 * resolver was reverted as unnecessary). This test locks that accuracy so it can't
 * silently regress.
 *
 * `SELF.Setup(SELF.Probs)` where `Probs &problems` is a reference to a QUEUE type: the call
 * belongs to the `*problems` overload, NOT the `STRING` one. Bidirectional pin (per
 * feedback_bidirectional_pin_assertion): IN the *problems result, OUT of the STRING result.
 */
const FIXTURE = [
    'problems QUEUE,TYPE',                        // 0 — the queue type
    'Name STRING(20)',                            // 1
    '     END',                                   // 2
    '',                                           // 3
    'Widget CLASS,TYPE',                          // 4
    'Setup PROCEDURE(STRING s),VIRTUAL',          // 5 — STRING overload
    'Setup PROCEDURE(*problems q),VIRTUAL',       // 6 — *problems overload
    'DoWork PROCEDURE()',                         // 7
    'Probs  &problems',                           // 8 — reference member to the queue type
    '      END',                                  // 9
    '',                                           // 10
    'Widget.DoWork PROCEDURE()',                  // 11
    '  CODE',                                      // 12
    '  SELF.Setup(SELF.Probs)',                   // 13 — CALL SITE (queue-typed arg)
    '  RETURN',                                    // 14
].join('\n');

const URI = 'file:///246-member-arg-overload.clw';

suite('ReferencesProvider — overload count by member/reference arg type (#246)', () => {
    let provider: ReferencesProvider;
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });
    teardown(() => TokenCache.getInstance().clearTokens(URI));

    test('queue-typed member arg counts toward the *problems overload (IN)', async () => {
        const doc = TextDocument.create(URI, 'clarion', 1, FIXTURE);
        TokenCache.getInstance().getTokens(doc);
        const refs = await provider.provideReferences(doc, { line: 6, character: 0 }, { includeDeclaration: true });
        assert.ok(refs, 'FAR should return references for the *problems overload decl');
        const lines = refs!.map(r => r.range.start.line);
        assert.ok(lines.includes(13),
            `expected the SELF.Setup(SELF.Probs) call (line 13) IN the *problems-overload result; got [${lines.sort((a, b) => a - b).join(',')}]`);
    });

    test('queue-typed member arg does NOT count toward the STRING overload (OUT)', async () => {
        const doc = TextDocument.create(URI, 'clarion', 1, FIXTURE);
        TokenCache.getInstance().getTokens(doc);
        const refs = await provider.provideReferences(doc, { line: 5, character: 0 }, { includeDeclaration: true });
        assert.ok(refs, 'FAR should return references for the STRING overload decl');
        const lines = refs!.map(r => r.range.start.line);
        assert.ok(!lines.includes(13),
            `expected the queue-typed call (line 13) NOT in the STRING-overload result; got [${lines.sort((a, b) => a - b).join(',')}]`);
    });
});
