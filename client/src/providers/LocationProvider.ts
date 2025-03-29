import { commands, TextDocument, window, Position, workspace, ViewColumn } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SolutionCache } from '../SolutionCache';
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
    private solutionCache: SolutionCache;
    
    constructor() {
        this.solutionCache = SolutionCache.getInstance();
    }

    /**
     * Scans the provided document for occurrences of a specified pattern and returns an array of corresponding locations.
     */
    public async getLocationFromPattern(document: TextDocument, pattern: RegExp): Promise<ClarionLocation[] | null> {
        const matches = this.getRegexMatches(document, pattern);
        if (!matches) return null;

        const locations: ClarionLocation[] = [];
        const customMatches: CustomRegExpMatch[] = matches;
        customMatches.sort((a, b) => a.lineIndex - b.lineIndex);

        logger.info(`Found ${customMatches.length} matches for pattern in ${document.uri.fsPath}`);

        for (const match of customMatches) {
            try {
                // Extract the filename from the match
                const matchedFileName = match[1];
                logger.info(`Processing match: ${matchedFileName} in ${document.uri.fsPath}`);
                
                // Get the full path using the server-side redirection
                const fileName = await this.getFullPath(matchedFileName, document.uri.fsPath);
                
                if (!fileName) {
                    logger.info(`Could not resolve path for: ${matchedFileName}`);
                    continue;
                }
                
                if (!fs.existsSync(fileName)) {
                    logger.info(`File does not exist: ${fileName}`);
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
                logger.info(`Added location for ${fileName}`);
            } catch (error) {
                logger.error(`Error processing match: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        logger.info(`Returning ${locations.length} locations for document ${document.uri.fsPath}`);
        return locations;
    }
    
    private getRegexMatches(document: TextDocument, pattern: RegExp): CustomRegExpMatch[] {
        const matches: CustomRegExpMatch[] = [];
        logger.info(`Searching for pattern in document: ${document.uri.fsPath}`);
        
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex).text;
            
            // Reset the pattern's lastIndex to ensure we start from the beginning of each line
            pattern.lastIndex = 0;
            
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                logger.info(`Found match at line ${lineIndex}: ${match[0]}`);
                const customMatch: CustomRegExpMatch = { ...match, lineIndex } as CustomRegExpMatch;
                matches.push(customMatch);
            }
        }
        
        logger.info(`Found ${matches.length} total matches in document`);
        return matches;
    }

    /**
     * Resolves the full path of a file using **pre-parsed project-specific search paths**.
     */
    public async getFullPath(fileName: string, documentFrom: string): Promise<string | null> {
        logger.info(`🔎 Searching for file: ${fileName} (from ${documentFrom})`);

        // First try to find the file directly in the solution
        const sourceFile = this.solutionCache.findSourceInProject(fileName);
        if (sourceFile && sourceFile.relativePath) {
            const solutionPath = this.solutionCache.getSolutionFilePath();
            const solutionDir = path.dirname(solutionPath);
            const fullPath = path.join(solutionDir, sourceFile.relativePath);
            
            if (fs.existsSync(fullPath)) {
                logger.info(`✅ Found file in solution: ${fullPath}`);
                return fullPath;
            }
        }

        // 🔹 Find the project that contains `documentFrom`
        const documentBaseName = path.basename(documentFrom);
        const project = this.solutionCache.findProjectForFile(documentBaseName);
        
        if (project) {
            logger.info(`📂 Using project-specific paths for ${fileName} from project ${project.name}`);

            // ✅ Use the project's search paths
            const fullPath = await this.findFileInProjectPaths(fileName, project);
            
            if (fullPath) {
                logger.info(`✅ Found in project paths: ${fullPath}`);
                return fullPath;
            }
        } else {
            logger.info(`⚠️ No project association found for ${documentBaseName}, falling back to global paths.`);
        }

        // Try to find the file in standard Clarion include directories
        const standardPaths = [
            path.dirname(documentFrom),
            path.join(path.dirname(documentFrom), '..'),
            path.join(path.dirname(documentFrom), '..', 'include'),
            path.join(path.dirname(documentFrom), '..', 'libsrc')
        ];

        for (const standardPath of standardPaths) {
            const fullPath = path.join(standardPath, fileName);
            if (fs.existsSync(fullPath)) {
                logger.info(`✅ Found in standard path: ${fullPath}`);
                return fullPath;
            }
        }

        // 🔹 Fallback to global settings - this will use the server-side redirection parser
        const globalFile = await this.solutionCache.findFileWithExtension(fileName);
        if (globalFile !== "") {
            logger.info(`✅ Resolved via server-side redirection: ${globalFile}`);
            return globalFile;
        }

        logger.info(`❌ Could not resolve file: ${fileName}`);
        return null;
    }

    /**
     * Searches for the given file using a **project's pre-parsed redirection paths**.
     */
    private async findFileInProjectPaths(fileName: string, project: any): Promise<string | null> {
        logger.info(`🔍 Searching in project paths for: ${fileName}`);
    
        const fileExt = path.extname(fileName).toLowerCase();
        
        // First check if the file exists directly in the project's source files
        const sourceFile = project.sourceFiles.find((sf: any) =>
            sf.name.toLowerCase() === path.basename(fileName).toLowerCase()
        );
        
        if (sourceFile && sourceFile.relativePath) {
            const fullPath = path.join(project.path, sourceFile.relativePath);
            if (fs.existsSync(fullPath)) {
                logger.info(`✅ Found file in project source files: ${fullPath}`);
                return fullPath;
            }
        }
        
        // Try to find the file using the server-side redirection information
        // This will be more comprehensive than our basic search paths
        const fileWithExt = await this.solutionCache.findFileWithExtension(fileName);
        if (fileWithExt !== "") {
            logger.info(`✅ Found file using server-side redirection: ${fileWithExt}`);
            return fileWithExt;
        }
        
        // Fallback to basic search paths
        const searchPaths = [
            '.',
            project.path,
            path.join(project.path, 'include'),
            path.join(project.path, 'libsrc'),
            path.join(project.path, '..', 'include'),
            path.join(project.path, '..', 'libsrc')
        ];
    
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
    
        logger.info(`❌ File "${fileName}" not found in project paths`);
        return null;
    }
    
    /**
     * Resolves a file path using the solution cache
     */
    async resolveFilePath(filename: string): Promise<string | null> {
        // First check if this is a source file in any project
        const sourceFile = this.solutionCache.findSourceInProject(filename);
        if (sourceFile && sourceFile.relativePath) {
            // Get the absolute path
            const solutionPath = this.solutionCache.getSolutionFilePath();
            const solutionDir = path.dirname(solutionPath);
            return path.join(solutionDir, sourceFile.relativePath);
        }
        
        // Fall back to the traditional approach
        return await this.solutionCache.findFileWithExtension(filename);
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
