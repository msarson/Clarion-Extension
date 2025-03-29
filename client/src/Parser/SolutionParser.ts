// import { commands, Uri, window, workspace, Disposable, languages } from 'vscode';
// import * as path from 'path';
// import * as fs from 'fs';

// import * as xml2js from 'xml2js';
// import { ClarionProject } from './ClarionProject';
// import { ClarionSourcerFile } from './ClarionSourcerFile';
// import { ClarionSolution } from '../ClarionSolution';
// import { globalSettings } from '../globals';
// import LoggerManager from '../logger';
// const logger = LoggerManager.getLogger("SolutionParser");
// logger.setLevel("error");

// export class SolutionParser {
//     public solution: ClarionSolution;
//     public solutionTree: TreeNode | null;
//     public solutionFilePath: string;

//     // Change the constructor to private
//     private constructor(filePath: string) {
//         this.solutionFilePath = filePath;
//         const solutionName = path.basename(filePath);
//         this.solution = new ClarionSolution(solutionName, []);
//         this.solutionTree = null;
//     }

//     public static async create(filePath: string): Promise<SolutionParser> {
//         const parser = new SolutionParser(filePath);
//         await parser.initialize();  // Ensure async initialization runs
//         return parser;
//     }


//     private async initialize() {



//         this.solution = await this.parseSolution();

//         logger.info("📂 Parsed Projects:", this.solution.projects);

//         await this.buildSolutionTree();

//     }


//     private getDefaultLookupExtensions(): string[] {
//         const config = workspace.getConfiguration("clarion");
//         return config.get<string[]>("defaultLookupExtensions") ?? [".clw", ".inc", ".equ", ".eq", ".int"];
//     }

//     /**
//   * Resolves and merges search paths for a project by reading its redirection file.
//   * 
//   * @param projectPath - The root path of the project.
//   * @returns A mapping of file extensions to their resolved search paths.
//   */
//     /**
//  * Resolves and merges search paths for a project by reading its redirection file.
//  * Ensures the order from the redirection file is preserved, appending global paths at the end.
//  * 
//  * @param projectPath - The root path of the project.
//  * @returns A mapping of file extensions to their resolved search paths.
//  */

//     // private async resolveProjectSearchPaths(projectPath: string): Promise<Record<string, string[]>> {
//     //     logger.info(`📂 Resolving search paths for project: ${projectPath}`);

//     //     // ✅ Keep setting-based extensions lookup
//     //     const extensions = this.getDefaultLookupExtensions(); 

//     //     const redirectionFileParser = new RedirectionFileParser(globalSettings.configuration, projectPath);

//     //     // ✅ Retrieve search paths for each relevant file extension
//     //     const searchPathsByExt: Record<string, string[]> = {};

//     //     for (const ext of extensions) {
//     //         const normalizedExt = ext.toLowerCase(); // ✅ Ensure consistent case
//     //         searchPathsByExt[normalizedExt] = redirectionFileParser.getSearchPaths(normalizedExt, projectPath);

//     //         logger.info(`📌 Paths extracted for ${normalizedExt}:`, searchPathsByExt[normalizedExt]); // Log order
//     //     }

//     //     // ✅ Merge project paths with global library paths, ensuring redirection file order is kept
//     //     const finalSearchPaths: Record<string, string[]> = {};
//     //     for (const ext of extensions) {
//     //         const normalizedExt = ext.toLowerCase(); // ✅ Normalize extension case
//     //         finalSearchPaths[normalizedExt] = ['.']
//     //             .concat(searchPathsByExt[normalizedExt]);  // ✅ Preserve order from the redirection file
//     //     }

//     //     logger.info(`📂 Final resolved search paths for ${projectPath}:`, finalSearchPaths);

//     //     return finalSearchPaths;
//     // }



//     public findFileInRedirectionPaths(file: string, pathsToLookin: Record<string, string[]>, projectDir: string): string | null {
//         logger.info(`🔍 Searching for file "${file}" in project redirection paths (Project Dir: ${projectDir})`);

//         const fileExt = path.extname(file).toLowerCase();

//         if (!pathsToLookin[fileExt]) {
//             logger.warn(`⚠️ No search paths defined for extension: ${fileExt}`);
//             return null;
//         }

//         for (const searchPath of pathsToLookin[fileExt]) {
//             // Ensure correct path resolution
//             const resolvedSearchPath = path.isAbsolute(searchPath)
//                 ? path.normalize(searchPath)
//                 : path.join(projectDir, searchPath);

//             const fullPath = path.join(resolvedSearchPath, file);
//             const normalizedFullPath = path.normalize(fullPath);

//             logger.info(`🔎 Checking: ${normalizedFullPath}`);

//             if (fs.existsSync(normalizedFullPath)) {
//                 logger.info(`✅ File found: ${normalizedFullPath}`);
//                 return normalizedFullPath;
//             }
//         }

//         logger.error(`❌ File "${file}" not found in redirection paths`);
//         return null;
//     }


//     public findProjectForFile(fileName: string): ClarionProject | undefined {
//         logger.info(`🔍 Searching for project containing file: ${fileName}`);

//         // ✅ Extract just the filename from the full path
//         const baseFileName = path.basename(fileName).toLowerCase();

//         for (const project of this.solution.projects) {
//             const foundSourceFile = project.sourceFiles.find(sourceFile =>
//                 sourceFile.name.toLowerCase() === baseFileName
//             );

//             if (foundSourceFile) {
//                 logger.info(`✅ Found project for file: ${baseFileName} in project ${project.name}`);
//                 return project;
//             }
//         }

//         logger.info(`❌ File "${baseFileName}" not found in any project.`);
//         return undefined;
//     }


//     /**
//      * Extracts available build configurations from the solution file.
//      */
//     public getAvailableConfigurations(): string[] {
//         if (!this.solutionFilePath || !fs.existsSync(this.solutionFilePath)) {
//             logger.error("❌ Solution file path is not set or does not exist.");
//             return [];
//         }

//         const solutionContent = fs.readFileSync(this.solutionFilePath, "utf-8");
//         const configPattern = /^\s*(.*?)\|Win32\s*=/gm; // Matches `Debug|Win32 = Debug|Win32`
//         const configurations: Set<string> = new Set();

//         let match;
//         while ((match = configPattern.exec(solutionContent)) !== null) {
//             configurations.add(match[1].trim()); // Extracts 'Debug', 'Release', etc.
//         }

//         return Array.from(configurations);
//     }



//     // public findSourceFilePath(sourceFile: ClarionSourcerFile, destinationFile: string): string | undefined {
//     //     const project = this.findProjectForSourceFile(sourceFile);
//     //     if (project) {
//     //         const pathsToLookin = project.pathsToLookin[this.getExtension(destinationFile)];
//     //         if (pathsToLookin) {
//     //             for (const { path: searchPath } of pathsToLookin) {
//     //                 let fullPath: string;
//     //                 if (searchPath.startsWith('.')) {
//     //                     fullPath = path.join(project.path, searchPath, destinationFile);
//     //                 } else {
//     //                     fullPath = path.join(searchPath, destinationFile);
//     //                 }
//     //                 if (fs.existsSync(fullPath)) {
//     //                     return fullPath;
//     //                 }
//     //             }
//     //         }
//     //     }
//     //     return undefined;
//     // }

//     findSourceInProject(filePath: string): ClarionSourcerFile | undefined {
//         try {
//             for (const project of this.solution.projects) {
//                 const foundSourceFile = project.sourceFiles.find(sourceFile =>
//                     sourceFile.relativePath.toLowerCase() === filePath.toLowerCase()
//                 );
//                 if (foundSourceFile) {
//                     return foundSourceFile;
//                 }
//             }
//         } catch (error) {
//             logger.info(String(error));
//         }
//         return undefined;
//     }

//     private getExtension(destinationFile: string): string {
//         return path.extname(destinationFile).toLowerCase();
//     }

//     private findProjectForSourceFile(sourceFile: ClarionSourcerFile): ClarionProject | undefined {
//         for (const project of this.solution.projects) {
//             if (project.sourceFiles.includes(sourceFile)) {
//                 return project;
//             }
//         }
//         return undefined;
//     }

//     public async openFile(relativePath: string): Promise<void> {
//         try {
//             const absolutePath = path.resolve(path.dirname(this.solutionFilePath), relativePath);
//             logger.info("🔹 Opening file:", absolutePath);

//             const fileUri = Uri.file(absolutePath);
//             if (!fs.existsSync(absolutePath)) {
//                 window.showErrorMessage(`File not found: ${absolutePath}`);
//                 return;
//             }

//             const doc = await workspace.openTextDocument(fileUri);
//             await window.showTextDocument(doc);
//         } catch (error) {
//             logger.error("❌ Error opening file:", error);
//             window.showErrorMessage(`Error opening file: ${relativePath}`);
//         }
//     }

//     public findFileWithExtension(filename: string): string {
//         if (!this.solutionFilePath || this.solutionFilePath.trim() === "") {
//             logger.error("❌ No solution file path set.");
//             return "";
//         }
    
//         const extension = path.extname(filename).toLowerCase();
//         const solutionFolder = path.dirname(this.solutionFilePath);
    
//         for (const project of this.solution.projects) {
//             logger.info(`🔍 Searching for '${filename}' in project: ${project.name}`);
    
//             // ✅ Get search paths using the updated `getSearchPaths(extension)`
//             const searchPaths = project.getSearchPaths(extension);
    
//             for (const searchPath of searchPaths) {
//                 let resolvedPath = searchPath === '.' ? solutionFolder : searchPath;
//                 const fullPath = path.join(resolvedPath, filename);
    
//                 if (fs.existsSync(fullPath)) {
//                     logger.info(`✅ File found: ${fullPath}`);
//                     return fullPath;
//                 }
//             }
//         }
    
//         logger.warn(`❌ File '${filename}' not found in any project paths.`);
//         return "";
//     }
    





//     public async parseSolution(): Promise<ClarionSolution> {
//         if (!this.solutionFilePath || this.solutionFilePath.trim() === "") {
//             logger.error("❌ Solution file path is not set. Returning empty solution.");
//             return new ClarionSolution();
//         }

//         const solutionContent = fs.readFileSync(this.solutionFilePath, 'utf-8');
//         const projectEntryPattern = /Project\("([^"]+)"\) = "([^"]+)", "([^"]+)", "([^"]+)"/g;
//         let projectEntryMatch: RegExpExecArray | null;

//         while ((projectEntryMatch = projectEntryPattern.exec(solutionContent)) !== null) {
//             const [, projectType, projectName, projectPath, projectGuid] = projectEntryMatch;

//             if (!projectPath.toLowerCase().endsWith('.cwproj')) {
//                 continue;
//             }

//             const projectDir = path.dirname(path.resolve(this.solutionFilePath, '..', projectPath));
//             const project = new ClarionProject(projectName, projectType, projectDir, projectGuid);
//             // ✅ Ensure that source files are loaded for the project
//             //  project.loadSourceFilesFromProjectFile();

//             this.solution.projects.push(project);
//         }

//         logger.info("📂 Final Parsed Projects:", this.solution.projects);
//         return this.solution;
//     }



//     /**
//      * Finds the correct file path for a source file using redirection paths.
//      */
//     // private findFileInRedirectionPaths(file: string, pathsToLookin: Record<string, string[]>, projectDir: string): string | null {
//     //     const fileExt = path.extname(file).toLowerCase();

//     //     if (!pathsToLookin[fileExt]) return null;

//     //     for (const searchPath of pathsToLookin[fileExt]) {
//     //         const fullPath = path.resolve(projectDir, searchPath, file);
//     //         if (fs.existsSync(fullPath)) {
//     //             return fullPath;
//     //         }
//     //     }

//     //     return null;
//     // }





//     private async buildSolutionTree() {
//         this.solutionTree = new TreeNode(this.solution.name);
//         for (const project of this.solution.projects) {
//             const projectNode = new TreeNode(project.name);
//             for (const sourceFile of project.sourceFiles) {
//                 const sourceFileNode = new TreeNode(sourceFile.name);
//                 projectNode.children.push(sourceFileNode);
//             }
//             this.solutionTree.children.push(projectNode);
//         }
//     }
// }

// class TreeNode {
//     constructor(public name: string, public children: TreeNode[] = []) { }
// }
