parser grammar ClarionData;

options { tokenVocab=ClarionLexer; }
import ClarionUI;

// 🎯 Entry for global data section
globalDataSection
    : globalEntry*
    ;

// 🎯 Global entries: includes, equates, file/class declarations, etc.
globalEntry
    : includeDirective
    | equateDefinition
    | windowDefinition
    | globalVariable
    | groupBlock
    | queueBlock
    | classDeclaration
    ;

// 🎯 INCLUDE('filename'),ONCE
includeDirective
    : INCLUDE LPAREN STRING RPAREN (COMMA ONCE)?
    ;

// 🎯 Equates (e.g., MyVersion EQUATE('3.69'))
equateDefinition
    : ID EQUATE LPAREN STRING RPAREN
    ;

// 🎯 Global Variables (e.g., GlobalRequest BYTE(0),THREAD)
globalVariable
    : ID fieldReference (LPAREN argumentList RPAREN)? (COMMA ID)*
    ;

fieldReference
    : AMPERSAND? fieldType
    ;

// 🎯 GROUP block (can appear standalone or in a FILE)
groupBlock
    : ID GROUP (LPAREN ID RPAREN)? (fieldList | /* empty */) END
    ;

// 🎯 QUEUE block (can appear standalone or in a FILE)
queueBlock
    : ID QUEUE (LPAREN ID RPAREN)? fieldList END
    ;

// 🎯 Field definitions shared by GROUP/QUEUE/RECORD
fieldList
    : fieldDefinition*
    ;

fieldDefinition
    : ID fieldType (COMMA fieldOptions)*
    ;

fieldType
    : ID LPAREN NUMERIC (COMMA NUMERIC)? RPAREN
    | ID
    ;

fieldOptions
    : ID
    ;

// 🎯 Argument list used in BYTE(0) or CLASS,THREAD
argumentList
    : (ID | NUMERIC | STRING) (COMMA (ID | NUMERIC | STRING))*
    ;

// 🎯 Simplified Class declaration: we ignore everything after CLASS for now
classDeclaration
    : ID CLASS .*? END
    ;

// 🎯 Return types like BYTE, STRING(10), DECIMAL(5,2)
returnType
    : ID
    | ID LPAREN NUMERIC RPAREN
    | ID LPAREN NUMERIC COMMA NUMERIC RPAREN
    ;

// Define the attributes — general for now
procedureAttribute
    : ID
    ;

declarationParameterList
    : LPAREN RPAREN                              // empty param list
    | LPAREN declarationParameterListNonEmpty RPAREN // non-empty
    ;

declarationParameterListNonEmpty
    : declarationParameter (COMMA declarationParameter)*
    ;

declarationParameter
    : ID
    ;