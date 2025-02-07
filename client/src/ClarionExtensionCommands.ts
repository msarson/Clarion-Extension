import { window, workspace, ConfigurationTarget, Uri, commands } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseString } from 'xml2js';
import { DocumentManager } from './documentManager';
import { SolutionParser } from './SolutionParser';
// Define the ClarionVersionProperties interface here if not already defined
interface ClarionVersionProperties {
  clarionVersion: string;
  path: string;
  redirectionFile: string;
  macros: Record<string, string>;
  libsrc: string;
}

interface ProjectInfo {
  name: string;
  path: string;
  guid: string;
}



/**
 * A class that contains methods for various Clarion extension commands.
 */
/**
 * Provides various commands for the Clarion Extension.
 *
 * This class encapsulates command implementations to manage and configure Clarion-related
 * settings within the VS Code extension. It includes functionalities such as:
 *
 * - Configuring the Clarion properties file by prompting the user to select a file.
 * - Parsing an XML file to extract available Clarion versions and their associated properties.
 * - Updating workspace settings based on the selected Clarion version, such as setting paths,
 *   macros, and redirection files.
 * - Selecting a solution file specific to the project.
 * - Following links in the active text editor based on the document manager.
 *
 * @remarks
 * The XML parsing is performed using a callback-based approach (via parseString), which extracts
 * detailed Clarion version information (like version name, path, redirection file, macros, and libsrc).
 * The class relies on environment variables (e.g., APPDATA) and VS Code APIs (such as window, workspace,
 * commands) to perform its operations. It is intended to be used as part of the VS Code extension command
 * registration.
 *
 * @public
 */
export class ClarionExtensionCommands {

  /**
   * Configures the Clarion Properties File by prompting the user to select a ClarionProperties.xml file.
   *
   * The process involves the following steps:
   * 1. Validates the presence of the APPDATA environment variable and logs an error if it is not set.
   * 2. Opens a file dialog with a default directory set to APPDATA/SoftVelocity/Clarion, allowing the user to select an XML file.
   * 3. Updates the workspace configuration with the selected file path under the 'clarionPropertiesFile' key.
   * 4. Parses the available Clarion versions from the selected file. If one or more versions are found, it:
   *    a. Presents the user with a quick pick list to select a specific Clarion version.
   *    b. Updates the workspace settings based on the selected version's properties.
   *
   * If any errors occur during the process, they are logged to the console, and appropriate error messages are displayed.
   *
   * @returns A promise that resolves once the configuration process is complete.
   */
  static async configureClarionPropertiesFile() {
    try {
      const appDataPath = process.env.APPDATA;
      if (!appDataPath) {
        window.showErrorMessage(`unable to access appdata path`);
        console.error('APPDATA environment variable is not set.');
        return;
      }

      const defaultDirectory = Uri.file(path.join(appDataPath, 'SoftVelocity', 'Clarion'));

      const selectedFileUri = await window.showOpenDialog({
        defaultUri: defaultDirectory,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select ClarionProperties.xml',
        filters: {
          XML: ['xml']
        }
      });

      if (selectedFileUri && selectedFileUri.length > 0) {
        const selectedFilePath = selectedFileUri[0].fsPath;
        await workspace
          .getConfiguration()
          .update('clarionPropertiesFile', selectedFilePath, ConfigurationTarget.Workspace);

        const versionProperties = await ClarionExtensionCommands.parseAvailableVersions(selectedFilePath);
        if (versionProperties.length > 0) {
          const versionSelection = await window.showQuickPick(versionProperties.map(version => version.clarionVersion), {
            placeHolder: 'Select a Clarion version'
          });

          if (versionSelection) {
            const selectedVersionProps = versionProperties.find(version => version.clarionVersion === versionSelection);
            await ClarionExtensionCommands.updateWorkspaceSettings(selectedVersionProps);
          }
          
        }else {
          window.showErrorMessage('No Clarion versions found in the selected ClarionProperties.xml file.');
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Updates the workspace configuration with the provided Clarion version properties.
   *
   * This function checks if the specified version properties are defined before updating
   * the workspace settings. If defined, it sets the selected Clarion version, path, redirection file,
   * macros, and libsrc in the workspace configuration.
   *
   * @param selectedVersionProps - The Clarion version properties object containing the necessary values
   *                               for updating the workspace settings. If undefined, no updates are performed.
   */
  private static async updateWorkspaceSettings(selectedVersionProps: ClarionVersionProperties | undefined) {
    if (selectedVersionProps) {
      await workspace
        .getConfiguration()
        .update('selectedClarionVersion', selectedVersionProps.clarionVersion, ConfigurationTarget.Workspace);
      await workspace
        .getConfiguration()
        .update('selectedClarionPath', selectedVersionProps.path, ConfigurationTarget.Workspace);
      await workspace
        .getConfiguration()
        .update('selectedClarionRedirectionFile', selectedVersionProps.redirectionFile, ConfigurationTarget.Workspace);
      await workspace
        .getConfiguration()
        .update('selectedClarionMacros', selectedVersionProps.macros, ConfigurationTarget.Workspace);
      await workspace
        .getConfiguration()
        .update('selectedClarionLibsrc', selectedVersionProps.libsrc, ConfigurationTarget.Workspace);
    }
  }

  // ... other methods ...

 
  /**
   * Reads and parses available Clarion version properties from an XML file.
   *
   * This function retrieves the content of the file specified by the given file path,
   * converts it from XML to a JavaScript object, and extracts Clarion version properties.
   * It specifically searches for the element with the name "Clarion.Versions", iterates over its
   * child properties, and excludes any version names that include "Clarion.NET". For each valid version,
   * the function extracts detailed properties such as the version name, path, redirection file, macros, and libsrc.
   *
   * @param filePath - The path to the XML file containing Clarion properties.
   * @returns A promise that resolves to an array of ClarionVersionProperties, each representing a parsed Clarion version.
   *
   * @remarks
   * The XML is parsed asynchronously, and the extraction of redirection files and macros is delegated to
   * the corresponding helper methods. If the XML structure does not follow the expected schema or the
   * "Clarion.Versions" property is not found, the function returns an empty array.
   */
  private static async parseAvailableVersions(filePath: string): Promise<ClarionVersionProperties[]> {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    let versions: ClarionVersionProperties[] = [];

    parseString(xmlContent, (err, result) => {
      if (!err && result && result.ClarionProperties && result.ClarionProperties.Properties) {
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
            break; // Exit the loop once the desired Properties element is found
          }
        }
      }
    });

    return versions;
  }

  /**
   * Extracts the redirection file path from the provided properties array.
   *
   * The function iterates over the properties array to locate an object with a "$.name"
   * attribute equal to 'RedirectionFile'. If such an object is found and contains a valid
   * "Name" field with a "$.value", that value is returned as the redirection file path.
   *
   * @param properties - An array of property objects, typically derived from an XML structure.
   * @returns The redirection file path if the property exists and has a valid value; otherwise, returns an empty string.
   */
  private static extractRedirectionFile(properties: any[]): string {
    const redirectionFileProperty = properties.find((property: any) => property.$.name === 'RedirectionFile');
    if (redirectionFileProperty && redirectionFileProperty.Name && redirectionFileProperty.Name[0].$.value) {
      return redirectionFileProperty.Name[0].$.value;
    }
    return ''; // Return a default value if not found
  }


  /**
   * Extracts macro key-value pairs from a given properties array.
   *
   * The function searches for a property with the name "RedirectionFile". If found,
   * it then looks for a nested property named "Macros" within it. The macros are extracted
   * by iterating over the properties in "Macros", where each property is expected to be an array.
   * For each array, the first item is examined; if it is an object containing a "$" key,
   * its "value" attribute is used as the macro value.
   *
   * @param properties - An array of objects representing the configuration properties.
   * @returns A record where each key is the macro name and the corresponding value is the macro value.
   */
  private static extractMacros(properties: any[]): Record<string, string> {
    const redirectionFileProperty = properties.find((property: any) => property.$.name === 'RedirectionFile');
    const macros: Record<string, string> = {};

    if (redirectionFileProperty && redirectionFileProperty.Properties) {
      const macrosProperty = redirectionFileProperty.Properties.find((property: any) => property.$.name === 'Macros');

      for (const prop in macrosProperty) {
        if (Array.isArray(macrosProperty[prop])) {
          const firstItem = macrosProperty[prop][0];
          if (firstItem && typeof firstItem === "object" && "$" in firstItem) {
            const value = firstItem["$"]["value"];
            const attributeName = prop;
            const attributeValue = value;

            macros[attributeName] = attributeValue;

          }
        }
      }

    } else {
      console.log('No redirectionFileProperty or properties found.');
    }

    return macros;
  }


  /**
   * Updates the workspace configurations by reading the Clarion properties file, parsing available Clarion versions,
   * and applying the configuration corresponding to the selected Clarion version.
   *
   * This asynchronous method performs the following steps:
   * 1. Retrieves the file path for the Clarion properties file from the workspace configuration.
   * 2. Parses the available Clarion versions from the specified properties file.
   * 3. Retrieves the currently selected Clarion version from the workspace configuration.
   * 4. Locates the properties for the selected version and updates the workspace settings accordingly.
   *
   * Any errors encountered during the process are caught and logged to the console.
   *
   * @async
   * @throws Will log an error if an exception occurs during the configuration update process.
   */
  static async updateWorkspaceConfigurations() {
    try {
      const clarionFilePath = workspace.getConfiguration().get<string>('clarionPropertiesFile');
      if (clarionFilePath) {
        const versionProperties = await ClarionExtensionCommands.parseAvailableVersions(clarionFilePath);
        const selectedVersion = workspace.getConfiguration().get<string>('selectedClarionVersion');
        if (selectedVersion) {
          const selectedVersionProps = versionProperties.find(version => version.clarionVersion === selectedVersion);
          await this.updateWorkspaceSettings(selectedVersionProps);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }


  

  /**
   * Prompts the user to select a solution file (.sln) from the workspace.
   *
   * This asynchronous method opens a file selection dialog starting at the first workspace folder.
   * It allows only files to be selected and filters for the '.sln' file extension.
   *
   * Upon selection, the method retrieves the file path of the chosen solution file and updates
   * the workspace configuration with this path under the key 'applicationSolutionFile'.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when the selection and update process is complete.
   */
  static async selectSolutionFile() {
    const workspaceFolder = workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspaceFolderUri = workspaceFolder.uri;
      const workspaceFolderPath = workspaceFolderUri.fsPath;
      const solutionFile = await window.showOpenDialog({
        defaultUri: workspaceFolderUri,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select your solution file',
        filters: {
          XML: ['sln']
        }
      });
      if (solutionFile && solutionFile.length > 0) {
        const solutionFilePath = solutionFile[0].fsPath;
        await workspace
          .getConfiguration()
          .update('applicationSolutionFile', solutionFilePath, ConfigurationTarget.Workspace);

      }
    }
  }


  /**
   * Follows a link by opening the document at the URI derived from the current cursor position.
   *
   * This asynchronous function retrieves the active text editor and obtains the cursor 
   * position. It then uses the provided DocumentManager to compute the corresponding link URI.
   * If a valid URI is found, it opens the document by executing the 'vscode.open' command.
   * Otherwise, an informational message is shown to indicate that no link was found.
   *
   * @param documentManager - The DocumentManager instance used to derive the link URI.
   * @async
   */
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
