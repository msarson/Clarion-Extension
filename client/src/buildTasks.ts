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
import processBuildErrors from "./processBuildErrors";
import LoggerManager from './logger';
import { PlatformUtils } from "./platformUtils";
import { SolutionCache } from "./SolutionCache";
import { ClarionProjectInfo } from "../../common/types";
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

    if (buildConfig.buildTarget === "Solution") {
        buildArgs.push(`/property:SolutionDir="${globalSolutionFile}"`);
        logger.info(`🔹 Solution directory: ${globalSolutionFile}`);
    } else if (buildConfig.buildTarget === "Project") {
        buildArgs.push(`/property:ProjectPath="${buildConfig.selectedProjectPath}"`);
        logger.info(`🔹 Project path: ${buildConfig.selectedProjectPath}`);
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
}): Promise<void> {
    const { solutionDir, msBuildPath, buildArgs, buildLogPath, buildTarget, targetName } = params;

    logger.info(`🔄 Executing build task for ${buildTarget === "Solution" ? "solution" : "project"}: ${targetName}`);
    logger.info(`🔹 Working directory: ${solutionDir}`);
    logger.info(`🔹 MSBuild path: ${msBuildPath}`);
    logger.info(`🔹 Build log path: ${buildLogPath}`);

    // Create the shell execution - restore log file redirection
    const execution = new ShellExecution(
        `${msBuildPath} ${buildArgs.join(" ")} > "${buildLogPath}" 2>&1`,
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
        execution,
        "clarionBuildMatcher"
    );

    // ✅ Set the actual command explicitly
    task.definition = {
        type: "shell",
        command: execution.commandLine
    };

    // Hide terminal output again
    task.presentationOptions = {
        reveal: TaskRevealKind.Never,
        echo: false,
        focus: false,
        panel: TaskPanelKind.Dedicated
    };

    return task;
}

/**
 * Sets up the handler for build completion
 */
function setupBuildCompletionHandler(buildLogPath: string, buildTarget: "Solution" | "Project", targetName: string) {
    return tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
        if (event.execution.task.name === "Clarion Build") {
            processTaskCompletion(event, buildLogPath, buildTarget, targetName);
        }
    });
}

/**
 * Processes the task completion, reads log file, and shows results
 */
function processTaskCompletion(event: TaskProcessEndEvent, buildLogPath: string, buildTarget: "Solution" | "Project", targetName: string) {
    fs.readFile(buildLogPath, "utf8", (err, data) => {
        if (err) {
            logger.info("Error reading build log:", err);
        } else {
            logger.info("Captured Build Output");
            logger.info(data);
            
            // Process the build errors and get counts
            const { errorCount, warningCount } = processBuildErrors(data);
            
            // If build failed, also check for MSBuild errors
            if (event.exitCode !== 0) {
                const msbuildErrors = processGeneralMSBuildErrors(data);
                
                // Show toast with error and warning counts
                const totalErrors = errorCount + (msbuildErrors ? 1 : 0); // Add 1 if there are MSBuild errors
                
                // Format the build target name for the message
                const targetInfo = buildTarget === "Solution"
                    ? `Solution: ${targetName}`
                    : `Project: ${targetName}`;
                
                // Create a detailed message with both errors and warnings
                let message = `❌ Build Failed (${targetInfo}): `;
                
                if (totalErrors > 0) {
                    message += `${totalErrors} error${totalErrors !== 1 ? 's' : ''}`;
                    if (warningCount > 0) {
                        message += ` and ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
                    }
                    message += ` found. Check the Problems Panel!`;
                } else {
                    // If we have warnings but no errors (unusual for a failed build)
                    if (warningCount > 0) {
                        message += `${warningCount} warning${warningCount !== 1 ? 's' : ''} found. Check the Problems Panel!`;
                    } else {
                        // Generic error message if no specific errors or warnings were detected
                        message += `Check the Problems Panel for details.`;
                    }
                }
                
                window.showErrorMessage(message);
            }
        }

        // Delete the temporary log file after processing
        fs.unlink(buildLogPath, (unlinkErr) => {
            if (unlinkErr) {
                logger.info("Failed to delete build log:", unlinkErr);
            } else {
                logger.info("Deleted temporary build log");
            }
        });
    });

    if (event.exitCode === 0) {
        // Show success message with target details
        const successMessage = buildTarget === "Solution"
            ? `✅ Building Clarion Solution Complete: ${targetName}`
            : `✅ Building Clarion Project Complete: ${targetName}.cwproj`;
            
        window.showInformationMessage(successMessage);
    }
    // Note: We don't show a generic error message here anymore
    // The error message with error count is now shown in the file processing section above
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
