import { commands, Uri, window, ExtensionContext, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';
import { parseString } from 'xml2js';

// Represents an individual source file with its name and relative path.
export class SourceFile {
    constructor(public name: string, public relativePath: string) { }
}

// Represents an individual project in the solution. It stores project details,
// source files, and paths where additional files can be looked up.
class ClarionProject {
    sourceFiles: SourceFile[] = [];
    pathsToLookin: Record<string, string[]> = {};
    constructor(
        public name: string,
        public type: string,
        public path: string,
        public guid: string,
        public buildConfiguration: string
    ) { }

    // Adds a source file to this project with the given name and relative path.
    addSourceFile(name: string, relativePath: string) {
        this.sourceFiles.push(new SourceFile(name, relativePath));
    }
}

// A simple tree node class used for creating a hierarchical representation of the solution.
class TreeNode {
    constructor(public name: string, public children: TreeNode[] = []) { }
}

// Represents the overall solution containing multiple projects.
class ClarionSolution {
    constructor(public name: string = '', public projects: ClarionProject[] = []) { }
}

// The main class responsible for parsing a solution file, building the project tree,
// and providing methods to find and retrieve file paths.
export class SolutionParser {
    public solution: ClarionSolution;
    public solutionTree: TreeNode | null;
    // This maps file extensions to default search paths.
    public defaultPathsToLookin: Record<string, string[]> = {};

    // Initializes the solution parser with the file path of the solution.
    constructor(private filePath: string) {
        const solutionName = path.basename(filePath);
        const projects: ClarionProject[] = [];
        this.solution = new ClarionSolution(solutionName, projects);
        this.solutionTree = null;
        this.initialize();
    }

    // Asynchronous initialization that parses the solution, builds a tree representation,
    // and retrieves default search paths from a redirection file.
    private async initialize() {
        this.solution = await this.parseSolution();
        await this.buildSolutionTree();
        // this.displaySolutionTree(); // Optionally displays the solution tree in console
        this.defaultPathsToLookin = await this.getDefaultPathsFromRedirectionFile();
    }

    // Finds a file with the provided extension by looking into default search directories.
    public findFileWithExtension(filename: string): string {
        const extension = path.extname(filename).toLowerCase(); // lower case extension
        const pathsToLookin = this.defaultPathsToLookin[extension] || [];
        const solutionFolder: string = path.dirname(workspace.getConfiguration().get('applicationSolutionFile') as string);
        for (let searchPath of pathsToLookin) {
            if (searchPath === '.') {
                searchPath = solutionFolder; // Replace '.' with the actual solution folder
            }
            if (fs.existsSync(searchPath)) {
                const fullPath = path.join(searchPath, filename);
                if (fs.existsSync(fullPath)) {
                    return fullPath; // Return the full file path if it exists
                }
            }
        }
        return ""; // Returns empty string if file isn't found
    }

    // Retrieves the default paths from a redirection file using RedirectionFileParser.
    private async getDefaultPathsFromRedirectionFile(): Promise<Record<string, string[]>> {
        let defaultPathsToLookIn: Record<string, string[]> = {};
        const redirectionFileParser = new RedirectionFileParser("");
        // For each file extension, set the default search path list
        defaultPathsToLookIn = {
            '.clw': ['.'].concat(redirectionFileParser.getSearchPaths('.clw', "")),
            '.inc': ['.'].concat(redirectionFileParser.getSearchPaths('.inc', "")),
            '.equ': ['.'].concat(redirectionFileParser.getSearchPaths('.equ', "")),
            '.int': ['.'].concat(redirectionFileParser.getSearchPaths('.int', ""))
        };
        return defaultPathsToLookIn;
    }

    // Builds a tree structure of the solution containing projects and their source files.
    private async buildSolutionTree() {
        this.solutionTree = new TreeNode(this.solution.name);
        for (const project of this.solution.projects) {
            const projectNode = new TreeNode(project.name);
            for (const sourceFile of project.sourceFiles) {
                const sourceFileNode = new TreeNode(sourceFile.name);
                projectNode.children.push(sourceFileNode);
            }
            this.solutionTree.children.push(projectNode);
        }
    }

    // Logs the constructed solution tree to the console.
    private async displaySolutionTree() {
        if (this.solutionTree) {
            console.log(this.solutionTree);
        } else {
            console.log('Failed to build solution tree.');
        }
    }

    // Parses the solution file to extract project details and their source files.
    private async parseSolution(): Promise<ClarionSolution> {
        // Caches for redirection file parsing results for efficiency.
        const parsedRedirectionCache: Record<string, Record<string, string[]>> = {};
        const pathsToLookInCache: Record<string, string[]> = {};

        // Read the solution file content.
        const solutionContent = fs.readFileSync(this.filePath, 'utf-8');
        // Get user-selected redirection file settings and Clarion path from workspace configuration.
        const selectedRedirectionFile = workspace.getConfiguration().get('selectedClarionRedirectionFile', '');
        const selectedClarionPath = workspace.getConfiguration().get('selectedClarionPath', '');
        // Regular expression to match each project entry from the solution file.
        const projectEntryPattern = /Project\("([^"]+)"\) = "([^"]+)", "([^"]+)", "([^"]+)"/g;
        let projectEntryMatch: RegExpExecArray | null;

        const projectLocations = new Set<string>(); // Store distinct project directories

        // Iterate through each match found in the solution file.
        while ((projectEntryMatch = projectEntryPattern.exec(solutionContent)) !== null) {
            const [, projectType, projectName, projectPath, projectGuid] = projectEntryMatch;

            // Skip projects that aren't Clarion projects (based on file extension)
            if (!projectPath.toLowerCase().endsWith('.cwproj')) {
                continue;
            }

            // Resolve the absolute directory of the project.
            const projectDir = path.dirname(path.resolve(this.filePath, '..', projectPath));
            projectLocations.add(projectDir);

            let redLocation = '';
            const redirectionFilePath = path.join(projectDir, selectedRedirectionFile);
            if (fs.existsSync(redirectionFilePath)) {
                redLocation = redirectionFilePath;
            } else {
                redLocation = path.join(selectedClarionPath, selectedRedirectionFile);
            }

            // Read the project file content.
            const projectContent = fs.readFileSync(path.resolve(this.filePath, '..', projectPath), 'utf-8');
            // Retrieve the build configuration from the project content.
            const buildConfiguration = await this.getBuildConfiguration(projectContent);
            let pathsToLookIn: Record<string, string[]> = {};
            if (redLocation) {
                // Use cache if previously parsed.
                if (parsedRedirectionCache[redLocation]) {
                    pathsToLookIn = parsedRedirectionCache[redLocation];
                } else {
                    // Parse the redirection file for each extension using the parser.
                    const redirectionFileParser = new RedirectionFileParser(buildConfiguration);
                    pathsToLookIn['.clw'] = redirectionFileParser.getSearchPaths('.clw', projectDir);
                    pathsToLookIn['.inc'] = redirectionFileParser.getSearchPaths('.inc', projectDir);
                    pathsToLookIn['.equ'] = redirectionFileParser.getSearchPaths('.equ', projectDir);
                    pathsToLookIn['.int'] = redirectionFileParser.getSearchPaths('.int', projectDir);
                    parsedRedirectionCache[redLocation] = pathsToLookIn;
                }
            }
            // Create a ClarionProject instance with the parsed project details.
            const project = new ClarionProject(
                projectName,
                projectType,
                projectDir,
                projectGuid,
                buildConfiguration
            );
            project.pathsToLookin = pathsToLookIn;
            // Regular expression to find all source files referenced in the project file.
            const sourceFilePattern = /<Compile Include="([^"]+)"/g;
            let sourceFileMatch: RegExpExecArray | null;
            while ((sourceFileMatch = sourceFilePattern.exec(projectContent)) !== null) {
                const [, relativePath] = sourceFileMatch;
                const absolutePath = path.resolve(projectDir, relativePath);
                const sourceFileName = path.basename(absolutePath);
                project.addSourceFile(sourceFileName, relativePath);
            }
            // Add the project to the solution.
            this.solution.projects.push(project);
        }
        return this.solution;
    }

    // Finds a source file in the solution that matches the given file path.
    findSourceInProject(filePath: string): SourceFile | undefined {
        try {
            for (const project of this.solution.projects) {
                const foundSourceFile = project.sourceFiles.find(sourceFile =>
                    sourceFile.relativePath.toLowerCase() === filePath.toLowerCase()
                );
                if (foundSourceFile) {
                    return foundSourceFile;
                }
            }
        } catch (error) {
            console.log(error);
        }
        return undefined;
    }

    /**
     * Finds the full path of the destination file in a project's defined search paths.
     * @param sourceFile The source file object.
     * @param destinarionFile The file name to search for.
     * @returns The full path if the file exists, otherwise undefined.
     */
    findSourceFilePath(sourceFile: SourceFile, destinarionFile: string): string | undefined {
        const project = this.findProjectForSourceFile(sourceFile);
        if (project) {
            const pathsToLookin = project.pathsToLookin[this.getExtension(destinarionFile)];
            if (pathsToLookin) {
                for (const searchPath of pathsToLookin) {
                    let fullPath: string;
                    if (searchPath.startsWith('.')) {
                        // For relative paths, append the search path to the project's base path.
                        fullPath = path.join(project.path, searchPath, destinarionFile);
                    } else {
                        // For absolute paths, use them directly.
                        fullPath = path.join(searchPath, destinarionFile);
                    }
                    if (fs.existsSync(fullPath)) {
                        return fullPath;
                    }
                }
            }
        }
        return undefined;
    }

    // Helper to extract and lowercase the extension of a file.
    private getExtension(destinarionFile: string) {
        return path.extname(destinarionFile).toLowerCase();
    }

    // Finds the project that contains the given source file.
    findProjectForSourceFile(sourceFile: SourceFile): ClarionProject | undefined {
        for (const project of this.solution.projects) {
            if (project.sourceFiles.includes(sourceFile)) {
                return project;
            }
        }
        return undefined;
    }

    // Parses the project file's XML content to extract the build configuration setting.
    private async getBuildConfiguration(projectContent: string): Promise<string> {
        return new Promise((resolve, reject) => {
            parseString(projectContent, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    // Retrieves configuration value from the XML structure.
                    const configuration = result.Project.PropertyGroup[0].Configuration[0];
                    const value = configuration._ || '';
                    resolve(value);
                }
            });
        });
    }
}
