import { window, workspace, Uri, commands } from 'vscode';
import { ClarionInstallationDetector, ClarionInstallation } from '../utils/ClarionInstallationDetector';
import { SolutionScanner, DetectedSolution } from '../utils/SolutionScanner';
import { SettingsStorageManager } from '../utils/SettingsStorageManager';
import { setGlobalClarionSelection } from '../globals';
import LoggerManager from '../logger';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SmartSolutionOpener");

export class SmartSolutionOpener {
    /**
     * Opens a detected solution with smart auto-detection
     */
    static async openDetectedSolution(solutionPath: string): Promise<boolean> {
        try {
            logger.info(`📂 Opening detected solution: ${solutionPath}`);

            // Step 1: Auto-detect Clarion installations
            const installations = await ClarionInstallationDetector.detectInstallations();

            if (installations.length === 0) {
                window.showErrorMessage(
                    "No Clarion installations detected. Please install Clarion or manually configure ClarionProperties.xml."
                );
                return false;
            }

            // Step 2: Let user select installation if multiple found
            let selectedInstallation: ClarionInstallation;
            let selectedCompiler: string;

            if (installations.length === 1 && installations[0].compilerVersions.length === 1) {
                // Only one installation and one compiler - use it automatically
                selectedInstallation = installations[0];
                selectedCompiler = installations[0].compilerVersions[0].name;
                logger.info(`✅ Auto-selected: Clarion ${selectedInstallation.ideVersion} → ${selectedCompiler}`);
            } else {
                // Multiple options - show picker
                const result = await this.showInstallationPicker(installations);
                if (!result) {
                    logger.info("ℹ️ User cancelled installation selection");
                    return false;
                }
                selectedInstallation = result.installation;
                selectedCompiler = result.compilerName;
            }

            // Step 3: Extract configurations from .sln file
            const configurations = this.extractConfigurationsFromSolution(solutionPath);
            let selectedConfig = "Release"; // Default

            if (configurations.length > 1) {
                const configChoice = await window.showQuickPick(configurations, {
                    placeHolder: "Select build configuration"
                });
                if (configChoice) {
                    selectedConfig = configChoice;
                }
            } else if (configurations.length === 1) {
                selectedConfig = configurations[0];
            }

            // Step 4: Save settings using smart storage manager
            const success = await SettingsStorageManager.saveSolutionSettings(
                solutionPath,
                selectedInstallation.propertiesPath,
                selectedCompiler,
                selectedConfig
            );

            if (!success) {
                window.showErrorMessage("Failed to save solution settings");
                return false;
            }

            // Step 5: Update global variables
            await setGlobalClarionSelection(
                solutionPath,
                selectedInstallation.propertiesPath,
                selectedCompiler,
                selectedConfig
            );

            // Step 6: Set environment variable for server
            process.env.CLARION_SOLUTION_FILE = solutionPath;

            // Step 7: Set context for UI
            await commands.executeCommand("setContext", "clarion.solutionOpen", true);

            // Step 8: Check if we should suggest workspace
            const shouldSuggestWorkspace = await SettingsStorageManager.shouldSuggestWorkspace();
            if (shouldSuggestWorkspace) {
                const choice = await window.showInformationMessage(
                    "Multiple solutions detected. Create a workspace to manage them better?",
                    "Yes, Create Workspace",
                    "No, Keep Using Folder Settings"
                );

                if (choice === "Yes, Create Workspace") {
                    await SettingsStorageManager.createWorkspaceFile(solutionPath);
                }
            }

            window.showInformationMessage(
                `Clarion Solution Opened: ${path.basename(solutionPath)}`
            );

            return true;

        } catch (error) {
            const errMessage = error instanceof Error ? error.message : String(error);
            logger.error("❌ Error opening detected solution:", error);
            window.showErrorMessage(`Error opening solution: ${errMessage}`);
            return false;
        }
    }

    /**
     * Shows a picker for selecting Clarion installation and compiler
     */
    private static async showInstallationPicker(
        installations: ClarionInstallation[]
    ): Promise<{ installation: ClarionInstallation; compilerName: string } | null> {
        
        interface InstallationPickerItem {
            label: string;
            description: string;
            installation: ClarionInstallation;
            compilerName: string;
        }

        const items: InstallationPickerItem[] = [];

        for (const installation of installations) {
            for (const compiler of installation.compilerVersions) {
                items.push({
                    label: `$(file) Clarion ${installation.ideVersion}`,
                    description: compiler.name,
                    installation: installation,
                    compilerName: compiler.name
                });
            }
        }

        const selected = await window.showQuickPick(items, {
            placeHolder: "Select Clarion IDE and compiler version",
            matchOnDescription: true
        });

        if (!selected) {
            return null;
        }

        return {
            installation: selected.installation,
            compilerName: selected.compilerName
        };
    }

    /**
     * Extracts configurations from solution file
     */
    private static extractConfigurationsFromSolution(solutionPath: string): string[] {
        try {
            const solutionContent = fs.readFileSync(solutionPath, 'utf-8');
            const sectionPattern = /GlobalSection\(SolutionConfigurationPlatforms\)\s*=\s*preSolution([\s\S]*?)EndGlobalSection/;
            const match = sectionPattern.exec(solutionContent);

            if (!match) {
                logger.warn("⚠️ No configurations found in solution file. Defaulting to Debug/Release.");
                return ["Debug", "Release"];
            }

            const sectionContent = match[1];
            const configurations = sectionContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith("GlobalSection"))
                .map(line => {
                    const parts = line.split('|');
                    return parts.length > 0 ? parts[0].trim() : '';
                })
                .filter((config, index, self) => config && self.indexOf(config) === index);

            return configurations.length > 0 ? configurations : ["Debug", "Release"];
        } catch (error) {
            logger.error("❌ Error parsing solution file:", error);
            return ["Debug", "Release"];
        }
    }

    /**
     * Gets a list of detected solutions with their status
     */
    static async getDetectedSolutionsStatus(): Promise<{
        solutions: DetectedSolution[];
        installations: ClarionInstallation[];
    }> {
        const solutions = await SolutionScanner.scanWorkspaceFolders();
        const installations = await ClarionInstallationDetector.detectInstallations();

        return { solutions, installations };
    }
}
