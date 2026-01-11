import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { globalSettings } from '../globals';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("UpperParkDetector");

export interface UpperParkCapabilities {
    hasCreateAppVC: boolean;
    hasExportAppToVC: boolean;
}

let cachedCapabilities: UpperParkCapabilities | null = null;

/**
 * Detects if UpperPark Version Control commands are available in ClarionCL
 * @returns Promise with capabilities flags
 */
export async function detectUpperParkCapabilities(): Promise<UpperParkCapabilities> {
    if (cachedCapabilities) {
        return cachedCapabilities;
    }

    const defaultCapabilities: UpperParkCapabilities = {
        hasCreateAppVC: false,
        hasExportAppToVC: false
    };

    try {
        const clarionBinPath = globalSettings.redirectionPath.replace(/redirection.*/i, "bin");
        const clarionClPath = path.join(clarionBinPath, "ClarionCl.exe");

        if (!fs.existsSync(clarionClPath)) {
            logger.warn(`ClarionCl.exe not found at: ${clarionClPath}`);
            return defaultCapabilities;
        }

        const output = await runClarionClHelp(clarionClPath);
        
        cachedCapabilities = {
            hasCreateAppVC: output.includes('/up_createappVC'),
            hasExportAppToVC: output.includes('/up_exportappToVC')
        };

        logger.info(`UpperPark capabilities detected: ${JSON.stringify(cachedCapabilities)}`);
        return cachedCapabilities;

    } catch (error) {
        logger.error(`Error detecting UpperPark capabilities: ${error}`);
        return defaultCapabilities;
    }
}

/**
 * Runs ClarionCl.exe without arguments to get help text
 */
function runClarionClHelp(clarionClPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn(clarionClPath, [], {
            shell: true,
            windowsHide: true
        });

        let output = '';

        proc.stdout?.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            output += data.toString();
        });

        proc.on('error', (error) => {
            reject(error);
        });

        proc.on('close', () => {
            resolve(output);
        });
    });
}

/**
 * Clears the cached capabilities (useful after Clarion version changes)
 */
export function clearCapabilitiesCache(): void {
    cachedCapabilities = null;
}
