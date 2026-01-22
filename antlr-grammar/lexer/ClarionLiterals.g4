// ============================================================================
// Clarion Language Literals
// ============================================================================
// Extracted from:
// - server/src/tokenizer/TokenPatterns.ts (numbers, strings, picture formats)
// - syntaxes/clarion.tmLanguage.json
// ============================================================================

lexer grammar ClarionLiterals;

options { caseInsensitive = true; }

// ============================================================================
// STRING LITERALS
// ============================================================================

// Single-quoted strings with doubled quotes for escaping
STRING_LITERAL
    : '\'' ( ~'\'' | '\'\'' )* '\''
    ;

// ============================================================================
// NUMERIC LITERALS
// ============================================================================

// Hexadecimal: 0FFh, 1234H
HEX_LITERAL
    : [0-9] [0-9a-fA-F]* [hH]
    ;

// Binary: 1010b, 11001101B
BINARY_LITERAL
    : [0-1]+ [bB]
    ;

// Octal: 777o, 123O
OCTAL_LITERAL
    : [0-7]+ [oO]
    ;

// Decimal (integer or floating point)
DECIMAL_LITERAL
    : [0-9]+ '.' [0-9]+ ( [eE] [+-]? [0-9]+ )?  // Decimal with fractional part (e.g., 3.14)
    | [0-9]+ [eE] [+-]? [0-9]+                  // Scientific notation without decimal point (e.g., 1e10)
    | [0-9]+                                     // Integer (e.g., 42)
    ;

// Picture format number (e.g., @N10.2~value~)
PICTURE_NUMBER
    : '@' [Nn] '-'? [0-9.]* '~' ~'~'* '~'
    ;

// ============================================================================
// PICTURE FORMAT LITERALS
// ============================================================================

// Numeric picture: @N10.2, @N-12.3, etc.
PICTURE_NUMERIC
    : '@' [Nn] '-'? [0-9.]*
    ;

// Scientific notation: @E10.2, @e15.5
PICTURE_SCIENTIFIC
    : '@' [Ee] [0-9.]*
    ;

// Short number: @S5, @S10
PICTURE_SHORT
    : '@' [Ss] [0-9]+
    ;

// Date picture: @D10, @D10.02, @D6-, @D8/
PICTURE_DATE
    : '@' [Dd] [0-9]+ ([.\-_'`<>] [0-9]*)? [Bb]?
    ;

// Time picture: @T5, @T8., @T8B
PICTURE_TIME
    : '@' [Tt] [0-9]+ [.\-_'`]? [Bb]?
    ;

// Pattern picture: @P###-##-####P, @P(###) ###-####P
PICTURE_PATTERN
    : '@' [Pp] ~[Pp\n]+ [Pp] [Bb]?
    ;

// Key picture: @Knnnnnnnnnnnnnnnnnnnnnn
PICTURE_KEY
    : '@' [Kk] ~[Kk\n]+ [Kk] [Bb]?
    ;

// Generic picture format (catch-all)
PICTURE_FORMAT
    : '@' [A-Za-z] ~[ \t\r\n,)]*
    ;

// ============================================================================
// BOOLEAN CONSTANTS
// ============================================================================

TRUE : 'TRUE' ;
FALSE : 'FALSE' ;
NULL : 'NULL' ;

// ============================================================================
// EQUATE CONSTANTS
// ============================================================================

// Field equate prefix: ?FieldName or ?Prefix:FieldName:Suffix or ?Field:2 (with instance numbers)
FIELD_EQUATE
    : '?' [A-Za-z_] [A-Za-z0-9_]* (':' [A-Za-z0-9_] [A-Za-z0-9_]*)*
    ;

// ============================================================================
// SPECIAL CONSTANTS
// ============================================================================

// Error level constants
LEVEL_BENIGN : 'LEVEL_BENIGN' ;
LEVEL_NOTIFY : 'LEVEL_NOTIFY' ;
LEVEL_FATAL : 'LEVEL_FATAL' ;

// Icon constants
ICON_ASTERISK : 'ICON_ASTERISK' ;
ICON_EXCLAMATION : 'ICON_EXCLAMATION' ;
ICON_HAND : 'ICON_HAND' ;
ICON_QUESTION : 'ICON_QUESTION' ;

// Button constants
BUTTON_YES : 'BUTTON_YES' ;
BUTTON_NO : 'BUTTON_NO' ;
BUTTON_OK : 'BUTTON_OK' ;
BUTTON_CANCEL : 'BUTTON_CANCEL' ;

// Alignment constants
CENTER : {this.charPositionInLine > 0}? 'CENTER' ;
LEFT : {this.charPositionInLine > 0}? 'LEFT' ;
RIGHT : {this.charPositionInLine > 0}? 'RIGHT' ;
