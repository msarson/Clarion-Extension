import { workspace, ConfigurationTarget, window } from 'vscode';
import * as fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("Globals");


// ✅ These are stored in workspace settings
export let globalSolutionFile: string = "";
export let globalClarionPropertiesFile: string = "";
export let globalClarionVersion: string = "";
let _globalClarionConfiguration: string = "Release";

// ✅ Ensure these settings are available globally
const DEFAULT_EXTENSIONS = [".clw", ".inc", ".equ", ".eq", ".int"];

export async function setGlobalClarionSelection(
    solutionFile: string,
    clarionPropertiesFile: string,
    clarionVersion: string,
    clarionConfiguration: string
) {
     logger.info("🔄 Updating global settings:", {
        solutionFile,
        clarionPropertiesFile,
        clarionVersion,
        clarionConfiguration
    });

    // ✅ Update global variables
    globalSolutionFile = solutionFile;
    globalClarionPropertiesFile = clarionPropertiesFile;
    globalClarionVersion = clarionVersion;
    _globalClarionConfiguration = clarionConfiguration;

    // ✅ Only save to workspace if all required values are set
    if (solutionFile && clarionPropertiesFile && clarionVersion) {
        logger.info("✅ All required settings are set. Saving to workspace settings...");
        await workspace.getConfiguration().update('clarion.solutionFile', solutionFile, ConfigurationTarget.Workspace);
        await workspace.getConfiguration().update('clarion.propertiesFile', clarionPropertiesFile, ConfigurationTarget.Workspace);
        await workspace.getConfiguration().update('clarion.version', clarionVersion, ConfigurationTarget.Workspace);
        await workspace.getConfiguration().update('clarion.configuration', clarionConfiguration, ConfigurationTarget.Workspace);

        // ✅ Ensure lookup extensions are written ONLY when a valid solution exists
        const config = workspace.getConfiguration("clarion");

        const fileSearchExtensions = config.inspect<string[]>("fileSearchExtensions")?.workspaceValue;
        const defaultLookupExtensions = config.inspect<string[]>("defaultLookupExtensions")?.workspaceValue;

        const updatePromises: Thenable<void>[] = [];

        if (!fileSearchExtensions) {
            updatePromises.push(config.update("fileSearchExtensions", DEFAULT_EXTENSIONS, ConfigurationTarget.Workspace));
        }

        if (!defaultLookupExtensions) {
            updatePromises.push(config.update("defaultLookupExtensions", DEFAULT_EXTENSIONS, ConfigurationTarget.Workspace));
        }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            logger.info("✅ Default lookup settings applied to workspace.json.");
        }
    } else {
        logger.warn("⚠️ Not saving to workspace settings: One or more required values are missing.");
    }
}


// ❌ These should NOT be saved in workspace
let _globalRedirectionFile = "";
let _globalRedirectionPath = "";
let _globalMacros: Record<string, string> = {};
let _globalLibsrcPaths: string[] = [];

// ✅ Use `get` and `set` properties instead of exports
export const globalSettings = {
    get defaultLookupExtensions() {
        return workspace.getConfiguration("clarion").get<string[]>("defaultLookupExtensions", DEFAULT_EXTENSIONS);
    },

    get fileSearchExtensions() {
        return workspace.getConfiguration("clarion").get<string[]>("fileSearchExtensions", DEFAULT_EXTENSIONS);
    },

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
    },

    /** ✅ Ensure default settings are initialized in workspace.json */
    async initialize() {
        const config = workspace.getConfiguration("clarion");

        // Check if settings already exist in workspace.json
        const fileSearchExtensions = config.inspect<string[]>("fileSearchExtensions")?.workspaceValue;
        const defaultLookupExtensions = config.inspect<string[]>("defaultLookupExtensions")?.workspaceValue;

        const updatePromises: Thenable<void>[] = [];

        // if (!fileSearchExtensions) {
        //     updatePromises.push(config.update("fileSearchExtensions", DEFAULT_EXTENSIONS, ConfigurationTarget.Workspace));
        // }

        // if (!defaultLookupExtensions) {
        //     updatePromises.push(config.update("defaultLookupExtensions", DEFAULT_EXTENSIONS, ConfigurationTarget.Workspace));
        // }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            window.showInformationMessage("Clarion extension: Default settings applied to workspace.json.");
        }
    },

    /** ✅ Load settings from workspace.json */
    async initializeFromWorkspace() {

        // ✅ Read workspace settings
        const solutionFile = workspace.getConfiguration().get<string>("clarion.solutionFile", "") || "";
        const clarionPropertiesFile = workspace.getConfiguration().get<string>("clarion.propertiesFile", "") || "";
        const clarionVersion = workspace.getConfiguration().get<string>("clarion.version", "") || "";
        const clarionConfiguration = workspace.getConfiguration().get<string>("clarion.configuration", "") || "Release";

        // ✅ Set global variables
        await setGlobalClarionSelection(solutionFile, clarionPropertiesFile, clarionVersion, clarionConfiguration);

        // ✅ Ensure ClarionProperties.xml exists before parsing
        if (!clarionPropertiesFile || !fs.existsSync(clarionPropertiesFile)) {
            logger.warn("⚠️ ClarionProperties.xml not found. Skipping extraction of additional settings.");
            return;
        }

        try {
            // ✅ Parse ClarionProperties.xml
            const xmlContent = fs.readFileSync(clarionPropertiesFile, "utf-8");
            const parsedXml = await parseStringPromise(xmlContent);

            const versions = parsedXml.ClarionProperties?.Properties?.find(
                (p: any) => p.$.name === "Clarion.Versions"
            );
            const selectedVersion = versions?.Properties?.find(
                (p: any) => p.$.name === clarionVersion
            );

            if (!selectedVersion) {
                logger.warn(`⚠️ Clarion version '${clarionVersion}' not found in ClarionProperties.xml.`);
                return;
            }

            // ✅ Extract additional settings
            globalSettings.redirectionFile =
                selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Name?.[0]?.$.value || "";

            globalSettings.redirectionPath =
                selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Properties?.find(
                    (p: any) => p.$.name === "Macros"
                )?.reddir?.[0]?.$.value || "";

            globalSettings.macros = ClarionExtensionCommands.extractMacros(selectedVersion.Properties);
            globalSettings.libsrcPaths =
                selectedVersion.libsrc?.[0]?.$.value.split(";") || [];

             logger.info("✅ Extracted Clarion settings from ClarionProperties.xml", {
                redirectionFile: globalSettings.redirectionFile,
                redirectionPath: globalSettings.redirectionPath,
                macros: globalSettings.macros,
                libsrcPaths: globalSettings.libsrcPaths
            });

        } catch (error) {
            logger.error("❌ Error parsing ClarionProperties.xml:", error);
        }
    }
};
