/**
 * #541 — live `clarion.diagnostics.*` settings.
 *
 * The flags used to reach the server once, in `clarion/updatePaths` at solution
 * initialisation, so a change in Settings needed a window reload. The activation
 * listener now sends them again in `clarion/updateDiagnosticSettings` whenever a
 * configuration change touches the section.
 *
 * #542 — what is sent is built from the shared check table in
 * common/diagnosticChecks.ts (`buildDiagnosticSettingsPayload`): the master switch
 * and one flag per check. This module keeps only the client-side decision "is this
 * change ours?", vscode-free so it is unit-tested.
 */

export { buildDiagnosticSettingsPayload, DIAGNOSTIC_CHECKS, DIAGNOSTICS_MASTER_SETTING } from '../../../common/diagnosticChecks';
export type { DiagnosticSettingsPayload, DiagnosticCheckId } from '../../../common/diagnosticChecks';

export const DIAGNOSTIC_SETTINGS_SECTION = 'clarion.diagnostics';

/** True when a configuration change touches any diagnostics setting. */
export function affectsDiagnosticSettings(affects: (section: string) => boolean): boolean {
    return affects(DIAGNOSTIC_SETTINGS_SECTION);
}
