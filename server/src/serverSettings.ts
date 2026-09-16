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
     * Issue #62 — diagnostic for undeclared LHS-of-assignment identifiers.
     * Populated from `clarion.diagnostics.undeclaredVariables.enabled` via the
     * `clarion/updatePaths` notification; defaults to true so the diagnostic
     * fires out of the box. Toggling requires a VS Code reload.
     */
    undeclaredVariablesEnabled: true,

    /**
     * Issue #517 — OPT-IN (off by default) diagnostic for a call to a procedure
     * that resolves to no declaration anywhere. Populated from
     * `clarion.diagnostics.unresolvedProcedureCalls.enabled` via `clarion/updatePaths`.
     */
    unresolvedProcedureCallsEnabled: false,

    /**
     * Issue #121 — diagnostic for indistinguishable procedure prototypes
     * (compile-error duplicates that Clarion's compiler rejects). Populated
     * from `clarion.diagnostics.indistinguishablePrototypes.enabled` via the
     * `clarion/updatePaths` notification; defaults to true so the diagnostic
     * fires out of the box. Toggling requires a VS Code reload.
     */
    indistinguishablePrototypesEnabled: true,

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
}

const FEATURE_FLAGS: ReadonlyArray<keyof FeatureFlagParams> = [
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
    return changed;
}
