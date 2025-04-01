/**
 * Clarion Build Tasks
 *
 * This module handles the Clarion build process, now using the server-side implementation
 * for project and solution management. It communicates with the server through the SolutionCache
 * to get project information and build the solution or individual projects.
 */

import { workspace, window, tasks, Task, ShellExecution, TaskScope, TaskProcessEndEvent, TaskRevealKind, TaskPanelKind, TextEditor, Diagnostic, DiagnosticSeverity, Range, languages, Uri } from "vscode";
import { globalSolutionFile, globalSettings } from "./globals";
import * as path from "path";
import * as fs from "fs";
import LoggerManager from './logger';
import { PlatformUtils } from "./platformUtils";
import { SolutionCache } from "./SolutionCache";
import { ClarionProjectInfo } from "../../common/types";
import processBuildErrors, { clearAllDiagnostics } from "./processBuildErrors";
const logger = LoggerManager.getLogger("BuildTasks");
logger.setLevel("info"); // Changed from "error" to "info" to see more detailed logs
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

    // Execute the build task
    // Clear any existing diagnostics before starting a new build
    clearAllDiagnostics();
    
    await executeBuildTask(buildParams);
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

    if (solutionInfo.projects.length <= 1) {
        // Only one project, use solution build
        if (solutionInfo.projects.length === 1) {
            selectedProjectPath = solutionInfo.projects[0].path;
        }
        return { buildTarget, selectedProjectPath };
    }

    // Try to find the project for the active file
    const currentProject = findCurrentProject(solutionInfo);
    if (currentProject) {
        selectedProjectPath = currentProject.path;
        projectObject = currentProject as ClarionProjectInfo;
    }

    const buildOptions = ["Build Full Solution"];

    if (currentProject) {
        buildOptions.push(`Build Current Project: ${currentProject.name}`);
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
    }

    return { buildTarget, selectedProjectPath, projectObject };
}

/**
 * Finds the project that contains the file in the active editor
 * This now uses the SolutionCache's findProjectForFile method
 */
function findCurrentProject(solutionInfo: any) {
    const activeEditor: TextEditor | undefined = window.activeTextEditor;

    if (!activeEditor) {
        return undefined;
    }

    const activeFilePath = activeEditor.document.uri.fsPath;
    const activeFileName = path.basename(activeFilePath);

    // Use SolutionCache to find the project for the active file
    const solutionCache = SolutionCache.getInstance();
    const project = solutionCache.findProjectForFile(activeFileName);
    
    if (project) {
        logger.info(`✅ Found project ${project.name} for file ${activeFileName} using server-side solution cache`);
        return project;
    }

    logger.info(`❌ No project found for file ${activeFileName}`);
    return undefined;
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
    targetFilePath: string;
} {
    const solutionDir = path.dirname(globalSolutionFile);
    const clarionBinPath = globalSettings.redirectionPath.replace(/redirection.*/i, "bin");
    const msBuildPath = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe";
    const buildLogPath = path.join(solutionDir, "build_output.log");

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
        "/m",
        "/consoleloggerparameters:ErrorsOnly",
        `/property:Configuration=${selectedConfig}`,
        `/property:clarion_Sections=${selectedConfig}`,
        `/property:ClarionBinPath="${clarionBinPath}"`,
        "/property:NoDependency=true",
        "/property:Verbosity=detailed",
        "/property:WarningLevel=5"
    ];

    // Log the build configuration
    logger.info(`🔄 Preparing build for ${buildConfig.buildTarget === "Solution" ? "solution" : "project"}: ${targetName}`);
    logger.info(`🔹 Using configuration: ${selectedConfig}`);
    logger.info(`🔹 Clarion bin path: ${clarionBinPath}`);

    // Prepare the target file path (solution or project)
    let targetFilePath = "";
    
    if (buildConfig.buildTarget === "Solution") {
        targetFilePath = globalSolutionFile;
        buildArgs.push(`/property:SolutionDir="${path.dirname(globalSolutionFile)}"`);
        logger.info(`🔹 Solution file: ${targetFilePath}`);
    } else if (buildConfig.buildTarget === "Project") {
        // Ensure we're passing the actual .cwproj file path, not just the directory
        if (buildConfig.selectedProjectPath.endsWith('.cwproj')) {
            targetFilePath = buildConfig.selectedProjectPath;
        } else if (buildConfig.projectObject?.name) {
            // Construct the path to the .cwproj file using the project name
            targetFilePath = path.join(buildConfig.selectedProjectPath, `${buildConfig.projectObject.name}.cwproj`);
        } else {
            // Fallback: use the directory name as the project name
            const dirName = path.basename(buildConfig.selectedProjectPath);
            targetFilePath = path.join(buildConfig.selectedProjectPath, `${dirName}.cwproj`);
        }
        
        // Verify the file exists
        if (fs.existsSync(targetFilePath)) {
            logger.info(`✅ Found project file: ${targetFilePath}`);
        } else {
            logger.warn(`⚠️ Project file not found: ${targetFilePath}`);
        }
        
        logger.info(`🔹 Project file path: ${targetFilePath}`);
    }

    return {
        solutionDir,
        msBuildPath,
        buildArgs,
        buildLogPath,
        buildTarget: buildConfig.buildTarget,
        targetName,
        targetFilePath
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
    targetFilePath: string;
}): Promise<void> {
    const { solutionDir, msBuildPath, buildArgs, buildLogPath, buildTarget, targetName, targetFilePath } = params;

    logger.info(`🔄 Executing build task for ${buildTarget === "Solution" ? "solution" : "project"}: ${targetName}`);
    logger.info(`🔹 Working directory: ${solutionDir}`);
    logger.info(`🔹 MSBuild path: ${msBuildPath}`);
    logger.info(`🔹 Build log path: ${buildLogPath}`);
    logger.info(`🔹 Target file path: ${targetFilePath}`);

    // Create the shell execution with the target file path as a direct argument
    // Redirect output to a file so we can process it for errors
    const execution = new ShellExecution(
        `${msBuildPath} "${targetFilePath}" ${buildArgs.join(" ")} > "${buildLogPath}" 2>&1`,
        { cwd: solutionDir }
    );

    // Create the task
    const task = createBuildTask(execution);

    try {
        // Show a more specific message based on what's being built
        const buildTypeMessage = buildTarget === "Solution"
            ? `🔄 Building Clarion Solution: ${targetName}`
            : `🔄 Building Clarion Project: ${targetName}.cwproj`;
        
        window.showInformationMessage(buildTypeMessage);

        // Pass the target info to the completion handler
        const disposable = setupBuildCompletionHandler(buildLogPath, buildTarget, targetName);

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
        execution
    );

    // ✅ Set the actual command explicitly
    task.definition = {
        type: "shell",
        command: execution.commandLine
    };
// Don't use problem matchers - we'll handle errors ourselves
task.problemMatchers = [];


    // Hide terminal output to avoid confusion - we'll handle errors through the Problems panel
    task.presentationOptions = {
        reveal: TaskRevealKind.Never,
        echo: false,
        focus: false,
        panel: TaskPanelKind.Shared
    };

    return task;
}

/**
 * Sets up the handler for build completion
 */
/**
 * Sets up the handler for build completion
 */
function setupBuildCompletionHandler(buildLogPath: string, buildTarget: "Solution" | "Project", targetName: string) {
    return tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
        if (event.execution.task.name === "Clarion Build") {
            // Read the build log file and process it for errors
            try {
                if (fs.existsSync(buildLogPath)) {
                    const buildOutput = fs.readFileSync(buildLogPath, 'utf8');
                    const { errorCount, warningCount } = processBuildErrors(buildOutput);
                    
                    if (event.exitCode === 0) {
                        // Show success message with target details
                        const successMessage = buildTarget === "Solution"
                            ? `✅ Building Clarion Solution Complete: ${targetName}`
                            : `✅ Building Clarion Project Complete: ${targetName}`;
                        
                        if (warningCount > 0) {
                            window.showInformationMessage(`${successMessage} with ${warningCount} warnings. Check the Problems panel for details.`);
                        } else {
                            window.showInformationMessage(successMessage);
                        }
                    } else {
                        // Show failure message
                        const failureMessage = buildTarget === "Solution"
                            ? `❌ Building Clarion Solution Failed: ${targetName}`
                            : `❌ Building Clarion Project Failed: ${targetName}`;
                        
                        window.showErrorMessage(`${failureMessage} with ${errorCount} errors and ${warningCount} warnings. Check the Problems panel for details.`);
                    }
                } else {
                    logger.error(`❌ Build log file not found: ${buildLogPath}`);
                    window.showErrorMessage(`❌ Build log file not found: ${buildLogPath}`);
                }
            } catch (error) {
                logger.error("❌ Error processing build output:", error);
                window.showErrorMessage(`❌ Error processing build output: ${error}`);
            }
        }
    });
}
