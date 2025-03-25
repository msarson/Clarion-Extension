parser grammar ClarionFile;

options { tokenVocab=ClarionLexer; }

// 🎯 File Declaration Entry Point (invoked from ClarionData)
fileDeclaration
    : ID FILE (fileAttributes)? (COMMA fileAttributes)* fileStructure END
    ;

fileAttributes
    : ID LPAREN STRING RPAREN
    | ID
    ;

fileStructure
    : (keyDefinition | recordBlock)*
    ;

// 🎯 RECORD block inside FILE
recordBlock
    : RECORD (COMMA recordAttribute)* fieldList END
    ;

recordAttribute
    : PRE LPAREN ID RPAREN
    ;

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

// 🎯 KEY Definitions (e.g., PRIMARY, NOCASE)
keyDefinition
    : ID KEY LPAREN keyFields RPAREN (COMMA ID)*
    ;

keyFields
    : ID (COMMA ID)*
    ;
