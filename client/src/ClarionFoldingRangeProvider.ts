import * as vscode from 'vscode';
import { CancellationToken, FoldingContext, FoldingRange, FoldingRangeProvider, ProviderResult, TextDocument } from 'vscode';


interface IFoldingPair {
    from: RegExp;
    to: RegExp;
    removeComment: boolean;
}

interface IFoldingPairHit {
    line: number;
    pair: IFoldingPair;
}
export class ClarionFoldingRangeProvider implements FoldingRangeProvider {
    private foldingPairs: IFoldingPair[] = [
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


    provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken): ProviderResult<FoldingRange[]> {
        const ranges: FoldingRange[] = [];
        const foldStack: IFoldingPairHit[] = [];
        //--------for the Proceudre/routine phase ----------
        const regExProc: RegExp = new RegExp("\\s+PROCEDURE", "i");
        const regExFunc: RegExp = new RegExp("\\s+FUNCTION", "i");
        const regExRoutine: RegExp = new RegExp("\\s+ROUTINE", "i");

        let procStartLine: number = -1;
        let routineStartLine: number = -1;

        // approach:: just search for the next PROCEDURE or ROUTINE 
        // the end of a folding rangee (i - 1) is found when:
        //  if in a ROUTINE  , then finding a new PROCEDURE or ROUTINE
        //  if in a PROCEDURE, then finding a new PROCEDURE only 

        // NOTE: this approach does NOT support nested procedures
        //       to implement that we'll have to look for MAP's and check labels 

        //----------proc --------



        // toClose can be pushed on the foldStack
        let toClose: IFoldingPairHit | null = null;
        //let toCloseAt:number=-1;

        //-------------------------------------------- 
        for (let i = 0; i < document.lineCount; i++) {
            if (token.isCancellationRequested) {
                return null;
            }

            let line = document.lineAt(i).text;

            //-------------------------------------------- 
            this.foldingPairs.forEach((p, n) => {
                let parsingLine: string = line;
                if (p.removeComment)
                    parsingLine = this.removeComments(parsingLine);
                //-------------------------------------------- look for a close
                let lookAgain: number = 1;
                do {
                    lookAgain = 0;
                    if (toClose != null) {
                        const toCloseIdx = parsingLine.search(toClose.pair.to);
                        if (toCloseIdx >= 0) {
                            // we found the end of the range
                            ranges.push(new FoldingRange(toClose.line, i));
                            parsingLine = parsingLine.substring(toCloseIdx + 1, parsingLine.length);  // consume part of the line

                            if (foldStack.length > 0) {
                                toClose = foldStack.pop()!;  // what does the ! do ?
                                lookAgain = 1;

                            } else {
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
                        let pushme: IFoldingPairHit;// = new IFoldingPairHit();
                        pushme =
                        {
                            pair: toClose.pair,
                            line: toClose.line
                        }
                        foldStack.push(pushme);
                    }

                    toClose =
                    {
                        pair: p,
                        line: i
                    }
                }

            }); // foldingPairs.forEach 

            // -----------------------------------------------
            // Handle PROCEDURES (or FUNCTION) and ROUTINES 
            // -----------------------------------------------

            line = document.lineAt(i).text;
            line = this.removeComments(line);
            let procIdx = line.search(regExProc);
            if (procIdx < 0) { procIdx = line.search(regExFunc); }

            if (procIdx >= 0) {  // we found the start of a new PROCEDURE (or FUNCTION)
                if (routineStartLine > 0) {
                    ranges.push(new FoldingRange(routineStartLine, i - 1));
                    routineStartLine = -1;
                }
                if (procStartLine > 0) {
                    ranges.push(new FoldingRange(procStartLine, i - 1));
                }
                procStartLine = i;
            } else {
                let rouIdx = line.search(regExRoutine);
                if (rouIdx >= 0) { // we found a routine 
                    if (routineStartLine > 0) {
                        ranges.push(new FoldingRange(routineStartLine, i - 1));
                    }
                    routineStartLine = i;
                }
            }

        } // document.linecount

        if (routineStartLine > 0) {
            ranges.push(new FoldingRange(routineStartLine, document.lineCount - 1));
            routineStartLine = -1;
        }
        if (procStartLine > 0) {
            ranges.push(new FoldingRange(procStartLine, document.lineCount - 1));
            procStartLine = -1;
        }

        return ranges;
    }



    ///Removes a comment from the end of a string 
    private removeComments(line: string) {
        line = line.replace(new RegExp('!.*$'), '').replace(new RegExp('\\|.*$'), '');
        return line;
    }
}