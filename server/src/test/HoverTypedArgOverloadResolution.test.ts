import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, Position } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { setServerInitialized } from '../serverState';

/**
 * #252 — hover did NO argument-type enrichment: `classifyArguments` ran with no
 * ctx and no ArgumentTypeResolver pass, so a TYPED argument (dotted member,
 * reference, typed local) classified as unknown → match-all → arity fallback →
 * FIRST-DECLARED overload shown, while F12 (which enriches) jumped to the
 * type-matched one. Same cursor, two answers.
 *
 * The #182 suite pins LITERAL-arg hover overloads (those classify from the
 * token stream alone); THIS suite pins the typed-arg dimension through the
 * converged choke point (`MethodOverloadResolver.resolveOverloadDeclByArgs`,
 * which now enriches via the shared ArgumentTypeResolver).
 *
 * Discriminators: `AddProb PROCEDURE(STRING msg)` vs
 * `AddProb PROCEDURE(*Problems other)` — same arity, distinguishable only by
 * the argument's TYPE. Decoy declared FIRST so arity fallback cannot pass the
 * test by accident.
 */

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
    return (c as { value?: string }).value ?? '';
}

const CODE = [
    'Problems CLASS,TYPE',                          // 0
    'AddProb    PROCEDURE(STRING msg)',             // 1  decoy (first-declared)
    'AddProb    PROCEDURE(*Problems other)',        // 2  ← expected pick
    'Probs      &Problems',                         // 3  reference member
    '         END',                                 // 4
    '',                                             // 5
    'Problems.AddProb PROCEDURE(STRING msg)',       // 6
    '  CODE',                                       // 7
    '  RETURN',                                     // 8
    '',                                             // 9
    'Problems.AddProb PROCEDURE(*Problems other)',  // 10
    '  CODE',                                       // 11
    '  SELF.AddProb(SELF.Probs)',                   // 12 ← hover here
    '  RETURN',                                     // 13
].join('\n');

suite('Hover — typed-argument overload resolution (#252)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('resolveOverloadDeclByArgs types SELF.Probs and picks the *Problems overload (choke point)', async () => {
        const doc = TextDocument.create('file:///t252-unit.clw', 'clarion', 1, CODE);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const resolver = new MethodOverloadResolver();

        const picked = await resolver.resolveOverloadDeclByArgs('Problems', 'AddProb', doc, tokens, 12);
        assert.ok(picked,
            'the choke point must type SELF.Probs (→ Problems) and disambiguate — ' +
            'null means the argument classified as unknown (no enrichment) and fell to match-all');
        assert.strictEqual(picked!.line, 2,
            `expected the *Problems overload (line 2), got line ${picked!.line}`);
    });

    test('hover on SELF.AddProb(SELF.Probs) shows the *Problems overload, agreeing with F12', async () => {
        const doc = TextDocument.create('file:///t252-hover.clw', 'clarion', 1, CODE);
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();
        const pos: Position = { line: 12, character: '  SELF.AddProb'.indexOf('AddProb') + 1 };

        const text = hoverText(await provider.provideHover(doc, pos));
        assert.ok(text.includes('*Problems other'),
            `hover must show the *Problems overload; got:\n${text}`);
        assert.ok(!text.includes('STRING msg'),
            `hover must NOT show the first-declared STRING decoy; got:\n${text}`);
    });

    test('typed-var receiver path: hover on inst.AddProb(ref) picks by the reference arg type', async () => {
        const VAR_CODE = [
            'Problems CLASS,TYPE',                          // 0
            'AddProb    PROCEDURE(STRING msg)',             // 1  decoy
            'AddProb    PROCEDURE(*Problems other)',        // 2  ← expected
            '         END',                                 // 3
            '',                                             // 4
            'Problems.AddProb PROCEDURE(STRING msg)',       // 5
            '  CODE',                                       // 6
            '  RETURN',                                     // 7
            '',                                             // 8
            'Problems.AddProb PROCEDURE(*Problems other)',  // 9
            '  CODE',                                       // 10
            '  RETURN',                                     // 11
            '',                                             // 12
            'MainProc PROCEDURE',                           // 13
            'inst       Problems',                          // 14
            'ref        &Problems',                         // 15
            '  CODE',                                       // 16
            '  inst.AddProb(ref)',                          // 17 ← hover here
            '  RETURN',                                     // 18
        ].join('\n');
        const doc = TextDocument.create('file:///t252-var.clw', 'clarion', 1, VAR_CODE);
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();
        const pos: Position = { line: 17, character: '  inst.AddProb'.indexOf('AddProb') + 1 };

        const text = hoverText(await provider.provideHover(doc, pos));
        assert.ok(text.includes('*Problems other'),
            `hover must show the *Problems overload for a &Problems argument; got:\n${text}`);
        assert.ok(!text.includes('STRING msg'),
            `hover must NOT show the STRING decoy; got:\n${text}`);
    });
});
