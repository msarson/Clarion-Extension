//import { CancellationToken, FoldingContext, FoldingRange, FoldingRangeProvider, ProviderResult, TextDocument } from 'vscode';
import { FoldingRange} from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver";

interface IFoldingPair {
    from: RegExp;
    to: RegExp;
    removeComment: boolean;
}

interface IFoldingPairHit {
    line: number;
    pair: IFoldingPair;
}
export class ClarionFoldingRangeProvider {//implements FoldingRangeProvider {
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
        // could add  MAP, QUEUE , CLASS, ITEMIZE, INTERFACE 
        // WINDOW,, SHEET, TAB,
        // REPORT, BAND,
        // CASE, LOOP, (IF, ELSIF, ELSE)
        // DATA to CODE        
        // OMIT & COMPILE <-- needs more than just regex, as need to match closing string

    ];


    /**
     * Provides an array of FoldingRange objects that can be used to fold regions of the document.
     * @param document The TextDocument to provide folding ranges for.
     * @returns An array of FoldingRange objects.
     */
    provideFoldingRanges(document: TextDocument): FoldingRange[] {
        const ranges: FoldingRange[] = [];
        const foldStack: IFoldingPairHit[] = [];
    
        const regExProc: RegExp = new RegExp("\\s+PROCEDURE", "i");
        const regExFunc: RegExp = new RegExp("\\s+FUNCTION", "i");
        const regExRoutine: RegExp = new RegExp("\\s+ROUTINE", "i");
        const regExEnd: RegExp = new RegExp("\\s+END(\\s+|$)", "i");
        const regExGroup: RegExp = new RegExp("\\s+GROUP(\\s+|$)", "i");
        const RegExMaps: RegExp = new RegExp("(\\s*)(INTERFACE|CLASS|MAP|MODULE)(\\s+|$)", "i");
    
        let procStartLine: number = -1;
        let routineStartLine: number = -1;
        let mapEndDepth: number = 0;
        let isInMap: boolean = false;
        let toClose: IFoldingPairHit | null = null;
    
        for (let i = 0; i < document.lineCount; i++) {
            let line = this.getLine({ document, i });
    
            // Handle folding pairs
            this.foldingPairs.forEach((p) => {
                let parsingLine: string = line;
                if (p.removeComment)
                    parsingLine = this.removeComments(parsingLine);
    
                // Handle closing folding ranges
                let lookAgain: boolean = true;
                while (lookAgain) {
                    lookAgain = false;
                    if (toClose != null) {
                        const toCloseIdx = parsingLine.search(toClose.pair.to);
                        if (toCloseIdx >= 0) {
                            ranges.push(this.createRange({ startLine: toClose.line, endLine: i }));
                            parsingLine = parsingLine.substring(toCloseIdx + 1, parsingLine.length);
                            if (foldStack.length > 0) {
                                toClose = foldStack.pop()!;
                                lookAgain = true;
                            } else {
                                toClose = null;
                            }
                        }
                    }
                }
    
                // Handle opening folding ranges
                const startIdx = parsingLine.search(p.from);
                if (startIdx > 0) {
                    const endIdx = parsingLine.substring(startIdx + 1, parsingLine.length).search(p.to);
                    if (endIdx > 0) {
                        return; // Cannot fold "in" a line
                    }
    
                    if (toClose != null) {
                        let pushme: IFoldingPairHit;
                        pushme = {
                            pair: toClose.pair,
                            line: toClose.line
                        };
                        foldStack.push(pushme);
                    }
    
                    toClose = {
                        pair: p,
                        line: i
                    };
                }
            });
    
            // Handle PROCEDURES, ROUTINES, and MAPS
            line = this.removeComments(this.getLine({ document, i }));
            if (isInMap) {
                if (line.search(regExGroup) >= 0) {
                    mapEndDepth += 1;
                }
                if (line.search(regExEnd) >= 0) {
                    mapEndDepth -= 1;
                    if (mapEndDepth == 0) {
                        isInMap = false;
                    }
                }
            } else {
                if (line.search(RegExMaps) >= 0) {
                    isInMap = true;
                    mapEndDepth = 1;
                } else {
                    let procIdx = line.search(regExProc);
                    if (procIdx < 0) {
                        procIdx = line.search(regExFunc);
                    }
    
                    if (procIdx >= 0) {
                        if (routineStartLine > 0) {
                            ranges.push(this.createRange({ startLine: routineStartLine, endLine: i - 1 }));
                            routineStartLine = -1;
                        }
                        if (procStartLine > 0) {
                            ranges.push(this.createRange({ startLine: procStartLine, endLine: i - 1 }));
                        }
                        procStartLine = i;
                    } else {
                        let rouIdx = line.search(regExRoutine);
                        if (rouIdx >= 0) {
                            if (routineStartLine > 0) {
                                ranges.push(this.createRange({ startLine: routineStartLine, endLine: i - 1 }));
                            }
                            routineStartLine = i;
                        }
                    }
                }
            }
        }
    
        // Add remaining ranges
        if (routineStartLine > 0) {
            ranges.push(this.createRange({ startLine: routineStartLine, endLine: document.lineCount - 1 }));
        }
        if (procStartLine > 0) {
            ranges.push(this.createRange({ startLine: procStartLine, endLine: document.lineCount - 1 }));
        }
    
        return ranges;
    }

    
    private createRange({ startLine, endLine }: { startLine: number; endLine: number; }): FoldingRange {
        return FoldingRange.create(startLine, endLine);
    }
    private getLine({ document, i }: { document: TextDocument; i: number; }) {
        return document.getText(Range.create(i, 0, i,1000));//Number.MAX_VALUE));
    }

    private removeComments(line: string) {
        line = line.replace(new RegExp('!.*$'), '').replace(new RegExp('\\|.*$'), '');
        return line;
    }
}
