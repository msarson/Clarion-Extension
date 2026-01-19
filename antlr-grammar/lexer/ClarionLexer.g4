// ============================================================================
// Main Clarion Win32 Lexer Grammar
// ============================================================================
// This is the main lexer that combines all lexer components
// ============================================================================

lexer grammar ClarionLexer;

options { caseInsensitive = true; }

// Import all lexer components in order
// Keywords/Types/Literals/Operators FIRST, Identifiers LAST
import ClarionKeywords, ClarionTypes, ClarionLiterals, ClarionOperators, ClarionIdentifiers;

// ============================================================================
// COMMENTS
// ============================================================================

// Line comment starting with !
COMMENT
    : '!' ~[\r\n]*
    -> channel(HIDDEN)
    ;

// Alternate comment with | (also line continuation) - includes the newline
PIPE_COMMENT
    : '|' ~[\r\n]* [\r\n]+
    -> channel(HIDDEN)
    ;

// ============================================================================
// SPECIAL TOKENS
// ============================================================================

// Line continuation: | at end of line (whitespace and newline after |)
// When & | appears, the & is a concatenation operator, | is continuation
LINE_CONTINUATION
    : '|' [ \t]* [\r\n]
    -> skip
    ;

// DOT - always emitted, meaning determined by parser context
// Can be: statement terminator for IF/LOOP/CASE, member access, or decimal point
DOT
    : '.'
    ;

// ============================================================================
// WHITESPACE AND NEWLINES
// ============================================================================

// Newline (statement separator) - VISIBLE to parser for statement boundaries
NEWLINE
    : [\r\n]+
    ;

// Semicolon (alternative statement separator)
STATEMENT_SEPARATOR
    : ';'
    -> channel(HIDDEN)
    ;

WHITESPACE
    : [ \t]+
    -> channel(HIDDEN)
    ;

// Note: No UNKNOWN rule - let ANTLR handle unmatched characters with error reporting
