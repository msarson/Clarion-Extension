// ============================================================================
// Clarion Win32 Language Keywords
// ============================================================================
// Extracted from:
// - server/src/LexEnum.ts
// - server/src/tokenizer/TokenPatterns.ts
// - syntaxes/clarion.tmLanguage.json
// - ClarionDocs/reserved_words.htm
//
// NOTE: This is for Clarion Win32 ONLY - Clarion.NET keywords excluded
//
// KEYWORD CATEGORIES (per ClarionDocs):
// 1. FULLY RESERVED WORDS - Cannot be used as labels for ANY purpose
// 2. SOFT KEYWORDS - May be used as labels of data structures or statements,
//    but NOT as PROCEDURE names. May appear as parameter labels in prototypes
//    if data type is also specified.
// ============================================================================

lexer grammar ClarionKeywords;

options { caseInsensitive = true; }

// ============================================================================
// FULLY RESERVED WORDS (Cannot be used as labels)
// ============================================================================

// Document-Level
PROGRAM   : 'PROGRAM' ;     // FULLY RESERVED
MEMBER    : 'MEMBER' ;      // FULLY RESERVED

// Procedure Declaration
PROCEDURE : 'PROCEDURE' ;   // FULLY RESERVED
FUNCTION  : {this.charPositionInLine > 0}? 'FUNCTION' ;    // SOFT - can be used in identifiers like "FunctionCalled"
ROUTINE   : 'ROUTINE' ;     // FULLY RESERVED

// Section Keywords
DATA      : 'DATA' ;        // FULLY RESERVED - but can be used as field name (softKeyword in parser)
CODE      : 'CODE' ;        // FULLY RESERVED - but can be used as field name (softKeyword in parser)
MAP       : 'MAP' ;         // SOFT KEYWORD (structure type)

// Control Flow - All FULLY RESERVED
IF        : {this.charPositionInLine > 0}? 'IF' ;          // FULLY RESERVED
ELSIF     : {this.charPositionInLine > 0}? 'ELSIF' ;       // FULLY RESERVED
ELSE      : {this.charPositionInLine > 0}? 'ELSE' ;        // FULLY RESERVED
THEN      : {this.charPositionInLine > 0}? 'THEN' ;        // FULLY RESERVED
CASE      : {this.charPositionInLine > 0}? 'CASE' ;        // FULLY RESERVED
OF        : {this.charPositionInLine > 0}? 'OF' ;          // FULLY RESERVED
OROF      : {this.charPositionInLine > 0}? 'OROF' ;        // FULLY RESERVED
LOOP      : {this.charPositionInLine > 0}? 'LOOP' ;        // FULLY RESERVED
WHILE     : {this.charPositionInLine > 0}? 'WHILE' ;       // FULLY RESERVED
UNTIL     : 'UNTIL' ;       // FULLY RESERVED
TIMES     : 'TIMES' ;       // FULLY RESERVED
TO        : 'TO' ;          // FULLY RESERVED
BY        : 'BY' ;          // FULLY RESERVED
BREAK     : 'BREAK' ;       // FULLY RESERVED
CYCLE     : 'CYCLE' ;       // FULLY RESERVED
EXIT      : 'EXIT' ;        // FULLY RESERVED
GOTO      : 'GOTO' ;        // FULLY RESERVED
RETURN    : 'RETURN' ;      // FULLY RESERVED
CHOOSE    : 'CHOOSE' ;      // FULLY RESERVED
EXECUTE   : 'EXECUTE' ;     // FULLY RESERVED
DO        : 'DO' ;          // FULLY RESERVED
ACCEPT    : 'ACCEPT' ;      // FULLY RESERVED
BEGIN     : 'BEGIN' ;       // FULLY RESERVED
END       : 'END' ;         // FULLY RESERVED

// Exception Handling (Clarion.NET only - not in Win32)
// Note: If these were included, they would be FULLY RESERVED
// TRY       : 'TRY' ;
// CATCH     : 'CATCH' ;
// FINALLY   : 'FINALLY' ;
// THROW     : 'THROW' ;

// Object-Oriented Keywords
// CLASS and INTERFACE - used in data declarations
// CLASS is used in declarations and instantiations
// INTERFACE has been removed as a keyword - treat as regular identifier
// Parser context determines when CLASS is a keyword vs identifier
CLASS     : 'CLASS' ;
// INTERFACE : 'INTERFACE' ;  // Commented out - use as identifier only
NEW       : 'NEW' ;        // FULLY RESERVED
DISPOSE   : {this.charPositionInLine > 0}? 'DISPOSE' ;    // SOFT - can be field name
SELF      : 'SELF' ;       // SPECIAL - always refers to current object
PARENT    : 'PARENT' ;     // SPECIAL - always refers to parent class
PROPERTY  : {this.charPositionInLine == 0}? 'PROPERTY' ;   // SOFT - structural at column 0, allows as field at >0
INDEXER   : {this.charPositionInLine == 0}? 'INDEXER' ;    // SOFT - structural at column 0
DERIVED   : {this.charPositionInLine > 0}? 'DERIVED' ;     // SOFT - can be field name
REPLACE   : {this.charPositionInLine > 0}? 'REPLACE' ;     // SOFT - can be field name
VIRTUAL   : {this.charPositionInLine > 0}? 'VIRTUAL' ;     // SOFT - can be field name
IMPLEMENTS: {this.charPositionInLine > 0}? 'IMPLEMENTS' ;  // SOFT - can be field name

// ============================================================================
// ACCESS MODIFIERS
// ============================================================================

PRIVATE   : {this.charPositionInLine > 0}? 'PRIVATE' ;     // SOFT - can be field name
PROTECTED : {this.charPositionInLine > 0}? 'PROTECTED' ;   // SOFT - can be field name
PUBLIC    : {this.charPositionInLine > 0}? 'PUBLIC' ;      // SOFT - can be field name
INTERNAL  : {this.charPositionInLine > 0}? 'INTERNAL' ;    // SOFT - can be field name

// Logical Operators - All FULLY RESERVED
AND       : 'AND' ;         // FULLY RESERVED
OR        : 'OR' ;          // FULLY RESERVED
NOT       : 'NOT' ;         // FULLY RESERVED
XOR       : 'XOR' ;         // FULLY RESERVED

// Preprocessor Directives - All FULLY RESERVED
COMPILE   : 'COMPILE' ;     // FULLY RESERVED
OMIT      : 'OMIT' ;        // FULLY RESERVED
INCLUDE   : 'INCLUDE' ;     // FULLY RESERVED
SECTION   : {this.charPositionInLine == 0}? 'SECTION' ;     // SOFT - structural at column 0
ENDSECTION: {this.charPositionInLine == 0}? 'ENDSECTION' ;  // SOFT - structural at column 0
PRAGMA    : 'PRAGMA' ;      // FULLY RESERVED
ASSERT    : 'ASSERT' ;      // FULLY RESERVED
EQUATE    : {this.charPositionInLine > 0}? 'EQUATE' ;      // SOFT - can be field name
ONCE      : {this.charPositionInLine > 0}? 'ONCE' ;        // SOFT - can be field name

// Declaration Keywords - Most SOFT to allow as field names
CONST     : {this.charPositionInLine > 0}? 'CONST' ;       // SOFT - can be field name
STATIC    : {this.charPositionInLine > 0}? 'STATIC' ;      // SOFT - can be field name
THREAD    : {this.charPositionInLine > 0}? 'THREAD' ;      // SOFT - can be field name
AUTO      : {this.charPositionInLine > 0}? 'AUTO' ;        // SOFT - can be field name
EXTERNAL  : {this.charPositionInLine > 0}? 'EXTERNAL' ;    // SOFT - can be field name
DLL       : {this.charPositionInLine > 0}? 'DLL' ;         // SOFT - can be field name
LINK      : {this.charPositionInLine > 0}? 'LINK' ;        // SOFT KEYWORD (can be method name at column 0)
MODULE    : 'MODULE' ;      // SOFT KEYWORD (used in MAP blocks and CLASS definitions)

// Note: FILE, RECORD, GROUP, QUEUE, VIEW are defined in ClarionTypes.g4 
// as SOFT KEYWORDS with column position predicates
KEY       : {this.charPositionInLine > 0}? 'KEY' ;         // SOFT - can be field name
STRUCT    : {this.charPositionInLine > 0}? 'STRUCT' ;      // SOFT - can be field name  
ENUM      : {this.charPositionInLine > 0}? 'ENUM' ;        // SOFT - can be field name
UNION     : {this.charPositionInLine > 0}? 'UNION' ;       // SOFT - can be field name
LIKE      : {this.charPositionInLine > 0}? 'LIKE' ;        // SOFT - can be field name

// ============================================================================
// CALLING CONVENTIONS - SOFT to allow as field names
// ============================================================================

PASCAL    : {this.charPositionInLine > 0}? 'PASCAL' ;  // SOFT - can be field name
RAW       : {this.charPositionInLine > 0}? 'RAW' ;     // SOFT - can be field name
PROC      : {this.charPositionInLine > 0}? 'PROC' ;    // SOFT - can be field name

// Special Constructs - SOFT to allow as field names
ITEMIZE   : {this.charPositionInLine > 0}? 'ITEMIZE' ;     // SOFT - can be field name
STRUCT    : {this.charPositionInLine > 0}? 'STRUCT' ;      // SOFT - can be field name
ENUM      : {this.charPositionInLine > 0}? 'ENUM' ;        // SOFT - can be field name
UNION     : {this.charPositionInLine > 0}? 'UNION' ;       // SOFT - can be field name
LIKE      : {this.charPositionInLine > 0}? 'LIKE' ;        // SOFT - can be field name
// Note: OPTION is defined in ClarionTypes.g4 as SOFT KEYWORD

// ============================================================================
// ADDITIONAL KEYWORDS FROM CLARION.NET (Excluded - Win32 only)
// ============================================================================
// AS, CHECKED, DEFAULTOF, FOREACH, FROM, GETTER, IN, INLINE, IS,
// NAMESPACE, OUT, PARAMS, REF, SETTER, SYNCLOCK, TRYAS, UNCHECKED, USING
// are all Clarion.NET features and not included in Win32 grammar
