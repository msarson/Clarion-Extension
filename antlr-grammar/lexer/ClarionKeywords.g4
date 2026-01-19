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
FUNCTION  : 'FUNCTION' ;    // FULLY RESERVED
ROUTINE   : 'ROUTINE' ;     // FULLY RESERVED

// Section Keywords
DATA      : 'DATA' ;        // FULLY RESERVED
CODE      : 'CODE' ;        // FULLY RESERVED
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
CLASS     : {this.charPositionInLine > 0}? 'CLASS' ;      // SOFT KEYWORD
INTERFACE : {this.charPositionInLine > 0}? 'INTERFACE' ;  // Not in docs, but treated as soft
NEW       : 'NEW' ;        // FULLY RESERVED
DISPOSE   : 'DISPOSE' ;    // Not in docs, treated as reserved
SELF      : 'SELF' ;       // SOFT KEYWORD (special: cannot name local vars/params in methods)
PARENT    : 'PARENT' ;     // SOFT KEYWORD (special: cannot name local vars/params in methods)
PROPERTY  : 'PROPERTY' ;   // Not in docs
INDEXER   : 'INDEXER' ;    // Not in docs
DERIVED   : 'DERIVED' ;    // Not in docs
REPLACE   : 'REPLACE' ;    // Not in docs
VIRTUAL   : 'VIRTUAL' ;    // Not in docs
IMPLEMENTS: 'IMPLEMENTS' ; // Not in docs

// ============================================================================
// ACCESS MODIFIERS
// ============================================================================

PRIVATE   : 'PRIVATE' ;
PROTECTED : 'PROTECTED' ;
PUBLIC    : 'PUBLIC' ;       // Less common in Clarion

// Logical Operators - All FULLY RESERVED
AND       : 'AND' ;         // FULLY RESERVED
OR        : 'OR' ;          // FULLY RESERVED
NOT       : 'NOT' ;         // FULLY RESERVED
XOR       : 'XOR' ;         // FULLY RESERVED

// Preprocessor Directives - All FULLY RESERVED
COMPILE   : 'COMPILE' ;     // FULLY RESERVED
OMIT      : 'OMIT' ;        // FULLY RESERVED
INCLUDE   : 'INCLUDE' ;     // FULLY RESERVED
SECTION   : 'SECTION' ;     // FULLY RESERVED
ENDSECTION: 'ENDSECTION' ;  // Not in docs
PRAGMA    : 'PRAGMA' ;      // FULLY RESERVED
ASSERT    : 'ASSERT' ;      // FULLY RESERVED
EQUATE    : 'EQUATE' ;      // Not in docs
ONCE      : 'ONCE' ;        // Not in docs

// Declaration Keywords
CONST     : 'CONST' ;       // FULLY RESERVED
STATIC    : 'STATIC' ;      // Not in docs
THREAD    : 'THREAD' ;      // Not in docs
AUTO      : 'AUTO' ;        // Not in docs
EXTERNAL  : 'EXTERNAL' ;    // Not in docs
DLL       : 'DLL' ;         // Not in docs
LINK      : 'LINK' ;        // Not in docs
MODULE    : 'MODULE' ;      // SOFT KEYWORD (used in MAP blocks and CLASS definitions)

// Note: FILE, RECORD, GROUP, QUEUE, VIEW are defined in ClarionTypes.g4 
// as SOFT KEYWORDS with column position predicates
KEY       : 'KEY' ;         // Not in docs (index key declaration)

// ============================================================================
// CALLING CONVENTIONS
// ============================================================================

PASCAL    : 'PASCAL' ;
RAW       : 'RAW' ;
PROC      : 'PROC' ;

// Special Constructs
ITEMIZE   : 'ITEMIZE' ;     // SOFT KEYWORD (enumeration)
STRUCT    : 'STRUCT' ;      // Not in docs (structure type)
ENUM      : 'ENUM' ;        // Not in docs (enumeration alternative)
UNION     : 'UNION' ;       // Not in docs (union type)
LIKE      : 'LIKE' ;        // Not in docs (type inheritance)
// Note: OPTION is defined in ClarionTypes.g4 as SOFT KEYWORD

// ============================================================================
// ADDITIONAL KEYWORDS FROM CLARION.NET (Excluded - Win32 only)
// ============================================================================
// AS, CHECKED, DEFAULTOF, FOREACH, FROM, GETTER, IN, INLINE, IS,
// NAMESPACE, OUT, PARAMS, REF, SETTER, SYNCLOCK, TRYAS, UNCHECKED, USING
// are all Clarion.NET features and not included in Win32 grammar
