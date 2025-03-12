// import * as path from 'path';
// import { ClarionSourcerFile } from '../Parser/ClarionSourcerFile';
// import { ClarionProject } from '../Parser/ClarionProject';
// import LoggerManager from '../logger';

// const logger = LoggerManager.getLogger("FileScanner");

// export interface FileScanResult {
//     file: ClarionSourcerFile;
//     includes: string[];
//     modules: string[];
//     members: string[];
//     links: string[];
// }

// export class FileScanner {
//     private readonly includePattern = /INCLUDE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*(?:,\s*'([^']+\.[a-zA-Z0-9]+)'\s*)?(?:,\s*ONCE)?\)/ig;
//     private readonly modulePattern = /MODULE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*(?:,\s*'([^']+\.[a-zA-Z0-9]+)'\s*)?\)/ig;
//     private readonly memberPattern = /\bMEMBER\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*\).*?/ig;
//     private readonly linkPattern = /LINK\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*\)/ig;

//     /**
//      * Scans a Clarion source file for common patterns and returns the results
//      */
//     public scanFile(file: ClarionSourcerFile): FileScanResult | null {
//         if (!file.exists()) {
//             return null;
//         }

//         const includes = this.extractMatches(file, this.includePattern);
//         const modules = this.extractMatches(file, this.modulePattern);
//         const members = this.extractMatches(file, this.memberPattern);
//         const links = this.extractMatches(file, this.linkPattern);

//         return {
//             file,
//             includes,
//             modules,
//             members,
//             links
//         };
//     }

//     /**
//      * Scans all files in a project
//      */
//     public scanProjectFiles(project: ClarionProject): FileScanResult[] {
//         const results: FileScanResult[] = [];
        
//         for (const file of project.sourceFiles) {
//             const result = this.scanFile(file);
//             if (result) {
//                 results.push(result);
//             }
//         }
        
//         return results;
//     }

//     private extractMatches(file: ClarionSourcerFile, pattern: RegExp): string[] {
//         const matches = file.findPatternMatches(pattern);
//         return matches.map(match => match[1]);
//     }
// }
