import { commands, TextDocument, window, Position, workspace, ViewColumn } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClarionProjectClass } from '../UtilityClasses/ClarionProject';

import { globalSettings } from '../globals';
import { SolutionParser } from '../Parser/SolutionParser';
import LoggerManager from '../logger';
const logger = LoggerManager.getLogger("LocationProvider");


// Import global variables from extension.ts

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
    private clarionProject: ClarionProjectClass;
    private solutionParser: SolutionParser | undefined;
    
    constructor(solutionParser: SolutionParser) {
        this.clarionProject = new ClarionProjectClass();
        this.solutionParser = solutionParser;
    }

    // async initialize(solutionParser: SolutionParser) {
    //     this.solutionParser = solutionParser;
    // }

    /**
     * Scans the provided document for occurrences of a specified pattern and returns an array of corresponding locations.
     */
    public getLocationFromPattern(document: TextDocument, pattern: RegExp): ClarionLocation[] | null {
        const documentDirectory = path.dirname(document.uri.fsPath);
    
        // ✅ Restore the original way of determining the project directory
        this.clarionProject.properties = this.clarionProject.findProjectOrSolutionDirectory(documentDirectory);
    
        const matches = this.getRegexMatches(document, pattern);
        if (!matches) return null;
    
        const locations: ClarionLocation[] = [];
        const customMatches: CustomRegExpMatch[] = matches;
        customMatches.sort((a, b) => a.lineIndex - b.lineIndex);  // ✅ Ensure correct order
    
        for (const match of customMatches) {
            const fileName = this.getFullPath(match[1], path.basename(document.uri.fsPath));
            if (!fileName || !fs.existsSync(fileName)) {
                continue;
            }
    
            // ✅ Calculate the position where the match occurs
            const valueToFind = match[1]; 
            const valueStart = match.index + match[0].indexOf(valueToFind);
            const valueEnd = valueStart + valueToFind.length;
            const sectionName = match[2] || ''; 
            const sectionLineNumber = this.findSectionLineNumber(fileName, sectionName);
    
            // ✅ Ensure location object has all necessary properties
            const location: ClarionLocation = {
                fullFileName: fileName,
                sectionLineLocation: new Position(sectionLineNumber, 0),
                linePosition: new Position(match.lineIndex, valueStart),
                linePositionEnd: new Position(match.lineIndex, valueEnd),
                statementType: '',  // Statement type is handled separately
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

    public getFullPath(fileName: string, documentFrom: string): string | null {
        if (!this.solutionParser) {
            logger.info('❌ No solution parser available');
            return null;
        }
    
        logger.info(`🔎 Searching for file: ${fileName} (from ${documentFrom})`);
    
        // 🔹 Find the project dynamically based on the current file
        const project = this.solutionParser.findProjectForFile(documentFrom);
        
        if (project) {
            logger.info(`📂 Using project-specific paths for ${fileName}`);
            const fullPath = this.solutionParser.findFileInRedirectionPaths(fileName, project.pathsToLookin, project.path);
            
            if (fullPath) {
                logger.info(`✅ Found in project paths: ${fullPath}`);
                return fullPath;
            }
        } else {
            logger.warn(`⚠️ No project association found for ${documentFrom}, falling back to global redirection.`);
        }
    
        // 🔹 Fall back to global paths
        const globalFile = this.solutionParser.findFileWithExtension(fileName);
        if (globalFile !== "") {
            logger.info(`✅ Resolved via global redirection: ${globalFile}`);
            return globalFile;
        }
    
        logger.error(`❌ Could not resolve file: ${fileName}`);
        return null;
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

    // public async inspectFullPath(documentDirectory: string) {
    //     const panel = window.createWebviewPanel(
    //         'inspectionPanel',
    //         'Inspection Details',
    //         ViewColumn.One,
    //         {}
    //     );
        
    //     const editor = window.activeTextEditor;
    //     if (editor) {
    //         const redirectionFileParser = new RedirectionFileParser(this.clarionProject.properties?.compileMode!);
    //         const fileName = editor.document.fileName;
    //         const fileExtension = path.extname(fileName);
    //         const searchPaths = redirectionFileParser.getSearchPaths(
    //             fileExtension,
    //             this.clarionProject.properties?.directory ?? null
    //         );
    //         const fullPath = await this.getFullPath(fileName, documentDirectory);

    //         panel.webview.html = `
    //             <h2>Inspection Details</h2>
    //             <p><strong>File Name:</strong> ${fileName}</p>
    //             <p><strong>Search Paths:</strong> ${searchPaths}</p>
    //             <p><strong>Full Path:</strong> ${fullPath || 'File not found'}</p>
    //         `;
    //     }
    // }
}

export default LocationProvider;
