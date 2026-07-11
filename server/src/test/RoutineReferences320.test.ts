/**
 * #320 — routines as first-class navigation symbols, including `::` names.
 *
 * Template-generated code is full of routine labels containing `::`
 * (`Menu::MENUBAR1 ROUTINE`, `DO Menu::MENUBAR1`). The label tokenizes as ONE
 * Label token, but the DO site tokenizes as FOUR tokens (`Menu` `:` `:`
 * `MENUBAR1`), so token-value scans never match the full name.
 *
 * Empirical state before the fix (probe 2026-07-11):
 *   - FAR from a `::` DO site or label: label duplicated, DO site MISSED.
 *   - FAR on a simple-named routine: DO site found, label still duplicated.
 *   - Go-to-Implementation on the ROUTINE label itself: null (a routine's
 *     declaration IS its implementation — should return itself).
 *   - Hover + F12 already resolve `::` names (pinned here against regression).
 *
 * Scoping contract (#211/#264/#285): routine labels are procedure-local and
 * legally repeat across procedures — FAR must return only the owning
 * procedure's label + DO sites (bidirectional pin below).
 *
 * Prefix safety (Mark, 2026-07-11): single-colon words (`LOC:MyVar`) carry a
 * LOT of prefix logic — the routine route must never hijack them. Pinned.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';

function makeDoc(lines: string[], uri: string): TextDocument {
    const doc = TextDocument.create(uri, 'clarion', 1, lines.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

suite('Routine references #320 — :: names, dedup, scoping', () => {

    setup(() => setServerInitialized(true));

    teardown(() => TokenCache.getInstance().clearAllTokens());

    //                                                         line
    const FIXTURE = [
        "   MEMBER('ap1.clw')",                             // 0
        'ThisWindow.Init PROCEDURE',                        // 1
        'LOC:MyVar  LONG',                                  // 2
        '  CODE',                                           // 3
        '  DO Menu::MENUBAR1',                              // 4
        '  LOC:MyVar = 1',                                  // 5
        '  DO SimpleRoutine',                               // 6
        '  RETURN',                                         // 7
        'Menu::MENUBAR1 ROUTINE',                           // 8
        '  CODE',                                           // 9
        '  DO SimpleRoutine',                               // 10
        '  EXIT',                                           // 11
        'SimpleRoutine ROUTINE',                            // 12
        '  CODE',                                           // 13
        '  EXIT',                                           // 14
        'OtherProc PROCEDURE',                              // 15
        '  CODE',                                           // 16
        '  DO Menu::MENUBAR1',                              // 17
        '  RETURN',                                         // 18
        'Menu::MENUBAR1 ROUTINE',                           // 19
        '  CODE',                                           // 20
        '  EXIT',                                           // 21
    ];

    function lines(refs: { range: { start: { line: number } } }[] | null | undefined): number[] {
        return (refs ?? []).map(r => r.range.start.line).sort((a, b) => a - b);
    }

    suite('FAR', () => {
        test('from a :: DO site (cursor on first segment) returns label + all owning-procedure DO sites, each once', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/far1.clw');
            const refs = await new ReferencesProvider().provideReferences(
                doc, { line: 4, character: 6 }, { includeDeclaration: true });
            assert.deepStrictEqual(lines(refs), [4, 8],
                'expected exactly the DO site (4) and the label (8), each once');
        });

        test('from a :: DO site (cursor on second segment) returns the same set', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/far2.clw');
            const refs = await new ReferencesProvider().provideReferences(
                doc, { line: 4, character: 13 }, { includeDeclaration: true });
            assert.deepStrictEqual(lines(refs), [4, 8]);
        });

        test('from the :: ROUTINE label returns the same set (no duplicate declaration)', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/far3.clw');
            const refs = await new ReferencesProvider().provideReferences(
                doc, { line: 8, character: 3 }, { includeDeclaration: true });
            assert.deepStrictEqual(lines(refs), [4, 8]);
        });

        test('bidirectional scope pin: OtherProc same-name routine excluded; its own FAR excludes ThisWindow.Init sites', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/far4.clw');
            const fromFirst = await new ReferencesProvider().provideReferences(
                doc, { line: 4, character: 8 }, { includeDeclaration: true });
            assert.ok(!lines(fromFirst).includes(17) && !lines(fromFirst).includes(19),
                `OtherProc's DO/label must NOT appear; got [${lines(fromFirst).join(',')}]`);

            const fromOther = await new ReferencesProvider().provideReferences(
                doc, { line: 17, character: 8 }, { includeDeclaration: true });
            assert.deepStrictEqual(lines(fromOther), [17, 19],
                'OtherProc FAR returns only its own DO site + label');
        });

        test('simple-named routine: label not duplicated, DO sites from routine bodies included', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/far5.clw');
            const refs = await new ReferencesProvider().provideReferences(
                doc, { line: 6, character: 8 }, { includeDeclaration: true });
            assert.deepStrictEqual(lines(refs), [6, 10, 12],
                'expected DO in CODE (6), DO inside sibling routine body (10), label (12) — each once');
        });

        test('prefix safety: FAR on LOC:MyVar still resolves as a variable (routine route must not hijack single-colon words)', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/far6.clw');
            const refs = await new ReferencesProvider().provideReferences(
                doc, { line: 5, character: 4 }, { includeDeclaration: true });
            const got = lines(refs);
            assert.ok(got.includes(2) && got.includes(5),
                `LOC:MyVar FAR must include its declaration (2) and assignment (5); got [${got.join(',')}]`);
            assert.ok(!got.includes(8) && !got.includes(4),
                'routine lines must not leak into a prefixed-variable FAR');
        });
    });

    suite('Go-to-Implementation', () => {
        test('on the :: ROUTINE label returns the label itself (declaration IS the implementation)', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/impl1.clw');
            const impl = await new ImplementationProvider().provideImplementation(
                doc, { line: 8, character: 3 });
            const loc = Array.isArray(impl) ? impl[0] : impl;
            assert.ok(loc, 'implementation on a routine label must resolve');
            assert.strictEqual(loc!.range.start.line, 8);
        });

        test('from the :: DO site still resolves (pin)', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/impl2.clw');
            const impl = await new ImplementationProvider().provideImplementation(
                doc, { line: 4, character: 6 });
            const loc = Array.isArray(impl) ? impl[0] : impl;
            assert.strictEqual(loc?.range.start.line, 8);
        });
    });

    suite('F12 + hover pins (worked before #320 — must keep working)', () => {
        test('F12 from :: DO site (both segments) lands on the owning ROUTINE label', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/def1.clw');
            const dp = new DefinitionProvider();
            for (const character of [6, 13]) {
                const def = await dp.provideDefinition(doc, { line: 4, character });
                const loc = Array.isArray(def) ? def[0] : def;
                assert.strictEqual(loc?.range.start.line, 8, `cursor at char ${character}`);
            }
        });

        test('hover from :: DO site (both segments) shows the FULL routine name', async () => {
            const doc = makeDoc(FIXTURE, 'file:///c:/t320/hov1.clw');
            const hp = new HoverProvider();
            for (const character of [6, 13]) {
                const hover = await hp.provideHover(doc, { line: 4, character });
                const text = typeof hover?.contents === 'object' && 'value' in (hover!.contents as object)
                    ? (hover!.contents as { value: string }).value : String(hover?.contents ?? '');
                assert.ok(text.includes('Menu::MENUBAR1'),
                    `hover at char ${character} must name the full routine; got: ${text.slice(0, 120)}`);
            }
        });
    });
});
