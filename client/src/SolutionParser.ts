import { commands, Uri, window, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';
import * as xml2js from 'xml2js';
import { Logger } from './UtilityClasses/Logger';
import { globalSettings } from './globals';

// Import global variables from extension.ts


export class SourceFile {
    constructor(public name: string, public relativePath: string) { }
}

export class ClarionProject {
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

export class ClarionSolution {
    constructor(public name: string = '', public projects: ClarionProject[] = []) { }
}

export class SolutionParser {
    public solution: ClarionSolution;
    public solutionTree: TreeNode | null;
    public defaultPathsToLookin: Record<string, string[]> = {};
    public solutionFilePath: string;

    constructor(filePath: string) {
        this.solutionFilePath = filePath;
        const solutionName = path.basename(filePath);
        this.solution = new ClarionSolution(solutionName, []);
        this.solutionTree = null;
        //  this.initialize();
    }

    public async initialize() {
        this.defaultPathsToLookin = await this.getDefaultPathsFromRedirectionFile();
        this.solution = await this.parseSolution();
        this.solution.projects.forEach(project => {
            Logger.info(`📂 Project: ${project.name}`);
            project.sourceFiles.forEach(sourceFile => {
                Logger.info(`📄 Source File: ${sourceFile.name}`);
                Logger.info(`📄 Source File Path: ${sourceFile.relativePath}`);
            });
            
        });
        Logger.info("📂 Parsed Projects:", this.solution.projects);
        
        await this.buildSolutionTree();
        
    }

    private async getProjectPathsFromRedirectionFile(projectPath: string): Promise<Record<string, string[]>> {
        let projectPathsToLookIn: Record<string, string[]> = {};
    
        // ✅ Pass the specific project path to the parser
        const redirectionFileParser = new RedirectionFileParser("", projectPath);
    
        const redPaths = {
            '.clw': redirectionFileParser.getSearchPaths('.clw', projectPath),
            '.inc': redirectionFileParser.getSearchPaths('.inc', projectPath),
            '.equ': redirectionFileParser.getSearchPaths('.equ', projectPath),
            '.int': redirectionFileParser.getSearchPaths('.int', projectPath)
        };
    
        Logger.info("📂 globalSettings.libsrcPaths:", globalSettings.libsrcPaths);
    
        // ✅ Now, each project gets **its own** paths
        projectPathsToLookIn = {
            '.clw': ['.'].concat(redPaths['.clw']).concat(globalSettings.libsrcPaths),
            '.inc': ['.'].concat(redPaths['.inc']).concat(globalSettings.libsrcPaths),
            '.equ': ['.'].concat(redPaths['.equ']).concat(globalSettings.libsrcPaths),
            '.int': ['.'].concat(redPaths['.int']).concat(globalSettings.libsrcPaths)
        };
    
        Logger.info(`📂 Final Search Paths for ${projectPath}:`, projectPathsToLookIn);
        return projectPathsToLookIn;
    }
    
    public findFileInRedirectionPaths(file: string, pathsToLookin: Record<string, string[]>, projectDir: string): string | null {
        Logger.info(`🔍 Searching for file "${file}" in project redirection paths (Project Dir: ${projectDir})`);
    
        const fileExt = path.extname(file).toLowerCase();
        
        if (!pathsToLookin[fileExt]) {
            Logger.warn(`⚠️ No search paths defined for extension: ${fileExt}`);
            return null;
        }
    
        for (const searchPath of pathsToLookin[fileExt]) {
            // Ensure correct path resolution
            const resolvedSearchPath = path.isAbsolute(searchPath)
                ? path.normalize(searchPath) 
                : path.join(projectDir, searchPath);
    
            const fullPath = path.join(resolvedSearchPath, file);
            const normalizedFullPath = path.normalize(fullPath);
    
            Logger.info(`🔎 Checking: ${normalizedFullPath}`);
    
            if (fs.existsSync(normalizedFullPath)) {
                Logger.info(`✅ File found: ${normalizedFullPath}`);
                return normalizedFullPath;
            }
        }
    
        Logger.warn(`❌ File "${file}" not found in redirection paths`);
        return null;
    }
    

    public findProjectForFile(fileName: string): ClarionProject | undefined {
        Logger.info(`🔍 Searching for project containing file: ${fileName}`);
    
        for (const project of this.solution.projects) {
            const foundSourceFile = project.sourceFiles.find(sourceFile =>
                sourceFile.name.toLowerCase() === fileName.toLowerCase()
            );
    
            if (foundSourceFile) {
                Logger.info(`✅ File "${fileName}" found in project: ${project.name}`);
                return project;
            }
        }
    
        Logger.warn(`❌ File "${fileName}" not found in any project.`);
        return undefined;
    }
    
    
    private async getDefaultPathsFromRedirectionFile(): Promise<Record<string, string[]>> {
        let defaultPathsToLookIn: Record<string, string[]> = {
            '.clw': ['.'],
            '.inc': ['.'],
            '.equ': ['.'],
            '.int': ['.']
        };
    
        for (const project of this.solution.projects) {
            const redirectionFileParser = new RedirectionFileParser("", project.path);

    
            Logger.info(`📂 Resolving search paths for project: ${project.name} at ${project.path}`);
    
            const redPaths = {
                '.clw': redirectionFileParser.getSearchPaths('.clw', project.path),
                '.inc': redirectionFileParser.getSearchPaths('.inc', project.path),
                '.equ': redirectionFileParser.getSearchPaths('.equ', project.path),
                '.int': redirectionFileParser.getSearchPaths('.int', project.path)
            };
    
            // ✅ Add project-specific paths while preserving previous entries
            defaultPathsToLookIn['.clw'].push(...redPaths['.clw']);
            defaultPathsToLookIn['.inc'].push(...redPaths['.inc']);
            defaultPathsToLookIn['.equ'].push(...redPaths['.equ']);
            defaultPathsToLookIn['.int'].push(...redPaths['.int']);
        }
    
        // ✅ Merge with **global libsrc paths** to ensure system-wide paths are included
        for (const key of Object.keys(defaultPathsToLookIn)) {
            defaultPathsToLookIn[key] = Array.from(new Set(
                defaultPathsToLookIn[key].concat(globalSettings.libsrcPaths) // 🔥 Restoring libsrc paths
            ));
        }
    
        Logger.info("🔹 Final Search Paths:", defaultPathsToLookIn);
        return defaultPathsToLookIn;
    }
    
    public findSourceFilePath(sourceFile: SourceFile, destinationFile: string): string | undefined {
        const project = this.findProjectForSourceFile(sourceFile);
        if (project) {
            const pathsToLookin = project.pathsToLookin[this.getExtension(destinationFile)];
            if (pathsToLookin) {
                for (const searchPath of pathsToLookin) {
                    let fullPath: string;
                    if (searchPath.startsWith('.')) {
                        fullPath = path.join(project.path, searchPath, destinationFile);
                    } else {
                        fullPath = path.join(searchPath, destinationFile);
                    }
                    if (fs.existsSync(fullPath)) {
                        return fullPath;
                    }
                }
            }
        }
        return undefined;
    }
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
            Logger.info(String(error));
        }
        return undefined;
    }

    private getExtension(destinationFile: string): string {
        return path.extname(destinationFile).toLowerCase();
    }

    private findProjectForSourceFile(sourceFile: SourceFile): ClarionProject | undefined {
        for (const project of this.solution.projects) {
            if (project.sourceFiles.includes(sourceFile)) {
                return project;
            }
        }
        return undefined;
    }

    public async openFile(relativePath: string): Promise<void> {
        try {
            const absolutePath = path.resolve(path.dirname(this.solutionFilePath), relativePath);
            Logger.info("🔹 Opening file:", absolutePath);

            const fileUri = Uri.file(absolutePath);
            if (!fs.existsSync(absolutePath)) {
                window.showErrorMessage(`File not found: ${absolutePath}`);
                return;
            }

            const doc = await workspace.openTextDocument(fileUri);
            await window.showTextDocument(doc);
        } catch (error) {
            Logger.error("❌ Error opening file:", error);
            window.showErrorMessage(`Error opening file: ${relativePath}`);
        }
    }

    public findFileWithExtension(filename: string): string {
        if (!this.solutionFilePath) {
            Logger.error("❌ No solution file path set.");
            return "";
        }
        const extension = path.extname(filename).toLowerCase();
        const pathsToLookin = this.defaultPathsToLookin[extension] || [];
        const solutionFolder: string = path.dirname(this.solutionFilePath);

        for (let searchPath of pathsToLookin) {
            if (searchPath === '.') {
                searchPath = solutionFolder;
            }
            if (fs.existsSync(searchPath)) {
                const fullPath = path.join(searchPath, filename);
                if (fs.existsSync(fullPath)) {
                    return fullPath;
                }
            }
        }
        return "";
    }



    public async parseSolution(): Promise<ClarionSolution> {
        if (!this.solutionFilePath) {
            Logger.error("❌ Solution file path is not set.");
            return new ClarionSolution();
        }
    
        const solutionContent = fs.readFileSync(this.solutionFilePath, 'utf-8');
        const projectEntryPattern = /Project\("([^"]+)"\) = "([^"]+)", "([^"]+)", "([^"]+)"/g;
        let projectEntryMatch: RegExpExecArray | null;
    
        while ((projectEntryMatch = projectEntryPattern.exec(solutionContent)) !== null) {
            const [, projectType, projectName, projectPath, projectGuid] = projectEntryMatch;
    
            if (!projectPath.toLowerCase().endsWith('.cwproj')) {
                continue;
            }
    
            const projectDir = path.dirname(path.resolve(this.solutionFilePath, '..', projectPath));
            const projectPathsToLookIn = await this.getProjectPathsFromRedirectionFile(projectDir);
            const project = new ClarionProject(projectName, projectType, projectDir, projectGuid, "");
            project.pathsToLookin = projectPathsToLookIn;
    
            // 🔥 ADD THIS - Collect source files
            this.addSourceFilesToProject(project);
    
            this.solution.projects.push(project);
        }
    
        Logger.info("📂 Final Parsed Projects:", this.solution.projects);
        return this.solution;
    }
    
    
    /**
     * Finds the correct file path for a source file using redirection paths.
     */
    // private findFileInRedirectionPaths(file: string, pathsToLookin: Record<string, string[]>, projectDir: string): string | null {
    //     const fileExt = path.extname(file).toLowerCase();
    
    //     if (!pathsToLookin[fileExt]) return null;
    
    //     for (const searchPath of pathsToLookin[fileExt]) {
    //         const fullPath = path.resolve(projectDir, searchPath, file);
    //         if (fs.existsSync(fullPath)) {
    //             return fullPath;
    //         }
    //     }
    
    //     return null;
    // }
    
    private addSourceFilesToProject(project: ClarionProject) {
        const projectFile = path.join(project.path, `${project.name}.cwproj`);
    
        if (!fs.existsSync(projectFile)) {
            Logger.warn(`⚠️ Project file not found: ${projectFile}`);
            return;
        }
    
        const xmlContent = fs.readFileSync(projectFile, 'utf-8');
        
        xml2js.parseString(xmlContent, (err, result) => {
            if (err) {
                Logger.error(`❌ Failed to parse project file: ${projectFile}`, err);
                return;
            }
    
            // Extract all `<Compile Include="file.clw">`
            const compileItems = result.Project.ItemGroup.flatMap((itemGroup: any) =>
                itemGroup.Compile ? itemGroup.Compile.map((c: any) => c.$.Include) : []
            );
    
            Logger.info(`📂 Found ${compileItems.length} source files in ${project.name}`);
    
            for (const file of compileItems) {
                const resolvedPath = this.findFileInRedirectionPaths(file, project.pathsToLookin, project.path);
                if (resolvedPath) {
                    const relativePath = path.relative(project.path, resolvedPath);
                    project.addSourceFile(file, relativePath);
                    Logger.info(`📄 Added ${file} (resolved to ${relativePath}) to ${project.name}`);
                } else {
                    Logger.warn(`⚠️ Could not resolve ${file} using redirection paths.`);
                }
            }
        });
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
}

class TreeNode {
    constructor(public name: string, public children: TreeNode[] = []) { }
}
