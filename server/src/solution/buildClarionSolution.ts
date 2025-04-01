import { SolutionManager } from './solutionManager';
import { ClarionSourcerFileServer } from './clarionSourceFileServer';
import { ClarionProjectInfo, ClarionSolutionInfo, ClarionSourcerFileInfo } from 'common/types';
import LoggerManager from '../logger';
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

    const projects: ClarionProjectInfo[] = solution.projects.map(project => {
        const sourceFiles: ClarionSourcerFileInfo[] = project.sourceFiles.map((file: ClarionSourcerFileServer) => ({
            name: file.name,
            relativePath: file.relativePath,
            project: {
                name: project.name,
                type: project.type,
                path: project.path,
                guid: project.guid
            }
        }));

        logger.info(`📂 Processed project ${project.name} with ${sourceFiles.length} source files`);
        return {
            name: project.name,
            type: project.type,
            path: project.path,
            guid: project.guid,
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
        // Verify the path is a file and not a directory
        const stat = fs.statSync(solutionPath);
        
        if (stat.isDirectory()) {
            // This should never happen since the user specifically selects a .sln file
            logger.error(`❌ Expected a solution file path but received a directory: ${solutionPath}`);
            throw new Error(`Expected a solution file path but received a directory: ${solutionPath}`);
        }
        
        // Verify it's a .sln file
        if (!solutionPath.toLowerCase().endsWith('.sln')) {
            logger.error(`❌ Path does not point to a .sln file: ${solutionPath}`);
            throw new Error(`Path does not point to a .sln file: ${solutionPath}`);
        }
        
        // Create the solution manager with the specific solution file
        await SolutionManager.create(solutionPath);
        
        logger.info("✅ SolutionManager initialized");
    } catch (error) {
        logger.error(`Error initializing SolutionManager: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
