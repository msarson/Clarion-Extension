import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { StructureDeclarationIndexer } from './StructureDeclarationIndexer';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('ProjectConstantsChecker');
logger.setLevel('error');

/**
 * Parsed project constant
 */
export interface ProjectConstant {
    name: string;
    value: string;
}

/**
 * Checks project files for defined constants
 */
export class ProjectConstantsChecker {
    // #368: this checker is constructed FRESH on every call site (validator + code-action), so
    // an instance-field cache never hit — each call re-read + xml2js-parsed the .cwproj. Made
    // static (shared across instances) and mtime-validated by the resolved .cwproj file, so a
    // DefineConstants edit re-parses on the next call but repeats are free — no reliance on an
    // external clearCache() call (the landmine #368 flagged). One stat per lookup vs a full XML parse.
    private static constantsCache = new Map<string, { filePath: string; mtimeMs: number; constants: Map<string, string> }>();

    /**
     * Checks if a constant is defined in the project
     * @param constantName The constant to check
     * @param projectPath Path to the project directory
     * @returns true if defined, false otherwise
     */
    async isConstantDefined(constantName: string, projectPath: string): Promise<boolean> {
        const constants = await this.getProjectConstants(projectPath);
        return constants.has(constantName.toLowerCase());
    }

    /**
     * #335 — a compile-condition constant is satisfied by EITHER a cwproj
     * `DefineConstants` entry OR an `EQUATE` declared in source on the
     * project's include/search paths: shops declare `_ABCDllMode_`-style
     * constants in `.inc` files INCLUDEd from every main module, and the
     * compiler accepts both forms for OMIT/COMPILE evaluation. The EQUATE
     * tier reads the structure declaration index (in-memory hit); when the
     * index isn't built yet this degrades to the cwproj-only answer.
     *
     * @param cwprojPath Path to the .cwproj (or project directory) for the DefineConstants tier
     * @param projectPath Optional project key for the structure-index lookup
     */
    async isConstantSatisfied(constantName: string, cwprojPath: string, projectPath?: string): Promise<boolean> {
        if (await this.isConstantDefined(constantName, cwprojPath)) return true;

        const sdi = StructureDeclarationIndexer.getInstance();
        const hits = projectPath && sdi.find(constantName, projectPath).length > 0
            ? sdi.find(constantName, projectPath)
            : sdi.find(constantName);
        return hits.some(d => d.structureType === 'EQUATE' || d.structureType === 'ITEMIZE_EQUATE');
    }

    /**
     * Gets all constants defined in the project
     * @param projectPath Path to the project directory, OR full path to a .cwproj file
     * @returns Map of constant names (lowercase) to their values
     */
    async getProjectConstants(projectPath: string): Promise<Map<string, string>> {
        const normalizedPath = path.normalize(projectPath);

        // #368: mtime-validated cache hit — one stat vs a full re-read + XML parse.
        const cached = ProjectConstantsChecker.constantsCache.get(normalizedPath);
        if (cached) {
            try {
                if ((await fs.promises.stat(cached.filePath)).mtimeMs === cached.mtimeMs) {
                    return cached.constants;
                }
            } catch { /* .cwproj gone/unstatable → fall through and re-parse */ }
        }

        // Find and parse project file (returns the resolved .cwproj path so we can mtime it)
        const { constants, filePath } = await this.parseProjectFile(projectPath);

        // Cache only when we resolved a real, statable .cwproj — otherwise re-parse next time.
        if (filePath) {
            try {
                const mtimeMs = (await fs.promises.stat(filePath)).mtimeMs;
                ProjectConstantsChecker.constantsCache.set(normalizedPath, { filePath, mtimeMs, constants });
            } catch { /* couldn't stat — leave uncached */ }
        }

        return constants;
    }

    /**
     * Parses a .cwproj file to extract DefineConstants
     * @param projectPath Full path to a .cwproj file, or path to the project directory
     * @returns Map of constant names to values
     */
    private async parseProjectFile(projectPath: string): Promise<{ constants: Map<string, string>; filePath: string }> {
        const constants = new Map<string, string>();
        let projectFilePath = '';

        try {
            if (projectPath.toLowerCase().endsWith('.cwproj')) {
                // Full path to specific cwproj provided — use it directly
                projectFilePath = projectPath;
            } else {
                // Directory provided — find first .cwproj (legacy fallback)
                const files = await fs.promises.readdir(projectPath);
                const projectFile = files.find(f => f.toLowerCase().endsWith('.cwproj'));

                if (!projectFile) {
                    logger.warn(`No .cwproj file found in ${projectPath}`);
                    return { constants, filePath: '' };
                }

                projectFilePath = path.join(projectPath, projectFile);
            }
            logger.info(`Parsing project file: ${projectFilePath}`);

            const content = await fs.promises.readFile(projectFilePath, 'utf-8');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(content);

            // Navigate XML structure to find DefineConstants
            // Structure: Project -> PropertyGroup -> DefineConstants
            const project = result.Project;
            if (!project || !project.PropertyGroup) {
                logger.warn('No PropertyGroup found in project file');
                return { constants, filePath: projectFilePath };
            }

            // PropertyGroup can be an array
            const propertyGroups = Array.isArray(project.PropertyGroup) 
                ? project.PropertyGroup 
                : [project.PropertyGroup];

            for (const group of propertyGroups) {
                if (group.DefineConstants && group.DefineConstants.length > 0) {
                    const defineConstants = group.DefineConstants[0];
                    logger.info(`Found DefineConstants: ${defineConstants.substring(0, 100)}...`);
                    
                    // Decode XML entities: &gt; -> >, %3b -> ;
                    const decoded = this.decodeXmlEntities(defineConstants);
                    
                    // Parse constants: name=>value;name=>value;
                    this.parseConstants(decoded, constants);
                }
            }

            logger.info(`Parsed ${constants.size} constants from project file`);

        } catch (error) {
            logger.error(`Error parsing project file: ${error instanceof Error ? error.message : String(error)}`);
        }

        return { constants, filePath: projectFilePath };
    }

    /**
     * Decodes XML entities in the DefineConstants string
     * @param encoded The encoded string
     * @returns Decoded string
     */
    private decodeXmlEntities(encoded: string): string {
        return encoded
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/%3b/gi, ';');
    }

    /**
     * Parses constant definitions string into a map
     * @param definitions String like "name1=>value1;name2=>value2;"
     * @param constants Map to populate
     */
    private parseConstants(definitions: string, constants: Map<string, string>): void {
        // Split by semicolon
        const parts = definitions.split(';');

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // Split by =>
            const [name, value] = trimmed.split('=>');
            if (name && value !== undefined) {
                constants.set(name.trim().toLowerCase(), value.trim());
                logger.debug(`Constant: ${name.trim()} = ${value.trim()}`);
            }
        }
    }

    /**
     * Gets the value of a constant from the project
     * @param constantName The constant name
     * @param projectPath Path to the project directory
     * @returns The constant value, or undefined if not found
     */
    async getConstantValue(constantName: string, projectPath: string): Promise<string | undefined> {
        const constants = await this.getProjectConstants(projectPath);
        return constants.get(constantName.toLowerCase());
    }

    /**
     * Clears the cache for a specific project or all projects
     * @param projectPath Optional project path to clear, or clears all if not provided
     */
    clearCache(projectPath?: string): void {
        if (projectPath) {
            const normalized = path.normalize(projectPath);
            ProjectConstantsChecker.constantsCache.delete(normalized);
            logger.info(`Cleared constants cache for ${normalized}`);
        } else {
            ProjectConstantsChecker.constantsCache.clear();
            logger.info('Cleared all constants cache');
        }
    }
}
