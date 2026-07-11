import * as assert from 'assert';
import { Hover, MarkupKind } from 'vscode-languageserver/node';
import { initializingHoverFallback } from '../utils/InitializingHover';

/**
 * #301 — hover UX during startup: an unresolved hover shows a "still indexing" note while the
 * pipelines run, resolved hovers pass through untouched, and unresolved hovers return to plain
 * null once everything is ready (no permanent noise).
 */
suite('InitializingHover (#301)', () => {

    const readyState = {
        serverInitialized: true,
        solutionAnnounced: true,
        solutionPipelineReady: true,
        sdiPipelineReady: true,
    };

    const resolvedHover: Hover = {
        contents: { kind: MarkupKind.Markdown, value: '**thing** — LONG' }
    };

    test('resolved hover passes through untouched in every state', () => {
        assert.strictEqual(initializingHoverFallback(resolvedHover, readyState), resolvedHover);
        assert.strictEqual(
            initializingHoverFallback(resolvedHover, { ...readyState, sdiPipelineReady: false }),
            resolvedHover);
    });

    test('unresolved hover during the indexing window returns the "still indexing" note', () => {
        for (const state of [
            { ...readyState, serverInitialized: false },
            { ...readyState, solutionPipelineReady: false },
            { ...readyState, sdiPipelineReady: false },
        ]) {
            const result = initializingHoverFallback(null, state);
            assert.ok(result, `expected an indexing hover for state ${JSON.stringify(state)}`);
            const value = typeof result!.contents === 'object' && 'value' in result!.contents
                ? result!.contents.value : String(result!.contents);
            assert.ok(/indexing/i.test(value), `expected an indexing message; got: ${value}`);
        }
    });

    test('unresolved hover stays null once ready (no permanent noise)', () => {
        assert.strictEqual(initializingHoverFallback(null, readyState), null);
    });

    test('no-solution workspaces never see the note (nothing was announced)', () => {
        const noSolution = {
            serverInitialized: true,
            solutionAnnounced: false,
            solutionPipelineReady: false,
            sdiPipelineReady: false,
        };
        assert.strictEqual(initializingHoverFallback(null, noSolution), null);
    });
});
