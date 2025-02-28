import { FoldingRange } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import { ClarionTokenizer } from "./ClarionTokenizer.js";
import ClarionFoldingProvider from "./ClarionFoldingProvider.js";
import logger from "./logger.js";

// Ensure the class is properly exported
export class ClarionFoldingRangeProvider {
    

    
    provideFoldingRanges(document: TextDocument): FoldingRange[] {
        logger.warn(`📂 [DEBUG] Folding Range Provider called for ${document.uri}`);
        // ✅ Pass logMessage to tokenizer
        const tokenizer = new ClarionTokenizer(document.getText());
        const tokens = tokenizer.tokenize();

        // ✅ Log token count

        // ✅ Use ClarionFoldingProvider to compute folding ranges
        const foldingProvider = new ClarionFoldingProvider(tokens);
        const foldingRanges = foldingProvider.computeFoldingRanges();

        return foldingRanges;
    }
}

