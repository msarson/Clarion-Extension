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
    // 🔹 Static Folding Pairs
    private staticFfoldingPairs: IFoldingPair[] = [
        { from: /!REGION/i, to: /!ENDREGION/i, keyword: "!REGION", willFold: true, removeComment: false },
        { from: /^(\w+\s+)?FILE,DRIVER/i, to: /^\s*END/i, keyword: "FILE", willFold: true, removeComment: true }
    ];

    // 🔹 Regex Constants (Following the Two Rules)
    private static readonly REGEX_END_BASED = /\s+\b${keyword}\b/i;
    private static readonly REGEX_END_SPACE_BASED = /\s+\b${keyword}\b\s*\(?/i;
    private static readonly REGEX_MODULE_BASED = /\s+\b${keyword}\b\s*\(?/i;
    private static readonly REGEX_OTHER_KEYWORDS = /\s+\b${keyword}\b\s*(?=\()/i;



    // 🔹 Keyword Groups
    private endBasedKeywords: string[] = ["CASE", "IF", "LOOP", "MAP", "RECORD", "MENUBAR"];
    private endSpaceBasedKeywords: string[] = ["GROUP", "QUEUE"];
    private moduleBasedKeywords: string[] = ["CLASS", "INTERFACE", "VIEW"];
    private otherKeywords: string[] = ["JOIN", "MODULE"];

    private controlKeywords = ["APPLICATION", "WINDOW", ];


    // 🔹 Helper Function to Create Folding Pairs
    private createFoldingPair = (keyword: string, patternType: string): IFoldingPair => {
        let fromPattern;

        switch (patternType) {
            case "endBasedKeywords":
                fromPattern = new RegExp(`^\\s*\\b${keyword}\\b`, "i");
                break;
            case "endSpaceBasedKeywords":
                fromPattern = new RegExp(`\\s+\\b${keyword}\\b\\s*\\(?`, "i");
                break;
            case "moduleBasedKeywords":
                fromPattern = new RegExp(`\\s+\\b${keyword}\\b\\s*\\(?`, "i");
                break;
            case "otherKeywords":
                fromPattern = new RegExp(`^\\s*\\b${keyword}\\b\\s*(?=\\()`, "i");
                break;
            case "controlKeywords":
                fromPattern = new RegExp(`\\s+\\b${keyword}\\b`, "i");
                break;

            default:
                throw new Error(`Unknown pattern type: ${patternType}`);
        }


        return {
            from: new RegExp(fromPattern, "i"),
            to: /^\s*END(\s+|$)/i,
            keyword: keyword,
            willFold: true,
            removeComment: true
        };
    };
    // 🔹 Folding Pairs Using Constants
    private foldingPairs: IFoldingPair[] = [
        // Static pairs first
        ...this.staticFfoldingPairs,

        // Conditional Before Paren
        ...this.endBasedKeywords.map(keyword => this.createFoldingPair(keyword, "endBasedKeywords")),

        // Require Space Before
        ...this.endSpaceBasedKeywords.map(keyword => this.createFoldingPair(keyword, "endSpaceBasedKeywords")),

        // General Keywords
        ...this.moduleBasedKeywords.map(keyword => this.createFoldingPair(keyword, "moduleBasedKeywords")),

        // Other Keywords
        ...this.otherKeywords.map(keyword => this.createFoldingPair(keyword, "otherKeywords")),

        ...this.controlKeywords.map(keyword => this.createFoldingPair(keyword, "controlKeywords"))

        
    ];


    provideFoldingRanges(document: TextDocument): FoldingRange[] {
        console.log("[ClarionFoldingRangeProvider] Starting folding computation.");
        const ranges: FoldingRange[] = [];
        let rootNode: Node = { keyword: "ROOT", startLine: -1, parent: null, willFold: false, closingRegex: /^$/ };
        let currentNode = rootNode;
        let isInMapOrClass = false;
        let lastProcedureStartLine: number | null = null;

        const procedureRegex = /^\s*\w+(\.\w+)?\s+(PROCEDURE|FUNCTION|ROUTINE)\s*(\([^)]*\))?/i;
        console.log(`[DEBUG] Total lines in document: ${document.lineCount}`);

        for (let i = 0; i < document.lineCount; i++) {
            let line = this.getLine({ document, i }).trim();
            let uncommentedLine = line;
            line = this.removeComments(line);

            let isInString = false;
            let filteredLine = "";
            for (let char of line) {
                if (char === "'") isInString = !isInString;
                if (!isInString) filteredLine += char;
            }

            // 🔹 Detect PROCEDURE/FUNCTION/ROUTINE
            if (!isInMapOrClass && procedureRegex.test(filteredLine)) {
                console.log(`[MATCH] PROCEDURE/FUNCTION/ROUTINE found at line ${i}`);
                if (lastProcedureStartLine !== null) {
                    ranges.push(this.createRange({ startLine: lastProcedureStartLine, endLine: i - 1 }));
                    console.log(`[FOLD] Closing previous procedure from ${lastProcedureStartLine} to ${i - 1}`);
                }
                lastProcedureStartLine = i;
            }

            // 🔹 Handle Other Folding Structures
            for (const p of this.foldingPairs) {
                let parsingLine = p.removeComment ? filteredLine : uncommentedLine;

                // 🔹 Log the line being tested and the current pattern
                console.log(`[DEBUG] Testing line ${i}: "${parsingLine}" with pattern "${p.from}" for keyword "${p.keyword}"`);

                // 🔹 Track Keyword Groups
                console.log(`[DEBUG] Checking against pattern group: ${p.keyword}`);

                // 🔹 Special handling for MAP, CLASS, INTERFACE
                if (p.keyword === "MAP" || p.keyword === "CLASS" || p.keyword === "INTERFACE") {
                    if (p.from.test(parsingLine)) {
                        isInMapOrClass = true;
                        console.log(`[ENTER] ${p.keyword} block on line ${i}`);
                    }
                }

                // 🔹 Test for opening match
                if (p.from.test(parsingLine)) {
                    console.log(`[Line ${i}] Found opening match: ${p.keyword}`);
                    let newNode: Node = {
                        keyword: p.keyword,
                        startLine: i,
                        parent: currentNode,
                        willFold: p.willFold,
                        closingRegex: p.to
                    };
                    currentNode = newNode;
                    break;
                } else {
                    console.log(`[Line ${i}] No match for keyword: ${p.keyword}`);
                }
            }


            let parsingLine = currentNode.closingRegex ? (currentNode.closingRegex.test(filteredLine) ? filteredLine : uncommentedLine) : filteredLine;
            if (this.isEndStatement(parsingLine)) {
                if (currentNode.parent) {
                    console.log(`[Line ${i}] Closing block '${currentNode.keyword}' started at line ${currentNode.startLine}`);
                    if (currentNode.willFold) {
                        ranges.push(this.createRange({ startLine: currentNode.startLine, endLine: i }));
                    }
                    if (currentNode.keyword === "MAP" || currentNode.keyword === "CLASS" || currentNode.keyword === "INTERFACE") {
                        isInMapOrClass = false;
                        console.log(`[EXIT] MAP or CLASS ended on line ${i}`);
                    }
                    currentNode = currentNode.parent;
                } else {
                    console.log(`[Line ${i}] Unmatched closing detected at root level.`);
                }
            }
        }

        // 🔹 Handle Last Procedure at EOF
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

    private isEndStatement(line: string): boolean {
        return line.trim().toUpperCase() === "END";
    }
}
