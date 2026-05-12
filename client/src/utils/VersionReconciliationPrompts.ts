import { window } from 'vscode';

/**
 * #141 B2 item [9] — confirmation prompt utilities for the per-solution
 * version reconciliation flows on solution-open (Q1 / Q2 / Q8 from the GH
 * #141 design).
 *
 * Layer model recap (#141 Q4 three-layer storage):
 *   - L1 (Default version): settings.json User scope, cross-instance shared
 *   - L2 (Effective active version): in-memory per-VSCode-instance
 *   - L3 (Per-solution memory): ExtensionContext.globalState, keyed by solutionPath
 *
 * These prompts are invoked from the solution-open lifecycle hook in
 * `SolutionOpener.openClarionSolution` after `solutionFilePath` is determined.
 * Each prompt returns a value the caller uses to drive L1/L2/L3 mutations
 * (via `SettingsStorageManager` APIs) — the prompts themselves do NOT mutate
 * state, keeping the side-effect surface narrow.
 *
 * Behavioral tests live in the vscode-test-electron harness follow-up #150
 * (kanban `7162dc0c`); this module is code-review-enforced for 0.9.7 per
 * Bob's Option-A scope.
 */

/**
 * #141 Q2 — Yes/No confirm-switch prompt fired when the recorded L3 version
 * for a solution differs from the current L2 effective active in this
 * instance.
 *
 * Yes → caller switches L2 to `recordedVersion` and KEEPS L3 unchanged (the
 * user just confirmed the historical record matched intent).
 *
 * No → caller leaves L2 at the current effective + does NOT update L3 (user
 * explicitly chose to deviate THIS session; next solution-open should prompt
 * again with the historical record intact).
 *
 * Returns `true` when the user picks Yes, `false` when they pick No, and
 * `undefined` when they dismiss the modal (treat as No / no state change).
 */
export async function confirmAutoSwitchToRecordedVersion(
    currentVersion: string,
    recordedVersion: string
): Promise<boolean | undefined> {
    const choice = await window.showInformationMessage(
        `This solution was last opened with Clarion '${recordedVersion}'. Switch to '${recordedVersion}'?`,
        { modal: false },
        'Yes',
        'No'
    );
    if (choice === undefined) return undefined;
    return choice === 'Yes';
}

/**
 * #141 Q8 — first-time-seen solution prompt fired when no L3 record exists
 * for the solution path. User chooses between using the L1 default or
 * picking a different version.
 *
 * 'use-default' → caller records `defaultVersion` as this solution's L3 entry
 * + applies it as L2 (or no-op if L2 already matches).
 *
 * 'pick' → caller fires the #134 two-stage version picker; on user pick,
 * records the picked version as L3 + applies as L2.
 *
 * `undefined` when user dismisses — treat as deferred; do NOT create an L3
 * entry yet so the prompt fires again next time the user opens this solution.
 */
export async function promptFirstTimeSeenSolution(
    solutionDisplayName: string,
    defaultVersion: string
): Promise<'use-default' | 'pick' | undefined> {
    const choice = await window.showInformationMessage(
        `Solution '${solutionDisplayName}' hasn't been opened here before. Use your default (Clarion '${defaultVersion}') or pick a different version?`,
        { modal: false },
        'Use default',
        'Pick different'
    );
    if (choice === 'Use default') return 'use-default';
    if (choice === 'Pick different') return 'pick';
    return undefined;
}

/**
 * #141 Q1 — missing-installation prompt fired when a solution's L3 record
 * references a Clarion installation that is no longer detectable on disk
 * (e.g. user uninstalled the IDE). User is prompted to pick another version;
 * caller updates L3 with the new pick.
 *
 * Implementation note: the actual picker UX is the existing #134 two-stage
 * picker (`ClarionExtensionCommands.setActiveVersionCommand`). This function
 * shows the warning toast that explains WHY the picker is firing, then
 * defers to the caller to run the picker. Returns `true` when the user
 * acknowledged (intends to proceed with the picker) and `false` when they
 * dismissed the warning (treat as solution-open cancellation).
 *
 * If the user runs the picker and cancels mid-flow, fallback per Q1 design
 * is "use current L1 default + show banner explaining the fallback." That
 * fallback is the caller's responsibility (this module doesn't drive UX
 * for it).
 */
export async function notifyMissingRecordedInstallation(
    recordedVersion: string
): Promise<boolean> {
    const choice = await window.showWarningMessage(
        `This solution was last opened with Clarion '${recordedVersion}', but that installation is no longer available. Pick another Clarion version to continue.`,
        { modal: false },
        'Pick version',
        'Cancel'
    );
    return choice === 'Pick version';
}
