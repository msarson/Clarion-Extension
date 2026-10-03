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
     * - Bare argument reference: SORT(Queue, CompareProc) — reported separately as
     *   `isArgumentReference`, because it is a weak signal a caller must rank last
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
        // its own, because it is referenced rather than called, so the three checks
        // above miss it and the procedure pipeline never sees it at all.
        //
        // Unlike those three, this is a WEAK signal: every bare identifier passed as an
        // argument matches it — `Foo(x, y)`, `AT(1,2)`, `USE(SomeVar)` — procedure or
        // not. So it is reported as its own flag, and it means "this MIGHT be a
        // procedure reference", not "this is one". Two obligations come with it:
        //
        //   1. It must not outrank an in-scope declaration. The language resolves a
        //      bare argument to the nearest declaration in scope, so a local variable
        //      sharing a name with a MAP procedure IS the local there — the procedure
        //      is reachable only as `Name()`. Callers consult this shape only once
        //      variable resolution has declined; see HoverProvider and
        //      DefinitionProvider, which both run it as a last tier.
        //   2. It must not trigger exhaustive cross-file searching, since most words
        //      reaching it are ordinary variables with nothing to find; see
        //      ProcedureHoverResolver's #313 walk.
        //
        // `START(` is deliberately excluded: it is an argument position too, but it was
        // already recognised as a strong shape above and keeps that priority, so its
        // established behaviour is untouched by either obligation.
        const isArgumentReference =
            !isInStartCall && /[(,]\s*$/.test(beforeWord) && /^\s*[,)]/.test(afterWord);

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
