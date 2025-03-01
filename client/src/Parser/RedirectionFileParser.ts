import * as path from 'path';
import * as fs from 'fs';
import { globalSettings } from '../globals';
import { workspace } from 'vscode';
import logger from '../logger';


// Import global variables from the extension

/**
 * Parses a Clarion redirection file to extract and resolve file paths for the project.
 */
export class RedirectionFileParser {
    private compileMode: string | null = null;
    private readonly projectPath: string;
    private readonly redirectionFile: string;
    private readonly macros: Record<string, string>;
    
    constructor(compileMode: string | null, projectPath: string) {
        this.compileMode = compileMode;
        this.projectPath = projectPath; // Store the project path
    
        // ✅ Determine the correct redirection file
    
        const projectRedFile = path.join(this.projectPath, globalSettings.redirectionFile);
        const globalRedFile = path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);
    
        if (fs.existsSync(projectRedFile)) {
            this.redirectionFile = projectRedFile;
        } else if (fs.existsSync(globalRedFile)) {
            this.redirectionFile = globalRedFile;
        } else {
            this.redirectionFile = ""; // ✅ Ensure it's empty if no valid redirection file is found
            logger.warn("⚠️ No valid redirection file found. Defaulting to empty.");
        }
    
        this.macros = globalSettings.macros;
        
        logger.info(`🔹 Using Redirection File for Project: ${this.redirectionFile || "None Found"}`);
    }
    

    /**
     * Checks if a file exists at the specified path.
     */
    fileExists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /**
     * Retrieves search paths by locating the redirection file.
     */
    getSearchPaths(fileExtension: string, foundProjectPath: string | null): string[] {
        logger.info("🔍 Resolving search paths for extension:", fileExtension);
        const paths: string[] = [];
        let redFileToParse: string;

        // ✅ Determine the redirection file location (Project-specific → Global fallback)
        if (foundProjectPath) {
            const projectRedFile = path.resolve(foundProjectPath, this.redirectionFile);

            if (this.fileExists(projectRedFile)) {
                redFileToParse = projectRedFile;
                logger.info(`📌 Using project-specific redirection file: ${projectRedFile}`);
            } else {
                redFileToParse = globalSettings.redirectionPath;
                logger.warn(`⚠️ No project-specific redirection file found, using global redirection file: ${redFileToParse}`);
            }
        } else {
            redFileToParse = this.redirectionFile;
            logger.warn(`⚠️ No project path provided, defaulting to global redirection file: ${redFileToParse}`);
        }

        // ✅ Parse the determined redirection file
        const redResult = this.parseRedFile(redFileToParse, fileExtension);

        // ✅ Add the directory containing the redirection file to search paths
        paths.push(path.dirname(redFileToParse));
        paths.push(...redResult);

        return Array.from(new Set(paths));  // ✅ Remove duplicates
    }
    



    /**
     * Parses a redirection file and returns an array of resolved paths.
     */
    public parseRedFile(redFile: string, fileExtension: string): string[] {
        if (!fs.existsSync(redFile)) {
            logger.warn(`⚠️ Redirection file not found: ${redFile}`);
            return [];
        }
    
        logger.info(`📂 Parsing redirection file: ${redFile} (Looking for: *.${fileExtension})`);
        const content: string = fs.readFileSync(redFile, 'utf-8');
        const redPath = path.dirname(redFile);
        const paths: string[] = [];
    
        // ✅ Ensure '.' is added FIRST for each extension when parsing starts
        if (!paths.includes('.')) {
            paths.push('.');  // 🔥 Adds project root first
            logger.info(`📌 Added project root '.' to search paths for .${fileExtension}`);
        }
        const lines = content.split('\n');
        let foundSection = "";
    
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('--') || trimmedLine === '') continue; // Skip comments/empty lines
    
            // ✅ Detect Section Headers and Set Active Section
            const sectionMatch = this.extractSection(trimmedLine);
            if (sectionMatch) {
                foundSection = sectionMatch;
                if (foundSection.toLowerCase() !== "common" && (foundSection.toLowerCase() !== globalSettings.configuration.toLowerCase())) {
                    logger.info(`🔹 Skipping Section: [${foundSection}] (Looking for: *.${fileExtension})`);
                    continue;
                }
                logger.info(`🔹 Found Section: [${foundSection}] (Looking for: *.${fileExtension})`);
            }
            // ✅ Process `{include ...}` in order where they appear
            else if (trimmedLine.startsWith('{include')) {
                logger.info(`🔄 Processing included redirection file for *.${fileExtension}: ${trimmedLine}`);
                const pathsMap: Record<string, string[]> = { [fileExtension]: paths };
    
                this.processIncludedRedirection(redPath, trimmedLine, fileExtension, pathsMap);
            }
            // ✅ Process Paths for the Active Section
            else if (trimmedLine.includes('=') && foundSection) {
                logger.info(`📌 Processing line in [${foundSection}] for *.${fileExtension}: ${trimmedLine}`);
    
                const extractedPaths = this.processLine(foundSection, trimmedLine, redPath, fileExtension, {});
    
                if (extractedPaths.length > 0) {
                    logger.info(`📌 Extracted paths from [${foundSection}] for *.${fileExtension}: (${extractedPaths.length})`);
                    extractedPaths.forEach((path, index) =>  logger.info(`   ${index + 1}. ${path}`));
                }
                paths.push(...extractedPaths); // ✅ Append paths immediately in order
            }
        }
    
        globalSettings.libsrcPaths.forEach(libPath => paths.push(libPath));
    
        // ✅ Remove duplicates while preserving order
        const uniquePaths = paths.filter((path, index) => paths.indexOf(path) === index);
        
        // ✅ Log the final ordered list without duplicates
        logger.info(`✅ Completed parsing redirection file: ${redFile} (Looking for: *.${fileExtension})`);
        logger.info(`📂 Final ordered paths for *.${fileExtension}: (${uniquePaths.length})`);
        uniquePaths.forEach((path, index) =>  logger.info(`   ${index + 1}. ${path}`));
        
        return uniquePaths; // ✅ Return de-duplicated list
    }
    


    private extractSection(trimmedLine: string): string | null {
        const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
        return sectionMatch ? sectionMatch[1].trim() : null;
    }




    private processIncludedRedirection(redPath: string, line: string, fileExtension: string, pathsMap: Record<string, string[]>): void {
        logger.info(`🔄 Processing Included File:`, line);

        const includePathMatches = line.match(/\{include\s+([^}]+)\}/i);
        if (includePathMatches && includePathMatches[1]) {
            const resolvedPaths = this.resolveMacro(includePathMatches[1]); // May return a string or array

            logger.info(`📂 Resolved Include Paths:`, resolvedPaths);

            // Ensure `resolvedPaths` is always an array
            const resolvedPathsArray = Array.isArray(resolvedPaths) ? resolvedPaths : [resolvedPaths];

            // Process each resolved path
            for (const resolvedPath of resolvedPathsArray) {
                if (typeof resolvedPath === "string") {
                    const normalizedPath = path.isAbsolute(resolvedPath)
                        ? path.normalize(resolvedPath)
                        : path.join(globalSettings.redirectionPath, resolvedPath);

                        logger.info(`🔍 Checking Include Path:`, normalizedPath);

                    if (fs.existsSync(normalizedPath)) {
                        logger.info(`✅ Found and Parsing Included File:`, normalizedPath);
                        const includedPaths = this.parseRedFile(normalizedPath, fileExtension);
                        pathsMap[fileExtension] = pathsMap[fileExtension] || [];
                        pathsMap[fileExtension].push(...includedPaths);
                    } else {
                        logger.warn(`⚠️ Include File Not Found:`, normalizedPath);
                    }
                } else {
                    logger.warn(`⚠️ Unexpected resolved path type:`, resolvedPath);
                }
            }
        }
    }




    private processLine(foundSection: string, trimmedLine: string, redPath: string, fileExtension: string, pathsMap: Record<string, string[]>): string[] {
        const parts = trimmedLine.split('=');
        const fileMask = parts[0].trim();
        const includeFileTypes = ['*.clw', '*.inc', '*.equ', '*.int'];

        if (!this.shouldProcessFileType(fileMask, includeFileTypes)) return [];

        const resolvedPaths = this.resolvePaths(parts[1], redPath);
        const fileTypeResolvedPaths = this.filterResolvedPaths(resolvedPaths);

        if (fileMask === '*.*' || fileMask.toLowerCase().includes(fileExtension.toLowerCase())) {
            pathsMap[fileMask] = pathsMap[fileMask] || [];
            pathsMap[fileMask].push(...fileTypeResolvedPaths);
        }

        return fileTypeResolvedPaths; // ✅ Ensure it returns resolved paths
    }


    private filterResolvedPaths(paths: string[]): string[] {
        return paths.flatMap(p => {
            try {
                return this.resolveMacro(p.trim());
            } catch (error) {
                logger.info(`Error resolving path "${p.trim()}":`, error);
                return [];
            }
        });
    }

    private shouldProcessFileType(fileMask: string, includeFileTypes: string[]): boolean {
        if (fileMask === '*.*') return true;
        return includeFileTypes.some(type => fileMask.toLowerCase().includes(type.replace('*', '')));
    }

    private resolvePaths(pathsString: string, basePath: string): string[] {
        return pathsString.split(';').map(p => this.resolveMacro(p.trim())).flat();  // Flatten nested arrays
    }



    private resolveMacro(pathStr: string): string {
        const macroPattern = /%([^%]+)%/g;
        logger.info(`🔍 Resolving macros in path: ${pathStr}`);

        let resolvedPath = pathStr;
        let match;

        // Keep resolving macros **until there are no more left**
        while ((match = macroPattern.exec(resolvedPath)) !== null) {
            const macro = match[1];
            const lowerMacro = macro.toLowerCase();
            logger.info(`🔹 Found macro: ${macro} (normalized as ${lowerMacro})`);

            let resolvedValue: string | undefined;

            // Built-in macros
            if (lowerMacro === 'bin') {
                resolvedValue = globalSettings.redirectionPath;
                logger.info(`✅ Resolved %BIN% to: ${resolvedValue}`);
            } else if (lowerMacro === 'redname') {
                resolvedValue = path.basename(this.redirectionFile);
                logger.info(`✅ Resolved %REDNAME% to: ${resolvedValue}`);
            } else {
                resolvedValue = this.macros[lowerMacro];
            }

            // Handle cases where the resolved value is an array
            if (Array.isArray(resolvedValue) && resolvedValue.length > 0) {
                logger.warn(`⚠️ Macro ${macro} resolves to an array:`, resolvedValue);
                resolvedValue = resolvedValue[0]; // Use the first item
            }

            // Handle object case
            if (resolvedValue && typeof resolvedValue === "object" && "$" in resolvedValue) {
                logger.info(`🔍 Extracting value from macro object:`, resolvedValue);
                resolvedValue = (resolvedValue as any).$.value;
            }

            // Ensure resolved value is a string
            if (typeof resolvedValue !== "string") {
                logger.warn(`⚠️ Macro ${macro} could not be fully resolved, returning original.`);
                resolvedValue = match[0]; // Keep original macro in case of failure
            }

            // Replace the macro in the path
            resolvedPath = resolvedPath.replace(match[0], resolvedValue);
            logger.info(`✅ After replacing ${macro}: ${resolvedPath}`);
        }

        // Normalize the final resolved path
        resolvedPath = path.normalize(resolvedPath);
        logger.info(`✅ Final Fully Resolved Path: ${resolvedPath}`);

        return resolvedPath;
    }









}



