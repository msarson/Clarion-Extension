import { DIAGNOSTIC_CHECKS, DiagnosticCheckId, checkDefault, SEVERITY_CHOICES } from '../../common/diagnosticChecks';

export const serverSettings = {
    redirectionPaths: [] as string[],
    projectPaths: [] as string[],
    configuration: "Default",
    clarionVersion: "0.0",
    solutionFilePath: "", // Add solution file path

    macros: {} as Record<string, string>,
    libsrcPaths: [] as string[],
    redirectionFile: "",
    defaultLookupExtensions: [".clw", ".inc", ".equ", ".eq", ".int"] as string[],

    /**
     * #542 — every diagnostic check has a switch, and there is a master switch. `checks`
     * holds only values the client has sent; an absent id falls back to the table default
     * in common/diagnosticChecks.ts. Read through `isDiagnosticEnabled(id)`, which also
     * applies the master switch. Populated from `clarion.diagnostics.*` at startup
     * (clarion/updatePaths) and live on every change (clarion/updateDiagnosticSettings, #541).
     */
    diagnostics: {
        enabled: true,
        checks: {} as Partial<Record<DiagnosticCheckId, boolean>> & Record<string, boolean | undefined>,
        /** #543 — severity overrides by check id; absent or 'default' keeps the check's own. */
        severities: {} as Partial<Record<DiagnosticCheckId, string>> & Record<string, string | undefined>,
    },

    /** Issue #62 — undeclared-variable check. A view onto `diagnostics.checks` (#542). */
    get undeclaredVariablesEnabled(): boolean { return this.diagnostics.checks.undeclaredVariables ?? checkDefault('undeclaredVariables'); },
    set undeclaredVariablesEnabled(v: boolean) { this.diagnostics.checks.undeclaredVariables = v; },

    /** Issue #517 — OPT-IN unresolved-procedure-call check. A view onto `diagnostics.checks` (#542). */
    get unresolvedProcedureCallsEnabled(): boolean { return this.diagnostics.checks.unresolvedProcedureCalls ?? checkDefault('unresolvedProcedureCalls'); },
    set unresolvedProcedureCallsEnabled(v: boolean) { this.diagnostics.checks.unresolvedProcedureCalls = v; },

    /** Issue #121 — indistinguishable-prototypes check. A view onto `diagnostics.checks` (#542). */
    get indistinguishablePrototypesEnabled(): boolean { return this.diagnostics.checks.indistinguishablePrototypes ?? checkDefault('indistinguishablePrototypes'); },
    set indistinguishablePrototypesEnabled(v: boolean) { this.diagnostics.checks.indistinguishablePrototypes = v; },

    /**
     * Issue #185 — reference-count CodeLens (one Find-All-References per visible
     * procedure/method/CLASS). Populated from `clarion.referencesCodeLens.enabled`
     * via the `clarion/updatePaths` notification; defaults to true. When false,
     * `onCodeLens` returns no lenses so no reference searches run. Toggling
     * requires a VS Code reload.
     */
    referencesCodeLensEnabled: true,

    /**
     * Inlay hints. DORMANT (2026-07-07): the server no longer advertises the `inlayHintProvider`
     * capability (too noisy for Clarion), so these are never consulted at runtime. The
     * `clarion.inlayHints.*` settings were removed from package.json; these fields and their
     * client plumbing are kept intact so the feature can be re-enabled without rewiring.
     * Originally: populated from `clarion.inlayHints.*` via `clarion/updatePaths`; default true.
     */
    inlayHintsParameterNames: true,   // parameter-name hints at call sites
    inlayHintsImplicitTypes: true,    // implicit-variable type hints (Counter# : LONG)

    get primaryRedirectionPath(): string {
        return this.redirectionPaths[0] ?? "";
    },

    get primaryProjectPath(): string {
        return this.projectPaths[0] ?? "";
    }
};

/** The feature flags a client may send — in `clarion/updatePaths` at startup and, since
 *  #541, in `clarion/updateDiagnosticSettings` whenever a setting changes. */
export interface FeatureFlagParams {
    undeclaredVariablesEnabled?: boolean;
    unresolvedProcedureCallsEnabled?: boolean;
    indistinguishablePrototypesEnabled?: boolean;
    inlayHintsParameterNames?: boolean;
    inlayHintsImplicitTypes?: boolean;
    /** #542 — the master switch and one flag per check, keyed by check id. */
    diagnosticsEnabled?: boolean;
    diagnosticChecks?: Record<string, boolean>;
    /** #543 — a SEVERITY_CHOICES value per check id. */
    diagnosticSeverities?: Record<string, string>;
}

/** #542 — is this check to run: the master switch, then the check's own setting or its default. */
export function isDiagnosticEnabled(id: DiagnosticCheckId): boolean {
    if (!serverSettings.diagnostics.enabled) return false;
    return serverSettings.diagnostics.checks[id] ?? checkDefault(id);
}

// LSP DiagnosticSeverity values (kept numeric here so this leaf module stays free of
// the vscode-languageserver import).
const SEVERITY_VALUE: Record<string, number> = { error: 1, warning: 2, information: 3, hint: 4 };

/**
 * #543 — apply the user's severity for a check to the diagnostics it produced.
 * Absent or 'default' leaves each diagnostic's built-in severity alone. Applied at the
 * facade after each validator runs, keyed by the same id the on/off gate uses.
 */
export function applyCheckSeverity<T extends { severity?: number }>(id: DiagnosticCheckId, diagnostics: T[]): T[] {
    const choice = serverSettings.diagnostics.severities[id];
    const value = choice ? SEVERITY_VALUE[choice] : undefined;
    if (value === undefined) return diagnostics;
    for (const d of diagnostics) d.severity = value;
    return diagnostics;
}

const KNOWN_CHECK_IDS = new Set<string>(DIAGNOSTIC_CHECKS.map(c => c.id));

type BooleanFlag = 'undeclaredVariablesEnabled' | 'unresolvedProcedureCallsEnabled' | 'indistinguishablePrototypesEnabled'
    | 'inlayHintsParameterNames' | 'inlayHintsImplicitTypes';
const FEATURE_FLAGS: ReadonlyArray<BooleanFlag> = [
    'undeclaredVariablesEnabled',
    'unresolvedProcedureCallsEnabled',
    'indistinguishablePrototypesEnabled',
    'inlayHintsParameterNames',
    'inlayHintsImplicitTypes',
];

/**
 * Apply the flags a client sent. A missing field preserves the current value — only an
 * explicit value from the client wins, and only `true` is true (#62 rule, kept from the
 * inline block this replaces). Returns the names of the flags whose value changed, so a
 * live update (#541) can skip re-validating every open document when nothing did.
 * `referencesCodeLensEnabled` stays in server.ts: flipping it also resets caches there.
 */
export function applyFeatureFlags(params: FeatureFlagParams): string[] {
    const changed: string[] = [];
    for (const flag of FEATURE_FLAGS) {
        const incoming = params[flag];
        if (incoming === undefined) continue;
        const next = incoming === true;
        if (serverSettings[flag] !== next) {
            serverSettings[flag] = next;
            changed.push(flag);
        }
    }
    // #542 — the table payload. Unknown ids (a newer client) are ignored rather than stored.
    if (params.diagnosticsEnabled !== undefined) {
        const next = params.diagnosticsEnabled === true;
        if (serverSettings.diagnostics.enabled !== next) {
            serverSettings.diagnostics.enabled = next;
            changed.push('diagnosticsEnabled');
        }
    }
    for (const [id, value] of Object.entries(params.diagnosticChecks ?? {})) {
        if (!KNOWN_CHECK_IDS.has(id)) continue;
        const checkId = id as DiagnosticCheckId;
        const next = value === true;
        const current = serverSettings.diagnostics.checks[checkId] ?? checkDefault(checkId);
        serverSettings.diagnostics.checks[checkId] = next;
        if (current !== next) changed.push(`diagnostics.${id}`);
    }
    // #543 — severities. 'default' clears the override; a value outside the choices is ignored.
    for (const [id, value] of Object.entries(params.diagnosticSeverities ?? {})) {
        if (!KNOWN_CHECK_IDS.has(id)) continue;
        if (!(SEVERITY_CHOICES as readonly string[]).includes(value)) continue;
        const checkId = id as DiagnosticCheckId;
        const current = serverSettings.diagnostics.severities[checkId];
        if (value === 'default') {
            if (current !== undefined) { delete serverSettings.diagnostics.severities[checkId]; changed.push(`severity.${id}`); }
        } else if (current !== value) {
            serverSettings.diagnostics.severities[checkId] = value;
            changed.push(`severity.${id}`);
        }
    }
    return changed;
}
