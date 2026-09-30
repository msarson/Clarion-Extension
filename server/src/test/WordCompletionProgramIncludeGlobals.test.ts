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
 * A global declared in a header the PROGRAM INCLUDEs in its data section is visible to every
 * MEMBER module, and hover resolves it, but word completion only walked the PROGRAM's own
 * tokens — a data-section INCLUDE is never inlined into them. So `Glob:Svc` below hovered
 * fine and was never offered as a completion.
 *
 * The fix follows the PROGRAM's data-section INCLUDEs one level deep. These tests pin that
 * scope: one level, and not the header's EQUATEs (project-wide EQUATEs have their own capped
 * tier).
 */
suite('Word completion offers globals from the PROGRAM\'s data-section INCLUDEs', () => {
    let dir = '';
    let savedSm: unknown;
    let memberDoc: TextDocument;
    let provider: WordCompletionProvider;
    let headerUri = '';

    const header = (extraLabel: string) => [
        "  INCLUDE('nested.inc'),ONCE",
        'SvcClass            CLASS,TYPE',
        'Inited                LONG',
        '                    END',
        'Glob:Svc            &SvcClass           ! global service instance',
        'Glob:Count          LONG(0)',
        'Glob:Limit          EQUATE(10)',
        `${extraLabel}       LONG`,
        '',
    ].join('\r\n');

    suiteSetup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcinc-'));
        fs.writeFileSync(path.join(dir, 'globals.inc'), header('Glob:Before'));
        fs.writeFileSync(path.join(dir, 'nested.inc'), 'Glob:Nested         LONG\r\n');
        const program = [
            '  PROGRAM',
            "  INCLUDE('globals.inc'),ONCE",
            '  MAP',
            '  END',
            'Glob:Own            LONG',
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
            '  Glob:',
            '',
        ].join('\r\n');
        fs.writeFileSync(path.join(dir, 'mod.clw'), memberText);
        headerUri = `file:///${path.join(dir, 'globals.inc').replace(/\\/g, '/')}`;

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
        (await provider.provide(memberDoc, { line: 5, character: 2 + partial.length }, partial))
            .map(i => String(i.label).toLowerCase());

    test('a global declared in a data-section INCLUDE is offered', async () => {
        const got = await labels('Glob:S');
        assert.ok(got.some(l => l.endsWith('svc')), `expected Glob:Svc among: ${got.slice(0, 20).join(', ')}`);
    });

    test('the PROGRAM\'s own globals are still offered', async () => {
        const got = await labels('Glob:O');
        assert.ok(got.some(l => l.endsWith('own')), got.slice(0, 20).join(', '));
    });

    test('the header\'s EQUATEs are not added by this path', async () => {
        const got = await labels('Glob:L');
        assert.ok(!got.some(l => l.endsWith('limit')), got.slice(0, 20).join(', '));
    });

    test('scope pin: an INCLUDE two levels down is not followed', async () => {
        const got = await labels('Glob:N');
        assert.ok(!got.some(l => l.endsWith('nested')), got.slice(0, 20).join(', '));
    });

    test('an edit to the header replaces its globals instead of replaying stale ones', async () => {
        assert.ok((await labels('Glob:B')).some(l => l.endsWith('before')), 'warm-up: Glob:Before offered');
        TokenCache.getInstance().getTokens(TextDocument.create(headerUri, 'clarion', 2, header('Glob:After')));
        const after = await labels('Glob:A');
        assert.ok(after.some(l => l.endsWith('after')), after.slice(0, 20).join(', '));
        const before = await labels('Glob:B');
        assert.ok(!before.some(l => l.endsWith('before')), before.slice(0, 20).join(', '));
    });
});
