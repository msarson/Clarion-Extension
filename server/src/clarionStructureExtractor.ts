import { Token, TokenType } from "./ClarionTokenizer.js";
import logger from "./logger.js";




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
        const matchingTokens = this.tokens.filter(
            token => token.isStructure && token.value.toUpperCase() === name.toUpperCase()
        );
    
        logger.debug(`🔍 [DEBUG] Extracting structures for: '${name.toUpperCase()}'`);
        logger.debug(`✅ [DEBUG] Found ${matchingTokens.length} matching '${name.toUpperCase()}' structures.`);
    
        if (matchingTokens.length === 0) {
            logger.debug(`⚠️ [DEBUG] No '${name.toUpperCase()}' structures found.`);
        }
    
        return matchingTokens.map(token => {
            const structureNode = this.createStructureNode(token);
            logger.debug(
                `✅ [DEBUG] Created StructureNode: Name='${structureNode.name}', Type='${structureNode.type}', ` +
                `Start=${structureNode.start}, End=${structureNode.end ?? "EOF"}`
            );
            return structureNode;
        });
    }
    

    /**
     * Creates a structure node from a given token.
     * @param token The structure start token.
     * @returns The constructed StructureNode.
     */
    private createStructureNode(token: Token): StructureNode {
        let structureNode: StructureNode = {
            name: "Unnamed",
            type: token.value.toUpperCase(),
            start: token.line,
            end: token.structureFinishesAt ?? null,
            tokens: [],
            children: []
        };
    
        // ✅ Check if the previous token is a label (structure name)
        let tokenIndex = this.tokens.indexOf(token);
        if (tokenIndex > 0) {
            let prevToken = this.tokens[tokenIndex - 1];
            if (prevToken.type === TokenType.Variable) {
                structureNode.name = prevToken.value;  // ✅ Assign label as structure name
            }
        }
    
        // ✅ Extract tokens within the structure range
        structureNode.tokens = this.tokens.filter(t =>
            t.line > token.line && t.line <= (token.structureFinishesAt ?? Number.MAX_VALUE)
        );
    
        // ✅ Check if there's a name declaration inside the structure (e.g., CLASS, FILE)
        for (const t of structureNode.tokens) {
            if (t.type === TokenType.Variable && structureNode.name === "Unnamed") {
                structureNode.name = t.value;  // ✅ Assign first encountered variable as name
                break;
            }
        }
    
        // ✅ Extract nested structures
        structureNode.children = structureNode.tokens
            .filter(t => t.isStructure) // ✅ Only extract nested structures
            .map(t => this.createStructureNode(t)); // ✅ Recursively build child structures
    
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
