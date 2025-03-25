parser grammar ClarionAssignment;

options { tokenVocab=ClarionLexer; }
import ClarionExpressions;

// 🌟 Assignment Statement
assignmentStatement
    : assignable assignmentOperator expression statementTerminator
    ;


// 🌟 Valid assignment targets
assignable
  : dottedIdentifier                        // SELF.Request, PARENT.X
  | ID                                      // plain identifiers
  | QUESTION ID                             // ?Button1
  | QUESTION ID LBRACE ID RBRACE            // ?Button1{PROP:Text}
  | ID LBRACE ID RBRACE                     // AppFrame{PROP:XYZ}
  ;

assignmentOperator
    : '='
    | AMPERSAND_EQUALS
    ;



statementTerminator
    : STATEMENT_END
    | LINEBREAK
    | END  // for compatibility with block structures
    ;

