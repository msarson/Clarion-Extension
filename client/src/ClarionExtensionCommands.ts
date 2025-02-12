import { window, workspace, ConfigurationTarget, Uri, commands } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseString } from 'xml2js';
import { DocumentManager } from './documentManager';
import { Logger } from './UtilityClasses/Logger';
import { globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, setGlobalClarionSelection, globalSettings,  } from './globals';

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
   * Prompts the user to select a ClarionProperties.xml file and updates the global settings.
   */
  static async configureClarionPropertiesFile() {
    const logger = new Logger();
    try {
      const appDataPath = process.env.APPDATA;
      if (!appDataPath) {
        window.showErrorMessage("Unable to access AppData path.");
        logger.error('APPDATA environment variable is not set.');
        return;
      }

      const defaultDirectory = Uri.file(path.join(appDataPath, 'SoftVelocity', 'Clarion'));

      const selectedFileUri = await window.showOpenDialog({
        defaultUri: defaultDirectory,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select ClarionProperties.xml',
        filters: { XML: ['xml'] }
      });

      if (!selectedFileUri || selectedFileUri.length === 0) {
        window.showErrorMessage("No ClarionProperties.xml file selected.");
        return;
      }

      const selectedFilePath = selectedFileUri[0].fsPath;
      logger.info("📂 Selected ClarionProperties.xml:", selectedFilePath);

      // ✅ Update global setting and workspace setting for ClarionProperties.xml
      await setGlobalClarionSelection(globalSolutionFile, selectedFilePath, globalClarionVersion ,globalSettings.configuration);

      // ✅ Parse available versions from the selected file
      const versionProperties = await ClarionExtensionCommands.parseAvailableVersions(selectedFilePath);

      if (versionProperties.length === 0) {
        window.showErrorMessage('No Clarion versions found in the selected ClarionProperties.xml file.');
        return;
      }

      // ✅ Ask the user to select a Clarion version
      const versionSelection = await window.showQuickPick(versionProperties.map(v => v.clarionVersion), {
        placeHolder: 'Select a Clarion version'
      });

      if (!versionSelection) {
        window.showErrorMessage("No Clarion version selected.");
        return;
      }

      const selectedVersionProps = versionProperties.find(v => v.clarionVersion === versionSelection);
      if (!selectedVersionProps) {
        window.showErrorMessage(`Clarion version '${versionSelection}' not found in ClarionProperties.xml.`);
        return;
      }

      // ✅ Update global setting and workspace setting for Clarion version
      await setGlobalClarionSelection(globalSolutionFile, globalClarionPropertiesFile, versionSelection, globalSettings.configuration);

      // ✅ Update runtime global settings (NOT stored in workspace)
      ClarionExtensionCommands.updateGlobalSettings(selectedVersionProps);

      window.showInformationMessage(`Clarion version '${versionSelection}' selected and settings updated.`);

    } catch (error) {
      logger.error("❌ Error in configureClarionPropertiesFile:", error);
      window.showErrorMessage(`Error configuring Clarion properties: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Updates the global variables instead of workspace settings.
   * @param selectedVersionProps The selected Clarion version properties.
   */
  private static updateGlobalSettings(selectedVersionProps: ClarionVersionProperties | undefined) {
    const logger = new Logger(); 
    if (selectedVersionProps) {
      globalSettings.redirectionFile = selectedVersionProps.redirectionFile;
      globalSettings.redirectionPath = path.dirname(selectedVersionProps.redirectionFile);
      globalSettings.macros = selectedVersionProps.macros;
      globalSettings.libsrcPaths = selectedVersionProps.libsrc.split(';');

      logger.info("✅ Updated global Clarion settings:", {
        globalRedirectionFile: globalSettings.redirectionFile,
        globalRedirectionPath: globalSettings.redirectionPath,
        globalMacros: globalSettings.macros,
        globalLibsrcPaths: globalSettings.libsrcPaths
      });
    }
  }



  /**
   * Reads and parses available Clarion version properties from an XML file.
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

  private static extractRedirectionFile(properties: any[]): string {
    const redirectionFileProperty = properties.find((p: any) => p.$.name === 'RedirectionFile');
    return redirectionFileProperty?.Name?.[0]?.$.value || '';
  }

  public static extractMacros(properties: any): Record<string, string> {
    const logger = new Logger(); 
    const macros: Record<string, string> = {};

    logger.info("🔍 Starting extractMacros...");

    if (!properties || typeof properties !== 'object') {
      logger.error("❌ extractMacros received invalid properties:", properties);
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
        logger.info("📌 Found 'Macros' section. Parsing properties...");

        for (const prop in macrosProperty) {
          logger.info(`🔹 Processing macro: ${prop}`, macrosProperty[prop]);

          if (Array.isArray(macrosProperty[prop]) && macrosProperty[prop].length > 0) {
            const firstItem = macrosProperty[prop][0];

            if (firstItem && typeof firstItem === "object" && "$" in firstItem && "value" in firstItem.$) {
              macros[prop.toLowerCase()] = String(firstItem.$.value);
              logger.info(`✅ Extracted Macro: ${prop} → "${macros[prop.toLowerCase()]}"`);
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
   * Prompts the user to select a solution file (.sln).
   */
  static async selectSolutionFile() {
    const logger = new Logger(); 
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
      logger.error("Error selecting solution file:", error);
      window.showErrorMessage("An error occurred while selecting the solution file.");
    }
  }
  static async selectClarionVersion() {
    const versions = workspace.getConfiguration().get<string[]>('clarion.versions', []);
    if (versions.length === 0) {
      window.showErrorMessage("No Clarion versions found in settings.");
      return;
    }

    const selectedVersion = await window.showQuickPick(versions, { placeHolder: "Select a Clarion version" });
    if (selectedVersion) {
      await workspace.getConfiguration().update('selectedClarionVersion', selectedVersion, ConfigurationTarget.Workspace);
      window.showInformationMessage(`Selected Clarion version: ${selectedVersion}`);
    }
  }


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
      const logger = new Logger(); 
      logger.error(String(error));
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
