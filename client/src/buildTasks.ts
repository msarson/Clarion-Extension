import { workspace, window, tasks, Task, ShellExecution, TaskScope, TaskProcessEndEvent, TaskRevealKind, TaskPanelKind, TextEditor } from "vscode";
import { globalSolutionFile, globalSettings } from "./globals";
import * as path from "path";
import * as fs from "fs";
import processBuildErrors from "./processBuildErrors";
import { SolutionParser } from "./Parser/SolutionParser";
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("BuildTasks");
/**
 * Main entry point for the Clarion build process
 */
export async function runClarionBuild() {
    if (!validateBuildEnvironment()) {
        return;
    }

    // Load the solution parser
    const solutionParser = await loadSolutionParser();
    if (!solutionParser) {
        return;
    }

    // Determine what to build
    const buildConfig = await determineBuildTarget(solutionParser);
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
function validateBuildEnvironment(): boolean {
    if (!workspace.isTrusted) {
        window.showWarningMessage("Clarion features require a trusted workspace.");
        return false;
    }

    if (!globalSolutionFile || !globalSettings.redirectionPath) {
        window.showErrorMessage("❌ Cannot build: Missing solution file or Clarion redirection path.");
        return false;
    }

    return true;
}

/**
 * Loads the solution parser
 */
async function loadSolutionParser(): Promise<SolutionParser | null> {
    try {
        const solutionParser = await SolutionParser.create(globalSolutionFile);
        
        if (solutionParser.solution.projects.length === 0) {
            window.showErrorMessage("❌ No projects found in the solution.");
            return null;
        }
        
        return solutionParser;
    } catch (error) {
        window.showErrorMessage(`❌ Failed to parse solution file: ${error}`);
        return null;
    }
}

/**
 * Determines what to build (full solution or specific project)
 */
async function determineBuildTarget(solutionParser: SolutionParser): Promise<{
    buildTarget: "Solution" | "Project";
    selectedProjectPath: string;
} | null> {
    let buildTarget: "Solution" | "Project" = "Solution";
    let selectedProjectPath = "";

    if (solutionParser.solution.projects.length <= 1) {
        // Only one project, use solution build
        return { buildTarget, selectedProjectPath };
    }

    // Try to find the project for the active file
    const currentProject = findCurrentProject(solutionParser);
    if (currentProject) {
        selectedProjectPath = currentProject.path;
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

    return { buildTarget, selectedProjectPath };
}

/**
 * Finds the project that contains the file in the active editor
 */
function findCurrentProject(solutionParser: SolutionParser) {
    const activeEditor: TextEditor | undefined = window.activeTextEditor;
    
    if (!activeEditor) {
        return undefined;
    }
    
    const activeFilePath = activeEditor.document.uri.fsPath;
    const activeFileName = path.basename(activeFilePath);
    
    return solutionParser.findProjectForFile(activeFileName);
}

/**
 * Prepares build parameters
 */
function prepareBuildParameters(buildConfig: {
    buildTarget: "Solution" | "Project";
    selectedProjectPath: string;
}): {
    solutionDir: string;
    msBuildPath: string;
    buildArgs: string[];
    buildLogPath: string;
} {
    const solutionDir = path.dirname(globalSolutionFile);
    const clarionBinPath = globalSettings.redirectionPath.replace(/redirection.*/i, "bin");
    const msBuildPath = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe";
    const buildLogPath = path.join(solutionDir, "build_output.log");

    const buildArgs = [
        "/property:GenerateFullPaths=true",
        "/t:build",
        "/m",
        "/consoleloggerparameters:ErrorsOnly",
        "/property:Configuration=Debug",
        "/property:clarion_Sections=Debug",
        `/property:ClarionBinPath="${clarionBinPath}"`,
        "/property:NoDependency=true",
        "/property:Verbosity=detailed",
        "/property:WarningLevel=5"
    ];

    if (buildConfig.buildTarget === "Solution") {
        buildArgs.push(`/property:SolutionDir="${globalSolutionFile}"`);
    } else if (buildConfig.buildTarget === "Project") {
        buildArgs.push(`/property:ProjectPath="${buildConfig.selectedProjectPath}"`);
    }

    return { solutionDir, msBuildPath, buildArgs, buildLogPath };
}

/**
 * Executes the build task and processes results
 */
async function executeBuildTask(params: {
    solutionDir: string;
    msBuildPath: string;
    buildArgs: string[];
    buildLogPath: string;
}): Promise<void> {
    const { solutionDir, msBuildPath, buildArgs, buildLogPath } = params;
    
    // Create the shell execution
    const execution = new ShellExecution(
        `${msBuildPath} ${buildArgs.join(" ")} > "${buildLogPath}" 2>&1`, 
        { cwd: solutionDir }
    );

    // Create the task
    const task = createBuildTask(execution);

    try {
        window.showInformationMessage("🔄 Building Clarion project...");

        const disposable = setupBuildCompletionHandler(buildLogPath);

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

    // Hide terminal output
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
function setupBuildCompletionHandler(buildLogPath: string) {
    return tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
        if (event.execution.task.name === "Clarion Build") {
            processTaskCompletion(event, buildLogPath);
        }
    });
}

/**
 * Processes the task completion, reads log file, and shows results
 */
function processTaskCompletion(event: TaskProcessEndEvent, buildLogPath: string) {
    fs.readFile(buildLogPath, "utf8", (err, data) => {
        if (err) {
            logger.info("Error reading build log:", err);
        } else {
            logger.info("Captured Build Output");
            logger.info(data);
            processBuildErrors(data);
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
        window.showInformationMessage("✅ Clarion Build Complete. No Errors Detected!");
    } else {
        window.showErrorMessage("❌ Build Failed. Check the Problems Panel!");
    }
}
