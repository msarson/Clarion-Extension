import { window, workspace, StatusBarItem, StatusBarAlignment } from 'vscode';
import * as path from 'path';
import { globalSolutionFile, getClarionConfigTarget } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { buildInitializationStatusText, InitializationStatusPhase } from './InitializationStatusText';
import { buildOperationStatusText, ClarionOperationType } from './OperationStatusText';
import { SettingsStorageManager } from '../utils/SettingsStorageManager';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("StatusBarManager");
logger.setLevel("error");

/**
 * #273 — the Clarion status surface is scoped to the active editor so it never steps on a
 * non-Clarion workspace (the same principle the built-in TypeScript version indicator uses —
 * hidden off .ts/.js). Every Clarion status item is shown only while a Clarion document is the
 * active editor and hidden otherwise; the solution-load indicator no longer leaves a persistent
 * "Clarion: Ready" item, and a solution-free / non-Clarion folder shows nothing at all.
 *
 * (The idiomatic home for the load indicator would be `languages.createLanguageStatusItem` with a
 * `busy` spinner in the `{ }` area; that API needs `@types/vscode` ≥ 1.65, but the client is still
 * pinned to 1.56 — bumping it ripples into vscode-languageclient's typings, so that's a separate
 * dependency-hygiene change. Until then this achieves the same visibility behaviour in the main bar.)
 */
function isClarionActiveEditor(): boolean {
    const doc = window.activeTextEditor?.document;
    return !!doc && (doc.languageId === 'clarion' || doc.languageId === 'clarion-template');
}

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
let operationStatusBarItem: StatusBarItem;
let operationHideTimer: ReturnType<typeof setTimeout> | undefined;

// #273 — last-known values so the active-editor visibility refresh can re-show items with the
// correct content when focus returns to a Clarion document (without re-plumbing their callers).
let lastConfiguration: string | undefined;
let lastVersion: { version?: string; propertiesFile?: string; solutionLoaded: boolean } | undefined;
// #273 — the init indicator's desired content while a solution is loading (or a failure state);
// undefined means "nothing to show". Actual visibility is gated on isClarionActiveEditor().
let initializationState: { text: string; tooltip: string } | undefined;

function clearOperationHideTimer(): void {
    if (operationHideTimer) {
        clearTimeout(operationHideTimer);
        operationHideTimer = undefined;
    }
}

function ensureInitializationStatusBarItem(): StatusBarItem {
    if (!initializationStatusBarItem) {
        // Keep this left of version/config/build items while active.
        initializationStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 103);
    }
    return initializationStatusBarItem;
}

/** #273 — apply the stored init state, gated on a Clarion document being active. */
function applyInitializationStatusBar(): void {
    if (!initializationState) {
        if (initializationStatusBarItem) initializationStatusBarItem.hide();
        return;
    }
    const item = ensureInitializationStatusBarItem();
    item.text = initializationState.text;
    item.tooltip = initializationState.tooltip;
    if (isClarionActiveEditor()) {
        item.show();
    } else {
        item.hide();
    }
}

export function updateInitializationStatusBar(
    phase: InitializationStatusPhase,
    detail?: string
): void {
    initializationState = {
        text: buildInitializationStatusText(phase, detail),
        tooltip: detail ? `Clarion initialization: ${detail}` : 'Clarion initialization in progress',
    };
    applyInitializationStatusBar();
}

export function completeInitializationStatusBar(_detail?: string): void {
    // #273 — the indicator is load-progress feedback only; on success it disappears rather than
    // leaving a persistent "Clarion: Ready" item. Solution state is conveyed by the version /
    // config / build items.
    initializationState = undefined;
    applyInitializationStatusBar();
}

export function failInitializationStatusBar(message: string): void {
    // Keep the failure visible (while a Clarion document is active) so the user notices it.
    initializationState = {
        text: '$(error) Clarion: Initialization failed',
        tooltip: `Clarion initialization failed: ${message}`,
    };
    applyInitializationStatusBar();
}

export function hideInitializationStatusBar(): void {
    initializationState = undefined;
    applyInitializationStatusBar();
}

function ensureOperationStatusBarItem(): StatusBarItem {
    if (!operationStatusBarItem) {
        operationStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 102);
    }
    return operationStatusBarItem;
}

export function startOperationStatusBar(
    operation: ClarionOperationType,
    detail?: string
): void {
    clearOperationHideTimer();
    const item = ensureOperationStatusBarItem();
    item.text = buildOperationStatusText(operation, 'running', detail);
    item.tooltip = detail
        ? `Clarion ${operation} in progress: ${detail}`
        : `Clarion ${operation} in progress`;
    item.show();
}

export function succeedOperationStatusBar(
    operation: ClarionOperationType,
    detail?: string
): void {
    clearOperationHideTimer();
    const item = ensureOperationStatusBarItem();
    item.text = buildOperationStatusText(operation, 'success', detail);
    item.tooltip = detail
        ? `Clarion ${operation} completed: ${detail}`
        : `Clarion ${operation} completed`;
    item.show();
    operationHideTimer = setTimeout(() => {
        item.hide();
        operationHideTimer = undefined;
    }, 4000);
}

export function failOperationStatusBar(
    operation: ClarionOperationType,
    detail?: string
): void {
    clearOperationHideTimer();
    const item = ensureOperationStatusBarItem();
    item.text = buildOperationStatusText(operation, 'failure', detail);
    item.tooltip = detail
        ? `Clarion ${operation} failed: ${detail}`
        : `Clarion ${operation} failed`;
    item.show();
}

export function hideOperationStatusBar(): void {
    clearOperationHideTimer();
    if (operationStatusBarItem) {
        operationStatusBarItem.hide();
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
    // #273 — remember the value and only surface it while a Clarion document is active.
    lastConfiguration = configuration;
    if (isClarionActiveEditor()) {
        configStatusBarItem.show();
    } else {
        configStatusBarItem.hide();
    }

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
    // #273 — remember the value so the active-editor refresh can re-show it correctly.
    lastVersion = { version, propertiesFile, solutionLoaded };
    if (!version || !propertiesFile || !solutionLoaded) {
        versionStatusBarItem.hide();
        return;
    }
    const ideDir = path.basename(path.dirname(propertiesFile));
    versionStatusBarItem.text = `$(symbol-package) Compile: ${version} (from ${ideDir})`;
    versionStatusBarItem.tooltip = `Compile target: ${version}\nFrom: ${propertiesFile}\nClick to change`;
    // #273 — only surface it while a Clarion document is active (mirrors the TS version indicator).
    if (isClarionActiveEditor()) {
        versionStatusBarItem.show();
    } else {
        versionStatusBarItem.hide();
    }
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

    // Check if there's an active editor — and #273, that it is a Clarion document, so the
    // build action doesn't linger while viewing unrelated files in a Clarion project.
    const activeEditor = window.activeTextEditor;
    if (!activeEditor || !isClarionActiveEditor()) {
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
 * #273 — re-apply the visibility of the main-bar workspace items (version / config / build) to
 * match the active editor's language, mirroring the built-in TypeScript version indicator. Wired
 * to `window.onDidChangeActiveTextEditor`. Only acts when there IS an active text editor, so
 * moving focus to a panel/view (no active editor) leaves the items as-is rather than flickering.
 */
export function refreshActiveEditorScopedStatusBars(): void {
    if (!window.activeTextEditor) return;
    const clarion = isClarionActiveEditor();

    applyInitializationStatusBar();
    if (configStatusBarItem) {
        (clarion && lastConfiguration) ? configStatusBarItem.show() : configStatusBarItem.hide();
    }
    if (versionStatusBarItem) {
        (clarion && lastVersion?.version && lastVersion.propertiesFile && lastVersion.solutionLoaded)
            ? versionStatusBarItem.show()
            : versionStatusBarItem.hide();
    }
    // The build item recomputes from the active editor (and self-gates on Clarion + solution).
    void updateBuildProjectStatusBar();
}

/**
 * Disposes all status bar / language status items
 * Call this during extension deactivation
 */
export function disposeStatusBars(): void {
    clearOperationHideTimer();
    if (initializationStatusBarItem) {
        initializationStatusBarItem.dispose();
    }
    if (configStatusBarItem) {
        configStatusBarItem.dispose();
    }
    if (buildProjectStatusBarItem) {
        buildProjectStatusBarItem.dispose();
    }
    if (versionStatusBarItem) {
        versionStatusBarItem.dispose();
    }
    if (operationStatusBarItem) {
        operationStatusBarItem.dispose();
    }
}
