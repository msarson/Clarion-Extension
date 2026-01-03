import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('ProjectConstantsChecker');
logger.setLevel('info');

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
    private constantsCache = new Map<string, Map<string, string>>(); // projectPath -> (constantName -> value)

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
     * Gets all constants defined in the project
     * @param projectPath Path to the project directory
     * @returns Map of constant names (lowercase) to their values
     */
    async getProjectConstants(projectPath: string): Promise<Map<string, string>> {
        const normalizedPath = path.normalize(projectPath);
        
        // Check cache
        const cached = this.constantsCache.get(normalizedPath);
        if (cached) {
            logger.info(`Using cached constants for ${normalizedPath} (${cached.size} constants)`);
            return cached;
        }

        // Find and parse project file
        const constants = await this.parseProjectFile(projectPath);
        
        // Cache the results
        this.constantsCache.set(normalizedPath, constants);
        logger.info(`Cached ${constants.size} constants for ${normalizedPath}`);
        
        return constants;
    }

    /**
     * Parses a .cwproj file to extract DefineConstants
     * @param projectPath Path to the project directory
     * @returns Map of constant names to values
     */
    private async parseProjectFile(projectPath: string): Promise<Map<string, string>> {
        const constants = new Map<string, string>();

        try {
            // Find .cwproj file in the directory
            const files = await fs.promises.readdir(projectPath);
            const projectFile = files.find(f => f.toLowerCase().endsWith('.cwproj'));

            if (!projectFile) {
                logger.warn(`No .cwproj file found in ${projectPath}`);
                return constants;
            }

            const projectFilePath = path.join(projectPath, projectFile);
            logger.info(`Parsing project file: ${projectFilePath}`);

            const content = await fs.promises.readFile(projectFilePath, 'utf-8');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(content);

            // Navigate XML structure to find DefineConstants
            // Structure: Project -> PropertyGroup -> DefineConstants
            const project = result.Project;
            if (!project || !project.PropertyGroup) {
                logger.warn('No PropertyGroup found in project file');
                return constants;
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

        return constants;
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
            this.constantsCache.delete(normalized);
            logger.info(`Cleared constants cache for ${normalized}`);
        } else {
            this.constantsCache.clear();
            logger.info('Cleared all constants cache');
        }
    }
}
