import { commands, workspace, window as vscodeWindow } from 'vscode';
import { SolutionCache } from '../SolutionCache';
import { globalSettings } from '../globals';
import LoggerManager from '../utils/LoggerManager';
import * as path from 'path';
import * as fs from 'fs';
import { buildQuickOpenItems, DirEntry } from './QuickOpenList';

const logger = LoggerManager.getLogger("QuickOpenProvider");
logger.setLevel("error");

/**
 * Shows a quick picker to open Clarion files from the solution.
 *
 * #532 — the list is built by `QuickOpenList` (vscode-free, tested): the .cwproj items
 * first, then every workspace root honouring `files.exclude` / `search.exclude` and
 * labelled `<root> • <folder>` like VS Code, then the redirection paths outside the
 * roots. Deduplicated by full path only, so same-named files in different folders
 * are all listed and told apart by their description.
 */
export async function showClarionQuickOpen(): Promise<void> {
    if (!workspace.workspaceFolders) {
        vscodeWindow.showWarningMessage("No workspace is open.");
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        // No solution loaded: defer to VS Code's native Quick Open behavior.
        await commands.executeCommand('workbench.action.quickOpen');
        return;
    }

    // ✅ Use allowed file extensions from global settings
    const defaultSourceExtensions = [".clw", ".inc", ".equ", ".eq", ".int"];
    const allowedExtensions = [
        ...defaultSourceExtensions,
        ...globalSettings.fileSearchExtensions.map(ext => ext.toLowerCase())
    ];
    logger.info(`🔍 Searching for files with extensions: ${JSON.stringify(allowedExtensions)}`);

    // The .cwproj items, with the project name for the description.
    const projectFiles: { name: string; fullPath: string; project: string }[] = [];
    for (const project of solutionInfo.projects) {
        for (const sourceFile of project.sourceFiles) {
            projectFiles.push({
                name: sourceFile.name,
                fullPath: path.join(project.path, sourceFile.relativePath || ""),
                project: project.name,
            });
        }
    }

    // Every workspace root, with the exclude globs VS Code's own picker honours.
    const roots = workspace.workspaceFolders.map(f => ({ name: f.name, path: f.uri.fsPath }));
    const excludeGlobs = new Map<string, string[]>();
    for (const folder of workspace.workspaceFolders) {
        const on = (section: string): string[] => {
            const map = workspace.getConfiguration(section, folder.uri).get<Record<string, boolean>>('exclude', {}) ?? {};
            return Object.entries(map).filter(([, v]) => v === true).map(([k]) => k);
        };
        excludeGlobs.set(path.normalize(folder.uri.fsPath).replace(/[\\/]+$/, '').toLowerCase(), [...on('files'), ...on('search')]);
    }

    // Redirection search paths from the server for each project and extension.
    const redirectionPaths: string[] = [];
    try {
        for (const project of solutionInfo.projects) {
            for (const ext of allowedExtensions) {
                const paths = await solutionCache.getSearchPathsFromServer(project.name, ext);
                if (paths.length > 0) redirectionPaths.push(...paths);
            }
        }
    } catch (error) {
        logger.error(`❌ Error requesting search paths: ${error instanceof Error ? error.message : String(error)}`);
    }
    logger.info(`📂 Using search paths: ${JSON.stringify([...new Set(redirectionPaths)])}`);

    const readDir = (dir: string): DirEntry[] =>
        fs.readdirSync(dir, { withFileTypes: true }).map(e => ({ name: e.name, isDirectory: e.isDirectory() }));

    const combinedFiles = buildQuickOpenItems({ projectFiles, roots, redirectionPaths, allowedExtensions, excludeGlobs, readDir })
        .sort((a, b) => a.label.localeCompare(b.label));

    // Show quick pick — descriptions carry the folder, so typing it narrows the list.
    const selectedFile = await vscodeWindow.showQuickPick(combinedFiles, {
        placeHolder: "Select a Clarion file to open",
        matchOnDescription: true,
    });

    if (selectedFile) {
        try {
            let filePath = selectedFile.path;

            // If the stored path doesn't exist on disk, resolve via redirection
            if (!fs.existsSync(filePath)) {
                const baseName = path.basename(filePath);
                logger.info(`🔍 Path not found on disk, resolving via redirection: ${baseName}`);
                const resolved = await solutionCache.findFileWithExtension(baseName);
                if (resolved && fs.existsSync(resolved)) {
                    logger.info(`✅ Resolved via redirection: ${resolved}`);
                    filePath = resolved;
                } else {
                    logger.warn(`⚠️ Could not resolve file via redirection: ${baseName}`);
                }
            }

            const doc = await workspace.openTextDocument(filePath);
            await vscodeWindow.showTextDocument(doc);
        } catch (error) {
            vscodeWindow.showErrorMessage(`Failed to open file: ${selectedFile.path}`);
        }
    }
}
