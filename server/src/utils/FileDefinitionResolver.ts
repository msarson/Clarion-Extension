/**
 * Resolves file references and cross-file definitions
 * Handles INCLUDE files, MEMBER files, and global symbol lookups
 */

import { Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SolutionManager } from '../solution/solutionManager';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("FileDefinitionResolver");

export class FileDefinitionResolver {
    /**
     * Checks if a word is likely a file reference based on context
     */
    public isLikelyFileReference(word: string, document: TextDocument, position: Position): boolean {
        // Get the line to check context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });

        // Check if in an INCLUDE or MEMBER statement
        if (/INCLUDE\s*\(\s*['"]/.test(line) || /MEMBER\s*\(\s*['"]/.test(line)) {
            logger.info(`Word ${word} is in INCLUDE/MEMBER statement`);
            return true;
        }

        // Check if it looks like a filename (has extension)
        if (/\.(clw|inc|equ|int|trn)$/i.test(word)) {
            logger.info(`Word ${word} looks like a filename`);
            return true;
        }

        return false;
    }

    /**
     * Finds the definition file for a given filename reference
     */
    public async findFileDefinition(fileName: string, documentUri: string): Promise<Location | null> {
        logger.info(`Looking for file: ${fileName}`);

        const currentFilePath = decodeURIComponent(documentUri.replace('file:///', '')).replace(/\//g, '\\');
        const currentDir = path.dirname(currentFilePath);

        // Try solution-wide redirection first
        const SolutionManager = require('../solution/solutionManager').SolutionManager;
        const solutionManager = SolutionManager.getInstance();
        
        if (solutionManager && solutionManager.solution) {
            for (const project of solutionManager.solution.projects) {
                const redirectionParser = project.getRedirectionParser();
                const resolved = redirectionParser.findFile(fileName);
                if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                    logger.info(`Found file via redirection: ${resolved.path}`);
                    return Location.create(
                        `file:///${resolved.path.replace(/\\/g, '/')}`,
                        { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
                    );
                }
            }
        }

        // Fallback to relative path
        const relativePath = path.join(currentDir, fileName);
        if (fs.existsSync(relativePath)) {
            logger.info(`Found file: ${relativePath}`);
            return Location.create(
                `file:///${relativePath.replace(/\\/g, '/')}`,
                { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
            );
        }

        logger.info(`File not found: ${fileName}`);
        return null;
    }

    /**
     * Searches for a definition in INCLUDE files
     */
    public async findDefinitionInIncludes(word: string, fromPath: string, visited: Set<string> = new Set()): Promise<Location | null> {
        // Prevent infinite recursion
        if (visited.has(fromPath)) {
            return null;
        }
        visited.add(fromPath);

        logger.info(`Searching for ${word} in includes from ${fromPath}`);

        if (!fs.existsSync(fromPath)) {
            logger.info(`File does not exist: ${fromPath}`);
            return null;
        }

        const content = fs.readFileSync(fromPath, 'utf8');
        const lines = content.split('\n');

        // Find INCLUDE statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;

            const includeFileName = includeMatch[1];
            logger.info(`Found INCLUDE: ${includeFileName}`);

            // Resolve the include file path
            let resolvedPath: string | null = null;

            // Try solution-wide redirection
            const SolutionManager = require('../solution/solutionManager').SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }

            // Fallback to relative path
            if (!resolvedPath) {
                const currentDir = path.dirname(fromPath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            if (resolvedPath && fs.existsSync(resolvedPath)) {
                logger.info(`Resolved INCLUDE to: ${resolvedPath}`);

                // Search in the included file
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');

                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    // Simple check if line starts with the word (label at column 0)
                    if (includeLine.trim().toLowerCase().startsWith(word.toLowerCase())) {
                        logger.info(`Found definition for ${word} in ${resolvedPath} at line ${j}`);
                        return Location.create(
                            `file:///${resolvedPath.replace(/\\/g, '/')}`,
                            { start: { line: j, character: 0 }, end: { line: j, character: includeLine.length } }
                        );
                    }
                }

                // Recursively search includes in the included file
                const result = await this.findDefinitionInIncludes(word, resolvedPath, visited);
                if (result) {
                    return result;
                }
            }
        }

        // If no definition found in includes, check for MEMBER statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const memberMatch = line.match(/MEMBER\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!memberMatch) continue;

            const memberFileName = memberMatch[1];
            logger.info(`Found MEMBER: ${memberFileName}`);

            // Similar logic as INCLUDE
            let resolvedPath: string | null = null;
            const SolutionManager = require('../solution/solutionManager').SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(memberFileName);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }

            if (!resolvedPath) {
                const currentDir = path.dirname(fromPath);
                const relativePath = path.join(currentDir, memberFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            if (resolvedPath && fs.existsSync(resolvedPath)) {
                const result = await this.findDefinitionInIncludes(word, resolvedPath, visited);
                if (result) {
                    return result;
                }
            }
        }

        logger.info(`No definition found for '${word}' in ${fromPath} or its includes/members`);
        return null;
    }

    /**
     * Searches for a global definition across all files in the solution
     */
    public async findGlobalDefinition(word: string, documentUri: string): Promise<Location | null> {
        logger.info(`Searching for global definition of ${word}`);

        const SolutionManager = require('../solution/solutionManager').SolutionManager;
        const solutionManager = SolutionManager.getInstance();
        
        if (!solutionManager || !solutionManager.solution) {
            logger.info('No solution loaded');
            return null;
        }

        // Search across all projects in the solution
        for (const project of solutionManager.solution.projects) {
            logger.info(`Searching in project: ${project.name}`);
            
            // Search in project source files
            for (const sourceFile of project.sourceFiles) {
                if (!fs.existsSync(sourceFile)) continue;

                const content = fs.readFileSync(sourceFile, 'utf8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Check if line starts with the word (label/definition at column 0)
                    if (line.trim().toLowerCase().startsWith(word.toLowerCase())) {
                        logger.info(`Found global definition in ${sourceFile} at line ${i}`);
                        return Location.create(
                            `file:///${sourceFile.replace(/\\/g, '/')}`,
                            { start: { line: i, character: 0 }, end: { line: i, character: line.length } }
                        );
                    }
                }
            }
        }

        logger.info(`No global definition found for ${word}`);
        return null;
    }
}
