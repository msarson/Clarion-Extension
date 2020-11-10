"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarionFoldingRangeProvider = void 0;
//import { CancellationToken, FoldingContext, FoldingRange, FoldingRangeProvider, ProviderResult, TextDocument } from 'vscode';
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const vscode_languageserver_1 = require("vscode-languageserver");
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
            // could add  MAP, QUEUE , CLASS, ITEMIZE, INTERFACE 
            // WINDOW,, SHEET, TAB,
            // REPORT, BAND,
            // CASE, LOOP, (IF, ELSIF, ELSE)
            // DATA to CODE        
            // OMIT & COMPILE <-- needs more than just regex, as need to match closing string
        ];
    }
    provideFoldingRanges(document /*, token: CancellationToken*/) {
        const ranges = [];
        const foldStack = [];
        //--------for the Proceudre/routine phase ----------
        const regExProc = new RegExp("\\s+PROCEDURE", "i");
        const regExFunc = new RegExp("\\s+FUNCTION", "i");
        const regExRoutine = new RegExp("\\s+ROUTINE", "i");
        const regExEnd = new RegExp("\\s+END(\\s+|$)", "i");
        const regExGroup = new RegExp("\\s+GROUP(\\s+|$)", "i");
        const RegExMaps = new RegExp("(\\s*)(INTERFACE|CLASS|MAP|MODULE)(\\s+|$)", "i");
        let procStartLine = -1;
        let routineStartLine = -1;
        let mapEndDepth = 0;
        let isInMap = false;
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
            // Removed from server side as I need to work out if valid
            // if (token.isCancellationRequested) {
            //     return null;
            // }
            let line = this.getLine({ document, i });
            //-------------------------------------------- 
            this.foldingPairs.forEach((p) => {
                let parsingLine = line;
                if (p.removeComment)
                    parsingLine = this.removeComments(parsingLine);
                //-------------------------------------------- look for a close
                let lookAgain = 1;
                do {
                    lookAgain = 0;
                    if (toClose != null) {
                        const toCloseIdx = parsingLine.search(toClose.pair.to);
                        if (toCloseIdx >= 0) {
                            // we found the end of the range
                            ranges.push(this.createRange({ startLine: toClose.line, endLine: i }));
                            parsingLine = parsingLine.substring(toCloseIdx + 1, parsingLine.length); // consume part of the line
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
                const startIdx = parsingLine.search(p.from);
                if (startIdx > 0) {
                    const endIdx = parsingLine.substring(startIdx + 1, parsingLine.length).search(p.to); // is there a way to just search the remaining part of the line ?
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
            line = this.removeComments(this.getLine({ document, i })); //
            if (isInMap) {
                if (line.search(regExGroup) >= 0) { // really only applies to CLASS (not MAP or INTERFACE)
                    mapEndDepth += 1;
                }
                if (line.search(regExEnd) >= 0) {
                    mapEndDepth -= 1;
                    if (mapEndDepth == 0) {
                        isInMap = false;
                    }
                }
            }
            else {
                if (line.search(RegExMaps) >= 0) {
                    isInMap = true;
                    mapEndDepth = 1;
                }
                else {
                    let procIdx = line.search(regExProc);
                    if (procIdx < 0) {
                        procIdx = line.search(regExFunc);
                    }
                    if (procIdx >= 0) { // we found the start of a new PROCEDURE (or FUNCTION)
                        if (routineStartLine > 0) {
                            ranges.push(this.createRange({ startLine: routineStartLine, endLine: i - 1 }));
                            routineStartLine = -1;
                        }
                        if (procStartLine > 0) {
                            ranges.push(this.createRange({ startLine: procStartLine, endLine: i - 1 }));
                        }
                        procStartLine = i;
                    }
                    else {
                        let rouIdx = line.search(regExRoutine);
                        if (rouIdx >= 0) { // we found a routine 
                            if (routineStartLine > 0) {
                                ranges.push(this.createRange({ startLine: routineStartLine, endLine: i - 1 }));
                            }
                            routineStartLine = i;
                        }
                    }
                }
            }
        } // document.linecount
        if (routineStartLine > 0) {
            ranges.push(this.createRange({ startLine: routineStartLine, endLine: document.lineCount - 1 }));
            routineStartLine = -1;
        }
        if (procStartLine > 0) {
            ranges.push(this.createRange({ startLine: procStartLine, endLine: document.lineCount - 1 })); //new FoldingRange(procStartLine, document.lineCount - 1));
            procStartLine = -1;
        }
        return ranges;
    }
    createRange({ startLine, endLine }) {
        return vscode_languageserver_types_1.FoldingRange.create(startLine, endLine);
    }
    getLine({ document, i }) {
        return document.getText(vscode_languageserver_1.Range.create(i, -1, i, Number.MAX_VALUE));
    }
    removeComments(line) {
        line = line.replace(new RegExp('!.*$'), '').replace(new RegExp('\\|.*$'), '');
        return line;
    }
}
exports.ClarionFoldingRangeProvider = ClarionFoldingRangeProvider;
//# sourceMappingURL=ClarionFoldingRangeProvider.js.map