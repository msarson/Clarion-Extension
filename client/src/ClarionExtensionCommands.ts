import { window, workspace, ConfigurationTarget, Uri } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseString } from 'xml2js';

// Define the ClarionVersionProperties interface here if not already defined
interface ClarionVersionProperties {
  clarionVersion: string;
  path: string;
  redirectionFile: string;
  macros: Record<string, string>;
  libsrc: string;
}

/**
 * A class that contains methods for various Clarion extension commands.
 */
export class ClarionExtensionCommands {

  static async configureClarionPropertiesFile() {
    try {
      const appDataPath = process.env.APPDATA;
      if (!appDataPath) {
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
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  // ... other methods ...

  /**
   * Parses an XML file containing Clarion version properties and returns an array of ClarionVersionProperties objects.
   * @param filePath The path to the XML file to parse.
   * @returns An array of ClarionVersionProperties objects.
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

  private static extractRedirectionFile(properties: any[]): string {
    const redirectionFileProperty = properties.find((property: any) => property.$.name === 'RedirectionFile');
    if (redirectionFileProperty && redirectionFileProperty.Name && redirectionFileProperty.Name[0].$.value) {
      return redirectionFileProperty.Name[0].$.value;
    }
    return ''; // Return a default value if not found
  }


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
  static async updateWorkspaceConfigurations() {
    try {
      const clarionFilePath = workspace.getConfiguration().get<string>('clarionPropertiesFile');
      if (clarionFilePath) {
        const versionProperties = await ClarionExtensionCommands.parseAvailableVersions(clarionFilePath);

        const selectedVersion = workspace.getConfiguration().get<string>('selectedClarionVersion');
        const selectedVersionProps = versionProperties.find(version => version.clarionVersion === selectedVersion);
        const updatedSolution = workspace.getConfiguration().get<string>('applicationSolutionFile');
        if (selectedVersionProps) {
          const updatedPath = selectedVersionProps.path;
          const updatedRedirectionFile = selectedVersionProps.redirectionFile;
          const updatedMacros = selectedVersionProps.macros;
          const updatedLibsrc = selectedVersionProps.libsrc;
        

          const currentPath = workspace.getConfiguration().get<string>('selectedClarionPath');
          const currentRedirectionFile = workspace.getConfiguration().get<string>('selectedClarionRedirectionFile');
          const currentMacros = workspace.getConfiguration().get<Record<string, string>>('selectedClarionMacros');
          const currentLibsrc = workspace.getConfiguration().get<string>('selectedClarionLibsrc');
          const currentSoltion = workspace.getConfiguration().get<string>('applicationSolutionFile');

          if (
            updatedPath !== currentPath ||
            updatedRedirectionFile !== currentRedirectionFile ||
            JSON.stringify(updatedMacros) !== JSON.stringify(currentMacros) ||
            updatedLibsrc !== currentLibsrc ||
            updatedSolution !== currentSoltion
            
          ) {
            await workspace.getConfiguration().update('selectedClarionPath', updatedPath, ConfigurationTarget.Workspace);
            await workspace.getConfiguration().update('selectedClarionRedirectionFile', updatedRedirectionFile, ConfigurationTarget.Workspace);
            await workspace.getConfiguration().update('selectedClarionMacros', updatedMacros, ConfigurationTarget.Workspace);
            await workspace.getConfiguration().update('selectedClarionLibsrc', updatedLibsrc, ConfigurationTarget.Workspace);
            await workspace.getConfiguration().update('applicationSolutionFile', updatedSolution, ConfigurationTarget.Workspace);
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
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


}
