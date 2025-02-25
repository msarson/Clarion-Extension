import { Token, TokenType } from "./ClarionTokenizer";
class ClarionStructureExtractor {
    private tokens: Token[];
    private index: number = 0;
    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    
    public extractStructures(name: string,  isRecursive: boolean=false): StructureNode[] {
        let structures: StructureNode[] = [];
        
        while (this.index < this.tokens.length) {
            let token = this.tokens[this.index];
            let upperValue = token.value.toUpperCase();

            // ✅ Only process the specified structure type
            if (token.type === TokenType.Structure && upperValue === name.toUpperCase()) {
                let structureNode: StructureNode = {
                    name: "Unnamed",
                    type: upperValue,
                    start: token.line,
                    end: null,
                    tokens: [],
                    children: []
                };

                // ✅ Check if the previous token is a label (structure name)
                if (this.index > 0) {
                    let prevToken = this.tokens[this.index - 1];
                    if (prevToken.type === TokenType.Label) {
                        structureNode.name = prevToken.value;
                    }
                }

                this.index++; // Move past the structure start token

                while (this.index < this.tokens.length) {
                    let currentToken = this.tokens[this.index];
                    let currentUpperValue = currentToken.value.toUpperCase();
                   

                    // ✅ Detect start of a child structure inside this one
                    if (currentToken.type === TokenType.Structure) {
                        // ✅ Recursively extract nested structure
                        let childStructures = this.extractStructures(currentUpperValue, true);
                        structureNode.children.push(...childStructures);
                        // ✅ Continue processing parent structure after children are done
                        continue;
                    }

                    // ✅ Detect the END of the current structure
                    if (currentToken.type === TokenType.Keyword && (currentUpperValue === "END" || currentToken.value === ".")) {
                        structureNode.end = currentToken.line;
                        if(isRecursive) {
                            structureNode.tokens.push(currentToken);
                            this.index++;
                            return [structureNode];
                        } 
                        // ❌ DO NOT increment this.index++ here
                        break; // ✅ Stop processing this structure first
                    }


                    // ✅ Add relevant tokens to the current structure
                    structureNode.tokens.push(currentToken);

                    // ✅ Move to the next token AFTER handling END
                    this.index++;
                }

                structures.push(structureNode);
            } else {
                this.index++; // Skip unrelated tokens
            }
        }

        return structures;
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
