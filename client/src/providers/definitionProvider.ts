import * as vscode from 'vscode';
import * as path from 'path';     // Import path module
import * as fs from 'fs';         // Import fs module
import { RedLoader } from '../UtilityClasses/RedLoader'; // Adjust the path as needed

export class ClarionDefinitionProvider implements vscode.DefinitionProvider {
    // ... Other methods and setup ...
    private redLoader: RedLoader;
    constructor() {
        this.redLoader = new RedLoader();
    }

    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

        const line = document.lineAt(position.line).text;

        const includePattern = /INCLUDE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?(?:,\s*ONCE)?\)/i;
        const locationFromInclude = this.getLocationFromPattern.call(this, line, includePattern);
        if (locationFromInclude) {
            return locationFromInclude;
        }
        
        const modulePattern = /MODULE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/i;
        const locationFromModule = this.getLocationFromPattern.call(this, line, modulePattern);
        if (locationFromModule) {
            return locationFromModule;
        }
        
        return null; // No definition found






        // const line = document.lineAt(position.line).text; // Get the entire line

        // const includePattern = /INCLUDE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?(?:,\s*ONCE)?\)/i;
        // const match = line.match(includePattern);
        // if (match) {
        //     const fileName = match[1];
        //     const fileExtension = path.extname(fileName);
        //     const searchPaths = this.redLoader.getSearchPaths(fileExtension);
        //     // You can also extract the section and ONCE attributes if needed
        //     const section = match[2];
        //     const once = line.includes('ONCE');

        //     for (const searchPath of searchPaths) {
        //         const fullPath = path.join(searchPath, fileName);
        //         if (fs.existsSync(fullPath)) {
        //             const location = new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(0, 0));
        //             return location;
        //         }
        //     }
        // }
        // const modulePattern = /MODULE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/i;
        // const moduleMatch = line.match(modulePattern);
        // if (moduleMatch) {
        //     const fileName = moduleMatch[1];
        //     const fileExtension = path.extname(fileName);
        //     const searchPaths = this.redLoader.getSearchPaths(fileExtension);
        //     // You can also extract the section and ONCE attributes if needed
        //     const section = moduleMatch[2];
        //     const once = line.includes('ONCE');

        //     for (const searchPath of searchPaths) {
        //         const fullPath = path.join(searchPath, fileName);
        //         if (fs.existsSync(fullPath)) {
        //             const location = new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(0, 0));
        //             return location;
        //         }
        //     }
        // }

       
        // return null; // No definition found
    }
    private getLocationFromPattern(line: string, pattern: RegExp): vscode.Location | null {
        if (line.includes('!') || line.includes('|')) {
            const commentIndex = Math.min(line.indexOf('!'), line.indexOf('|'));
            const patternIndex = line.search(pattern);
    
            if (commentIndex < patternIndex || patternIndex === -1) {
                return null;
            }
        }
        const match = line.match(pattern);
        if (!match) {
            return null;
        }
    
        const fileName = match[1];
        const fileExtension = path.extname(fileName);
        const searchPaths = this.redLoader.getSearchPaths(fileExtension);
        const section = match[2];
        const once = line.includes('ONCE');
    
        for (const searchPath of searchPaths) {
            const fullPath = path.join(searchPath, fileName);
            if (fs.existsSync(fullPath)) {
                return new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(0, 0));
            }
        }
    
        return null;
    }
    
}


// export function registerDefinitionProvider(context: vscode.ExtensionContext) {
//     let definitionProviderDisposable = vscode.languages.registerDefinitionProvider(
//         'clarion', // Language ID
//         {
//             provideDefinition(document, position, token) {
                
//                 // Get the clicked word range at the current position
//                 const wordRange = document.getWordRangeAtPosition(position);
//                 if (!wordRange) {
//                     // No valid word range at the clicked position, so return undefined
//                     return undefined;
//                 }
                
//                 console.log('Clicked Symbol:' + document.getText(wordRange));

//                 // Log the clicked symbol


//                 // Extract the word from the range
//                 const clickedSymbol = document.getText(wordRange);

//                 // Logic to determine if the clicked symbol has a valid definition
//                 // If it does, return a Location or Location[] array
//                 // that represents the definition(s) of the symbol at the given position
//                 const range = new vscode.Range(position, position);
//                 const location = new vscode.Location(document.uri, range);
//                 return location;
//             }
//         }
//     );

//     context.subscriptions.push(definitionProviderDisposable);
// }


function parseIncludeStatements(documentContent: string) {
    const includePattern = /INCLUDE\s*\('([^']+)'\)/ig;
    const parsedStatements = [];

    let match;
    while ((match = includePattern.exec(documentContent)) !== null) {
        const path = match[1];
        const position = match.index;

        parsedStatements.push({
            path,
            position
        });
    }

    return parsedStatements;
}