import { commands, window, Disposable, Terminal, Uri, workspace } from 'vscode';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { ClarionProjectInfo } from 'common/types';
import { getLanguageClient } from '../LanguageClientManager';
import { redirectionService } from '../paths/RedirectionService';
import { globalSettings } from '../globals';
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
    startProgram?: string; // Optional path from <StartProgram> element
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

        // Extract PropertyGroup sections
        const propertyGroupRegex = /<PropertyGroup\b[^>]*>([\s\S]*?)<\/PropertyGroup>/gi;
        const properties = new Map<string, string>();

        let propertyGroupMatch;
        while ((propertyGroupMatch = propertyGroupRegex.exec(content)) !== null) {
            const propertyGroupContent = propertyGroupMatch[1];
            
            // Extract properties
            const propertyRegex = /<([^>\s]+)>([^<]+)<\/\1>/g;
            let propertyMatch;
            
            while ((propertyMatch = propertyRegex.exec(propertyGroupContent)) !== null) {
                const propertyName = propertyMatch[1];
                const propertyValue = propertyMatch[2].trim();
                
                // Always overwrite with the latest value found (configuration-specific values come later)
                properties.set(propertyName.toLowerCase(), propertyValue);
            }
        }

        const outputType = properties.get('outputtype') || '';
        const outputName = properties.get('outputname') || properties.get('assemblyname') || '';
        const configuration = properties.get('configuration') || 'Debug';
        const model = properties.get('model') || '';
        const startProgram = properties.get('startprogram') || '';

        // Check if this is an executable project
        // OutputType takes priority: Exe or WinExe = executable
        // If OutputType is Library, it's definitely not executable regardless of Model
        const outputTypeLower = outputType.toLowerCase();
        const isExecutable = (outputTypeLower === 'exe' || outputTypeLower === 'winexe') && 
                            outputName.length > 0;

        // Only return info if this is an executable project
        if (isExecutable) {
            return {
                outputType,
                outputName,
                configuration,
                projectDir,
                startProgram: startProgram || undefined
            };
        }

        logger.info(`Project is not executable: OutputType=${outputType}, Model=${model}`);
        return undefined;
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
    const { outputName, configuration, projectDir, startProgram } = outputInfo;
    const exeName = outputName.endsWith('.exe') ? outputName : `${outputName}.exe`;
    
    logger.info(`Looking for executable: ${exeName} in project: ${projectDir}`);
    logger.info(`Configuration: ${configuration}`);
    
    // Check StartProgram first - this is the most explicit setting
    if (startProgram) {
        logger.info(`Found StartProgram setting: ${startProgram}`);
        
        // StartProgram path is relative to project directory
        const startProgramPath = path.isAbsolute(startProgram) 
            ? startProgram 
            : path.resolve(projectDir, startProgram);
        
        if (fs.existsSync(startProgramPath)) {
            logger.info(`✅ Found executable via StartProgram: ${startProgramPath}`);
            return startProgramPath;
        } else {
            logger.warn(`⚠️ StartProgram path does not exist: ${startProgramPath}`);
        }
    }
    
    // Try using redirection service
    try {
        const resolver = redirectionService.getResolver(projectDir);
        const resolvedPath = resolver(exeName);
        
        if (resolvedPath && fs.existsSync(resolvedPath)) {
            logger.info(`✅ Found executable via redirection: ${resolvedPath}`);
            return resolvedPath;
        }
    } catch (error) {
        logger.warn(`Redirection resolution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Fallback to common locations
    const possiblePaths = [
        path.join(projectDir, exeName),
        path.join(projectDir, 'working', exeName),
        path.join(projectDir, 'bin', exeName),
        path.join(projectDir, 'bin', configuration, exeName),
        path.join(projectDir, 'obj', exeName),
        path.join(projectDir, 'obj', configuration, exeName)
    ];

    for (const exePath of possiblePaths) {
        if (fs.existsSync(exePath)) {
            logger.info(`✅ Found executable: ${exePath}`);
            return exePath;
        }
    }

    logger.warn(`❌ Executable not found. Searched in: ${possiblePaths.join(', ')}`);
    return undefined;
}

/**
 * Runs an executable in a VS Code terminal
 * @param exePath - Path to the executable
 */
function runExecutable(exePath: string): void {
    const exeDir = path.dirname(exePath);
    const exeName = path.basename(exePath);
    
    // Create a new terminal
    const terminal: Terminal = window.createTerminal({
        name: `Run: ${exeName}`,
        cwd: exeDir
    });
    
    terminal.show();
    terminal.sendText(`.\\${exeName}`);
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
 * Launches CladbNE.exe with the given program path (detached, no terminal)
 */
function launchDebugger(debuggerPath: string, exePath: string): void {
    const exeDir = path.dirname(exePath);
    logger.info(`🐛 Launching debugger: ${debuggerPath} ${exePath} (cwd: ${exeDir})`);
    const proc = spawn(debuggerPath, [exePath], {
        cwd: exeDir,
        detached: true,
        stdio: 'ignore'
    });
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
                // Read the cwproj to show what was found
                try {
                    const content = fs.readFileSync(cwprojPath, 'utf8');
                    const outputTypeMatch = /<OutputType>([^<]+)<\/OutputType>/i.exec(content);
                    const outputNameMatch = /<OutputName>([^<]+)<\/OutputName>/i.exec(content);
                    const modelMatch = /<Model>([^<]+)<\/Model>/i.exec(content);
                    
                    const outputType = outputTypeMatch ? outputTypeMatch[1] : 'not found';
                    const outputName = outputNameMatch ? outputNameMatch[1] : 'not found';
                    const model = modelMatch ? modelMatch[1] : 'not found';
                    
                    logger.warn(`Project not executable - OutputType: ${outputType}, OutputName: ${outputName}, Model: ${model}`);
                    logger.warn(`Project file path: ${cwprojPath}`);
                    logger.warn(`Project GUID: ${projectGuid}`);
                    
                    window.showWarningMessage(
                        `${projectName} cannot be set as startup project.\n\n` +
                        `Details:\n` +
                        `• OutputType: ${outputType}\n` +
                        `• OutputName: ${outputName}\n` +
                        `• Model: ${model}\n\n` +
                        `Project file: ${cwprojPath}\n\n` +
                        `Only projects with OutputType='Exe' or 'WinExe' can be startup projects.`
                    );
                } catch (readError) {
                    window.showWarningMessage(`${projectName} is not an executable project and cannot be set as startup project.`);
                }
                return;
            }
            
            // Save to workspace configuration
            const config = workspace.getConfiguration('clarion');
            await config.update('startupProject', projectGuid, false);
            
            logger.info(`✅ Set ${projectName} (${projectGuid}) as startup project`);
            window.showInformationMessage(`${projectName} set as startup project.`);
            
            // Refresh the tree to show the visual indicator
            if (solutionTreeDataProvider) {
                await solutionTreeDataProvider.refresh();
            }
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
        }),
        
        commands.registerCommand('clarion.runWithoutDebugging', async () => {
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
            
            // No automatic build - developer is responsible for building
            // Just find and run the executable
            logger.info(`🔍 Looking for executable...`);
            
            // Find the executable
            const exePath = findExecutable(outputInfo);
            
            if (!exePath) {
                logger.warn(`Executable not found even after build for ${selectedProject.name}`);
                window.showErrorMessage(`Executable not found. The build may have failed.`);
                return;
            }
            
            logger.info(`🚀 Found executable: ${exePath}`);
            logger.info(`🏃 Running executable...`);
            
            // Run the executable
            runExecutable(exePath);
            
            logger.info(`✅ Command completed successfully`);
        }),

        commands.registerCommand('clarion.startDebugging', async () => {
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

            launchDebugger(debuggerExe, exePath);
            logger.info(`✅ Debugger launched for: ${exePath}`);
        })
    ];
}
