import { commands, window, Disposable, Terminal, Uri, workspace, languages } from 'vscode';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { ClarionProjectInfo } from 'common/types';
import { getLanguageClient } from '../LanguageClientManager';
import { redirectionService } from '../paths/RedirectionService';
import { globalSettings, globalSolutionFile, globalClarionPropertiesFile } from '../globals';
import { buildSolutionOrProject } from '../buildTasks';
import { writeIdePreferences } from '../solution/ClarionIdePreferences';
import { updateSolutionToolbar } from '../views/ViewManager';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("RunCommands");
logger.setLevel("error");

interface ProjectOutputInfo {
    outputType: string;
    outputName: string;
    configuration: string;
    projectDir: string;
    isNativeExe: boolean;       // true = WinExe/Exe; false = library with external StartProgram
    startProgram?: string;
    startWorkingDirectory?: string;
    startArguments?: string;
}

/**
 * Extracts output information from a .cwproj file
 * @param cwprojPath - Path to the .cwproj file
 * @returns Project output information or undefined if not an executable project
 */
function extractProjectOutputInfo(cwprojPath: string): ProjectOutputInfo | undefined {
    try {
        if (!fs.existsSync(cwprojPath)) {
            logger.error(`Project file not found: ${cwprojPath}`);
            return undefined;
        }

        const content = fs.readFileSync(cwprojPath, 'utf8');
        const projectDir = path.dirname(cwprojPath);

        // Active config from settings e.g. "Debug|Win32" → base name "Debug"
        const activeFullConfig = globalSettings.configuration || 'Debug';
        const activeConfigName = activeFullConfig.split('|')[0].trim();

        const propertyGroupRegex = /<PropertyGroup(\b[^>]*)>([\s\S]*?)<\/PropertyGroup>/gi;
        const properties = new Map<string, string>();

        let propertyGroupMatch;
        while ((propertyGroupMatch = propertyGroupRegex.exec(content)) !== null) {
            const groupAttrs = propertyGroupMatch[1];
            const groupBody = propertyGroupMatch[2];

            // Evaluate the Condition attribute if present
            const conditionAttr = groupAttrs.match(/Condition\s*=\s*"([^"]*)"/i)?.[1] ?? '';
            if (conditionAttr) {
                const rhsMatch = conditionAttr.match(/==\s*'([^']*)'/i);
                if (rhsMatch) {
                    const rhs = rhsMatch[1];
                    const rhsLower = rhs.toLowerCase();
                    // Accept if RHS matches full config ("Debug|Win32") or just config name ("Debug")
                    if (rhsLower !== activeFullConfig.toLowerCase() && rhsLower !== activeConfigName.toLowerCase()) {
                        continue;
                    }
                } else {
                    // Condition exists but no == comparison we can evaluate — skip
                    continue;
                }
            }

            const propertyRegex = /<([^>\s]+)>([^<]+)<\/\1>/g;
            let propertyMatch;
            while ((propertyMatch = propertyRegex.exec(groupBody)) !== null) {
                properties.set(propertyMatch[1].toLowerCase(), propertyMatch[2].trim());
            }
        }

        const outputType = properties.get('outputtype') || '';
        const outputName = properties.get('outputname') || properties.get('assemblyname') || '';
        const startProgram = properties.get('startprogram') || '';
        const startWorkingDirectory = properties.get('startworkingdirectory') || '';
        const startArguments = properties.get('startarguments') || '';

        const outputTypeLower = outputType.toLowerCase();
        const isNativeExe = (outputTypeLower === 'exe' || outputTypeLower === 'winexe') && outputName.length > 0;

        // Allow non-exe projects only if they have an explicit StartProgram (external exe)
        if (!isNativeExe && !startProgram) {
            logger.info(`Project is not executable and has no StartProgram: OutputType=${outputType}`);
            return undefined;
        }

        return {
            outputType,
            outputName,
            configuration: activeConfigName,
            projectDir,
            isNativeExe,
            startProgram: startProgram || undefined,
            startWorkingDirectory: startWorkingDirectory || undefined,
            startArguments: startArguments || undefined,
        };
    } catch (error) {
        logger.error(`Error extracting project output info: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Finds the executable file for a project
 * @param outputInfo - Project output information
 * @returns Path to the executable or undefined if not found
 */
function findExecutable(outputInfo: ProjectOutputInfo): string | undefined {
    const { outputName, projectDir, startProgram, isNativeExe } = outputInfo;

    // StartProgram is always the most explicit — relative to project dir
    if (startProgram) {
        const startProgramPath = path.isAbsolute(startProgram)
            ? startProgram
            : path.resolve(projectDir, startProgram);
        if (fs.existsSync(startProgramPath)) {
            logger.info(`✅ Found executable via StartProgram: ${startProgramPath}`);
            return startProgramPath;
        }
        logger.warn(`⚠️ StartProgram path does not exist: ${startProgramPath}`);
        // For non-native-exe projects StartProgram is the only option
        if (!isNativeExe) return undefined;
    }

    // Only look for .exe files by name for native exe projects
    const exeName = outputName.toLowerCase().endsWith('.exe') ? outputName : `${outputName}.exe`;
    logger.info(`Looking for executable: ${exeName} in project: ${projectDir}`);

    // Try redirection service — *.exe entries are relative to project dir
    try {
        const resolver = redirectionService.getResolver(projectDir);
        const resolved = resolver(exeName);
        if (resolved) {
            const absoluteResolved = path.isAbsolute(resolved)
                ? resolved
                : path.resolve(projectDir, resolved);
            if (fs.existsSync(absoluteResolved)) {
                logger.info(`✅ Found executable via redirection: ${absoluteResolved}`);
                return absoluteResolved;
            }
        }
    } catch (error) {
        logger.warn(`Redirection resolution failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Fallback: common locations relative to project dir
    for (const p of [
        path.join(projectDir, exeName),
        path.join(projectDir, 'working', exeName),
        path.join(projectDir, 'bin', exeName),
    ]) {
        if (fs.existsSync(p)) {
            logger.info(`✅ Found executable: ${p}`);
            return p;
        }
    }

    logger.warn(`❌ Executable not found in project dir or common subdirectories`);
    return undefined;
}

/**
 * Runs an executable in a VS Code terminal
 * @param exePath - Path to the executable
 */
function runExecutable(exePath: string, workingDir?: string, args?: string): void {
    const exeName = path.basename(exePath);
    const cwd = workingDir ?? path.dirname(exePath);
    const terminal: Terminal = window.createTerminal({ name: `Run: ${exeName}`, cwd });
    terminal.show();
    // Use & call operator so PowerShell doesn't misparse arguments like /debug as division
    const cmd = args?.trim() ? `& "${exePath}" ${args.trim()}` : `& "${exePath}"`;
    terminal.sendText(cmd);
}

/**
 * Finds the Clarion debugger executable (CladbNE.exe) from the Clarion bin folder
 */
function findDebuggerExecutable(): string | undefined {
    const redirectionPath = globalSettings.redirectionPath;
    if (!redirectionPath) {
        logger.warn("⚠️ Clarion redirectionPath not set — cannot locate debugger");
        return undefined;
    }

    const clarionBinPath = redirectionPath.replace(/redirection.*/i, "bin");
    const debuggerPath = path.join(clarionBinPath, "CladbNE.exe");

    if (fs.existsSync(debuggerPath)) {
        logger.info(`✅ Found debugger: ${debuggerPath}`);
        return debuggerPath;
    }

    logger.warn(`❌ CladbNE.exe not found at: ${debuggerPath}`);
    return undefined;
}

/**
 * Launches CladbNE.exe with the given program path (detached, no terminal).
 * Explicitly passes the project's redirection file so the debugger can locate
 * source files regardless of where the exe lives.
 */
function launchDebugger(debuggerPath: string, exePath: string, projectDir: string, workingDir?: string, args?: string): void {
    const cwd = workingDir ?? path.dirname(exePath);

    // Only pass a redirection file if a project-local one exists;
    // CladbNE already knows the standard global .red by default
    const redFileName = globalSettings.redirectionFile;
    const projectRedFile = redFileName ? path.join(projectDir, redFileName) : undefined;
    const redArg = (projectRedFile && fs.existsSync(projectRedFile)) ? projectRedFile : undefined;

    const spawnArgs: string[] = [];
    if (redArg) spawnArgs.push(redArg);
    spawnArgs.push(exePath);
    if (args?.trim()) spawnArgs.push(...args.trim().split(/\s+/));

    logger.info(`🐛 Launching debugger: ${debuggerPath} ${spawnArgs.join(' ')} (cwd: ${cwd})`);
    const proc = spawn(debuggerPath, spawnArgs, { cwd, detached: true, stdio: 'ignore' });
    proc.unref();
}


/**
 * Registers all run-related commands
 * @param solutionTreeDataProvider - Solution tree provider to refresh after setting startup project
 * @returns Array of disposables for the registered commands
 */
export function registerRunCommands(solutionTreeDataProvider?: SolutionTreeDataProvider): Disposable[] {
    return [
        commands.registerCommand('clarion.setStartupProject', async (node) => {
            logger.info("📌 Setting startup project...");
            
            if (!node || !node.data || !node.data.guid) {
                window.showErrorMessage("Invalid project selection.");
                return;
            }
            
            const projectGuid = node.data.guid;
            const projectName = node.data.name;
            const projectFilename = node.data.filename;
            
            logger.info(`Setting startup project: ${projectName} (${projectGuid})`);
            logger.info(`Project path: ${node.data.path}`);
            logger.info(`Project filename: ${projectFilename}`);
            
            // Check if this is an executable project
            const projectPath = node.data.path;
            let cwprojPath: string;
            
            // Use the filename from project data to get the exact cwproj file
            if (projectFilename) {
                cwprojPath = path.join(projectPath, projectFilename);
            } else {
                // Fallback: search for .cwproj in directory
                if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
                    const files = fs.readdirSync(projectPath);
                    const cwprojFile = files.find(f => f.toLowerCase().endsWith('.cwproj'));
                    if (!cwprojFile) {
                        window.showErrorMessage(`No .cwproj file found for project "${projectName}".`);
                        return;
                    }
                    cwprojPath = path.join(projectPath, cwprojFile);
                } else {
                    window.showErrorMessage(`Project directory not found: ${projectPath}`);
                    return;
                }
            }
            
            logger.info(`Checking project file: ${cwprojPath}`);
            
            if (!fs.existsSync(cwprojPath)) {
                window.showErrorMessage(`Project file not found: ${cwprojPath}`);
                return;
            }
            
            const outputInfo = extractProjectOutputInfo(cwprojPath);
            
            if (!outputInfo) {
                try {
                    const content = fs.readFileSync(cwprojPath, 'utf8');
                    const outputTypeMatch = /<OutputType>([^<]+)<\/OutputType>/i.exec(content);
                    const outputType = outputTypeMatch ? outputTypeMatch[1] : 'unknown';
                    window.showWarningMessage(
                        `'${projectName}' cannot be set as startup project — it is a library project (OutputType: ${outputType}) with no external StartProgram configured. ` +
                        `Only executable projects (WinExe/Exe) or library projects with a <StartProgram> entry can be startup projects.`
                    );
                } catch {
                    window.showWarningMessage(`'${projectName}' is not an executable project and cannot be set as startup project.`);
                }
                return;
            }

            if (!outputInfo.isNativeExe) {
                window.showInformationMessage(
                    `'${projectName}' is a library project, but has an external StartProgram configured: ${outputInfo.startProgram}. ` +
                    `It will be set as startup project and that program will be launched.`
                );
            }
            
            // Save to workspace configuration
            const config = workspace.getConfiguration('clarion');
            await config.update('startupProject', projectGuid, false);
            
            // Write-back to Clarion IDE preferences so the IDE stays in sync
            if (globalSolutionFile && globalClarionPropertiesFile) {
                await writeIdePreferences(globalSolutionFile, globalClarionPropertiesFile, {
                    startupProjectGuid: projectGuid
                });
            }
            
            logger.info(`✅ Set ${projectName} (${projectGuid}) as startup project`);
            window.showInformationMessage(`${projectName} set as startup project.`);
            
            // Refresh the tree to show the visual indicator
            if (solutionTreeDataProvider) {
                await solutionTreeDataProvider.refresh();
            }
            updateSolutionToolbar();
        }),
        
        commands.registerCommand('clarion.clearStartupProject', async () => {
            logger.info("🗑️ Clearing startup project...");
            
            const config = workspace.getConfiguration('clarion');
            await config.update('startupProject', undefined, false);
            
            logger.info(`✅ Cleared startup project`);
            window.showInformationMessage("Startup project cleared.");
            
            // Refresh the tree to remove the visual indicator
            if (solutionTreeDataProvider) {
                await solutionTreeDataProvider.refresh();
            }
            updateSolutionToolbar();
        }),
        
        commands.registerCommand('clarion.runWithoutDebugging', async (buildFirst?: boolean) => {
            logger.info("🚀 Running current project without debugging...");
            
            const activeEditor = window.activeTextEditor;
            if (!activeEditor) {
                window.showWarningMessage("No active file. Please open a file to run its project.");
                return;
            }
            
            const filePath = activeEditor.document.uri.fsPath;
            logger.info(`📄 Current file path: ${filePath}`);
            
            const solutionCache = SolutionCache.getInstance();
            
            // Check if solution is loaded
            if (!solutionCache.getSolutionInfo()) {
                window.showWarningMessage("No solution is currently loaded.");
                return;
            }
            
            logger.info(`🔍 Searching for startup project or current file's project...`);
            
            const solutionInfo = solutionCache.getSolutionInfo();
            if (!solutionInfo) {
                window.showWarningMessage("No solution is currently loaded.");
                return;
            }
            
            // Check for startup project in workspace settings
            const workspaceConfig = workspace.getConfiguration('clarion');
            const startupProjectGuid = workspaceConfig.get<string>('startupProject');
            
            let selectedProject: ClarionProjectInfo | undefined;
            let currentFileProject: ClarionProjectInfo | undefined; // Track project containing current file
            
            if (startupProjectGuid) {
                // Find the startup project
                selectedProject = solutionInfo.projects.find(p => 
                    p.guid.replace(/[{}]/g, '').toLowerCase() === startupProjectGuid.replace(/[{}]/g, '').toLowerCase()
                );
                
                if (selectedProject) {
                    logger.info(`✅ Using startup project: ${selectedProject.name}`);
                    
                    // Also find which project contains the current file
                    logger.info(`🔍 Detecting project containing current file...`);
                    const client = getLanguageClient();
                    if (client) {
                        for (const proj of solutionInfo.projects) {
                            try {
                                const response = await client.sendRequest<{ files: any[] }>('clarion/getProjectFiles', {
                                    projectGuid: proj.guid
                                });
                                
                                if (response && response.files) {
                                    const fileInProject = response.files.find(f => {
                                        let filePath = f.absolutePath;
                                        if (!filePath && f.relativePath) {
                                            filePath = path.resolve(proj.path, f.relativePath);
                                        }
                                        if (filePath) {
                                            return path.normalize(filePath).toLowerCase() === path.normalize(activeEditor.document.uri.fsPath).toLowerCase();
                                        }
                                        return false;
                                    });
                                    
                                    if (fileInProject) {
                                        currentFileProject = proj;
                                        logger.info(`✅ Current file belongs to: ${proj.name}`);
                                        break;
                                    }
                                }
                            } catch (error) {
                                // Silently continue
                            }
                        }
                    }
                } else {
                    logger.warn(`⚠️ Startup project GUID ${startupProjectGuid} not found in solution`);
                    window.showWarningMessage("Configured startup project not found. Please set a valid startup project.");
                    return;
                }
            } else {
                logger.info(`📋 No startup project configured, detecting from current file...`);
                logger.info(`📋 Solution has ${solutionInfo.projects.length} projects:`);
                
                // Get the language client to fetch project files
                const client = getLanguageClient();
                if (!client) {
                    window.showErrorMessage("Language client not available. Please wait for the extension to fully load.");
                    return;
                }
                
                // Find the project containing this file by checking server data
                let projects: ClarionProjectInfo[] = [];
                
                for (const proj of solutionInfo.projects) {
                    try {
                        logger.info(`  Project: ${proj.name}, path: ${proj.path}`);
                        
                        // Request project files from the server
                        const response = await client.sendRequest<{ files: any[] }>('clarion/getProjectFiles', {
                            projectGuid: proj.guid
                        });
                        
                        if (response && response.files) {
                            logger.info(`  - ${proj.name} (${response.files.length} files)`);
                            
                            // Check if this file is in the project
                            const fileInProject = response.files.find(f => {
                                // Log the file data for debugging
                                logger.info(`    File data: name=${f.name}, relativePath=${f.relativePath}, absolutePath=${f.absolutePath}`);
                                
                                let filePath = f.absolutePath;
                                if (!filePath && f.relativePath) {
                                    // proj.path is actually a directory, not a file path
                                    // Resolve the file relative to that directory
                                    filePath = path.resolve(proj.path, f.relativePath);
                                    logger.info(`    Resolved path: ${filePath} (exists: ${fs.existsSync(filePath)})`);
                                }
                                
                                if (filePath) {
                                    const normalized = path.normalize(filePath).toLowerCase();
                                    const targetNormalized = path.normalize(activeEditor.document.uri.fsPath).toLowerCase();
                                    logger.info(`    Comparing: ${normalized} === ${targetNormalized}`);
                                    return normalized === targetNormalized;
                                }
                                return false;
                            });
                            
                            if (fileInProject) {
                                logger.info(`    ✅ Found file in project!`);
                                projects.push(proj);
                            } else {
                                logger.info(`    ❌ File not found in this project`);
                            }
                        }
                    } catch (error) {
                        logger.error(`Error getting files for project ${proj.name}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                
                logger.info(`📊 Checking ${projects.length} total matching projects`);
                
                if (projects.length === 0) {
                    logger.warn(`❌ No projects matched the current file`);
                    window.showWarningMessage("Current file does not belong to any project in the solution.");
                    return;
                }
                
                logger.info(`✅ Found file in ${projects.length} project(s): ${projects.map(p => p.name).join(', ')}`);
                
                // Continue with the matched projects
                selectedProject = projects[0];
                logger.info(`🎯 Selected project: ${selectedProject.name}`);
                
                // If multiple projects contain the file, let user choose
                if (projects.length > 1) {
                    logger.info(`Multiple projects found, showing picker...`);
                    const projectNames = projects.map(p => p.name);
                    const selectedName = await window.showQuickPick(projectNames, {
                        placeHolder: "Select a project to run"
                    });
                    
                    if (!selectedName) {
                        logger.info(`User cancelled project selection`);
                        return;
                    }
                    
                    selectedProject = projects.find(p => p.name === selectedName)!;
                    logger.info(`User selected: ${selectedProject.name}`);
                }
            }
            
            // At this point, selectedProject should be defined
            if (!selectedProject) {
                logger.error(`❌ No project selected`);
                window.showErrorMessage("No project could be determined.");
                return;
            }
            
            logger.info(`📝 Extracting output info from: ${selectedProject.path}`);
            
            // Use the filename from project data to get the exact cwproj file
            let cwprojPath: string;
            if (selectedProject.filename) {
                cwprojPath = path.join(selectedProject.path, selectedProject.filename);
                logger.info(`📝 Using project filename: ${selectedProject.filename}`);
            } else {
                // Fallback: search for .cwproj in directory
                if (fs.existsSync(selectedProject.path) && fs.statSync(selectedProject.path).isDirectory()) {
                    const files = fs.readdirSync(selectedProject.path);
                    const cwprojFile = files.find(f => f.toLowerCase().endsWith('.cwproj'));
                    if (cwprojFile) {
                        cwprojPath = path.join(selectedProject.path, cwprojFile);
                        logger.info(`📝 Found cwproj file: ${cwprojPath}`);
                    } else {
                        logger.warn(`No .cwproj file found in directory: ${selectedProject.path}`);
                        window.showWarningMessage(`No .cwproj file found for project "${selectedProject.name}".`);
                        return;
                    }
                } else {
                    logger.error(`Project directory not found: ${selectedProject.path}`);
                    window.showErrorMessage(`Project directory not found: ${selectedProject.path}`);
                    return;
                }
            }
            
            logger.info(`📝 Checking project file: ${cwprojPath}`);
            
            if (!fs.existsSync(cwprojPath)) {
                logger.error(`Project file not found: ${cwprojPath}`);
                window.showErrorMessage(`Project file not found: ${cwprojPath}`);
                return;
            }
            
            // Extract output info from the project file
            const outputInfo = extractProjectOutputInfo(cwprojPath);
            
            if (!outputInfo) {
                logger.warn(`Project ${selectedProject.name} is not an executable project`);
                window.showWarningMessage(`Project "${selectedProject.name}" is not an executable project.`);
                return;
            }
            
            logger.info(`✅ Output info: type=${outputInfo.outputType}, name=${outputInfo.outputName}`);
            
            // Offer to build the startup project before running
            let shouldBuild: boolean;
            if (buildFirst === undefined) {
                const buildChoice = await window.showInformationMessage(
                    `Build project '${selectedProject.name}' before running?`,
                    "Build and Run",
                    "Run Without Building",
                    "Cancel"
                );
                if (!buildChoice || buildChoice === "Cancel") {
                    return;
                }
                shouldBuild = buildChoice === "Build and Run";
            } else {
                shouldBuild = buildFirst;
            }

            if (shouldBuild) {
                logger.info(`🔨 Building project '${selectedProject.name}' before running...`);
                const { languages } = await import('vscode');
                await buildSolutionOrProject("Project", selectedProject, languages.createDiagnosticCollection("clarion-run-build"), undefined, true);
            }

            logger.info(`🔍 Looking for executable...`);

            const exePath = findExecutable(outputInfo);

            if (!exePath) {
                window.showErrorMessage(`Executable not found for project "${selectedProject.name}". Build the project first.`);
                return;
            }

            logger.info(`🚀 Found executable: ${exePath}`);
            logger.info(`🏃 Running executable...`);

            runExecutable(exePath,
                outputInfo.startWorkingDirectory ? path.resolve(outputInfo.projectDir, outputInfo.startWorkingDirectory) : undefined,
                outputInfo.startArguments);
            
            logger.info(`✅ Command completed successfully`);
        }),

        commands.registerCommand('clarion.startDebugging', async (buildFirst?: boolean) => {
            logger.info("🐛 Starting Clarion debugger...");

            const debuggerExe = findDebuggerExecutable();
            if (!debuggerExe) {
                const action = await window.showErrorMessage(
                    "Clarion debugger (CladbNE.exe) not found. Ensure a solution with a valid Clarion version is loaded.",
                    "Open Settings"
                );
                if (action === "Open Settings") {
                    commands.executeCommand('workbench.action.openSettings', 'clarion');
                }
                return;
            }

            // Warn if not building in a debug configuration
            const currentConfig = globalSettings.configuration;
            if (currentConfig && !currentConfig.toLowerCase().startsWith('debug')) {
                const proceed = await window.showWarningMessage(
                    `Current build configuration is '${currentConfig}'. Source files will not be available in the debugger unless the project is compiled in Debug mode.`,
                    "Debug Anyway",
                    "Cancel"
                );
                if (proceed !== "Debug Anyway") {
                    return;
                }
            }

            const activeEditor = window.activeTextEditor;
            if (!activeEditor) {
                window.showWarningMessage("No active file. Please open a file to debug its project.");
                return;
            }

            const solutionCache = SolutionCache.getInstance();
            const solutionInfo = solutionCache.getSolutionInfo();
            if (!solutionInfo) {
                window.showWarningMessage("No solution is currently loaded.");
                return;
            }

            // Reuse startup project / current file logic (same as runWithoutDebugging)
            const workspaceConfig = workspace.getConfiguration('clarion');
            const startupProjectGuid = workspaceConfig.get<string>('startupProject');
            let selectedProject: ClarionProjectInfo | undefined;

            if (startupProjectGuid) {
                selectedProject = solutionInfo.projects.find(p =>
                    p.guid.replace(/[{}]/g, '').toLowerCase() === startupProjectGuid.replace(/[{}]/g, '').toLowerCase()
                );
                if (!selectedProject) {
                    window.showWarningMessage("Configured startup project not found. Please set a valid startup project.");
                    return;
                }
            } else {
                const client = getLanguageClient();
                if (!client) {
                    window.showErrorMessage("Language client not available. Please wait for the extension to fully load.");
                    return;
                }

                const filePath = activeEditor.document.uri.fsPath;
                for (const proj of solutionInfo.projects) {
                    try {
                        const response = await client.sendRequest<{ files: any[] }>('clarion/getProjectFiles', { projectGuid: proj.guid });
                        if (response?.files) {
                            const found = response.files.find(f => {
                                const fp = f.absolutePath || (f.relativePath ? path.resolve(proj.path, f.relativePath) : undefined);
                                return fp && path.normalize(fp).toLowerCase() === path.normalize(filePath).toLowerCase();
                            });
                            if (found) { selectedProject = proj; break; }
                        }
                    } catch { /* continue */ }
                }

                if (!selectedProject) {
                    window.showWarningMessage("Current file does not belong to any project in the solution.");
                    return;
                }
            }

            // Offer to build the startup project before launching the debugger
            let shouldBuild: boolean;
            if (buildFirst === undefined) {
                const buildChoice = await window.showInformationMessage(
                    `Build project '${selectedProject.name}' before starting the debugger?`,
                    "Build and Debug",
                    "Debug Without Building",
                    "Cancel"
                );
                if (!buildChoice || buildChoice === "Cancel") {
                    return;
                }
                shouldBuild = buildChoice === "Build and Debug";
            } else {
                shouldBuild = buildFirst;
            }

            if (shouldBuild) {
                logger.info(`🔨 Building project '${selectedProject.name}' before debugging...`);
                const { languages } = await import('vscode');
                await buildSolutionOrProject("Project", selectedProject, languages.createDiagnosticCollection("clarion-debug-build"), undefined, true);
            }

            // Resolve cwproj
            let cwprojPath: string;
            if (selectedProject.filename) {
                cwprojPath = path.join(selectedProject.path, selectedProject.filename);
            } else {
                const files = fs.existsSync(selectedProject.path) ? fs.readdirSync(selectedProject.path) : [];
                const cwprojFile = files.find(f => f.toLowerCase().endsWith('.cwproj'));
                if (!cwprojFile) {
                    window.showWarningMessage(`No .cwproj file found for project "${selectedProject.name}".`);
                    return;
                }
                cwprojPath = path.join(selectedProject.path, cwprojFile);
            }

            const outputInfo = extractProjectOutputInfo(cwprojPath);
            if (!outputInfo) {
                window.showWarningMessage(`Project "${selectedProject.name}" is not an executable project.`);
                return;
            }

            const exePath = findExecutable(outputInfo);
            if (!exePath) {
                window.showErrorMessage(`Executable not found for project "${selectedProject.name}". Build the project first.`);
                return;
            }

            launchDebugger(debuggerExe, exePath,
                outputInfo.projectDir,
                outputInfo.startWorkingDirectory ? path.resolve(outputInfo.projectDir, outputInfo.startWorkingDirectory) : undefined,
                outputInfo.startArguments);
            logger.info(`✅ Debugger launched for: ${exePath}`);
        })
    ];
}
