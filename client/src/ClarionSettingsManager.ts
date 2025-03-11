import { workspace, ConfigurationTarget } from 'vscode';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("SettingsManager");

export class ClarionSettingsManager {
    private static instance: ClarionSettingsManager;
    public configuration: string = "Debug";
    public defaultLookupExtensions: string[] = [];
    public fileSearchExtensions: string[] = [];
    public redirectionPath: string = "";

    private constructor() {
        this.loadSettings();
    }

    public static getInstance(): ClarionSettingsManager {
        if (!ClarionSettingsManager.instance) {
            ClarionSettingsManager.instance = new ClarionSettingsManager();
        }
        return ClarionSettingsManager.instance;
    }

    private loadSettings(): void {
        const config = workspace.getConfiguration("clarion");
        this.configuration = config.get("configuration", "Debug");
        this.defaultLookupExtensions = config.get("defaultLookupExtensions", [".clw", ".inc", ".equ", ".eq", ".int"]);
        this.fileSearchExtensions = config.get("fileSearchExtensions", []);
        this.redirectionPath = config.get("redirectionPath", "");

        logger.info("🔄 Clarion settings loaded:", this);
    }

    public async updateConfiguration(newConfig: string): Promise<void> {
        if (!newConfig) return;
        this.configuration = newConfig;
        await workspace.getConfiguration("clarion").update("configuration", newConfig, ConfigurationTarget.Workspace);
        logger.info(`✅ Clarion configuration updated to: ${newConfig}`);
    }

    public async reloadSettings(): Promise<void> {
        this.loadSettings();
        logger.info("🔄 Clarion settings reloaded.");
    }
}
