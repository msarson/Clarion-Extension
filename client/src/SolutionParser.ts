import { commands, Uri, window, ExtensionContext, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import { LocationProvider } from './UtilityClasses/LocationProvider';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';
import { parseString } from 'xml2js';
export class SourceFile {
    constructor(public name: string, public relativePath: string) { }
}

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

    addSourceFile(name: string, relativePath: string) {
        this.sourceFiles.push(new SourceFile(name, relativePath));
    }
}


class TreeNode {
    constructor(public name: string, public children: TreeNode[] = []) { }
}

class ClarionSolution {
    constructor(public name: string = '', public projects: ClarionProject[] = []) { }
}
export class SolutionParser {
    public solution: ClarionSolution;
    public solutionTree: TreeNode | null;
    public defaultPathsToLookin: Record<string, string[]> = {};
    constructor(private filePath: string) {
        const solutionName = path.basename(filePath);
        const projects: ClarionProject[] = [];
        this.solution = new ClarionSolution(solutionName, projects);
        this.solutionTree = null;
        this.initialize();
    }

    private async initialize() {
        this.solution = await this.parseSolution();
        await this.buildSolutionTree();
        // this.displaySolutionTree();
        // Perform additional asynchronous initialization
        this.defaultPathsToLookin = await this.getDefaultPathsFromRedirectionFile();
    }


    public findFileWithExtension(filename: string): string {
        const extension = path.extname(filename).toLowerCase(); // Extract and lowercase the extension
        const pathsToLookin = this.defaultPathsToLookin[extension] || [];
        const solutionFolder: string = path.dirname(workspace.getConfiguration().get('applicationSolutionFile') as string);
        for (let searchPath of pathsToLookin) {
            if (searchPath === '.') {
                searchPath = solutionFolder; // Replace '.' with the solution folder
            }

            if (fs.existsSync(searchPath)) {
                const fullPath = path.join(searchPath, filename);
                if (fs.existsSync(fullPath)) {
                    return fullPath; // Return the full path and file name
                }
            }
        }

        return ""; // Return null if the file is not found
    }

    private async getDefaultPathsFromRedirectionFile(): Promise<Record<string, string[]>> {
        // Implement logic to get and return the default pathsToLookin
        // Example:

        let defaultPathsToLookIn: Record<string, string[]> = {};
        const redirectionFileParser = new RedirectionFileParser("");
        defaultPathsToLookIn = {
            '.clw': ['.'].concat(redirectionFileParser.getSearchPaths('.clw', "")),
            '.inc': ['.'].concat(redirectionFileParser.getSearchPaths('.inc', "")),
            '.equ': ['.'].concat(redirectionFileParser.getSearchPaths('.equ', "")),
            '.int': ['.'].concat(redirectionFileParser.getSearchPaths('.int', ""))
        };
        return defaultPathsToLookIn;
    }
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

    private async displaySolutionTree() {


        if (this.solutionTree) {
            // You can now use solution.solutionTree to display the hierarchical structure in your application
            console.log(this.solutionTree);
        } else {
            console.log('Failed to build solution tree.');
        }
    }

    private async parseSolution(): Promise<ClarionSolution> {

        const parsedRedirectionCache: Record<string, Record<string, string[]>> = {};// Cache for parsed redirection files
        const pathsToLookInCache: Record<string, string[]> = {};
        const solutionContent = fs.readFileSync(this.filePath, 'utf-8');
        const selectedRedirectionFile = workspace.getConfiguration().get('selectedClarionRedirectionFile', '');
        const selectedClarionPath = workspace.getConfiguration().get('selectedClarionPath', '');
        const projectEntryPattern = /Project\("([^"]+)"\) = "([^"]+)", "([^"]+)", "([^"]+)"/g;
        let projectEntryMatch: RegExpExecArray | null;

        const projectLocations = new Set<string>(); // Use a Set to store distinct project locations

        while ((projectEntryMatch = projectEntryPattern.exec(solutionContent)) !== null) {
            const [, projectType, projectName, projectPath, projectGuid] = projectEntryMatch;

            if (!projectPath.toLowerCase().endsWith('.cwproj')) {
                continue; // Skip projects that don't have the .cwproj extension
            }

            const projectDir = path.dirname(path.resolve(this.filePath, '..', projectPath));
            projectLocations.add(projectDir); // Add project location to the Set

            let redLocation = '';

            const redirectionFilePath = path.join(projectDir, selectedRedirectionFile);
            if (fs.existsSync(redirectionFilePath)) {
                redLocation = redirectionFilePath;
            } else {
                redLocation = path.join(selectedClarionPath, selectedRedirectionFile);
            }
            const projectContent = fs.readFileSync(path.resolve(this.filePath, '..', projectPath), 'utf-8');
            const buildConfiguration = await this.getBuildConfiguration(projectContent);
            let pathsToLookIn: Record<string, string[]> = {};
            if (redLocation) {


                if (parsedRedirectionCache[redLocation]) {
                    pathsToLookIn = parsedRedirectionCache[redLocation];
                } else {
                    const redirectionFileParser = new RedirectionFileParser(buildConfiguration);
                    pathsToLookIn['.clw'] = redirectionFileParser.getSearchPaths('.clw', projectDir);
                    pathsToLookIn['.inc'] = redirectionFileParser.getSearchPaths('.inc', projectDir);
                    pathsToLookIn['.equ'] = redirectionFileParser.getSearchPaths('.equ', projectDir);
                    pathsToLookIn['.int'] = redirectionFileParser.getSearchPaths('.int', projectDir);
                    parsedRedirectionCache[redLocation] = pathsToLookIn;
                }
            }
            const project = new ClarionProject(
                projectName,
                projectType,
                projectDir,
                projectGuid,
                buildConfiguration
            );
            project.pathsToLookin = pathsToLookIn;
            const sourceFilePattern = /<Compile Include="([^"]+)"/g;
            let sourceFileMatch: RegExpExecArray | null;

            while ((sourceFileMatch = sourceFilePattern.exec(projectContent)) !== null) {
                const [, relativePath] = sourceFileMatch;
                const absolutePath = path.resolve(projectDir, relativePath);
                const sourceFileName = path.basename(absolutePath);
                project.addSourceFile(sourceFileName, relativePath);
            }

            this.solution.projects.push(project);
        }

        return this.solution;
    }
    // async openFile(filePath: string): Promise<void> {
    //     const sourceFile = this.findSourceFile(filePath);
    //     if (sourceFile) {
    //         const fullPath = this.findSourceFilePath(sourceFile);
    //         if (fullPath) {
    //             const document = await workspace.openTextDocument(Uri.file(fullPath));
    //             await window.showTextDocument(document);
    //         } else {
    //             window.showErrorMessage(`File not found: ${filePath}`);
    //         }
    //     } else {
    //         window.showErrorMessage(`Source file not found: ${filePath}`);
    //     }
    // }

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
     * Finds the full path of the source file in the project's pathsToLookin.
     * @param sourceFile The source file to find the path for.
     * @returns The full path of the source file, or undefined if it cannot be found.
     */
    findSourceFilePath(sourceFile: SourceFile, destinarionFile: string): string | undefined {
        const project = this.findProjectForSourceFile(sourceFile);
        if (project) {
            const pathsToLookin = project.pathsToLookin[this.getExtension(destinarionFile)];
            if (pathsToLookin) {
                for (const searchPath of pathsToLookin) {
                    let fullPath: string;
                    if (searchPath.startsWith('.')) {
                        // Relative path, use project's base path
                        fullPath = path.join(project.path, searchPath, destinarionFile);
                    } else {
                        // Absolute path, use as-is
                        fullPath = path.join(searchPath, destinarionFile);
                    }
                    if (fullPath) {

                        if (fs.existsSync(fullPath)) {
                            return fullPath;
                        }
                    }
                }
            }
        }
        return undefined;
    }


    private getExtension(destinarionFile: string) {
        return path.extname(destinarionFile).toLowerCase();
    }

    findProjectForSourceFile(sourceFile: SourceFile): ClarionProject | undefined {
        for (const project of this.solution.projects) {
            if (project.sourceFiles.includes(sourceFile)) {
                return project;
            }
        }
        return undefined;
    }

    private async getBuildConfiguration(projectContent: string): Promise<string> {
        return new Promise((resolve, reject) => {
            parseString(projectContent, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    const configuration = result.Project.PropertyGroup[0].Configuration[0];
                    const value = configuration._ || '';
                    resolve(value);
                }
            });
        });
    }


}


