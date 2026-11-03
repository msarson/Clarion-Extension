import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { FileRelationshipGraph } from '../FileRelationshipGraph';

/**
 * A MEMBER module that INCLUDEs a class header in its own data section sees the header's types
 * and globals, and hover resolves them, but word completion only followed the PROGRAM's
 * data-section INCLUDEs — never the module's own. So `Wdg_ItemQType` below could be hovered
 * and compiled, and typing `Wdg_` offered nothing.
 *
 * The fix follows the module's own data-section INCLUDEs with the same rule as the PROGRAM's:
 * one level deep, column-0 labels only, the header's EQUATEs left to the project-wide tier.
 */
suite('Word completion offers globals from the module\'s own data-section INCLUDEs', () => {
    let dir = '';
    let savedSm: unknown;
    let memberDoc: TextDocument;
    let provider: WordCompletionProvider;
    let headerUri = '';

    const header = (extraLabel: string) => [
        "  INCLUDE('nested.inc'),ONCE",
        'Wdg_ItemQType       QUEUE,TYPE',
        'ItemText              STRING(255)',
        '                    END',
        'Wdg_Settings        GROUP,TYPE',
        'Width                 LONG',
        '                    END',
        'WidgetClass         CLASS,TYPE',
        'Items                 &Wdg_ItemQType',
        'Init                  PROCEDURE()',
        '                    END',
        'Wdg_MaxItems        EQUATE(50)',
        `${extraLabel}       LONG`,
        '',
    ].join('\r\n');

    suiteSetup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcmodinc-'));
        fs.writeFileSync(path.join(dir, 'widget.inc'), header('Wdg_Before'));
        fs.writeFileSync(path.join(dir, 'nested.inc'), 'Wdg_Nested          LONG\r\n');
        fs.writeFileSync(path.join(dir, 'protos.inc'), 'Wdg_Proto           PROCEDURE()\r\n');
        fs.writeFileSync(path.join(dir, 'prog.clw'), [
            '  PROGRAM',
            '  MAP',
            '  END',
            '  CODE',
            '',
        ].join('\r\n'));
        const memberText = [
            "  MEMBER('prog.clw')",
            '  MAP',
            "    INCLUDE('protos.inc')",
            '  END',
            "  INCLUDE('widget.inc'),ONCE",
            'Work PROCEDURE()',
            'Q  &Wdg_ItemQType',
            '  CODE',
            '  Q &= NEW(Wdg_',
            '',
        ].join('\r\n');
        fs.writeFileSync(path.join(dir, 'mod.clw'), memberText);
        headerUri = `file:///${path.join(dir, 'widget.inc').replace(/\\/g, '/')}`;

        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        FileRelationshipGraph.getInstance().reset();

        const cache = TokenCache.getInstance();
        memberDoc = TextDocument.create(`file:///${path.join(dir, 'mod.clw').replace(/\\/g, '/')}`, 'clarion', 1, memberText);
        cache.getTokens(memberDoc);
        provider = new WordCompletionProvider(cache, new ScopeAnalyzer(cache, SolutionManager.getInstance()));
    });

    suiteTeardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const labels = async (partial: string) =>
        (await provider.provide(memberDoc, { line: 8, character: 11 + partial.length }, partial))
            .map(i => String(i.label).toLowerCase());

    test('a QUEUE,TYPE declared in the module\'s INCLUDE is offered', async () => {
        const got = await labels('Wdg_I');
        assert.ok(got.includes('wdg_itemqtype'), `expected Wdg_ItemQType among: ${got.slice(0, 20).join(', ')}`);
    });

    test('a GROUP,TYPE and a CLASS,TYPE from the same INCLUDE are offered', async () => {
        assert.ok((await labels('Wdg_S')).includes('wdg_settings'), 'Wdg_Settings');
        assert.ok((await labels('Widget')).includes('widgetclass'), 'WidgetClass');
    });

    test('fields and class members of the header are not offered as globals', async () => {
        const got = await labels('It');
        assert.ok(!got.includes('itemtext'), got.slice(0, 20).join(', '));
        assert.ok(!got.includes('items'), got.slice(0, 20).join(', '));
    });

    test('the header\'s EQUATEs are not added by this path', async () => {
        const got = await labels('Wdg_M');
        assert.ok(!got.some(l => l === 'wdg_maxitems'), got.slice(0, 20).join(', '));
    });

    test('scope pin: an INCLUDE two levels down is not followed', async () => {
        const got = await labels('Wdg_N');
        assert.ok(!got.includes('wdg_nested'), got.slice(0, 20).join(', '));
    });

    test('an edit to the header replaces its globals instead of replaying stale ones', async () => {
        assert.ok((await labels('Wdg_B')).includes('wdg_before'), 'warm-up: Wdg_Before offered');
        TokenCache.getInstance().getTokens(TextDocument.create(headerUri, 'clarion', 2, header('Wdg_After')));
        const after = await labels('Wdg_A');
        assert.ok(after.includes('wdg_after'), after.slice(0, 20).join(', '));
        const before = await labels('Wdg_B');
        assert.ok(!before.includes('wdg_before'), before.slice(0, 20).join(', '));
    });
});
