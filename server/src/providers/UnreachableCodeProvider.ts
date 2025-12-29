/**
 * Server-side Unreachable Code Provider
 * 
 * Uses token finishesAt properties to accurately detect unreachable code
 * without manual depth tracking or complex parsing.
 */

import { TextDocument, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("UnreachableCodeProvider");
logger.setLevel("info");

export class UnreachableCodeProvider {
    /**
     * Provide ranges of unreachable code in a document
     */
    public static provideUnreachableRanges(document: TextDocument): Range[] {
        try {
            const tokens = TokenCache.getInstance().getTokens(document);
            if (!tokens || tokens.length === 0) {
                return [];
            }

            const lines = document.getText().split(/\r?\n/);
            const ranges: Range[] = [];

            // Build line-to-tokens index for fast lookup
            const tokensByLine = new Map<number, Token[]>();
            for (const token of tokens) {
                if (!tokensByLine.has(token.line)) {
                    tokensByLine.set(token.line, []);
                }
                tokensByLine.get(token.line)!.push(token);
            }

            // Find all procedures/methods/functions
            const procedures = tokens.filter(t => 
                t.type === TokenType.Procedure || 
                t.type === TokenType.Function ||
                t.subType === TokenType.MethodImplementation
            );

            logger.info(`Found ${procedures.length} procedures to analyze`);

            for (const proc of procedures) {
                if (proc.finishesAt === undefined) {
                    logger.warn(`Procedure ${proc.value} has no finishesAt, skipping`);
                    continue;
                }

                // Find CODE execution marker
                const codeToken = proc.executionMarker;
                if (!codeToken) {
                    logger.info(`Procedure ${proc.value} has no CODE marker, skipping`);
                    continue;
                }

                logger.info(`Analyzing ${proc.value} from line ${codeToken.line} to ${proc.finishesAt}`);

                const procEnd = proc.finishesAt!; // Already checked above

                // Find all ROUTINE tokens within this procedure
                const routines = tokens.filter(t =>
                    t.subType === TokenType.Routine &&
                    t.line > proc.line &&
                    t.line <= procEnd
                );

                // Scan from CODE marker to procedure end
                let terminated = false;

                for (let lineNum = codeToken.line + 1; lineNum <= procEnd; lineNum++) {
                    const lineTokens = tokensByLine.get(lineNum) || [];

                    // Check if this line starts a ROUTINE (ROUTINEs are always reachable)
                    const routineOnLine = routines.find(r => r.line === lineNum);
                    if (routineOnLine) {
                        logger.info(`Line ${lineNum}: ROUTINE ${routineOnLine.value} - resetting terminated flag`);
                        terminated = false;
                        continue;
                    }

                    // Check if we're inside a ROUTINE block (ROUTINEs can have DATA/CODE sections)
                    const containingRoutine = routines.find(r => 
                        r.line < lineNum && 
                        r.finishesAt !== undefined && 
                        r.finishesAt >= lineNum
                    );

                    if (containingRoutine) {
                        // Inside ROUTINE - don't mark as unreachable
                        // But check for DATA marker to reset terminated flag
                        const hasDataMarker = lineTokens.some(t => 
                            t.type === TokenType.ExecutionMarker && 
                            t.value.toUpperCase() === 'DATA'
                        );
                        if (hasDataMarker) {
                            terminated = false;
                        }
                        continue;
                    }

                    // Check for top-level terminator (RETURN/EXIT/HALT at structure depth 0)
                    if (!terminated) {
                        const isTopLevel = this.isTopLevelTerminator(lineNum, lineTokens, tokens, proc);
                        if (isTopLevel) {
                            logger.info(`Line ${lineNum}: Top-level terminator found, marking subsequent code as unreachable`);
                            terminated = true;
                            continue;
                        } else {
                            // Debug: Log when we find a conditional terminator
                            const hasTerminator = lineTokens.some(t => 
                                t.type === TokenType.Keyword && 
                                /^(RETURN|EXIT|HALT)$/i.test(t.value)
                            );
                            if (hasTerminator) {
                                logger.info(`Line ${lineNum}: Conditional terminator found (inside structure), NOT marking code as unreachable`);
                            }
                        }
                    }

                    // Mark unreachable code
                    if (terminated && lines[lineNum]) {
                        const line = lines[lineNum];
                        const trimmed = line.trim();
                        
                        // Skip empty lines and comments
                        if (trimmed === '' || trimmed.startsWith('!')) {
                            continue;
                        }

                        ranges.push(Range.create(lineNum, 0, lineNum, line.length));
                        logger.info(`Line ${lineNum}: Marked as unreachable`);
                    }
                }
            }

            logger.info(`Found ${ranges.length} unreachable code ranges`);
            return ranges;

        } catch (error) {
            logger.error(`Error in provideUnreachableRanges: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Determine if a line contains a top-level terminator (RETURN/EXIT/HALT)
     * A terminator is top-level if it's NOT inside an IF/LOOP/CASE/etc structure
     */
    private static isTopLevelTerminator(
        lineNum: number,
        lineTokens: Token[],
        allTokens: Token[],
        procedure: Token
    ): boolean {
        // Find RETURN, EXIT, or HALT token on this line
        const terminator = lineTokens.find(t => 
            t.type === TokenType.Keyword && 
            /^(RETURN|EXIT|HALT)$/i.test(t.value)
        );

        if (!terminator) {
            return false;
        }

        // Check if this terminator is inside a control structure
        // Find any structure token where:
        // 1. It's a control structure (IF, LOOP, CASE, ACCEPT, EXECUTE, BEGIN)
        // 2. Starts before this line
        // 3. Ends after this line (finishesAt > lineNum)
        const containingStructure = allTokens.find(t => {
            // Must be a Structure token
            if (t.type !== TokenType.Structure) {
                return false;
            }

            // Must have finishesAt set
            if (t.finishesAt === undefined) {
                return false;
            }

            // Must be a control structure (not PROCEDURE/FUNCTION/ROUTINE/data structures)
            const upperValue = t.value.toUpperCase();
            const isControlStructure = /^(IF|LOOP|CASE|ACCEPT|EXECUTE|BEGIN)$/.test(upperValue);
            if (!isControlStructure) {
                return false;
            }

            // Must contain this line
            const contains = t.line < lineNum && t.finishesAt > lineNum;
            
            if (contains) {
                logger.info(`Line ${lineNum}: RETURN inside ${t.value} structure (line ${t.line}-${t.finishesAt})`);
            }
            
            return contains;
        });

        // If inside a control structure, it's NOT a top-level terminator
        return !containingStructure;
    }
}
