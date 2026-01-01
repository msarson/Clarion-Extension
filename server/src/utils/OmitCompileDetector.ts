/**
 * Utility to detect if a line is inside an OMIT or COMPILE(false) block
 */

import { Token, TokenType } from '../ClarionTokenizer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("OmitCompileDetector");
logger.setLevel("error");

interface DirectiveBlock {
    type: 'OMIT' | 'COMPILE';
    terminator: string;
    startLine: number;
    endLine: number | null; // null if not yet terminated
}

export class OmitCompileDetector {
    /**
     * Check if a line is inside an OMIT or COMPILE block
     * @param line Line number to check (0-based)
     * @param tokens All tokens in the document
     * @param document The text document
     * @returns true if the line is omitted/compiled out
     */
    public static isLineOmitted(line: number, tokens: Token[], document: TextDocument): boolean {
        const blocks = this.findDirectiveBlocks(tokens, document);
        
        for (const block of blocks) {
            if (block.endLine === null) {
                // Block never ends - check if we're after start
                if (line > block.startLine) {
                    return true;
                }
            } else {
                // Check if line is within the block
                if (line > block.startLine && line < block.endLine) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Find all OMIT/COMPILE directive blocks in the document
     */
    private static findDirectiveBlocks(tokens: Token[], document: TextDocument): DirectiveBlock[] {
        const blocks: DirectiveBlock[] = [];
        const activeBlocks: Array<{ type: 'OMIT' | 'COMPILE', terminator: string, startLine: number }> = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check for OMIT or COMPILE directive
            if (token.type === TokenType.Directive) {
                const directiveType = token.value.toUpperCase();
                
                if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                    // Look for the terminator string in the following tokens
                    // Format: OMIT('terminator') or COMPILE('terminator',expression)
                    let terminatorString: string | null = null;
                    
                    // Find the string token that follows (should be in parentheses)
                    for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                        if (tokens[j].type === TokenType.String) {
                            // Extract the string value (remove quotes)
                            terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                            break;
                        }
                    }
                    
                    if (terminatorString) {
                        activeBlocks.push({
                            type: directiveType as 'OMIT' | 'COMPILE',
                            terminator: terminatorString,
                            startLine: token.line
                        });
                    }
                }
            }
            
            // Check if this line contains a terminator for any open block
            if (activeBlocks.length > 0) {
                // Only check once per line
                const shouldCheckLine = i === 0 || tokens[i - 1].line !== token.line;
                
                if (shouldCheckLine) {
                    const lineText = document.getText({ 
                        start: { line: token.line, character: 0 }, 
                        end: { line: token.line, character: 1000 }
                    }).trim();
                    
                    // Check each open block to see if this line contains its terminator
                    for (let b = activeBlocks.length - 1; b >= 0; b--) {
                        const block = activeBlocks[b];
                        
                        // Don't check before the OMIT/COMPILE directive on the same line
                        if (token.line === block.startLine) {
                            continue;
                        }
                        
                        // Check if this line contains the terminator
                        if (lineText.includes(block.terminator)) {
                            // Found terminator - close this block
                            blocks.push({
                                type: block.type,
                                terminator: block.terminator,
                                startLine: block.startLine,
                                endLine: token.line
                            });
                            activeBlocks.splice(b, 1);
                        }
                    }
                }
            }
        }
        
        // Any blocks that are still open (no terminator found) are active until end of file
        for (const block of activeBlocks) {
            blocks.push({
                type: block.type,
                terminator: block.terminator,
                startLine: block.startLine,
                endLine: null
            });
        }
        
        return blocks;
    }
}
