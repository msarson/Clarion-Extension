import { commands, window, Disposable, Terminal, Uri } from 'vscode';
import { SolutionCache } from '../SolutionCache';
import { ClarionProjectInfo } from 'common/types';
import { getLanguageClient } from '../LanguageClientManager';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("RunCommands");
logger.setLevel("info");

interface ProjectOutputInfo {
    outputType: string;
    outputName: string;
    configuration: string;
    projectDir: string;
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
                
                // Store properties case-insensitively
                if (!properties.has(propertyName.toLowerCase())) {
                    properties.set(propertyName.toLowerCase(), propertyValue);
                }
            }
        }

        const outputType = properties.get('outputtype') || '';
        const outputName = properties.get('outputname') || properties.get('assemblyname') || '';
        const configuration = properties.get('configuration') || 'Debug';

        // Only return info if this is an executable project
        if (outputType.toLowerCase() === 'exe' && outputName) {
            return {
                outputType,
                outputName,
                configuration,
                projectDir
            };
        }

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
    const { outputName, projectDir } = outputInfo;
    const exeName = outputName.endsWith('.exe') ? outputName : `${outputName}.exe`;
    
    // Common locations to check
    const possiblePaths = [
        path.join(projectDir, exeName),
        path.join(projectDir, 'bin', exeName),
        path.join(projectDir, 'bin', 'Debug', exeName),
        path.join(projectDir, 'bin', 'Release', exeName),
        path.join(projectDir, 'obj', exeName),
        path.join(projectDir, 'obj', 'Debug', exeName),
        path.join(projectDir, 'obj', 'Release', exeName)
    ];

    for (const exePath of possiblePaths) {
        if (fs.existsSync(exePath)) {
            logger.info(`Found executable: ${exePath}`);
            return exePath;
        }
    }

    logger.warn(`Executable not found. Searched in: ${possiblePaths.join(', ')}`);
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
 * Registers all run-related commands
 * @returns Array of disposables for the registered commands
 */
export function registerRunCommands(): Disposable[] {
    return [
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
            
            logger.info(`🔍 Searching for projects containing: ${filePath}`);
            
            // Debug: Check what projects are in the solution
            const solutionInfo = solutionCache.getSolutionInfo();
            if (solutionInfo) {
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
                let selectedProject = projects[0];
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
                
                logger.info(`📝 Extracting output info from: ${selectedProject.path}`);
                
                // proj.path is a directory, need to find the .cwproj file
                let cwprojPath = selectedProject.path;
                if (fs.existsSync(cwprojPath) && fs.statSync(cwprojPath).isDirectory()) {
                    // Find the .cwproj file in this directory
                    const files = fs.readdirSync(cwprojPath);
                    const cwprojFile = files.find(f => f.toLowerCase().endsWith('.cwproj'));
                    if (cwprojFile) {
                        cwprojPath = path.join(cwprojPath, cwprojFile);
                        logger.info(`📝 Found cwproj file: ${cwprojPath}`);
                    } else {
                        logger.warn(`No .cwproj file found in directory: ${cwprojPath}`);
                        window.showWarningMessage(`No .cwproj file found for project "${selectedProject.name}".`);
                        return;
                    }
                }
                
                // Extract output info from the project file
                const outputInfo = extractProjectOutputInfo(cwprojPath);
                
                if (!outputInfo) {
                    logger.warn(`Project ${selectedProject.name} is not an executable project`);
                    window.showWarningMessage(`Project "${selectedProject.name}" is not an executable project.`);
                    return;
                }
                
                logger.info(`✅ Output info: type=${outputInfo.outputType}, name=${outputInfo.outputName}`);
                logger.info(`🔍 Looking for executable...`);
                
                // Find the executable
                const exePath = findExecutable(outputInfo);
                
                if (!exePath) {
                    logger.warn(`Executable not found for ${selectedProject.name}`);
                    const buildChoice = await window.showWarningMessage(
                    `Executable not found for project "${selectedProject.name}". Would you like to build the project first?`,
                    'Build & Run',
                    'Cancel'
                );
                
                if (buildChoice === 'Build & Run') {
                    logger.info(`User chose to build project`);
                    // Trigger build command and then run
                    await commands.executeCommand('clarion.buildCurrentProject');
                    
                    // Wait a moment for build to complete and try again
                    window.showInformationMessage('Please run the command again after the build completes.');
                }
                return;
            }
            
            logger.info(`🚀 Found executable: ${exePath}`);
            logger.info(`🏃 Running executable...`);
            
            // Run the executable
            runExecutable(exePath);
            
            logger.info(`✅ Command completed successfully`);
            } else {
                window.showWarningMessage("No solution is currently loaded.");
                return;
            }
        })
    ];
}
