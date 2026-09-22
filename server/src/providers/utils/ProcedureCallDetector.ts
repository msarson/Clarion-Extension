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
     * - Bare argument reference: SORT(Queue, CompareProc)
     *
     * @returns true if this is a procedure call/reference
     */
    public static isProcedureCallOrReference(
        document: TextDocument,
        position: Position,
        wordRange: Range | undefined
    ): { isProcedure: boolean; isStartCall: boolean; isArgumentReference: boolean } {
        if (!wordRange) {
            return { isProcedure: false, isStartCall: false, isArgumentReference: false };
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

        // Check for no-param procedure call: word is preceded only by whitespace
        // (column 0 or indented), and followed only by whitespace or a comment.
        // e.g. "  Main" or "  Main  !" — Clarion allows calling no-param procedures without ()
        const isStandaloneCall = /^\s*$/.test(beforeWord) && /^\s*(!.*)?$/.test(afterWord);

        // A procedure passed BY NAME as an argument — `SORT(Queue, CompareProc)`, a
        // procedure-typed parameter, any callback. Such a reference carries no '(' of
        // its own (it is referenced, not called) and is not first inside a START(), so
        // all three checks above miss it: hover and F12 then skipped the procedure
        // pipeline entirely, and the reference resolved to nothing at all.
        //
        // START( is one instance of this shape; it stays a separate flag above only
        // because callers label their log message with it.
        //
        // This is a WEAK signal — every bare identifier argument matches it, procedure
        // or not (`Foo(x, y)`, `USE(SomeVar)`, `AT(1,2)`). Callers must therefore keep
        // it to CHEAP resolution tiers and must not let it trigger exhaustive
        // cross-file searches; see ProcedureHoverResolver's #313 walk.
        const isArgumentReference = /[(,]\s*$/.test(beforeWord) && /^\s*[,)]/.test(afterWord);

        return {
            isProcedure: hasParenthesesAfter || !!isInStartCall || isStandaloneCall || isArgumentReference,
            isStartCall: !!isInStartCall,
            isArgumentReference
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
