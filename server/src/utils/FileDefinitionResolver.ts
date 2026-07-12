/**
 * Resolves file references and cross-file definitions
 * Handles INCLUDE files, MEMBER files, and global symbol lookups
 */

import { Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import * as path from 'path';
import * as fs from 'fs';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("FileDefinitionResolver");
logger.setLevel("error");

export class FileDefinitionResolver {
    /**
     * Checks if a word is likely a file reference based on context
     * Includes check for existing labels to avoid false positives
     */
    public isLikelyFileReference(word: string, document: TextDocument, position: Position, tokens: Token[]): boolean {
        // First, check if the word exists as a label in the document
        // If it does, it's more likely to be a reference to that label than a file
        const labelExists = tokens.some(token =>
            token.type === TokenType.Label &&
            token.value.toLowerCase() === word.toLowerCase()
        );

        // If a label with this name exists, it's probably not a file reference
        if (labelExists) {
            logger.info(`Word "${word}" exists as a label in the document, not treating as file reference`);
            return false;
        }

        // Get the current line
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });

        // Check for common Clarion file inclusion patterns
        const includePatterns = [
            /\bINCLUDE\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            // /\bUSE\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            // /\bIMPORT\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            // /\bEQUATE\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            // /\bFROM\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            // /\bSOURCE\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            /\bMODULE\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i,
            /\bMEMBER\b\s*\(?(['"]?[\w\.]+['"]?)?\)?/i
        ];

        // Check if the line contains any of the include patterns
        let isIncludeLine = false;
        for (const pattern of includePatterns) {
            if (pattern.test(line)) {
                isIncludeLine = true;
                break;
            }
        }

        // If this is an include line, check if the word is part of it
        if (isIncludeLine) {
            for (const pattern of includePatterns) {
                const match = line.match(pattern);
                if (match) {
                    // If the pattern matched and the word is part of the match, it's likely a file reference
                    if (match[1] && match[1].includes(word)) {
                        logger.info(`Word "${word}" is part of an include pattern match`);
                        return true;
                    }

                    // If the pattern is on the same line as the word, it's likely a file reference
                    if (line.indexOf(word) > line.search(pattern)) {
                        logger.info(`Word "${word}" appears after an include pattern`);
                        return true;
                    }
                }
            }

            // Check if the word is surrounded by quotes, which often indicates a file
            const wordStart = line.indexOf(word);
            if (wordStart > 0) {
                const prevChar = line.charAt(wordStart - 1);
                const nextCharPos = wordStart + word.length;
                const nextChar = nextCharPos < line.length ? line.charAt(nextCharPos) : '';

                if ((prevChar === "'" ) &&
                    (nextChar === "'" || nextChar === ',')) {
                    logger.info(`Word "${word}" is surrounded by quotes or parentheses in an include line`);
                    return true;
                }
            }
        }

        // If the word has a file extension and is not found as a label in the document,
        // it might be a file reference
        if (/\.(clw|inc|txa|tpl|tpw|trn|int|equ|def)$/i.test(word)) {
            logger.info(`Word "${word}" has a file extension and no matching label, treating as file reference`);
            return true;
        }

        return false;
    }

    /**
     * #328 — resolve a filename through project redirection, OWNER-project
     * first (mirrors FileRelationshipGraph.resolveFile's #315 fix): in a
     * multi-project solution, several projects can redirect the same
     * filename to different physical copies, and the compiler building the
     * FROM file's project uses THAT project's redirection. The solution-order
     * walk remains as the fallback for files no project owns.
     */
    private resolveViaProjectRedirection(fileName: string, fromFsPath: string): string | null {
        const SolutionManager = require('../solution/solutionManager').SolutionManager;
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager?.solution) return null;

        const owner = solutionManager.findProjectForFile?.(fromFsPath);
        if (owner) {
            const resolved = owner.getRedirectionParser().findFile(fileName);
            if (resolved?.path && fs.existsSync(resolved.path)) {
                return resolved.path;
            }
        }

        for (const project of solutionManager.solution.projects) {
            const resolved = project.getRedirectionParser().findFile(fileName);
            if (resolved?.path && fs.existsSync(resolved.path)) {
                return resolved.path;
            }
        }
        return null;
    }

    /**
     * Finds the definition file for a given filename reference
     */
    public async findFileDefinition(fileName: string, documentUri: string): Promise<Location | null> {
        logger.info(`Looking for file: ${fileName}`);

        const currentFilePath = decodeURIComponent(documentUri.replace('file:///', '')).replace(/\//g, '\\');
        const currentDir = path.dirname(currentFilePath);

        // Try redirection first — owner project, then solution order (#328)
        const SolutionManager = require('../solution/solutionManager').SolutionManager;
        const solutionManager = SolutionManager.getInstance();

        const viaRedirection = this.resolveViaProjectRedirection(fileName, currentFilePath);
        if (viaRedirection) {
            logger.info(`Found file via redirection: ${viaRedirection}`);
            return Location.create(
                `file:///${viaRedirection.replace(/\\/g, '/')}`,
                { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
            );
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

        // No-solution-mode tier (#113 site A): when solutionManager is null, walk
        // serverSettings.libsrcPaths via resolveFileInNoSolutionMode. Gated on
        // !solutionManager because in solution-loaded mode the redirection parser
        // above (line 119+) already walks libsrc as its own Tier 3
        // (redirectionFileParserServer.ts:672+); re-probing here would be redundant.
        if (!solutionManager) {
            const noSolutionHit = resolveFileInNoSolutionMode(fileName, documentUri);
            if (noSolutionHit) {
                logger.info(`Found file via no-solution resolver: ${noSolutionHit.path} (source: ${noSolutionHit.source})`);
                return Location.create(
                    `file:///${noSolutionHit.path.replace(/\\/g, '/')}`,
                    { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
                );
            }
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

            // Resolve the include file path — owner project first (#328)
            const SolutionManager = require('../solution/solutionManager').SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            let resolvedPath: string | null = this.resolveViaProjectRedirection(includeFileName, fromPath);

            // Fallback to relative path
            if (!resolvedPath) {
                const currentDir = path.dirname(fromPath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            // No-solution-mode tier (#113 site B): libsrcPaths walk when no solution.
            if (!resolvedPath && !solutionManager) {
                const fromUri = `file:///${fromPath.replace(/\\/g, '/')}`;
                const noSolutionHit = resolveFileInNoSolutionMode(includeFileName, fromUri);
                if (noSolutionHit) {
                    resolvedPath = noSolutionHit.path;
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

            // Similar logic as INCLUDE — owner project first (#328)
            const SolutionManager = require('../solution/solutionManager').SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            let resolvedPath: string | null = this.resolveViaProjectRedirection(memberFileName, fromPath);

            if (!resolvedPath) {
                const currentDir = path.dirname(fromPath);
                const relativePath = path.join(currentDir, memberFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            // No-solution-mode tier (#113 site C): libsrcPaths walk when no solution.
            if (!resolvedPath && !solutionManager) {
                const fromUri = `file:///${fromPath.replace(/\\/g, '/')}`;
                const noSolutionHit = resolveFileInNoSolutionMode(memberFileName, fromUri);
                if (noSolutionHit) {
                    resolvedPath = noSolutionHit.path;
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

}
