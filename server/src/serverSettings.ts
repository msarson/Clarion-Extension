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

    get primaryRedirectionPath(): string {
        return this.redirectionPaths[0] ?? "";
    },

    get primaryProjectPath(): string {
        return this.projectPaths[0] ?? "";
    }
};
