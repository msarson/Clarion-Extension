import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './Logger';
import { globalSettings } from '../globals';

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

        // ✅ Determine which redirection file to use
        const projectRedFile = path.join(this.projectPath, globalSettings.redirectionFile);
        this.redirectionFile = fs.existsSync(projectRedFile)
            ? projectRedFile
            : path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);

        this.macros = globalSettings.macros;

        Logger.info("🔹 Using Redirection File for Project:", this.redirectionFile);
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
        Logger.info("🔍 Resolving search paths for extension:", fileExtension);
        const paths: string[] = [];
        let redFileToParse: string;

        // ✅ Determine the redirection file location (Project-specific → Global fallback)
        if (foundProjectPath) {
            const projectRedFile = path.resolve(foundProjectPath, this.redirectionFile);
            if (this.fileExists(projectRedFile)) {
                redFileToParse = projectRedFile;
                Logger.info(`📌 Using project-specific redirection file: ${projectRedFile}`);
            } else {
                redFileToParse = path.join(globalSettings.redirectionPath, this.redirectionFile);
                Logger.warn(`⚠️ No project-specific redirection file found, using global redirection file: ${redFileToParse}`);
            }
        } else {
            redFileToParse = path.join(globalSettings.redirectionPath, this.redirectionFile);
            Logger.warn(`⚠️ No project path provided, defaulting to global redirection file: ${redFileToParse}`);
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
        Logger.setDebugMode(true);
        if (!fs.existsSync(redFile)) {
            Logger.warn(`⚠️ Redirection file not found: ${redFile}`);
            return [];
        }
    
        Logger.info(`📂 Parsing redirection file: ${redFile}`);
        const content: string = fs.readFileSync(redFile, 'utf-8');
        const redPath = path.dirname(redFile);
        const paths: string[] = [];
        const lines = content.split('\n');
        let foundSection = "";
    
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('--') || trimmedLine === '') continue; // Skip comments/empty lines
    
            // ✅ Detect Section Headers and Set Active Section
            const sectionMatch = this.extractSection(trimmedLine);
            if (sectionMatch) {
                foundSection = sectionMatch;
                Logger.info(`🔹 Found Section: [${foundSection}]`);
            } 
            // ✅ Process `{include ...}` in order where they appear
            else if (trimmedLine.startsWith('{include')) {
                Logger.info(`🔄 Processing included redirection file: ${trimmedLine}`);
                const pathsMap: Record<string, string[]> = { [fileExtension]: paths };
                this.processIncludedRedirection(redPath, trimmedLine, fileExtension, pathsMap);
            } 
            // ✅ Process Paths for the Active Section
            else if (trimmedLine.includes('=') && foundSection) {
                const extractedPaths = this.processLine(foundSection, trimmedLine, redPath, fileExtension, {});
                if (extractedPaths.length > 0) {
                    Logger.info(`📌 Extracted paths from [${foundSection}]: (${extractedPaths.length})`);
                    extractedPaths.forEach((path, index) => Logger.info(`   ${index + 1}. ${path}`));
                }
                paths.push(...extractedPaths); // ✅ Append paths immediately in order
            }
        }
    
        Logger.info(`✅ Completed parsing redirection file: ${redFile}`);
        Logger.info(`📂 Final ordered paths for .${fileExtension}: (${paths.length})`);
        paths.forEach((path, index) => Logger.info(`   ${index + 1}. ${path}`));
        Logger.setDebugMode(false);
        return paths; // ✅ Now maintains the exact order found in the RED file
    }
    
    

    private extractSection(trimmedLine: string): string | null {
        const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
        return sectionMatch ? sectionMatch[1].trim() : null;
    }

    private shouldSkipSection(section: string): boolean {
        // 🔹 Normalize section names for case-insensitive comparison
        const normalizedSection = section.toLowerCase();
    
        // 🔹 If no compile mode is set, warn the user and default to 'release'
        if (!this.compileMode) {
            Logger.warn("⚠ No compile mode set! Defaulting to 'release'.");
            this.compileMode = "release";  // ✅ Default to 'release'
        }
    
        // 🔹 Always skip 'copy' section
        if (normalizedSection === "copy") return true;
    
        // 🔹 Skip 'debug' if compile mode is 'release'
        if (this.compileMode.toLowerCase() === "release" && normalizedSection === "debug") return true;
    
        // 🔹 Skip 'release' if compile mode is 'debug'
        if (this.compileMode.toLowerCase() === "debug" && normalizedSection === "release") return true;
    
        // 🔹 Process only 'common' and the matching compile mode
        return !(normalizedSection === "common" || normalizedSection === this.compileMode.toLowerCase());
    }
    

    private processIncludedRedirection(redPath: string, line: string, fileExtension: string, pathsMap: Record<string, string[]>): void {
        Logger.info(`🔄 Processing Included File:`, line);
    
        const includePathMatches = line.match(/\{include\s+([^}]+)\}/i);
        if (includePathMatches && includePathMatches[1]) {
            const resolvedPaths = this.resolveMacro(includePathMatches[1]); // May return a string or array
    
            Logger.info(`📂 Resolved Include Paths:`, resolvedPaths);
    
            // Ensure `resolvedPaths` is always an array
            const resolvedPathsArray = Array.isArray(resolvedPaths) ? resolvedPaths : [resolvedPaths];
    
            // Process each resolved path
            for (const resolvedPath of resolvedPathsArray) {
                if (typeof resolvedPath === "string") {
                    const normalizedPath = path.isAbsolute(resolvedPath) 
                    ? path.normalize(resolvedPath) 
                    : path.join(globalSettings.redirectionPath, resolvedPath);

                    Logger.info(`🔍 Checking Include Path:`, normalizedPath);
    
                    if (fs.existsSync(normalizedPath)) {
                        Logger.info(`✅ Found and Parsing Included File:`, normalizedPath);
                        const includedPaths = this.parseRedFile(normalizedPath, fileExtension);
                        pathsMap[fileExtension] = pathsMap[fileExtension] || [];
                        pathsMap[fileExtension].push(...includedPaths);
                    } else {
                        Logger.warn(`⚠️ Include File Not Found:`, normalizedPath);
                    }
                } else {
                    Logger.warn(`⚠️ Unexpected resolved path type:`, resolvedPath);
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
                Logger.error(`Error resolving path "${p.trim()}":`, error);
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
    
        Logger.info(`🔍 Resolving macros in path: ${pathStr}`);
    
        let resolvedPath = pathStr;
        let match;
    
        // Keep resolving macros **until there are no more left**
        while ((match = macroPattern.exec(resolvedPath)) !== null) {
            const macro = match[1];
            const lowerMacro = macro.toLowerCase();
            Logger.info(`🔹 Found macro: ${macro} (normalized as ${lowerMacro})`);
    
            let resolvedValue: string | undefined;
    
            // Built-in macros
            if (lowerMacro === 'bin') {
                resolvedValue = globalSettings.redirectionPath;
                Logger.info(`✅ Resolved %BIN% to: ${resolvedValue}`);
            } else if (lowerMacro === 'redname') {
                resolvedValue = path.basename(this.redirectionFile);
                Logger.info(`✅ Resolved %REDNAME% to: ${resolvedValue}`);
            } else {
                resolvedValue = this.macros[lowerMacro];
            }
    
            // Handle cases where the resolved value is an array
            if (Array.isArray(resolvedValue) && resolvedValue.length > 0) {
                Logger.warn(`⚠️ Macro ${macro} resolves to an array:`, resolvedValue);
                resolvedValue = resolvedValue[0]; // Use the first item
            }
    
            // Handle object case
            if (resolvedValue && typeof resolvedValue === "object" && "$" in resolvedValue) {
                Logger.info(`🔍 Extracting value from macro object:`, resolvedValue);
                resolvedValue = (resolvedValue as any).$.value;
            }
    
            // Ensure resolved value is a string
            if (typeof resolvedValue !== "string") {
                Logger.warn(`⚠️ Macro ${macro} could not be fully resolved, returning original.`);
                resolvedValue = match[0]; // Keep original macro in case of failure
            }
    
            // Replace the macro in the path
            resolvedPath = resolvedPath.replace(match[0], resolvedValue);
            Logger.info(`✅ After replacing ${macro}: ${resolvedPath}`);
        }
    
        // Normalize the final resolved path
        resolvedPath = path.normalize(resolvedPath);
        Logger.info(`✅ Final Fully Resolved Path: ${resolvedPath}`);
    
        return resolvedPath;
    }
    
    
    






}



