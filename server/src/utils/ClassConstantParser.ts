import * as fs from 'fs';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('ClassConstantParser');
logger.setLevel('error');

/**
 * Represents a constant required by a CLASS definition
 */
export interface ClassConstant {
    name: string;           // e.g., "StringTheoryLinkMode"
    type: 'Link' | 'DLL';  // What attribute it's used in
    relatedFile?: string;   // e.g., "StringTheory.clw" for Link constants
}

/**
 * Information about constants required by a class
 */
export interface ClassConstantInfo {
    className: string;
    constants: ClassConstant[];
}

/**
 * Parses CLASS definitions to extract required constants from Link() and DLL() attributes
 */
export class ClassConstantParser {
    // Pattern: Link('file.clw', ConstantName)
    private static readonly LINK_PATTERN = /Link\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/gi;
    
    // Pattern: DLL(ConstantName)
    private static readonly DLL_PATTERN = /DLL\s*\(\s*(\w+)\s*\)/gi;
    
    // Pattern: CLASS definition start (with or without opening paren)
    private static readonly CLASS_PATTERN = /^(\w+)\s+CLASS\b/i;

    /**
     * Parses a CLASS definition file and extracts all required constants
     * @param filePath Path to the .inc file
     * @returns Array of ClassConstantInfo for each class in the file
     */
    async parseFile(filePath: string): Promise<ClassConstantInfo[]> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return this.parseContent(content);
        } catch (error) {
            logger.error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Parses CLASS definitions from content string
     * @param content The file content
     * @returns Array of ClassConstantInfo for each class found
     */
    parseContent(content: string): ClassConstantInfo[] {
        const results: ClassConstantInfo[] = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const classMatch = ClassConstantParser.CLASS_PATTERN.exec(line);

            if (classMatch) {
                const className = classMatch[1];
                
                // Collect all lines for this class definition until we hit END or next CLASS
                const classLines: string[] = [line];
                let j = i + 1;
                
                // Check if this is a single-line class definition (no opening paren or ends same line)
                const hasOpenParen = /CLASS\s*\(/i.test(line);
                
                if (hasOpenParen) {
                    // Multi-line class with methods - collect until END
                    while (j < lines.length) {
                        const nextLine = lines[j];
                        classLines.push(nextLine);
                        
                        // Stop at END at column 0 or next CLASS definition at column 0
                        if (/^\s*END\s*$/i.test(nextLine) || (/^\w+\s+CLASS\b/i.test(nextLine) && /^\w/.test(nextLine))) {
                            break;
                        }
                        j++;
                    }
                } else {
                    // Single-line class declaration - might continue on next lines with continuations
                    // But for now, just use the first line as it contains all the attributes
                }

                // Parse constants from the collected class definition
                const constants = this.extractConstants(classLines.join(' '));
                
                if (constants.length > 0) {
                    results.push({
                        className,
                        constants
                    });
                    
                    logger.info(`Found class ${className} with ${constants.length} constant(s): ${constants.map(c => c.name).join(', ')}`);
                }

                // Skip ahead to avoid re-processing
                i = j - 1;
            }
        }

        return results;
    }

    /**
     * Extracts constants from a CLASS definition string
     * @param classDefinition The class definition text
     * @returns Array of ClassConstant objects
     */
    private extractConstants(classDefinition: string): ClassConstant[] {
        const constants: ClassConstant[] = [];

        // Extract Link() constants
        let linkMatch;
        const linkPattern = new RegExp(ClassConstantParser.LINK_PATTERN.source, 'gi');
        while ((linkMatch = linkPattern.exec(classDefinition)) !== null) {
            const relatedFile = linkMatch[1];
            const constantName = linkMatch[2];
            
            constants.push({
                name: constantName,
                type: 'Link',
                relatedFile
            });
            
            logger.debug(`Found Link constant: ${constantName} for file ${relatedFile}`);
        }

        // Extract DLL() constants
        let dllMatch;
        const dllPattern = new RegExp(ClassConstantParser.DLL_PATTERN.source, 'gi');
        while ((dllMatch = dllPattern.exec(classDefinition)) !== null) {
            const constantName = dllMatch[1];
            
            constants.push({
                name: constantName,
                type: 'DLL'
            });
            
            logger.debug(`Found DLL constant: ${constantName}`);
        }

        return constants;
    }

    /**
     * Generates suggested constant definitions for a project file
     * Format: {constantName}=>{value};{constantName}=>{value};
     * @param constants Array of constants to generate definitions for
     * @param useLinkMode If true, generates LinkMode=1, DLLMode=0. If false, opposite.
     * @returns String with constant definitions (e.g., "StringTheoryLinkMode=>1;StringTheoryDllMode=>0;")
     */
    generateConstantDefinitions(constants: ClassConstant[], useLinkMode: boolean = true): string {
        const parts: string[] = [];

        for (const constant of constants) {
            let value: string;
            
            if (constant.type === 'Link') {
                value = useLinkMode ? '1' : '0';
            } else if (constant.type === 'DLL') {
                value = useLinkMode ? '0' : '1';
            } else {
                continue;
            }
            
            // Format: {constantName}=>{value};
            parts.push(`${constant.name}=>${value};`);
        }

        return parts.join('');
    }

    /**
     * Encodes constant definitions for XML insertion (e.g., ">" becomes "&gt;")
     * @param definitions Raw constant definitions string
     * @returns XML-encoded string
     */
    encodeForXml(definitions: string): string {
        return definitions
            .replace(/>/g, '&gt;')
            .replace(/;/g, '%3b');
    }
}
