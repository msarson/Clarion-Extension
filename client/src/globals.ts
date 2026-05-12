import { workspace, ConfigurationTarget, window, Uri, WorkspaceConfiguration, ExtensionContext } from 'vscode';
import * as fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import LoggerManager from './utils/LoggerManager';
import * as path from 'path';
import { SettingsStorageManager } from './utils/SettingsStorageManager';
const logger = LoggerManager.getLogger("Globals");
logger.setLevel("error"); // Production: Only log errors

// Interface for solution settings
export interface ClarionSolutionSettings {
    solutionFile: string;
    propertiesFile: string;
    version: string;
    configuration: string;
}

// #146 explicit-close flag and fallback-policy helper live in
// `./utils/SolutionFallbackPolicy` (vscode-free so unit tests can import
// them without dragging in the workspace/ExtensionContext surface).
import { shouldUseSolutionFallback, SOLUTION_EXPLICITLY_CLOSED_KEY } from './utils/SolutionFallbackPolicy';
export { shouldUseSolutionFallback, SOLUTION_EXPLICITLY_CLOSED_KEY };

/**
 * Helper function to get the correct configuration target (always folder-level)
 * Returns WorkspaceFolder if a folder is open, undefined otherwise
 */
export function getClarionConfigTarget(): ConfigurationTarget | undefined {
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        return ConfigurationTarget.WorkspaceFolder;
    }
    logger.warn("⚠️ No folder open - cannot determine config target");
    return undefined;
}

// ✅ These are stored in folder settings (.vscode/settings.json)
export let globalSolutionFile: string = "";
export let globalClarionPropertiesFile: string = "";
export let globalClarionVersion: string = "";
let _globalClarionConfiguration: string = "Release";

// ✅ Ensure these settings are available globally
const DEFAULT_EXTENSIONS = [".clw", ".inc", ".equ", ".eq", ".int"];

/**
 * #132 / dd87633f B1 — solution-free entry point for selecting a Clarion
 * version. Populates `globalSettings.{libsrcPaths, redirectionPath, macros,
 * redirectionFile}` from the parsed version's properties and persists the
 * version + properties-file path to User-scope (`clarion.activeVersion` +
 * `clarion.activePropertiesFile`). Callable before any solution / workspace
 * folder is open.
 *
 * Wired from the new status-bar item + Clarion Tools pane picker (B2) and
 * from the first-run migration check + solution-open guard (B3).
 *
 * Returns true when the version was found in `propertiesFile` and applied.
 */
export async function setActiveClarionVersion(
    version: string,
    propertiesFile: string
): Promise<boolean> {
    logger.info(`🔄 Setting effective active Clarion version (L2, in-memory): ${version} → ${propertiesFile}`);

    // L2 (effective active): in-memory per-VSCode-instance state. Drives
    // file-resolution surfaces (libsrcPaths / redirectionPath / macros).
    // Per #141 Q4 — does NOT write L1 (settings.json default) or L3
    // (solutionVersionMemory). Those are explicit-action paths (picker
    // "Set as default", solution-open confirm, mid-session switch).
    globalClarionVersion = version;
    globalClarionPropertiesFile = propertiesFile;

    // Populate `globalSettings.*` (libsrcPaths / redirectionPath / macros /
    // redirectionFile) from the parsed version's properties.
    const applied = await ClarionExtensionCommands.loadVersionGlobalSettings(propertiesFile, version);
    if (!applied) {
        logger.warn(`⚠️ Version "${version}" not found in ${propertiesFile}; globalSettings unchanged`);
    }

    // Q5 baseline (first-time install): if no L1 default is configured yet,
    // also write the L1 default so the user's first-ever pick survives a
    // VS Code restart. Picker handlers in B2 can refine this with explicit
    // "Set as default" behavior; this preserves today's first-install UX
    // without B2 needing to land first. Cross-instance behavior unchanged
    // (L1 is User-scope; other instances inherit naturally).
    const config = workspace.getConfiguration('clarion');
    const existingDefault = config.get<string>('activeVersion', '');
    if (!existingDefault) {
        logger.info(`🔄 Q5 baseline: no existing L1 default → auto-writing default to ${version}`);
        await SettingsStorageManager.setDefaultVersion(version, propertiesFile);
    }

    // Refresh the version status-bar item (B2). Lazy import to avoid circular dep.
    // #141 Q9 — pass solution-loaded state so the status bar gates correctly
    // (hidden when no solution; visible only when solution is loaded). At
    // activation time `globalSolutionFile` is empty → hide. At mid-session
    // picker time with a solution open → show.
    try {
        const { updateVersionStatusBar } = await import('./statusbar/StatusBarManager');
        updateVersionStatusBar(version, propertiesFile, !!globalSolutionFile);
    } catch {
        // Status bar not initialised yet — fine; activation will paint it later.
    }

    return applied;
}

/**
 * #132 / dd87633f B3 — on-activation entry point: run first-run version
 * migration + paint the version status bar from User-scope settings.
 *
 * Under the post-#141 three-layer model (Q4):
 *   - L1 Default: `clarion.activeVersion` / `clarion.activePropertiesFile`
 *     (User-scope settings.json). Migration writes here.
 *   - L2 Effective active: in-memory; init from L1 default via the call to
 *     `setActiveClarionVersion` below.
 *   - L3 Solution memory: `ExtensionContext.globalState.clarion.solutionVersionMemory`.
 *     Backfilled from legacy `solutions[].version` entries on first
 *     post-#141 activation (gated by `solutionVersionMemoryBackfilled`).
 *
 * L1 migration: if `clarion.activeVersion` is empty AND any
 * `solutions[].version` exists in workspace settings, auto-promote the first
 * legacy entry to User scope. Gated by `clarion.versionMigrated` (one-shot
 * flag) so it never re-fires. Set the flag even when nothing to migrate IF
 * the User-scope value is already populated — preserves "first run after
 * install vs first run after upgrade" semantics.
 *
 * L3 backfill (#141 B3): when `context` is provided AND
 * `solutionVersionMemoryBackfilled` is false, iterate every
 * `solutions[].version` entry with non-empty `solutionFile` + `version` and
 * seed L3 via `SettingsStorageManager.setSolutionVersion`. Gated separately
 * from `versionMigrated` because pre-#141 users may already have the L1
 * migration flag set but have never had L3 populated. Idempotent — re-running
 * with a partially-populated L3 just re-writes the same key-value pairs.
 *
 * Status-bar paint: read `clarion.activeVersion` from User scope; if non-
 * empty, call `setActiveClarionVersion` to populate `globalSettings.*` +
 * refresh the status bar item. Solution-free.
 */
export async function activateClarionVersionState(context?: ExtensionContext): Promise<void> {
    const config = workspace.getConfiguration('clarion');
    const migrated = config.get<boolean>('versionMigrated', false);
    let activeVersion = config.get<string>('activeVersion', '');
    let activePropertiesFile = config.get<string>('activePropertiesFile', '');

    if (!migrated) {
        if (activeVersion && activePropertiesFile) {
            // L1 already populated (e.g. set via picker before migration flag
            // existed). Mark migrated; no L1 auto-promote needed.
            await config.update('versionMigrated', true, ConfigurationTarget.Global);
        } else {
            // Look for a legacy solutions[].version to auto-promote to L1.
            const solutions = config.get<ClarionSolutionSettings[]>('solutions', []);
            const legacy = solutions.find(s => s.version && s.propertiesFile);
            if (legacy) {
                logger.info(`🔄 Migrating legacy version from solutions[]: ${legacy.version} → L1 default`);
                await setActiveClarionVersion(legacy.version, legacy.propertiesFile);
                await config.update('versionMigrated', true, ConfigurationTarget.Global);
                activeVersion = legacy.version;
                activePropertiesFile = legacy.propertiesFile;
            }
            // If no legacy entry exists, leave the flag false — first-run user
            // hasn't set up Clarion yet; they'll set it via the picker.
        }
    }

    // #141 B3 — L3 backfill from legacy `solutions[].version` entries.
    // Separate flag from `versionMigrated` because pre-#141 users may already
    // have the L1 migration flag set but never had L3 (didn't exist pre-#141).
    if (context) {
        const l3Backfilled = config.get<boolean>('solutionVersionMemoryBackfilled', false);
        if (!l3Backfilled) {
            const solutions = config.get<ClarionSolutionSettings[]>('solutions', []);
            const candidates = solutions.filter(s => s.solutionFile && s.version);
            if (candidates.length > 0) {
                logger.info(`🔄 #141 B3 — backfilling L3 solutionVersionMemory from ${candidates.length} legacy solutions[] entr${candidates.length === 1 ? 'y' : 'ies'}`);
                for (const entry of candidates) {
                    await SettingsStorageManager.setSolutionVersion(context, entry.solutionFile, entry.version);
                }
            } else {
                logger.info(`ℹ️ #141 B3 — no legacy solutions[].version entries to backfill into L3`);
            }
            // Set the flag regardless of whether any entries were backfilled —
            // a fresh-install user with no legacy entries should not re-attempt
            // the backfill on every activation.
            await config.update('solutionVersionMemoryBackfilled', true, ConfigurationTarget.Global);
        }
    }

    // Paint the status bar from the (now-current) User-scope value.
    if (activeVersion && activePropertiesFile) {
        // Re-apply via setActiveClarionVersion to populate globalSettings.*
        // even when migration was a no-op (e.g. fresh VS Code launch after the
        // settings were already migrated previously).
        await setActiveClarionVersion(activeVersion, activePropertiesFile);
    } else {
        // No version configured — hide the status bar item.
        try {
            const { updateVersionStatusBar } = await import('./statusbar/StatusBarManager');
            updateVersionStatusBar(undefined, undefined);
        } catch {
            // Activation-time error — not blocking.
        }
    }
}

/**
 * #132 / dd87633f B3 — solution-open guard.
 *
 * Returns true when a Clarion version is configured (in `globalClarionVersion`
 * or via User-scope `clarion.activeVersion`). When false, fires the
 * `clarion.setActiveVersion` picker and returns whatever the user picked
 * (true if they completed selection, false if they cancelled). Callers
 * should NOT proceed with solution-open when this returns false.
 */
export async function ensureActiveClarionVersion(): Promise<boolean> {
    if (globalClarionVersion) return true;

    const config = workspace.getConfiguration('clarion');
    const activeVersion = config.get<string>('activeVersion', '');
    const activePropertiesFile = config.get<string>('activePropertiesFile', '');
    if (activeVersion && activePropertiesFile) {
        await setActiveClarionVersion(activeVersion, activePropertiesFile);
        return true;
    }

    // Fire the picker via the registered command + check result.
    const { commands } = await import('vscode');
    await commands.executeCommand('clarion.setActiveVersion');
    return !!globalClarionVersion;
}

export async function setGlobalClarionSelection(
    solutionFile: string,
    clarionPropertiesFile: string,
    clarionVersion: string,
    clarionConfiguration: string,
    skipSave: boolean = false
) {
    logger.info("🔄 Updating global settings:", {
        solutionFile,
        clarionPropertiesFile,
        clarionVersion,
        clarionConfiguration,
        skipSave
    });

    // ✅ Update global variables
    globalSolutionFile = solutionFile;
    globalClarionPropertiesFile = clarionPropertiesFile;
    globalClarionVersion = clarionVersion;
    _globalClarionConfiguration = clarionConfiguration;

    // Log the updated global variables
    logger.info(`✅ Global variables updated:
        - globalSolutionFile: ${globalSolutionFile || 'not set'}
        - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'not set'}
        - globalClarionVersion: ${globalClarionVersion || 'not set'}
        - _globalClarionConfiguration: ${_globalClarionConfiguration || 'not set'}`);

    // ✅ Only save to storage if all required values are set and skipSave is false
    if (skipSave) {
        logger.info("⏭️  Skipping save to storage (skipSave = true)");
        return;
    }
    
    // #141 B1 / Q4 — solution-open no longer writes L1 (default version).
    // Default is set explicitly via the picker's "Set as default" action (B2),
    // or auto-seeded by the Q5 baseline inside `setActiveClarionVersion` for
    // first-install. The original #132 decoupling (line above) was: "make
    // libsrcPaths/redirectionPath/macros available even with no solution
    // loaded" — that goal is now served by L2 in-memory effective active,
    // not by writing every solution-open version into L1.
    //
    // Per-solution version memory (L3) is written by B2 on Q3 mid-session
    // switch or Q2/Q8 confirm prompts — not from setGlobalClarionSelection.

    if (solutionFile && clarionPropertiesFile && clarionVersion) {
        logger.info("✅ All required settings are set. Saving using smart storage manager...");

        // Use the smart storage manager (handles workspace vs folder storage)
        await SettingsStorageManager.saveSolutionSettings(
            solutionFile,
            clarionPropertiesFile,
            clarionVersion,
            clarionConfiguration
        );

        // ✅ Ensure lookup extensions are written (only if we have a folder)
        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            const workspaceFolder = workspace.workspaceFolders[0];
            const config = workspace.getConfiguration("clarion", workspaceFolder.uri);
            const target = ConfigurationTarget.WorkspaceFolder;

            const fileSearchExtensions = config.inspect<string[]>("fileSearchExtensions");
            const defaultLookupExtensions = config.inspect<string[]>("defaultLookupExtensions");

            const updatePromises: Thenable<void>[] = [];

            // Check if not set at folder level
            if (!fileSearchExtensions?.workspaceFolderValue) {
                updatePromises.push(config.update("fileSearchExtensions", DEFAULT_EXTENSIONS, target));
            }

            if (!defaultLookupExtensions?.workspaceFolderValue) {
                updatePromises.push(config.update("defaultLookupExtensions", DEFAULT_EXTENSIONS, target));
            }

            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
                logger.info("✅ Default lookup settings applied.");
            }
        } else {
            logger.info("ℹ️ No folder open - skipping lookup extensions update");
        }
    } else {
        logger.warn("⚠️ Not saving to storage: One or more required values are missing.");
    }
}

/**
 * Updates the solutions array in workspace settings
 */
async function updateSolutionsArray(
    solutionFile: string,
    clarionPropertiesFile: string,
    clarionVersion: string,
    clarionConfiguration: string
) {
    if (!solutionFile) return;
    
    // Get the current solutions array
    const config = workspace.getConfiguration("clarion");
    const solutions = config.get<ClarionSolutionSettings[]>("solutions", []);
    
    // Check if this solution is already in the array
    const solutionIndex = solutions.findIndex(s => s.solutionFile === solutionFile);
    
    if (solutionIndex >= 0) {
        // Update existing solution
        solutions[solutionIndex] = {
            solutionFile,
            propertiesFile: clarionPropertiesFile,
            version: clarionVersion,
            configuration: clarionConfiguration
        };
    } else {
        // Add new solution
        solutions.push({
            solutionFile,
            propertiesFile: clarionPropertiesFile,
            version: clarionVersion,
            configuration: clarionConfiguration
        });
    }
    
    // Save the updated solutions array
    await config.update("solutions", solutions, ConfigurationTarget.Workspace);
    logger.info(`✅ Updated solutions array with ${solutions.length} solutions`);
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

    get undeclaredVariablesEnabled() {
        return workspace.getConfiguration("clarion").get<boolean>("diagnostics.undeclaredVariables.enabled", true);
    },

    get indistinguishablePrototypesEnabled() {
        return workspace.getConfiguration("clarion").get<boolean>("diagnostics.indistinguishablePrototypes.enabled", true);
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

    /**
     * Migrates existing settings to the solutions array
     */
    async migrateToSolutionsArray() {
        logger.info("🔄 Checking if migration to solutions array is needed...");
        
        // Only proceed if we have a folder open
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            logger.info("ℹ️ No folder open - skipping migration");
            return;
        }
        
        // Always use WorkspaceFolder target (folder settings)
        const workspaceFolder = workspace.workspaceFolders[0];
        const target = ConfigurationTarget.WorkspaceFolder;
        const config = workspace.getConfiguration("clarion", workspaceFolder.uri);
        
        logger.info(`📝 Using WorkspaceFolder configuration scope for: ${workspaceFolder.uri.fsPath}`);
        
        // Check if we already have a solutions array
        const solutions = config.get<ClarionSolutionSettings[]>("solutions", []);
        
        // Check if we have a current solution setting
        const currentSolution = config.get<string>("currentSolution", "");
        
        // Get the existing settings
        const solutionFile = config.get<string>("solutionFile", "");
        const propertiesFile = config.get<string>("propertiesFile", "");
        const version = config.get<string>("version", "");
        const configuration = config.get<string>("configuration", "Release");
        
        // If we have a solution file but no solutions array or current solution, migrate
        if (solutionFile && (!solutions.length || !currentSolution)) {
            logger.info("✅ Migration needed. Creating solutions array from existing settings.");
            
            // Create a new solution entry
            const newSolution: ClarionSolutionSettings = {
                solutionFile,
                propertiesFile,
                version,
                configuration
            };
            
            // Add to solutions array if not already there
            if (!solutions.some((s: ClarionSolutionSettings) => s.solutionFile === solutionFile)) {
                solutions.push(newSolution);
                await config.update("solutions", solutions, target);
                logger.info(`✅ Added solution to solutions array: ${solutionFile}`);
            }
            
            // Set current solution if not already set
            if (!currentSolution) {
                await config.update("currentSolution", solutionFile, target);
                logger.info(`✅ Set current solution to: ${solutionFile}`);
            }
            
            logger.info("✅ Migration to solutions array completed successfully.");
        }

        // Always clean up legacy keys that are now redundant (they may linger from old installs)
        for (const legacyKey of ['solutionFile', 'propertiesFile', 'version'] as const) {
            const inspection = config.inspect(legacyKey);
            if (inspection?.workspaceFolderValue !== undefined) {
                await config.update(legacyKey, undefined, target);
                logger.info(`✅ Removed legacy setting: clarion.${legacyKey}`);
            }
        }
    },
    
    /** ✅ Load settings from .vscode/settings.json
     *
     * @param context Required ExtensionContext. The
     *   `SOLUTION_EXPLICITLY_CLOSED_KEY` workspaceState flag is consulted to
     *   suppress the #104 `solutions[0]` fallback in the explicit-close case
     *   (#146).
     *
     * #141 B1 — was optional in #146; tightened to required here now that a
     * concrete caller (SolutionInitializer.workspaceHasBeenTrusted) reliably
     * has the context handle. Removing the optional shim simplifies the
     * activation flow + prevents legacy callers from silently bypassing the
     * close-flag check.
     */
    async initializeFromWorkspace(context: ExtensionContext) {
        logger.info("🔄 Loading settings from .vscode/settings.json...");

        // ✅ Early exit if no folder open
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            logger.info("ℹ️ No folder open - skipping initialization");
            return;
        }

        // Check if we need to migrate existing settings to the solutions array
        await this.migrateToSolutionsArray();

        // Get the current solution from settings
        const currentSolution = workspace.getConfiguration().get<string>("clarion.currentSolution", "");

        // #146: read the explicit-close flag. Drives whether the #104
        // `solutions[0]` fallback is honored below.
        const explicitlyClosed = context?.workspaceState.get<boolean>(SOLUTION_EXPLICITLY_CLOSED_KEY, false) ?? false;

        // ✅ Read workspace settings
        let solutionFile = workspace.getConfiguration().get<string>("clarion.solutionFile", "") || "";
        let clarionPropertiesFile = workspace.getConfiguration().get<string>("clarion.propertiesFile", "") || "";
        let clarionVersion = workspace.getConfiguration().get<string>("clarion.version", "") || "";
        let clarionConfiguration = workspace.getConfiguration().get<string>("clarion.configuration", "") || "Release";

        const solutions = workspace.getConfiguration().get<ClarionSolutionSettings[]>("clarion.solutions", []);

        // If we have a current solution, try to find it in the solutions array
        if (currentSolution) {
            const solution = solutions.find(s => s.solutionFile === currentSolution);

            if (solution) {
                logger.info(`✅ Found current solution in solutions array: ${solution.solutionFile}`);
                solutionFile = solution.solutionFile;
                clarionPropertiesFile = solution.propertiesFile;
                clarionVersion = solution.version;
                clarionConfiguration = solution.configuration;
            } else {
                logger.warn(`⚠️ Current solution ${currentSolution} not found in solutions array`);
            }
        } else if (shouldUseSolutionFallback(currentSolution, solutions, explicitlyClosed)) {
            // currentSolution is blank, no explicit close, solutions[] populated:
            // honor the #104 fallback so a never-set currentSolution still
            // auto-loads from solutions[0].
            const solution = solutions[0];
            logger.info(`✅ currentSolution is empty, defaulting to first solution in array: ${solution.solutionFile}`);
            solutionFile = solution.solutionFile;
            clarionPropertiesFile = solution.propertiesFile;
            clarionVersion = solution.version;
            clarionConfiguration = solution.configuration;
        } else if (explicitlyClosed) {
            // #146: user explicitly closed — suppress fallback. Solution stays
            // closed across restart, exactly as Mark flagged.
            logger.info("ℹ️ Solution was explicitly closed — suppressing solutions[0] fallback (#146)");
        }

        // #146: consume the explicit-close flag (one-shot). After this read
        // the flag returns to its default-false state so subsequent activations
        // resume normal #104 fallback semantics for the next-empty-state case.
        if (explicitlyClosed && context) {
            await context.workspaceState.update(SOLUTION_EXPLICITLY_CLOSED_KEY, undefined);
            logger.info("✅ Consumed solutionExplicitlyClosed flag (#146)");
        }

        logger.info(`🔍 Read from workspace settings:
            - clarion.solutionFile: ${solutionFile || 'not set'}
            - clarion.propertiesFile: ${clarionPropertiesFile || 'not set'}
            - clarion.version: ${clarionVersion || 'not set'}
            - clarion.configuration: ${clarionConfiguration || 'not set'}`);

        // ✅ Early exit if no solution is configured - don't try to save empty settings
        if (!solutionFile) {
            logger.info("ℹ️ No solution settings found in workspace - skipping initialization");
            return;
        }

        // ✅ If the solution file no longer exists on disk, silently remove it from settings
        if (!fs.existsSync(solutionFile)) {
            logger.info(`ℹ️ Solution file no longer exists, removing from settings: ${solutionFile}`);
            await SettingsStorageManager.removeMissingSolution(solutionFile);
            return;
        }

        // ✅ Set global variables (skip save during initialization to avoid recursion)
        if (solutionFile) {
            // Skip save since we're loading from existing workspace settings
            await setGlobalClarionSelection(solutionFile, clarionPropertiesFile, clarionVersion, clarionConfiguration, true);

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
        } else {
            logger.info("ℹ️ No solution settings found in workspace - skipping initialization");
        }
    }
};
