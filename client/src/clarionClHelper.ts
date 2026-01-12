import * as path from 'path';
import { spawn } from 'child_process';
import { window, OutputChannel } from 'vscode';
import { globalSettings, globalSolutionFile } from './globals';
import LoggerManager from './utils/LoggerManager';

const logger = LoggerManager.getLogger("ClarionCl");
logger.setLevel("error");

let outputChannel: OutputChannel | undefined;

function getOutputChannel(): OutputChannel {
    if (!outputChannel) {
        outputChannel = window.createOutputChannel("Clarion Generator");
    }
    return outputChannel;
}

export async function runClarionCl(args: string[], cwd: string): Promise<void> {
    const clarionBinPath = globalSettings.redirectionPath.replace(/redirection.*/i, "bin");
    const clarionClPath = path.join(clarionBinPath, "ClarionCl.exe");

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`Running: ${clarionClPath} ${args.join(' ')}`);
    channel.appendLine(`Working directory: ${cwd}`);
    channel.appendLine('');

    return new Promise((resolve, reject) => {
        const proc = spawn(clarionClPath, args, {
            cwd,
            shell: true,
            windowsHide: false
        });

        proc.stdout?.on('data', (data) => {
            channel.append(data.toString());
        });

        proc.stderr?.on('data', (data) => {
            channel.append(data.toString());
        });

        proc.on('error', (error) => {
            logger.error(`Failed to start ClarionCl.exe: ${error.message}`);
            channel.appendLine(`\nError: ${error.message}`);
            window.showErrorMessage(`Failed to start ClarionCl.exe: ${error.message}`);
            reject(error);
        });

        proc.on('close', (code) => {
            channel.appendLine('');
            if (code === 0) {
                channel.appendLine('✓ Clarion generation complete');
                window.showInformationMessage('Clarion generation complete');
                resolve();
            } else {
                channel.appendLine(`✗ Clarion generation failed (exit code: ${code})`);
                window.showErrorMessage('Clarion generation failed');
                reject(new Error(`ClarionCl exited with code ${code}`));
            }
        });
    });
}

export async function generateAllApps(): Promise<void> {
    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    const args = ['/win', '/ag', globalSolutionFile];

    try {
        await runClarionCl(args, solutionDir);
    } catch (error) {
        logger.error(`Generate all apps failed: ${error}`);
    }
}

/**
 * Generate all apps with progress tracking
 */
export async function generateAllAppsWithProgress(
    appPaths: string[],
    solutionTreeDataProvider?: any
): Promise<void> {
    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < appPaths.length; i++) {
        const appPath = appPaths[i];
        const appName = path.basename(appPath, '.app');
        
        try {
            logger.info(`Generating app: ${appName}`);
            window.showInformationMessage(`Generating: ${appName}.app`);
            
            // Notify tree provider that this app is generating
            if (solutionTreeDataProvider) {
                solutionTreeDataProvider.setCurrentlyGeneratingApp(appName);
                solutionTreeDataProvider.setGenerateProgress(i + 1, appPaths.length);
            }
            
            const args = ['/win', '/ag', appPath];
            await runClarionCl(args, solutionDir);
            successCount++;
            
            // Clear generating status for this app
            if (solutionTreeDataProvider) {
                solutionTreeDataProvider.setCurrentlyGeneratingApp(null);
            }
            
        } catch (error) {
            failCount++;
            logger.error(`Failed to generate app ${appName}: ${error}`);
            
            // Clear generating status on error
            if (solutionTreeDataProvider) {
                solutionTreeDataProvider.setCurrentlyGeneratingApp(null);
                solutionTreeDataProvider.clearGenerateProgress();
            }
            
            const continueGeneration = await window.showErrorMessage(
                `Generate failed for ${appName}. Continue with remaining apps?`,
                'Continue',
                'Stop'
            );
            
            if (continueGeneration !== 'Continue') {
                break;
            }
        }
    }
    
    // Clear generate progress when done
    if (solutionTreeDataProvider) {
        solutionTreeDataProvider.clearGenerateProgress();
    }
    
    // Show final status
    if (failCount === 0) {
        window.showInformationMessage(`✅ All apps generated successfully: ${successCount} apps`);
    } else {
        window.showWarningMessage(`Generation complete: ${successCount} succeeded, ${failCount} failed`);
    }
}


export async function generateApp(appPath: string): Promise<void> {
    if (!appPath) {
        window.showErrorMessage('No application path provided');
        return;
    }

    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    const args = ['/win', '/ag', appPath];

    try {
        await runClarionCl(args, solutionDir);
    } catch (error) {
        logger.error(`Generate app failed: ${error}`);
    }
}

// UpperPark Version Control Commands

export async function importAppFromTextForSolution(appPath: string): Promise<void> {
    if (!appPath) {
        window.showErrorMessage('No application path provided');
        return;
    }

    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    const args = ['/win', '/up_createappVC', appPath];

    try {
        await runClarionCl(args, solutionDir);
    } catch (error) {
        logger.error(`Import app from text for solution failed: ${error}`);
    }
}

export async function exportAppToVersionControl(appPath: string): Promise<void> {
    if (!appPath) {
        window.showErrorMessage('No application path provided');
        return;
    }

    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    const appFileName = path.basename(appPath);
    
    const args = ['/win', '/up_exportappToVC', globalSolutionFile, appFileName];

    try {
        await runClarionCl(args, solutionDir);
    } catch (error) {
        logger.error(`Export app to version control failed: ${error}`);
    }
}

export async function importAllAppsFromTextForSolution(appPaths: string[]): Promise<void> {
    if (!appPaths || appPaths.length === 0) {
        window.showErrorMessage('No applications provided');
        return;
    }

    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`Importing ${appPaths.length} application(s)...`);
    channel.appendLine('');

    let successCount = 0;
    let failCount = 0;

    for (const appPath of appPaths) {
        try {
            channel.appendLine(`Importing: ${path.basename(appPath)}`);
            await importAppFromTextForSolution(appPath);
            successCount++;
        } catch (error) {
            failCount++;
            logger.error(`Failed to import ${appPath}: ${error}`);
            channel.appendLine(`✗ Failed: ${path.basename(appPath)}`);
        }
    }

    channel.appendLine('');
    channel.appendLine(`Import complete: ${successCount} succeeded, ${failCount} failed`);
    
    if (failCount === 0) {
        window.showInformationMessage(`Successfully imported ${successCount} application(s)`);
    } else {
        window.showWarningMessage(`Imported ${successCount} application(s), ${failCount} failed`);
    }
}

export async function exportAllAppsToVersionControl(appPaths: string[]): Promise<void> {
    if (!appPaths || appPaths.length === 0) {
        window.showErrorMessage('No applications provided');
        return;
    }

    if (!globalSolutionFile) {
        window.showErrorMessage('No solution file is currently open');
        return;
    }

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`Exporting ${appPaths.length} application(s)...`);
    channel.appendLine('');

    let successCount = 0;
    let failCount = 0;

    for (const appPath of appPaths) {
        try {
            channel.appendLine(`Exporting: ${path.basename(appPath)}`);
            await exportAppToVersionControl(appPath);
            successCount++;
        } catch (error) {
            failCount++;
            logger.error(`Failed to export ${appPath}: ${error}`);
            channel.appendLine(`✗ Failed: ${path.basename(appPath)}`);
        }
    }

    channel.appendLine('');
    channel.appendLine(`Export complete: ${successCount} succeeded, ${failCount} failed`);
    
    if (failCount === 0) {
        window.showInformationMessage(`Successfully exported ${successCount} application(s)`);
    } else {
        window.showWarningMessage(`Exported ${successCount} application(s), ${failCount} failed`);
    }
}
