import { FoldingRange } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import ClarionFoldingProvider from "./ClarionFoldingProvider";
import { ClarionTokenizer } from "./ClarionTokenizer";

export class ClarionFoldingRangeProvider {
    provideFoldingRanges(document: TextDocument): FoldingRange[] {
        console.log("[ClarionFoldingRangeProvider] Starting folding computation.");

        // Tokenize the document
        const tokenizer = new ClarionTokenizer(document.getText());
        const tokens = tokenizer.tokenize();

        // Use ClarionFoldingProvider to compute folding ranges
        const foldingProvider = new ClarionFoldingProvider(tokens);
        const foldingRanges = foldingProvider.computeFoldingRanges();

        console.log("[ClarionFoldingRangeProvider] Folding computation finished.");
        return foldingRanges;
    }

  
}
