// import * as fs from 'fs';
// import * as path from 'path';
// import * as xml2js from 'xml2js';
// import LoggerManager from '../logger';
// import { globalSettings } from '../globals';

// import { ClarionSourcerFile } from './ClarionSourcerFile';
// import { RedirectionFileParser, RedirectionEntry } from '../Parser/RedirectionFileParser';

// const logger = LoggerManager.getLogger("ClarionProject");
// logger.setLevel("error");

// export class ClarionProject {
//     sourceFiles: ClarionSourcerFile[] = [];
//   //  pathsToLookin: Record<string, { path: string, source: string }[]> = {};
//     redirectionEntries: RedirectionEntry[] = []; // ✅ Store parsed redirection entries

//     constructor(
//         public name: string,
//         public type: string,
//         public path: string,
//         public guid: string
//     ) {
//         logger.info(`📂 Initializing project: ${this.name}`);

//         // ✅ Parse the redirection file ONCE and store it
//         this.redirectionEntries = this.parseRedirectionFile();

//       //  this.resolveSearchPaths();
//         // ✅ Load source files immediately
//         this.loadSourceFilesFromProjectFile().then(() => {
//             logger.info(`✅ Loaded source files for ${this.name}`);
//         }).catch(err => {
//             logger.error(`❌ Failed to load source files for ${this.name}:`, err);
//         });
//     }

//     private parseRedirectionFile(): RedirectionEntry[] {
//         logger.info(`📂 Parsing redirection file for project: ${this.name}`);

//         // ✅ Ensure we check the project path for a redirection file
//         const redirectionParser = new RedirectionFileParser(globalSettings.configuration, this.path);
//         return redirectionParser.parseRedFile(this.path); // ✅ Pass the project path to check for a local .red file
//     }


//     public getRedirectionEntries(): RedirectionEntry[] {
//         return this.redirectionEntries;
//     }

//     public addSourceFile(name: string, relativePath: string) {
//         this.sourceFiles.push(new ClarionSourcerFile(name, relativePath, this));
//     }

//      /* ✅ Uses stored redirection entries instead of re-parsing.
//      */
//      public getSearchPaths(fileExtension: string): string[] {
//         logger.info(`🔍 Resolving search paths for extension: ${fileExtension}, using configuration: ${globalSettings.configuration}`);
    
//         // ✅ Normalize file extension (e.g., `.clw` -> `*.clw`)
//         const normalizedExt = fileExtension.startsWith('.') ? `*${fileExtension.toLowerCase()}` : `*.${fileExtension.toLowerCase()}`;
    
//         // ✅ Filter entries matching the current configuration or "Common"
//         const matchingEntries = this.redirectionEntries.filter(entry =>
//             entry.section === "Common" || entry.section === globalSettings.configuration
//         );
    
//         // ✅ Extract and resolve paths
//         const paths: string[] = matchingEntries
//             .filter(entry => entry.extension.toLowerCase() === normalizedExt || entry.extension === "*.*")
//             .flatMap(entry => entry.paths.map(p => path.isAbsolute(p) ? p : path.resolve(this.path, p)));
    
//         // ✅ Ensure the directory containing the redirection file is included
//         paths.push(path.dirname(this.path));
    
//         // ✅ Remove duplicates while preserving order
//         const uniquePaths = Array.from(new Set(paths));
    
//         // ✅ Log final resolved paths
//         logger.info(`✅ Resolved search paths for ${normalizedExt}: (${uniquePaths.length})`);
//         uniquePaths.forEach((path, index) => logger.info(`   ${index + 1}. ${path}`));
    
//         return uniquePaths;
//     }
    

//     /**
//      * ✅ Loads source files by reading the `.cwproj` XML file.
//      */
//     public async loadSourceFilesFromProjectFile(): Promise<void> {
//         const projectFile = path.join(this.path, `${this.name}.cwproj`);

//         if (!fs.existsSync(projectFile)) {
//             logger.warn(`⚠️ Project file not found: ${projectFile}`);
//             return;
//         }

//         const xmlContent = fs.readFileSync(projectFile, 'utf-8');

//         xml2js.parseString(xmlContent, (err, result) => {
//             if (err) {
//                 logger.error(`❌ Failed to parse project file: ${projectFile}`, err);
//                 return;
//             }

//             const compileItems = result.Project.ItemGroup.flatMap((itemGroup: any) =>
//                 itemGroup.Compile ? itemGroup.Compile.map((c: any) => c.$.Include) : []
//             );

//             logger.info(`📂 Found ${compileItems.length} source files in ${this.name}`);

//             for (const file of compileItems) {
//                 const resolvedPath = this.findFileInProjectPaths(file);

//                 if (resolvedPath) {
//                     const relativePath = path.relative(this.path, resolvedPath);
//                     this.addSourceFile(file, relativePath);
//                     logger.info(`📄 Added ${file} (resolved to ${relativePath}) to ${this.name}`);
//                 } else {
//                     logger.warn(`⚠️ Could not resolve ${file} using redirection paths.`);
//                 }
//             }
//         });
//     }

//     /**
//      * ✅ Attempts to resolve a file using this project's `pathsToLookin`.
//      */
//     /**
//   * Searches for a file using the project's redirection paths.
//   */
//     private findFileInProjectPaths(fileName: string): string | null {
//         logger.info(`🔍 Searching in project redirection paths for: ${fileName}`);

//         const fileExt = path.extname(fileName).toLowerCase();
//         const searchPaths = this.getSearchPaths(fileExt); // ✅ Use redirection parser

//         if (!searchPaths.length) {
//             logger.warn(`⚠️ No search paths found for extension: ${fileExt}`);
//             return null;
//         }

//         for (const searchPath of searchPaths) {
//             const resolvedSearchPath = path.isAbsolute(searchPath)
//                 ? path.normalize(searchPath)
//                 : path.join(this.path, searchPath); // ✅ Ensure relative paths are resolved

//             const fullPath = path.join(resolvedSearchPath, fileName);
//             const normalizedFullPath = path.normalize(fullPath);

//             logger.info(`🔎 Checking: ${normalizedFullPath}`);

//             if (fs.existsSync(normalizedFullPath)) {
//                 logger.info(`✅ File found: ${normalizedFullPath}`);
//                 return normalizedFullPath;
//             }
//         }

//         logger.error(`❌ File "${fileName}" not found in project paths`);
//         return null;
//     }

//     /**
//      * Analyzes source files to find dependencies and relationships
//      */
//     public analyzeDependencies(): Map<string, string[]> {
//         const dependencies = new Map<string, string[]>();
        
//         for (const sourceFile of this.sourceFiles) {
//             // Skip files that don't exist
//             if (!sourceFile.exists()) continue;
            
//             const content = sourceFile.getContent();
//             if (!content) continue;
            
//             // Look for INCLUDE statements
//             const includePattern = /INCLUDE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'/ig;
//             const includes = [];
            
//             const matches = sourceFile.findPatternMatches(includePattern);
//             for (const match of matches) {
//                 includes.push(match[1]);
//             }
            
//             if (includes.length > 0) {
//                 dependencies.set(sourceFile.name, includes);
//             }
//         }
        
//         return dependencies;
//     }

// }
