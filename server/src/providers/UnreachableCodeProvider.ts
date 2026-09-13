/**
 * Server-side Unreachable Code Provider
 * 
 * Uses token finishesAt properties to accurately detect unreachable code
 * without manual depth tracking or complex parsing.
 * 
 * Clarion Control-Flow Semantics:
 * - IF/CASE/EXECUTE are branching structures: RETURN only terminates that branch
 * - LOOP/ACCEPT are looping structures: RETURN terminates the entire procedure
 * - BEGIN is a grouping structure: defers to parent, no control-flow impact
 * - Branch keywords reset termination: ELSE/ELSIF (IF), OF/OROF/ELSE (CASE)
 * - Top-level RETURN (outside any structure) always terminates the procedure
 */

import { Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("UnreachableCodeProvider");
logger.setLevel("error"); // Production: Only log errors

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

            const structure = TokenCache.getInstance().getStructure(document);

            const lines = document.getText().split(/\r?\n/);
            const ranges: Range[] = [];

            // #445 — true iff a physical line ends with a `|` continuation marker,
            // so the NEXT line continues its statement rather than starting one.
            // Mirrors DocumentStructure.lineEndsWithContinuation (private there):
            // walk back over Comment tokens and test the last significant one.
            // Deliberately token-based, not a text scan. Two reasons a naive
            // "does the trimmed line end with |" test gets this wrong:
            //   1. A `|` inside a string literal is not a continuation, and the
            //      tokenizer already knows that — it emits no LineContinuation
            //      there. Clarion uses the same character as the redirection stop
            //      marker, so quoted pipes do occur.
            //   2. Text is allowed AFTER the `|` on the same line and is treated
            //      as a comment, so the line does not end with the character at
            //      all. The tokenizer absorbs that trailing text into the
            //      LineContinuation token's own value (`"|  note to self"`), which
            //      is why this matches on the token TYPE and not on its text.
            const lineEndsWithContinuation = (line: number): boolean => {
                const lt = tokensByLine.get(line);
                if (!lt || lt.length === 0) return false;
                for (let i = lt.length - 1; i >= 0; i--) {
                    const t = lt[i];
                    if (t.type === TokenType.Comment) continue;
                    return t.type === TokenType.LineContinuation || t.value === '|';
                }
                return false;
            };

            // Build line-to-tokens index for fast lookup
            const tokensByLine = new Map<number, Token[]>();
            for (const token of tokens) {
                if (!tokensByLine.has(token.line)) {
                    tokensByLine.set(token.line, []);
                }
                tokensByLine.get(token.line)!.push(token);
            }

            // Pull every indexed procedure-style token (Global/MethodImpl/MapProc/MethodDecl/InterfaceMethod).
            // Procedures without a CODE body are filtered out below by the executionMarker check.
            const procedures = structure.getAllProcedures();
            const allRoutines = structure.findRoutines();

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

                // Filter cached routines down to those inside this procedure
                const routines = allRoutines.filter(t =>
                    t.line > proc.line &&
                    t.line <= procEnd
                );

                // Track termination at each nesting depth
                // structureStack[i] = {structure: Token, terminated: boolean}
                const structureStack: Array<{structure: Token, terminated: boolean}> = [];

                // Scan from CODE marker to procedure end
                for (let lineNum = codeToken.line + 1; lineNum <= procEnd; lineNum++) {
                    const lineTokens = tokensByLine.get(lineNum) || [];

                    // Check if this line starts a ROUTINE (ROUTINEs are always reachable)
                    const routineOnLine = routines.find(r => r.line === lineNum);
                    if (routineOnLine) {
                        logger.info(`Line ${lineNum}: ROUTINE ${routineOnLine.value} - clearing terminated flags and pushing ROUTINE to stack`);
                        structureStack.length = 0; // Clear stack - ROUTINE is new scope
                        // Push ROUTINE onto stack so EXIT can mark it terminated
                        structureStack.push({structure: routineOnLine, terminated: false});
                        continue;
                    }

                    // Check if we're inside a ROUTINE block
                    const containingRoutine = routines.find(r => 
                        r.line < lineNum && 
                        r.finishesAt !== undefined && 
                        r.finishesAt >= lineNum
                    );

                    if (containingRoutine) {
                        // Inside ROUTINE - check for DATA marker to reset
                        const hasDataMarker = lineTokens.some(t => 
                            t.type === TokenType.ExecutionMarker && 
                            t.value.toUpperCase() === 'DATA'
                        );
                        if (hasDataMarker) {
                            structureStack.length = 0;
                            // Re-push ROUTINE after clearing
                            structureStack.push({structure: containingRoutine, terminated: false});
                        }
                        // DON'T continue - let the ROUTINE code be analyzed for unreachability
                    }

                    // Check if a structure STARTS on this line
                    const structureOnLine = lineTokens.find(t => 
                        t.type === TokenType.Structure &&
                        t.finishesAt !== undefined &&
                        t.finishesAt >= lineNum && // Must end on or after this line (includes single-line structures)
                        /^(IF|LOOP|CASE|ACCEPT|EXECUTE|BEGIN)$/i.test(t.value)
                    );
                    
                    if (structureOnLine) {
                        logger.info(`Line ${lineNum}: Structure ${structureOnLine.value} starts (ends at ${structureOnLine.finishesAt})`);
                        structureStack.push({structure: structureOnLine, terminated: false});
                    }

                    // Check for branch keywords - these start new branches and reset terminated flag
                    // MUST be checked BEFORE evaluating if current line is unreachable
                    // - IF: ELSE, ELSIF
                    // - CASE: OF, OROF, ELSE
                    // These are tokenized as ConditionalContinuation (32), Keyword (2), or EndStatement (26)
                    const branchKeyword = lineTokens.find(t => 
                        (t.type === TokenType.Keyword || t.type === TokenType.EndStatement || t.type === TokenType.ConditionalContinuation) && 
                        /^(ELSE|ELSIF|OF|OROF)$/i.test(t.value)
                    );
                    
                    if (branchKeyword) {
                        // Find the nearest enclosing IF or CASE structure and reset its terminated flag
                        for (let i = structureStack.length - 1; i >= 0; i--) {
                            const structValue = structureStack[i].structure.value.toUpperCase();
                            // ELSE/ELSIF reset IF, OF/OROF/ELSE reset CASE
                            const isIfBranch = (structValue === 'IF' && /^(ELSE|ELSIF)$/i.test(branchKeyword.value));
                            const isCaseBranch = (structValue === 'CASE' && /^(OF|OROF|ELSE)$/i.test(branchKeyword.value));
                            
                            if (isIfBranch || isCaseBranch) {
                                logger.info(`Line ${lineNum}: ${branchKeyword.value} branch - resetting terminated flag on enclosing ${structValue}`);
                                structureStack[i].terminated = false;
                                break;
                            }
                        }
                    }

                    // #445 — a physical line whose predecessor ended with `|` is a
                    // CONTINUATION of that statement, not a new one. The walk is
                    // physical-line based, so without this a RETURN split across
                    // lines terminated the procedure on its first line and then
                    // greyed out its own remaining lines as "code after a RETURN".
                    // Idiomatic in real source: a long formatted expression as a
                    // procedure's final statement.
                    const isContinuationLine = lineEndsWithContinuation(lineNum - 1);

                    // Check if current line is unreachable (BEFORE checking for terminators)
                    const currentlyTerminated = structureStack.length > 0 &&
                                               structureStack[structureStack.length - 1].terminated;

                    if (!isContinuationLine && currentlyTerminated && lines[lineNum]) {
                        const line = lines[lineNum];
                        const trimmed = line.trim();
                        
                        // Check if this line is an END statement (structural keyword, never executable code)
                        const hasEndStatement = lineTokens.some(t => 
                            t.type === TokenType.EndStatement && 
                            t.value.toUpperCase() === 'END'
                        );
                        
                        // Skip empty lines, comments, and END statements for unreachable marking
                        const shouldMarkUnreachable = trimmed !== '' && 
                                                     !trimmed.startsWith('!') && 
                                                     !hasEndStatement;
                        
                        if (shouldMarkUnreachable) {
                            ranges.push(Range.create(lineNum, 0, lineNum, line.length));
                            logger.info(`Line ${lineNum}: Marked as unreachable (depth ${structureStack.length})`);
                        }
                    }

                    // Check for terminators (RETURN/EXIT/HALT)
                    // #445 — skipped on a continuation line for the same reason: any
                    // RETURN/EXIT/HALT text there belongs to the statement that began
                    // on an earlier line and was already accounted for there.
                    const terminator = isContinuationLine ? undefined : lineTokens.find(t =>
                        t.type === TokenType.Keyword &&
                        /^(RETURN|EXIT|HALT)$/i.test(t.value)
                    );

                    if (terminator) {
                        // Clarion semantics:
                        // - IF/CASE/EXECUTE are branching: RETURN only terminates that branch
                        // - LOOP/ACCEPT are looping: RETURN terminates the entire procedure
                        // - BEGIN is grouping only: defer to parent structure
                        // - ROUTINE is branching: EXIT terminates the ROUTINE but not procedure
                        
                        // Find the nearest enclosing structure that propagates termination
                        let terminationLevel = -1;
                        for (let i = structureStack.length - 1; i >= 0; i--) {
                            const struct = structureStack[i].structure;
                            const structValue = struct.value.toUpperCase();
                            const isRoutine = struct.subType === TokenType.Routine;
                            
                            if (/^(LOOP|ACCEPT)$/i.test(structValue)) {
                                // Looping structure: RETURN terminates procedure
                                terminationLevel = -1; // Signal procedure-level termination
                                logger.info(`Line ${lineNum}: Terminator inside ${structValue} (looping) - terminates procedure`);
                                break;
                            } else if (isRoutine) {
                                // ROUTINE: EXIT terminates the ROUTINE only
                                terminationLevel = i;
                                logger.info(`Line ${lineNum}: Terminator inside ROUTINE (branching) - terminates only this ROUTINE`);
                                break;
                            } else if (/^(IF|CASE|EXECUTE|BEGIN)$/i.test(structValue)) {
                                // Branching structure: RETURN only terminates this branch
                                // BEGIN is included here because it represents a block/branch within EXECUTE
                                terminationLevel = i;
                                logger.info(`Line ${lineNum}: Terminator inside ${structValue} (branching) - terminates only this branch`);
                                break;
                            }
                            // If we get here, continue searching parent (shouldn't happen with current structures)
                        }
                        
                        if (terminationLevel === -1) {
                            // Procedure-level termination (top-level or inside LOOP/ACCEPT)
                            if (structureStack.length > 0) {
                                // Inside LOOP/ACCEPT - clear stack and mark procedure terminated
                                structureStack.length = 0;
                            }
                            logger.info(`Line ${lineNum}: Procedure-level terminator`);
                            structureStack.push({structure: proc, terminated: true});
                        } else {
                            // Branch-level termination (inside IF/CASE/EXECUTE)
                            structureStack[terminationLevel].terminated = true;
                        }
                        // Don't mark the terminator line itself as unreachable - fall through to structure popping
                    }

                    // Check if any structures END on this line
                    // This must happen after terminator processing so single-line structures can be properly cleaned up
                    const endsOnLine = structureStack.filter(s => s.structure.finishesAt === lineNum);
                    if (endsOnLine.length > 0) {
                        logger.info(`Line ${lineNum}: ${endsOnLine.length} structure(s) end here, popping from stack`);
                        // Remove structures that end on this line
                        structureStack.splice(structureStack.findIndex(s => s.structure.finishesAt === lineNum), endsOnLine.length);
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
}
