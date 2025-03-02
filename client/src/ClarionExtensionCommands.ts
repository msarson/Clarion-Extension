import { window, workspace, ConfigurationTarget, Uri, commands } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseString } from 'xml2js';
import { DocumentManager } from './documentManager';
import { globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, setGlobalClarionSelection, globalSettings, } from './globals';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ExtensionCommands");


// Example: Updating the stored settings
//await setGlobalClarionSelection("solution.sln", "ClarionProperties.xml", "Clarion 11");




// Define the ClarionVersionProperties interface
interface ClarionVersionProperties {
  clarionVersion: string;
  path: string;
  redirectionFile: string;
  macros: Record<string, string>;
  libsrc: string;
}

export class ClarionExtensionCommands {


  /**
   * Asynchronously prompts the user to locate and select a ClarionProperties.xml file and parses
   * available Clarion versions from the file. Then prompts the user to choose a Clarion version
   * and updates global and workspace settings with the chosen version. Displays relevant error
   * or informational messages to the user as needed.
   *
   * @returns A Promise that resolves once the ClarionProperties.xml selection and version choice have been
   *          recorded in global and workspace settings. Returns early if any part of the process fails.
   *
   * @throws Will throw an error if any step in selecting or updating the ClarionProperties.xml or version fails.
   */
  static async configureClarionPropertiesFile() {

    try {
      const appDataPath = process.env.APPDATA;
      if (!appDataPath) {
        window.showErrorMessage("Unable to access AppData path.");
        return;
      }

      const defaultDirectory = Uri.file(path.join(appDataPath, "SoftVelocity", "Clarion"));

      const selectedFileUri = await window.showOpenDialog({
        defaultUri: defaultDirectory,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: "Select ClarionProperties.xml",
        filters: { XML: ["xml"] },
      });

      if (!selectedFileUri || selectedFileUri.length === 0) {
        window.showWarningMessage("No ClarionProperties.xml file selected.");
        return;
      }

      const selectedFilePath = selectedFileUri[0].fsPath;


      // ✅ Save the properties file path
      await setGlobalClarionSelection(globalSolutionFile, selectedFilePath, globalClarionVersion, globalSettings.configuration);

      // ✅ Parse available versions from the selected file
      const versionProperties = await ClarionExtensionCommands.parseAvailableVersions(selectedFilePath);

      if (versionProperties.length === 0) {
        window.showErrorMessage("No Clarion versions found in the selected ClarionProperties.xml file.");
        return;
      }

      // ✅ Prompt user to select a version
      const versionSelection = await window.showQuickPick(versionProperties.map((v) => v.clarionVersion), {
        placeHolder: "Select a Clarion version",
      });

      if (!versionSelection) {
        window.showWarningMessage("No Clarion version selected. Keeping previous version.");
        return;
      }

      // ✅ Find the selected version's properties
      const selectedVersionProps = versionProperties.find((v) => v.clarionVersion === versionSelection);
      if (!selectedVersionProps) {
        window.showErrorMessage(`Clarion version '${versionSelection}' not found in ClarionProperties.xml.`);
        return;
      }

      // ✅ Save the selected version
      await setGlobalClarionSelection(globalSolutionFile, selectedFilePath, versionSelection, globalSettings.configuration);

      // ✅ Update global runtime settings (NOT stored in workspace.json)
      ClarionExtensionCommands.updateGlobalSettings(selectedVersionProps);

      window.showInformationMessage(`Clarion version '${versionSelection}' selected and settings updated.`);

    } catch (error) {

      window.showErrorMessage(`Error configuring Clarion properties: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  /**
   * Updates the global Clarion settings to reflect the specified version properties.
   *
   * @param selectedVersionProps - The Clarion version properties that will be used
   * to update the current global configuration. If omitted, no update occurs.
   *
   * @remarks
   * This method adjusts the global redirection file, its directory path, macros, and LIBSRC paths
   * to match the specified version's configuration. It logs the updated settings for reference.
   */
  private static updateGlobalSettings(selectedVersionProps: ClarionVersionProperties | undefined) {

    if (selectedVersionProps) {
      globalSettings.redirectionFile = selectedVersionProps.redirectionFile;
      globalSettings.redirectionPath = path.dirname(selectedVersionProps.redirectionFile);
      globalSettings.macros = selectedVersionProps.macros;
      globalSettings.libsrcPaths = selectedVersionProps.libsrc.split(';');


    }
  }

  /**
   * Asynchronously parses the specified XML file to retrieve all available Clarion versions.
   *
   * @param filePath - The full path to the XML file containing Clarion version properties.
   * @returns A promise that resolves to an array of ClarionVersionProperties objects, each representing
   *          a discovered Clarion version along with its associated configuration data.
   */
  private static async parseAvailableVersions(filePath: string): Promise<ClarionVersionProperties[]> {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    let versions: ClarionVersionProperties[] = [];

    parseString(xmlContent, (err, result) => {
      if (!err && result?.ClarionProperties?.Properties) {
        const propertiesArray = result.ClarionProperties.Properties;

        for (const properties of propertiesArray) {
          if (properties.$.name === 'Clarion.Versions') {
            for (const versionProperty of properties.Properties) {
              const versionName = versionProperty.$.name;
              if (!versionName.includes("Clarion.NET")) {
                const versionProps: ClarionVersionProperties = {
                  clarionVersion: versionName,
                  path: versionProperty.path?.[0]?.$.value || '',
                  redirectionFile: ClarionExtensionCommands.extractRedirectionFile(versionProperty.Properties),
                  macros: ClarionExtensionCommands.extractMacros(versionProperty.Properties),
                  libsrc: versionProperty.libsrc?.[0]?.$.value || ''
                };

                versions.push(versionProps);
              }
            }
            break; // Exit loop after finding Clarion.Versions
          }
        }
      }
    });

    return versions;
  }

  /**
   * Retrieves the value of the "RedirectionFile" property from a given array
   * of property objects. If the property is not found, returns an empty string.
   *
   * @param properties - The array of property objects to search.
   * @returns The value of the "RedirectionFile" property or an empty string if it's absent.
   */
  private static extractRedirectionFile(properties: any[]): string {
    const redirectionFileProperty = properties.find((p: any) => p.$.name === 'RedirectionFile');
    return redirectionFileProperty?.Name?.[0]?.$.value || '';
  }


  /**
   * Extracts macro definitions from a given properties object, typically derived
   * from XML structure. This function expects to find a "RedirectionFile" property
   * containing a "Macros" section, each macro item being parsed into a key-value pair.
   * 
   * @param properties - The properties object (or array of objects) containing
   *   potential macro definitions under "RedirectionFile" → "Macros".
   * @returns A record mapping each macro name (in lowercase) to its string value.
   * 
   * @remarks
   * - Logs various messages to indicate the extraction process and any anomalies
   *   with the data structure.
   * - Converts a single properties object into an array for uniform processing.
   * - Any macro entries that do not meet the expected format generate warning logs
   *   rather than an error.
   */
  public static extractMacros(properties: any): Record<string, string> {

    const macros: Record<string, string> = {};



    if (!properties || typeof properties !== 'object') {

      return macros;
    }

    if (!Array.isArray(properties)) {
      logger.warn("⚠️ Expected properties to be an array, but got:", typeof properties);
      properties = [properties];  // Convert to array if it's an object
    }

    const redirectionFileProperty = properties.find((p: any) => p.$.name === 'RedirectionFile');

    if (redirectionFileProperty?.Properties) {
      const macrosProperty = redirectionFileProperty.Properties.find((p: any) => p.$.name === 'Macros');

      if (macrosProperty) {


        for (const prop in macrosProperty) {

          if (prop.toLowerCase() === "$") {
            logger.info(`🔍 Skipping $ property: '${prop}'`);
            continue; // ✅ Skip this iteration of the loop
          }
          if (Array.isArray(macrosProperty[prop]) && macrosProperty[prop].length > 0) {
            const firstItem = macrosProperty[prop][0];

            if (firstItem && typeof firstItem === "object" && "$" in firstItem && "value" in firstItem.$) {
              macros[prop.toLowerCase()] = String(firstItem.$.value);

            } else {
              logger.warn(`⚠️ Unexpected structure for macro '${prop}':`, firstItem);
            }
          } else {
            logger.warn(`⚠️ Macro '${prop}' does not contain an array or is empty.`);
          }
        }
      } else {
        logger.warn("⚠️ No 'Macros' section found in RedirectionFile.");
      }
    } else {
      logger.warn("⚠️ No 'RedirectionFile' property found in provided XML.");
    }

    logger.info("✅ Final Extracted Macros:", macros);

    return macros;
  }


  /**
   * Prompts the user to select a solution file from the current workspace and updates the workspace configuration.
   * 
   * @remarks
   * This method opens a file dialog filtered for Visual Studio solution files, allowing the user to pick a file.
   * If a file is successfully selected, it updates the `clarion.solutionFile` setting in the workspace configuration 
   * and shows a confirmation message. Otherwise, it shows a notification indicating no file was selected or an error occurred.
   * 
   * @throws Will show an error message and log in case of any unexpected failure during file selection.
   * 
   * @returns A promise that resolves once the solution file selection and configuration update are complete.
   */
  static async selectSolutionFile() {
    try {
      const workspaceFolder = workspace.workspaceFolders?.[0];

      if (!workspaceFolder) {
        window.showErrorMessage("You must open a workspace to select a solution file.");
        return;
      }

      const solutionFile = await window.showOpenDialog({
        defaultUri: workspaceFolder.uri,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select your solution file',
        filters: { "Solution Files": ['sln'] }
      });

      if (!solutionFile || solutionFile.length === 0) {
        window.showInformationMessage("No solution file selected.");
        return;
      }

      const solutionFilePath = solutionFile[0].fsPath;
      await workspace.getConfiguration().update('clarion.solutionFile', solutionFilePath, ConfigurationTarget.Workspace);

      window.showInformationMessage(`Solution file selected: ${solutionFilePath}`);
    } catch (error) {
      logger.info("Error selecting solution file:", error);
      window.showErrorMessage("An error occurred while selecting the solution file.");
    }
  }


  /**
   * Asynchronously selects a Clarion version from the workspace configuration.
   * 
   * Retrieves a list of available Clarion versions from the extension settings.
   * If no versions are configured, displays an error message. Otherwise, presents
   * a quick pick menu allowing the user to choose a version, then updates the
   * workspace settings with the chosen version and displays a confirmation message.
   *
   * @returns A promise that resolves when the chosen version is stored or if none is chosen.
   */
  static async selectClarionVersion() {
    const config = workspace.getConfiguration();
    let versions = config.get<string[]>('clarion.versions', []);

    const choices = versions.length > 0
      ? [...versions, "🔹 Add new version..."]
      : ["🔹 Add new version..."];

    const selectedVersion = await window.showQuickPick(choices, { placeHolder: "Select a Clarion version" });

    // ✅ If user cancels, exit
    if (!selectedVersion) return;

    // ✅ Handle manual version entry
    if (selectedVersion === "🔹 Add new version...") {
      const manualVersion = await window.showInputBox({
        prompt: "Enter a Clarion version (e.g., Clarion 11.1.13855):",
        placeHolder: "Clarion 11.1.XXXXX"
      });

      if (!manualVersion) {
        window.showWarningMessage("Clarion version selection was canceled.");
        return;
      }

      // ✅ Ensure the new version is added to the list
      versions.push(manualVersion);
      await config.update('clarion.versions', versions, ConfigurationTarget.Workspace);
      await config.update('clarion.version', manualVersion, ConfigurationTarget.Workspace);

      window.showInformationMessage(`Added and selected Clarion version: ${manualVersion}`);
      return; // ✅ Ensure we EXIT after setting the version
    }

    // ✅ If user selects an existing version, just set it and exit
    await config.update('clarion.version', selectedVersion, ConfigurationTarget.Workspace);
    window.showInformationMessage(`Selected Clarion version: ${selectedVersion}`);
  }




  /**
   * Asynchronously updates the workspace configurations for Clarion.
   *
   * This method retrieves the Clarion properties file path and selected version from
   * the user's workspace settings. It parses available versions and updates the global
   * settings if a matching version is found. Any errors are logged.
   *
   * @throws {Error} If there is a problem reading or parsing the properties file, or
   * if updating the configuration fails for any reason.
   */
  static async updateWorkspaceConfigurations() {
    try {
      const clarionFilePath = workspace.getConfiguration().get<string>('clarion.propertiesFile');
      if (clarionFilePath) {
        const versionProperties = await ClarionExtensionCommands.parseAvailableVersions(clarionFilePath);
        const selectedVersion = workspace.getConfiguration().get<string>('selectedClarionVersion');
        if (selectedVersion) {
          const selectedVersionProps = versionProperties.find(v => v.clarionVersion === selectedVersion);
          ClarionExtensionCommands.updateGlobalSettings(selectedVersionProps);
        }
      }
    } catch (error) {
      logger.info(String(error));
    }
  }
  static async followLink(documentManager: DocumentManager) {
    const editor = window.activeTextEditor;
    if (editor) {
      const position = editor.selection.active;
      const linkUri = documentManager.getLinkUri(editor.document.uri, position);
      if (linkUri) {
        commands.executeCommand('vscode.open', linkUri);
      } else {
        window.showInformationMessage('No link found at the cursor position.');
      }
    }
  }


}
