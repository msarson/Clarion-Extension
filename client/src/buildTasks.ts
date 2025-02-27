import { workspace, window, tasks, Task, ShellExecution, TaskScope, TaskProcessEndEvent, TaskRevealKind, TaskPanelKind, TextEditor } from "vscode";
import { globalSolutionFile, globalSettings } from "./globals";
import * as path from "path";
import * as fs from "fs";
import logger from "./logger";
import processBuildErrors from "./processBuildErrors";
import { SolutionParser } from "./Parser/SolutionParser";


export async function runClarionBuild() {
    if (!workspace.isTrusted) {
        window.showWarningMessage("Clarion features require a trusted workspace.");
        return;
    }

    if (!globalSolutionFile || !globalSettings.redirectionPath) {
        window.showErrorMessage("❌ Cannot build: Missing solution file or Clarion redirection path.");
        return;
    }

    // ✅ Load the solution parser
    const solutionParser = await SolutionParser.create(globalSolutionFile);
    
    if (solutionParser.solution.projects.length === 0) {
        window.showErrorMessage("❌ No projects found in the solution.");
        return;
    }

    let buildTarget = "Solution"; // Default to full solution build
    let selectedProjectPath = "";

    if (solutionParser.solution.projects.length > 1) {
        // ✅ Determine the project for the currently focused document
        const activeEditor: TextEditor | undefined = window.activeTextEditor;
        let currentProject = undefined;
        
        if (activeEditor) {
            const activeFilePath = activeEditor.document.uri.fsPath;
            const activeFileName = path.basename(activeFilePath); // ✅ Extract just the filename
        
            currentProject = solutionParser.findProjectForFile(activeFileName); // ✅ Use filename instead of full path
        }

        let buildOptions = ["Build Full Solution"];

        if (currentProject) {
            buildOptions.push(`Build Current Project: ${currentProject.name}`);
            selectedProjectPath = currentProject.path;
        }

        buildOptions.push("Cancel");

        // ✅ Ask the user which build target to use
        const selectedOption = await window.showQuickPick(buildOptions, {
            placeHolder: "Select a build target",
        });

        if (!selectedOption || selectedOption === "Cancel") {
            window.showInformationMessage("⏹ Build cancelled.");
            return;
        }

        if (selectedOption.startsWith("Build Current Project")) {
            buildTarget = "Project";
        }
    }

    // ✅ Define build parameters
    const solutionDir = path.dirname(globalSolutionFile);
    const clarionBinPath = globalSettings.redirectionPath.replace(/redirection.*/i, "bin");
    const msBuildPath = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe";
    const buildLogPath = path.join(solutionDir, "build_output.log");

    // ✅ Adjust MSBuild arguments based on selection
    let buildArgs: string[] = [
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

    if (buildTarget === "Solution") {
        buildArgs.push(`/property:SolutionDir="${globalSolutionFile}"`);
    } else if (buildTarget === "Project") {
        buildArgs.push(`/property:ProjectPath="${selectedProjectPath}"`);
    }

    // ✅ Suppress terminal output by redirecting to file
    const execution = new ShellExecution(`${msBuildPath} ${buildArgs.join(" ")} > "${buildLogPath}" 2>&1`, { cwd: solutionDir });

    const task = new Task(
        { type: "shell" },
        TaskScope.Workspace,
        "Clarion Build",
        "msbuild",
        execution,
        "clarionBuildMatcher"
    );

    // ✅ Hide terminal output
    task.presentationOptions = {
        reveal: TaskRevealKind.Never,
        echo: false,
        focus: false,
        panel: TaskPanelKind.Dedicated
    };

    try {
        window.showInformationMessage(`🔄 ${buildTarget === "Solution" ? "Building Full Solution" : `Building Project: ${selectedProjectPath}`}...`);

        const disposable = tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
            if (event.execution.task.name === "Clarion Build") {
                fs.readFile(buildLogPath, "utf8", (err, data) => {
                    if (err) {
                        logger.error("❌ Error reading build log:", err);
                    } else {
                        logger.info("📄 Captured Build Output:");
                        logger.warn(data);
                        processBuildErrors(data);
                    }

                    // ✅ Delete the temporary log file after processing
                    fs.unlink(buildLogPath, (unlinkErr) => {
                        if (unlinkErr) {
                            logger.warn("⚠️ Failed to delete build log:", unlinkErr);
                        } else {
                            logger.info("🗑️ Deleted temporary build log.");
                        }
                    });
                });

                if (event.exitCode === 0) {
                    window.showInformationMessage("✅ Clarion Build Complete. No Errors Detected!");
                } else {
                    window.showErrorMessage("❌ Build Failed. Check the Problems Panel!");
                }

                disposable.dispose();
            }
        });

        await tasks.executeTask(task);
    } catch (error) {
        window.showErrorMessage("❌ Failed to start Clarion build task.");
        logger.error("❌ Clarion Build Task Error:", error);
    }
}
