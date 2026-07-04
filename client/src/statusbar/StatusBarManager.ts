import { window, workspace, StatusBarItem, StatusBarAlignment } from 'vscode';
import * as path from 'path';
import { globalSolutionFile, getClarionConfigTarget } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { buildInitializationStatusText, InitializationStatusPhase } from './InitializationStatusText';
import { SettingsStorageManager } from '../utils/SettingsStorageManager';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("StatusBarManager");
logger.setLevel("error");

/**
 * Status bar items for Clarion extension
 */
let configStatusBarItem: StatusBarItem;
let buildProjectStatusBarItem: StatusBarItem;
// #132 / dd87633f B2 — version status bar item at priority 101 (one slot LEFT
// of the build-config item at priority 100, since higher priority sits further
// left on Left-aligned status bars).
let versionStatusBarItem: StatusBarItem;
let initializationStatusBarItem: StatusBarItem;
let initializationHideTimer: ReturnType<typeof setTimeout> | undefined;

function clearInitializationHideTimer(): void {
    if (initializationHideTimer) {
        clearTimeout(initializationHideTimer);
        initializationHideTimer = undefined;
    }
}

function ensureInitializationStatusBarItem(): StatusBarItem {
    if (!initializationStatusBarItem) {
        // Keep this left of version/config/build items while active.
        initializationStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 103);
    }
    return initializationStatusBarItem;
}

export function updateInitializationStatusBar(
    phase: InitializationStatusPhase,
    detail?: string
): void {
    clearInitializationHideTimer();
    const item = ensureInitializationStatusBarItem();
    item.text = buildInitializationStatusText(phase, detail);
    item.tooltip = detail
        ? `Clarion initialization: ${detail}`
        : 'Clarion initialization in progress';
    item.show();
}

export function completeInitializationStatusBar(detail?: string): void {
    clearInitializationHideTimer();
    const item = ensureInitializationStatusBarItem();
    item.text = detail
        ? `$(check) Clarion: Ready (${detail})`
        : '$(check) Clarion: Ready';
    item.tooltip = detail
        ? `Clarion initialization completed: ${detail}`
        : 'Clarion initialization completed';
    item.show();
    initializationHideTimer = setTimeout(() => {
        item.hide();
        initializationHideTimer = undefined;
    }, 4000);
}

export function failInitializationStatusBar(message: string): void {
    clearInitializationHideTimer();
    const item = ensureInitializationStatusBarItem();
    item.text = '$(error) Clarion: Initialization failed';
    item.tooltip = `Clarion initialization failed: ${message}`;
    item.show();
}

export function hideInitializationStatusBar(): void {
    clearInitializationHideTimer();
    if (initializationStatusBarItem) {
        initializationStatusBarItem.hide();
    }
}

/**
 * Updates the configuration status bar with the current Clarion configuration
 * Creates the status bar item if it doesn't exist
 * @param configuration - The configuration name to display (e.g., "Debug", "Release")
 */
export async function updateConfigurationStatusBar(configuration: string): Promise<void> {
    if (!configStatusBarItem) {
        configStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        configStatusBarItem.command = 'clarion.setConfiguration'; // ✅ Clicking will open the config picker
    }

    // Display just the configuration part (before the pipe) for cleaner UI
    const displayConfig = configuration.split('|')[0];
    configStatusBarItem.text = `$(gear) Clarion: ${displayConfig}`;
    configStatusBarItem.tooltip = `Click to change Clarion configuration (Current: ${configuration})`;
    configStatusBarItem.show();

    // ✅ Ensure the setting is updated
    const currentConfig = workspace.getConfiguration().get<string>("clarion.configuration");

    if (currentConfig !== configuration) {
        logger.info(`🔄 Updating folder configuration: clarion.configuration = ${configuration}`);
        await SettingsStorageManager.updateActiveConfiguration(configuration);
    }
}

/**
 * #132 / dd87633f B2 — render the active Clarion version on the status bar
 * (priority 101, one slot left of the build-config item at 100).
 *
 * #133 / a09de932 — label reads as compile-target intent ("Compile: …") with
 * the IDE folder name (parent dir of the active ClarionProperties.xml) so the
 * "running Clarion 11, compiling as Clarion 6" case is unambiguous. Tooltip
 * carries the full properties-file path for trust/debugging.
 *
 * #141 Q9 directive (reverses dd87633f B2's solution-free posture) — the
 * version status bar is now solution-gated. When no solution is loaded the
 * status bar item hides; the no-solution-mode surface for version state is
 * the Actions pane detail area per the other Q9 directive (separate B2 item).
 * Caller passes `solutionLoaded: false` to force-hide regardless of args.
 *
 * Pass undefined/empty for either arg, OR solutionLoaded=false, to HIDE the
 * item; pass valid version + propertiesFile + solutionLoaded=true to show.
 */
export function updateVersionStatusBar(
    version: string | undefined,
    propertiesFile: string | undefined,
    solutionLoaded: boolean = true
): void {
    if (!versionStatusBarItem) {
        versionStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 101);
        versionStatusBarItem.command = 'clarion.setActiveVersion';
    }
    if (!version || !propertiesFile || !solutionLoaded) {
        versionStatusBarItem.hide();
        return;
    }
    const ideDir = path.basename(path.dirname(propertiesFile));
    versionStatusBarItem.text = `$(symbol-package) Compile: ${version} (from ${ideDir})`;
    versionStatusBarItem.tooltip = `Compile target: ${version}\nFrom: ${propertiesFile}\nClick to change`;
    versionStatusBarItem.show();
}

/**
 * #141 Q9 — explicit hide entry for solution-close lifecycle (mirror of
 * `hideConfigurationStatusBar` + `hideBuildProjectStatusBar`). Wired into
 * `SolutionOpener.closeClarionSolution` post-#146-merge rebase.
 */
export function hideVersionStatusBar(): void {
    if (versionStatusBarItem) {
        versionStatusBarItem.hide();
    }
}

/**
 * Updates the build project status bar based on the active editor
 * Shows which project(s) the current file belongs to
 * Hides if no solution is open or no active editor
 */
export async function updateBuildProjectStatusBar(): Promise<void> {
    // Only proceed if we have a solution open
    if (!globalSolutionFile) {
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        return;
    }

    // Check if there's an active editor
    const activeEditor = window.activeTextEditor;
    if (!activeEditor) {
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        return;
    }

    // Get the file path of the active editor
    const filePath = activeEditor.document.uri.fsPath;
    
    // Get the SolutionCache instance
    const solutionCache = SolutionCache.getInstance();
    
    // Find all projects the file belongs to
    const projects = solutionCache.findProjectsForFile(filePath);
    
    // Create the status bar item if it doesn't exist
    if (!buildProjectStatusBarItem) {
        buildProjectStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 99); // Position it to the right of the configuration status bar
        buildProjectStatusBarItem.command = 'clarion.buildCurrentProject';
    }
    
    if (projects.length === 1) {
        // If we found exactly one project, show "Build [project name]"
        buildProjectStatusBarItem.text = `🔨 Build ${projects[0].name}`;
        buildProjectStatusBarItem.tooltip = `Build project ${projects[0].name}`;
        buildProjectStatusBarItem.show();
    } else if (projects.length > 1) {
        // If the file is in multiple projects, show "Build (Multiple Projects...)"
        buildProjectStatusBarItem.text = `🔨 Build (Multiple Projects...)`;
        buildProjectStatusBarItem.tooltip = `File is in multiple projects. Click to select which to build.`;
        buildProjectStatusBarItem.show();
    } else {
        // If no project was found, show "Build Solution" instead
        buildProjectStatusBarItem.text = `🔨 Build Solution`;
        buildProjectStatusBarItem.tooltip = `Build the entire solution`;
        buildProjectStatusBarItem.show();
    }
}

/**
 * Hides the configuration status bar item
 */
export function hideConfigurationStatusBar(): void {
    if (configStatusBarItem) {
        configStatusBarItem.hide();
    }
}

/**
 * Hides the build project status bar item
 */
export function hideBuildProjectStatusBar(): void {
    if (buildProjectStatusBarItem) {
        buildProjectStatusBarItem.hide();
    }
}

/**
 * Disposes both status bar items
 * Call this during extension deactivation
 */
export function disposeStatusBars(): void {
    clearInitializationHideTimer();
    if (configStatusBarItem) {
        configStatusBarItem.dispose();
    }
    if (buildProjectStatusBarItem) {
        buildProjectStatusBarItem.dispose();
    }
    if (versionStatusBarItem) {
        versionStatusBarItem.dispose();
    }
    if (initializationStatusBarItem) {
        initializationStatusBarItem.dispose();
    }
}
