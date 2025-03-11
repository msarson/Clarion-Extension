import * as path from 'path';
import * as fs from 'fs';
import { Uri } from 'vscode';
import { ClarionProject } from './ClarionProject';

export class ClarionSourcerFile {
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
}
