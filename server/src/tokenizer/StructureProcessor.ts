/**
 * Structure processing utilities for tokenization
 */

import { Token, TokenType } from './TokenTypes';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("StructureProcessor");
logger.setLevel("error");

// #353: per-field logging here is hot-path — the template-literal arguments are
// built before the logger's level check. Gated like the tokenizer's trace flag.
const TOKENIZER_TRACE = process.env.CLARION_TOKENIZER_TRACE === '1';

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
                if (TOKENIZER_TRACE) logger.info(`🔍 [DEBUG] Found structure ${structure.value} with prefix ${prefix}`);

                // Find the structure's end line
                const structureEnd = structure.finishesAt || lines.length - 1;

                // Find all variable tokens between the structure start and end
                const fieldsInStructure = tokens.filter(t =>
                    (t.type === TokenType.Variable || t.type === TokenType.Label) &&
                    t.line > structure.line &&
                    t.line < structureEnd
                );

                if (TOKENIZER_TRACE) logger.info(`🔍 [DEBUG] Found ${fieldsInStructure.length} potential fields in structure ${structure.value}`);

                // Mark these as structure fields and add the prefix
                for (const field of fieldsInStructure) {
                    field.isStructureField = true;
                    field.structureParent = structure;
                    field.structurePrefix = prefix;
                    if (TOKENIZER_TRACE) {
                        logger.info(`🔍 [DEBUG] Field ${field.value} assigned prefix ${prefix}`);
                        logger.info(`🔍 [DEBUG] Field ${field.value} - isStructureField=${field.isStructureField}, structurePrefix=${field.structurePrefix}`);
                    }
                }

                // #353: a "direct prefix references" loop lived here that regex-scanned
                // EVERY line of the file per PRE()'d structure — its only effect was a
                // logger.info of the matches. Hundreds of FILE,PRE() structures × 11k
                // lines made it a quadratic no-op; deleted outright.
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
