import { commands, window, env, Uri, Disposable } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { globalSolutionFile, globalClarionPropertiesFile } from '../globals';
import { ClarionInstallationDetector } from '../utils/ClarionInstallationDetector';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("TreeCommands");

/**
 * Registers tree-related context menu commands
 * @returns Array of disposables for the registered commands
 */
export function registerTreeCommands(): Disposable[] {
    return [
        // Copy file path to clipboard
        commands.registerCommand('clarion.copyFilePath', async (node) => {
            if (node && node.data) {
                let filePath: string | undefined;
                
                // Determine the file path based on node type
                if (node.data.absolutePath) {
                    // Application node
                    filePath = node.data.absolutePath;
                } else if (node.data.path) {
                    // Project node or solution node
                    if (node.data.filename) {
                        // Project node - combine path and filename
                        filePath = path.join(node.data.path, node.data.filename);
                    } else {
                        // Solution node
                        filePath = node.data.path;
                    }
                } else if (node.data.relativePath && node.parent && node.parent.data && node.parent.data.path) {
                    // File node - combine parent project path with relative path
                    filePath = path.join(node.parent.data.path, node.data.relativePath);
                }
                
                if (filePath) {
                    await env.clipboard.writeText(filePath);
                    window.showInformationMessage(`Path copied: ${filePath}`);
                } else {
                    window.showErrorMessage("Cannot determine file path.");
                }
            } else {
                window.showErrorMessage("Cannot determine file path.");
            }
        }),

        // Copy relative path to clipboard
        commands.registerCommand('clarion.copyRelativePath', async (node) => {
            if (node && node.data && globalSolutionFile) {
                let filePath: string | undefined;
                
                // Determine the full file path
                if (node.data.absolutePath) {
                    filePath = node.data.absolutePath;
                } else if (node.data.path) {
                    if (node.data.filename) {
                        filePath = path.join(node.data.path, node.data.filename);
                    } else {
                        filePath = node.data.path;
                    }
                } else if (node.data.relativePath && node.parent && node.parent.data && node.parent.data.path) {
                    filePath = path.join(node.parent.data.path, node.data.relativePath);
                }
                
                if (filePath) {
                    // Get solution directory
                    const solutionDir = path.dirname(globalSolutionFile);
                    const relativePath = path.relative(solutionDir, filePath);
                    
                    await env.clipboard.writeText(relativePath);
                    window.showInformationMessage(`Relative path copied: ${relativePath}`);
                } else {
                    window.showErrorMessage("Cannot determine file path.");
                }
            } else {
                window.showErrorMessage("Cannot determine file path or no solution is open.");
            }
        }),

        // Open containing folder in Windows Explorer
        commands.registerCommand('clarion.openContainingFolder', async (node) => {
            if (node && node.data) {
                let folderPath: string | undefined;
                
                // Determine the folder path based on node type
                if (node.data.absolutePath) {
                    // Application node - get directory
                    folderPath = path.dirname(node.data.absolutePath);
                } else if (node.data.path) {
                    // Project or solution node
                    // Check if path points to a file or directory
                    if (fs.existsSync(node.data.path)) {
                        const stats = fs.statSync(node.data.path);
                        if (stats.isDirectory()) {
                            folderPath = node.data.path;
                        } else {
                            // It's a file (like .sln or .cwproj) - get its directory
                            folderPath = path.dirname(node.data.path);
                        }
                    } else {
                        // Doesn't exist, assume it's a file path
                        folderPath = path.dirname(node.data.path);
                    }
                } else if (node.data.relativePath && node.parent && node.parent.data && node.parent.data.path) {
                    // File node - get directory of the file
                    const filePath = path.join(node.parent.data.path, node.data.relativePath);
                    folderPath = path.dirname(filePath);
                }
                
                if (folderPath && fs.existsSync(folderPath)) {
                    // Open Windows Explorer at this location
                    child_process.exec(`explorer.exe "${folderPath}"`);
                } else {
                    window.showErrorMessage(`Folder not found: ${folderPath}`);
                }
            } else {
                window.showErrorMessage("Cannot determine folder path.");
            }
        }),

        // Open solution in Clarion IDE
        commands.registerCommand('clarion.openInClarionIDE', async () => {
            if (!globalSolutionFile) {
                window.showErrorMessage("No solution is currently open.");
                return;
            }

            if (!fs.existsSync(globalSolutionFile)) {
                window.showErrorMessage(`Solution file not found: ${globalSolutionFile}`);
                return;
            }

            try {
                // Get the Clarion installation for this solution
                const installations = await ClarionInstallationDetector.detectInstallations();
                
                if (installations.length === 0) {
                    window.showErrorMessage("No Clarion installation detected.");
                    return;
                }

                // Find the installation matching our current properties file
                let clarionExePath: string | undefined;
                
                if (globalClarionPropertiesFile) {
                    for (const installation of installations) {
                        if (installation.propertiesPath === globalClarionPropertiesFile) {
                            // Found matching installation - use the first compiler version
                            if (installation.compilerVersions.length > 0) {
                                const binPath = installation.compilerVersions[0].path;
                                const possibleExePath = path.join(binPath, 'clarion.exe');
                                if (fs.existsSync(possibleExePath)) {
                                    clarionExePath = possibleExePath;
                                    break;
                                }
                            }
                        }
                    }
                }

                // If we didn't find it, try the most recent installation
                if (!clarionExePath) {
                    const mostRecent = await ClarionInstallationDetector.getMostRecentInstallation();
                    if (mostRecent && mostRecent.compilerVersions.length > 0) {
                        const binPath = mostRecent.compilerVersions[0].path;
                        const possibleExePath = path.join(binPath, 'clarion.exe');
                        if (fs.existsSync(possibleExePath)) {
                            clarionExePath = possibleExePath;
                        }
                    }
                }

                if (!clarionExePath) {
                    window.showErrorMessage("Could not find clarion.exe");
                    return;
                }

                // Launch Clarion IDE with the solution file
                logger.info(`Launching Clarion IDE: "${clarionExePath}" "${globalSolutionFile}"`);
                child_process.spawn(clarionExePath, [globalSolutionFile], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();

                window.showInformationMessage("Opening solution in Clarion IDE...");
            } catch (error) {
                logger.error(`Error opening Clarion IDE: ${error}`);
                window.showErrorMessage(`Failed to open Clarion IDE: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    ];
}
