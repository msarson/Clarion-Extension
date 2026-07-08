import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, Position } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { setServerInitialized } from '../serverState';

/**
 * #274 — a Clarion WINDOW may be labelled with the keyword itself (`Window WINDOW`).
 * Passed by name as a call argument (`INIMgr.Fetch('Main', Window)`), the tokenizer used to
 * drop the argument's leading character (`Window` → `indow`) because a reserved structure
 * keyword matched no identifier pattern and the no-match fallback advanced a single char.
 * The mangled `indow` classified as an unresolvable variable, so overload resolution fell to
 * match-all and hover/F12 picked the wrong (first-declared) overload.
 */

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
    return (c as { value?: string }).value ?? '';
}

const SRC = [
    '  PROGRAM',                                                 // 0
    '  MAP',                                                     // 1
    '  END',                                                     // 2
    '',                                                          // 3
    'INIManager  CLASS,TYPE',                                    // 4
    'Fetch         PROCEDURE(STRING section, STRING name)',      // 5  overload A (decoy, first)
    'Fetch         PROCEDURE(STRING section, WINDOW win)',       // 6  overload B (target)
    '            END',                                           // 7
    '',                                                          // 8
    "Window  WINDOW('Main'),AT(,,320,200)",                     // 9  label IS the WINDOW keyword
    '        END',                                               // 10
    '',                                                          // 11
    'INIMgr  INIManager',                                        // 12
    '',                                                          // 13
    '  CODE',                                                    // 14
    '',                                                          // 15
    'INIManager.Fetch  PROCEDURE(STRING section, STRING name)',  // 16
    '  CODE',                                                    // 17
    '  RETURN',                                                  // 18
    '',                                                          // 19
    'INIManager.Fetch  PROCEDURE(STRING section, WINDOW win)',   // 20
    '  CODE',                                                    // 21
    "  INIMgr.Fetch('Main', Window)",                           // 22  ← hover / F12 on Fetch
    '  RETURN',                                                  // 23
].join('\n');

suite('Hover — WINDOW-labelled argument overload resolution (#274)', () => {

    setup(() => { setServerInitialized(true); TokenCache.getInstance().clearAllTokens(); });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('the `Window` argument keeps its full text (no leading-char drop) in CODE', () => {
        const tokens = new ClarionTokenizer(SRC).tokenize();
        const argTok = tokens.find(t => t.line === 22 && t.type === TokenType.Variable &&
            t.value.toLowerCase() === 'window');
        assert.ok(argTok,
            'the Window argument must tokenize as a full Variable "Window"; ' +
            'a dropped leading char (`indow`) is the #274 bug');
    });

    test('resolveOverloadDeclByArgs picks the (STRING, WINDOW) overload for Fetch(\'Main\', Window)', async () => {
        const doc = TextDocument.create('file:///t274.clw', 'clarion', 1, SRC);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const picked = await new MethodOverloadResolver()
            .resolveOverloadDeclByArgs('INIManager', 'Fetch', doc, tokens, 22);
        assert.ok(picked, 'must resolve an overload (null means the Window arg never typed → match-all)');
        assert.strictEqual(picked!.line, 6,
            `expected the (STRING, WINDOW) declaration at line 6, got line ${picked!.line}`);
    });

    test('hover on Fetch shows the WINDOW overload, not the STRING,STRING decoy', async () => {
        const doc = TextDocument.create('file:///t274-hover.clw', 'clarion', 1, SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();
        const pos: Position = { line: 22, character: '  INIMgr.Fetch'.indexOf('Fetch') + 1 };
        const text = hoverText(await provider.provideHover(doc, pos)).toUpperCase();
        assert.ok(text.includes('WINDOW WIN') || text.includes('WINDOW'),
            `hover must show the (STRING, WINDOW) overload; got:\n${text}`);
        assert.ok(!/STRING SECTION, STRING NAME/.test(text),
            `hover must NOT show the STRING,STRING decoy overload; got:\n${text}`);
    });
});
