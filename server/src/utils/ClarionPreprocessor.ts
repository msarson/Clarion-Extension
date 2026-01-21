/**
 * Clarion Preprocessor
 * 
 * Handles COMPILE/OMIT blocks with dynamic terminators by replacing them with blank lines
 * before ANTLR parsing. This preserves line numbers for folding and symbol resolution.
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
 * 2. Extracts the terminator string from the first argument
 * 3. Skips lines until it finds a line containing that terminator string
 * 4. Replaces all skipped lines with blank lines (preserving line count)
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
                const { terminator, startLine } = match;
                
                // Keep the COMPILE/OMIT directive line itself (as comment to preserve structure)
                result.push(`! ${line.trim()} !PREPROCESSED`);
                i++;
                
                // Skip lines until we find the terminator
                let foundTerminator = false;
                while (i < lines.length) {
                    const currentLine = lines[i];
                    
                    // Check if this line contains the terminator string
                    // Per Clarion docs: "ends with the line that contains the same string constant"
                    if (this.lineContainsTerminator(currentLine, terminator)) {
                        // Found terminator - replace with blank and stop skipping
                        result.push(`! ${currentLine.trim()} !PREPROCESSED`);
                        foundTerminator = true;
                        i++;
                        break;
                    } else {
                        // Inside block - replace with blank line
                        result.push('');
                        linesRemoved++;
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
     * Match COMPILE or OMIT directive and extract terminator string
     * Pattern: COMPILE('terminator', condition) or OMIT('terminator', condition)
     */
    private static matchCompileOmitDirective(line: string): { terminator: string; startLine: string } | null {
        // Match COMPILE or OMIT with string literal
        // Pattern: (COMPILE|OMIT)\s*\(\s*'([^']+)'
        // Also handle double quotes: (COMPILE|OMIT)\s*\(\s*"([^"]+)"
        
        const singleQuotePattern = /\b(COMPILE|OMIT)\s*\(\s*'([^']+)'/i;
        const doubleQuotePattern = /\b(COMPILE|OMIT)\s*\(\s*"([^"]+)"/i;
        
        let match = line.match(singleQuotePattern);
        if (match) {
            return { terminator: match[2], startLine: line };
        }
        
        match = line.match(doubleQuotePattern);
        if (match) {
            return { terminator: match[2], startLine: line };
        }
        
        return null;
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
