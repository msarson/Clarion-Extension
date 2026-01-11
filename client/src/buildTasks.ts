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
import LoggerManager from './utils/LoggerManager';
import { PlatformUtils } from "./platformUtils";
import { SolutionCache } from "./SolutionCache";
import { ProjectDependencyResolver } from "./utils/ProjectDependencyResolver";
import { ClarionProjectInfo } from "../../common/types";
const logger = LoggerManager.getLogger("BuildTasks");
logger.setLevel("error"); // Production: Only log errors
/**
 * Main entry point for the Clarion build process
 */
export async function runClarionBuild(
    diagnosticCollection?: DiagnosticCollection,
    solutionTreeDataProvider?: any
) {
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

    // ✅ Ensure we have a diagnostic collection for this extension
    const diagCollection = diagnosticCollection || languages.createDiagnosticCollection("clarion");

    // If building full solution, use dependency-aware build
    if (buildConfig.buildTarget === "Solution") {
        // Auto-switch to build order
        if (solutionTreeDataProvider && solutionTreeDataProvider.getApplicationSortOrder() === 'solution') {
            await solutionTreeDataProvider.toggleApplicationSortOrder();
        }
        
        await buildSolutionWithDependencyOrder(diagCollection, solutionTreeDataProvider);
        return;
    }

    // Prepare build task parameters for project build
    const buildParams = prepareBuildParameters(buildConfig);

    // Execute the build task with diagnostics
    await executeBuildTask({
        ...buildParams,
        diagnosticCollection: diagCollection,   // ✅ pass through
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
    
    logger.info(`🔍 Finding projects for file: ${activeFilePath}`);

    // Search through all projects to find which contain this file
    const matchingProjects: ClarionProjectInfo[] = [];
    
    for (const proj of solutionInfo.projects) {
        logger.info(`  Checking project: ${proj.name} (${proj.sourceFiles?.length || 0} files)`);
        
        if (proj.sourceFiles && proj.sourceFiles.length > 0) {
            for (const file of proj.sourceFiles) {
                // Resolve the file path
                let filePath = file.absolutePath;
                if (!filePath && file.relativePath) {
                    // Use project.path (directory) + filename to get full path
                    if (proj.filename) {
                        filePath = path.join(proj.path, file.relativePath);
                    } else {
                        filePath = path.join(proj.path, file.relativePath);
                    }
                }
                
                if (filePath) {
                    const normalizedFilePath = path.normalize(filePath).toLowerCase();
                    const normalizedActivePath = path.normalize(activeFilePath).toLowerCase();
                    
                    if (normalizedFilePath === normalizedActivePath) {
                        logger.info(`  ✅ Found match in project: ${proj.name}`);
                        matchingProjects.push(proj);
                        break;
                    }
                }
            }
        }
    }

    if (matchingProjects.length > 0) {
        logger.info(`✅ Found ${matchingProjects.length} projects for file ${activeFileName}`);
        return matchingProjects;
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
    let buildLogPath: string;
    if (customLogPath) {
        // If custom path is provided, resolve it relative to solution directory if not absolute
        buildLogPath = path.isAbsolute(customLogPath) ? customLogPath : path.join(solutionDir, customLogPath);
    } else {
        // Default to solution directory
        buildLogPath = path.join(solutionDir, "build_output.log");
    }

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
    
    logger.info(`🔍 Reading configuration from globalSettings: ${selectedConfig}`);
    logger.info(`🔍 globalSettings.configuration value: ${globalSettings.configuration}`);
    
    // Split configuration into configuration and platform parts for MSBuild
    // MSBuild expects /p:Configuration=Debug /p:Platform=Win32, not /p:Configuration=Debug|Win32
    let configPart = selectedConfig;
    let platformPart = "";
    
    if (selectedConfig.includes('|')) {
        const parts = selectedConfig.split('|');
        configPart = parts[0];
        platformPart = parts[1];
    }

    const buildArgs = [
        "/property:GenerateFullPaths=true",
        "/t:build",
        `/property:Configuration=${configPart}`,
        `/property:clarion_Sections=${configPart}`,
        `/property:ClarionBinPath="${clarionBinPath}"`,
        "/property:NoDependency=true",
        "/verbosity:normal",
        "/nologo",
        "/fileLogger",
        `/fileLoggerParameters:LogFile="${buildLogPath}",verbosity=detailed,encoding=utf-8`
    ];
    
    // Add platform property if we have one
    if (platformPart) {
        buildArgs.splice(3, 0, `/property:Platform=${platformPart}`);
    }

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

    // Create the shell execution
    const commandLine = `${msBuildPath} ${buildArgs.join(' ')}`;
    logger.info(`✅ Executing build task: ${commandLine}`);
    
    const execution = new ShellExecution(
        commandLine,
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
        panel: TaskPanelKind.Shared,  // Reuse the same terminal
        clear: true                     // Clear terminal before each run
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
            
            // Show completion message even if log file is missing
            if (event.exitCode === 0) {
                diagnosticCollection.clear();
                const successMessage =
                    buildTarget === "Solution"
                        ? `✅ Building Clarion Solution Complete: ${targetName}`
                        : `✅ Building Clarion Project Complete: ${targetName}`;
                window.showInformationMessage(successMessage);
            } else {
                const failureMessage =
                    buildTarget === "Solution"
                        ? `❌ Build Failed (Solution: ${targetName}) - Check terminal output for details`
                        : `❌ Build Failed (Project: ${targetName}) - Check terminal output for details`;
                window.showErrorMessage(failureMessage);
            }
            return; // Exit early since we don't have log data
        }
        
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
            // ❌ Non-zero exit code: parse diagnostics to check for actual errors
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

            // Only show error message if we actually found errors or warnings
            if (totalErrors > 0 || warningCount > 0) {
                let message = `❌ Build Failed (${targetInfo}): `;

                if (totalErrors > 0) {
                    message += `${totalErrors} error${totalErrors !== 1 ? "s" : ""}`;
                    if (warningCount > 0) {
                        message += ` and ${warningCount} warning${warningCount !== 1 ? "s" : ""}`;
                    }
                    message += ` found. Check the Problems Panel!`;
                } else if (warningCount > 0) {
                    message += `${warningCount} warning${warningCount !== 1 ? "s" : ""} found. Check the Problems Panel!`;
                }

                window.showErrorMessage(message);
            } else {
                // Exit code was non-zero but no errors/warnings found
                // This can happen with some MSBuild configurations - treat as success
                logger.info("⚠️ Build returned non-zero exit code but no errors were found. Treating as successful build.");
                diagnosticCollection.clear();
                
                const successMessage =
                    buildTarget === "Solution"
                        ? `✅ Building Clarion Solution Complete: ${targetName}`
                        : `✅ Building Clarion Project Complete: ${targetName}`;
                window.showInformationMessage(successMessage);
            }
        } else {
            // ✅ Success: clear old diagnostics
            diagnosticCollection.clear();

            const successMessage =
                buildTarget === "Solution"
                    ? `✅ Building Clarion Solution Complete: ${targetName}`
                    : `✅ Building Clarion Project Complete: ${targetName}`;
            window.showInformationMessage(successMessage);
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
 * Builds the solution with proper dependency order
 * @param diagnosticCollection - The diagnostic collection to use for error reporting
 * @param solutionTreeDataProvider - Optional solution tree provider
 */
export async function buildSolutionWithDependencyOrder(
    diagnosticCollection: DiagnosticCollection,
    solutionTreeDataProvider?: any
): Promise<void> {
    if (!validateBuildEnvironment()) {
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        if (solutionTreeDataProvider) {
            await solutionTreeDataProvider.refresh();
        }
        window.showInformationMessage(
            "No solution is currently open. Use the 'Open Solution' button in the Solution View."
        );
        return;
    }

    try {
        // Initialize dependency resolver
        const solutionDir = path.dirname(globalSolutionFile);
        const resolver = new ProjectDependencyResolver(solutionDir, solutionInfo.projects);
        
        // Analyze dependencies
        window.showInformationMessage('Analyzing project dependencies...');
        await resolver.analyzeDependencies();
        
        // Get build order
        const buildOrder = resolver.getBuildOrder();
        
        // Log dependency summary
        logger.info(resolver.getDependencySummary());
        
        window.showInformationMessage(`Building ${buildOrder.length} projects in dependency order...`);
        
        // Build each project in order
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < buildOrder.length; i++) {
            const project = buildOrder[i];
            try {
                logger.info(`Building project: ${project.name}`);
                window.showInformationMessage(`Building: ${project.name}`);
                
                // Notify tree provider of build progress
                if (solutionTreeDataProvider) {
                    solutionTreeDataProvider.setCurrentlyBuildingProject(project.name);
                    solutionTreeDataProvider.setBuildProgress(i + 1, buildOrder.length);
                }
                
                const buildConfig = {
                    buildTarget: "Project" as const,
                    selectedProjectPath: project.path,
                    projectObject: project
                };
                
                const buildParams = {
                    ...prepareBuildParameters(buildConfig),
                    diagnosticCollection
                };
                
                // Execute the build synchronously
                await executeBuildTaskSync(buildParams);
                successCount++;
                
                // Clear building status for this project
                if (solutionTreeDataProvider) {
                    solutionTreeDataProvider.setCurrentlyBuildingProject(null);
                }
                
            } catch (error) {
                // Clear building status on error
                if (solutionTreeDataProvider) {
                    solutionTreeDataProvider.setCurrentlyBuildingProject(null);
                    solutionTreeDataProvider.clearBuildProgress();
                }
                
                failCount++;
                logger.error(`Failed to build project ${project.name}: ${error}`);
                window.showErrorMessage(`Build failed for ${project.name}. Stopping build.`);
                break; // Stop on first error
            }
        }
        
        // Clear build progress when done
        if (solutionTreeDataProvider) {
            solutionTreeDataProvider.clearBuildProgress();
        }
        
        // Show final status
        if (failCount === 0) {
            window.showInformationMessage(`✅ Solution build complete: ${successCount} projects built successfully`);
        } else {
            window.showWarningMessage(`Solution build stopped: ${successCount} succeeded, ${failCount} failed`);
        }
        
    } catch (error) {
        logger.error(`Solution build failed: ${error}`);
        window.showErrorMessage(`Solution build failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Executes a build task synchronously (waits for completion)
 */
async function executeBuildTaskSync(params: {
    solutionDir: string;
    msBuildPath: string;
    buildArgs: string[];
    buildLogPath: string;
    buildTarget: "Solution" | "Project";
    targetName: string;
    diagnosticCollection: DiagnosticCollection;
}): Promise<void> {
    const { solutionDir, msBuildPath, buildArgs, buildLogPath, buildTarget, targetName, diagnosticCollection } = params;

    return new Promise((resolve, reject) => {
        const commandLine = `${msBuildPath} ${buildArgs.join(' ')}`;
        logger.info(`Executing: ${commandLine}`);
        
        const execution = new ShellExecution(commandLine, { cwd: solutionDir });
        const task = createBuildTask(execution);

        let taskExecution: any;
        const disposable = tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
            if (event.execution === taskExecution) {
                disposable.dispose();
                
                // Read and process the build log
                fs.readFile(buildLogPath, "utf8", (err, data) => {
                    if (err) {
                        logger.error(`Error reading build log: ${err}`);
                        if (event.exitCode === 0) {
                            resolve();
                        } else {
                            reject(new Error(`Build failed with exit code ${event.exitCode}`));
                        }
                        return;
                    }
                    
                    if (event.exitCode !== 0) {
                        const { errorCount, warningCount, diagnostics } = processBuildErrors(data);
                        diagnosticCollection.clear();
                        diagnostics.forEach((arr, file) =>
                            diagnosticCollection.set(Uri.file(file), arr)
                        );
                        
                        if (errorCount > 0) {
                            reject(new Error(`Build failed: ${errorCount} error(s), ${warningCount} warning(s)`));
                        } else {
                            // No actual errors found, treat as success
                            diagnosticCollection.clear();
                            resolve();
                        }
                    } else {
                        diagnosticCollection.clear();
                        resolve();
                    }
                    
                    // Clean up log file unless preserve is enabled
                    const preserveLogFile = workspace.getConfiguration("clarion.build").get<boolean>("preserveLogFile", false);
                    if (!preserveLogFile) {
                        fs.unlink(buildLogPath, () => {});
                    }
                });
            }
        });

        tasks.executeTask(task).then(execution => {
            taskExecution = execution;
        }, error => {
            disposable.dispose();
            reject(error);
        });
    });
}

/**
 * Builds the solution or a specific project
 * @param buildTarget - Whether to build the solution or a project
 * @param project - The project to build (if buildTarget is "Project")
 * @param diagnosticCollection - The diagnostic collection to use for error reporting
 * @param solutionTreeDataProvider - Optional solution tree provider to refresh if no solution is open
 */
export async function buildSolutionOrProject(
    buildTarget: "Solution" | "Project",
    project: ClarionProjectInfo | undefined,
    diagnosticCollection: DiagnosticCollection,
    solutionTreeDataProvider?: any
): Promise<void> {
    const buildConfig = {
        buildTarget,
        selectedProjectPath: project?.path ?? "",
        projectObject: project
    };

    if (!validateBuildEnvironment()) {
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        if (solutionTreeDataProvider) {
            await solutionTreeDataProvider.refresh();
        }
        window.showInformationMessage(
            "No solution is currently open. Use the 'Open Solution' button in the Solution View."
        );
        return;
    }

    const buildParams = {
        ...prepareBuildParameters(buildConfig),
        diagnosticCollection
    };

    await executeBuildTask(buildParams);
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
