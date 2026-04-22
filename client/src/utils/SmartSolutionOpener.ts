import { window, workspace, Uri, commands } from 'vscode';
import { ClarionInstallationDetector, ClarionInstallation } from '../utils/ClarionInstallationDetector';
import { SolutionScanner, DetectedSolution } from '../utils/SolutionScanner';
import { SettingsStorageManager } from '../utils/SettingsStorageManager';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { setGlobalClarionSelection } from '../globals';
import { readActiveConfigFromSlnCache, configNameFromFull } from './SlnCacheUtils';
import LoggerManager from './LoggerManager';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SmartSolutionOpener", "info");

export interface PreSelectedSettings {
    installation: ClarionInstallation;
    compilerName: string;
    configuration: string;
}

export class SmartSolutionOpener {
    /**
     * Checks if existing settings for a solution are still valid
     */
    private static validateExistingSettings(
        solutionPath: string,
        propertiesFile: string,
        version: string
    ): { valid: boolean; reason?: string } {
        // Check if properties file exists
        if (!fs.existsSync(propertiesFile)) {
            return { valid: false, reason: `Properties file not found: ${propertiesFile}` };
        }

        // Check if solution file exists
        if (!fs.existsSync(solutionPath)) {
            return { valid: false, reason: `Solution file not found: ${solutionPath}` };
        }

        // Check if version string is reasonable
        if (!version || version.trim() === '') {
            return { valid: false, reason: 'Version is empty' };
        }

        return { valid: true };
    }

    /**
     * Attempts to load existing settings for a solution from the solutions array
     */
    private static getExistingSolutionSettings(solutionPath: string): {
        propertiesFile: string;
        version: string;
        configuration: string;
    } | null {
        try {
            if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
                return null;
            }

            const workspaceFolder = workspace.workspaceFolders[0];
            const config = workspace.getConfiguration('clarion', workspaceFolder.uri);
            const solutions = config.get<Array<{
                solutionFile: string;
                propertiesFile: string;
                version: string;
                configuration: string;
            }>>('solutions', []);

            // Find the solution in the array
            const existingSolution = solutions.find(s => 
                s.solutionFile.toLowerCase() === solutionPath.toLowerCase()
            );

            if (!existingSolution) {
                logger.info(`ℹ️ No existing settings found for: ${solutionPath}`);
                return null;
            }

            logger.info(`✅ Found existing settings for: ${solutionPath}`);
            return {
                propertiesFile: existingSolution.propertiesFile,
                version: existingSolution.version,
                configuration: existingSolution.configuration
            };
        } catch (error) {
            logger.error('❌ Error checking existing settings:', error);
            return null;
        }
    }

    /**
     * Opens a detected solution with smart auto-detection
     */
    static async openDetectedSolution(solutionPath: string, preSelected?: PreSelectedSettings): Promise<boolean> {
        try {
            logger.info(`📂 Opening detected solution: ${solutionPath}`);

            // Step 1: Check if we have existing valid settings for this solution
            const existingSettings = this.getExistingSolutionSettings(solutionPath);
            
            if (existingSettings) {
                const validation = this.validateExistingSettings(
                    solutionPath,
                    existingSettings.propertiesFile,
                    existingSettings.version
                );

                if (validation.valid) {
                    logger.info(`✅ Reusing existing settings:
                        - propertiesFile: ${existingSettings.propertiesFile}
                        - version: ${existingSettings.version}
                        - configuration: ${existingSettings.configuration}`);

                    // Update globals BEFORE saving to settings so that onDidChangeConfiguration
                    // handlers that fire during the save see the correct (new) solution path.
                    await setGlobalClarionSelection(
                        solutionPath,
                        existingSettings.propertiesFile,
                        existingSettings.version,
                        existingSettings.configuration,
                        true // skipSave — we save explicitly below
                    );

                    const success = await SettingsStorageManager.saveSolutionSettings(
                        solutionPath,
                        existingSettings.propertiesFile,
                        existingSettings.version,
                        existingSettings.configuration
                    );

                    if (success) {
                        // Set environment variable and context
                        process.env.CLARION_SOLUTION_FILE = solutionPath;
                        await commands.executeCommand("setContext", "clarion.solutionOpen", true);

                        window.showInformationMessage(
                            `Clarion Solution Opened: ${path.basename(solutionPath)}`
                        );

                        return true;
                    }
                } else {
                    logger.warn(`⚠️ Existing settings are stale: ${validation.reason}`);
                    window.showWarningMessage(`Settings need to be updated: ${validation.reason}`);
                }
            }

            // Step 2: No existing settings or they're invalid - proceed with auto-detection
            // Skip detection if caller already selected version/config (e.g. new solution wizard)
            let selectedInstallation: ClarionInstallation;
            let selectedCompiler: string;
            let selectedConfig: string;

            if (preSelected) {
                selectedInstallation = preSelected.installation;
                selectedCompiler = preSelected.compilerName;
                selectedConfig = preSelected.configuration;
                logger.info(`✅ Using pre-selected: Clarion ${selectedInstallation.ideVersion} → ${selectedCompiler} (${selectedConfig})`);
            } else {
            const installations = await ClarionInstallationDetector.detectInstallations();

            if (installations.length === 0) {
                const action = await window.showErrorMessage(
                    "No Clarion installations detected. ClarionProperties.xml not found in standard locations.",
                    "Browse for Solution (Manual Setup)",
                    "Cancel"
                );
                
                if (action === "Browse for Solution (Manual Setup)") {
                    commands.executeCommand('clarion.openSolution');
                }
                return false;
            }

            // Step 3: Let user select installation if multiple found

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

            // Step 4: Extract configurations from .sln file, auto-detect from .sln.cache
            const configurations = this.extractConfigurationsFromSolution(solutionPath);

            // Check .sln.cache for the last-used config (written by Clarion IDE/MSBuild)
            // configurations may be full "Config|Platform" strings; match by config name prefix
            const cachedFullConfig = readActiveConfigFromSlnCache(solutionPath);
            const cachedConfigName = cachedFullConfig ? configNameFromFull(cachedFullConfig) : null;
            const matchedConfig = cachedConfigName
                ? configurations.find(c => configNameFromFull(c) === cachedConfigName) ?? null
                : null;

            if (matchedConfig) {
                selectedConfig = matchedConfig;
                logger.info(`⚙️ Auto-detected configuration from .sln.cache: ${matchedConfig}`);
            } else if (configurations.length > 1) {
                const configChoice = await window.showQuickPick(configurations, {
                    placeHolder: "Select build configuration"
                });
                selectedConfig = configChoice ?? configurations[0] ?? "Release";
            } else {
                selectedConfig = configurations[0] ?? "Release";
            }
            } // end else (not preSelected)

            // Step 5: Update global variables BEFORE saving to settings so that
            // onDidChangeConfiguration handlers fired during the save see the correct solution.
            logger.info(`📝 Updating global variables with:
                - solutionPath: ${solutionPath}
                - propertiesPath: ${selectedInstallation.propertiesPath}
                - compiler: ${selectedCompiler}
                - config: ${selectedConfig}`);

            await setGlobalClarionSelection(
                solutionPath,
                selectedInstallation.propertiesPath,
                selectedCompiler,
                selectedConfig,
                true // skipSave — we save explicitly below
            );

            logger.info("✅ Global variables updated");

            // Step 6: Save settings using smart storage manager
            const success = await SettingsStorageManager.saveSolutionSettings(
                solutionPath,
                selectedInstallation.propertiesPath,
                selectedCompiler,
                selectedConfig
            );

            if (!success) {
                window.showErrorMessage("Failed to save solution settings");
                return false;
            };

            // Step 7: Add to global solution history
            const folderPath = path.dirname(solutionPath);
            await GlobalSolutionHistory.addSolution(solutionPath, folderPath);
            logger.info("✅ Added to global solution history");

            // Step 8: Set environment variable for server
            process.env.CLARION_SOLUTION_FILE = solutionPath;

            // Step 9: Set context for UI
            await commands.executeCommand("setContext", "clarion.solutionOpen", true);

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
     * Detects installations and lets the user pick one. Returns null if cancelled or none found.
     * Used by the new solution wizard to do version selection before creating files.
     */
    static async detectAndPickInstallation(): Promise<{ installation: ClarionInstallation; compilerName: string } | null> {
        const installations = await ClarionInstallationDetector.detectInstallations();

        if (installations.length === 0) {
            window.showErrorMessage("No Clarion installations detected. ClarionProperties.xml not found in standard locations.");
            return null;
        }

        if (installations.length === 1 && installations[0].compilerVersions.length === 1) {
            return { installation: installations[0], compilerName: installations[0].compilerVersions[0].name };
        }

        return this.showInstallationPicker(installations);
    }

    /**
     * Shows a picker for selecting Clarion installation and compiler
     */
    private static async showInstallationPicker(
        installations: ClarionInstallation[]
    ): Promise<{ installation: ClarionInstallation; compilerName: string } | null> {

        interface SeparatorItem { kind: -1; label: string }
        interface CompilerItem { label: string; description?: string; installation: ClarionInstallation; compilerName: string }
        type PickerItem = SeparatorItem | CompilerItem;

        const multipleIDEs = installations.length > 1;
        const items: PickerItem[] = [];

        for (const installation of installations) {
            if (multipleIDEs) {
                items.push({ kind: -1, label: `Clarion ${installation.ideVersion}` });
            }
            for (const compiler of installation.compilerVersions) {
                items.push({
                    label: compiler.name,
                    description: multipleIDEs ? undefined : `Clarion ${installation.ideVersion}`,
                    installation,
                    compilerName: compiler.name
                });
            }
        }

        const placeHolder = multipleIDEs
            ? "Select Clarion IDE and compiler version"
            : `Clarion ${installations[0].ideVersion} — select compiler version`;

        const selected = await window.showQuickPick(items as any[], { placeHolder });

        if (!selected || selected.kind === -1) {
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
