import { commands, TextDocument, window, Position, workspace, ViewColumn } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClarionProject } from '../Parser/ClarionProject';
import { SolutionParser } from '../Parser/SolutionParser';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("LocationProvider");
logger.setLevel("error");

export interface ClarionLocation {
    fullFileName: string;
    sectionLineLocation?: Position | null;
    linePosition?: Position;
    linePositionEnd?: Position;
    statementType?: string;
    result?: RegExpExecArray;
}

interface CustomRegExpMatch extends RegExpExecArray {
    lineIndex: number;
}

/**
 * Provides functionality for locating file and section positions within the Clarion project.
 */
export class LocationProvider {
    public solutionParser: SolutionParser | undefined;
    
    constructor(solutionParser: SolutionParser) {
        this.solutionParser = solutionParser;
    }

    /**
     * Scans the provided document for occurrences of a specified pattern and returns an array of corresponding locations.
     */
    public getLocationFromPattern(document: TextDocument, pattern: RegExp): ClarionLocation[] | null {
        const matches = this.getRegexMatches(document, pattern);
        if (!matches) return null;

        const locations: ClarionLocation[] = [];
        const customMatches: CustomRegExpMatch[] = matches;
        customMatches.sort((a, b) => a.lineIndex - b.lineIndex);  

        for (const match of customMatches) {
            const fileName = this.getFullPath(match[1], document.uri.fsPath);
            if (!fileName || !fs.existsSync(fileName)) {
                continue;
            }

            const valueToFind = match[1]; 
            const valueStart = match.index + match[0].indexOf(valueToFind);
            const valueEnd = valueStart + valueToFind.length;
            const sectionName = match[2] || ''; 
            const sectionLineNumber = this.findSectionLineNumber(fileName, sectionName);

            const location: ClarionLocation = {
                fullFileName: fileName,
                sectionLineLocation: new Position(sectionLineNumber, 0),
                linePosition: new Position(match.lineIndex, valueStart),
                linePositionEnd: new Position(match.lineIndex, valueEnd),
                statementType: '',
                result: match,
            };

            locations.push(location);
        }
        return locations;
    }
    
    private getRegexMatches(document: TextDocument, pattern: RegExp): CustomRegExpMatch[] {
        const matches: CustomRegExpMatch[] = [];
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex).text;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                const customMatch: CustomRegExpMatch = { ...match, lineIndex } as CustomRegExpMatch;
                matches.push(customMatch);
            }
        }
        return matches;
    }

    /**
     * Resolves the full path of a file using **pre-parsed project-specific search paths**.
     */
    public getFullPath(fileName: string, documentFrom: string): string | null {
        if (!this.solutionParser) {
            logger.info('❌ No solution parser available');
            return null;
        }
        
        logger.info(`🔎 Searching for file: ${fileName} (from ${documentFrom})`);

        // 🔹 Find the project that contains `documentFrom`
        const project = this.solutionParser.findProjectForFile(documentFrom);
        
        if (project) {
            logger.info(`📂 Using project-specific paths for ${fileName}`);

            // ✅ Use the project's own search paths (`pathsToLookin`)
            const fullPath = this.findFileInProjectPaths(fileName, project);
            
            if (fullPath) {
                logger.info(`✅ Found in project paths: ${fullPath}`);
                return fullPath;
            }
        } else {
            logger.warn(`⚠️ No project association found for ${documentFrom}, falling back to global paths.`);
        }

        // 🔹 Fallback to global settings, but ensure `solutionParser` has pre-parsed paths
        const globalFile = this.solutionParser.findFileWithExtension(fileName);
        if (globalFile !== "") {
            logger.info(`✅ Resolved via global redirection: ${globalFile}`);
            return globalFile;
        }

        logger.error(`❌ Could not resolve file: ${fileName}`);
        return null;
    }

    /**
     * Searches for the given file using a **project's pre-parsed redirection paths**.
     */
    private findFileInProjectPaths(fileName: string, project: ClarionProject): string | null {
        logger.info(`🔍 Searching in project redirection paths for: ${fileName}`);
    
        const fileExt = path.extname(fileName).toLowerCase();
        
        // 🔹 Use `getSearchPaths(fileExt)` from `ClarionProject`
        const searchPaths = project.getSearchPaths(fileExt);
    
        if (searchPaths.length === 0) {
            logger.warn(`⚠️ No search paths found for extension: ${fileExt}`);
            return null;
        }
    
        for (const searchPath of searchPaths) {
            const resolvedSearchPath = path.isAbsolute(searchPath)
                ? path.normalize(searchPath)
                : path.join(project.path, searchPath); // ✅ Ensure relative paths are resolved
    
            const fullPath = path.join(resolvedSearchPath, fileName);
            const normalizedFullPath = path.normalize(fullPath);
    
            logger.info(`🔎 Checking: ${normalizedFullPath}`);
    
            if (fs.existsSync(normalizedFullPath)) {
                logger.info(`✅ File found: ${normalizedFullPath}`);
                return normalizedFullPath;
            }
        }
    
        logger.error(`❌ File "${fileName}" not found in project paths`);
        return null;
    }
    
    /**
     * Resolves a file path using the solution parser
     */
    resolveFilePath(filename: string): string | null {
        if (!this.solutionParser) return null;
        
        // First check if this is a source file in any project
        const sourceFile = this.solutionParser.findSourceInProject(filename);
        if (sourceFile) {
            // Use the enhanced ClarionSourcerFile to get the absolute path
            return sourceFile.getAbsolutePath();
        }
        
        // Fall back to the traditional approach
        return this.solutionParser.findFileWithExtension(filename);
    }

    private findSectionLineNumber(fullPath: string, targetSection: string): number {
        const matchingDocument = workspace.textDocuments.find(document => document.uri.fsPath === fullPath);

        if (matchingDocument && targetSection !== '') {
            const lines = matchingDocument.getText().split('\n');
            const sectionIndex = lines.findIndex(line =>
                line.toLowerCase().includes(`section('${targetSection.toLowerCase()}')`)
            );
            return sectionIndex !== -1 ? sectionIndex : 0;
        }

        try {
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const lines = fileContent.split('\n');
            const sectionIndex = lines.findIndex(line =>
                line.toLowerCase().includes(`section('${targetSection.toLowerCase()}')`)
            );
            return sectionIndex !== -1 ? sectionIndex : 0;
        } catch (error) {
            logger.info('Error reading file content:', error);
            return 0;
        }
    }
}

export default LocationProvider;
