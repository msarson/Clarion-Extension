/**
 * #309 — the CodeLens reference scan's declaration hunt held the event loop
 * for 114s in ONE synchronous stretch on Mark's VM (max_blocked_ms=113939 ≈
 * handler ms=113996 — zero yields, so the 500ms resolve budget and the 15s
 * cancellation ceiling never got a chance to act).
 *
 * Mechanism: findProcedureReferences steps 2 and 4 walk EVERY project source
 * file (cold: readFileSync + full tokenize each) with no cooperative
 * checkpoint and no cancellation check. For a CLASS-declaration lens the hunt
 * is also futile by construction — it searches for a PROCEDURE named like the
 * class (never exists), even though findClassTypeReferences already resolved
 * the declaration via the SDI and threw it away.
 *
 * Pins:
 *   1. The hunt yields the event loop (checkpoints exist on the walk).
 *   2. The hunt honors cancellation (bails after a handful of files).
 *   3. Class-type references skip the procedure hunt entirely (SDI-known
 *      declaration passed through) — file touches ≈ search phase only.
 */

import * as assert from 'assert';
import { CancellationToken } from 'vscode-languageserver';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { buildMultiFileFixture, teardownMultiFileFixture, MultiFileFixture } from './helpers/MultiFileFARFixture';
import { setServerInitialized } from '../serverState';

const N = 300;

const MOD5_LINES = [
    "  MEMBER('prog.clw')",
    'MyWidget  CLASS,TYPE',
    'DoIt        PROCEDURE(),LONG',
    '          END',
];
const WIDGET_DECL_LINE = 1;

function memberModule(i: number): string {
    return [
        "  MEMBER('prog.clw')",
        `Proc${i} PROCEDURE`,
        'wid  MyWidget',
        '  CODE',
        '  wid.DoIt()',
    ].join('\n');
}

function cancelledToken(): CancellationToken {
    return {
        isCancellationRequested: true,
        onCancellationRequested: () => ({ dispose: () => { /* noop */ } })
    } as CancellationToken;
}

suite('ReferencesProvider #309 — declaration hunt must yield, cancel, and skip when known', () => {

    let fixture: MultiFileFixture;
    let closedFileCalls: number;
    let origClosed: typeof TokenCache.prototype.getTokensForClosedFile;
    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;

    suiteSetup(() => setServerInitialized(true));

    setup(() => {
        const files: { [rel: string]: string } = {
            'main.clw': [
                "  MEMBER('prog.clw')",
                'Caller PROCEDURE',
                'wid  MyWidget',
                '  CODE',
                '  wid.DoIt()',
            ].join('\n'),
            'mod5.clw': MOD5_LINES.join('\n'),
        };
        for (let i = 0; i < N; i++) files[`gen${i}.clw`] = memberModule(i);
        fixture = buildMultiFileFixture({ files });

        // Count every closed-file token fetch — the unit of "file touched by a scan".
        closedFileCalls = 0;
        const cache = TokenCache.getInstance();
        origClosed = cache.getTokensForClosedFile.bind(cache);
        (cache as unknown as { getTokensForClosedFile: (uri: string) => unknown }).getTokensForClosedFile =
            (uri: string) => { closedFileCalls++; return origClosed(uri); };

        origSdiFind = StructureDeclarationIndexer.prototype.find;
        origSdiBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
    });

    teardown(() => {
        const cache = TokenCache.getInstance();
        (cache as unknown as { getTokensForClosedFile: typeof origClosed }).getTokensForClosedFile = origClosed;
        StructureDeclarationIndexer.prototype.find = origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origSdiBuild;
        teardownMultiFileFixture();
    });

    test('declaration hunt yields the event loop across project files', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['main.clw'];
        const tokens = TokenCache.getInstance().getTokens(doc);

        let turns = 0;
        const spin = setInterval(() => { turns++; }, 0);
        const before = turns;
        // Word with no procedure/label declaration anywhere: the hunt walks every file.
        const result = await (provider as unknown as {
            findProcedureReferences(w: string, d: unknown, t: unknown, inc: boolean, tok?: unknown): Promise<unknown>;
        }).findProcedureReferences('CompletelyMissing', doc, tokens, true, undefined);
        const turnsDuring = turns - before;
        clearInterval(spin);

        assert.strictEqual(result, null, 'no declaration → null');
        assert.ok(turnsDuring > 0,
            `full-project declaration hunt must yield the event loop at least once (got ${turnsDuring} turns over ${closedFileCalls} file touches)`);
    });

    test('declaration hunt honors a cancelled token', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['main.clw'];
        const tokens = TokenCache.getInstance().getTokens(doc);

        closedFileCalls = 0;
        const result = await (provider as unknown as {
            findProcedureReferences(w: string, d: unknown, t: unknown, inc: boolean, tok?: unknown): Promise<unknown>;
        }).findProcedureReferences('CompletelyMissing', doc, tokens, true, cancelledToken());

        assert.strictEqual(result, null, 'cancelled scan returns null');
        assert.ok(closedFileCalls < 20,
            `cancelled hunt must bail after a handful of files, not walk the project (touched ${closedFileCalls})`);
    });

    test('class-type references skip the procedure hunt (SDI declaration passed through)', async () => {
        // SDI knows MyWidget is a class declared in mod5.clw — the whole point of #309's
        // futile-hunt finding: findClassTypeReferences already has this answer.
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origSdiBuild;
        StructureDeclarationIndexer.prototype.find = function (name: string) {
            if (name.toLowerCase() !== 'mywidget') return [];
            return [{
                name: 'MyWidget',
                filePath: 'C:\\TestProj\\mod5.clw',
                line: WIDGET_DECL_LINE,
                structureType: 'CLASS',
                isType: true,
                lineContent: 'MyWidget  CLASS,TYPE',
            }] as ReturnType<typeof origSdiFind>;
        };

        const provider = new ReferencesProvider();
        const doc = fixture.documents['main.clw'];

        closedFileCalls = 0;
        const result = await (provider as unknown as {
            findClassTypeReferences(w: string, d: unknown, inc: boolean, tok?: unknown): Promise<{ uri: string }[] | null>;
        }).findClassTypeReferences('MyWidget', doc, true, undefined);

        assert.ok(result && result.length > 0, 'class references must resolve');
        // Search phase legitimately touches each project file once. The RED behavior
        // walks them all a SECOND time (steps 2+4 of the procedure hunt) first.
        const ceiling = (N + 2) + 60;
        assert.ok(closedFileCalls <= ceiling,
            `class lens must not re-hunt the declaration across the project (touched ${closedFileCalls}, ceiling ${ceiling})`);
    });
});
