import { SolutionManager } from './solutionManager';
import { ClarionSourcerFileServer } from './clarionSourceFileServer';
import { ClarionProjectInfo, ClarionSolutionInfo, ClarionSourcerFileInfo } from 'common/types';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("BuildClarionSolution");
logger.setLevel("error");

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
        // Check if the path is a directory
        const stat = fs.statSync(solutionPath);
        if (stat.isDirectory()) {
            logger.info(`Path is a directory, looking for .sln files in: ${solutionPath}`);
            
            // Find a .sln file in the directory
            const files = fs.readdirSync(solutionPath);
            const slnFiles = files.filter((file: string) => file.toLowerCase().endsWith('.sln'));
            
            if (slnFiles.length > 0) {
                // Use the first .sln file found
                const solutionFile = path.join(solutionPath, slnFiles[0]);
                logger.info(`Found solution file: ${solutionFile}`);
                await SolutionManager.create(solutionFile);
            } else {
                logger.error(`No .sln files found in directory: ${solutionPath}`);
                throw new Error(`No .sln files found in directory: ${solutionPath}`);
            }
        } else {
            // Path is already a file
            await SolutionManager.create(solutionPath);
        }
        
        logger.info("✅ SolutionManager initialized");
    } catch (error) {
        logger.error(`Error initializing SolutionManager: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
