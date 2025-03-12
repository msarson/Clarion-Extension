import * as path from 'path';
import * as fs from 'fs';
import { Uri } from 'vscode';
import { ClarionProject } from './ClarionProject';

export class ClarionSourcerFile {
    private fileContent: string | null = null;
    
    constructor(public name: string, public relativePath: string, public project?: ClarionProject) {}

    /**
     * Resolves the absolute file path for this source file.
     * It first checks the project path, then checks within redirection paths.
     */
    getAbsolutePath(): string | null {
        if (!this.project) return null;

        const projectPath = this.project.path;
        const fileExt = path.extname(this.name).toLowerCase();

        // 🔹 First, check if the file exists in the project
        const projectFilePath = path.join(projectPath, this.relativePath);
        if (fs.existsSync(projectFilePath)) {
            return projectFilePath;
        }

        // 🔹 Next, check redirection paths using the updated `getSearchPaths`
        const searchPaths = this.project.getSearchPaths(fileExt);
        for (const searchPath of searchPaths) {
            const possibleFilePath = path.join(searchPath, this.name);
            if (fs.existsSync(possibleFilePath)) {
                return possibleFilePath;
            }
        }

        return null;
    }

    /**
     * Returns the VS Code `Uri` for this file, used when opening the file.
     */
    getUri(): Uri | null {
        const absolutePath = this.getAbsolutePath();
        return absolutePath ? Uri.file(absolutePath) : null;
    }

    /**
     * Checks if the file exists in either the project or redirection paths.
     */
    exists(): boolean {
        return this.getAbsolutePath() !== null;
    }
    
    /**
     * Reads the content of the file from disk.
     * Returns the content if successful, null otherwise.
     */
    getContent(): string | null {
        // Use cached content if available
        if (this.fileContent !== null) {
            return this.fileContent;
        }
        
        const absolutePath = this.getAbsolutePath();
        if (!absolutePath) return null;
        
        try {
            this.fileContent = fs.readFileSync(absolutePath, 'utf-8');
            return this.fileContent;
        } catch (error) {
            console.error(`Error reading file ${absolutePath}:`, error);
            return null;
        }
    }
    
    /**
     * Clears the cached content, forcing it to be re-read from disk next time.
     */
    invalidateCache(): void {
        this.fileContent = null;
    }
    
    /**
     * Finds all occurrences of a pattern within the file content.
     * @param pattern - The regex pattern to search for
     * @returns Array of matches or empty array if file can't be read
     */
    findPatternMatches(pattern: RegExp): RegExpExecArray[] {
        const content = this.getContent();
        if (!content) return [];
        
        const matches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        
        // Reset the regex to start from the beginning
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(content)) !== null) {
            matches.push(match);
        }
        
        return matches;
    }
}
