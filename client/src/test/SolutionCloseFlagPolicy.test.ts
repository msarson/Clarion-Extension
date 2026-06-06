import { describe, it } from 'mocha';
import * as assert from 'assert';
import { shouldMarkExplicitlyClosed, SolutionCloseReason } from '../utils/SolutionFallbackPolicy';

/**
 * Unit tests for #183: switching solutions must NOT leave the sticky
 * `clarion.solutionExplicitlyClosed` flag set.
 *
 * `closeClarionSolution` is invoked in two distinct contexts:
 *   - 'user'   — the user ran "Close Solution" → the closed state SHOULD stick
 *                across restarts (the #146 contract).
 *   - 'switch' — an internal close performed while opening/switching to another
 *                solution → the flag MUST NOT be set, otherwise the subsequent
 *                open ends with the flag stuck `true` and `initializeFromWorkspace`
 *                suppresses auto-reopen on the next restart (#183).
 *
 * `shouldMarkExplicitlyClosed` is the pure decision point extracted from
 * `closeClarionSolution`, mirroring the #146 `shouldUseSolutionFallback`
 * vscode-API-free pattern so it can be unit-tested directly.
 *
 * Bidirectional pin (feedback_bidirectional_pin_assertion):
 *   - Bug-pin (#183): 'switch' → false (no sticky flag after a switch)
 *   - Regression sentinel (#146): 'user' → true (explicit close still sticks)
 */
describe('shouldMarkExplicitlyClosed (#183)', () => {

    it("returns false for an internal 'switch' close (bug-pin: #183 — no sticky flag after switching solutions)", () => {
        const reason: SolutionCloseReason = 'switch';
        assert.strictEqual(shouldMarkExplicitlyClosed(reason), false,
            'An internal close during a solution switch MUST NOT set the explicitly-closed flag');
    });

    it("returns true for a 'user' close (regression sentinel: #146 — explicit close still sticks)", () => {
        const reason: SolutionCloseReason = 'user';
        assert.strictEqual(shouldMarkExplicitlyClosed(reason), true,
            'A user-initiated close MUST set the explicitly-closed flag so it survives restarts');
    });

    it("defaults to a sticky (user) close when no reason is supplied (safe default preserves #146)", () => {
        assert.strictEqual(shouldMarkExplicitlyClosed(), true,
            'Omitting the reason must default to the conservative user-close behaviour');
    });
});
