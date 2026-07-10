/**
 * #312 — ClassConstantsCodeActionProvider hot-path pins.
 *
 * VS Code fires a code-action request on every cursor move. Resting on an
 * INCLUDE line: (a) awaited sdi.getOrBuildIndex with NO index-ready guard —
 * during startup this coalesced onto the in-flight build (seven stacked
 * requests at 2.9-5.7s each on the VM trace); (b) re-parsed the class file and
 * re-checked project constants on every request (~150-270ms steady-state).
 *
 * Pins:
 *   1. Index not built → no getOrBuildIndex await, fast empty result.
 *   2. Same (uri, version, includeFile) → constants parsed once (memo).
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CancellationToken } from 'vscode-languageserver';
import { ClassConstantsCodeActionProvider } from '../providers/ClassConstantsCodeActionProvider';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { ClassConstantParser } from '../utils/ClassConstantParser';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { setServerInitialized } from '../serverState';

const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => { /* noop */ } })
} as CancellationToken;

function makeDoc(version: number): TextDocument {
    return TextDocument.create('file:///c:/proj/test312.clw', 'clarion', version, [
        '  PROGRAM',
        "  INCLUDE('WidgetClass.inc'),ONCE",
        '  MAP',
        '  END',
        '  CODE',
    ].join('\n'));
}

// Cursor on the INCLUDE line.
const includeLineRange = {
    start: { line: 1, character: 12 },
    end: { line: 1, character: 12 }
};

suite('ClassConstantsCodeActionProvider #312 — INCLUDE-line hot path', () => {

    let origIsIndexed: typeof StructureDeclarationIndexer.prototype.isIndexed;
    let origGetOrBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let origFindInFile: typeof StructureDeclarationIndexer.prototype.findInFile;
    let origParseFile: typeof ClassConstantParser.prototype.parseFile;
    let getOrBuildCalls: number;
    let parseFileCalls: number;

    suiteSetup(() => setServerInitialized(true));

    setup(() => {
        origIsIndexed = StructureDeclarationIndexer.prototype.isIndexed;
        origGetOrBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        origFindInFile = StructureDeclarationIndexer.prototype.findInFile;
        origParseFile = ClassConstantParser.prototype.parseFile;
        getOrBuildCalls = 0;
        parseFileCalls = 0;

        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async function (this: unknown, p: string) {
            getOrBuildCalls++;
            return { byName: new Map(), lastIndexed: 0, projectPath: p };
        }) as typeof origGetOrBuild;
        StructureDeclarationIndexer.prototype.findInFile = ((fileName: string) =>
            fileName.toLowerCase() === 'widgetclass.inc'
                ? [{ name: 'WidgetClass', filePath: 'c:\\proj\\WidgetClass.inc', line: 0, structureType: 'CLASS', isType: false, lineContent: 'WidgetClass CLASS' } as StructureDeclarationInfo]
                : []
        ) as typeof origFindInFile;
        ClassConstantParser.prototype.parseFile = (async () => {
            parseFileCalls++;
            return [{ className: 'WidgetClass', constants: [] }];
        }) as unknown as typeof origParseFile;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.isIndexed = origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origGetOrBuild;
        StructureDeclarationIndexer.prototype.findInFile = origFindInFile;
        ClassConstantParser.prototype.parseFile = origParseFile;
    });

    test('index not built: INCLUDE-line path returns without awaiting the build', async () => {
        StructureDeclarationIndexer.prototype.isIndexed = (() => false) as typeof origIsIndexed;

        const provider = new ClassConstantsCodeActionProvider();
        const actions = await provider.provideCodeActions(makeDoc(1), includeLineRange as never, { diagnostics: [] } as never, token);

        assert.deepStrictEqual(actions, [], 'no actions while the index is building');
        assert.strictEqual(getOrBuildCalls, 0,
            `cursor-rest on an INCLUDE line must NOT coalesce onto the in-flight index build (getOrBuildIndex called ${getOrBuildCalls}x)`);
    });

    // #312 part 2 — the word-at-cursor path (non-INCLUDE lines) ran its include-chain
    // walk (isClassIncluded) per cursor move; pin that it memoizes too.
    test('word path: repeated requests on the same word verify includes once', async () => {
        StructureDeclarationIndexer.prototype.isIndexed = (() => true) as typeof origIsIndexed;
        const origFind = StructureDeclarationIndexer.prototype.find;
        const origIsClassIncluded = IncludeVerifier.prototype.isClassIncluded;
        let isIncludedCalls = 0;
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widgetusage'
                ? [{ name: 'WidgetUsage', filePath: 'c:\\proj\\WidgetUsage.inc', line: 0, structureType: 'CLASS', isType: false, lineContent: 'WidgetUsage CLASS' } as StructureDeclarationInfo]
                : []
        ) as typeof origFind;
        IncludeVerifier.prototype.isClassIncluded = (async () => {
            isIncludedCalls++;
            return true;
        }) as typeof origIsClassIncluded;

        try {
            // Cursor on "WidgetUsage" in a CODE line (line 4 col 3) — not an INCLUDE line.
            const doc = TextDocument.create('file:///c:/proj/word312.clw', 'clarion', 1, [
                '  PROGRAM',
                '  MAP',
                '  END',
                '  CODE',
                '  WidgetUsage',
            ].join('\n'));
            const wordRange = { start: { line: 4, character: 4 }, end: { line: 4, character: 4 } };

            for (let i = 0; i < 5; i++) {
                const p = new ClassConstantsCodeActionProvider();
                await p.provideCodeActions(doc, wordRange as never, { diagnostics: [] } as never, token);
            }
            assert.strictEqual(isIncludedCalls, 1,
                `word path must memoize per (uri, version, word) — isClassIncluded ran ${isIncludedCalls}x for 5 identical requests`);
        } finally {
            StructureDeclarationIndexer.prototype.find = origFind;
            IncludeVerifier.prototype.isClassIncluded = origIsClassIncluded;
        }
    });

    test('memo: same document version parses constants once across repeated requests', async () => {
        StructureDeclarationIndexer.prototype.isIndexed = (() => true) as typeof origIsIndexed;

        const doc = makeDoc(2);
        const provider = new ClassConstantsCodeActionProvider();
        await provider.provideCodeActions(doc, includeLineRange as never, { diagnostics: [] } as never, token);
        const callsAfterFirst = parseFileCalls;
        assert.ok(callsAfterFirst >= 1, 'first request does the real work');

        // Fresh provider instance per request — mirrors server.ts.
        for (let i = 0; i < 5; i++) {
            const p = new ClassConstantsCodeActionProvider();
            await p.provideCodeActions(doc, includeLineRange as never, { diagnostics: [] } as never, token);
        }
        assert.strictEqual(parseFileCalls, callsAfterFirst,
            `repeated cursor-rests on the same INCLUDE line must answer from the memo (parseFile ran ${parseFileCalls}x, expected ${callsAfterFirst})`);
    });
});
