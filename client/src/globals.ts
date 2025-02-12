import { workspace, ConfigurationTarget } from 'vscode';

// ✅ These are stored in workspace settings
export let globalSolutionFile: string = "";
export let globalClarionPropertiesFile: string = "";
export let globalClarionVersion: string = "";
let _globalClarionConfiguration: string = "Release";

export async function setGlobalClarionSelection(
    solutionFile: string,
    clarionPropertiesFile: string,
    clarionVersion: string,
    clarionConfiguration: string //= "Release" // Optional, default to Release
) {
    globalSolutionFile = solutionFile;
    globalClarionPropertiesFile = clarionPropertiesFile;
    globalClarionVersion = clarionVersion;
    _globalClarionConfiguration = clarionConfiguration; 

    // Save to workspace settings
    await workspace.getConfiguration().update('clarion.solutionFile', solutionFile, ConfigurationTarget.Workspace);
    await workspace.getConfiguration().update('clarion.propertiesFile', clarionPropertiesFile, ConfigurationTarget.Workspace);
    await workspace.getConfiguration().update('clarion.version', clarionVersion, ConfigurationTarget.Workspace);
    await workspace.getConfiguration().update('clarion.configuration', clarionConfiguration, ConfigurationTarget.Workspace);
}

// ❌ These should NOT be saved in workspace
let _globalRedirectionFile = "";
let _globalRedirectionPath = "";
let _globalMacros: Record<string, string> = {};
let _globalLibsrcPaths: string[] = [];

// ✅ Use `get` and `set` properties instead of exports
export const globalSettings = {
    get configuration() {
        return _globalClarionConfiguration;
    },
    set configuration(value: string) {
        _globalClarionConfiguration = value;
    },
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

/**
 * Loads existing Clarion settings from the workspace
 */
// export function loadGlobalClarionSettings() {
//     const config = workspace.getConfiguration("clarion");
    
//     globalSolutionFile = config.get<string>("solutionFile", "");
//     globalClarionPropertiesFile = config.get<string>("propertiesFile", "");
//     globalClarionVersion = config.get<string>("version", "");
//     globalClarionConfiguration = config.get<string>("configuration", "Release"); // Default to Release
// }
