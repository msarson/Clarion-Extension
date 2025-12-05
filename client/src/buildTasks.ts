/**
 * Clarion Build Tasks
 *
 * This module handles the Clarion build process, now using the server-side implementation
 * for project and solution management. It communicates with the server through the SolutionCache
 * to get project information and build the solution or individual projects.
 */

import { workspace, window, tasks, Task, ShellExecution, TaskScope, TaskProcessEndEvent, TaskRevealKind, TaskPanelKind, TextEditor, Diagnostic, DiagnosticSeverity, Range, languages, Uri, DiagnosticCollection } from "vscode";
import { globalSolutionFile, globalSettings } from "./globals";
import * as path from "path";
import * as fs from "fs";
import processBuildErrors from "./processBuildErrors";
import LoggerManager from './logger';
import { PlatformUtils } from "./platformUtils";
import { SolutionCache } from "./SolutionCache";
import { ClarionProjectInfo } from "../../common/types";
const logger = LoggerManager.getLogger("BuildTasks");
logger.setLevel("error");
/**
 * Main entry point for the Clarion build process
 */
export async function runClarionBuild() {
    if (!validateBuildEnvironment()) {
        return;
    }

    // Load the solution information
    const solutionData = await loadSolutionInfo();
    if (!solutionData) {
        return;
    }

    // Determine what to build
    const buildConfig = await determineBuildTarget(solutionData.solutionInfo);
    if (!buildConfig) {
        window.showInformationMessage("⏹ Build cancelled.");
        return;
    }

    // Prepare build task parameters
    const buildParams = prepareBuildParameters(buildConfig);

    // ✅ Ensure we have a diagnostic collection for this extension
    const diagnosticCollection = languages.createDiagnosticCollection("clarion");

    // Execute the build task with diagnostics
    await executeBuildTask({
        ...buildParams,
        diagnosticCollection,   // ✅ pass through
    });
}


/**
 * Validates the build environment
 */
export function validateBuildEnvironment(): boolean {
    if (!workspace.isTrusted) {
        window.showWarningMessage("Clarion features require a trusted workspace.");
        return false;
    }

    if (!PlatformUtils.isWindows()) {
        window.showErrorMessage("❌ Clarion build is only supported on Windows.");
        return false;
    }

    if (!globalSolutionFile || !globalSettings.redirectionPath) {
        window.showErrorMessage("❌ Cannot build: Missing solution file or Clarion redirection path.");
        return false;
    }

    return true;
}

/**
 * Gets the solution information from the SolutionCache
 * This now uses the server-side solution information
 */
export async function loadSolutionInfo(): Promise<{ solutionInfo: any } | null> {
    try {
        const solutionCache = SolutionCache.getInstance();

        // Ensure we have the latest solution information from the server
        await solutionCache.refresh();

        const solutionInfo = solutionCache.getSolutionInfo();

        if (!solutionInfo) {
            window.showErrorMessage("❌ No solution information available. Please open a solution first.");
            return null;
        }

        if (!solutionInfo.projects || solutionInfo.projects.length === 0) {
            window.showErrorMessage("❌ No projects found in the solution.");
            return null;
        }

        logger.info(`✅ Loaded solution information with ${solutionInfo.projects.length} projects from server`);
        return { solutionInfo };
    } catch (error) {
        window.showErrorMessage(`❌ Failed to get solution information: ${error}`);
        return null;
    }
}

/**
 * Determines what to build (full solution or specific project)
 */
async function determineBuildTarget(solutionInfo: any): Promise<{
    buildTarget: "Solution" | "Project";
    selectedProjectPath: string;
    projectObject?: ClarionProjectInfo;
} | null> {
    let buildTarget: "Solution" | "Project" = "Solution";
    let selectedProjectPath = "";
    let projectObject: ClarionProjectInfo | undefined = undefined;

    // Even if there's only one project, we still want to allow building it individually
    // This ensures the "Build Project" context menu item appears for single-project solutions
    if (solutionInfo.projects.length === 1) {
        selectedProjectPath = solutionInfo.projects[0].path;
        projectObject = solutionInfo.projects[0] as ClarionProjectInfo;
        // We don't return here, allowing the user to choose between solution and project build
    }

    // Try to find projects for the active file
    const currentProjects = findCurrentProjects(solutionInfo);
    
    const buildOptions = ["Build Full Solution"];

    if (currentProjects.length === 1) {
        // If there's exactly one project for the current file
        const currentProject = currentProjects[0];
        selectedProjectPath = currentProject.path;
        projectObject = currentProject as ClarionProjectInfo;
        buildOptions.push(`Build Current Project: ${currentProject.name}`);
    } else if (currentProjects.length > 1) {
        // If the file is in multiple projects, add an option for each
        currentProjects.forEach(project => {
            buildOptions.push(`Build Project: ${project.name}`);
        });
    }

    buildOptions.push("Cancel");

    // Ask user what to build
    const selectedOption = await window.showQuickPick(buildOptions, {
        placeHolder: "Select a build target",
    });

    if (!selectedOption || selectedOption === "Cancel") {
        return null;
    }

    if (selectedOption.startsWith("Build Current Project")) {
        buildTarget = "Project";
    } else if (selectedOption.startsWith("Build Project:")) {
        buildTarget = "Project";
        // Extract project name from the selected option
        const projectName = selectedOption.replace("Build Project: ", "");
        const selectedProject = currentProjects.find(p => p.name === projectName);
        
        if (selectedProject) {
            selectedProjectPath = selectedProject.path;
            projectObject = selectedProject;
        }
    }

    return { buildTarget, selectedProjectPath, projectObject };
}

/**
 * Finds the project that contains the file in the active editor
 * This now uses the SolutionCache's findProjectForFile method
 * @deprecated Use findCurrentProjects instead to handle files in multiple projects
 */
function findCurrentProject(solutionInfo: any) {
    const projects = findCurrentProjects(solutionInfo);
    return projects.length > 0 ? projects[0] : undefined;
}

/**
 * Finds all projects that contain the file in the active editor
 * This uses the SolutionCache's findProjectsForFile method
 * @returns Array of projects containing the file (empty if none found)
 */
function findCurrentProjects(solutionInfo: any): ClarionProjectInfo[] {
    const activeEditor: TextEditor | undefined = window.activeTextEditor;

    if (!activeEditor) {
        return [];
    }

    const activeFilePath = activeEditor.document.uri.fsPath;
    const activeFileName = path.basename(activeFilePath);

    // Use SolutionCache to find all projects for the active file
    const solutionCache = SolutionCache.getInstance();
    // Use the full file path instead of just the basename
    const projects = solutionCache.findProjectsForFile(activeFilePath);

    if (projects.length > 0) {
        logger.info(`✅ Found ${projects.length} projects for file ${activeFileName} using server-side solution cache`);
        return projects;
    }

    logger.info(`❌ No projects found for file ${activeFileName}`);
    return [];
}

/**
 * Prepares build parameters
 * This now works with the ClarionProjectInfo returned from the server
 */
export function prepareBuildParameters(buildConfig: {
    buildTarget: "Solution" | "Project";
    selectedProjectPath: string;
    projectObject?: ClarionProjectInfo;
}): {
    solutionDir: string;
    msBuildPath: string;
    buildArgs: string[];
    buildLogPath: string;
    buildTarget: "Solution" | "Project";
    targetName: string;
} {
    const solutionDir = path.dirname(globalSolutionFile);
    const clarionBinPath = globalSettings.redirectionPath.replace(/redirection.*/i, "bin");
    const msBuildPath = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe";
    
    // Get custom log file path or use default
    const customLogPath = workspace.getConfiguration("clarion.build").get<string>("logFilePath", "");
    const buildLogPath = customLogPath ?
        customLogPath :
        path.join(solutionDir, "build_output.log");

    // Extract target name correctly
    let targetName = "";
    if (buildConfig.buildTarget === "Solution") {
        targetName = path.basename(globalSolutionFile);
    } else {
        // Use the project object's name if available, otherwise extract from path
        targetName = buildConfig.projectObject ?
            buildConfig.projectObject.name :
            path.basename(path.dirname(buildConfig.selectedProjectPath)); // Use directory name
    }

    const selectedConfig = globalSettings.configuration || "Debug"; // Ensure a fallback

    const buildArgs = [
        "/property:GenerateFullPaths=true",
        "/t:build",
        `/property:Configuration=${selectedConfig}`,
        `/property:clarion_Sections=${selectedConfig}`,
        `/property:ClarionBinPath="${clarionBinPath}"`,
        "/property:NoDependency=true",
        "/verbosity:normal",
        "/nologo",
        `/fileLogger`,
        `/fileLoggerParameters:LogFile="${buildLogPath}";verbosity=detailed;encoding=utf-8`
    ];

    // Log the build configuration
    logger.info(`🔄 Preparing build for ${buildConfig.buildTarget === "Solution" ? "solution" : "project"}: ${targetName}`);
    logger.info(`🔹 Using configuration: ${selectedConfig}`);
    logger.info(`🔹 Clarion bin path: ${clarionBinPath}`);

    if (buildConfig.buildTarget === "Solution") {
        buildArgs.push(`/property:SolutionDir="${path.dirname(globalSolutionFile)}"`);
        logger.info(`🔹 Solution directory: ${path.dirname(globalSolutionFile)}`);

        // Explicitly specify the solution file to build
        buildArgs.push(`"${globalSolutionFile}"`);
        logger.info(`🔹 Solution file: ${path.basename(globalSolutionFile)}`);
    } else if (buildConfig.buildTarget === "Project") {
        const projectDir = path.dirname(buildConfig.selectedProjectPath);
        buildArgs.push(`/property:ProjectPath="${projectDir}"`);
        logger.info(`🔹 Project directory: ${projectDir}`);

        // Explicitly specify the project file to build
        const projectFile = buildConfig.projectObject?.filename || path.basename(buildConfig.selectedProjectPath);
        const projectFilePath = path.join(buildConfig.selectedProjectPath, projectFile);
        buildArgs.push(`"${projectFilePath}"`);
        logger.info(`🔹 Project file: ${projectFile}`);
    }

    return {
        solutionDir,
        msBuildPath,
        buildArgs,
        buildLogPath,
        buildTarget: buildConfig.buildTarget,
        targetName
    };
}

/**
 * Executes the build task and processes results
 * Enhanced with additional logging
 */
export async function executeBuildTask(params: {
    solutionDir: string;
    msBuildPath: string;
    buildArgs: string[];
    buildLogPath: string;
    buildTarget: "Solution" | "Project";
    targetName: string;
    diagnosticCollection: DiagnosticCollection;   // ✅ add
}): Promise<void> {
    const { solutionDir, msBuildPath, buildArgs, buildLogPath, buildTarget, targetName, diagnosticCollection } = params;

    logger.info(`🔄 Executing build task for ${buildTarget === "Solution" ? "solution" : "project"}: ${targetName}`);
    logger.info(`🔹 Working directory: ${solutionDir}`);
    logger.info(`🔹 MSBuild path: ${msBuildPath}`);
    logger.info(`🔹 Build log path: ${buildLogPath}`);

    // Create the shell execution - MSBuild will handle logging via /fileLogger
    const execution = new ShellExecution(
        `${msBuildPath} ${buildArgs.join(" ")}`,
        { cwd: solutionDir }
    );

    // Create the task
    const task = createBuildTask(execution);

    try {
        // Show a more specific message based on what's being built
        const buildTypeMessage = buildTarget === "Solution"
            ? `🔄 Building Clarion Solution: ${targetName}`
            : `🔄 Building Clarion Project: ${targetName}`;

        window.showInformationMessage(buildTypeMessage);

        // Pass the target info (and diagnostics) to the completion handler
        const disposable = setupBuildCompletionHandler(
            buildLogPath,
            buildTarget,
            targetName,
            diagnosticCollection   // ✅ pass through
        );

        logger.info(`✅ Executing build task: ${execution.commandLine}`);
        await tasks.executeTask(task);
    } catch (error) {
        window.showErrorMessage("❌ Failed to start Clarion build task.");
        logger.error("❌ Clarion Build Task Error:", error);
    }
}


/**
 * Creates the build task
 */
function createBuildTask(execution: ShellExecution): Task {
    const task = new Task(
        { type: "shell" },
        TaskScope.Workspace,
        "Clarion Build",
        "msbuild",
        execution,
        "clarionBuildMatcher"
    );

    // ✅ Set the actual command explicitly
    task.definition = {
        type: "shell",
        command: execution.commandLine
    };

    // Get the user's preference for revealing output
    const revealSetting = workspace.getConfiguration("clarion.build").get<string>("revealOutput", "never");
    let revealKind = TaskRevealKind.Never;
    
    switch (revealSetting) {
        case "always":
            revealKind = TaskRevealKind.Always;
            break;
        case "onError":
            revealKind = TaskRevealKind.Silent; // Will be shown on error
            break;
        default:
            revealKind = TaskRevealKind.Never;
    }

    // Apply presentation options based on settings
    task.presentationOptions = {
        reveal: revealKind,
        echo: revealKind !== TaskRevealKind.Never,
        focus: false,
        panel: TaskPanelKind.Dedicated
    };

    return task;
}

/**
 * Sets up the handler for build completion
 */
function setupBuildCompletionHandler(
    buildLogPath: string,
    buildTarget: "Solution" | "Project",
    targetName: string,
    diagnosticCollection: DiagnosticCollection   // ✅ add
) {
    return tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
        if (event.execution.task.name === "Clarion Build") {
            processTaskCompletion(
                event,
                buildLogPath,
                buildTarget,
                targetName,
                diagnosticCollection   // ✅ pass through
            );
        }
    });
}


/**
 * Processes the task completion, reads log file, and shows results
 */
function processTaskCompletion(
    event: TaskProcessEndEvent,
    buildLogPath: string,
    buildTarget: "Solution" | "Project",
    targetName: string,
    diagnosticCollection: DiagnosticCollection   // ✅ add this
) {
    fs.readFile(buildLogPath, "utf8", (err, data) => {
        if (err) {
            logger.info("Error reading build log:", err);
        } else {
            logger.info("Captured Build Output");
            logger.info(data);

            // Check if we should also show in Output panel
            const showInOutputPanel = workspace.getConfiguration("clarion.build").get<boolean>("showInOutputPanel", false);
            if (showInOutputPanel) {
                const outputChannel = window.createOutputChannel("Clarion Build");
                outputChannel.clear();
                outputChannel.append(data);
                outputChannel.show(true);
            }

            if (event.exitCode !== 0) {
                // ❌ Failed build: parse diagnostics
                const { errorCount, warningCount, diagnostics } = processBuildErrors(data);
                const msbuildErrors = processGeneralMSBuildErrors(data);

                // ✅ clear + set diagnostics here
                diagnosticCollection.clear();
                diagnostics.forEach((arr, file) =>
                    diagnosticCollection.set(Uri.file(file), arr)
                );

                const totalErrors = errorCount; // + (msbuildErrors ? 1 : 0);
                const targetInfo =
                    buildTarget === "Solution"
                        ? `Solution: ${targetName}`
                        : `Project: ${targetName}`;

                let message = `❌ Build Failed (${targetInfo}): `;

                if (totalErrors > 0) {
                    message += `${totalErrors} error${totalErrors !== 1 ? "s" : ""}`;
                    if (warningCount > 0) {
                        message += ` and ${warningCount} warning${warningCount !== 1 ? "s" : ""}`;
                    }
                    message += ` found. Check the Problems Panel!`;
                } else if (warningCount > 0) {
                    message += `${warningCount} warning${warningCount !== 1 ? "s" : ""} found. Check the Problems Panel!`;
                } else {
                    message += `Check the Problems Panel for details.`;
                }

                window.showErrorMessage(message);
            } else {
                // ✅ Success: clear old diagnostics
                diagnosticCollection.clear();

                const successMessage =
                    buildTarget === "Solution"
                        ? `✅ Building Clarion Solution Complete: ${targetName}`
                        : `✅ Building Clarion Project Complete: ${targetName}`;
                window.showInformationMessage(successMessage);
            }
        }

        // Check if we should preserve the log file
        const preserveLogFile = workspace.getConfiguration("clarion.build").get<boolean>("preserveLogFile", false);
        
        if (!preserveLogFile) {
            fs.unlink(buildLogPath, (unlinkErr) => {
                if (unlinkErr) {
                    logger.info("Failed to delete build log:", unlinkErr);
                } else {
                    logger.info("Deleted temporary build log");
                }
            });
        } else {
            logger.info(`Preserved build log at: ${buildLogPath}`);
            window.showInformationMessage(`Build log saved at: ${buildLogPath}`);
        }
    });
}


/**
 * Process general MSBuild errors that don't match the standard Clarion error format
 * @param output The build output to process
 * @returns boolean indicating whether any MSBuild errors were found
 */
function processGeneralMSBuildErrors(output: string): boolean {
    const diagnostics: { [key: string]: Diagnostic[] } = {};
    const diagnosticCollection = languages.createDiagnosticCollection("msbuild-errors");

    // Clear previous diagnostics
    diagnosticCollection.clear();

    // Improved solution file error pattern with more specific matching
    // Look for lines that start with a number (like 0>) followed by a path and error
    const solutionErrorRegex = /\s*(\d+)>([^(]+?\.(sln|cwproj))\((\d+)\):\s+(?:Solution|Project) file error\s+([A-Z0-9]+):\s+(.+)$/gm;

    // Match MSBuild errors like: "MSBUILD : error MSB1009: Project file does not exist."
    const msbuildErrorRegex = /^(?:MSBUILD|.+):\s*(error|warning)\s+([A-Z0-9]+):\s+(.+)$/gm;

    let match;
    let hasErrors = false;

    // First, check for solution file errors
    while ((match = solutionErrorRegex.exec(output)) !== null) {
        hasErrors = true;
        const [_, linePrefix, filePath, fileExt, line, code, message] = match;

        // Validate the file path to make sure it's a real path
        if (!filePath || !fs.existsSync(filePath)) {
            logger.warn(`⚠️ Invalid file path detected in error message: ${filePath}`);
            window.showErrorMessage(`${code}: ${message} (in solution file)`);
            continue;
        }

        // Create a diagnostic for the solution file error
        const lineNum = parseInt(line) - 1;
        const diagnostic = new Diagnostic(
            new Range(lineNum, 0, lineNum, 100),
            `${fileExt === 'sln' ? 'Solution' : 'Project'} file error ${code}: ${message}`,
            DiagnosticSeverity.Error
        );

        if (!diagnostics[filePath]) {
            diagnostics[filePath] = [];
        }
        diagnostics[filePath].push(diagnostic);

        logger.info(`📌 File error detected: ${filePath}(${line}): ${code}: ${message}`);
    }

    // Then check for general MSBuild errors
    while ((match = msbuildErrorRegex.exec(output)) !== null) {
        hasErrors = true;
        const [_, severity, code, message] = match;

        // Since we don't have file/line info, we'll show it as a general error
        window.showErrorMessage(`MSBuild ${severity} ${code}: ${message}`);

        // We'll also add to the diagnostics collection with a generic file
        const diagnostic = new Diagnostic(
            new Range(0, 0, 0, 0),
            `MSBuild ${severity} ${code}: ${message}`,
            severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning
        );

        const errorFile = globalSolutionFile; // Use the solution file for general MSBuild errors
        if (!diagnostics[errorFile]) {
            diagnostics[errorFile] = [];
        }
        diagnostics[errorFile].push(diagnostic);
    }

    // Apply diagnostics to the problems panel
    Object.keys(diagnostics).forEach(file => {
        // Double check that the file exists before setting diagnostics
        if (fs.existsSync(file)) {
            diagnosticCollection.set(Uri.file(file), diagnostics[file]);
        } else {
            // If file doesn't exist, show a general error message
            const errors = diagnostics[file];
            errors.forEach(error => {
                window.showErrorMessage(`Error in non-existent file: ${file} - ${error.message}`);
            });
        }
    });

    return hasErrors;
}
