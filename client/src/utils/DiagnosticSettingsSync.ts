/**
 * #541 — live `clarion.diagnostics.*` settings.
 *
 * The flags used to reach the server once, in `clarion/updatePaths` at solution
 * initialisation, so a change in Settings needed a window reload. The activation
 * listener now sends them again in `clarion/updateDiagnosticSettings` whenever a
 * configuration change touches the section. The two decisions the listener makes
 * live here, free of the vscode API, so they are unit-tested
 * (DiagnosticSettingsSync541.test.ts): which changes are ours, and what to send.
 *
 * The key table is the single list of diagnostics settings; the test pins it to
 * package.json so a setting added there cannot silently fall back to reload-only.
 */

export interface DiagnosticSettingsPayload {
    undeclaredVariablesEnabled: boolean;        // #62
    unresolvedProcedureCallsEnabled: boolean;   // #517
    indistinguishablePrototypesEnabled: boolean; // #121
}

export const DIAGNOSTIC_SETTINGS_SECTION = 'clarion.diagnostics';

/** Setting key (under the `clarion` section) → payload flag, with the package.json default. */
export const DIAGNOSTIC_SETTING_KEYS: ReadonlyArray<{ key: string; flag: keyof DiagnosticSettingsPayload; default: boolean }> = [
    { key: 'diagnostics.undeclaredVariables.enabled', flag: 'undeclaredVariablesEnabled', default: true },
    { key: 'diagnostics.unresolvedProcedureCalls.enabled', flag: 'unresolvedProcedureCallsEnabled', default: false },
    { key: 'diagnostics.indistinguishablePrototypes.enabled', flag: 'indistinguishablePrototypesEnabled', default: true },
];

/** True when a configuration change touches any diagnostics setting. */
export function affectsDiagnosticSettings(affects: (section: string) => boolean): boolean {
    return affects(DIAGNOSTIC_SETTINGS_SECTION);
}

/** The current flags, read through `read(key, default)` (a `WorkspaceConfiguration.get` in production). */
export function buildDiagnosticSettingsPayload(read: (key: string, def: boolean) => boolean): DiagnosticSettingsPayload {
    const payload = {} as DiagnosticSettingsPayload;
    for (const k of DIAGNOSTIC_SETTING_KEYS) {
        payload[k.flag] = read(k.key, k.default) === true;
    }
    return payload;
}
