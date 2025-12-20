import * as path from 'path';
import { spawn } from 'child_process';
import { window, OutputChannel } from 'vscode';
import { globalSettings, globalSolutionFile } from './globals';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("ClarionCl");

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
