import { commands, window, Disposable, Terminal, Uri } from 'vscode';
import { SolutionCache } from '../SolutionCache';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("RunCommands");

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
            const solutionCache = SolutionCache.getInstance();
            
            // Find the project(s) the file belongs to
            const projects = solutionCache.findProjectsForFile(filePath);
            
            if (projects.length === 0) {
                window.showWarningMessage("Current file does not belong to any project in the solution.");
                return;
            }
            
            let selectedProject = projects[0];
            
            // If multiple projects contain the file, let user choose
            if (projects.length > 1) {
                const projectNames = projects.map(p => p.name);
                const selectedName = await window.showQuickPick(projectNames, {
                    placeHolder: "Select a project to run"
                });
                
                if (!selectedName) {
                    return;
                }
                
                selectedProject = projects.find(p => p.name === selectedName)!;
            }
            
            // Extract output info from the project file
            const outputInfo = extractProjectOutputInfo(selectedProject.path);
            
            if (!outputInfo) {
                window.showWarningMessage(`Project "${selectedProject.name}" is not an executable project.`);
                return;
            }
            
            // Find the executable
            const exePath = findExecutable(outputInfo);
            
            if (!exePath) {
                const buildChoice = await window.showWarningMessage(
                    `Executable not found for project "${selectedProject.name}". Would you like to build the project first?`,
                    'Build & Run',
                    'Cancel'
                );
                
                if (buildChoice === 'Build & Run') {
                    // Trigger build command and then run
                    await commands.executeCommand('clarion.buildCurrentProject');
                    
                    // Wait a moment for build to complete and try again
                    window.showInformationMessage('Please run the command again after the build completes.');
                }
                return;
            }
            
            // Run the executable
            runExecutable(exePath);
        })
    ];
}
