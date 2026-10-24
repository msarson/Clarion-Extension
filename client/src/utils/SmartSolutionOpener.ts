import { window, workspace, Uri, commands } from 'vscode';
import { ClarionInstallationDetector, ClarionInstallation } from '../utils/ClarionInstallationDetector';
import { SolutionScanner, DetectedSolution } from '../utils/SolutionScanner';
import { SettingsStorageManager } from '../utils/SettingsStorageManager';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { setGlobalClarionSelection } from '../globals';
import { readActiveConfigFromSlnCache } from './SlnCacheUtils';
import { chooseConfiguration, explicitConfigurationFor } from './ConfigurationPrecedence';
import { resolveValidConfiguration } from './ConfigurationValidator';
import { validateRememberedSettings } from './SolutionFallbackPolicy';
import { unsavedSettingsForSolution } from './UnsavedSolutionSettings';
import { rememberedSelectionForSwitch, folderSwitchConfigurationSources, SwitchSelection } from '../solution/FolderSwitchSelection';
import LoggerManager from './LoggerManager';
import { settleChoice, SolutionChoice } from '../solution/SolutionPage';
import { SolutionPanel, OpenSelection } from '../solution/SolutionPanel';
import { extractConfigurationsFromSolution as slnConfigurations } from './ExtensionHelpers';
import { PathUtils } from '../PathUtils';
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
     * Attempts to load existing settings for a solution from the solutions array
     */
    private static async getExistingSolutionSettings(solutionPath: string): Promise<{
        propertiesFile: string;
        version: string;
        configuration: string;
    } | null> {
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
                PathUtils.equalPath(s.solutionFile, solutionPath) // #266
            );

            if (!existingSolution) {
                // #768 — a selection the folder's settings.json couldn't hold is in the history.
                const unsaved = unsavedSettingsForSolution(await GlobalSolutionHistory.getReferences(), solutionPath);
                if (unsaved) {
                    logger.info(`✅ Found settings the folder couldn't save, in the solution history: ${solutionPath}`);
                    return unsaved;
                }
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
            const existingSettings = await this.getExistingSolutionSettings(solutionPath);
            let staleReason: string | undefined;

            if (existingSettings) {
                const validation = validateRememberedSettings(
                    solutionPath,
                    existingSettings.propertiesFile,
                    existingSettings.version
                );

                if (validation.valid) {
                    logger.info(`✅ Reusing existing settings:
                        - propertiesFile: ${existingSettings.propertiesFile}
                        - version: ${existingSettings.version}
                        - configuration: ${existingSettings.configuration}`);

                    // #437 — `validateRememberedSettings` above checks that the files
                    // exist and the version is non-empty; it deliberately says
                    // nothing about the configuration. That check used to live only
                    // in `initializeSolution`, which runs after this — so a stale
                    // configuration was written to the globals and the settings
                    // here first, and on a path that skipped the initialization
                    // (clarion.openRecentSolution in the same folder, until #785) it
                    // stayed in force, collapsing redirection to [Common] (#293) with
                    // nothing reported. Validate before the value is written anywhere.
                    const resolved = await resolveValidConfiguration(
                        solutionPath,
                        existingSettings.configuration
                    );
                    if (resolved.changed) {
                        logger.info(`✅ Configuration ${resolved.reason}: ` +
                            `${existingSettings.configuration || '(empty)'} → ${resolved.configuration}`);
                    }
                    const configuration = resolved.configuration;

                    // Update globals BEFORE saving to settings so that onDidChangeConfiguration
                    // handlers that fire during the save see the correct (new) solution path.
                    await setGlobalClarionSelection(
                        solutionPath,
                        existingSettings.propertiesFile,
                        existingSettings.version,
                        configuration,
                        true // skipSave — we save explicitly below
                    );

                    // #767 — a failed save doesn't stop the open: saveSolutionSettings has said
                    // why, and the selection is in force for this session.
                    await SettingsStorageManager.saveSolutionSettings(
                        solutionPath,
                        existingSettings.propertiesFile,
                        existingSettings.version,
                        configuration
                    );

                    // Set environment variable and context
                    process.env.CLARION_SOLUTION_FILE = solutionPath;
                    await commands.executeCommand("setContext", "clarion.solutionOpen", true);

                    window.showInformationMessage(
                        `Clarion Solution Opened: ${path.basename(solutionPath)}`
                    );

                    return true;
                } else {
                    logger.warn(`⚠️ Existing settings are stale: ${validation.reason}`);
                    // #792 — said on the Solution page, which asks for what has to change.
                    staleReason = `The settings remembered for this solution no longer work: ${validation.reason}`;
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
                // Steps 3-4 (#792): what is remembered and still works, else the Solution page, which
                // asks for the installation, compiler version and configuration together. With no
                // installation detected, its Browse… finds one outside the standard locations.
                const selection = await this.chooseSelection(solutionPath, existingSettings ?? {}, {
                    configuration: this.resolveConfiguration(solutionPath),
                    reason: staleReason,
                });
                if (!selection) {
                    logger.info("ℹ️ User cancelled the solution's selection");
                    return false;
                }
                selectedInstallation = selection.installation;
                selectedCompiler = selection.compilerName;
                selectedConfig = selection.configuration;
            }

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

            // Step 6: Save settings using smart storage manager. #767 — a failed save used to
            // return here, so the solution never opened and every file lost its project. The
            // selection is already in force; saveSolutionSettings has said why it couldn't save.
            await SettingsStorageManager.saveSolutionSettings(
                solutionPath,
                selectedInstallation.propertiesPath,
                selectedCompiler,
                selectedConfig
            );

            // Step 7: Add to global solution history
            const folderPath = path.dirname(solutionPath);
            await GlobalSolutionHistory.addSolution(solutionPath, folderPath,
                selectedInstallation.propertiesPath, selectedCompiler, selectedConfig);
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
     * The configuration to open the solution on, as far as it is settled without asking: the
     * user's own setting, then the IDE's .sln.cache, then the history, then the only one declared.
     * For a folder switch (`forSwitch`) the settings read are the old folder's (#780): sources come
     * from folderSwitchConfigurationSources. Null when the user has to choose, which the Solution
     * page asks (#792).
     */
    private static resolveConfiguration(solutionPath: string, forSwitch?: { remembered?: string }): string | null {
        let configurations: string[];
        try {
            configurations = slnConfigurations(fs.readFileSync(solutionPath, 'utf-8'));
        } catch (error) {
            logger.warn(`⚠️ Could not read ${solutionPath}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }

        // #530 — the user's own setting for this solution wins; the IDE's .sln.cache
        // is only a hint behind it (see SolutionOpener for the same rule).
        const clarionConfig = SettingsStorageManager.clarionSettings(); // #563 — read through the first folder
        const settingValue = clarionConfig.get<string>('configuration', '');
        const solutions = clarionConfig.get<Array<{ solutionFile?: string; configuration?: string }>>('solutions', []);
        const slnCache = readActiveConfigFromSlnCache(solutionPath);
        const choice = chooseConfiguration(forSwitch
            ? folderSwitchConfigurationSources({
                solutionPath, settingValue, solutions, slnCache, available: configurations,
                folderOpen: (workspace.workspaceFolders?.length ?? 0) > 0,
                remembered: forSwitch.remembered,
            })
            : {
                explicit: explicitConfigurationFor(solutionPath, settingValue, solutions),
                slnCache,
                available: configurations,
            });

        if (choice.configuration) {
            logger.info(`⚙️ Configuration ${choice.configuration} (from ${choice.source})`);
        }
        return choice.configuration;
    }

    /**
     * #792 — what `solutionPath` builds with. Settled without asking when what is remembered still
     * works, or there is only one option; otherwise the Solution page asks, everything on one page.
     * `configuration` is the one settled by precedence (resolveConfiguration). The page is shown
     * regardless when there is a `reason` to tell, and with `offer` whenever there is more than one
     * installation or compiler to choose from (#479: a solution being adopted). Null when the user
     * cancels.
     */
    static async chooseSelection(
        solutionPath: string,
        remembered: SolutionChoice,
        options: { configuration?: string | null; reason?: string; offer?: boolean } = {}
    ): Promise<OpenSelection | null> {
        const installations = await ClarionInstallationDetector.detectInstallations();
        // #479 — an installation outside the standard locations is never detected; keep the remembered one.
        const rememberedFile = remembered.propertiesFile;
        if (rememberedFile && fs.existsSync(rememberedFile) && !installations.some(i => PathUtils.equalPath(i.propertiesPath, rememberedFile))) {
            const extra = await ClarionInstallationDetector.parseInstallationFromPropertiesPath(rememberedFile);
            if (extra) installations.push(extra);
        }
        let configurations: string[] = [];
        try {
            configurations = slnConfigurations(fs.readFileSync(solutionPath, 'utf-8'));
        } catch (error) {
            logger.warn(`⚠️ Could not read ${solutionPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const choice: SolutionChoice = { ...remembered, configuration: options.configuration ?? remembered.configuration };
        const settled = settleChoice(
            installations.map(i => ({ propertiesFile: i.propertiesPath, ideVersion: i.ideVersion, compilers: i.compilerVersions.map(c => c.name) })),
            choice, configurations);
        const alternatives = installations.length > 1 || installations.some(i => i.compilerVersions.length > 1);
        const installation = installations.find(i => !!settled.propertiesFile && PathUtils.equalPath(i.propertiesPath, settled.propertiesFile));
        if (settled.complete && installation && !options.reason && !(options.offer && alternatives)) {
            logger.info(`✅ Settled without asking: Clarion ${installation.ideVersion} → ${settled.version} (${settled.configuration})`);
            return { installation, compilerName: settled.version!, configuration: settled.configuration! };
        }
        return SolutionPanel.chooseForOpen(solutionPath, choice, options.reason);
    }

    /**
     * #780 — the selection to record before switching to the solution's folder, so the restarted
     * window can load it. The remembered one when it can still load; otherwise the Solution page
     * asks now (#792). Null when the user cancels it.
     */
    static async selectionForFolderSwitch(solutionPath: string): Promise<SwitchSelection | null> {
        const history = await GlobalSolutionHistory.getReferences();
        const remembered = rememberedSelectionForSwitch(
            solutionPath,
            history,
            (sln, propertiesFile, version) => validateRememberedSettings(sln, propertiesFile, version).valid);
        if (remembered) {
            logger.info(`✅ Switching folders with the remembered selection: ${remembered.version}`);
            return remembered;
        }
        const entry = history.find(r => PathUtils.equalPath(r.solutionFile, solutionPath));
        const selection = await this.chooseSelection(solutionPath,
            { propertiesFile: entry?.propertiesFile, version: entry?.version, configuration: entry?.configuration },
            { configuration: this.resolveConfiguration(solutionPath, { remembered: entry?.configuration }) });
        if (!selection) {
            logger.info("ℹ️ User cancelled the solution's selection");
            return null;
        }
        return { propertiesFile: selection.installation.propertiesPath, version: selection.compilerName, configuration: selection.configuration };
    }

    /**
     * Detects installations and lets the user pick one. Returns null if cancelled or none found.
     * Used by the new solution wizard to do version selection before creating files, and by a
     * folder switch (#780).
     */
    static async detectAndPickInstallation(): Promise<{ installation: ClarionInstallation; compilerName: string } | null> {
        const installations = await ClarionInstallationDetector.detectInstallations();

        if (installations.length === 0) {
            // #780 — an installation outside the standard locations (#471 ConfigDir) is browsed
            // for here: a folder switch now needs a version, so without this it could not open.
            const BROWSE = "Browse for ClarionProperties.xml…";
            const action = await window.showErrorMessage(
                "No Clarion installations detected. ClarionProperties.xml not found in standard locations.",
                BROWSE);
            if (action !== BROWSE) return null;
            const browsed = await this.browseForPropertiesFile();
            return browsed ? this.pickCompiler(browsed) : null;
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

        const BROWSE_LABEL = "$(folder-opened) Browse for ClarionProperties.xml…";

        // Step 1: pick Clarion IDE version (skip if only one), with browse option at bottom
        let installation: ClarionInstallation;
        if (installations.length > 1) {
            interface IdeItem { label: string; installation?: ClarionInstallation; isBrowse?: boolean }
            const ideItems: IdeItem[] = [
                ...installations.map(inst => ({ label: `Clarion ${inst.ideVersion}`, installation: inst })),
                { label: BROWSE_LABEL, isBrowse: true }
            ];
            const ideSelected = await window.showQuickPick(ideItems, {
                placeHolder: "Select Clarion IDE version"
            });
            if (!ideSelected) return null;

            if (ideSelected.isBrowse) {
                const browsed = await this.browseForPropertiesFile();
                if (!browsed) return null;
                installation = browsed;
            } else {
                installation = ideSelected.installation!;
            }
        } else {
            // Single IDE — still show a one-item picker so the browse option is accessible
            interface IdeItem { label: string; installation?: ClarionInstallation; isBrowse?: boolean }
            const ideItems: IdeItem[] = [
                { label: `Clarion ${installations[0].ideVersion}`, installation: installations[0] },
                { label: BROWSE_LABEL, isBrowse: true }
            ];
            const ideSelected = await window.showQuickPick(ideItems, {
                placeHolder: "Select Clarion IDE version"
            });
            if (!ideSelected) return null;

            if (ideSelected.isBrowse) {
                const browsed = await this.browseForPropertiesFile();
                if (!browsed) return null;
                installation = browsed;
            } else {
                installation = ideSelected.installation!;
            }
        }

        // Step 2: pick compiler version (skip if only one)
        return this.pickCompiler(installation);
    }

    /** The compiler version to use from `installation`; asks when it registers several. */
    private static async pickCompiler(
        installation: ClarionInstallation
    ): Promise<{ installation: ClarionInstallation; compilerName: string } | null> {
        const compilers = installation.compilerVersions;
        if (compilers.length === 1) {
            return { installation, compilerName: compilers[0].name };
        }

        interface CompilerItem { label: string; compilerName: string }
        const compilerItems: CompilerItem[] = compilers.map(c => ({
            label: c.name,
            compilerName: c.name
        }));
        const compilerSelected = await window.showQuickPick(compilerItems, {
            placeHolder: `Clarion ${installation.ideVersion} — select compiler version`
        });
        if (!compilerSelected) return null;

        return { installation, compilerName: compilerSelected.compilerName };
    }

    private static async browseForPropertiesFile(): Promise<ClarionInstallation | null> {
        const uris = await window.showOpenDialog({
            title: "Select ClarionProperties.xml",
            filters: { "ClarionProperties": ["xml"] },
            canSelectMany: false,
            openLabel: "Select"
        });
        if (!uris || uris.length === 0) return null;

        const installation = await ClarionInstallationDetector.parseInstallationFromPropertiesPath(uris[0].fsPath);
        if (!installation) {
            window.showErrorMessage("No Clarion compiler versions found in the selected ClarionProperties.xml.");
            return null;
        }
        return installation;
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
