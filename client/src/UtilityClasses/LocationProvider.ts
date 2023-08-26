import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RedirectionFileParser } from './RedirectionFileParser';
import {  ClarionProjectClass } from './ClarionProject';

export interface ClarionLocation {
    fullFileName: string;
    sectionLineLocation?: vscode.Position | null;
    linePosition?: vscode.Position;
    linePositionEnd?: vscode.Position;
    statementType?: string;
    result?: RegExpExecArray
}
// export class ClarionLocation implements vscode.DocumentLink {
//     constructor(
//         public range: vscode.Range,
//         public target: vscode.Uri,
//         public sectionLinePosition?: vscode.Position
//     ) {}
// }
class LocationProvider {
    private clarionProject: ClarionProjectClass;

    constructor() {
        this.clarionProject = new ClarionProjectClass();
    }

    public getLocationFromPattern(document: vscode.TextDocument, lineNumber: number, pattern: RegExp): ClarionLocation  | null {
        const documentDirectory = path.dirname(document.uri.fsPath);
        const solutionFolder: string = path.dirname(vscode.workspace.getConfiguration().get('applicationSolutionFile') as string);

        if (documentDirectory.startsWith(solutionFolder)) {
            this.clarionProject.properties = this.clarionProject.findProjectOrSolutionDirectory(documentDirectory);
        }
        const line = document.lineAt(lineNumber).text;
        
        const fileAndSectionArray = this.splitFileNameAndSectionDetails(line, pattern);
        if (!fileAndSectionArray) {
            return null;
        }
        // get the start and end position from line, seaching for the value of fileAndSectionArray[1]
        

        const fullPath = this.getFullPath(fileAndSectionArray[1]);
        if (!fullPath || !fs.existsSync(fullPath)) {
            return null;
        }
        const valueToFind = fileAndSectionArray[1];
        const valueStart = line.indexOf(valueToFind);
        const valueEnd = valueStart + valueToFind.length;
        const sectionName = fileAndSectionArray[2] ? fileAndSectionArray[2] : ''; 
        const sectionLineNumber = this.findSectionLineNumber(fullPath, sectionName);
        return {
            fullFileName: fullPath,
            sectionLineLocation: new vscode.Position(sectionLineNumber, 0),
            linePosition: new vscode.Position(lineNumber, valueStart), // Start position of the string
            linePositionEnd: new vscode.Position(lineNumber, valueEnd), // End position of the string
            result: fileAndSectionArray
        }
       
    }

    private splitFileNameAndSectionDetails(line: string, pattern: RegExp): RegExpExecArray | null {
        const commentIndex = Math.min(line.indexOf('!'), line.indexOf('|'));
        const patternIndex = line.search(pattern);
        
        if (commentIndex >= 0 && (patternIndex === -1 || commentIndex < patternIndex)) {
            return null; 
        }
        
        return pattern.exec(line);
    }

    private getFullPath(fileName: string): string | null {
        const fileExtension = path.extname(fileName);
        const redirectionFileParser = new RedirectionFileParser(this.clarionProject.properties?.compileMode!);
        const searchPaths = redirectionFileParser.getSearchPaths(
            fileExtension,
            this.clarionProject.properties?.directory ?? null
        );

        for (const searchPath of searchPaths) {
            const solutionFolder = path.dirname(vscode.workspace.getConfiguration().get('applicationSolutionFile') as string);
            const fullPath = this.constructFullPath(fileName, searchPath, this.clarionProject.properties?.directory!);// solutionFolder);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }
        return null;
    }

    private findSectionLineNumber(fullPath: string, targetSection: string): number {
        const matchingDocument = vscode.workspace.textDocuments.find(document =>
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
}

export default LocationProvider;
