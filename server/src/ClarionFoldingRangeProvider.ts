import { FoldingRange } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import ClarionFoldingProvider from "./ClarionFoldingProvider";
import { ClarionTokenizer } from "./ClarionTokenizer";

export class ClarionFoldingRangeProvider {
    private logMessage: (message: string) => void;

    constructor(logMessage: (message: string) => void) {
        this.logMessage = logMessage;
    }

    provideFoldingRanges(document: TextDocument): FoldingRange[] {
        this.logMessage("[ClarionFoldingRangeProvider] Starting folding computation.");

        // ✅ Pass logMessage to tokenizer
        const tokenizer = new ClarionTokenizer(document.getText(), this.logMessage);
        const tokens = tokenizer.tokenize();

        // ✅ Log token count
        this.logMessage(`[ClarionFoldingRangeProvider] Tokenization complete. ${tokens.length} tokens found.`);

        // ✅ Use ClarionFoldingProvider to compute folding ranges
        const foldingProvider = new ClarionFoldingProvider(tokens, this.logMessage);
        const foldingRanges = foldingProvider.computeFoldingRanges();

        this.logMessage("[ClarionFoldingRangeProvider] Folding computation finished.");
        return foldingRanges;
    }
}

