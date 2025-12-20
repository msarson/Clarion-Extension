import * as fs from 'fs';
import * as path from 'path';
import { ClarionSolutionInfo, ClarionProjectInfo } from 'common/types';
import LoggerManager from './LoggerManager';
import { CwprojParser } from './project/CwprojParser';

const logger = LoggerManager.getLogger("SolutionParser");
logger.setLevel("error");

// Create a specialized debug logger for file resolution issues
const fileResolutionLogger = LoggerManager.getLogger("FileResolution");
fileResolutionLogger.setLevel("debug");

/**
 * SolutionParser is a utility class that parses a .sln file locally
 * to extract basic solution structure without requiring the language server.
 * This is used as a fallback when the language client is not ready or when
 * the server request times out.
 */
export class SolutionParser {
    /**
     * Parses a .sln file locally to extract basic solution structure
     * @param solutionFilePath The path to the .sln file
     * @returns A ClarionSolutionInfo object with basic solution structure
     */
    public static async parseFromSolutionFile(solutionFilePath: string): Promise<ClarionSolutionInfo | null> {
        const startTime = performance.now();
        logger.info(`🔄 Parsing solution file locally: ${solutionFilePath}`);

        try {
            if (!fs.existsSync(solutionFilePath)) {
                logger.error(`❌ Solution file does not exist: ${solutionFilePath}`);
                return null;
            }

            const solutionContent = fs.readFileSync(solutionFilePath, 'utf-8');
            const solutionName = path.basename(solutionFilePath, '.sln');
            const solutionDir = path.dirname(solutionFilePath);

            // Extract project information from the solution file
            const projectRegex = /Project\("\{[A-F0-9-]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"\{([A-F0-9-]+)\}"/g;
            const projects: ClarionProjectInfo[] = [];
            let match;

            while ((match = projectRegex.exec(solutionContent)) !== null) {
                const projectName = match[1];
                const projectPath = match[2];
                const projectGuid = match[3];

                // Skip solution folders and other non-Clarion projects
                if (projectPath.endsWith('.cwproj')) {
                    logger.info(`[SLN] Processing project: ${projectName} (${projectPath})`);
                    
                    // Handle project path correctly, whether it's relative or absolute
                    let fullProjectPath: string;
                    let projectDir: string;
                    
                    if (path.isAbsolute(projectPath)) {
                        // If it's already an absolute path, use it directly
                        fullProjectPath = path.normalize(projectPath);
                        projectDir = path.dirname(fullProjectPath);
                    } else {
                        // If it's a relative path, resolve it against the solution directory
                        fullProjectPath = path.normalize(path.join(solutionDir, projectPath));
                        projectDir = path.dirname(fullProjectPath);
                    }
                    
                    logger.info(`[SLN] Full project path: ${fullProjectPath}`);
                    logger.info(`[SLN] Project directory: ${projectDir}`);
                    
                    // Create a basic project info object
                    const projectInfo: ClarionProjectInfo = {
                        name: projectName,
                        type: "ClarionProject", // Add the required type property
                        path: projectDir,
                        guid: projectGuid,
                        filename: path.basename(projectPath),
                        sourceFiles: [] // Empty source files array, will be populated later if needed
                    };

                    // Verify the .cwproj file exists
                    if (fs.existsSync(fullProjectPath)) {
                        try {
                            logger.info(`[SLN] Parsing .cwproj file: ${fullProjectPath}`);
                            fileResolutionLogger.debug(`[FILE_RESOLUTION] Parsing .cwproj file from solution:`);
                            fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Solution: ${solutionName} (${solutionFilePath})`);
                            fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Project: ${projectName} (${projectGuid})`);
                            fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Original path in .sln: ${projectPath}`);
                            fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Full project path: ${fullProjectPath}`);
                            fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Project directory: ${projectDir}`);
                            
                            // Use the enhanced CwprojParser to parse the .cwproj file
                            // Pass the actual .cwproj file path, not just the directory
                            const parsedFiles = await CwprojParser.parse(fullProjectPath, {
                                projectGuid: projectGuid,
                                projectDir: projectDir,
                                solutionDir: solutionDir
                            });
                            
                            // Convert the parsed files to source file objects
                            for (const parsedFile of parsedFiles) {
                                const filePath = parsedFile.absolutePath || parsedFile.displayPath;
                                projectInfo.sourceFiles.push({
                                    name: path.basename(filePath),
                                    relativePath: parsedFile.absolutePath ? path.relative(projectDir, parsedFile.absolutePath) : parsedFile.displayPath,
                                    project: projectInfo
                                });
                            }
                            
                            logger.info(`✅ Found ${projectInfo.sourceFiles.length} source files in project ${projectName}`);
                            
                            // Log the first few files for debugging
                            if (projectInfo.sourceFiles.length > 0) {
                                const firstFew = projectInfo.sourceFiles.slice(0, 3);
                                logger.info(`[SLN] First few files: ${firstFew.map(f => f.name).join(', ')}`);
                                
                                // Add detailed diagnostics for the first few files
                                fileResolutionLogger.debug(`[FILE_RESOLUTION] First few files in project ${projectName}:`);
                                projectInfo.sourceFiles.slice(0, 5).forEach(file => {
                                    const fullPath = path.isAbsolute(file.relativePath)
                                        ? file.relativePath
                                        : path.join(projectDir, file.relativePath);
                                    
                                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - ${file.name}:`);
                                    fileResolutionLogger.debug(`[FILE_RESOLUTION]     - RelativePath: ${file.relativePath}`);
                                    fileResolutionLogger.debug(`[FILE_RESOLUTION]     - FullPath: ${fullPath}`);
                                    fileResolutionLogger.debug(`[FILE_RESOLUTION]     - Exists: ${fs.existsSync(fullPath)}`);
                                });
                            }
                        } catch (cwprojError) {
                            logger.warn(`⚠️ Error parsing .cwproj file for ${projectName}: ${cwprojError instanceof Error ? cwprojError.message : String(cwprojError)}`);
                        }
                    } else {
                        logger.warn(`⚠️ Could not find .cwproj file for ${projectName}: ${fullProjectPath}`);
                        
                        // Try to find the .cwproj file by searching in the project directory
                        try {
                            const projectFiles = fs.readdirSync(projectDir);
                            const cwprojFile = projectFiles.find(file => file.endsWith('.cwproj'));
                            
                            if (cwprojFile) {
                                const altCwprojPath = path.join(projectDir, cwprojFile);
                                logger.info(`[SLN] Found alternative .cwproj file: ${altCwprojPath}`);
                                
                                // Try parsing the alternative .cwproj file
                                const parsedFiles = await CwprojParser.parse(altCwprojPath, {
                                    projectGuid: projectGuid,
                                    projectDir: projectDir,
                                    solutionDir: solutionDir
                                });
                                
                                // Convert the parsed files to source file objects
                                for (const parsedFile of parsedFiles) {
                                    const filePath = parsedFile.absolutePath || parsedFile.displayPath;
                                    projectInfo.sourceFiles.push({
                                        name: path.basename(filePath),
                                        relativePath: parsedFile.absolutePath ? path.relative(projectDir, parsedFile.absolutePath) : parsedFile.displayPath,
                                        project: projectInfo
                                    });
                                }
                                
                                logger.info(`✅ Found ${projectInfo.sourceFiles.length} source files in project ${projectName} using alternative .cwproj file`);
                            } else {
                                logger.warn(`⚠️ No .cwproj files found in project directory: ${projectDir}`);
                            }
                        } catch (dirError) {
                            logger.error(`❌ Error searching for .cwproj files in ${projectDir}: ${dirError instanceof Error ? dirError.message : String(dirError)}`);
                        }
                    }

                    projects.push(projectInfo);
                }
            }

            // Parse Clarion .APP files from Solution Items section
            const applications = this.parseApplicationFiles(solutionContent, solutionDir);

            // Create the solution info object
            const solutionInfo: ClarionSolutionInfo = {
                name: solutionName,
                path: solutionFilePath,
                projects: projects,
                applications: applications
            };

            const endTime = performance.now();
            logger.info(`✅ Solution parsed locally with ${projects.length} projects and ${applications.length} applications in ${(endTime - startTime).toFixed(2)}ms`);

            return solutionInfo;
        } catch (error) {
            logger.error(`❌ Error parsing solution file locally: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Parses .APP files from the Solution Items section of a .sln file
     * @param content The content of the .sln file
     * @param solutionDir The directory containing the .sln file
     * @returns An array of ClarionAppInfo objects
     */
    private static parseApplicationFiles(content: string, solutionDir: string): { name: string, relativePath: string, absolutePath: string }[] {
        try {
            logger.info(`🔍 Parsing Clarion .APP files from Solution Items`);
            
            // Find the "Solution Items" project section
            const solutionItemsRegex = /Project\("\{2150E333-8FDC-42A3-9474-1A3956D46DE8\}"\)\s*=\s*"Solution Items"[^]*?ProjectSection\(SolutionItems\)\s*=\s*postProject([\s\S]*?)EndProjectSection/i;
            const solutionItemsMatch = solutionItemsRegex.exec(content);
            
            if (!solutionItemsMatch) {
                logger.info(`ℹ️ No Solution Items section found in .sln file`);
                return [];
            }
            
            const solutionItemsContent = solutionItemsMatch[1];
            logger.info(`✅ Found Solution Items section`);
            
            // Extract APP file entries (format: "filename.app = filename.app")
            const appRegex = /^\s*(.+?\.app)\s*=\s*(.+?\.app)\s*$/gim;
            let appMatch;
            const applications: { name: string, relativePath: string, absolutePath: string }[] = [];
            
            while ((appMatch = appRegex.exec(solutionItemsContent)) !== null) {
                try {
                    const appFileName = appMatch[1].trim();
                    logger.info(`📱 Found APP file: ${appFileName}`);
                    
                    // Resolve the absolute path
                    let absolutePath: string;
                    if (path.isAbsolute(appFileName)) {
                        absolutePath = path.normalize(appFileName);
                    } else {
                        absolutePath = path.normalize(path.join(solutionDir, appFileName));
                    }
                    
                    // Check if file exists (but still add it even if it doesn't)
                    const exists = fs.existsSync(absolutePath);
                    if (!exists) {
                        logger.warn(`⚠️ APP file does not exist: ${absolutePath}`);
                    } else {
                        logger.info(`✅ Verified APP file exists: ${absolutePath}`);
                    }
                    
                    applications.push({
                        name: path.basename(appFileName),
                        relativePath: appFileName,
                        absolutePath: absolutePath
                    });
                } catch (appError) {
                    logger.error(`❌ Error processing APP file: ${appError instanceof Error ? appError.message : String(appError)}`);
                }
            }
            
            logger.info(`📱 Found ${applications.length} APP file(s)`);
            return applications;
        } catch (error) {
            logger.error(`❌ Error parsing APP files: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Extracts available configurations from a solution file
     * @param solutionFilePath The path to the .sln file
     * @returns An array of available configurations
     */
    public static getAvailableConfigurations(solutionFilePath: string): string[] {
        try {
            if (!fs.existsSync(solutionFilePath)) {
                logger.error(`❌ Solution file does not exist: ${solutionFilePath}`);
                return ["Debug", "Release"]; // Default configurations
            }

            const solutionContent = fs.readFileSync(solutionFilePath, 'utf-8');

            // Extract the SolutionConfigurationPlatforms section
            const sectionPattern = /GlobalSection\(SolutionConfigurationPlatforms\)\s*=\s*preSolution([\s\S]*?)EndGlobalSection/;
            const match = sectionPattern.exec(solutionContent);

            if (!match) {
                logger.warn("⚠️ No configurations found in solution file. Defaulting to Debug/Release.");
                return ["Debug", "Release"];
            }

            const sectionContent = match[1];
            const configurations = sectionContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith("GlobalSection")) // Remove section header
                .map(line => line.split('=')[0].trim()) // Extract left-hand side (config name)
                .map(config => config.split('|')[0].trim()) // Extract everything before the pipe
                .filter(config => config.length > 0); // Ensure only valid names remain

            // Remove duplicates
            const uniqueConfigs = [...new Set(configurations)];

            logger.info(`📂 Extracted configurations from solution: ${JSON.stringify(uniqueConfigs)}`);
            return uniqueConfigs.length > 0 ? uniqueConfigs : ["Debug", "Release"];
        } catch (error) {
            logger.error(`❌ Error extracting configurations from solution file: ${error instanceof Error ? error.message : String(error)}`);
            return ["Debug", "Release"]; // Default configurations
        }
    }
}