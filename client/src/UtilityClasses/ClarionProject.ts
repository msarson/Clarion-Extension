import * as fs from 'fs';
import path = require('path');

export interface clarionProperties {
    directory: string | null;
    fileName: string | null;
    compileMode: string | null;
}

export class ClarionProjectClass {
    public properties: clarionProperties | null = null;
    constructor() {
    }

    private findProjectFile(directory: string): string | null {
        const projectFiles = fs.readdirSync(directory).filter(file => file.endsWith('.cwproj'));
        return projectFiles.length > 0 ? projectFiles[0] : null;
    }

    public  findProjectOrSolutionDirectory(directory: string): clarionProperties | null{
    
        const projectFile = this.findProjectFile(directory);
    
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
                return this.findProjectOrSolutionDirectory(parentDirectory);
            }
        }
        return null;
    }
}
const xml2js = require('xml2js');

