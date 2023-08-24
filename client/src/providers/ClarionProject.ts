import * as fs from 'fs';
import path = require('path');

export interface ClarionProject {
    directory: string | null;
    fileName: string | null;
    compileMode: string | null;
}

const xml2js = require('xml2js');

/**
 * Finds the first Clarion project file (.cwproj) in the specified directory.
 * @param directory The directory to search for the project file.
 * @returns The path of the project file if found, or null if no project file was found.
 */
export function findProjectFile(directory: string): string | null {
    const projectFiles = fs.readdirSync(directory).filter(file => file.endsWith('.cwproj'));
    return projectFiles.length > 0 ? projectFiles[0] : null;
}

/**
 * Searches for a Clarion project or solution file in the given directory or its parent directories.
 * If found, returns a `ClarionProject` object containing the directory, file name, and compile mode.
 * If not found, returns `null`.
 * @param directory The directory to start the search from.
 * @returns A `ClarionProject` object or `null`.
 */
export function  findProjectOrSolutionDirectory(directory: string): ClarionProject | null{
    
    const projectFile = findProjectFile(directory);

    if (projectFile) {
        const projectFilePath = path.join(directory, projectFile);
        const csprojContent = fs.readFileSync(projectFilePath, 'utf-8');
        const parser = new xml2js.Parser();
        const cleanedContent = csprojContent.replace(/^\uFEFF/, '');

        let compileMode = "Unknown";
        parser.parseString(cleanedContent, (err: any, result: any) => {
            if (err) {
                console.error('Error parsing .csproj file:', err);
                return;
            }

            const configurationValue = result.Project.PropertyGroup[0].Configuration[0]._;
            compileMode = configurationValue || "Unknown";
           
        });
        return {
            directory,
            fileName: projectFile,
            compileMode
        }

    } else {
        const parentDirectory = path.dirname(directory);
        if (parentDirectory !== directory) {
            return findProjectOrSolutionDirectory(parentDirectory);
        }
    }
    return null;
}