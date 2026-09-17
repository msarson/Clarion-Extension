import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { rememberedSolutionPromptCommand } from '../utils/SolutionFallbackPolicy';

/**
 * #572 — the startup prompt for a remembered solution whose Clarion version is missing or no
 * longer registered offered Set Version, which ran the general version picker (in-memory only)
 * and then saved and reloaded only if a re-check passed. Picking 14313 for VitTransform left the
 * settings at 14234 and the solution closed, while the Solution View route — the solution opener —
 * picked, saved and loaded in one go. Set Version now takes that route.
 */
const SLN = 'f:\\github\\VitTransform\\VitTransform.sln';

suite('Startup prompt for an unloadable remembered solution (#572)', () => {
    test('Set Version opens the remembered solution through the solution opener', () => {
        assert.deepStrictEqual(rememberedSolutionPromptCommand('Set Version', SLN),
            { command: 'clarion.openDetectedSolution', args: [SLN] });
    });

    test('Open Solution... still browses for a solution', () => {
        assert.deepStrictEqual(rememberedSolutionPromptCommand('Open Solution...', SLN),
            { command: 'clarion.openSolution', args: [] });
    });

    test('dismissing the prompt runs nothing', () => {
        assert.strictEqual(rememberedSolutionPromptCommand(undefined, SLN), undefined);
    });

    test('the prompt runs the command the policy names, with no second recovery path beside it', () => {
        // SolutionInitializer imports vscode, so the wiring is pinned on the source.
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', '..', '..', '..', 'client', 'src', 'solution', 'SolutionInitializer.ts'), 'utf8');
        const start = source.indexOf("rememberedState === 'needs-version' || rememberedState === 'stale-version'");
        assert.ok(start > 0, 'stale/needs-version prompt not found');
        const block = source.slice(start, source.indexOf('return;', start));
        assert.ok(block.includes('rememberedSolutionPromptCommand('), 'the prompt must take its command from rememberedSolutionPromptCommand');
        assert.ok(!block.includes("'clarion.setActiveVersion'"), 'the prompt must not run the in-memory version picker itself');
        assert.ok(!block.includes("'clarion.reinitializeSolution'"), 'the prompt must not reinitialize on its own after a picker');
    });
});
