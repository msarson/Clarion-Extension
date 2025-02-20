import { FoldingRange } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import ClarionTokenizer from "./ClarionTokenizer";

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
    // 🔹 Static Folding Pairs
    private staticFfoldingPairs: IFoldingPair[] = [
        { from: /!REGION/i, to: /!ENDREGION/i, keyword: "!REGION", willFold: true, removeComment: false },
        { from: /^(\w+\s+)?FILE,DRIVER/i, to: /^\s*END/i, keyword: "FILE", willFold: true, removeComment: true }
    ];

    // 🔹 Keyword Groups
    private allKeywords: string[] = [
        "CASE", "IF", "LOOP", "WINDOW", "SHEET",
        "TAB", "QUEUE", "CLASS", "MAP", "FILE",
        "RECORD", "VIEW", "JOIN", "INTERFACE", "GROUP",
        "MODULE", "OPTION", "REPORT", "FORM", "DETAIL",
        "HEADER", "FOOTER", "BREAK", "TOOLBAR", "MENUBAR",
        "MENU", "ACCEPT", "APPLICATION", "OLE", "ITEMIZE",
        "EXECUTE", "BEGIN"
    ];
    // 🔹 New Helper Function for Keyword Extraction
    private getFirstWordAfterSpace(line: string): string {
        let originalLine = line; // Store original for debugging
        // Check if the first character is not a space (column 1 text exists)
        if (line.length > 0 && line[0] !== ' ') {
            let match = line.match(/^\w+/); // Extract first word
            if (match) {
                line = line.substring(match[0].length).trimStart(); // Remove that word & trim
            }
        }
        line = line.trim(); // Trim the line
        let match = line.match(/^\w+/);
        if (match != undefined) {
            match[0] = match[0];
        }

        return match ? match[0] : "";  // Always return a string, never null
    }



    // 🔹 Helper Function to Create Folding Pairs
    private createFoldingPair = (keyword: string): IFoldingPair => {
        return {
            from: new RegExp(`^${keyword}\\b`, "i"),
            to: /^\s*END(\s+|$)/i,
            keyword: keyword,
            willFold: true,
            removeComment: true
        };
    };

    // 🔹 Folding Pairs Using the New Logic
    private foldingPairs: IFoldingPair[] = [
        // Static pairs first
        ...this.staticFfoldingPairs,

        // Unified folding for all keywords
        ...this.allKeywords.map(keyword => ({
            from: new RegExp(`\\b${keyword}\\b(\\s+|\\t+|\\s*\\t*)`, "i"),
            to: /^\s*END(\s+|$)/i,
            keyword: keyword,
            willFold: true,
            removeComment: true
        }))
    ];
    private skippedLines = new Set<number>(); // Track merged lines

    private getLogicalLine({ document, i }: { document: TextDocument; i: number; }): string {
        if (this.skippedLines.has(i)) {
            return ""; // 🚀 Ignore lines we already merged
        }

        let line = document.getText(Range.create(i, 0, i, 1000)); // ❌ Do NOT trim here
        let logicalLine = "";

        while (i < document.lineCount) {
            let uncommentedLine = this.removeComments(line); // ❌ Do NOT trim here either

            if (uncommentedLine.endsWith("|")) {  // ✅ Handle Clarion's line continuation
                logicalLine += uncommentedLine.slice(0, -1) + " "; // ✅ Remove `|`, add space
                this.skippedLines.add(i + 1);  // 🔹 Mark next line to be skipped
                i++; // Move to next line
                line = document.getText(Range.create(i, 0, i, 1000)); // ❌ Do NOT trim
                continue; // Continue processing next line
            }

            logicalLine += uncommentedLine;
            break;
        }
        return logicalLine;
    }



    provideFoldingRanges(document: TextDocument): FoldingRange[] {

        const tokenizer = new ClarionTokenizer(document.getText());
        const tokens = tokenizer.tokenize();
        // Improved logging
        console.log("🔍 Tokenized Clarion Source Code:");
        tokens.forEach((token, index) => {
            console.log(`[${index}] Line ${token.line} | Type: ${token.type} | Value: "${token.value}"`);
        });
        const ranges: FoldingRange[] = [];
        let rootNode: Node = { keyword: "ROOT", startLine: -1, parent: null, willFold: false, closingRegex: /^$/ };
        let currentNode = rootNode;
        let isInMapOrClass = false;  // Track if inside CLASS/MAP/INTERFACE
        let lastProcedureStartLine: number | null = null;

        const procedureRegex = /^\s*\w+(\.\w+)?\s+(PROCEDURE|FUNCTION|ROUTINE)\s*(\([^)]*\))?/i;

        for (let i = 0; i < document.lineCount; i++) {

            let line = this.getLogicalLine({ document, i });//.trim();
            if (!line.trim()) continue;
            let uncommentedLine = line;


            // 🔹 **Check for CLASS/MAP/INTERFACE and Set `isInMapOrClass = true`**
            if (line.match(/\b(CLASS|MAP|INTERFACE)\b/i)) {
                isInMapOrClass = true;
            }

            // 🔹 **Skip Procedure Detection if Inside CLASS/MAP/INTERFACE**
            if (!isInMapOrClass && procedureRegex.test(line)) {
                if (lastProcedureStartLine !== null) {
                    ranges.push(this.createRange({ startLine: lastProcedureStartLine, endLine: i - 1 }));
                }
                lastProcedureStartLine = i;
            }

            // 🔹 **Extract First Word After Space**
            let keyword = this.getFirstWordAfterSpace(line);
            let isEnd = this.isEndStatement(line);
            if (!keyword && !isEnd) continue;

            if (isEnd) {
                if (currentNode.parent) {
                    if (currentNode.willFold) {
                        ranges.push(this.createRange({ startLine: currentNode.startLine, endLine: i }));
                    }

                    // ✅ **Exit CLASS/MAP/INTERFACE when encountering `END`**
                    if (currentNode.keyword === "CLASS" || currentNode.keyword === "MAP" || currentNode.keyword === "INTERFACE") {
                        isInMapOrClass = false;
                    }

                    currentNode = currentNode.parent;
                }
                continue;
            }

            let matchedPair: IFoldingPair | undefined;
            if (keyword !== null) {
                matchedPair = this.foldingPairs.find(p => p.keyword.toUpperCase() === keyword.toUpperCase());
            }






            if (matchedPair) {

                // 🚀 Prevent opening an IF block if it ends with `.`

                let newNode: Node = {
                    keyword: matchedPair.keyword,
                    startLine: i,
                    parent: currentNode,
                    willFold: matchedPair.willFold,
                    closingRegex: matchedPair.to
                };
                currentNode = newNode;
            }



            // 🔹 **Handle Closing Matches**

        }

        // 🔹 **Handle Last Procedure at EOF**
        if (lastProcedureStartLine !== null) {
            ranges.push(this.createRange({ startLine: lastProcedureStartLine, endLine: document.lineCount - 1 }));
        }

        return ranges;
    }



    private createRange({ startLine, endLine }: { startLine: number; endLine: number; }): FoldingRange {
        return FoldingRange.create(startLine, endLine);
    }

    private getLine({ document, i }: { document: TextDocument; i: number; }) {
        return document.getText(Range.create(i, 0, i, 1000));
    }

    private removeComments(line: string): string {
        const originalLine = line; // Store original for debugging

        // Remove content inside single quotes
        let isInString = false;
        let filteredLine = "";
        for (let char of line) {
            if (char === "'") isInString = !isInString;
            if (!isInString) filteredLine += char;
        }

        // Remove comments (everything after `!` or `|`)
        const commentIndex = Math.min(
            filteredLine.indexOf('!') !== -1 ? filteredLine.indexOf('!') : Infinity,
            filteredLine.indexOf('|') !== -1 ? filteredLine.indexOf('|') : Infinity
        );

        const result = commentIndex === Infinity ? filteredLine : filteredLine.substring(0, commentIndex).trim();

        // Debug output

        return result;
    }




    private isEndStatement(line: string): boolean {
        line = line.trim();
        return line.toUpperCase() === "END" || line.endsWith(".");
    }
}
