export const serverSettings = {
    redirectionPaths: [] as string[],
    projectPaths: [] as string[],
    configuration: "Default",
    clarionVersion: "0.0",

    macros: {} as Record<string, string>,
    libsrcPaths: [] as string[],
    redirectionFile: "",

    get primaryRedirectionPath(): string {
        return this.redirectionPaths[0] ?? "";
    },

    get primaryProjectPath(): string {
        return this.projectPaths[0] ?? "";
    }
};
