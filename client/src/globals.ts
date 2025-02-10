import { workspace, ConfigurationTarget } from 'vscode';

// ✅ These are stored in workspace settings
export let globalSolutionFile: string = "";
export let globalClarionPropertiesFile: string = "";
export let globalClarionVersion: string = "";

export async function setGlobalClarionSelection(
    solutionFile: string,
    clarionPropertiesFile: string,
    clarionVersion: string
) {
    globalSolutionFile = solutionFile;
    globalClarionPropertiesFile = clarionPropertiesFile;
    globalClarionVersion = clarionVersion;

    // Save to workspace settings
    await workspace.getConfiguration().update('clarion.solutionFile', solutionFile, ConfigurationTarget.Workspace);
    await workspace.getConfiguration().update('clarion.propertiesFile', clarionPropertiesFile, ConfigurationTarget.Workspace);
    await workspace.getConfiguration().update('clarion.version', clarionVersion, ConfigurationTarget.Workspace);
}

// ❌ These should NOT be saved in workspace
let _globalRedirectionFile = "";
let _globalRedirectionPath = "";
let _globalMacros: Record<string, string> = {};
let _globalLibsrcPaths: string[] = [];

// ✅ Use `get` and `set` properties instead of exports
export const globalSettings = {
    get redirectionFile() {
        return _globalRedirectionFile;
    },
    set redirectionFile(value: string) {
        _globalRedirectionFile = value;
    },

    get redirectionPath() {
        return _globalRedirectionPath;
    },
    set redirectionPath(value: string) {
        _globalRedirectionPath = value;
    },

    get macros() {
        return _globalMacros;
    },
    set macros(value: Record<string, string>) {
        _globalMacros = value;
    },

    get libsrcPaths() {
        return _globalLibsrcPaths;
    },
    set libsrcPaths(value: string[]) {
        _globalLibsrcPaths = value;
    }
};
