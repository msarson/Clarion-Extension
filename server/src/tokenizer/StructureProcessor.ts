/**
 * Structure processing utilities for tokenization
 */

import { Token, TokenType } from './TokenTypes';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("StructureProcessor");
logger.setLevel("error");

export class StructureProcessor {
    /**
     * Process structure fields with prefixes
     * This method enhances tokens with prefix information after document structure processing
     */
    public static processStructureFieldPrefixes(tokens: Token[], lines: string[]): void {
        logger.info("🔍 [DEBUG] Processing structure field prefixes...");
        
        // Find all structure tokens
        const structures = tokens.filter(t =>
            t.type === TokenType.Structure
        );
        
        logger.info(`🔍 [DEBUG] Found ${structures.length} structures to check for prefixes`);
        
        // For each structure, check if it has a PRE attribute
        for (const structure of structures) {
            // Get the line number of the structure
            const lineNum = structure.line;
            
            // Get the line text
            if (!lines || lineNum >= lines.length) continue;
            const line = lines[lineNum];
            
            // Check if the line contains PRE(
            const preMatch = line.match(/PRE\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/i);
            if (preMatch) {
                const prefix = preMatch[1];
                structure.structurePrefix = prefix;
                logger.info(`🔍 [DEBUG] Found structure ${structure.value} with prefix ${prefix}`);
                
                // Find the structure's end line
                const structureEnd = structure.finishesAt || lines.length - 1;
                
                // Find all variable tokens between the structure start and end
                const fieldsInStructure = tokens.filter(t =>
                    (t.type === TokenType.Variable || t.type === TokenType.Label) &&
                    t.line > structure.line &&
                    t.line < structureEnd
                );
                
                logger.info(`🔍 [DEBUG] Found ${fieldsInStructure.length} potential fields in structure ${structure.value}`);
                
                // Mark these as structure fields and add the prefix
                for (const field of fieldsInStructure) {
                    field.isStructureField = true;
                    field.structureParent = structure;
                    field.structurePrefix = prefix;
                    logger.info(`🔍 [DEBUG] Field ${field.value} assigned prefix ${prefix}`);
                    logger.info(`🔍 [DEBUG] Field ${field.value} - isStructureField=${field.isStructureField}, structurePrefix=${field.structurePrefix}`);
                }
                
                // Also look for direct prefix references in the code
                const prefixPattern = new RegExp(`\\b${prefix}:\\w+\\b`, 'gi');
                
                for (let i = 0; i < lines.length; i++) {
                    const codeLine = lines[i];
                    if (!codeLine) continue;
                    
                    const matches = codeLine.match(prefixPattern);
                    if (matches) {
                        logger.info(`🔍 [DEBUG] Found prefix references in line ${i}: ${matches.join(', ')}`);
                    }
                }
            }
        }
    }

    /**
     * Expand tabs into spaces for correct alignment
     */
    public static expandTabs(line: string, tabSize: number): string {
        let expanded = "";
        let currentColumn = 0;

        for (let char of line) {
            if (char === "\t") {
                let nextTabStop = Math.ceil((currentColumn + 1) / tabSize) * tabSize;
                let spacesToAdd = nextTabStop - currentColumn;
                expanded += " ".repeat(spacesToAdd);
                currentColumn = nextTabStop;
            } else {
                expanded += char;
                currentColumn++;
            }
        }

        return expanded;
    }
}
