import { commands, TextDocument, window, Position, workspace, ViewColumn } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SolutionCache } from '../SolutionCache';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("LocationProvider");
logger.setLevel("info");

/**
 * Represents a location in Clarion code, with support for lazy method implementation resolution.
 *
 * This interface has been extended to support lazy loading of method implementations:
 * - Basic location information (file name, positions) is stored for all statement types
 * - For methods, additional metadata is stored (class name, method name, module file)
 * - The actual implementation location is only resolved when needed (on hover)
 * - The implementationResolved flag tracks whether resolution has been attempted
 *
 * Parameter signature support has been added to correctly match overloaded methods:
 * - For method declarations, the parameter signature is parsed and stored
 * - When resolving implementations, the parameter signature is used to find the correct overload
 */
export interface ClarionLocation {
    /** Full path to the file containing this location */
    fullFileName: string;
    /** Position of the section or method implementation (only populated when needed) */
    sectionLineLocation?: Position | null;
    /** Start position of the statement in the document */
    linePosition?: Position;
    /** End position of the statement in the document */
    linePositionEnd?: Position;
    /** Type of the statement (INCLUDE, MODULE, MEMBER, SECTION, METHOD, etc.) */
    statementType?: string;
    /** Original regex match result */
    result?: RegExpExecArray;
    
    // Method metadata for lazy implementation resolution
    /** Class name for method declarations (used for lazy implementation lookup) */
    className?: string;
    /** Method name for method declarations (used for lazy implementation lookup) */
    methodName?: string;
    /** Module file where implementation should be found (used for lazy implementation lookup) */
    moduleFile?: string;
    /** Whether the implementation has been resolved (to avoid repeated lookups) */
    implementationResolved?: boolean;
    /** Parameter signature for method declarations (used for matching overloaded methods) */
    parameterSignature?: string[];
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

        // Add a per-operation cache for getFullPath
        const pathCache: Map<string, string | null> = new Map();

        logger.info(`Found ${customMatches.length} matches for pattern in ${document.uri.fsPath}`);

        for (const match of customMatches) {
            try {
                // Extract the filename from the match
                const matchedFileName = match[1];
                logger.info(`Processing match: ${matchedFileName} in ${document.uri.fsPath}`);

                // Get the full path using the server-side redirection, with cache
                const fileName = await this.getFullPath(matchedFileName, document.uri.fsPath, pathCache);

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
    /**
 * Resolves the full path of a file using **pre-parsed project-specific search paths**.
 * Adds an optional per-operation cache to avoid redundant lookups.
 */
    public async getFullPath(
        fileName: string,
        documentFrom: string,
        cache?: Map<string, string | null>
    ): Promise<string | null> {
        const cacheKey = `${fileName}|${documentFrom}`;
        if (cache && cache.has(cacheKey)) {
            logger.info(`🗂️ getFullPath cache hit for: ${fileName} (from ${documentFrom})`);
            return cache.get(cacheKey)!;
        }

        logger.info(`🔎 Searching for file: ${fileName} (from ${documentFrom})`);

        // First try to find the file directly in the solution
        const sourceFile = this.solutionCache.findSourceInProject(fileName);
        if (sourceFile && sourceFile.relativePath) {
            const solutionPath = this.solutionCache.getSolutionFilePath();
            const solutionDir = path.dirname(solutionPath);
            const fullPath = path.join(solutionDir, sourceFile.relativePath);

            if (fs.existsSync(fullPath)) {
                logger.info(`✅ Found file in solution: ${fullPath}`);
                if (cache) cache.set(cacheKey, fullPath);
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
                if (cache) cache.set(cacheKey, fullPath);
                return fullPath;
            }
        } else {
            logger.info(`⚠️ No project association found for ${documentBaseName}, falling back to global paths.`);
        }

        // 🔹 Fallback to global settings - this will use the server-side redirection parser
        const globalFile = await this.solutionCache.findFileWithExtension(fileName);
        if (globalFile !== "") {
            logger.info(`✅ Resolved via server-side redirection: ${globalFile}`);
            if (cache) cache.set(cacheKey, globalFile);
            return globalFile;
        }

        logger.info(`❌ Could not resolve file: ${fileName}`);
        if (cache) cache.set(cacheKey, null);
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
