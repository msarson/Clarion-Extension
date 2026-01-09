import { TextDocument, Position, Range } from 'vscode-languageserver';

/**
 * Utility class for detecting procedure calls and references in code.
 * Centralizes logic for recognizing different procedure invocation patterns.
 */
export class ProcedureCallDetector {
    /**
     * Check if the word at the given position is a procedure call or reference.
     * Handles multiple patterns:
     * - Direct call: MyProcedure()
     * - START() call: START(MyProcedure, ...)
     * 
     * @returns true if this is a procedure call/reference
     */
    public static isProcedureCallOrReference(
        document: TextDocument,
        position: Position,
        wordRange: Range | undefined
    ): { isProcedure: boolean; isStartCall: boolean } {
        if (!wordRange) {
            return { isProcedure: false, isStartCall: false };
        }

        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        // Get text before and after the word
        const afterWord = line.substring(wordRange.end.character).trimStart();
        const beforeWord = line.substring(0, wordRange.start.character);

        // Check for direct procedure call: word followed by (
        const hasParenthesesAfter = afterWord.startsWith('(');

        // Check for START() call: word preceded by START(
        const isInStartCall = beforeWord.match(/\bSTART\s*\(\s*$/i);

        return {
            isProcedure: hasParenthesesAfter || !!isInStartCall,
            isStartCall: !!isInStartCall
        };
    }

    /**
     * Get a word range at the given position.
     * Matches Clarion identifier pattern: letters, digits, underscores.
     */
    public static getWordRangeAtPosition(document: TextDocument, position: Position): Range | undefined {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        const charIndex = position.character;
        
        // Find word boundaries using Clarion identifier pattern
        let start = charIndex;
        let end = charIndex;

        // Expand left to start of word
        while (start > 0 && /[A-Za-z0-9_]/.test(line[start - 1])) {
            start--;
        }

        // Expand right to end of word
        while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) {
            end++;
        }

        // Check if we found a valid word
        if (start === end) {
            return undefined;
        }

        return {
            start: { line: position.line, character: start },
            end: { line: position.line, character: end }
        };
    }

    /**
     * Get the word text at the given position.
     */
    public static getWordAtPosition(document: TextDocument, position: Position): string | undefined {
        const range = this.getWordRangeAtPosition(document, position);
        return range ? document.getText(range) : undefined;
    }

    /**
     * Format a descriptive message about the procedure detection.
     * Useful for logging.
     */
    public static getDetectionMessage(word: string, isStartCall: boolean): string {
        return isStartCall 
            ? `reference in START(): ${word}()`
            : `call: ${word}()`;
    }
}
