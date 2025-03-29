// import * as path from 'path';
// import * as fs from 'fs';
// import { globalSettings } from '../globals';
// import { workspace } from 'vscode';
// import LoggerManager from '../logger';
// const logger = LoggerManager.getLogger("RedurectionParser");

// logger.setLevel("error"); // Set the log level to error
// // Import global variables from the extension

// /**
//  * Parses a Clarion redirection file to extract and resolve file paths for the project.
//  */
// export interface RedirectionEntry {
//     redFile: string;   // Which red file this entry came from
//     section: string;   // Section name (Debug, Release, Common, etc.)
//     extension: string; // File extension (e.g., *.clw, *.inc)
//     paths: string[];   // List of resolved paths
// }



// export class RedirectionFileParser {
//     private compileMode: string | null = null;
//     private readonly projectPath: string;
//     private readonly redirectionFile: string;
//     private readonly macros: Record<string, string>;

//     constructor(compileMode: string | null, projectPath: string) {
//         this.compileMode = compileMode;
//         this.projectPath = projectPath; // Store the project path

//         // ✅ Determine the correct redirection file

//         const projectRedFile = path.join(this.projectPath, globalSettings.redirectionFile);
//         const globalRedFile = path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);

//         if (fs.existsSync(projectRedFile)) {
//             this.redirectionFile = projectRedFile;
//         } else if (fs.existsSync(globalRedFile)) {
//             this.redirectionFile = globalRedFile;
//         } else {
//             this.redirectionFile = ""; // ✅ Ensure it's empty if no valid redirection file is found
//             logger.warn("⚠️ No valid redirection file found. Defaulting to empty.");
//         }

//         this.macros = globalSettings.macros;

//         logger.info(`🔹 Using Redirection File for Project: ${this.redirectionFile || "None Found"}`);
//     }


//     /**
//      * Checks if a file exists at the specified path.
//      */
//     fileExists(filePath: string): boolean {
//         return fs.existsSync(filePath);
//     }

//     /**
//      * Parses a redirection file and returns an array of resolved paths.
//      */
  


//     private extractSection(trimmedLine: string): string | null {
//         const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
//         return sectionMatch ? sectionMatch[1].trim() : null;
//     }

//     public parseRedFile(projectPath: string): RedirectionEntry[] {
//         let redFileToParse: string;
//         const redirectionEntries: RedirectionEntry[] = [];
//         let isFirstRedFile = true; // ✅ Tracks if we're parsing the root red file
    
//         // ✅ Determine whether to use the project-specific redirection file or the global fallback
//         const projectRedFile = path.join(projectPath, globalSettings.redirectionFile);
//         if (fs.existsSync(projectRedFile)) {
//             redFileToParse = projectRedFile;
//             logger.info(`📌 Using project-specific redirection file: ${projectRedFile}`);
//         } else {
//             redFileToParse = path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);
//             logger.warn(`⚠️ No project-specific redirection file found, using global redirection file: ${redFileToParse}`);
//         }
    
//         return this.parseRedFileRecursive(redFileToParse, redirectionEntries, isFirstRedFile);
//     }
    
//     private parseRedFileRecursive(
//         redFileToParse: string,
//         redirectionEntries: RedirectionEntry[],
//         isFirstRedFile: boolean
//     ): RedirectionEntry[] {
//         if (!fs.existsSync(redFileToParse)) {
//             logger.error(`❌ Redirection file not found: ${redFileToParse}`);
//             return redirectionEntries;
//         }
    
//         logger.info(`📂 Parsing redirection file: ${redFileToParse}`);
//         const content: string = fs.readFileSync(redFileToParse, 'utf-8');
//         const redPath = path.dirname(redFileToParse);
//         let currentSection: string | null = null;
    
//         // ✅ Only add `*.* = '.'` **once** at the start (for the first red file)
//         if (isFirstRedFile) {
//             redirectionEntries.push({
//                 redFile: redFileToParse,
//                 section: "Common",
//                 extension: "*.*",
//                 paths: ["."]
//             });
//             logger.info(`📌 Added default *.* = '.' to redirection entries`);
//             isFirstRedFile = false;
//         }
    
//         const lines = content.split('\n');
    
//         for (const line of lines) {
//             const trimmedLine = line.trim();
//             if (trimmedLine.startsWith('--') || trimmedLine === '') continue; // Skip comments/empty lines
    
//             // ✅ Detect and set section headers
//             const sectionMatch = this.extractSection(trimmedLine);
//             if (sectionMatch) {
//                 currentSection = sectionMatch;
//                 logger.info(`📌 Entering section: [${sectionMatch}]`);
//                 continue;
//             }
    
//             // ✅ If no section is set, classify entries as [Common]
//             if (!currentSection) {
//                 currentSection = "Common";
//             }
    
//             // ✅ Process `{include}` at the exact position it appears
//             if (trimmedLine.startsWith('{include')) {
//                 let includePath = this.resolveMacro(trimmedLine.match(/\{include\s+([^}]+)\}/i)?.[1] || "");
//                 includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
    
//                 logger.info(`🔄 Processing Include: ${includePath}`);
    
//                 // ✅ Recursively parse included files **at the current position**
//                 this.parseRedFileRecursive(includePath, redirectionEntries, false);
//                 continue;
//             }
    
//             // ✅ Process valid redirection lines
//             if (trimmedLine.includes('=') && currentSection) {
//                 logger.info(`📌 Processing entry in [${currentSection}]: ${trimmedLine}`);
    
//                 const [fileMask, rawPaths] = trimmedLine.split('=').map(p => p.trim());
//                 const resolvedPaths = rawPaths.split(';').map(p => this.resolveMacro(p.trim()));
    
//                 if (resolvedPaths.length > 0) {
//                     logger.info(`✅ Extracted paths for ${fileMask}: (${resolvedPaths.length})`);
//                     resolvedPaths.forEach((p, index) => logger.info(`   ${index + 1}. ${p}`));
    
//                     // ✅ Maintain exact parsing order
//                     redirectionEntries.push({
//                         redFile: redFileToParse,
//                         section: currentSection, // ✅ If no section, defaults to "Common"
//                         extension: fileMask,
//                         paths: resolvedPaths
//                     });
//                 }
//             }
//         }
    
//         return redirectionEntries;
//     }

    

//     // private processIncludedRedirection(redPath: string, line: string, fileExtension: string, pathsMap: Record<string, string[]>): void {
//     //     logger.info(`🔄 Processing Included File:`, line);

//     //     const includePathMatches = line.match(/\{include\s+([^}]+)\}/i);
//     //     if (includePathMatches && includePathMatches[1]) {
//     //         const resolvedPaths = this.resolveMacro(includePathMatches[1]); // May return a string or array

//     //         logger.info(`📂 Resolved Include Paths:`, resolvedPaths);

//     //         // Ensure `resolvedPaths` is always an array
//     //         const resolvedPathsArray = Array.isArray(resolvedPaths) ? resolvedPaths : [resolvedPaths];

//     //         // Process each resolved path
//     //         for (const resolvedPath of resolvedPathsArray) {
//     //             if (typeof resolvedPath === "string") {
//     //                 const normalizedPath = path.isAbsolute(resolvedPath)
//     //                     ? path.normalize(resolvedPath)
//     //                     : path.join(globalSettings.redirectionPath, resolvedPath);

//     //                 logger.info(`🔍 Checking Include Path:`, normalizedPath);

//     //                 if (fs.existsSync(normalizedPath)) {
//     //                     logger.info(`✅ Found and Parsing Included File:`, normalizedPath);
//     //                     const includedPaths = this.parseRedFile(normalizedPath, fileExtension);
//     //                     pathsMap[fileExtension] = pathsMap[fileExtension] || [];
//     //                     pathsMap[fileExtension].push(...includedPaths);
//     //                 } else {
//     //                     logger.warn(`⚠️ Include File Not Found:`, normalizedPath);
//     //                 }
//     //             } else {
//     //                 logger.warn(`⚠️ Unexpected resolved path type:`, resolvedPath);
//     //             }
//     //         }
//     //     }
//     // }




//     // private processLine(foundSection: string, trimmedLine: string, redPath: string, fileExtension: string, pathsMap: Record<string, string[]>): string[] {
//     //     const parts = trimmedLine.split('=');
//     //     const fileMask = parts[0].trim();
//     //     const includeFileTypes = ['*.clw', '*.inc', '*.equ', '*.int'];

//     //     if (!this.shouldProcessFileType(fileMask, includeFileTypes)) return [];

//     //     const resolvedPaths = this.resolvePaths(parts[1], redPath);
//     //     const fileTypeResolvedPaths = this.filterResolvedPaths(resolvedPaths);

//     //     if (fileMask === '*.*' || fileMask.toLowerCase().includes(fileExtension.toLowerCase())) {
//     //         pathsMap[fileMask] = pathsMap[fileMask] || [];
//     //         pathsMap[fileMask].push(...fileTypeResolvedPaths);
//     //     }

//     //     return fileTypeResolvedPaths; // ✅ Ensure it returns resolved paths
//     // }


//     private filterResolvedPaths(paths: string[]): string[] {
//         return paths.flatMap(p => {
//             try {
//                 return this.resolveMacro(p.trim());
//             } catch (error) {
//                 logger.info(`Error resolving path "${p.trim()}":`, error);
//                 return [];
//             }
//         });
//     }

//     private shouldProcessFileType(fileMask: string, includeFileTypes: string[]): boolean {
//         if (fileMask === '*.*') return true;
//         return includeFileTypes.some(type => fileMask.toLowerCase().includes(type.replace('*', '')));
//     }

//     private resolvePaths(pathsString: string, basePath: string): string[] {
//         return pathsString.split(';').map(p => this.resolveMacro(p.trim())).flat();  // Flatten nested arrays
//     }



//     private resolveMacro(pathStr: string): string {
//         const macroPattern = /%([^%]+)%/g;
//         logger.info(`🔍 Resolving macros in path: ${pathStr}`);

//         let resolvedPath = pathStr;
//         let match;

//         // Keep resolving macros **until there are no more left**
//         while ((match = macroPattern.exec(resolvedPath)) !== null) {
//             const macro = match[1];
//             const lowerMacro = macro.toLowerCase();
//             logger.info(`🔹 Found macro: ${macro} (normalized as ${lowerMacro})`);

//             let resolvedValue: string | undefined;

//             // Built-in macros
//             if (lowerMacro === 'bin') {
//                 resolvedValue = globalSettings.redirectionPath;
//                 logger.info(`✅ Resolved %BIN% to: ${resolvedValue}`);
//             } else if (lowerMacro === 'redname') {
//                 resolvedValue = path.basename(this.redirectionFile);
//                 logger.info(`✅ Resolved %REDNAME% to: ${resolvedValue}`);
//             } else {
//                 resolvedValue = this.macros[lowerMacro];
//             }

//             // Handle cases where the resolved value is an array
//             if (Array.isArray(resolvedValue) && resolvedValue.length > 0) {
//                 logger.warn(`⚠️ Macro ${macro} resolves to an array:`, resolvedValue);
//                 resolvedValue = resolvedValue[0]; // Use the first item
//             }

//             // Handle object case
//             if (resolvedValue && typeof resolvedValue === "object" && "$" in resolvedValue) {
//                 logger.info(`🔍 Extracting value from macro object:`, resolvedValue);
//                 resolvedValue = (resolvedValue as any).$.value;
//             }

//             // Ensure resolved value is a string
//             if (typeof resolvedValue !== "string") {
//                 logger.warn(`⚠️ Macro ${macro} could not be fully resolved, returning original.`);
//                 resolvedValue = match[0]; // Keep original macro in case of failure
//             }

//             // Replace the macro in the path
//             resolvedPath = resolvedPath.replace(match[0], resolvedValue);
//             logger.info(`✅ After replacing ${macro}: ${resolvedPath}`);
//         }

//         // Normalize the final resolved path
//         resolvedPath = path.normalize(resolvedPath);
//         logger.info(`✅ Final Fully Resolved Path: ${resolvedPath}`);

//         return resolvedPath;
//     }
// }