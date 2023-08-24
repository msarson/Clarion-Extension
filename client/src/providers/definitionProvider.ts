import * as vscode from 'vscode';
import * as path from 'path';     // Import path module
import * as fs from 'fs';         // Import fs module
import { RedirectionFileParser } from '../UtilityClasses/RedirectionFileParser'; // Adjust the path as needed
import { ClarionProject, findProjectFile, findProjectOrSolutionDirectory  } from './ClarionProject';
import { ClarionDependencyAnalyzer } from '../ClarionDependencyAnalyzer';


const xml2js = require('xml2js');
export class ClarionDefinitionProvider implements vscode.DefinitionProvider {
    
    private solutionFolder: string = path.dirname(vscode.workspace.getConfiguration().get('applicationSolutionFile') as string);


    private clarionProject: ClarionProject | null = null;
    constructor() {
    }

    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

        
        const currentDirectory = path.dirname(document.uri.fsPath);

        if (currentDirectory.startsWith(this.solutionFolder)) {
            this.clarionProject = findProjectOrSolutionDirectory(currentDirectory);
        }
        const line = document.lineAt(position.line).text;

        const includePattern = /INCLUDE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?(?:,\s*ONCE)?\)/i;

        const locationFromInclude = this.getLocationFromPattern(line, includePattern);
        if (locationFromInclude) {
            return locationFromInclude;
        }

        const modulePattern = /MODULE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/i;
        const locationFromModule = this.getLocationFromPattern(line, modulePattern);
        if (locationFromModule) {
            return locationFromModule;
        }

        return null; // No definition found

    }

    /**
     * Returns the location of a pattern match in a given line of code.
     * @param line The line of code to search for the pattern match.
     * @param pattern The regular expression pattern to match against the line of code.
     * @returns A `vscode.Location` object representing the location of the pattern match, or `null` if no match was found.
     */
    private getLocationFromPattern(line: string, pattern: RegExp): vscode.Location | null {
       
        const match = this.getPositionAndMatchFromPattern(line, pattern);
        
        if (!match) {
            return null;
        }
    
        const fileName = match[1];
    
        const fullPath = this.getFullPath(fileName, path.extname(fileName));
        if (!fullPath || !fs.existsSync(fullPath)) {
            return null;
        }
        const targetSection = this.extractTargetSection(match[2]);
        const sectionIndex = this.findSectionIndex(fullPath, targetSection);
        // const analyzer = new ClarionDependencyAnalyzer(fullPath);
        // const dependencyGraph = analyzer.analyze();
        // console.log(dependencyGraph);
        return new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(sectionIndex, 0));
        
    }
    
    /**
     * Determines if a comment appears before a given pattern in a line of text.
     * @param line The line of text to search.
     * @param pattern The regular expression pattern to search for.
     * @returns True if a comment appears before the pattern, false otherwise.
     */
    private getPositionAndMatchFromPattern(line: string, pattern: RegExp): RegExpExecArray | null {
        const commentIndex = Math.min(line.indexOf('!'), line.indexOf('|'));
        const patternIndex = line.search(pattern);
        
        if (commentIndex >= 0 && (patternIndex === -1 || commentIndex < patternIndex)) {
            return null; // Comment is before the pattern
        }
        
        return pattern.exec(line);
    }
    
    
    
    /**
     * Extracts the target section from the given string, trimming any whitespace.
     * 
     * @param section - The string to extract the target section from.
     * @returns The extracted target section, or an empty string if `section` is `undefined`.
     */
    private extractTargetSection(section: string | undefined): string {
        return section ? section.trim() : '';
    }
    
    /**
     * Returns the full path of a file with the given name and extension, searching for it in the search paths
     * defined by the Clarion project and the solution folder.
     * @param fileName - The name of the file to search for.
     * @param fileExtension - The extension of the file to search for.
     * @returns The full path of the file if it exists, or null if it doesn't.
     */
    private getFullPath(fileName: string, fileExtension: string): string | null {
        const redirectionFileParser = new RedirectionFileParser();
        const searchPaths = redirectionFileParser.getSearchPaths(
            fileExtension,
            this.clarionProject?.directory ?? null,
            this.clarionProject?.compileMode ?? null
        );
    
        
        for (const searchPath of searchPaths) {
            const fullPath = this.constructFullPath(fileName, searchPath, this.solutionFolder);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }
        return null;
    }
    
    /**
     * Constructs the full path of a file given its name, a search path, and the solution directory.
     * @param fileName The name of the file.
     * @param searchPath The search path for the file.
     * @param solutionDirectory The directory of the solution.
     * @returns The full path of the file.
     */
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
    
    /**
     * Finds the index of the target section in the specified file.
     * @param fullPath The full path of the file to search.
     * @param targetSection The name of the section to search for.
     * @returns The index of the target section, or 0 if it is not found.
     */
    private findSectionIndex(fullPath: string, targetSection: string): number {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const lines = fileContent.split('\n');
        const sectionIndex = lines.findIndex(line => line.includes(`SECTION('${targetSection}')`));
        return sectionIndex !== -1 ? sectionIndex : 0;
    }
    
    
}


