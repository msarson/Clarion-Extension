import { workspace } from 'vscode';
import * as path from 'path';     // Import path module
import * as fs from 'fs';         // Import fs module

/**
 * Parses a Clarion redirection file to extract and resolve file paths for the project.
 *
 * This class reads a redirection file specified in the workspace configuration and extracts paths using
 * a set of rules defined by a compile mode, file extension filters, and macros. The parser performs the
 * following tasks:
 *
 * - Fetches configuration settings including the selected redirection file, Clarion path, and additional macros.
 * - Checks for the existence of the redirection file in different locations based on provided project paths.
 * - Reads and parses the redirection file to resolve paths, applying macros where needed.
 * - Processes sections and lines in the redirection file, handling included redirection files recursively.
 * - Filters the extracted file paths based on the provided file extension and compile mode.
 *
 * @remarks
 * The class is intended to integrate with a Clarion project environment where redirection files define
 * various file search paths. It supports directives like "{include ...}" for nested redirection and
 * conditionally skips sections not matching the current compile mode.
 *
 * @example
 * ```typescript
 * const parser = new RedirectionFileParser("release");
 * const searchPaths = parser.getSearchPaths(".clw", "/path/to/project");
 * console.log(searchPaths);
 * ```
 *
 * @public
 */
export class RedirectionFileParser {



    private readonly selectedClarionRedirectionFile: string | '';
    private readonly selectedClarionPath: string | '';
    private readonly macros: Record<string, string>;
    private readonly compileMode: string | null = null;
    constructor(compileMode: string | null) {


        const config = workspace.getConfiguration();
        this.selectedClarionRedirectionFile = config.get('selectedClarionRedirectionFile') as string;
        this.selectedClarionPath = config.get('selectedClarionPath') as string;
        this.macros = config.get('selectedClarionMacros') as Record<string, string>;
        this.compileMode = compileMode;
    }

 
    /**
     * Checks whether a file exists at the specified file path.
     *
     * @param filePath - The path of the file to be checked.
     * @returns True if the file exists; otherwise, false.
     */
    fileExists(filePath: string): boolean {
        if (fs.existsSync(filePath)) {
            return true;
        }
        return false;
    }

    /**
     * Returns an array of search paths based on the provided file extension, project path, and compile mode.
     * @param fileExtension - The file extension to search for.
     * @param foundProjectPath - The path to the project, if found.
     * @param compileMode - The compile mode to use.
     * @returns An array of search paths.
     */


    /**
     * Retrieves an array of unique search paths by locating the redirection file based on the provided parameters.
     * 
     * The method first attempts to use the found project path to locate the redirection file, if available.
     * If the redirection file is not found in the specified project path, or if no project path is provided,
     * it falls back to using the selected Clarion path. It then processes the located redirection file to extract
     * additional search paths and returns a deduplicated list of all paths.
     *
     * @param fileExtension - The file extension used for filtering or processing within the redirection file.
     * @param foundProjectPath - An optional path representing the project's location to search for the redirection file.
     *                           If provided, the method will prioritize searching in this path.
     * @returns An array of unique search paths compiled from the project and additional locations specified in the redirection file.
     */
    getSearchPaths(fileExtension: string, foundProjectPath: string | null): string[] {
        const paths: string[] = [];
        let pathToSearch: string;
        let redResult;

        //set pathToSearch to the project path if found
        if (foundProjectPath) {
            //look for RED file in the path

            const redFile = path.join(foundProjectPath, this.selectedClarionRedirectionFile);
            if (this.fileExists(redFile)) {
                pathToSearch = path.join(foundProjectPath, this.selectedClarionRedirectionFile);
            } else {
                pathToSearch = path.join(this.selectedClarionPath, this.selectedClarionRedirectionFile);
            }

        }
        else {
            pathToSearch = path.join(this.selectedClarionPath, this.selectedClarionRedirectionFile);
        }
        redResult = this.parseRedFile(pathToSearch, fileExtension);


        if (pathToSearch) {
            paths.push(path.dirname(pathToSearch));
        }
        paths.push(...redResult);
        // Add other paths based on your logic
        const uniquePaths = Array.from(new Set(paths));

        return uniquePaths;
        //return paths;
    }


    /**
     * Parses a redirection file and returns an array of resolved paths.
     * @param redFile - The path to the redirection file.
     * @param fileExtension - The file extension to filter the resolved paths by.
     * @param compileMode - The compile mode to filter the resolved paths by.
     * @returns An array of resolved paths.
     */
    public parseRedFile(redFile: string, fileExtension: string): string[] {
        const content: string = fs.existsSync(redFile) ? fs.readFileSync(redFile, 'utf-8') : '';
        const redPath = path.dirname(redFile);
        const pathsMap: Record<string, string[]> = {};
        const lines = content.split('\n');
        let foundSection = "";
    
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('--') || trimmedLine === '') {
                continue;
            }
    
            const sectionMatch = this.extractSection(trimmedLine);
            if (sectionMatch) {
                foundSection = sectionMatch;
                if (this.shouldSkipSection(foundSection)) {
                    continue;
                }
            } else if (trimmedLine.startsWith('{include')) {
                this.processIncludedRedirection(redPath, trimmedLine, fileExtension, pathsMap);
            } else if (trimmedLine.includes('=') && foundSection) {
                this.processLine(foundSection, trimmedLine, redPath, fileExtension, pathsMap);
            }
        }
    
        return Object.values(pathsMap).flat();
    }
    
    private extractSection(trimmedLine: string): string | null {
        const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
        return sectionMatch ? sectionMatch[1].trim() : null;
    }
    
    private shouldSkipSection(section: string): boolean {
        if (section.toLowerCase() === "copy" || (!this.compileMode && (section.toLowerCase() === "debug" || section.toLowerCase() === "release"))) {
            return true;
        }
    
        if (this.compileMode && section.toLowerCase() !== this.compileMode.toLowerCase() && section.toLowerCase() !== "common") {
            return true;
        }
    
        return false;
    }
    
    private processIncludedRedirection(redPath: string, line: string, fileExtension: string, pathsMap: Record<string, string[]>): void {
        const includePathMatches = line.match(/{include\s+([^}]+)}/i);
        if (includePathMatches && includePathMatches[1]) {
            const includedRedFileName = this.resolveMacro(includePathMatches[1]);
            const includeDirectoryPath = path.dirname(includedRedFileName);
    
            if (includeDirectoryPath) {
                const includedPaths = this.parseRedFile(includedRedFileName, fileExtension);
                if (fileExtension) {
                    if (!pathsMap[fileExtension]) {
                        pathsMap[fileExtension] = [];
                    }
                    pathsMap[fileExtension].push(...includedPaths);
                }
            }
        }
    }
    
    private processLine(foundSection: string, trimmedLine: string, redPath: string, fileExtension: string, pathsMap: Record<string, string[]>): void {
        const parts = trimmedLine.split('=');
        const fileMask = parts[0].trim();
        const includeFileTypes = ['*.clw', '*.inc', '*.equ', '*.int'];
        const shouldProcess = this.shouldProcessFileType(fileMask, includeFileTypes);
        if (!shouldProcess) {
            return;
        }
    
        const resolvedPaths = this.resolvePaths(parts[1], redPath);
        const fileTypeResolvedPaths = this.filterResolvedPaths(resolvedPaths);
    
        if (fileMask === '*.*' || fileMask.toLowerCase().includes(fileExtension.toLowerCase())) {
            pathsMap[fileMask] = pathsMap[fileMask] || [];
            pathsMap[fileMask].push(...fileTypeResolvedPaths);
        }
    }
    
    private filterResolvedPaths(paths: string[]): string[] {
        return paths.flatMap(p => {
            try {
                return this.resolveMacro(p.trim());
            } catch (error) {
                console.error(`Error resolving path "${p.trim()}":`, error);
                return []; // Return an empty array to avoid crashing the process
            }
        });
    }
    


    private shouldProcessFileType(fileMask: string, includeFileTypes: string[]): boolean {
        if (fileMask === '*.*') {
            return true;
        }
        const lowercaseFileType = fileMask.toLowerCase();
        for (const includedType of includeFileTypes) {
            const lowercaseIncludedType = includedType.toLowerCase();
            if (lowercaseIncludedType === lowercaseFileType ||
                (lowercaseIncludedType.includes('*') && this.matchesWildcard(lowercaseFileType, lowercaseIncludedType))) {
                return true;
            }
        }
        return false;
    }
    private matchesWildcard(text: string, pattern: string): boolean {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
        const regex = new RegExp(`^${escapedPattern}$`);
        return regex.test(text);
    }


    /**
     * Resolves the paths in the given string and returns an array of resolved paths.
     * @param pathsString - A string containing paths separated by semicolons.
     * @param basePath - The base path to resolve the paths against.
     * @returns An array of resolved paths.
     */
    private resolvePaths(pathsString: string, basePath: string): string[] {
        const paths = pathsString.split(';')
            .map(path => path.trim())
            .map(path => this.resolveMacro(path));

        return paths;
    }

    /**
     * Resolves macros in the given path string.
     * @param path - The path string to resolve macros in.
     * @returns The resolved path string.
     */
    private resolveMacro(path: string): string {
        const macroPattern = /%([^%]+)%/g;

        return path.replace(macroPattern, (match, macro) => {
            const lowercaseMacro = macro.toLowerCase();
            if (lowercaseMacro === 'bin') {
                return this.selectedClarionPath;
            } else if (lowercaseMacro === 'redname') {
                return this.selectedClarionRedirectionFile;
            } else if (this.macros[lowercaseMacro]) {
                return this.macros[lowercaseMacro];
            } else {
                return match; // Keep the original macro if no replacement found
            }
        });
    }
}


