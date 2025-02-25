import { FoldingRange } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import ClarionFoldingProvider from "./ClarionFoldingProvider";
import { ClarionTokenizer } from "./ClarionTokenizer";

export class ClarionFoldingRangeProvider {
    

    
    provideFoldingRanges(document: TextDocument): FoldingRange[] {

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

