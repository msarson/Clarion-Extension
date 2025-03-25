parser grammar ClarionExpressions;

options { tokenVocab=ClarionLexer; }

// 🌟 Entry: expression = a full, evaluatable expression
expression
    : expression PLUS term     # AdditiveExpression
    | expression MINUS term    # AdditiveExpression
    | term                     # TermExpression
    ;

term
    : term STAR factor         # MultiplicativeExpression
    | term SLASH factor        # MultiplicativeExpression
    | factor                   # FactorExpression
    ;

factor
    : functionCall                          # FunctionCallFactor
    | dottedIdentifier                      # DottedIdentifierFactor
    | propertyAccess                        # PropertyAccessFactor
    | FEQ                                   # FieldEquateFactor
    | NUMERIC                               # IntegerFactor
    | STRING                                # StringFactor
    | LPAREN expression RPAREN              # ParenthesizedFactor
    ;

// Property access like AppFrame{PROP:TabBarVisible}
propertyAccess
    : ID LBRACE ID (COLON ID)* RBRACE
    ;

// 🌟 Function Calls: dotted identifiers with optional parens
functionCall
    : dottedIdentifier LPAREN argumentList? RPAREN
    ;

// 🌟 Dotted identifiers: like SELF.Property or PARENT.Method
dottedIdentifier
    : (SELF | PARENT) DOT ID                // For SELF.Something or PARENT.Something
    | ID (DOT ID)*                           // For standard dotted notation (e.g., SomeClass.Method)
    ;

// 🌟 Argument List
argumentList
    : (expressionLike (COMMA expressionLike)*)?
    ;

expressionLike
    : (~(RPAREN | COMMA | LINEBREAK))+
    ;





// 🌟 Parameter List (for PROCEDURE definitions)
parameterList
    : LPAREN (parameter (COMMA parameter)*)? RPAREN
    ;

parameter
    : ID  
    | STRING
    ;

// 🌟 Return type
returnType
    : ID
    ;