import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import {
    StructureDeclarationIndexer,
    StructureDeclarationInfo,
    StructureIndex,
} from '../utils/StructureDeclarationIndexer';

/**
 * Word completion never offered an EQUATE that was declared in another file.
 *
 * `collectEquates` read only DocumentStructure.getEquates(), which indexes the
 * tokens of the document being edited. A data-section `INCLUDE('Constants.inc')`
 * is not inlined into that token stream — only MAP-nested INCLUDEs are, via
 * ScopeAnalyzer.getMapTokensWithIncludes — so a constant the compiler resolves
 * through a plain INCLUDE (directly, or through the PROGRAM file for a MEMBER
 * module) was invisible to completion. Typing its leading characters produced
 * nothing, while the same name hovered and compiled fine.
 *
 * Fix under test: a second tier in `collectEquates` reading the EQUATE /
 * ITEMIZE_EQUATE entries StructureDeclarationIndexer already holds for the
 * project — the same tier-3 role the index plays for hover.
 *
 * SDI is prototype-stubbed (the #312 pattern) and SolutionManager is replaced
 * with a minimal stand-in, so the seam under test is exactly the completion
 * tier, with no disk fixture or solution load.
 */

const PROJECT_PATH = 'C:\\proj';

let docCounter = 0;
function makeDoc(content: string): TextDocument {
    return TextDocument.create(`file:///${PROJECT_PATH.replace(/\\/g, '/')}/test-pe-${++docCounter}.clw`, 'clarion', 1, content);
}

function makeProvider(document: TextDocument): WordCompletionProvider {
    const cache = TokenCache.getInstance();
    cache.getTokens(document); // prime the cache
    const scopeAnalyzer = new ScopeAnalyzer(cache, SolutionManager.getInstance());
    return new WordCompletionProvider(cache, scopeAnalyzer);
}

function decl(
    name: string,
    structureType: StructureDeclarationInfo['structureType'],
    lineContent: string,
    fileName = 'Constants.inc'
): StructureDeclarationInfo {
    return {
        name,
        filePath: `${PROJECT_PATH}\\${fileName}`,
        line: 0,
        structureType,
        isType: false,
        lineContent,
    };
}

/** A MEMBER module that references nothing — the EQUATEs live in the index only. */
const MEMBER_SOURCE = [
    "  MEMBER('MyProgram.clw')",
    '',
    'MyProc PROCEDURE()',
    'CODE',
    '  x = 1',
    'END',
].join('\n');

suite('WordCompletionProvider — project-wide EQUATEs', () => {

    let savedSm: unknown;
    let origIsIndexed: typeof StructureDeclarationIndexer.prototype.isIndexed;
    let origGetOrBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let indexed = true;
    let declarations: StructureDeclarationInfo[] = [];

    setup(() => {
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = {
            findProjectForFile: () => ({ path: PROJECT_PATH }),
            solution: { projects: [] },
        };

        indexed = true;
        declarations = [
            decl('UI_MAIN', 'EQUATE', 'UI_MAIN  EQUATE(7)'),
            decl('UI_DETAIL', 'EQUATE', 'UI_DETAIL  EQUATE(8)'),
            decl('UI_NOVALUE', 'EQUATE', 'UI_NOVALUE  EQUATE'),
            decl('Clr:Red', 'ITEMIZE_EQUATE', 'Red  EQUATE'),
            decl('UI_Settings', 'GROUP', 'UI_Settings  GROUP,TYPE', 'Types.inc'),
        ];

        origIsIndexed = StructureDeclarationIndexer.prototype.isIndexed;
        origGetOrBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.isIndexed = (() => indexed) as typeof origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async (): Promise<StructureIndex> => {
            const byName = new Map<string, StructureDeclarationInfo[]>();
            for (const d of declarations) {
                const key = d.name.toLowerCase();
                if (!byName.has(key)) byName.set(key, []);
                byName.get(key)!.push(d);
            }
            return { byName, lastIndexed: Date.now(), projectPath: PROJECT_PATH };
        }) as unknown as typeof origGetOrBuild;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.isIndexed = origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origGetOrBuild;
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
    });

    // ---------------------------------------------------------------------
    // The bug
    // ---------------------------------------------------------------------

    test('EQUATE declared in another file is offered for a typed prefix', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'UI_');
        const labels = items.map(i => String(i.label));
        assert.ok(
            labels.includes('UI_MAIN'),
            `Expected UI_MAIN from the project index. Got: ${labels.join(', ')}`);
        assert.ok(
            labels.includes('UI_DETAIL'),
            `Expected UI_DETAIL from the project index. Got: ${labels.join(', ')}`);
    });

    test('offered as Constant kind, with its value and declaring file', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'UI_');
        const item = items.find(i => String(i.label) === 'UI_MAIN');
        assert.ok(item, `Expected UI_MAIN. Got: ${items.map(i => i.label).join(', ')}`);
        assert.strictEqual(item!.kind, CompletionItemKind.Constant, `Expected Constant kind, got ${item!.kind}`);
        assert.strictEqual(item!.detail, 'EQUATE(7)', `Expected detail 'EQUATE(7)', got '${item!.detail}'`);
        assert.ok(
            String(item!.documentation).includes('Constants.inc'),
            `Expected the declaring file in documentation, got '${item!.documentation}'`);
    });

    test('a valueless EQUATE gets the bare EQUATE detail', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'UI_N');
        const item = items.find(i => String(i.label) === 'UI_NOVALUE');
        assert.ok(item, `Expected UI_NOVALUE. Got: ${items.map(i => i.label).join(', ')}`);
        assert.strictEqual(item!.detail, 'EQUATE', `Expected detail 'EQUATE', got '${item!.detail}'`);
    });

    test('ITEMIZE_EQUATE from the index resolves through the qualifier branch', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'Clr:R');
        // #507: qualifier mode lists the tail and carries the qualified name as detail.
        const item = items.find(i => String(i.label) === 'Red');
        assert.ok(item, `Expected the PRE-expanded Clr:Red. Got: ${items.map(i => i.label).join(', ')}`);
        assert.strictEqual(item!.detail, 'Clr:Red', `Expected detail 'Clr:Red', got '${item!.detail}'`);
    });

    // ---------------------------------------------------------------------
    // Guards — these hold with or without the fix
    // ---------------------------------------------------------------------

    test('guard: the document\'s own EQUATE still wins over an index entry of the same name', async () => {
        declarations = [decl('MAX_ROWS', 'EQUATE', 'MAX_ROWS  EQUATE(999)')];
        const doc = makeDoc([
            'MyProg PROGRAM',
            'MAX_ROWS EQUATE(100)',
            '',
            'MyProc PROCEDURE()',
            'CODE',
            '  x = MAX_ROWS',
            'END',
        ].join('\n'));
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 5, character: 10 }, 'MAX');
        const matches = items.filter(i => String(i.label) === 'MAX_ROWS');
        assert.strictEqual(matches.length, 1, `Expected one MAX_ROWS entry, got ${matches.length}`);
        assert.strictEqual(
            matches[0].detail, 'EQUATE(100)',
            `The local declaration must win; got '${matches[0].detail}'`);
    });

    test('guard: an empty prefix does not pull in the whole project index', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, '');
        const labels = items.map(i => String(i.label));
        assert.ok(
            !labels.includes('UI_MAIN'),
            'Project-wide EQUATEs must stay out of an unfiltered candidate list');
    });

    test('guard: a single typed character is below the prefix gate', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'U');
        const labels = items.map(i => String(i.label));
        assert.ok(!labels.includes('UI_MAIN'), `Expected no project EQUATEs for a 1-char prefix. Got: ${labels.join(', ')}`);
    });

    test('guard: non-EQUATE index entries are not offered as constants', async () => {
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'UI_S');
        const item = items.find(i => String(i.label) === 'UI_Settings');
        assert.strictEqual(item, undefined, 'A GROUP declaration must not surface as an EQUATE constant');
    });

    test('guard: an unbuilt index is skipped rather than awaited', async () => {
        indexed = false;
        let builds = 0;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async (): Promise<StructureIndex> => {
            builds++;
            return { byName: new Map(), lastIndexed: 0, projectPath: PROJECT_PATH };
        }) as unknown as typeof origGetOrBuild;

        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'UI_');
        assert.strictEqual(builds, 0, 'Completion must not trigger a cold index build');
        assert.ok(!items.map(i => String(i.label)).includes('UI_MAIN'), 'No project EQUATEs without an index');
    });

    test('guard: no owning project is handled without throwing', async () => {
        (SolutionManager as unknown as { instance: unknown }).instance = {
            findProjectForFile: () => undefined,
            solution: { projects: [] },
        };
        const doc = makeDoc(MEMBER_SOURCE);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 4, character: 8 }, 'UI_');
        assert.ok(!items.map(i => String(i.label)).includes('UI_MAIN'), 'No project EQUATEs without an owning project');
    });
});
