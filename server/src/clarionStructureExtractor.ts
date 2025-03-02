import { Token, TokenType } from "./ClarionTokenizer.js";
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("StructureExtractor");




class ClarionStructureExtractor {
    private tokens: Token[];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    /**
     * Extracts structure nodes of the specified type (e.g., "FILE").
     * @param name The structure type to filter (e.g., "FILE").
     * @returns Array of matching StructureNode elements.
     */
    public extractStructures(name: string): StructureNode[] {
        logger.info(`🔍 [ExtractStructures] Extracting structures for: '${name.toUpperCase()}'`);
        logger.info(` [ExtractStructures] Token Count: ${this.tokens.length}`);
        
        const matchingTokens = this.tokens.filter(
            token => token.type === TokenType.Structure && token.value.toUpperCase() === name.toUpperCase()
        );

        logger.info(`🔍 [ExtractStructures] Extracting structures for: '${name.toUpperCase()}'`);
        logger.info(`✅ [ExtractStructures] Found ${matchingTokens.length} matching '${name.toUpperCase()}' structures.`);
        // ✅ Log the start line of each matching structure
      
        
        if (matchingTokens.length === 0) {
            logger.warn(`⚠️ [ExtractStructures] No '${name.toUpperCase()}' structures found.`);
            return [];
        }

        return matchingTokens.map(token => {
            const structureNode = this.createStructureNode(token);
            // logger.info(
            //     `✅ [ExtractStructures] Created StructureNode: Name='${structureNode.name}', Type='${structureNode.type}', ` +
            //     `Start=${structureNode.start}, End=${structureNode.end ?? "EOF"}`
            // );
            return structureNode;
        });
    }


    /**
     * Creates a structure node from a given token.
     * @param token The structure start token.
     * @returns The constructed StructureNode.
     */
    private createStructureNode(token: Token): StructureNode {
        logger.info(`🔍 [ExtractStructures] Creating StructureNode for: '${token.value.toUpperCase()}' at Line ${token.line}`);

        let structureNode: StructureNode = {
            name: "Unnamed",
            type: token.value.toUpperCase(),
            start: token.line,
            end: token.structureFinishesAt ?? null,
            tokens: [],
            children: []
        };

        // ✅ Assign previous token (label) as structure name if it exists
        let tokenIndex = this.tokens.indexOf(token);
        if (tokenIndex > 0) {
            let prevToken = this.tokens[tokenIndex - 1];
            if (prevToken.type === TokenType.Label) {
                structureNode.name = prevToken.value; // ✅ Assign label as name
                logger.info(`✅ [ExtractStructures] Assigned Label Name: '${structureNode.name}' to Structure '${structureNode.type}'`);
            }
        }

        // ✅ Find all child structures inside this structure
        let childStructures = this.tokens.filter(t =>
            t.isStructure &&
            t.line > token.line && t.line < (token.structureFinishesAt ?? Number.MAX_VALUE)
        );

        logger.info(`🔍 [ExtractStructures] Found ${childStructures.length} child structures inside '${structureNode.type}'`);

        // ✅ Extract tokens, excluding those inside child structures
        structureNode.tokens = this.tokens.filter(t => {
            if (t.line < token.line || t.line > (token.structureFinishesAt ?? Number.MAX_VALUE)) {
                return false;
            }

            // ✅ Exclude tokens that belong to child structures
            const isInsideChild = childStructures.some(child =>
                t.line >= child.line && t.line <= (child.structureFinishesAt ?? Number.MAX_VALUE)
            );

            if (isInsideChild) {
                logger.info(`🚫 [ExtractStructures] Excluding Token: '${t.value}' at Line ${t.line} (Inside Child Structure '${structureNode.type}')`);
            }

            return !isInsideChild;
        });

        logger.info(`✅ [ExtractStructures] '${structureNode.type}' contains ${structureNode.tokens.length} tokens (excluding children)`);

        // ✅ Recursively build child structures **ENSURING THEY ARE ADDED TO THE PARENT**
        structureNode.children = childStructures.map(childToken => {
            logger.info(`🔍 [ExtractStructures] Processing Child Structure: '${childToken.value.toUpperCase()}' at Line ${childToken.line}`);

            let childNode = this.createStructureNode(childToken);

            // ✅ Assign previous token (label) to child name if available
            let childIndex = this.tokens.indexOf(childToken);
            if (childIndex > 0) {
                let prevChildToken = this.tokens[childIndex - 1];
                if (prevChildToken.type === TokenType.Variable) {
                    childNode.name = prevChildToken.value; // ✅ Assign label to child structure
                    logger.info(`✅ [ExtractStructures] Assigned Label Name: '${childNode.name}' to Child Structure '${childNode.type}'`);
                }
            }

            // 🔍 **Check if the child node is actually being assigned correctly**
            if (childNode) {
                logger.info(`✅ [ExtractStructures] Successfully assigned '${childNode.type}' as a child of '${structureNode.type}'`);
            } else {
                logger.warn(`⚠️ [WARNING] Child structure '${childToken.value.toUpperCase()}' NOT properly assigned to '${structureNode.type}'`);
            }

            return childNode;
        });

        logger.info(`✅ [ExtractStructures] Structure '${structureNode.type}' has ${structureNode.children.length} child structures`);

        return structureNode;
    }






}

/**
 * Represents a structured node (FILE, RECORD, GROUP, etc.)
 */
export interface StructureNode {
    name: string;
    type: string;
    start: number;
    end: number | null;
    tokens: Token[];
    children: StructureNode[];
}

export default ClarionStructureExtractor;
