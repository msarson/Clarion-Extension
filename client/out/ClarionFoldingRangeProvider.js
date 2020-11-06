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
            },
            {
                from: new RegExp("\\s+PROCEDURE", "i"),
                to: new RegExp("\\s+PROCEDURE", "i"),
                removeComment: true
            }
        ];
    }
    provideFoldingRanges(document, context, token) {
        const ranges = [];
        const foldStack = [];
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
        } // document.linecount
        return ranges;
    }
}
exports.ClarionFoldingRangeProvider = ClarionFoldingRangeProvider;
//# sourceMappingURL=ClarionFoldingRangeProvider.js.map