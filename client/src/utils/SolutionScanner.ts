import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';
import LoggerManager from '../LoggerManager';

const logger = LoggerManager.getLogger("SolutionScanner");

export interface DetectedSolution {
    solutionPath: string;
    solutionName: string;
    workspaceFolder: string;
}

export class SolutionScanner {
    /**
     * Scans all workspace folders for Clarion solution files (.sln)
     */
    static async scanWorkspaceFolders(): Promise<DetectedSolution[]> {
        const detectedSolutions: DetectedSolution[] = [];

        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            logger.info("ℹ️ No workspace folders to scan");
            return detectedSolutions;
        }

        for (const folder of workspace.workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            logger.info(`🔍 Scanning folder: ${folderPath}`);

            try {
                const solutions = this.findSolutionFiles(folderPath);
                detectedSolutions.push(...solutions);
                
                if (solutions.length > 0) {
                    logger.info(`✅ Found ${solutions.length} solution(s) in ${folderPath}`);
                }
            } catch (error) {
                logger.error(`❌ Error scanning folder ${folderPath}:`, error);
            }
        }

        return detectedSolutions;
    }

    /**
     * Finds all .sln files in a directory (non-recursive for performance)
     */
    private static findSolutionFiles(folderPath: string): DetectedSolution[] {
        const solutions: DetectedSolution[] = [];

        try {
            if (!fs.existsSync(folderPath)) {
                return solutions;
            }

            const entries = fs.readdirSync(folderPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isFile() && entry.name.toLowerCase().endsWith('.sln')) {
                    const solutionPath = path.join(folderPath, entry.name);
                    solutions.push({
                        solutionPath: solutionPath,
                        solutionName: entry.name,
                        workspaceFolder: folderPath
                    });
                }
            }
        } catch (error) {
            logger.error(`❌ Error reading directory ${folderPath}:`, error);
        }

        return solutions;
    }

    /**
     * Checks if a specific path contains a solution file
     */
    static hasSolutionFile(folderPath: string): boolean {
        try {
            if (!fs.existsSync(folderPath)) {
                return false;
            }

            const entries = fs.readdirSync(folderPath);
            return entries.some(entry => entry.toLowerCase().endsWith('.sln'));
        } catch (error) {
            logger.error(`❌ Error checking for solution files in ${folderPath}:`, error);
            return false;
        }
    }
}
