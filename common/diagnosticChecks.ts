/**
 * #542 — the one list of diagnostic checks the server runs, shared by the client and
 * the server.
 *
 * Every check has a `clarion.diagnostics.<id>.enabled` setting (see `settingKeyFor`),
 * and `clarion.diagnostics.enabled` is the master switch. The server gates each
 * validator on its id, the client builds the settings payload from this table, and a
 * test pins the table to package.json, so a check added here without its setting, or
 * a setting added there without its check, fails the build rather than shipping
 * unswitchable.
 *
 * Ids are stable identifiers, not display names: they appear in user settings files.
 */

export const DIAGNOSTICS_MASTER_SETTING = 'clarion.diagnostics.enabled';

export const DIAGNOSTIC_CHECKS = [
    // ── sync pass (per keystroke, current file only) ──
    { id: 'unterminatedStructures',      default: true,  title: 'Unterminated structures' },
    { id: 'omitCompileBlocks',           default: true,  title: 'OMIT / COMPILE blocks' },
    { id: 'fileDeclarations',            default: true,  title: 'FILE declarations' },
    { id: 'caseStructures',              default: true,  title: 'CASE structures' },
    { id: 'executeStructures',           default: true,  title: 'EXECUTE structures' },
    { id: 'returnStatements',            default: true,  title: 'RETURN statements' },
    { id: 'classProperties',             default: true,  title: 'CLASS properties' },
    { id: 'discardedReturnValues',       default: true,  title: 'Discarded return values' },
    { id: 'cycleBreakOutsideLoop',       default: true,  title: 'CYCLE / BREAK outside a loop' },
    { id: 'reservedKeywordLabels',       default: true,  title: 'Reserved-keyword labels' },
    { id: 'unicodeCharacters',           default: true,  title: 'Unicode characters' },
    { id: 'attributeApplicability',      default: true,  title: 'Attribute applicability' },
    { id: 'itemizeBlocks',               default: true,  title: 'ITEMIZE blocks' },
    { id: 'indistinguishablePrototypes', default: true,  title: 'Indistinguishable prototypes' },
    { id: 'byRefArguments',              default: true,  title: 'BY-REFERENCE arguments' },
    // ── async pass (cross-file) ──
    { id: 'viewProjectFields',           default: true,  title: 'VIEW PROJECT fields' },
    { id: 'missingIncludes',             default: true,  title: 'Missing includes' },
    { id: 'missingConstants',            default: true,  title: 'Missing DEFINE constants' },
    { id: 'missingMapDeclarations',      default: true,  title: 'Missing MAP declarations' },
    { id: 'missingImplementations',      default: true,  title: 'Missing implementations' },
    { id: 'privateProcedureCalls',       default: true,  title: 'PRIVATE procedure calls' },
    { id: 'undeclaredVariables',         default: true,  title: 'Undeclared variables' },
    { id: 'unresolvedProcedureCalls',    default: false, title: 'Unresolved procedure calls' },
    { id: 'interfaceImplementation',     default: true,  title: 'Interface implementation' },
] as const;

export type DiagnosticCheckId = typeof DIAGNOSTIC_CHECKS[number]['id'];

/** The user setting that switches one check. */
export function settingKeyFor(id: DiagnosticCheckId): string {
    return `clarion.diagnostics.${id}.enabled`;
}

export function checkDefault(id: DiagnosticCheckId): boolean {
    return DIAGNOSTIC_CHECKS.find(c => c.id === id)?.default ?? true;
}

/** What the client sends the server — at startup in clarion/updatePaths and live in
 *  clarion/updateDiagnosticSettings (#541). */
export interface DiagnosticSettingsPayload {
    diagnosticsEnabled: boolean;
    diagnosticChecks: Record<DiagnosticCheckId, boolean>;
}

/**
 * Build the payload by reading each setting through `read(key, default)` — in
 * production a `WorkspaceConfiguration.get` on the `clarion` section, which is why the
 * keys here are relative to it (`diagnostics.<id>.enabled`, `diagnostics.enabled`).
 */
export function buildDiagnosticSettingsPayload(read: (key: string, def: boolean) => boolean): DiagnosticSettingsPayload {
    const diagnosticChecks = {} as Record<DiagnosticCheckId, boolean>;
    for (const c of DIAGNOSTIC_CHECKS) {
        diagnosticChecks[c.id] = read(`diagnostics.${c.id}.enabled`, c.default) === true;
    }
    return {
        diagnosticsEnabled: read('diagnostics.enabled', true) === true,
        diagnosticChecks,
    };
}
