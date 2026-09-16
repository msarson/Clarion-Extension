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
 * #565 — word completion in a MEMBER module took 1.5–3 s per request on a real generated app
 * (Mark: "code completion can be very slow"). All of it was the PROGRAM file's PRE-qualified
 * globals: each field declaration line looked up its own tokens with a scan of the whole token
 * array, so thousands of dictionary FILE fields over ~68k tokens cost hundreds of millions of
 * comparisons, rebuilt on every keystroke.
 *
 * The fixture is a PROGRAM whose global data is one large GROUP,PRE(GLO). The budget is generous
 * (the linear collection takes milliseconds; the quadratic one took well over a second here), so
 * the timing assertion does not flake on a slow machine.
 */
suite('Word completion does not rescan the PROGRAM file per prefixed field (#565)', () => {
    const FIELDS = 8000;
    const BUDGET_MS = 400;
    let dir = '';
    let savedSm: unknown;
    let memberDoc: TextDocument;
    let provider: WordCompletionProvider;

    suiteSetup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc565-'));
        const program = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'Glob                GROUP,PRE(GLO)',
            ...Array.from({ length: FIELDS }, (_, i) => `F${i}                LONG   ! field ${i}`),
            '                    END',
            '  CODE',
            '',
        ].join('\r\n');
        fs.writeFileSync(path.join(dir, 'prog.clw'), program);
        const memberText = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'Work PROCEDURE()',
            '  CODE',
            '  GLO:F7999 = 1',
            '',
        ].join('\r\n');
        fs.writeFileSync(path.join(dir, 'mod.clw'), memberText);

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

    const complete = (partial: string) => provider.provide(memberDoc, { line: 5, character: 2 + partial.length }, partial);

    test('the PROGRAM\'s prefixed globals are offered (correctness, and warms the PROGRAM tokens)', async () => {
        const labels = (await complete('GLO:F799')).map(i => String(i.label));
        assert.ok(labels.includes('F7999'), `expected F7999 among ${labels.length}: ${labels.slice(0, 12).join(', ')}`);
        assert.ok(labels.includes('F799'), labels.slice(0, 12).join(', '));
    });

    test('a repeated request keeps the declared type and detail of a PROGRAM field (#508 display)', async () => {
        const first = (await complete('GLO:F42')).find(i => String(i.label) === 'F42');
        const again = (await complete('GLO:F42')).find(i => String(i.label) === 'F42');
        assert.ok(first && again, 'F42 offered both times');
        assert.deepStrictEqual(again!.labelDetails, first!.labelDetails);
        assert.ok(/LONG/.test(JSON.stringify(again!.labelDetails ?? {})), JSON.stringify(again));
    });

    test(`bug-pin: a request over ${FIELDS} prefixed fields completes within ${BUDGET_MS}ms`, async () => {
        const started = Date.now();
        const items = await complete('GLO:F12');
        const ms = Date.now() - started;
        assert.ok(items.length > 0, 'items returned');
        assert.ok(ms < BUDGET_MS, `word completion took ${ms}ms`);
    });

    test('a second request is not slower than the first (nothing rebuilt that could be reused)', async () => {
        const t1 = Date.now();
        await complete('GLO:F3');
        const first = Date.now() - t1;
        const t2 = Date.now();
        await complete('GLO:F3');
        const second = Date.now() - t2;
        assert.ok(second < BUDGET_MS && second <= Math.max(first * 2, 50), `first ${first}ms, second ${second}ms`);
    });
});
