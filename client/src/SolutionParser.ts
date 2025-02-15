import { commands, Uri, window, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';
import * as xml2js from 'xml2js';
import { Logger } from './UtilityClasses/Logger';
import { globalSettings, globalSolutionFile } from './globals';

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

    // Change the constructor to private
    private constructor(filePath: string) {
        this.solutionFilePath = filePath;
        const solutionName = path.basename(filePath);
        this.solution = new ClarionSolution(solutionName, []);
        this.solutionTree = null;
    }

    public static async create(filePath: string): Promise<SolutionParser> {
        const parser = new SolutionParser(filePath);
        await parser.initialize();  // Ensure async initialization runs
        return parser;
    }


    private async initialize() {
        const logger = new Logger(); 
        
        
        
        this.solution = await this.parseSolution();
        this.defaultPathsToLookin = await this.getDefaultPathsFromRedirectionFile();
        if(logger.getDebugMode())
          this.debugProjects(logger);
        logger.info("📂 Parsed Projects:", this.solution.projects);

        await this.buildSolutionTree();

    }

    private debugProjects(logger: Logger) {
        this.solution.projects.forEach(project => {
            logger.info(`📂 Project: ${project.name}`);
            project.sourceFiles.forEach(sourceFile => {
                logger.info(`📄 Source File: ${sourceFile.name}`);
                logger.info(`📄 Source File Path: ${sourceFile.relativePath}`);
            });

        });
    }

    private getDefaultLookupExtensions(): string[] {
        const config = workspace.getConfiguration("clarion");
        return config.get<string[]>("defaultLookupExtensions") ?? [".clw", ".inc", ".equ", ".eq"];
    }

    /**
  * Resolves and merges search paths for a project by reading its redirection file.
  * 
  * @param projectPath - The root path of the project.
  * @returns A mapping of file extensions to their resolved search paths.
  */
    /**
 * Resolves and merges search paths for a project by reading its redirection file.
 * Ensures the order from the redirection file is preserved, appending global paths at the end.
 * 
 * @param projectPath - The root path of the project.
 * @returns A mapping of file extensions to their resolved search paths.
 */
  
    private async resolveProjectSearchPaths(projectPath: string): Promise<Record<string, string[]>> {
        const logger = new Logger(false);
        logger.info(`📂 Resolving search paths for project: ${projectPath}`);
    
        // ✅ Keep setting-based extensions lookup
        const extensions = this.getDefaultLookupExtensions(); 
        
        const redirectionFileParser = new RedirectionFileParser(globalSettings.configuration, projectPath);
    
        // ✅ Retrieve search paths for each relevant file extension
        const searchPathsByExt: Record<string, string[]> = {};
    
        for (const ext of extensions) {
            const normalizedExt = ext.toLowerCase(); // ✅ Ensure consistent case
            searchPathsByExt[normalizedExt] = redirectionFileParser.getSearchPaths(normalizedExt, projectPath);
    
            logger.info(`📌 Paths extracted for ${normalizedExt}:`, searchPathsByExt[normalizedExt]); // Log order
        }
    
        // ✅ Merge project paths with global library paths, ensuring redirection file order is kept
        const finalSearchPaths: Record<string, string[]> = {};
        for (const ext of extensions) {
            const normalizedExt = ext.toLowerCase(); // ✅ Normalize extension case
            finalSearchPaths[normalizedExt] = ['.']
                .concat(searchPathsByExt[normalizedExt]);  // ✅ Preserve order from the redirection file
        }
    
        logger.info(`📂 Final resolved search paths for ${projectPath}:`, finalSearchPaths);
        
        return finalSearchPaths;
    }
    


    public findFileInRedirectionPaths(file: string, pathsToLookin: Record<string, string[]>, projectDir: string): string | null {
        const logger = new Logger(); 
        logger.info(`🔍 Searching for file "${file}" in project redirection paths (Project Dir: ${projectDir})`);

        const fileExt = path.extname(file).toLowerCase();

        if (!pathsToLookin[fileExt]) {
            logger.warn(`⚠️ No search paths defined for extension: ${fileExt}`);
            return null;
        }

        for (const searchPath of pathsToLookin[fileExt]) {
            // Ensure correct path resolution
            const resolvedSearchPath = path.isAbsolute(searchPath)
                ? path.normalize(searchPath)
                : path.join(projectDir, searchPath);

            const fullPath = path.join(resolvedSearchPath, file);
            const normalizedFullPath = path.normalize(fullPath);

            logger.info(`🔎 Checking: ${normalizedFullPath}`);

            if (fs.existsSync(normalizedFullPath)) {
                logger.info(`✅ File found: ${normalizedFullPath}`);
                return normalizedFullPath;
            }
        }

        logger.warn(`❌ File "${file}" not found in redirection paths`);
        return null;
    }


    public findProjectForFile(fileName: string): ClarionProject | undefined {
        const logger = new Logger(); 
        logger.info(`🔍 Searching for project containing file: ${fileName}`);

        for (const project of this.solution.projects) {
            const foundSourceFile = project.sourceFiles.find(sourceFile =>
                sourceFile.name.toLowerCase() === fileName.toLowerCase()
            );

            if (foundSourceFile) {
                logger.info(`✅ File "${fileName}" found in project: ${project.name}`);
                return project;
            }
        }

        logger.warn(`❌ File "${fileName}" not found in any project.`);
        return undefined;
    }


    public getDefaultPathsFromRedirectionFile(): Record<string, string[]> {
        const logger = new Logger();
        logger.info("📌 Fetching default paths from redirection file.");
    
        const finalSearchPaths: Record<string, string[]> = {};
        const extensions = this.getDefaultLookupExtensions(); // ✅ Keep setting-based extensions lookup
        logger.info("🔹 Default Extensions:", extensions);
        for (const project of this.solution.projects) {
            const redirectionFileParser = new RedirectionFileParser(globalSettings.configuration, project.path);
            
            logger.info(`📂 Resolving search paths for project: ${project.name} at ${project.path}`);
    
            const redPaths: Record<string, string[]> = {};
    
            for (const ext of extensions) {
                const normalizedExt = ext.toLowerCase();
                redPaths[normalizedExt] = redirectionFileParser.getSearchPaths(normalizedExt, project.path);
            }
    
            for (const ext of Object.keys(redPaths)) {
                if (!finalSearchPaths[ext]) {
                    finalSearchPaths[ext] = [];
                }
                // ✅ Add paths while preserving order and removing duplicates
                redPaths[ext].forEach((path) => {
                    if (!finalSearchPaths[ext].includes(path)) {
                        finalSearchPaths[ext].push(path);
                    }
                });
            }
        }
    
        logger.info("🔹 Final Search Paths:", finalSearchPaths);
        return finalSearchPaths;
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
        const logger = new Logger(); 
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
            logger.info(String(error));
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
        const logger = new Logger(); 
        try {
            const absolutePath = path.resolve(path.dirname(this.solutionFilePath), relativePath);
            logger.info("🔹 Opening file:", absolutePath);

            const fileUri = Uri.file(absolutePath);
            if (!fs.existsSync(absolutePath)) {
                window.showErrorMessage(`File not found: ${absolutePath}`);
                return;
            }

            const doc = await workspace.openTextDocument(fileUri);
            await window.showTextDocument(doc);
        } catch (error) {
            logger.error("❌ Error opening file:", error);
            window.showErrorMessage(`Error opening file: ${relativePath}`);
        }
    }

    public findFileWithExtension(filename: string): string {
        const logger = new Logger(); 
        if (!this.solutionFilePath) {
            logger.error("❌ No solution file path set.");
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
        const logger = new Logger(); 
        if (!this.solutionFilePath) {
            logger.error("❌ Solution file path is not set.");
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
            const projectPathsToLookIn = await this.resolveProjectSearchPaths(projectDir);
            const project = new ClarionProject(projectName, projectType, projectDir, projectGuid, "");
            project.pathsToLookin = projectPathsToLookIn;

            // 🔥 ADD THIS - Collect source files
            this.addSourceFilesToProject(project);

            this.solution.projects.push(project);
        }

        logger.info("📂 Final Parsed Projects:", this.solution.projects);
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
        const logger = new Logger(); 
        const projectFile = path.join(project.path, `${project.name}.cwproj`);

        if (!fs.existsSync(projectFile)) {
            logger.warn(`⚠️ Project file not found: ${projectFile}`);
            return;
        }

        const xmlContent = fs.readFileSync(projectFile, 'utf-8');

        xml2js.parseString(xmlContent, (err, result) => {
            if (err) {
                logger.error(`❌ Failed to parse project file: ${projectFile}`, err);
                return;
            }

            // Extract all `<Compile Include="file.clw">`
            const compileItems = result.Project.ItemGroup.flatMap((itemGroup: any) =>
                itemGroup.Compile ? itemGroup.Compile.map((c: any) => c.$.Include) : []
            );

            logger.info(`📂 Found ${compileItems.length} source files in ${project.name}`);

            for (const file of compileItems) {
                const resolvedPath = this.findFileInRedirectionPaths(file, project.pathsToLookin, project.path);
                if (resolvedPath) {
                    const relativePath = path.relative(project.path, resolvedPath);
                    project.addSourceFile(file, relativePath);
                    logger.info(`📄 Added ${file} (resolved to ${relativePath}) to ${project.name}`);
                } else {
                    logger.warn(`⚠️ Could not resolve ${file} using redirection paths.`);
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
