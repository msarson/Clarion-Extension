// ============================================================================
// Clarion Language Operators and Delimiters
// ============================================================================
// Extracted from:
// - server/src/tokenizer/TokenPatterns.ts
// - server/src/LexEnum.ts
// ============================================================================

lexer grammar ClarionOperators;

// ============================================================================
// ARITHMETIC OPERATORS
// ============================================================================

PLUS      : '+' ;
MINUS     : '-' ;
MULTIPLY  : '*' ;
DIVIDE    : '/' ;
MODULO    : '%' ;
POWER     : '^' ;             // Exponentiation: A ^ B raises A to power of B
INT_DIV   : '//' ;            // Integer division (if supported)

// ============================================================================
// COMPARISON OPERATORS
// ============================================================================

EQ        : '=' ;             // Equal / Assignment
LT        : '<' ;             // Less than
GT        : '>' ;             // Greater than
LE        : '<=' ;            // Less than or equal
GE        : '>=' ;            // Greater than or equal
NE        : '<>' ;            // Not equal (primary)
NE_ALT    : '!=' ;            // Not equal (alternative)

// ============================================================================
// ASSIGNMENT AND SPECIAL OPERATORS
// ============================================================================

ASSIGN      : ':=' ;            // Assignment (alternative to =)
DEEP_ASSIGN : ':=:' ;           // Deep assignment (copies all fields)
PLUS_EQ     : '+=' ;            // Compound assignment
MINUS_EQ    : '-=' ;            // Compound assignment
MULT_EQ     : '*=' ;            // Compound assignment
DIV_EQ      : '/=' ;            // Compound assignment
AMP_EQ      : '&=' ;            // String concatenation assignment
AMPERSAND   : '&' ;             // String concatenation / Reference
TILDE       : '~' ;             // Bitwise NOT / Picture format delimiter
// Note: PIPE is defined in main lexer to avoid conflicts

// ============================================================================
// DELIMITERS
// ============================================================================

LPAREN    : '(' ;
RPAREN    : ')' ;
LBRACKET  : '[' ;
RBRACKET  : ']' ;
LBRACE    : '{' ;
RBRACE    : '}' ;
COMMA     : ',' ;
COLON     : ':' ;
SEMICOLON : ';' ;
QUESTION  : '?' ;             // Field equate prefix / Ternary
// Note: DOT and ASTERISK are defined in main lexer to avoid conflicts

// ============================================================================
// SPECIAL OPERATORS
// ============================================================================

ATSIGN    : '@' ;             // Picture format prefix / Address-of operator
HASH      : '#' ;             // Implicit type suffix (numeric)
DOLLAR    : '$' ;             // Implicit type suffix (string)
QUOTE     : '"' ;             // Implicit type suffix (alternative)

// ============================================================================
// BITWISE OPERATORS (KEYWORDS)
// ============================================================================
// Note: These are handled as keywords in ClarionKeywords.g4
// - BAND, BOR, BXOR, BSHIFT

// ============================================================================
// COMMENT MARKERS
// ============================================================================

COMMENT_START : '!' ;         // Line comment
// Note: LINE_CONT (|) handled in main lexer
// Note: Whitespace handled in main lexer
