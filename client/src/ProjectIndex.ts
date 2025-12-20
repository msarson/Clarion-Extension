import * as path from 'path';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("ProjectIndex");

// Create a specialized debug logger for file resolution issues
const fileResolutionLogger = LoggerManager.getLogger("FileResolution");
fileResolutionLogger.setLevel("debug");

/**
 * ProjectIndex maintains a bidirectional mapping between files and projects.
 * It uses normalized absolute paths to ensure accurate file-to-project mapping.
 */
export class ProjectIndex {
    // Map of absolute paths (lowercase) to project IDs
    private byAbs: Map<string, Set<string>> = new Map();
    
    // Map of project IDs to absolute paths (lowercase)
    private byProject: Map<string, Set<string>> = new Map();
    
    // 🔧 FIX: Track warned paths to prevent duplicate warnings
    private warnedPaths: Set<string> = new Set();

    /**
     * Adds a file to the index for a specific project
     * @param filePath The file path (will be normalized to absolute path)
     * @param projectId The project ID
     * @param projectPath The project path (used to resolve relative paths)
     */
    public addFile(filePath: string, projectId: string, projectPath: string): void {
        if (!filePath || !projectId) {
            return;
        }

        const startTime = performance.now();

        try {
            // Normalize the file path to an absolute path
            const absPath = this.normalizeToAbsolutePath(filePath, projectPath);
            if (!absPath) {
                fileResolutionLogger.debug(`[FILE_RESOLUTION] Failed to normalize path: ${filePath} (project path: ${projectPath || 'MISSING'})`);
                return;
            }

            // Check if this file is already in other projects
            if (this.byAbs.has(absPath)) {
                const existingProjects = this.byAbs.get(absPath)!;
                if (existingProjects.has(projectId)) {
                    fileResolutionLogger.debug(`[FILE_RESOLUTION] File ${path.basename(filePath)} already in project ${projectId}`);
                } else {
                    fileResolutionLogger.debug(`[FILE_RESOLUTION] File ${path.basename(filePath)} (${absPath}) already in projects: ${Array.from(existingProjects).join(', ')}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION] Adding to project ${projectId} as well`);
                }
            }

            // Add to byAbs map
            if (!this.byAbs.has(absPath)) {
                this.byAbs.set(absPath, new Set<string>());
            }
            this.byAbs.get(absPath)!.add(projectId);

            // Add to byProject map
            if (!this.byProject.has(projectId)) {
                this.byProject.set(projectId, new Set<string>());
            }
            this.byProject.get(projectId)!.add(absPath);

            const endTime = performance.now();
            logger.info(`[INDEX] Added file ${path.basename(filePath)} (${absPath}) to project ${projectId} in ${Math.round(endTime - startTime)}ms`);
        } catch (error) {
            logger.error(`[INDEX] Error adding file to index: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Removes a file from the index for a specific project
     * @param filePath The file path (will be normalized to absolute path)
     * @param projectId The project ID
     * @param projectPath The project path (used to resolve relative paths)
     */
    public removeFile(filePath: string, projectId: string, projectPath: string): void {
        if (!filePath || !projectId) {
            return;
        }

        try {
            // Normalize the file path to an absolute path
            const absPath = this.normalizeToAbsolutePath(filePath, projectPath);
            if (!absPath) {
                return;
            }

            // Remove from byAbs map
            if (this.byAbs.has(absPath)) {
                const projects = this.byAbs.get(absPath)!;
                projects.delete(projectId);
                if (projects.size === 0) {
                    this.byAbs.delete(absPath);
                }
            }

            // Remove from byProject map
            if (this.byProject.has(projectId)) {
                const files = this.byProject.get(projectId)!;
                files.delete(absPath);
                if (files.size === 0) {
                    this.byProject.delete(projectId);
                }
            }

            logger.info(`[INDEX] Removed file ${path.basename(filePath)} (${absPath}) from project ${projectId}`);
        } catch (error) {
            logger.error(`[INDEX] Error removing file from index: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clears all files for a specific project
     * @param projectId The project ID
     */
    public clearProject(projectId: string): void {
        if (!projectId || !this.byProject.has(projectId)) {
            return;
        }

        try {
            // Get all files for this project
            const files = this.byProject.get(projectId)!;
            
            // Remove this project from each file's projects set
            for (const absPath of files) {
                if (this.byAbs.has(absPath)) {
                    const projects = this.byAbs.get(absPath)!;
                    projects.delete(projectId);
                    if (projects.size === 0) {
                        this.byAbs.delete(absPath);
                    }
                }
            }

            // Remove the project from the byProject map
            this.byProject.delete(projectId);

            logger.info(`[INDEX] Cleared all files for project ${projectId}`);
        } catch (error) {
            logger.error(`[INDEX] Error clearing project from index: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clears the entire index
     */
    public clear(): void {
        this.byAbs.clear();
        this.byProject.clear();
        logger.info(`[INDEX] Cleared entire index`);
    }

    /**
     * Gets all projects containing a specific file
     * @param filePath The file path (can be relative or absolute)
     * @param projectPath Optional project path to resolve relative paths
     * @returns Array of project IDs containing the file
     */
    public projectsContainingFile(filePath: string, projectPath?: string): string[] {
        if (!filePath) {
            return [];
        }

        const startTime = performance.now();
        const filename = path.basename(filePath);

        try {
            // Strategy 1: Try exact absolute path match (most reliable)
            const absPath = this.normalizeToAbsolutePath(filePath, projectPath);
            
            if (absPath && this.byAbs.has(absPath)) {
                const projects = Array.from(this.byAbs.get(absPath)!);
                const endTime = performance.now();
                
                if (projects.length > 1) {
                    logger.warn(`⚠️ [INDEX] File ${filename} (${absPath}) found in MULTIPLE projects: ${projects.join(', ')} in ${Math.round(endTime - startTime)}ms`);
                    
                    // Log the absolute paths that produced the hits
                    logger.info(`[INDEX] Absolute paths that produced hits for ${filename}:`);
                    logger.info(`[INDEX] ${absPath}`);
                    
                    // Add detailed diagnostics
                    fileResolutionLogger.debug(`[FILE_RESOLUTION] Multiple project match for ${filename}:`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Absolute path: ${absPath}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Projects: ${projects.join(', ')}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Original path: ${filePath}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Project path: ${projectPath || 'not provided'}`);
                    
                    // Log project paths for each matching project
                    for (const projId of projects) {
                        const projFiles = this.byProject.get(projId);
                        if (projFiles) {
                            fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Project ${projId} has ${projFiles.size} files`);
                        }
                    }
                } else {
                    logger.info(`[INDEX] File ${filename} (${absPath}) found in project ${projects[0]} in ${Math.round(endTime - startTime)}ms`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION] Single project match for ${filename}: ${projects[0]}`);
                }
                
                return projects;
            }
            
            // Strategy 2: Try to find by directory + filename
            // This helps when the path format is slightly different but points to the same file
            if (absPath) {
                const absDir = path.dirname(absPath);
                const absDirLower = absDir.toLowerCase();
                const filenameLower = filename.toLowerCase();
                const matchingByDir = new Set<string>();
                
                // Look for files in the same directory with the same name
                for (const [storedPath, projectIds] of this.byAbs.entries()) {
                    const storedDir = path.dirname(storedPath);
                    const storedFilename = path.basename(storedPath);
                    
                    if (storedDir.toLowerCase() === absDirLower &&
                        storedFilename.toLowerCase() === filenameLower) {
                        for (const projectId of projectIds) {
                            matchingByDir.add(projectId);
                        }
                        logger.info(`[INDEX] Directory+filename match: ${storedPath} matches ${absPath}`);
                    }
                }
                
                if (matchingByDir.size > 0) {
                    const projects = Array.from(matchingByDir);
                    const endTime = performance.now();
                    logger.info(`[INDEX] File ${filename} found in ${projects.length} projects by directory+filename in ${Math.round(endTime - startTime)}ms`);
                    return projects;
                }
            }
            
            // Strategy 3 (FALLBACK): Basename match only - use with extreme caution
            // Only use this as a last resort and add extra validation
            const basenameLower = filename.toLowerCase();
            const matchingProjects = new Set<string>();
            const matchDetails: {projectId: string, path: string}[] = [];
            
            // Only return projects where this basename exists in their byProject set
            for (const [projectId, files] of this.byProject.entries()) {
                for (const absFilePath of files) {
                    if (path.basename(absFilePath).toLowerCase() === basenameLower) {
                        // Extra validation: if we have a projectPath, check if the file could belong to this project
                        if (projectPath) {
                            const normalizedProjectPath = path.normalize(projectPath).toLowerCase();
                            const fileDir = path.dirname(absFilePath).toLowerCase();
                            
                            // Only add if the file is in or under the project directory
                            if (!fileDir.startsWith(normalizedProjectPath)) {
                                logger.info(`[INDEX] Skipping basename match outside project: ${absFilePath} not in ${normalizedProjectPath}`);
                                continue;
                            }
                        }
                        
                        matchingProjects.add(projectId);
                        matchDetails.push({projectId, path: absFilePath});
                        logger.info(`[INDEX] Basename match: ${basenameLower} found in project ${projectId} as ${absFilePath}`);
                        break;
                    }
                }
            }
            
            const endTime = performance.now();
            
            if (matchingProjects.size > 0) {
                if (matchingProjects.size > 1) {
                    logger.warn(`⚠️ [INDEX] File ${basenameLower} found in MULTIPLE projects by basename: ${Array.from(matchingProjects).join(', ')}`);
                    logger.warn(`⚠️ [INDEX] This may indicate a problem with project file resolution. Details:`);
                    matchDetails.forEach(match => {
                        logger.warn(`⚠️ [INDEX]   - Project ${match.projectId}: ${match.path}`);
                    });
                } else {
                    logger.info(`[INDEX] File ${basenameLower} found in 1 project by basename in ${Math.round(endTime - startTime)}ms`);
                }
                
                return Array.from(matchingProjects);
            }
            
            logger.info(`[INDEX] File ${filename} not found in any project in ${Math.round(endTime - startTime)}ms`);
            return [];
        } catch (error) {
            logger.error(`[INDEX] Error finding projects for file: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Gets all files for a specific project
     * @param projectId The project ID
     * @returns Array of absolute file paths
     */
    public filesForProject(projectId: string): string[] {
        if (!projectId || !this.byProject.has(projectId)) {
            return [];
        }

        return Array.from(this.byProject.get(projectId)!);
    }

    /**
     * Gets the number of files in the index
     * @returns The number of unique files in the index
     */
    public fileCount(): number {
        return this.byAbs.size;
    }

    /**
     * Gets the number of projects in the index
     * @returns The number of unique projects in the index
     */
    public projectCount(): number {
        return this.byProject.size;
    }

    /**
     * Normalizes a file path to an absolute path
     * @param filePath The file path to normalize
     * @param basePath The base path to resolve relative paths against
     * @returns The normalized absolute path (lowercase)
     */
    private normalizeToAbsolutePath(filePath: string, basePath?: string): string {
        if (!filePath) {
            fileResolutionLogger.debug(`[FILE_RESOLUTION] Empty file path provided for normalization`);
            return '';
        }

        try {
            // If it's already absolute, just normalize it
            if (path.isAbsolute(filePath)) {
                const normalizedPath = path.normalize(filePath).toLowerCase();
                fileResolutionLogger.debug(`[FILE_RESOLUTION] Normalized absolute path: ${filePath} -> ${normalizedPath}`);
                return normalizedPath;
            }

            // If we have a base path, resolve against it
            if (basePath) {
                const resolvedPath = path.resolve(basePath, filePath);
                const normalizedPath = path.normalize(resolvedPath).toLowerCase();
                fileResolutionLogger.debug(`[FILE_RESOLUTION] Resolved relative path: ${filePath} against ${basePath} -> ${normalizedPath}`);
                return normalizedPath;
            }

            // If we don't have a base path, we can't resolve a relative path
            // 🔧 FIX: Only warn once per file to prevent log spam
            const warnKey = `${filePath}`;
            if (!this.warnedPaths.has(warnKey)) {
                logger.warn(`[INDEX] Cannot resolve relative path without base path: ${filePath}`);
                this.warnedPaths.add(warnKey);
            }
            fileResolutionLogger.debug(`[FILE_RESOLUTION] Failed to resolve relative path without base path: ${filePath}`);
            return '';
        } catch (error) {
            logger.error(`[INDEX] Error normalizing path: ${error instanceof Error ? error.message : String(error)}`);
            return '';
        }
    }

    /**
     * Gets a singleton instance of the ProjectIndex
     */
    private static instance: ProjectIndex | null = null;
    public static getInstance(): ProjectIndex {
        if (!ProjectIndex.instance) {
            ProjectIndex.instance = new ProjectIndex();
        }
        return ProjectIndex.instance;
    }
}