/**
 * #489 — data declared in a PROGRAM file's global data section is global to
 * every module of the program, yet hovered from INSIDE a procedure of that file
 * it was badged "📦 Module variable". From inside a procedure the hover tries
 * local scope, then "module-local variable in the current file", then global;
 * the second tier matches PROGRAM-level data too and its card hard-coded the
 * module badge, never asking the scope analyser — which the global card does
 * for the very same choice. The structure badge added to that route in #486
 * inherited the wording, so a PROGRAM-level FILE read "Module FILE structure".
 *
 * The badge must follow the declaration's real scope wherever the cursor is:
 * Global in a PROGRAM file, Module in a MEMBER file.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

suite('PROGRAM-level data keeps its global badge inside a procedure (#489)', () => {
    const program = [
        '  PROGRAM',                                        // 0
        '  MAP',                                            // 1
        'DiscoverRoot PROCEDURE()',                         // 2
        '  END',                                            // 3
        'batchMode  BYTE           ! --batch',              // 4 — PROGRAM global
        'Orders     FILE,DRIVER(\'TOPSPEED\'),PRE(ORD)',    // 5 — PROGRAM-level FILE
        'Record       RECORD',                              // 6
        'ID             LONG',                              // 7
        '             END',                                 // 8
        '           END',                                   // 9
        '  CODE',                                           // 10
        '  DiscoverRoot()',                                 // 11
        '',                                                 // 12
        'DiscoverRoot PROCEDURE()',                         // 13
        'x  LONG',                                          // 14
        '  CODE',                                           // 15
        '  if batchMode',                                   // 16 — use from inside a procedure
        '    open(Orders)',                                 // 17
        '  end',                                            // 18
    ].join('\n');

    const member = [
        "  MEMBER('main.clw')",                             // 0
        '  MAP',                                            // 1
        'Proc PROCEDURE()',                                 // 2
        '  END',                                            // 3
        'quiet  BYTE',                                      // 4 — MEMBER module data
        'Proc PROCEDURE()',                                 // 5
        '  CODE',                                           // 6
        '  if quiet',                                       // 7
        '  end',                                            // 8
    ].join('\n');

    const text = (h: unknown) => { const c = (h as { contents: unknown } | null)?.contents; return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '') };
    const badge = (t: string) => t.split('\n').find(l => /^(🔧|🔐|📦|🌍|🔷)/.test(l)) ?? '';

    async function hover(src: string, name: string, line: number, character: number): Promise<string> {
        setServerInitialized(true);
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        const doc = TextDocument.create(`test://${name}-489.clw`, 'clarion', 1, src);
        tc.getTokens(doc);
        const h = await new HoverProvider().provideHover(doc, Position.create(line, character));
        assert.ok(h, `expected a hover at ${line}:${character}`);
        return text(h);
    }

    test('a PROGRAM global hovered from inside a procedure is a Global variable', async () => {
        const t = await hover(program, 'prog', 16, 6); // batchMode
        assert.strictEqual(badge(t), '🌍 Global variable', `got badge "${badge(t)}" in:\n${t}`);
        assert.ok(t.includes('batchMode  BYTE'), `declaration line; got:\n${t}`);
    });

    test('a PROGRAM-level FILE hovered from inside a procedure is a Global FILE structure', async () => {
        const t = await hover(program, 'prog', 17, 10); // Orders
        assert.ok(/^🌍 Global FILE structure/.test(badge(t)), `got badge "${badge(t)}" in:\n${t}`);
    });

    test('sentinel: MEMBER module data hovered from inside a procedure stays a Module variable', async () => {
        const t = await hover(member, 'member', 7, 6); // quiet
        assert.strictEqual(badge(t), '📦 Module variable', `got badge "${badge(t)}" in:\n${t}`);
    });
});
