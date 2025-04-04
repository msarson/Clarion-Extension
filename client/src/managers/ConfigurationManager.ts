import { window, StatusBarItem, StatusBarAlignment, workspace, ConfigurationTarget } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';
import { SolutionCache } from '../SolutionCache';

const logger = LoggerManager.getLogger("ConfigurationManager");
logger.setLevel("error");

export class ConfigurationManager {
    private configStatusBarItem: StatusBarItem | undefined;

    constructor() {
        // Initialize with no status bar item
    }

    /**
     * Update the configuration status bar with the current configuration
     * @param configuration The current configuration
     */
    public async updateConfigurationStatusBar(configuration: string): Promise<void> {
        if (!this.configStatusBarItem) {
            this.configStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
            this.configStatusBarItem.command = 'clarion.setConfiguration'; // ✅ Clicking will open the config picker
        }

        this.configStatusBarItem.text = `$(gear) Clarion: ${configuration}`;
        this.configStatusBarItem.tooltip = "Click to change Clarion configuration";
        this.configStatusBarItem.show();

        // ✅ Ensure the setting is updated
        const currentConfig = workspace.getConfiguration().get<string>("clarion.configuration");

        if (currentConfig !== configuration) {
            logger.info(`🔄 Updating workspace configuration: clarion.configuration = ${configuration}`);
            await workspace.getConfiguration().update("clarion.configuration", configuration, ConfigurationTarget.Workspace);
        }
    }

    /**
     * Hide the configuration status bar
     */
    public hideConfigurationStatusBar(): void {
        if (this.configStatusBarItem) {
            this.configStatusBarItem.hide();
        }
    }

    /**
     * Set the configuration
     */
    public async setConfiguration(): Promise<void> {
        const solutionCache = SolutionCache.getInstance();
        const solutionFilePath = solutionCache.getSolutionFilePath();
        
        if (!solutionFilePath) {
            window.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
            return;
        }
        
        // Check if the solution file path is set in the SolutionCache
        if (!solutionCache.getSolutionInfo()) {
            // Initialize the SolutionCache with the global solution file
            await solutionCache.initialize(solutionFilePath);
        }
        
        const availableConfigs = solutionCache.getAvailableConfigurations();

        if (availableConfigs.length === 0) {
            window.showWarningMessage("No configurations found in the solution file.");
            return;
        }

        const selectedConfig = await window.showQuickPick(availableConfigs, {
            placeHolder: "Select a configuration",
        });

        if (selectedConfig) {
            await workspace.getConfiguration().update("clarion.configuration", selectedConfig, ConfigurationTarget.Workspace);
            await this.updateConfigurationStatusBar(selectedConfig);
            window.showInformationMessage(`Configuration set to: ${selectedConfig}`);
        }
    }

    /**
     * Extract configurations from a solution file
     * @param solutionContent The content of the solution file
     * @returns Array of configuration names
     */
    public extractConfigurationsFromSolution(solutionContent: string): string[] {
        const configPattern = /GlobalSection\(SolutionConfigurationPlatforms\) = preSolution([\s\S]*?)EndGlobalSection/g;
        const match = configPattern.exec(solutionContent);

        if (!match) {
            logger.warn("⚠️ No configurations found in solution file. Defaulting to Debug/Release.");
            return ["Debug", "Release"];
        }

        const configurations = match[1]
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith("GlobalSection")) // ✅ Remove section header
            .map(line => line.split('=')[0].trim()) // ✅ Extract left-hand side (config name)
            .map(config => config.replace("|Win32", "").trim()) // ✅ Remove "|Win32"
            .filter(config => config.length > 0); // ✅ Ensure only valid names remain

        logger.info(`📂 Extracted configurations from solution: ${JSON.stringify(configurations)}`);
        return configurations.length > 0 ? configurations : ["Debug", "Release"];
    }
}

// Singleton instance
let instance: ConfigurationManager | undefined;

/**
 * Get the ConfigurationManager instance
 * @returns The ConfigurationManager instance
 */
export function getConfigurationManager(): ConfigurationManager {
    if (!instance) {
        instance = new ConfigurationManager();
    }
    return instance;
}