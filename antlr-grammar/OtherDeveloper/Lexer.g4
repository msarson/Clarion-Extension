lexer grammar ExprLexer;

// ==============================
// Lexer rules for Clarion Language 
// ==============================

// Keywords
RECORD      : 'RECORD';    // Carl added 1st, move down after FILE
PROGRAM     : 'PROGRAM';
MAP         : 'MAP';
MODULE      : 'MODULE';
END         : 'END';
CODE        : 'CODE';
DATAKW      : 'DATA';

// Types
BYTE        : 'BYTE';
SHORT       : 'SHORT';
USHORT      : 'USHORT';
LONG        : 'LONG';
ULONG       : 'ULONG';
DECIMAL     : 'DECIMAL';
REAL        : 'REAL';
SREAL       : 'SREAL';
STRINGKW    : 'STRING';
BSTRING     : 'BSTRING';
PSTRING     : 'PSTRING';
BLOB        : 'BLOB';
MEMO        : 'MEMO';
DATE        : 'DATE';
TIME        : 'TIME';
BOOL        : 'BOOL';
QUEUE       : 'QUEUE';
WINDOW      : 'WINDOW';
FILE        : 'FILE';
GROUP       : 'GROUP';
ANY         : 'ANY';

// Data attributes / modifiers
PRE         : 'PRE';
USE         : 'USE';
LIKE        : 'LIKE';
DIM         : 'DIM';
OVER        : 'OVER';
STATIC      : 'STATIC';
PRIVATE     : 'PRIVATE';
THREAD      : 'THREAD';
AUTO        : 'AUTO';
BINARYKW    : 'BINARY';

// Controls
BUTTON      : 'BUTTON';
LIST        : 'LIST';
ENTRY       : 'ENTRY';
BOX         : 'BOX';
LINE        : 'LINE';
OLE         : 'OLE';
OTHERCONTROL
    : 'PROMPT'
    | 'CHECK'
    | 'RADIO'
    | 'SHEET'
    | 'TAB'
    ;

// Procedures / logic
PROC        : 'PROC';
ACCEPT      : 'ACCEPT';
CASE        : 'CASE';
OF          : 'OF';
OROF        : 'OROF';
ELSE        : 'ELSE';
ELSIF       : 'ELSIF';
IF          : 'IF';
THEN        : 'THEN';
LOOP        : 'LOOP';
BREAK       : 'BREAK';
CYCLE       : 'CYCLE';
EXIT        : 'EXIT';
ROUTINE     : 'ROUTINE';
RETURN      : 'RETURN';
OPEN        : 'OPEN';
CLOSE       : 'CLOSE';
DO          : 'DO';
EXECUTE     : 'EXECUTE';
BEGIN       : 'BEGIN';
TRUE        : 'TRUE';
FALSE       : 'FALSE';
AND         : 'AND';
OR          : 'OR';
NOT         : 'NOT';
TO          : 'TO';
ENUM_KW     : 'ENUM';
ADDRESS     : 'ADDRESS';
EQUATE      : 'EQUATE';
TIMES       : 'TIMES';
WHILE       : 'WHILE';
UNTIL       : 'UNTIL';
BY          : 'BY';
INTERFACE   : 'INTERFACE';
TYPEKW      : 'TYPE';
COMKW       : 'COM';
CLASSKW     : 'CLASS';
EXTERNAL    : 'EXTERNAL';
IMPLEMENTS  : 'IMPLEMENTS';
DLL         : 'DLL';
BINDABLE    : 'BINDABLE';
LINKKW      : 'LINK';
NETCLASS    : 'NETCLASS';
PARTIALKW   : 'PARTIAL';
PROCEDUREKW : 'PROCEDURE';
ITEMIZEKW   : 'ITEMIZE';
INCLUDEKW   : 'INCLUDE';
ONCEKW      : 'ONCE';
KEYKW       : 'KEY';
INDEXKW     : 'INDEX';
NULLKW      : 'NULL';

// Window/report & UI-related
REPORTKW    : 'REPORT';
ATKW        : 'AT';
FONTKW      : 'FONT';
COLORKW     : 'COLOR';

CENTER      : 'CENTER';
CENTERED    : 'CENTERED';
SYSTEMKW    : 'SYSTEM';
MAXKW       : 'MAX';
ICONKW      : 'ICON';
STATUSKW    : 'STATUS';
HLPKW       : 'HLP';
CURSORKW    : 'CURSOR';
MDI         : 'MDI';
MODAL       : 'MODAL';
MASK        : 'MASK';
GRAY        : 'GRAY';
TIMERKW     : 'TIMER';
ALRTKW      : 'ALRT';
ICONIZE     : 'ICONIZE';
MAXIMIZE    : 'MAXIMIZE';
MSGKW       : 'MSG';
PALETTEKW   : 'PALETTE';
DROPIDKW    : 'DROPID';
IMMKW       : 'IMM';
TOOLBOX     : 'TOOLBOX';
DOCKKW      : 'DOCK';
DOCKEDKW    : 'DOCKED';
LAYOUTKW    : 'LAYOUT';
TILED       : 'TILED';
HSCROLL     : 'HSCROLL';
VSCROLL     : 'VSCROLL';
NOFRAME     : 'NOFRAME';
HVSCROLL    : 'HVSCROLL';
RESIZEKW    : 'RESIZE';
DOUBLE      : 'DOUBLE';

MENUBAR     : 'MENUBAR';
TOOLBAR     : 'TOOLBAR';

// Report sections
FORMKW      : 'FORM';
HEADERKW    : 'HEADER';
DETAILKW    : 'DETAIL';
FOOTERKW    : 'FOOTER';
LANDSCAPEKW : 'LANDSCAPE';
PREVIEWKW   : 'PREVIEW';
PAPERKW     : 'PAPER';
THOUS       : 'THOUS';
MMKW        : 'MM';
POINTSKW    : 'POINTS';

// Operators / punctuation
// Multi-character tokens must come before their prefixes.

LTE         : '<=';
GTE         : '>=';
NEQ         : '<>';
AMP_EQUAL   : '&=';
DEEP_ASSIGN : ':=:';   // deep assignment

SLICE_COLON : ':';     // used only in slice grammar

LT          : '<';
GT          : '>';
EQUAL       : '=';

CARET       : '^';
PLUS        : '+';
MINUS       : '-';
STAR        : '*';
DIV         : '/';
PERCENT     : '%';
TILDE       : '~';
AMP         : '&';
DOT         : '.';

LPAREN      : '(' ;
RPAREN      : ')' ;
LBRACE      : '{' ;
RBRACE      : '}' ;
LBRACKET    : '[' ;
RBRACKET    : ']' ;
COMMA       : ',' ;

QUESTION    : '?' ;

// Literals

INTLIT      : [0-9]+ ;
REALLIT     : [0-9]+ '.' [0-9]+ ;
STRING      : '\'' (~['\\] | '\\' .)* '\'' ;

// Picture tokens: start with '@' and run until whitespace or punctuation
PICTURE
    : '@' ~[ \t\r\n,;(){}[\]]+
    ;

// Identifiers with implicit variable suffixes and colon/dollar in the body
ID
    : [A-Za-z_][A-Za-z0-9_:$]* '#'
    | [A-Za-z_][A-Za-z0-9_:$]* '$'
    | [A-Za-z_][A-Za-z0-9_:$]* '"'
    | [A-Za-z_][A-Za-z0-9_:$]*
    ;

// ==============================
// Line continuation + newline
// ==============================

// "|" at end of line joins with next line
LINE_CONTINUATION
    : '|' [ \t]* [\r\n]+ -> skip
    ;

// NEWLINE also includes semicolon
NEWLINE
    : [\r\n]+
    | ';'
    ;

// ==============================
// Comments & whitespace
// ==============================

LINE_COMMENT
    : '!' ~[\r\n]* -> skip
    ;

BLOCK_COMMENT
    : '/*' .*? '*/' -> skip
    ;

WS
    : [ \t\f]+ -> skip
    ;