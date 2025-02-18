import { FoldingRange } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";

interface Node {
    keyword: string;
    startLine: number;
    parent: Node | null;
    willFold: boolean;
    closingRegex: RegExp;
}

interface IFoldingPair {
    from: RegExp;
    to: RegExp;
    keyword: string;
    willFold: boolean;
    removeComment: boolean;
}

export class ClarionFoldingRangeProvider {
    private foldingPairs: IFoldingPair[] = [
        { from: /!REGION/i, to: /!ENDREGION/i, keyword: "!REGION", willFold: true, removeComment: false },
        { from: /^(\w+\s+)?FILE,DRIVER/i, to: /^\s*END/i, keyword: "FILE", willFold: true, removeComment: true },
        { from: /^\s*RECORD/i, to: /^\s*END/i, keyword: "RECORD", willFold: true, removeComment: true },
        { from: /(?<=\s)GROUP\s*\(?/i, to: /^\s*END(\s+|$)/i, keyword: "GROUP", willFold: true, removeComment: true },
        { from: /(?<=\s)QUEUE\s*\(?/i, to: /^\s*END(\s+|$)/i, keyword: "QUEUE", willFold: true, removeComment: true },
        { from: /^\s*CASE/i, to: /^\s*END/i, keyword: "CASE", willFold: true, removeComment: true },
        { from: /^\s*LOOP/i, to: /^\s*END/i, keyword: "LOOP", willFold: true, removeComment: true },
        { from: /^\s*IF/i, to: /^\s*END/i, keyword: "IF", willFold: true, removeComment: true },
        { from: /^\s*MAP/i, to: /^\s*END/i, keyword: "MAP", willFold: true, removeComment: true },
        { from: /(?<=\s)VIEW\s*\(?/i, to: /^\s*END/i, keyword: "VIEW", willFold: true, removeComment: true },
        { from: /(?<=\s)CLASS\s*\(?/i, to: /^\s*END/i, keyword: "CLASS", willFold: true, removeComment: true },
        { from: /(?<=\s)INTERFACE\s*\(?/i, to: /^\s*END/i, keyword: "INTERFACE", willFold: true, removeComment: true },
        { from: /\bJOIN\s*(?=\()/i, to: /^\s*END/i, keyword: "JOIN", willFold: true, removeComment: true },
        { from: /\bMODULE\s*(?=\()/i, to: /^\s*END/i, keyword: "MODULE", willFold: true, removeComment: true }
    ];

    provideFoldingRanges(document: TextDocument): FoldingRange[] {
        console.log("[ClarionFoldingRangeProvider] Starting folding computation.");
        const ranges: FoldingRange[] = [];
        let rootNode: Node = { keyword: "ROOT", startLine: -1, parent: null, willFold: false, closingRegex: /^$/ };
        let currentNode = rootNode;
        let isInMapOrClass = false; // Track MAP or CLASS nesting
        let lastProcedureStartLine: number | null = null; // Track PROCEDURE/FUNCTION/ROUTINE folding

        const procedureRegex = /^\s*\w+(\.\w+)?\s+(PROCEDURE|FUNCTION|ROUTINE)\s*(\([^)]*\))?/i;
        console.log(`[DEBUG] Total lines in document: ${document.lineCount}`);
        for (let i = 0; i < document.lineCount; i++) {
            let line = this.getLine({ document, i }).trim();
            let uncommentedLine = line;
            

            line = this.removeComments(line);
            console.log(`[DEBUG] Line ${i}: '${uncommentedLine}'`);

            let isInString = false;
            let filteredLine = "";
            for (let char of line) {
                if (char === "'") isInString = !isInString;
                if (!isInString) filteredLine += char;
            }

            // 🔹 **Detect PROCEDURE/FUNCTION/ROUTINE (Outside MAP/CLASS)**
            if (!isInMapOrClass && procedureRegex.test(filteredLine)) {
                console.log(`[MATCH] PROCEDURE/FUNCTION/ROUTINE found at line ${i}`);

                // **Close the previous procedure before starting the new one**
                if (lastProcedureStartLine !== null) {
                    ranges.push(this.createRange({ startLine: lastProcedureStartLine, endLine: i - 1 }));
                    console.log(`[FOLD] Closing previous procedure from ${lastProcedureStartLine} to ${i - 1}`);
                }

                // Start a new procedure fold
                lastProcedureStartLine = i;
            }

            // 🔹 **Handle Other Folding Structures**
            for (const p of this.foldingPairs) {
                let parsingLine = p.removeComment ? filteredLine : uncommentedLine;
              //  console.log(`[DEBUG] Checking '${p.keyword}' on Line ${i}: '${parsingLine}'`);

                if (p.keyword === "MAP" || p.keyword === "CLASS" || p.keyword === "INTERFACE") {
                    if (p.from.test(parsingLine)) {
                        isInMapOrClass = true;
                        console.log(`[ENTER] ${p.keyword} block on line ${i}`);
                    }
                }


                if (p.from.test(parsingLine)) {
                    console.log(`[Line ${i}] Found opening match: ${p.keyword}`);
                    let newNode: Node = { keyword: p.keyword, startLine: i, parent: currentNode, willFold: p.willFold, closingRegex: p.to };
                    currentNode = newNode;
                    break; // Move to next line immediately after opening match
                }
            }

            let parsingLine = currentNode.closingRegex ? (currentNode.closingRegex.test(filteredLine) ? filteredLine : uncommentedLine) : filteredLine;
            if (currentNode.closingRegex.test(parsingLine)) {
                if (currentNode.parent) {
                    console.log(`[Line ${i}] Closing block '${currentNode.keyword}' started at line ${currentNode.startLine}`);
                    if (currentNode.willFold) {
                        ranges.push(this.createRange({ startLine: currentNode.startLine, endLine: i }));
                    }
                    if (currentNode.keyword === "MAP" || currentNode.keyword === "CLASS" || currentNode.keyword === "INTERFACE") {
                        isInMapOrClass = false; // ✅ Fix: Exit MAP/CLASS only when its closing END is found
                        console.log(`[EXIT] MAP or CLASS ended on line ${i}`);
                    }
                    currentNode = currentNode.parent;
                } else {
                    console.log(`[Line ${i}] Unmatched closing detected at root level.`);
                }
            }
        }

        // 🔹 **Handle Last Procedure at EOF**
        if (lastProcedureStartLine !== null) {
            ranges.push(this.createRange({ startLine: lastProcedureStartLine, endLine: document.lineCount - 1 }));
            console.log(`[FOLD] Adding final fold from ${lastProcedureStartLine} to EOF`);
        }

        console.log("[ClarionFoldingRangeProvider] Folding computation finished.", ranges);
        return ranges;
    }

    private createRange({ startLine, endLine }: { startLine: number; endLine: number; }): FoldingRange {
        return FoldingRange.create(startLine, endLine);
    }
    private getLine({ document, i }: { document: TextDocument; i: number; }) {
        return document.getText(Range.create(i, 0, i, 1000));
    }
    private removeComments(line: string) {
        const commentIndex = Math.min(
            line.indexOf('!') !== -1 ? line.indexOf('!') : Infinity,
            line.indexOf('|') !== -1 ? line.indexOf('|') : Infinity
        );
        return commentIndex === Infinity ? line : line.substring(0, commentIndex).trim();
    }
}
