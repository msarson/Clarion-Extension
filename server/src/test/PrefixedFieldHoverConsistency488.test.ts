/**
 * #488 — one QUEUE field, two hover cards. On its declaration line the field
 * read "🔧 Field of local procedure QUEUE `FoundQ`" with the title `loc — string`;
 * at a qualified use (`fq:loc`) it read "🔧 Local procedure variable" with the
 * title `fq:loc — string(261)`. Same symbol, different kind, different type.
 *
 * The use-site route reaches the card without a parentStructure (the finder's
 * symbol-tree match does not carry one), and each route derived the title type
 * its own way. The hover builder now derives the owning structure from the
 * declaration token itself when the finder did not, and both routes take the
 * title type from the declaration line as written.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

suite('PRE()\'d field hover is the same card at declaration and use (#488)', () => {
    const code = [
        '  PROGRAM',                                        // 0
        '  MAP',                                            // 1
        'DiscoverRoot PROCEDURE()',                         // 2
        '  END',                                            // 3
        '  CODE',                                           // 4
        '',                                                 // 5
        'DiscoverRoot PROCEDURE()',                         // 6
        'FoundQ QUEUE,PRE(fq)',                             // 7
        'nm       string(24)',                              // 8
        'loc      string(261)',                             // 9  — the field
        '       END',                                       // 10
        'loc    string(261)',                               // 11 — a plain local of the same name
        'pick   long,auto',                                 // 12
        '  code',                                           // 13
        "  loc = clip(fq:loc) & '\\'",                      // 14 — qualified use of the field (PRE form)
        '  pick = 1',                                       // 15
        '  loc = FoundQ.loc',                               // 16 — qualified use of the field (dot form)
    ].join('\n');

    let doc: TextDocument;
    setup(() => {
        setServerInitialized(true);
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        doc = TextDocument.create('test://prefixed-field-488.clw', 'clarion', 1, code);
        tc.getTokens(doc);
    });

    const text = (h: unknown) => { const c = (h as { contents: unknown } | null)?.contents; return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? ''); };
    const badge = (t: string) => t.split('\n').find(l => /^(🔧|🔐|📦|🌍|🔷)/.test(l)) ?? '';
    const title = (t: string) => t.split('\n')[0];

    test('the qualified use fq:loc carries the field badge with its owner, not "Local procedure variable"', async () => {
        const t = text(await new HoverProvider().provideHover(doc, Position.create(14, 17)));
        assert.ok(/Field of local procedure QUEUE `FoundQ`/.test(badge(t)), `expected the field badge; got badge "${badge(t)}" in:\n${t}`);
        assert.ok(!/Local procedure variable/.test(t), `a field is not a variable; got:\n${t}`);
    });

    test('declaration and use agree on the title type', async () => {
        const decl = text(await new HoverProvider().provideHover(doc, Position.create(9, 1)));
        const use = text(await new HoverProvider().provideHover(doc, Position.create(14, 17)));
        const typeOf = (t: string) => (/— `([^`]+)`/.exec(title(t)) ?? [])[1];
        assert.strictEqual(typeOf(decl), 'string(261)', `declaration title type; got "${title(decl)}"`);
        assert.strictEqual(typeOf(use), 'string(261)', `use-site title type; got "${title(use)}"`);
        assert.strictEqual(badge(decl), badge(use), `badges must match; decl "${badge(decl)}" vs use "${badge(use)}"`);
    });

    test('the dot-form use FoundQ.loc is the same card as the PRE form and the declaration', async () => {
        // Clarion reaches a field as PRE:Field or as Structure.Field (Language
        // Reference, Field Qualification); the three cursors are one symbol.
        const decl = text(await new HoverProvider().provideHover(doc, Position.create(9, 1)));
        const dot = text(await new HoverProvider().provideHover(doc, Position.create(16, 16))); // on "loc" of FoundQ.loc
        assert.ok(dot.includes('loc'), `dot-form use must hover; got:\n${dot}`);
        assert.ok(/Field of local procedure QUEUE `FoundQ`/.test(badge(dot)), `expected the field badge; got badge "${badge(dot)}" in:\n${dot}`);
        assert.strictEqual(badge(dot), badge(decl), `badges must match; decl "${badge(decl)}" vs dot "${badge(dot)}"`);
        const typeOf = (t: string) => (/— `([^`]+)`/.exec(title(t)) ?? [])[1];
        assert.strictEqual(typeOf(dot), 'string(261)', `dot-form title type; got "${title(dot)}"`);
    });

    test('sentinel: the plain local of the same name is still a local procedure variable with its full type', async () => {
        const t = text(await new HoverProvider().provideHover(doc, Position.create(14, 3))); // bare loc
        assert.ok(/Local procedure variable/.test(badge(t)), `got badge "${badge(t)}" in:\n${t}`);
        assert.ok(title(t).includes('string(261)'), `title carries the sized type; got "${title(t)}"`);
        assert.ok(!/FoundQ/.test(t), `the local is not a field of FoundQ; got:\n${t}`);
    });

    test('sentinel: a sized scalar with an attribute shows its type without the attribute', async () => {
        const t = text(await new HoverProvider().provideHover(doc, Position.create(15, 3))); // pick
        assert.ok(/— `long`/i.test(title(t)), `expected "pick — long"; got "${title(t)}"`);
    });
});
