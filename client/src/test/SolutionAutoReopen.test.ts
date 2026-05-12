import { describe, it } from 'mocha';
import * as assert from 'assert';
import { shouldUseSolutionFallback, SolutionFallbackEntry } from '../utils/SolutionFallbackPolicy';

/**
 * Unit tests for the #146 fix: solution should NOT auto-reopen after explicit
 * close. The `shouldUseSolutionFallback` helper is the testable decision point
 * extracted from `initializeFromWorkspace`'s currentSolution-empty branch.
 *
 * Pin shape per `feedback_bidirectional_pin_assertion`:
 *   - Bug-pin (#146): explicit-close → fallback suppressed → returns false
 *   - Regression sentinel (#104): non-close empty currentSolution → fallback
 *     still fires → returns true
 *
 * The bidirectional shape catches BOTH the new bug (silent auto-reopen after
 * explicit close) AND the regression risk (#104 user-visible bug returning if
 * we over-suppress).
 */

function makeSolutions(...solutionFiles: string[]): SolutionFallbackEntry[] {
    return solutionFiles.map(solutionFile => ({ solutionFile }));
}

describe('shouldUseSolutionFallback (#146)', () => {

    // ---- Bug-pin: explicit close suppresses fallback ----

    it('returns false when explicitlyClosed=true (bug-pin: #146 contract — no auto-reopen after explicit close)', () => {
        const result = shouldUseSolutionFallback('', makeSolutions('C:/work/MyApp.sln'), true);
        assert.strictEqual(result, false,
            'Explicit close MUST suppress fallback even when solutions[] is populated');
    });

    it('returns false when explicitlyClosed=true even with multiple solutions in array', () => {
        const result = shouldUseSolutionFallback('', makeSolutions('a.sln', 'b.sln', 'c.sln'), true);
        assert.strictEqual(result, false,
            'Explicit close MUST suppress fallback regardless of solutions[] size');
    });

    // ---- Regression sentinel: #104 fallback preserved for non-close cases ----

    it('returns true when currentSolution="" + solutions populated + explicitlyClosed=false (regression sentinel: #104 contract preserved)', () => {
        const result = shouldUseSolutionFallback('', makeSolutions('C:/work/MyApp.sln'), false);
        assert.strictEqual(result, true,
            'Empty currentSolution with populated solutions[] and no explicit-close MUST trigger #104 fallback');
    });

    it('returns true when currentSolution="" + multiple solutions + explicitlyClosed=false (fallback picks solutions[0])', () => {
        const result = shouldUseSolutionFallback('', makeSolutions('first.sln', 'second.sln'), false);
        assert.strictEqual(result, true,
            'Migration scenario: empty currentSolution with multi-entry solutions[] still falls back to solutions[0]');
    });

    // ---- Defensive guards: empty inputs ----

    it('returns false when solutions=[] (nothing to fall back to)', () => {
        const result = shouldUseSolutionFallback('', [], false);
        assert.strictEqual(result, false,
            'No solutions in array → no fallback regardless of flag state');
    });

    it('returns false when solutions=[] AND explicitlyClosed=true', () => {
        const result = shouldUseSolutionFallback('', [], true);
        assert.strictEqual(result, false,
            'No solutions in array → no fallback (intersection of both gates)');
    });

    // ---- currentSolution dominance: when set, fallback is never used ----

    it('returns false when currentSolution is set (regardless of solutions/flag)', () => {
        const result = shouldUseSolutionFallback('C:/work/Set.sln', makeSolutions('Other.sln'), false);
        assert.strictEqual(result, false,
            'currentSolution being set means no fallback needed — caller takes the if-branch instead');
    });

    it('returns false when currentSolution is set AND explicitlyClosed=true', () => {
        const result = shouldUseSolutionFallback('C:/work/Set.sln', makeSolutions('Other.sln'), true);
        assert.strictEqual(result, false,
            'currentSolution being set dominates the flag — no fallback needed');
    });
});
