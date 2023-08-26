import * as vscode from 'vscode';
import * as path from 'path';     // Import path module
import * as fs from 'fs';         // Import fs module
/**
 * A class that parses a Clarion redirection file and retrieves an array of paths to search for a given file extension.
 */
export class RedirectionFileParser {


    
    private readonly selectedClarionRedirectionFile: string | '';
    private readonly selectedClarionPath: string | '';
    private readonly macros: Record<string, string>;
    private readonly compileMode: string | null = null;
    constructor(compileMode: string | null) {

        // this.workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const config = vscode.workspace.getConfiguration();
        this.selectedClarionRedirectionFile = config.get('selectedClarionRedirectionFile') as string;
        this.selectedClarionPath = config.get('selectedClarionPath') as string;
        this.macros = config.get('selectedClarionMacros') as Record<string, string>;
        this.compileMode = compileMode;
    }

    /**
     * Checks if a file exists at the given file path.
     * @param filePath The path of the file to check.
     * @returns True if the file exists, false otherwise.
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

        return paths;
    }


    /**
     * Parses a redirection file and returns an array of resolved paths.
     * @param redFile - The path to the redirection file.
     * @param fileExtension - The file extension to filter the resolved paths by.
     * @param compileMode - The compile mode to filter the resolved paths by.
     * @returns An array of resolved paths.
     */
    private parseRedFile(redFile: string, fileExtension: string): string[] {
        const content: string = fs.existsSync(redFile) ?
            fs.readFileSync(redFile, 'utf-8') : '';
        const redPath = path.dirname(redFile);
        const pathsMap: Record<string, string[]> = {};

        const lines = content.split('\n');
        let foundSection = "";
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('--') || trimmedLine === '') {
                continue;
            }
            
            const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
            if (sectionMatch) {
                foundSection = sectionMatch[1].trim();

                if (foundSection.toLowerCase() === "copy") {
                    // Skip "Copy" section

                    foundSection = ""; // Skip
                    continue;
                }

                if (!this.compileMode) {
                    if (foundSection.toLowerCase() === "debug" || foundSection.toLowerCase() === "release") {
                        foundSection = ""; // Skip "Debug" and "Release" sections if compileMode is not provided
                        continue;
                    }
                } else if (foundSection.toLowerCase() !== this.compileMode.toLowerCase() && foundSection.toLowerCase() !== "common") {
                            foundSection = ""; // Skip sections not matching compile mode or common
                            continue;

                }
            }
            else if (trimmedLine.startsWith('{include')) {
                    // Process included redirection files
                    const includePathMatches = trimmedLine.match(/{include\s+([^}]+)}/i);
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
                } else if (trimmedLine.includes('=') && foundSection) {
                    
                    const parts = trimmedLine.split('=');
                    const fileTypes = parts[0].split(',').map(type => type.trim());
                    const resolvedPaths: string[] = parts[1]
                        .split(';')
                        .flatMap(p => {
                            try {
                                return this.resolvePaths(p.trim(), redPath);
                            } catch (error) {
                                console.error(`Error resolving path "${p.trim()}":`, error);
                                return []; // Return an empty array to avoid crashing the process
                            }
                        });

                    const lowercaseFileExtension = fileExtension.toLowerCase();
                    for (const fileType of fileTypes) {
                        const fileTypeResolvedPaths: string[] = resolvedPaths
                            .map(path => this.resolveMacro(path))
                            .filter(resolvedPath => resolvedPath !== null);

                        if (fileType === '*.*' || fileType.toLowerCase().includes(lowercaseFileExtension)) {
                            pathsMap[fileType] = pathsMap[fileType] || [];
                            pathsMap[fileType].push(...fileTypeResolvedPaths);
                        }
                    }
                }
            }

            const paths: string[] = Object.values(pathsMap).flat();
            return paths;
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


