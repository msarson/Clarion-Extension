/**
 * Clarion Preprocessor
 * 
 * Handles COMPILE/OMIT blocks with dynamic terminators before ANTLR parsing.
 * This preserves line numbers for folding and symbol resolution.
 * 
 * Parser Strategy:
 * The parser assumes COMPILE conditions are true and OMIT conditions are false.
 * Code inside OMIT blocks is ignored for structural analysis.
 * 
 * COMPILE/OMIT blocks use arbitrary string terminators that cannot be handled by a 
 * context-free grammar. Example:
 * 
 *   COMPILE('***', TraceFiles)
 *   Trace FILE,DRIVER('ASCII'),CREATE
 *   ...
 *   ***
 * 
 * The preprocessor:
 * 1. Detects COMPILE(terminator, condition) or OMIT(terminator, condition)
 * 2. For COMPILE blocks: Removes directive/terminator lines, keeps code inside
 * 3. For OMIT blocks: Removes directive/terminator lines AND code inside
 * 4. Replaces all removed lines with blank lines (preserving line count)
 */

export interface PreprocessorResult {
    transformedText: string;
    blocksProcessed: number;
    linesRemoved: number;
}

export class ClarionPreprocessor {
    
    /**
     * Preprocess Clarion source code to handle COMPILE/OMIT blocks
     * @param sourceText Original source code
     * @returns Transformed text with COMPILE/OMIT blocks replaced by blank lines
     */
    public static preprocess(sourceText: string): PreprocessorResult {
        const lines = sourceText.split(/\r?\n/);
        const result: string[] = [];
        let blocksProcessed = 0;
        let linesRemoved = 0;
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            
            // Check if this line contains COMPILE or OMIT directive
            const match = this.matchCompileOmitDirective(line);
            
            if (match) {
                const { terminator, startLine, isCompile, condition } = match;
                
                // Evaluate the condition
                const conditionResult = this.evaluateCondition(condition);
                
                // Determine if we should keep or remove the block
                // COMPILE: keep if condition is TRUE, remove if FALSE
                // OMIT: remove if condition is TRUE, keep if FALSE
                const shouldKeepBlock = isCompile ? conditionResult : !conditionResult;
                
                // Remove the COMPILE/OMIT directive line itself
                result.push('');
                linesRemoved++;
                i++;
                
                // Process lines until we find the terminator
                let foundTerminator = false;
                while (i < lines.length) {
                    const currentLine = lines[i];
                    
                    // Check if this line contains the terminator string
                    if (this.lineContainsTerminator(currentLine, terminator)) {
                        // Found terminator - remove it (blank line)
                        result.push('');
                        linesRemoved++;
                        foundTerminator = true;
                        i++;
                        break;
                    } else {
                        // Inside block - keep or remove based on condition evaluation
                        if (shouldKeepBlock) {
                            // Keep the code
                            result.push(currentLine);
                        } else {
                            // Remove the code
                            result.push('');
                            linesRemoved++;
                        }
                        i++;
                    }
                }
                
                if (!foundTerminator) {
                    // Terminator not found - this is an error in the source code
                    // But we continue processing to be resilient
                }
                
                blocksProcessed++;
            } else {
                // Normal line - keep as-is
                result.push(line);
                i++;
            }
        }
        
        return {
            transformedText: result.join('\n'),
            blocksProcessed,
            linesRemoved
        };
    }
    
    /**
     * Match COMPILE or OMIT directive and extract terminator string, directive type, and condition
     * Pattern: COMPILE('terminator', condition) or OMIT('terminator', condition)
     */
    private static matchCompileOmitDirective(line: string): { terminator: string; startLine: string; isCompile: boolean; condition: string | null } | null {
        // Match COMPILE or OMIT with string literal and optional condition
        // Pattern: (COMPILE|OMIT)\s*\(\s*'([^']+)'(\s*,\s*(.+?))?\s*\)
        // Also handle double quotes
        
        const singleQuotePattern = /\b(COMPILE|OMIT)\s*\(\s*'([^']+)'(?:\s*,\s*(.+?))?\s*\)/i;
        const doubleQuotePattern = /\b(COMPILE|OMIT)\s*\(\s*"([^"]+)"(?:\s*,\s*(.+?))?\s*\)/i;
        
        let match = line.match(singleQuotePattern);
        if (match) {
            return { 
                terminator: match[2], 
                startLine: line,
                isCompile: match[1].toUpperCase() === 'COMPILE',
                condition: match[3] ? match[3].trim() : null
            };
        }
        
        match = line.match(doubleQuotePattern);
        if (match) {
            return { 
                terminator: match[2], 
                startLine: line,
                isCompile: match[1].toUpperCase() === 'COMPILE',
                condition: match[3] ? match[3].trim() : null
            };
        }
        
        return null;
    }
    
    /**
     * Evaluate a COMPILE/OMIT condition expression
     * Assumes all symbols equal 1 (TRUE)
     * Supported forms: symbol, symbol=int, symbol<>int, symbol>int, symbol<int, symbol>=int, symbol<=int
     * Returns: true if condition evaluates to true, false otherwise
     */
    private static evaluateCondition(condition: string | null): boolean {
        if (!condition) {
            // No condition means unconditional
            return true;
        }
        
        // Remove whitespace for easier parsing
        const expr = condition.trim();
        
        // Try to match: symbol operator integer
        // Operators: =, <>, >, <, >=, <=
        const comparisonPattern = /^([_a-zA-Z][_a-zA-Z0-9]*)\s*(=|<>|>=|<=|>|<)\s*(-?\d+)$/;
        const match = expr.match(comparisonPattern);
        
        if (match) {
            const symbol = match[1];
            const operator = match[2];
            const value = parseInt(match[3], 10);
            
            // Assume symbol = 1
            const symbolValue = 1;
            
            // Evaluate comparison
            switch (operator) {
                case '=':
                    return symbolValue === value;
                case '<>':
                    return symbolValue !== value;
                case '>':
                    return symbolValue > value;
                case '<':
                    return symbolValue < value;
                case '>=':
                    return symbolValue >= value;
                case '<=':
                    return symbolValue <= value;
                default:
                    return false;
            }
        }
        
        // Just a symbol by itself (no operator) - don't assume its value
        // Without knowing its actual value, conservatively assume false to skip the block
        const symbolPattern = /^[_a-zA-Z][_a-zA-Z0-9]*$/;
        if (symbolPattern.test(expr)) {
            return false; // Unknown symbol value - conservatively skip block
        }
        
        // Unknown expression format - default to false (skip documentation blocks)
        // This ensures we don't parse invalid code in COMPILE blocks with unresolved symbols
        return false;
    }
    
    /**
     * Check if a line contains the terminator string
     * The terminator can appear anywhere on the line, including in comments
     */
    private static lineContainsTerminator(line: string, terminator: string): boolean {
        // Remove leading/trailing whitespace
        const trimmed = line.trim();
        
        // Check if line starts with the terminator (most common case)
        if (trimmed.startsWith(terminator)) {
            return true;
        }
        
        // Check if terminator appears standalone (with optional whitespace)
        if (trimmed === terminator) {
            return true;
        }
        
        // Check if terminator appears after comment marker
        // Example: ! === DO LINK  (terminator in comment)
        if (trimmed.startsWith('!') && trimmed.includes(terminator)) {
            return true;
        }
        
        // Check if line contains terminator (anywhere)
        // Per Clarion docs: "ends with the line that contains the same string constant"
        return trimmed.includes(terminator);
    }
}
