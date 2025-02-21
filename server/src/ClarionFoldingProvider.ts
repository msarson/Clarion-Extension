import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer";

class ClarionFoldingProvider {
    private tokens: Token[];
    private foldingRanges: FoldingRange[];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.foldingRanges = [];
    }

    public computeFoldingRanges(): FoldingRange[] {
        console.log("🔍 [DEBUG] Starting computeFoldingRanges");

        const stack: { type: string; startLine: number }[] = [];

        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const upperValue = token.value.toUpperCase();

            console.log(`📝 [DEBUG] Token at line ${token.line} | Type: ${TokenType[token.type]} | Value: '${token.value}'`);

            // Handle structure start
            if (token.type === TokenType.Structure) {
                console.log(`📌 [DEBUG] Push to stack: ${token.value} at line ${token.line}`);
                stack.push({ type: token.value, startLine: token.line });
            }

            // Handle END keyword
            if (token.type === TokenType.Keyword && upperValue === "END") {
                console.log(`🔍 [DEBUG] Stack before processing END at line ${token.line}:`, stack);

                if (stack.length > 0) {
                    const lastBlock = stack.pop();
                    if (lastBlock) {
                        console.log(`📌 [DEBUG] Folding block: ${lastBlock.type} from line ${lastBlock.startLine} to ${token.line}`);

                        this.foldingRanges.push({
                            startLine: lastBlock.startLine,
                            endLine: token.line,
                            kind: FoldingRangeKind.Region
                        });
                    }
                }

                console.log(`📌 [DEBUG] Stack after processing END at line ${token.line}:`, stack);
            }
        }

        console.log("✅ [DEBUG] Completed computeFoldingRanges");
        return this.foldingRanges;
    }
}

export default ClarionFoldingProvider;
