import { SolutionManager } from './solutionManager';
import { ClarionSourcerFileServer } from './clarionSourceFileServer';
import { ClarionProjectInfo, ClarionSolutionInfo, ClarionSourcerFileInfo } from 'common/types';
import LoggerManager from '../logger';
import { serverSettings } from '../serverSettings';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("BuildClarionSolution");
logger.setLevel("info");

export async function buildClarionSolution(): Promise<ClarionSolutionInfo> {
    const solutionManagerInstance = SolutionManager.getInstance();
    
    if (!solutionManagerInstance) {
        logger.error("❌ SolutionManager not initialized.");
        throw new Error("❌ SolutionManager not initialized.");
    }

    logger.info(`🔄 Building Clarion solution from ${solutionManagerInstance.solutionFilePath}`);
    const solution = solutionManagerInstance.solution;
    
    logger.info(`📊 Solution has ${solution.projects.length} projects`);
    for (let i = 0; i < solution.projects.length; i++) {
        const project = solution.projects[i];
        logger.info(`  - Project ${i+1}/${solution.projects.length}: ${project.name}`);
        logger.info(`    - Path: ${project.path}`);
        logger.info(`    - GUID: ${project.guid}`);
        logger.info(`    - Source Files: ${project.sourceFiles.length}`);
        logger.info(`    - File Drivers: ${project.fileDrivers.length}`);
        logger.info(`    - Libraries: ${project.libraries.length}`);
        logger.info(`    - Project References: ${project.projectReferences.length}`);
        logger.info(`    - None Files: ${project.noneFiles.length}`);
    }

    const projects: ClarionProjectInfo[] = solution.projects.map((project, index) => {
        logger.info(`🔄 Processing project ${index+1}/${solution.projects.length}: ${project.name}`);
        const sourceFiles: ClarionSourcerFileInfo[] = project.sourceFiles.map((file: ClarionSourcerFileServer) => ({
            name: file.name,
            relativePath: file.relativePath,
            project: {
                name: project.name,
                type: project.type,
                path: project.path,
                guid: project.guid,
                filename: project.filename
            }
        }));

        logger.info(`📂 Processed project ${project.name} with ${sourceFiles.length} source files`);
        return {
            name: project.name,
            type: project.type,
            path: project.path,
            guid: project.guid,
            filename: project.filename,
            sourceFiles
        };
    });

    const result = {
        name: solution.name,
        path: solutionManagerInstance.solutionFilePath,
        projects
    };

    logger.info(`✅ Built solution with ${projects.length} projects`);
    return result;
}

// To be called after you know the solution path
export async function initializeSolutionManager(solutionPath: string): Promise<void> {
    logger.info(`🔄 Initializing SolutionManager with path: ${solutionPath}`);
    
    try {
        // Always use the solution file path from server settings if available
        if (serverSettings.solutionFilePath && fs.existsSync(serverSettings.solutionFilePath) &&
            serverSettings.solutionFilePath.toLowerCase().endsWith('.sln')) {
            logger.info(`Using solution file from server settings: ${serverSettings.solutionFilePath}`);
            await SolutionManager.create(serverSettings.solutionFilePath);
            return;
        }
        
        // Fallback to the provided path if it's a file
        if (fs.existsSync(solutionPath) && !fs.statSync(solutionPath).isDirectory()) {
            logger.info(`Using provided solution file path: ${solutionPath}`);
            await SolutionManager.create(solutionPath);
            return;
        }
        
        // If we get here, we don't have a valid solution file
        logger.error(`No valid solution file found`);
        throw new Error(`No valid solution file found`);
        
        logger.info("✅ SolutionManager initialized");
    } catch (error) {
        logger.error(`Error initializing SolutionManager: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
