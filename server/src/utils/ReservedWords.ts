/**
 * #701 — the words that cannot be a label, as the compiler decides it, not the Language
 * Reference. `test-programs/ReservedWordsTest` builds every word of the help's Reserved Words
 * tables in each place a label can go (global and local data, GROUP field, CLASS property and
 * method, global PROCEDURE, ROUTINE, statement label, parameter, method parameter and local), on
 * Clarion 10 and 12 with identical results:
 *
 *  - these 44 are rejected in every one of those places; as a parameter name each builds alone
 *    or as the last parameter and fails when another parameter follows it (parameters are not
 *    Label tokens, so neither case is checked here);
 *  - the help's first table also lists CODE, DATA, NULL and THROW, which build everywhere;
 *  - CATCH, FINALLY and TRY are reserved in Win32 Clarion too (they were once omitted here as
 *    Clarion.NET-only);
 *  - the help's second table ("may not be the label of any PROCEDURE statement": WINDOW, CLASS,
 *    QUEUE, SELF, PARENT, ...) is not enforced by either compiler: all 27 build as a PROCEDURE's
 *    label, a method, a field and a method's parameter or local, so nothing is reported for them.
 */
export const RESERVED_WORDS = new Set([
    'ACCEPT', 'AND', 'ASSERT', 'BEGIN', 'BREAK', 'BY',
    'CASE', 'CATCH', 'CHOOSE', 'COMPILE', 'CONST',
    'CYCLE', 'DO', 'ELSE', 'ELSIF', 'END',
    'EXECUTE', 'EXIT', 'FINALLY', 'FUNCTION', 'GOTO', 'IF',
    'INCLUDE', 'LOOP', 'MEMBER', 'NEW', 'NOT',
    'OF', 'OMIT', 'OR', 'OROF', 'PRAGMA', 'PROCEDURE',
    'PROGRAM', 'RETURN', 'ROUTINE', 'SECTION', 'THEN',
    'TIMES', 'TO', 'TRY', 'UNTIL', 'WHILE', 'XOR',
]);
