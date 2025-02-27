import { workspace, window, tasks, Task, ShellExecution, TaskScope, TaskProcessEndEvent, TaskRevealKind, TaskPanelKind } from "vscode";
import { globalSolutionFile, globalSettings } from "./globals";
import * as path from "path";
import * as fs from "fs";
import logger from "./logger";
import processBuildErrors from "./processBuildErrors";

export async function runClarionBuild() {
    if (!workspace.isTrusted) {
        window.showWarningMessage("Clarion features require a trusted workspace.");
        return;
    }

    if (!globalSolutionFile || !globalSettings.redirectionPath) {
        window.showErrorMessage("❌ Cannot build: Missing solution file or Clarion redirection path.");
        return;
    }

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
        `/property:SolutionDir="${globalSolutionFile}"`,
        `/property:ClarionBinPath="${clarionBinPath}"`,
        "/property:NoDependency=true",
        "/property:Verbosity=detailed",
        "/property:WarningLevel=5"
    ];

    // ✅ Suppress terminal output by redirecting all to file
    const execution = new ShellExecution(`${msBuildPath} ${buildArgs.join(" ")} > "${buildLogPath}" 2>&1`, { cwd: solutionDir });

    const task = new Task(
        { type: "shell" },
        TaskScope.Workspace,
        "Clarion Build",
        "msbuild",
        execution,
        "clarionBuildMatcher"
    );

    // ✅ Hides terminal popup (PresentationOptions)
    task.presentationOptions = {
        reveal: TaskRevealKind.Never, // ✅ Correct
        echo: false, // Prevents command echo
        focus: false,
        panel: TaskPanelKind.Dedicated // ✅ Correct
    };

    try {
        window.showInformationMessage("🔄 Clarion Build Started...");

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
