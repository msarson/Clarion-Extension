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

    get primaryRedirectionPath(): string {
        return this.redirectionPaths[0] ?? "";
    },

    get primaryProjectPath(): string {
        return this.projectPaths[0] ?? "";
    }
};
