/**
 * Utility to detect if a line is inside an OMIT or COMPILE(false) block
 */

import { Token, TokenType } from '../ClarionTokenizer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("OmitCompileDetector");
logger.setLevel("error");

export interface DirectiveBlock {
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
        return this.isLineOmittedWithBlocks(line, blocks);
    }
    
    /**
     * Check if a line is inside an OMIT or COMPILE block using pre-computed blocks
     * 🚀 PERF: Use this when checking multiple lines to avoid rebuilding blocks
     * @param line Line number to check (0-based)
     * @param blocks Pre-computed directive blocks from findDirectiveBlocks()
     * @returns true if the line is omitted/compiled out
     */
    public static isLineOmittedWithBlocks(line: number, blocks: DirectiveBlock[]): boolean {
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
     * Find all OMIT/COMPILE directive blocks in the document.
     * Uses a two-pass approach:
     *   1. Collect all OMIT/COMPILE directives (start positions) from tokens
     *   2. Scan all document lines to find terminators
     * This correctly handles terminator lines that produce no tokens (e.g. lines
     * containing only '***'), which the previous single-pass token-driven approach
     * would silently skip, leaving blocks unclosed and flagging the rest of the
     * file as omitted.
     * 🚀 PERF: Make this public so callers can compute once and reuse
     */
    public static findDirectiveBlocks(tokens: Token[], document: TextDocument): DirectiveBlock[] {
        const blocks: DirectiveBlock[] = [];

        // Pass 1: collect OMIT/COMPILE directive positions from tokens
        const pendingBlocks: Array<{ type: 'OMIT' | 'COMPILE', terminator: string, startLine: number }> = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type !== TokenType.Directive) continue;

            const directiveType = token.value.toUpperCase();
            if (directiveType !== 'OMIT' && directiveType !== 'COMPILE') continue;

            let terminatorString: string | null = null;
            for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                if (tokens[j].type === TokenType.String) {
                    terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                    break;
                }
            }

            if (terminatorString) {
                pendingBlocks.push({
                    type: directiveType as 'OMIT' | 'COMPILE',
                    terminator: terminatorString,
                    startLine: token.line
                });
            }
        }

        if (pendingBlocks.length === 0) {
            return blocks;
        }

        // Pass 2: scan every document line to find terminator positions.
        // This correctly handles terminator lines that have no tokens.
        // String literals are stripped before checking so a terminator that
        // appears only inside quotes (e.g. MESSAGE('***')) does NOT close the block.
        // Clarion strings are single-quoted; '' is an escaped single quote inside a string.
        const activeBlocks = [...pendingBlocks];
        const lineCount = document.lineCount;

        for (let lineNum = 0; lineNum < lineCount && activeBlocks.length > 0; lineNum++) {
            const rawLine = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: 1000 }
            });
            // Strip string literals (handles '' escaped quotes inside strings)
            const lineWithoutStrings = rawLine.replace(/'([^']|'')*'/g, "''");

            for (let b = activeBlocks.length - 1; b >= 0; b--) {
                const block = activeBlocks[b];
                if (lineNum <= block.startLine) continue;

                if (lineWithoutStrings.includes(block.terminator)) {
                    blocks.push({
                        type: block.type,
                        terminator: block.terminator,
                        startLine: block.startLine,
                        endLine: lineNum
                    });
                    activeBlocks.splice(b, 1);
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
