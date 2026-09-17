import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem } from 'vscode-languageserver/node';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import {
    StructureDeclarationIndexer,
    StructureDeclarationInfo,
    StructureIndex,
} from '../utils/StructureDeclarationIndexer';

/**
 * #555 — WordCompletionProvider set no `sortText` anywhere, so the client
 * ordered every candidate alphabetically and a project-wide EQUATE could
 * outrank a local variable on a shared prefix by pure alphabetical luck.
 *
 * Fix under test: one tier per source — locals and parameters, then module and
 * PROGRAM data, then MAP procedures, then project-wide index entries, then the
 * static catalogs — stamped as a padded `sortText` prefix, alphabetical within
 * each tier.
 *
 * The fixture is a real PROGRAM + MEMBER pair on disk (the #565 pattern, since
 * PROGRAM globals are read from the file) plus a prototype-stubbed SDI and
 * SolutionManager (the #312/#554 pattern, so the project-wide tier answers
 * without a solution load). All three tiers therefore have one candidate
 * sharing the prefix `UI_`.
 */

const PREFIX = 'UI_';

suite('Word completion ranks candidates by scope tier (#555)', () => {
    let dir = '';
    let savedSm: unknown;
    let origIsIndexed: typeof StructureDeclarationIndexer.prototype.isIndexed;
    let origGetOrBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let memberDoc: TextDocument;
    let provider: WordCompletionProvider;

    setup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc555-'));

        const program = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'UI_Global           LONG',
            '  CODE',
            '',
        ].join('\r\n');
        fs.writeFileSync(path.join(dir, 'prog.clw'), program);

        const memberText = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'Work PROCEDURE()',
            'UI_Local            LONG',
            '  CODE',
            '  UI_Local = 1',
            '',
        ].join('\r\n');
        fs.writeFileSync(path.join(dir, 'mod.clw'), memberText);

        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = {
            findProjectForFile: () => ({ path: dir }),
            solution: { projects: [] },
        };
        FileRelationshipGraph.getInstance().reset();

        // Project-wide tier: one EQUATE that exists only in the index.
        const declarations: StructureDeclarationInfo[] = [{
            name: 'UI_Indexed',
            filePath: path.join(dir, 'Constants.inc'),
            line: 0,
            structureType: 'EQUATE',
            isType: false,
            lineContent: 'UI_Indexed  EQUATE(9)',
        }];
        origIsIndexed = StructureDeclarationIndexer.prototype.isIndexed;
        origGetOrBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.isIndexed = (() => true) as typeof origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async (): Promise<StructureIndex> => {
            const byName = new Map<string, StructureDeclarationInfo[]>();
            for (const d of declarations) byName.set(d.name.toLowerCase(), [d]);
            return { byName, lastIndexed: Date.now(), projectPath: dir };
        }) as unknown as typeof origGetOrBuild;

        const cache = TokenCache.getInstance();
        memberDoc = TextDocument.create(
            `file:///${path.join(dir, 'mod.clw').replace(/\\/g, '/')}`, 'clarion', 1, memberText);
        cache.getTokens(memberDoc);
        provider = new WordCompletionProvider(cache, new ScopeAnalyzer(cache, SolutionManager.getInstance()));
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.isIndexed = origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origGetOrBuild;
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const find = (items: CompletionItem[], label: string): CompletionItem => {
        const item = items.find(i => String(i.label).toUpperCase() === label.toUpperCase());
        assert.ok(item, `expected a candidate named ${label}; got: ${items.map(i => i.label).join(', ')}`);
        return item!;
    };

    test('a local, a PROGRAM global and a project-wide EQUATE sharing a prefix sort in that order', async () => {
        const items = await provider.provide(memberDoc, { line: 6, character: 10 }, PREFIX);

        const local = find(items, 'UI_Local');
        const global = find(items, 'UI_Global');
        const indexed = find(items, 'UI_Indexed');

        assert.ok(local.sortText, 'local candidate has no sortText');
        assert.ok(global.sortText, 'PROGRAM global candidate has no sortText');
        assert.ok(indexed.sortText, 'project-wide candidate has no sortText');

        assert.ok(
            local.sortText! < global.sortText!,
            `local should sort before the PROGRAM global: ${local.sortText} vs ${global.sortText}`);
        assert.ok(
            global.sortText! < indexed.sortText!,
            `PROGRAM global should sort before the project-wide EQUATE: ${global.sortText} vs ${indexed.sortText}`);
    });

    test('each tier ranks as one block, alphabetical inside itself regardless of case', async () => {
        const items = await provider.provide(memberDoc, { line: 6, character: 10 }, '');

        // What the client does: order by sortText. The server emits in
        // collection order, so the ranking only exists once it is sorted.
        const ranked = [...items].sort((a, b) => (a.sortText ?? '').localeCompare(b.sortText ?? ''));

        const tierOf = (item: CompletionItem) => (item.sortText ?? '').split('_')[0];
        const seenTiers: string[] = [];
        let previousTier = '';
        let previousLabel = '';

        for (const item of ranked) {
            const tier = tierOf(item);
            const label = String(item.label);

            if (tier !== previousTier) {
                // A tier must be one contiguous block — never revisited later.
                assert.ok(!seenTiers.includes(tier),
                    `tier ${tier} appears in more than one block: ${seenTiers.join(', ')}, ${tier}`);
                seenTiers.push(tier);
                previousTier = tier;
                previousLabel = '';
            }

            // Case-insensitive, because Clarion is: without normalising the label
            // half, every capitalised name would sort ahead of every lowercase one
            // inside the same tier instead of interleaving alphabetically.
            assert.ok(previousLabel.toLowerCase() <= label.toLowerCase(),
                `tier ${tier} out of alphabetical order: ${previousLabel} before ${label}`);
            previousLabel = label;
        }

        assert.ok(seenTiers.length >= 3,
            `expected several tiers to be represented; got ${seenTiers.join(', ')}`);
    });

    test('every candidate carries a sortText, so none is ranked by its bare label', async () => {
        const items = await provider.provide(memberDoc, { line: 6, character: 10 }, '');
        const untiered = items.filter(i => !i.sortText).map(i => String(i.label));
        assert.deepStrictEqual(untiered, [],
            `every candidate needs a tier or it sinks below the tiered ones: ${untiered.slice(0, 10).join(', ')}`);
    });
});
