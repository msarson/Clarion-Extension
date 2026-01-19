parser grammar ExprParser;
options { tokenVocab=ExprLexer; }

// ==============================
// Parser rules for Clarion Language 
// ==============================

// Program structure

program
    : programHeader? mapSection? declarationSection* codeSection EOF
    ;

programHeader
    : PROGRAM
    ;

// ----- MAP section -----
//
// MAP
//   prototypes
//   [ MODULE( [expr] )
//       prototypes
//     END ]
// END | .
mapSection
    : MAP mapEntry* (END | DOT)
    ;

mapEntry
    : moduleDecl
    | prototypeDecl
    ;

// MODULE inside MAP
moduleDecl
    : MODULE LPAREN expr? RPAREN NEWLINE?
      prototypeDecl*
      (END | DOT)
    ;

// ----- MAP prototypes -----

// MAP prototype, with optional parameters in angle brackets
prototypeDecl
    : ID LPAREN prototypeParamList? RPAREN (COMMA returnType)? (COMMA PROC)? NEWLINE?
    ;

prototypeParamList
    : prototypeParam (COMMA prototypeParam)*
    ;

// Parameters in MAP: by value, by address (*type), or optional <...>
prototypeParam
    : STAR typeSpec               // by-address parameter: *LONG
    | typeSpec                    // by-value parameter: LONG
    | LT STAR typeSpec GT         // optional by-address: <*STRING>
    | LT typeSpec GT              // optional by-value: <STRING>
    ;

// ---------------------
// Types
// ---------------------

// Note: GROUP / FILE / REPORT are block declarations, not simple scalar types

typeSpec
    : BYTE
    | SHORT
    | USHORT
    | LONG
    | ULONG
    | DECIMAL
    | REAL
    | SREAL
    | STRINGKW
    | BSTRING
    | PSTRING
    | BLOB
    | MEMO
    | DATE
    | TIME
    | BOOL
    | QUEUE
    | WINDOW
    | ANY
    | ID
    ;

// Builtin types only (no ID) – for labelDecl "type" lines
builtinType
    : BYTE
    | SHORT
    | USHORT
    | LONG
    | ULONG
    | DECIMAL
    | REAL
    | SREAL
    | STRINGKW
    | BSTRING
    | PSTRING
    | BLOB
    | MEMO
    | DATE
    | TIME
    | BOOL
    | QUEUE
    | WINDOW
    | ANY
    ;

// ---------------------
// Procedure parameter lists for PROCEDURE prototypes/impls
// ---------------------

procedureProtoParamList
    : procedureProtoParam (COMMA procedureProtoParam)*
    ;

procedureProtoParam
    : typeSpec (ID)?       // BYTE xVersion  or just BYTE
    ;

// ---------------------
// Declarations
// ---------------------

declarationSection
    : dataDecl
    | queueDecl
    | windowDecl
    | reportDecl
    | procedureDecl
    | labelDecl
    | enumDecl
    | interfaceDecl
    | classDecl
    | procedureProtoDecl
    | itemizeDecl
    | recordDecl
    | fileDecl
    | groupDecl
    | moduleDecl2
    ;

// ----- DATA declarations -----

dataDecl
    : ID dataLikeOrType? (COMMA dataAttr)* NEWLINE
    ;

dataLikeOrType
    : LIKE LPAREN fieldRef RPAREN
    | typeSpec typeArgs?
    ;

typeArgs
    : LPAREN argList? RPAREN
    ;

argList
    : expr (COMMA expr)*
    ;

dataAttr
    : PRE LPAREN ID RPAREN
    | USE LPAREN fieldRef RPAREN
    | DIM LPAREN expr (COMMA expr)* RPAREN
    | OVER LPAREN fieldRef RPAREN
    | STATIC
    | PRIVATE
    | THREAD
    | AUTO
    | BINARYKW
    | ID (LPAREN argList? RPAREN)?
    ;

// ----- QUEUE declarations -----
//
// Label QUEUE( [ group ] )
//   [,PRE] [,STATIC] [,THREAD] [,TYPE] [,BINDABLE] [,EXTERNAL] [,DLL]
//   fieldLabel variable [,NAME( )]
// END | .
queueDecl
    : ID QUEUE queueTypeArgs? (COMMA queueAttr)* NEWLINE
      queueFieldDecl+
      (END | DOT)
    ;

queueTypeArgs
    : LPAREN fieldRef? RPAREN
    ;

queueAttr
    : PRE (LPAREN ID RPAREN)?              // PRE or PRE(ID)
    | STATIC
    | THREAD
    | TYPEKW
    | BINDABLE
    | EXTERNAL
    | DLL (LPAREN argList? RPAREN)?
    | ID (LPAREN argList? RPAREN)?         // other attrs, e.g. NAME(), etc.
    ;

queueFieldDecl
    : ID dataLikeOrType? (COMMA dataAttr)* NEWLINE
    ;

// ----- WINDOW declarations -----
//
// label WINDOW('title')  [,AT( )] [,CENTER] [,SYSTEM] [,MAX] [,ICON( )] [,STATUS( )] [,HLP( )]
//                        [,CURSOR( )] [,MDI] [,MODAL] [,MASK] [,FONT( )] [,GRAY][,TIMER( )]
//                        [,ALRT( )] [,ICONIZE] [,MAXIMIZE] [,MSG( )] [,PALETTE( )] [,DROPID( )] [,IMM]
//                        [,AUTO] [,COLOR( )] [,TOOLBOX] [,DOCK( )] [,DOCKED( )] [,LAYOUT( )]
//                        [,TILED] [,HSCROLL] [,DOUBLE] [,CENTERED] [,VSCROLL] [,NOFRAME]
//                        [,HVSCROLL] [,RESIZE]
//   [MENUBAR ... END]
//   [TOOLBAR ... END]
//   Controls
// END | .
windowDecl
    : ID WINDOW windowArgs? NEWLINE
      windowMenuBarSection?
      windowToolBarSection?
      windowControlDecl*
      (END | DOT)
    ;

windowArgs
    : LPAREN argList? RPAREN (COMMA windowAttr)*
    ;

windowAttr
    : ATKW      LPAREN argList? RPAREN
    | FONTKW    LPAREN argList? RPAREN
    | ICONKW    LPAREN argList? RPAREN
    | STATUSKW  LPAREN argList? RPAREN
    | HLPKW     LPAREN argList? RPAREN
    | CURSORKW  LPAREN argList? RPAREN
    | TIMERKW   LPAREN argList? RPAREN
    | ALRTKW    LPAREN argList? RPAREN
    | MSGKW     LPAREN argList? RPAREN
    | PALETTEKW LPAREN argList? RPAREN
    | DROPIDKW  LPAREN argList? RPAREN
    | DOCKKW    LPAREN argList? RPAREN
    | DOCKEDKW  LPAREN argList? RPAREN
    | LAYOUTKW  LPAREN argList? RPAREN
    | COLORKW   LPAREN argList? RPAREN
    | CENTER
    | CENTERED
    | SYSTEMKW
    | MAXKW
    | MDI
    | MODAL
    | MASK
    | GRAY
    | ICONIZE
    | MAXIMIZE
    | IMMKW
    | AUTO
    | TOOLBOX
    | TILED
    | HSCROLL
    | VSCROLL
    | NOFRAME
    | HVSCROLL
    | RESIZEKW
    | DOUBLE
    | ID (LPAREN argList? RPAREN)?
    ;

// MENUBAR ... END
windowMenuBarSection
    : MENUBAR NEWLINE
      windowMenuDecl*
      (END | DOT)
    ;

// Loose "menus and/or items" line
windowMenuDecl
    : ID (LPAREN argList? RPAREN)?
      (COMMA ID (LPAREN argList? RPAREN)?)* NEWLINE
    ;

// TOOLBAR ... END
windowToolBarSection
    : TOOLBAR NEWLINE
      windowControlDecl*
      (END | DOT)
    ;

windowControlDecl
    : ID? controlType controlAttrs NEWLINE
    ;

controlType
    : BUTTON
    | LIST
    | ENTRY
    | STRINGKW
    | GROUP
    | BOX
    | LINE
    | OLE
    | OTHERCONTROL
    ;

controlAttrs
    : (COMMA controlAttr)+
    ;

controlAttr
    : ID
    | ID LPAREN argList? RPAREN
    ;

// ----- REPORT declarations -----
//
// label REPORT([jobname]),
//       AT() [,FONT()] [,PRE()] [,LANDSCAPE] [,PREVIEW] [,PAPER]
//       [,COLOR()]
//       [THOUS | MM | POINTS]
//   [FORM   controls END]
//   [HEADER controls END]
//   label DETAIL controls END
//   [label BREAK(...) controls END]
//   [FOOTER controls END]
// END | .
reportDecl
    : ID REPORTKW LPAREN argList? RPAREN
      COMMA ATKW LPAREN argList? RPAREN
      (COMMA reportAttr)* NEWLINE
      reportSection*
      (END | DOT)
    ;

reportAttr
    : FONTKW   LPAREN argList? RPAREN
    | PRE      LPAREN ID RPAREN
    | LANDSCAPEKW
    | PREVIEWKW
    | PAPERKW
    | COLORKW  LPAREN argList? RPAREN
    | THOUS
    | MMKW
    | POINTSKW
    | ID (LPAREN argList? RPAREN)?
    ;

reportSection
    : reportFormSection
    | reportHeaderSection
    | reportDetailSection
    | reportBreakSection
    | reportFooterSection
    ;

// FORM ... END
reportFormSection
    : FORMKW NEWLINE
      reportControlDecl*
      (END | DOT)
    ;

// HEADER ... END
reportHeaderSection
    : HEADERKW NEWLINE
      reportControlDecl*
      (END | DOT)
    ;

// label DETAIL ... END
reportDetailSection
    : ID DETAILKW NEWLINE
      reportControlDecl*
      (END | DOT)
    ;

// label BREAK(...) ... END
reportBreakSection
    : ID BREAK LPAREN argList? RPAREN NEWLINE
      reportControlDecl*
      (END | DOT)
    ;

// FOOTER ... END
reportFooterSection
    : FOOTERKW NEWLINE
      reportControlDecl*
      (END | DOT)
    ;

// reuse same shape as window controls
reportControlDecl
    : ID? controlType controlAttrs NEWLINE
    ;

// ----- Procedure prototypes (no CODE) -----
//
// Name PROCEDURE [ ( param list ) ] [ ,ReturnType ]
procedureProtoDecl
    : ID PROCEDUREKW (LPAREN procedureProtoParamList? RPAREN)?
      (COMMA returnType)?
      NEWLINE
    ;

// ----- Procedure implementations (with CODE) -----
//
// Name PROCEDURE [ ( param list ) ] [ ,ReturnType ]
//   local data
// CODE
//   statements
procedureDecl
    : ID PROCEDUREKW (LPAREN procedureProtoParamList? RPAREN)?
      (COMMA returnType)? NEWLINE
      declarationSection*          // "local data"
      codeSection                  // CODE ... statements
    ;

// Return type shared by prototypes and procedures
returnType
    : typeSpec
    ;

// ----- Standalone MODULE declarations -----
//
// MODULE(sourcefile)
//   prototypeDecl*
// END | .
moduleDecl2
    : MODULE LPAREN expr RPAREN NEWLINE
      prototypeDecl*
      (END | DOT)
    ;

// ----- Label / picture / type / EQUATE lines -----

// label  EQUATE( [ constant ] )
// picture
// type   (builtin types only)
labelDecl
    : ID EQUATE LPAREN expr? RPAREN NEWLINE
    | PICTURE NEWLINE
    | builtinType NEWLINE
    ;

// ----- ENUM declarations -----
//
// Label ENUM
//   Item1
//   ...
//   ItemN
// END | .
enumDecl
    : ID ENUM_KW NEWLINE
      enumItem+
      (END | DOT)
    ;

enumItem
    : ID NEWLINE
    ;

// ----- ITEMIZE declarations -----
//
// [Label] ITEMIZE( [ seed ] ) [,PRE( expr )]
//   ID EQUATE( [ expr ] ) ...
// END | .
itemizeDecl
    : ID? ITEMIZEKW LPAREN expr? RPAREN
      (COMMA PRE LPAREN expr? RPAREN)?
      NEWLINE
      itemizeEquate+
      (END | DOT)
    ;

itemizeEquate
    : ID EQUATE LPAREN expr? RPAREN NEWLINE
    ;

// ----- RECORD declarations -----
//
// Label RECORD [,PRE( )] [,NAME( )]
//   fields
// END | .
recordDecl
    : ID RECORD (COMMA recordAttr)* NEWLINE
      recordFieldDecl+
      (END | DOT)
    ;

recordAttr
    : PRE LPAREN ID RPAREN
    | ID (LPAREN argList? RPAREN)?
    ;

recordFieldDecl
    : ID dataLikeOrType? (COMMA dataAttr)* NEWLINE
    ;

// ----- GROUP declarations -----
//
// Label GROUP( [ group ] )
//   [,PRE( )] [,DIM( )] [,OVER( )] [,NAME( )] [,EXTERNAL] [,DLL] [,STATIC]
//   [,THREAD] [,BINDABLE] [,TYPE] [,PRIVATE] [,PROTECTED]
//   declarations
// END | .
groupDecl
    : ID GROUP LPAREN fieldRef? RPAREN (COMMA groupAttr)* NEWLINE
      declarationSection*
      (END | DOT)
    ;

groupAttr
    : PRE LPAREN ID RPAREN
    | DIM LPAREN expr (COMMA expr)* RPAREN
    | OVER LPAREN fieldRef RPAREN
    | ID (LPAREN argList? RPAREN)?      // NAME(), EXTERNAL, DLL, STATIC, THREAD, BINDABLE, TYPE, PRIVATE, PROTECTED
    ;

// ----- FILE declarations -----
//
// Label FILE,DRIVER( ) [,CREATE] ...
//   entries (RECORD, KEY, INDEX, MEMO, BLOB)
// END | .
fileDecl
    : ID FILE (COMMA fileAttr)* NEWLINE
      fileEntry*
      (END | DOT)
    ;

fileAttr
    : PRE LPAREN ID RPAREN
    | ID (LPAREN argList? RPAREN)?
    ;

fileEntry
    : recordDecl
    | fileKeyDecl
    | fileIndexDecl
    | fileMemoDecl
    | fileBlobDecl
    ;

fileKeyDecl
    : ID (KEYKW LPAREN argList? RPAREN)? NEWLINE
    ;

fileIndexDecl
    : ID (INDEXKW LPAREN argList? RPAREN)? NEWLINE
    ;

fileMemoDecl
    : ID (MEMO LPAREN argList? RPAREN)? NEWLINE
    ;

fileBlobDecl
    : ID (BLOB)? NEWLINE
    ;

// ----- INTERFACE declarations -----
//
// label INTERFACE( [ parentinterface ] ) [,TYPE] [,COM]
//   [methods]
// END | .
interfaceDecl
    : ID INTERFACE LPAREN fieldRef? RPAREN
      (COMMA TYPEKW)?
      (COMMA COMKW)?
      NEWLINE
      interfaceMethod*
      (END | DOT)
    ;

interfaceMethod
    : prototypeDecl          // reuse MAP-style prototype syntax for methods
    ;

// ----- CLASS declarations -----
//
// label CLASS( [ parentclass ] )
// [,EXTERNAL] [,IMPLEMENTS] [,DLL( )] [,STATIC] [,THREAD] [,BINDABLE]
// [,MODULE( )] [,LINK( )] [,TYPE] [,DIM(dimension)] [,NETCLASS] [,PARTIAL]
//   [ data members and methods ]
// END | .
classDecl
    : ID CLASSKW LPAREN fieldRef? RPAREN classAttrList? NEWLINE
      classMember*
      (END | DOT)
    ;

classAttrList
    : COMMA classAttr (COMMA classAttr)*
    ;

classAttr
    : EXTERNAL
    | IMPLEMENTS
    | DLL LPAREN expr? RPAREN
    | STATIC
    | THREAD
    | BINDABLE
    | MODULE LPAREN expr? RPAREN
    | LINKKW LPAREN expr? RPAREN
    | TYPEKW
    | DIM LPAREN expr RPAREN
    | NETCLASS
    | PARTIALKW
    ;

classMember
    : dataDecl
    | prototypeDecl
    ;

// ---------------------
// CODE section & statements
// ---------------------

codeSection
    : CODE NEWLINE statement*
    ;

// QUESTION may prefix any core statement (DEBUG-mode marker),
// NEWLINE alone is a blank/empty statement.
statement
    : QUESTION? coreStatement
    | NEWLINE
    ;

coreStatement
    : assignStmt
    | procCallStmt
    | doStmt
    | ifStmt
    | caseStmt
    | executeStmt
    | loopStmt
    | acceptStmt
    | breakStmt
    | cycleStmt
    | exitStmt
    | routineStmt
    | routineDataBlock
    | codeMarkerStmt
    | includeStmt
    | returnStmt
    | openCloseStmt
    ;

// "=", "&=", ":=:" assignments
assignStmt
    : fieldRef (EQUAL | AMP_EQUAL | DEEP_ASSIGN) expr NEWLINE
    ;

procCallStmt
    : fieldRef LPAREN argList? RPAREN NEWLINE
    ;

// DO Label
doStmt
    : DO fieldRef NEWLINE
    ;

// INCLUDE(filename [,section]) [,ONCE]
includeStmt
    : INCLUDEKW LPAREN expr (COMMA expr)? RPAREN (COMMA ONCEKW)? NEWLINE
    ;

// EXECUTE expression ... [BEGIN..END] ... [ELSE ...] END
executeStmt
    : EXECUTE expr NEWLINE
      executeBranch+
      executeElse?
      (END | DOT)
    ;

executeBranch
    : BEGIN NEWLINE statement* (END | DOT)   // block of statements for one index
    | statement                              // single statement for one index
    ;

executeElse
    : ELSE NEWLINE statement*
    ;

// IF logical expression [THEN]
//   statements
// [ ELSIF logical expression [THEN]
//   statements ]*
// [ ELSE
//   statements ]?
// END | .
ifStmt
    : IF expr (THEN)? NEWLINE
      statement*
      elsifClause*
      elseClause?
      (END | DOT)
    ;

elsifClause
    : ELSIF expr (THEN)? NEWLINE
      statement*
    ;

elseClause
    : ELSE NEWLINE
      statement*
    ;

// CASE with OF / OROF labels and ranges
caseStmt
    : CASE expr NEWLINE
      caseBranch*
      (ELSE NEWLINE statement*)?
      (END | DOT)
    ;

caseBranch
    : OF caseLabel (OROF caseLabel)* NEWLINE
      statement*
    ;

caseLabel
    : expr (TO expr)?      // simple value or range: 'A' or 'A' TO 'M'
    ;

// LOOP variants:
//
// [label] LOOP [ loopHead ] NEWLINE
//   statements
// [ loopTail ]
// END | .
//
// loopHead:
//   expr TIMES
//   ID = expr TO expr [ BY expr ]
//   UNTIL expr
//   WHILE expr
//
// loopTail:
//   UNTIL expr
//   WHILE expr
loopStmt
    : (ID)? LOOP loopHead? NEWLINE
      statement*
      loopTail?
      (END | DOT)
    ;

loopHead
    : expr TIMES                        // LOOP 10 TIMES
    | ID EQUAL expr TO expr (BY expr)?  // LOOP i = 1 TO 10 BY 2
    | UNTIL expr                        // LOOP UNTIL condition
    | WHILE expr                        // LOOP WHILE condition
    ;

loopTail
    : UNTIL expr                        // ... UNTIL condition
    | WHILE expr                        // ... WHILE condition
    ;

acceptStmt
    : ACCEPT NEWLINE statement* (END | DOT)
    ;

// BREAK [ label ]
breakStmt
    : BREAK (ID)? NEWLINE
    ;

// CYCLE [ label ]
cycleStmt
    : CYCLE (ID)? NEWLINE
    ;

// EXIT
exitStmt
    : EXIT NEWLINE
    ;

// ROUTINE label line
routineStmt
    : ID ROUTINE NEWLINE
    ;

// ROUTINE-local DATA block inside CODE
routineDataBlock
    : DATAKW NEWLINE
      declarationSection*
    ;

// Inner CODE marker line inside CODE section / ROUTINE
codeMarkerStmt
    : CODE NEWLINE
    ;

returnStmt
    : RETURN expr? NEWLINE
    ;

openCloseStmt
    : (OPEN | CLOSE) LPAREN fieldRef RPAREN NEWLINE
    ;

// ---------------------
// EXPRESSIONS (precedence-based)
// ---------------------
//
// Precedence (low ? high):
//   OR
//   AND
//   =, <>, &=
//   <, <=, >, >=
//   +, -, &
//   *, /, %
//   ^
//   unary NOT, ~, unary -
//   primary (with [] and {} postfixes)

expr
    : orExpr
    ;

orExpr
    : andExpr (OR andExpr)*
    ;

andExpr
    : equalityExpr (AND equalityExpr)*
    ;

equalityExpr
    : relationalExpr ((EQUAL | NEQ | AMP_EQUAL) relationalExpr)*
    ;

relationalExpr
    : additiveExpr ((LT | LTE | GT | GTE) additiveExpr)*
    ;

additiveExpr
    : multiplicativeExpr ((PLUS | MINUS | AMP) multiplicativeExpr)*
    ;

multiplicativeExpr
    : powExpr ((STAR | DIV | PERCENT) powExpr)*
    ;

// Exponentiation: right-associative
powExpr
    : unaryExpr (CARET powExpr)?
    ;

unaryExpr
    : (NOT | TILDE | MINUS) unaryExpr
    | primary
    ;

// Primary with optional index/slice and property/repeat postfixes
primary
    : primaryBase
      ( LBRACE propertyParamList RBRACE      // Field{PROP:Text,@N3} or '='{10}
      | LBRACE expr RBRACE                   // simple repeat count {n}
      | LBRACKET indexOrSlice RBRACKET       // Name[1], S[1 : 5], S[ : 5], S[ : ]
      )*
    ;

primaryBase
    : literal
    | fieldRef
    | ENUM_KW LPAREN argList? RPAREN
    | ADDRESS LPAREN argList? RPAREN
    | LIKE LPAREN argList? RPAREN
    | LPAREN expr RPAREN
    ;

// Index or slice
// Style: slices are written with spaces around colon: [start : end]
indexOrSlice
    : expr                     // Name[1]
    | expr SLICE_COLON expr?   // S[1 : 5] or S[1 : ]
    | SLICE_COLON expr?        // S[ : 5] or S[ : ]
    ;

propertyParamList
    : expr (COMMA expr)*
    ;

literal
    : INTLIT
    | REALLIT
    | STRING
    | TRUE
    | FALSE
    | PICTURE
    | NULLKW
    ;

// ---------------------
// Field references
// ---------------------

fieldRef
    : ID (DOT ID)*      // Struct.Member, Win$Form:Field, etc.
    ;