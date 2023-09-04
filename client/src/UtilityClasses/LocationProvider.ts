import { commands, TextDocument, window, Position, workspace, ViewColumn } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RedirectionFileParser } from './RedirectionFileParser';
import { ClarionProjectClass } from './ClarionProject';
import { SolutionParser } from '../SolutionParser';

export interface ClarionLocation {
    fullFileName: string;
    sectionLineLocation?: Position | null;
    linePosition?: Position;
    linePositionEnd?: Position;
    statementType?: string;
    result?: RegExpExecArray
}
interface CustomRegExpMatch extends RegExpExecArray {
    lineIndex: number;
}
export class LocationProvider {
    private clarionProject: ClarionProjectClass;
    private solutionParser: SolutionParser | undefined;
    constructor(solutionParser: SolutionParser) {
        this.clarionProject = new ClarionProjectClass();
    }

    async initialize(solutionParser: SolutionParser) {
        this.solutionParser = solutionParser;
        
    }

    public getLocationFromPattern(document: TextDocument, pattern: RegExp): ClarionLocation[] | null {
        const documentDirectory = path.dirname(document.uri.fsPath);
        const solutionFolder: string = path.dirname(workspace.getConfiguration().get('applicationSolutionFile') as string);

        
        if (documentDirectory.startsWith(solutionFolder)) {
            this.clarionProject.properties = this.clarionProject.findProjectOrSolutionDirectory(documentDirectory);
        }

        const matches = this.getRegexMatches(document, pattern);

        if (!matches) {
            return null;
        }
        const locations: ClarionLocation[] = [];
        const customMatches: CustomRegExpMatch[] = matches;
        customMatches.sort((a, b) => a.lineIndex - b.lineIndex);
        for (const match of customMatches) {
            const fileName = this.getFullPath(match[1], path.basename(document.uri.fsPath));
            if (!fileName || !fs.existsSync(fileName)) {
                continue;
            }
            const line = match.input;
            const valueToFind = match[1]; // Update this to match the capture group index
            const valueStart = match.index + match[0].indexOf(valueToFind); // Calculate the starting position based on the match index
            const valueEnd = valueStart + valueToFind.length;
            const sectionName = match[2] ? match[2] : ''; // Update this to match the capture group index
            const sectionLineNumber = this.findSectionLineNumber(fileName, sectionName); // Use fileName instead of fullPath
            const location: ClarionLocation = {
                fullFileName: fileName,
                sectionLineLocation: new Position(sectionLineNumber, 0),
                linePosition: new Position(match.lineIndex, valueStart),
                linePositionEnd: new Position(match.lineIndex, valueEnd),
                statementType: '', // You can set the statementType here if needed
                result: match, // Set the result to the match object if needed
            };
        
            locations.push(location);
            // Rest of the code to process the match and construct the ClarionLocation
        }
        return locations;


    }


    private getRegexMatches(document: TextDocument, pattern: RegExp): CustomRegExpMatch[] {
        const matches: CustomRegExpMatch[] = [];
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex).text;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                const customMatch: CustomRegExpMatch = {
                    ...match,
                    lineIndex,
                } as CustomRegExpMatch; // Explicitly cast to the custom type
                matches.push(customMatch);
            }
        }
        return matches;
    }



   

    private splitFileNameAndSectionDetails(line: string, pattern: RegExp): RegExpExecArray | null {

        const commentIndex = Math.min(line.indexOf('!'), line.indexOf('|'));
        const patternIndex = line.search(pattern);

        if (commentIndex >= 0 && (patternIndex === -1 || commentIndex < patternIndex)) {
            return null;
        }

        return pattern.exec(line);
    }

    public getFullPath(fileName: string, documentFrom: string): string | null {
        if(!this.solutionParser) {
            console.log('No solution parser');
            return null;
        }
        const fileExtension = path.extname(fileName);

        //check if current document is in project and try find
        let sourceFile = this.solutionParser.findSourceInProject(documentFrom);
        if (sourceFile) {
            const fullPath = this.solutionParser.findSourceFilePath(sourceFile, fileName);
            if (fullPath) {
                return fullPath;
            }
        }
        //check if  filename is in project and try find
        sourceFile = this.solutionParser.findSourceInProject(fileName);
        if (sourceFile) {
            const fullPath = this.solutionParser.findSourceFilePath(sourceFile, fileName);
            if (fullPath) {
                return fullPath;
            }
        }

        //Check default red file
        
        const globalFile = this.solutionParser.findFileWithExtension(fileName);
        if (globalFile != "") {
            return globalFile;
        }
        return null;
      
    }


    private findSectionLineNumber(fullPath: string, targetSection: string): number {
        const matchingDocument = workspace.textDocuments.find(document =>
            document.uri.fsPath === fullPath
        );

        if (matchingDocument && targetSection !== '') {
            const lines = matchingDocument.getText().split('\n');
            const sectionIndex = lines.findIndex(line =>
                line.toLowerCase().includes(`section('${targetSection.toLowerCase()}')`)
            );
            return sectionIndex !== -1 ? sectionIndex : 0;
        }

        // If the matching document is not found, read content from the file directly
        try {
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const lines = fileContent.split('\n');
            const sectionIndex = lines.findIndex(line =>
                line.toLowerCase().includes(`section('${targetSection.toLowerCase()}')`)
            );
            return sectionIndex !== -1 ? sectionIndex : 0;
        } catch (error) {
            console.error('Error reading file content:', error);
            return 0;
        }
    }


    private constructFullPath(fileName: string, searchPath: string, solutionDirectory: string): string {
        let fullPath;
        const relativePath = searchPath;
        if (!path.isAbsolute(relativePath)) {
            fullPath = path.join(solutionDirectory, relativePath, fileName);
        } else {
            fullPath = path.join(searchPath, fileName);
        }
        return fullPath;
    }
    public async inspectFullPath(documentDirectory: string) {
    
        const panel = window.createWebviewPanel(
            'inspectionPanel', // Unique ID
            'Inspection Details', // Title
            ViewColumn.One, // Column to show the panel in
            {}
        );
        const editor = window.activeTextEditor;
        if (editor) {
            const redirectionFileParser = new RedirectionFileParser(this.clarionProject.properties?.compileMode!);
            const fileName = editor.document.fileName;
            const fileExtension = path.extname(fileName);
            const searchPaths = redirectionFileParser.getSearchPaths(
                fileExtension,
                this.clarionProject.properties?.directory ?? null
            );
            const fullPath = await this.getFullPath(fileName, documentDirectory); // You need to implement this function
    
            panel.webview.html = `
                <h2>Inspection Details</h2>
                <p><strong>File Name:</strong> ${fileName}</p>
                <p><strong>Search Paths:</strong> ${searchPaths}</p>
                <p><strong>Full Path:</strong> ${fullPath || 'File not found'}</p>
            `;
            
            
            
            
            
    
        }
    }
}

export default LocationProvider;
