import { describe, it } from 'mocha';
import * as assert from 'assert';
import { shouldRestoreSolutionFromHistory } from '../utils/SolutionFallbackPolicy';

/**
 * Unit tests for #170 — defend the gate-and-flag-sensitive auto-open decision in
 * `ActivationManager.setupFolderDependentFeatures` (the #169 regression site).
 *
 * `shouldRestoreSolutionFromHistory` is the pure decision point extracted from
 * that path (vscode-API-free, mirroring `shouldUseSolutionFallback` /
 * `shouldMarkExplicitlyClosed`) so the gate behaviour is unit-testable without
 * booting the extension.
 *
 * The #169 regression happened because this parallel auto-open path was added
 * without consulting the explicit-close flag, and nothing tested the gate. These
 * sentinels lock it down.
 */
describe('shouldRestoreSolutionFromHistory (#170 / #169 / #104)', () => {

    it('#169 gate sentinel — explicit close suppresses history restore', () => {
        assert.strictEqual(
            shouldRestoreSolutionFromHistory(/* explicitlyClosed */ true, /* globalSolutionFile */ '', /* hasWorkspaceFolder */ true),
            false,
            'An explicitly-closed solution MUST NOT auto-restore from history (#146/#169)');
    });

    it('#104 restore sentinel — fires when not closed, no workspace solution, folder open', () => {
        assert.strictEqual(
            shouldRestoreSolutionFromHistory(false, '', true),
            true,
            'After a folder switch (no workspace solution, not explicitly closed) history restore SHOULD fire (#104)');
    });

    it('workspace already defines a solution — no history restore needed', () => {
        assert.strictEqual(
            shouldRestoreSolutionFromHistory(false, 'C:\\proj\\app.sln', true),
            false,
            'When globalSolutionFile is set, workspace settings already drive the load — history restore must not fire');
    });

    it('no workspace folder open — nothing to restore against', () => {
        assert.strictEqual(
            shouldRestoreSolutionFromHistory(false, '', false),
            false,
            'History is keyed by folder path; with no folder open there is nothing to restore');
    });

    it('explicit-close dominates even with an otherwise-restorable state', () => {
        // Defense-in-depth: even if the broader explicit-close early-return were
        // ever removed from ActivationManager, the policy still refuses to restore.
        assert.strictEqual(
            shouldRestoreSolutionFromHistory(true, '', true),
            false,
            'explicitlyClosed must dominate the #104 restore conditions');
    });
});
