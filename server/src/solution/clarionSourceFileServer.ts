import * as path from 'path';
import * as fs from 'fs';
import { ClarionProjectServer } from './clarionProjectServer';
import { ClarionSourcerFileInfo } from 'common/types';







export class ClarionSourcerFileServer {
    private fileContent: string | null = null;

    constructor(
        public name: string,
        public relativePath: string,
        public project?: ClarionProjectServer
    ) {
        // Ensure name is never undefined
        if (!this.name) {
            this.name = path.basename(this.relativePath || "unknown-file");
        }
        
        // Ensure relativePath is never undefined
        if (!this.relativePath) {
            this.relativePath = this.name;
        }
    }

    toInfo(): ClarionSourcerFileInfo {
        // Ensure name and relativePath are never undefined
        const name = this.name || path.basename(this.relativePath || "unknown-file");
        const relativePath = this.relativePath || name;
        
        return {
            name: name,
            relativePath: relativePath,
            project: this.project ? {
                name: this.project.name,
                type: this.project.type,
                path: this.project.path,
                guid: this.project.guid,
                filename: this.project.filename,
                fileDrivers: this.project.fileDrivers || [],
                libraries: this.project.libraries || [],
                projectReferences: this.project.projectReferences || [],
                noneFiles: this.project.noneFiles || []
            } : undefined
        };
    }

    getAbsolutePath(): string | null {
        if (!this.project) return null;

        const projectPath = this.project.path;
        const fileExt = path.extname(this.name).toLowerCase();

        const projectFilePath = path.join(projectPath, this.relativePath);
        if (fs.existsSync(projectFilePath)) {
            return projectFilePath;
        }

        const searchPaths = this.project.getSearchPaths(fileExt);
        for (const searchPath of searchPaths) {
            const possibleFilePath = path.join(searchPath, this.name);
            if (fs.existsSync(possibleFilePath)) {
                return possibleFilePath;
            }
        }

        return null;
    }

    exists(): boolean {
        return this.getAbsolutePath() !== null;
    }

    getContent(): string | null {
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

    invalidateCache(): void {
        this.fileContent = null;
    }

    findPatternMatches(pattern: RegExp): RegExpExecArray[] {
        const content = this.getContent();
        if (!content) return [];

        const matches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;

        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
            matches.push(match);
        }

        return matches;
    }
}
