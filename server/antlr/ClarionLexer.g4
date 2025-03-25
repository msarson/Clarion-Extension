lexer grammar ClarionLexer;

options {
  caseInsensitive = true;
}
tokens { STATEMENT_END }
APPLICATION: 'APPLICATION';
WINDOW: 'WINDOW';
PROCEDURE: 'PROCEDURE';
CLASS: 'CLASS';
ROUTINE: 'ROUTINE';
IF: 'IF';
THEN: 'THEN';
ELSE: 'ELSE';
LOOP: 'LOOP';
CASE: 'CASE';
OF: 'OF';

END: 'END';
SYSTEM: 'SYSTEM';
CENTER: 'CENTER';
AT: 'AT';
MAX: 'MAX';
MIN: 'MIN';
RESIZE: 'RESIZE';
MODAL: 'MODAL';
FONT: 'FONT';
ICON: 'ICON';
STATUS: 'STATUS';
MDI: 'MDI';
IMM: 'IMM';
MENUBAR: 'MENUBAR';
TOOLBAR: 'TOOLBAR';
BUTTON: 'BUTTON';
MENU: 'MENU';
USE: 'USE';
MSG: 'MSG';
STD: 'STD';
ITEM: 'ITEM';
SEPARATOR: 'SEPARATOR';
NOMERGE: 'NOMERGE';
MAP: 'MAP';
MODULE: 'MODULE';
DATA: 'DATA';
CODE: 'CODE';
RETURN: 'RETURN';
FILE: 'FILE';
RECORD: 'RECORD';
KEY: 'KEY';
PRE: 'PRE';
GROUP: 'GROUP';
QUEUE: 'QUEUE';
EQUATE: 'EQUATE';
INCLUDE: 'INCLUDE';
ONCE: 'ONCE';
PROGRAM: 'PROGRAM';
MEMBER: 'MEMBER';
THREAD: 'THREAD';
SHEET: 'SHEET';
TAB: 'TAB';
OPTION: 'OPTION';
DO: 'DO';
ACCEPTED: 'ACCEPTED';
ELSIF: 'ELSIF';
SELF: 'SELF';
PARENT: 'PARENT';

FEQ: '?' ID;
// 🎯 Identifiers & Literals
ID: [A-Z_] [A-Z0-9_:]* ;


STRING
    : '\'' ( '\'\'' | ~('\'' | '\r' | '\n') )* '\''
    ;

NUMERIC
    : '-'? [0-9]+ ('.' [0-9]+)?         // Decimal (e.g., -924, 76.346)
    | '-'? [01]+ 'B'                    // Binary (e.g., -1000110B, 1011b)
    | '-'? [0-7]+ 'O'                   // Octal (e.g., -7041312O, 3403o)
    | '-'? ('0' | [1-9][0-9]*)? [A-F0-9]+ 'H' // Hexadecimal (e.g., -1FFBh, 0CD1F74FH)
    ;


// 🎯 Ignore Comments
COMMENT
    : '!' ~[\r\n]* -> skip
    ;

 

// 🎯 Continuation lines using '|', followed by newline
CONTINUED_LINE_LF
    : '|' [ \t]* '\n' -> skip
    ;

CONTINUED_LINE_CRLF
    : '|' [ \t]* '\r\n' -> skip
    ;

CONTINUED_LINE_CR
    : '|' [ \t]* '\r' -> skip
    ;

// === Line endings ===
LINEBREAK
    : '\r\n' | '\n' | '\r'
    ;

// 🎯 Whitespace
WHITESPACE
    : [ \t]+ -> skip
    ;


AMPERSAND_EQUALS: '&=';

// In ClarionLexer.g4
PLUS: '+';
MINUS: '-';
STAR: '*';
SLASH: '/';
COMMA: ',';
// Remove the END_DOT rule and handle it differently
// Instead, define a specific token for the period at the end of a line
STATEMENT_END
    : '.' [ \t]* (LINEBREAK | EOF) -> type(STATEMENT_END)
    ;


// Regular dot for other contexts
DOT: '.';
COLON: ':';
ARROW: '=>';
LPAREN: '(';
RPAREN: ')';
LBRACE: '{';
RBRACE: '}';
EQUALS: '=';
SEMI: ';'; 
AMPERSAND: '&';
QUESTION: '?';
//UNHANDLED: . -> skip;
UNHANDLED: . ;  // emit it as a visible token instead of skipping



