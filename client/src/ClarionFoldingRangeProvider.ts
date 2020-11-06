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
            to: new RegExp("END$", "i"),
            removeComment: true
        },
        {
            from: new RegExp("^RECORD ", "i"),
            to: new RegExp("END$", "i"),
            removeComment: true
        }
    ];

    provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken): ProviderResult<FoldingRange[]> {
        const ranges: FoldingRange[] = [];
        const foldStack: IFoldingPairHit[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            if (token.isCancellationRequested) {
                return null;
            }

            let line = document.lineAt(i).text;
            let startHit: IFoldingPairHit | null = null;
            let startHitAt: number = -1;

            this.foldingPairs.forEach((p, n) => {
                let sudoLine = line
                if(p.removeComment) 
                    sudoLine = sudoLine.replace(new RegExp('!.*$'),'').replace(new RegExp('\\|.*$'),'');
                
                
                const startIdx = sudoLine.search(p.from);
                const endIdx = sudoLine.search(p.to);
                if (startIdx >= 0 && endIdx >= 0 &&
                    startIdx < endIdx) {
                    return; // can not fold "in" a line
                }

                if (startIdx >= 0) {
                    if (startIdx < startHitAt || startHitAt < 0) {
                        startHit = {
                            pair: p,
                            line: i
                        }
                        startHitAt = startIdx
                    }
                }

                if (endIdx >= 0 && foldStack.length > 0) {
                    // found an end - compare to the top of the stack
                    let topStart: IFoldingPairHit = foldStack.pop()!;
                    if (topStart.pair.from === p.from) {
                        // we have a match
                        ranges.push(new FoldingRange(topStart.line, i));
                    } else {
                        // ignore - put top back on stack.
                        foldStack.push(topStart);
                    }

                }
            });

            if (startHit !== null) {
                foldStack.push(startHit);
            }
        }

        return ranges;
    }


}