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

    get primaryRedirectionPath(): string {
        return this.redirectionPaths[0] ?? "";
    },

    get primaryProjectPath(): string {
        return this.projectPaths[0] ?? "";
    }
};
