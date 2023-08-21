import * as vscode from 'vscode';
import * as path from 'path';     // Import path module
import * as fs from 'fs';         // Import fs module
export class RedLoader {

    private readonly workspaceFolder: string | undefined
    private readonly selectedClarionRedirectionFile: string | '';
    private readonly selectedClarionPath: string | '';
    private readonly macros: Record<string, string>;
    constructor() {

        // this.workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const config = vscode.workspace.getConfiguration();
        this.selectedClarionRedirectionFile = config.get('selectedClarionRedirectionFile') as string;
        this.selectedClarionPath = config.get('selectedClarionPath') as string;
        this.macros = config.get('selectedClarionMacros') as Record<string, string>;
    }

    // Method to retrieve an array of paths to search
    getSearchPaths(fileExtension: string): string[] {

        const redResult = this.parseRedFile(this.selectedClarionRedirectionFile, this.selectedClarionPath, fileExtension);
        // Implement your logic here to determine the paths based on RED and other settings
        const paths: string[] = [];

        // Add the workspace folder as the first path
        if (this.workspaceFolder) {
            paths.push(this.workspaceFolder);
        }
        paths.push(...redResult);
        // Add other paths based on your logic

        return paths;
    }

    private resolveRedFilePath(redFileName: string, basePath: string): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const workspaceFolder of workspaceFolders) {
                const workspaceRedFilePath = path.join(workspaceFolder.uri.fsPath, redFileName);
                if (fs.existsSync(workspaceRedFilePath)) {
                    return workspaceRedFilePath;
                }
            }
        }



        // Check if the default redirection file exists
        const defaultRedFilePath = path.join(basePath, redFileName);
        if (fs.existsSync(defaultRedFilePath)) {
            return defaultRedFilePath;
        }

        // Neither local nor default redirection file exists
        return null;
    }


    // ... (previous code)

    private parseRedFile(
        redFilePath: string,
        basePath: string,
        fileExtension: string
    ): string[] {
        let content: string;
        const redFile = this.resolveRedFilePath(
            this.selectedClarionRedirectionFile,
            this.selectedClarionPath
        );
        if (redFile != null && fs.existsSync(redFile)) {
            content = fs.readFileSync(redFile, 'utf-8');
        } else {
            content = '';
        }

        const pathsMap: Record<string, string[]> = {};
        let currentFileType: string | null = null;

        const lines = content.split('\n');
        lines.forEach(line => {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('{include')) {
                // Process included redirection files
                const includePathMatches = trimmedLine.match(/{include\s+([^}]+)}/i);
                if (includePathMatches && includePathMatches[1]) {
                    const includePath = includePathMatches[1].trim();
                    const resolvedPath = this.resolveRedFilePath(includePath, basePath);
                    if (resolvedPath) {
                        const includedPaths = this.parseRedFile(resolvedPath, path.dirname(resolvedPath), fileExtension);

                        if (currentFileType) {
                            pathsMap[currentFileType] = pathsMap[currentFileType] || [];
                            pathsMap[currentFileType].push(...includedPaths);
                        }
                    }
                }
            } else if (trimmedLine.includes('=')) {
                const parts = trimmedLine.split('=');
                const fileTypes = parts[0].split(',').map(type => type.trim());
                const resolvedPaths: string[] = parts[1]
                    .split(';')
                    .flatMap(p => {
                        try {
                            return this.resolvePaths(p.trim(), basePath);
                        } catch (error) {
                            console.error(`Error resolving path "${p.trim()}":`, error);
                            return []; // Return an empty array to avoid crashing the process
                        }
                    });
                console.log(resolvedPaths);


                fileTypes.forEach(fileType => {
                    const fileTypeResolvedPaths: string[] = [];
                    resolvedPaths.forEach(path => {
                        const resolvedPath = this.resolveMacro(path);
                        if (resolvedPath !== null) {
                            fileTypeResolvedPaths.push(resolvedPath);
                        }
                    });



                    if (fileType === '*.*' || fileType.toLowerCase().includes(fileExtension.toLowerCase())) {
                        if (fileType === '*.*') {
                            // If fileType is *.*, add resolvedPaths to all fileType entries
                     //       Object.keys(pathsMap).forEach(key => {
                                pathsMap[fileType] = pathsMap[fileType] || [];
                                pathsMap[fileType].push(...fileTypeResolvedPaths);
                        //    });
                        } else {
                            try {
                                // If a specific fileType is defined, add resolvedPaths to that entry
                                pathsMap[fileType] = pathsMap[fileType] || []; // Initialize as an empty array if not defined
                                pathsMap[fileType].push(...resolvedPaths);
                            } catch (error) {
                                console.log("Error fileType defined ", error);
                            }
                        }
                    }
                });
            }



        });

        const paths: string[] = Object.values(pathsMap).flat();

        // ... existing code ...

        return paths;
    }

    private resolvePaths(pathsString: string, basePath: string): string[] {
        const paths = pathsString.split(';')
            .map(path => path.trim())
            .map(path => this.resolveMacro(path));

        return paths;
    }

    private resolveMacro(path: string): string {
        const macroPattern = /%([^%]+)%/g;

        return path.replace(macroPattern, (match, macro) => {
            const lowercaseMacro = macro.toLowerCase();
            if (lowercaseMacro === 'bin') {
                return this.selectedClarionPath;
            } else if (this.macros[lowercaseMacro]) {
                return this.macros[lowercaseMacro];
            } else {
                return match; // Keep the original macro if no replacement found
            }
        });
    }








}
