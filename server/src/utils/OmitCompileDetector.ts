/**
 * Utility to detect if a line is inside an OMIT or COMPILE(false) block
 */

import { Token, TokenType } from '../ClarionTokenizer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import LoggerManager from '../logger';
import { terminatorOnLine } from './ConditionalCompile';

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
        // #711 — every hover asks; finding the blocks walks every token and every line. They depend
        // only on the tokens and the text, so they are found once per (token array, text).
        const text = document.getText();
        let memo = this.blocksMemo.get(tokens);
        if (!memo || memo.text !== text) {
            memo = { text, blocks: this.findDirectiveBlocks(tokens, document) };
            this.blocksMemo.set(tokens, memo);
        }
        return this.isLineOmittedWithBlocks(line, memo.blocks);
    }
    private static blocksMemo = new WeakMap<Token[], { text: string; blocks: DirectiveBlock[] }>();
    
    /**
     * Check if a line is inside an OMIT or COMPILE block using pre-computed blocks
     * 🚀 PERF: Use this when checking multiple lines to avoid rebuilding blocks
     * @param line Line number to check (0-based)
     * @param blocks Pre-computed directive blocks from findDirectiveBlocks()
     * @returns true if the line is omitted/compiled out
     */
    public static isLineOmittedWithBlocks(line: number, blocks: DirectiveBlock[]): boolean {
        for (const block of blocks) {
            // #255 polarity — only OMIT excludes its body. An UNCONDITIONAL
            // COMPILE('term') is the "always compile this" directive: its body is
            // LIVE code. (Conditional forms of both never become blocks — see
            // findDirectiveBlocks — so they stay conservatively live too.)
            // COMPILE blocks are still returned by findDirectiveBlocks because
            // the folding provider folds them.
            if (block.type !== 'OMIT') continue;
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
        return this.findDirectiveBlocksInLines(tokens, document.lineCount, lineNum => document.getText({
            start: { line: lineNum, character: 0 },
            end: { line: lineNum, character: 1000 }
        }));
    }

    /**
     * findDirectiveBlocks over the document's lines rather than a TextDocument — for
     * DocumentStructure, which has the tokens and the source lines but no document.
     */
    public static findDirectiveBlocksInLines(tokens: Token[], lineCount: number, lineText: (line: number) => string, directiveIndexes?: number[]): DirectiveBlock[] {
        const blocks: DirectiveBlock[] = [];

        // Pass 1: collect OMIT/COMPILE directive positions from tokens (only the Directive tokens,
        // when the caller already knows where they are)
        const pendingBlocks: Array<{ type: 'OMIT' | 'COMPILE', terminator: string, startLine: number }> = [];

        const count = directiveIndexes ? directiveIndexes.length : tokens.length;
        for (let n = 0; n < count; n++) {
            const i = directiveIndexes ? directiveIndexes[n] : n;
            const token = tokens[i];
            if (token.type !== TokenType.Directive) continue;

            const directiveType = token.value.toUpperCase();
            if (directiveType !== 'OMIT' && directiveType !== 'COMPILE') continue;

            let terminatorString: string | null = null;
            let terminatorToken: Token | undefined;
            // Whether the directive's line goes on after its closing parenthesis (code or a comment).
            let tail = false;
            for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                if (tokens[j].type === TokenType.String) {
                    terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                    terminatorToken = tokens[j];
                    // If there is a condition argument after the terminator string (comma + identifier),
                    // we cannot evaluate macros at analysis time, so treat conditional OMIT/COMPILE
                    // as not-omitted for navigation purposes (hover, F12, FAR). The argument list ends
                    // at `)`, and a comment is not an argument: what follows either is the rest of the line.
                    let closed = false;
                    for (let k = j + 1; k < tokens.length && tokens[k].line === token.line; k++) {
                        const t = tokens[k];
                        if (!closed && t.type === TokenType.Delimiter) {
                            if (t.value === ')') closed = true;
                            continue; // skip comma/parens
                        }
                        if (closed || t.type === TokenType.Comment) {
                            tail = true;
                            break;
                        }
                        // Any other token before `)` = condition argument present
                        terminatorString = null;
                        break;
                    }
                    break;
                }
            }

            if (terminatorString) {
                // The rest of the directive's own line can hold the terminator (`OMIT('**') ! **`):
                // the block opens and closes on that line. Read only when there is a rest (#733).
                const rest = tail && terminatorToken && terminatorToken.line === token.line
                    ? lineText(token.line).slice(terminatorToken.start + terminatorToken.value.length)
                    : '';
                if (rest && terminatorOnLine(rest, terminatorString)) {
                    blocks.push({
                        type: directiveType as 'OMIT' | 'COMPILE',
                        terminator: terminatorString,
                        startLine: token.line,
                        endLine: token.line
                    });
                    continue;
                }
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
        // A terminator inside a string in code (e.g. MESSAGE('***')) does NOT close the block;
        // one in a comment does, quoted or not (`!'***'`) — see terminatorOnLine.
        const activeBlocks = [...pendingBlocks];
        // #733: this runs on every edit, so start after the first directive, and strip strings
        // only from a line that holds a terminator (stripping cannot create one that has no quote).
        const firstLine = Math.min(...pendingBlocks.map(b => b.startLine)) + 1;
        const quoted = pendingBlocks.some(b => b.terminator.includes("'"));

        for (let lineNum = firstLine; lineNum < lineCount && activeBlocks.length > 0; lineNum++) {
            const rawLine = lineText(lineNum);
            if (!quoted && !activeBlocks.some(b => rawLine.includes(b.terminator))) continue;

            for (let b = activeBlocks.length - 1; b >= 0; b--) {
                const block = activeBlocks[b];
                if (lineNum <= block.startLine) continue;

                if (terminatorOnLine(rawLine, block.terminator)) {
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
