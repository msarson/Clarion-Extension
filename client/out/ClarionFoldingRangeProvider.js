"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarionFoldingRangeProvider = void 0;
const vscode_1 = require("vscode");
class ClarionFoldingRangeProvider {
    constructor() {
        this.foldingPairs = [
            {
                from: new RegExp("!REGION", "i"),
                to: new RegExp("!ENDREGION", "i"),
                removeComment: false
            },
            {
                from: new RegExp(" FILE,DRIVER", "i"),
                to: new RegExp("^\\s*END", "i"),
                removeComment: true
            },
            {
                from: new RegExp("\\s+RECORD", "i"),
                to: new RegExp("^\\s*END", "i"),
                removeComment: true
            },
            {
                from: new RegExp("\\s+GROUP", "i"),
                to: new RegExp("^\\s+END(\\s+|$)", "i"),
                removeComment: true
            }
        ];
    }
    provideFoldingRanges(document, context, token) {
        const ranges = [];
        const foldStack = [];
        //--------for the Proceudre/routine phase ----------
        const regExProc = new RegExp("\\s+PROCEDURE", "i");
        const regExFunc = new RegExp("\\s+FUNCTION", "i");
        const regExRoutine = new RegExp("\\s+ROUTINE", "i");
        let procStartLine = -1;
        let routineStartLine = -1;
        // approach:: just search for the next PROCEDURE or ROUTINE 
        // the end of a folding rangee (i - 1) is found when:
        //  if in a ROUTINE  , then finding a new PROCEDURE or ROUTINE
        //  if in a PROCEDURE, then finding a new PROCEDURE only 
        // NOTE: this approach does NOT support nested procedures
        //       to implement that we'll have to look for MAP's and check labels 
        //----------proc --------
        // toClose can be pushed on the foldStack
        let toClose = null;
        //let toCloseAt:number=-1;
        //-------------------------------------------- 
        for (let i = 0; i < document.lineCount; i++) {
            if (token.isCancellationRequested) {
                return null;
            }
            let line = document.lineAt(i).text;
            //-------------------------------------------- 
            this.foldingPairs.forEach((p, n) => {
                //-------------------------------------------- look for a close
                let lookAgain = 1;
                do {
                    lookAgain = 0;
                    if (toClose != null) {
                        const toCloseIdx = line.search(toClose.pair.to);
                        if (toCloseIdx >= 0) {
                            // we found the end of the range
                            ranges.push(new vscode_1.FoldingRange(toClose.line, i));
                            line = line.substring(toCloseIdx + 1, line.length); // consume part of the line
                            if (foldStack.length > 0) {
                                toClose = foldStack.pop(); // what does the ! do ?
                                lookAgain = 1;
                            }
                            else {
                                toClose = null;
                            }
                        }
                    }
                } while (lookAgain == 1);
                //--------------------------------------------
                const startIdx = line.search(p.from);
                if (startIdx > 0) {
                    const endIdx = line.substring(startIdx + 1, line.length).search(p.to); // is there a way to just search the remaining part of the line ?
                    if (endIdx > 0) {
                        return; // can not fold "in" a line
                    }
                    // we have a the start of a folding pair
                    if (toClose != null) {
                        let pushme; // = new IFoldingPairHit();
                        pushme =
                            {
                                pair: toClose.pair,
                                line: toClose.line
                            };
                        foldStack.push(pushme);
                    }
                    toClose =
                        {
                            pair: p,
                            line: i
                        };
                }
            }); // foldingPairs.forEach 
            // -----------------------------------------------
            // Handle PROCEDURES (or FUNCTION) and ROUTINES 
            // -----------------------------------------------
            line = document.lineAt(i).text;
            let procIdx = line.search(regExProc);
            if (procIdx < 0) {
                procIdx = line.search(regExFunc);
            }
            if (procIdx >= 0) { // we found the start of a new PROCEDURE (or FUNCTION)
                if (routineStartLine > 0) {
                    ranges.push(new vscode_1.FoldingRange(routineStartLine, i - 1));
                    routineStartLine = -1;
                }
                if (procStartLine > 0) {
                    ranges.push(new vscode_1.FoldingRange(procStartLine, i - 1));
                }
                procStartLine = i;
            }
            else {
                let rouIdx = line.search(regExRoutine);
                if (rouIdx >= 0) { // we found a routine 
                    if (routineStartLine > 0) {
                        ranges.push(new vscode_1.FoldingRange(routineStartLine, i - 1));
                    }
                    routineStartLine = i;
                }
            }
        } // document.linecount
        if (routineStartLine > 0) {
            ranges.push(new vscode_1.FoldingRange(routineStartLine, document.lineCount - 1));
            routineStartLine = -1;
        }
        if (procStartLine > 0) {
            ranges.push(new vscode_1.FoldingRange(procStartLine, document.lineCount - 1));
            procStartLine = -1;
        }
        return ranges;
    }
}
exports.ClarionFoldingRangeProvider = ClarionFoldingRangeProvider;
//# sourceMappingURL=ClarionFoldingRangeProvider.js.map