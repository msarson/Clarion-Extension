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

                // Track termination at each nesting depth
                // structureStack[i] = {structure: Token, terminated: boolean}
                const structureStack: Array<{structure: Token, terminated: boolean}> = [];

                // Scan from CODE marker to procedure end
                for (let lineNum = codeToken.line + 1; lineNum <= procEnd; lineNum++) {
                    const lineTokens = tokensByLine.get(lineNum) || [];

                    // Check if this line starts a ROUTINE (ROUTINEs are always reachable)
                    const routineOnLine = routines.find(r => r.line === lineNum);
                    if (routineOnLine) {
                        logger.info(`Line ${lineNum}: ROUTINE ${routineOnLine.value} - clearing all terminated flags`);
                        structureStack.length = 0; // Clear stack - ROUTINE is new scope
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
                        }
                        continue;
                    }

                    // Check if any structures END on this line
                    const endsOnLine = structureStack.filter(s => s.structure.finishesAt === lineNum);
                    if (endsOnLine.length > 0) {
                        logger.info(`Line ${lineNum}: ${endsOnLine.length} structure(s) end here, popping from stack`);
                        // Remove structures that end on this line
                        structureStack.splice(structureStack.findIndex(s => s.structure.finishesAt === lineNum), endsOnLine.length);
                    }

                    // Check if a structure STARTS on this line
                    const structureOnLine = lineTokens.find(t => 
                        t.type === TokenType.Structure &&
                        t.finishesAt !== undefined &&
                        t.finishesAt > lineNum && // Must end AFTER this line
                        /^(IF|LOOP|CASE|ACCEPT|EXECUTE|BEGIN)$/i.test(t.value)
                    );
                    
                    if (structureOnLine) {
                        logger.info(`Line ${lineNum}: Structure ${structureOnLine.value} starts (ends at ${structureOnLine.finishesAt})`);
                        structureStack.push({structure: structureOnLine, terminated: false});
                    }

                    // Check for terminators (RETURN/EXIT/HALT)
                    const terminator = lineTokens.find(t => 
                        t.type === TokenType.Keyword && 
                        /^(RETURN|EXIT|HALT)$/i.test(t.value)
                    );

                    if (terminator) {
                        if (structureStack.length > 0) {
                            // Inside a structure - mark THAT level as terminated
                            const currentLevel = structureStack[structureStack.length - 1];
                            currentLevel.terminated = true;
                            logger.info(`Line ${lineNum}: Terminator inside ${currentLevel.structure.value} - marking depth ${structureStack.length} as terminated`);
                        } else {
                            // Top-level terminator - mark procedure as terminated
                            logger.info(`Line ${lineNum}: Top-level terminator found`);
                            structureStack.push({structure: proc, terminated: true});
                        }
                        continue; // Don't mark the RETURN line itself
                    }

                    // Check if current line is unreachable
                    const currentlyTerminated = structureStack.length > 0 && 
                                               structureStack[structureStack.length - 1].terminated;

                    if (currentlyTerminated && lines[lineNum]) {
                        const line = lines[lineNum];
                        const trimmed = line.trim();
                        
                        // Skip empty lines and comments
                        if (trimmed === '' || trimmed.startsWith('!')) {
                            continue;
                        }

                        ranges.push(Range.create(lineNum, 0, lineNum, line.length));
                        logger.info(`Line ${lineNum}: Marked as unreachable (depth ${structureStack.length})`);
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
