/**
 * #487 — a procedure declares `loc` twice: as a field of `FoundQ QUEUE,PRE(fq)`
 * (reachable only as `fq:loc`) and as a plain local. Hovering the bare `loc` at
 * a use site showed NOTHING, while F12 correctly landed on the local.
 *
 * SymbolFinderService.findLocalVariable took its first name match from the
 * symbol tree — the queue field — recognised (per #265) that a bare name cannot
 * reference a PRE()'d field, and then RETURNED NULL "deferring to outer scopes"
 * instead of moving on to the next candidate. The token-fallback scan that
 * already skips such fields never ran, so the real local was never found.
 *
 * Find All References from the local also listed the queue field's declaration:
 * the exact-match branch excluded other structures' field declarations only
 * when the symbol itself was field-scoped.
 *
 * Shape lifted from VitTransform.clw, DiscoverRoot (lines 946–989).
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

suite('Local shadowed by a same-named structure field (#487)', () => {
    const code = [
        '  PROGRAM',                                                  // 0
        '  MAP',                                                      // 1
        'DiscoverRoot PROCEDURE(*STRING pVerName)',                   // 2
        '  END',                                                      // 3
        '  CODE',                                                     // 4
        '',                                                           // 5
        'DiscoverRoot PROCEDURE(*STRING pVerName)',                   // 6
        'FoundQ QUEUE,PRE(fq)',                                       // 7
        'nm       string(24)',                                        // 8
        'loc      string(261)',                                       // 9  — fq:loc, a FIELD
        'ver      long',                                              // 10
        '       END',                                                 // 11
        'qx     long,auto',                                           // 12
        'loc    string(261)',                                         // 13 — the LOCAL
        '  code',                                                     // 14
        '  loop qx = 1 to records(FoundQ)',                           // 15
        '    get(FoundQ, qx)',                                        // 16
        "    loc = clip(fq:loc) & '\\'",                              // 17 — use (bare) + fq:loc (field)
        '    if loc',                                                 // 18 — use
        '      pVerName = loc',                                       // 19 — use
        '    end',                                                    // 20
        '  end',                                                      // 21
    ].join('\n');

    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        doc = TextDocument.create('test://shadowed-local-487.clw', 'clarion', 1, code);
        tc.getTokens(doc);
    });

    function hoverText(h: unknown): string {
        const c = (h as { contents: unknown } | null)?.contents;
        return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
    }

    test('control: F12 on the bare use lands on the local, not the queue field', async () => {
        const def = await new DefinitionProvider().provideDefinition(doc, Position.create(18, 8));
        const line = Array.isArray(def) ? def[0]?.range.start.line : (def as { range: { start: { line: number } } } | null)?.range.start.line;
        assert.strictEqual(line, 13, `F12 must land on the local at line 13; got ${line}`);
    });

    test('hover on the bare use shows the local, not nothing', async () => {
        for (const [l, c] of [[17, 5], [18, 8], [19, 17]] as const) {
            const h = await new HoverProvider().provideHover(doc, Position.create(l, c));
            const text = hoverText(h);
            assert.ok(h && text.includes('loc'), `line ${l}: expected the local's card; got ${h ? text : 'null'}`);
            assert.ok(/STRING\(261\)|string\(261\)/.test(text), `line ${l}: the local's type; got: ${text}`);
            assert.ok(!/fq:loc|PRE\(fq\)|Queue Field|`FoundQ`/i.test(text), `line ${l}: must not be the queue field's card; got: ${text}`);
        }
    });

    test('Find All References from the local excludes the queue field\'s declaration', async () => {
        const refs = await new ReferencesProvider().provideReferences(doc, Position.create(18, 8), { includeDeclaration: true });
        const lines = (refs ?? []).map(r => r.range.start.line).sort((a, b) => a - b);
        assert.ok(lines.includes(13), `the local's declaration; got [${lines.join(', ')}]`);
        assert.ok(lines.includes(17) && lines.includes(18) && lines.includes(19), `the three bare uses; got [${lines.join(', ')}]`);
        assert.ok(!lines.includes(9), `the fq:loc field declaration at line 9 is a different symbol; got [${lines.join(', ')}]`);
    });

    test('sentinel: hover on fq:loc still resolves the queue field', async () => {
        const h = await new HoverProvider().provideHover(doc, Position.create(17, 17)); // inside fq:loc
        const text = hoverText(h);
        assert.ok(h, 'fq:loc must still hover');
        assert.ok(/FoundQ|fq|Queue|field/i.test(text), `the field's card; got: ${text}`);
    });
});
