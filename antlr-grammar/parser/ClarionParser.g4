// ============================================================================
// Clarion Win32 Parser - Main Grammar
// ============================================================================
// This is the main parser that combines all parser components
// ============================================================================

parser grammar ClarionParser;

options {
    tokenVocab = ClarionLexer;
}

// Import parser components (will be created)
// import ClarionDeclarations, ClarionStructures, ClarionStatements, ClarionExpressions;

// ============================================================================
// TOP-LEVEL RULES
// ============================================================================

// A Clarion source file
compilationUnit
    : programDeclaration EOF
    | memberDeclaration EOF
    ;

// ============================================================================
// PROGRAM DECLARATION
// ============================================================================

programDeclaration
    : IDENTIFIER? PROGRAM programAttributes?
      (mapSection | dataDeclaration | codeSection)*
      procedureList?
    ;

// ============================================================================
// MEMBER DECLARATION
// ============================================================================

memberDeclaration
    : IDENTIFIER? MEMBER (LPAREN STRING_LITERAL RPAREN)? programAttributes?
      (mapSection | dataDeclaration | codeSection)*
      procedureList?
    ;

// ============================================================================
// MAP SECTION
// ============================================================================

mapSection
    : MAP
      mapEntry*
      END
    ;

mapEntry
    : procedurePrototype
    | procedurePrototypeShort
    | moduleReference
    | includeDirective
    | compileDirective
    ;

// Full procedure prototype: label at column 0 with PROCEDURE keyword
procedurePrototype
    : IDENTIFIER PROCEDURE parameterList? procedureModifiers?
    | LABEL PROCEDURE parameterList? procedureModifiers?
    ;

// Short procedure prototype: indented, no PROCEDURE keyword
procedurePrototypeShort
    : IDENTIFIER parameterList procedureModifiers?
    ;

moduleReference
    : MODULE LPAREN STRING_LITERAL RPAREN moduleContent* (END | DOT)
    ;

moduleContent
    : procedurePrototype
    | procedurePrototypeShort  // Allow short-form prototypes inside MODULE
    | compileDirective
    ;

// Procedure modifiers: comma-separated list of return types and attributes
// Return type is just a dataType without a keyword prefix
procedureModifiers
    : (COMMA (dataType | attribute))*
    ;

// ============================================================================
// DATA SECTION
// ============================================================================

globalDataSection
    : dataDeclarationList
    ;

// Note: localDataSection was for routines, removed. Procedures have data directly, routines use routineDataSection

dataDeclarationList
    : dataDeclaration*
    ;

dataDeclaration
    : variableDeclaration
    | structureDeclaration
    | includeDirective
    | compileDirective
    ;

// Simple variable declaration (label can be IDENTIFIER, LABEL, QUALIFIED_IDENTIFIER, or keyword used as identifier)
variableDeclaration
    : (IDENTIFIER | LABEL | QUALIFIED_IDENTIFIER | NAME | TYPE | AUTO | OVER | DIM | PRE) dataType (COMMA dataAttributes)?
    | (IDENTIFIER | LABEL | QUALIFIED_IDENTIFIER) AMPERSAND (anyIdentifier | QUALIFIED_IDENTIFIER)  // Reference variable: Q &QueueType
    | (IDENTIFIER | LABEL | QUALIFIED_IDENTIFIER) EQUATE LPAREN expression RPAREN  // EQUATE declarations
    | (IDENTIFIER | LABEL | QUALIFIED_IDENTIFIER) CLASS LPAREN anyIdentifier RPAREN DOT?  // Class instantiation: name CLASS(type) or name CLASS(type).
    ;

// ============================================================================
// PROCEDURE LIST
// ============================================================================

procedureList
    : (procedureDeclaration | routineDeclaration)*
    ;

// ============================================================================
// PROCEDURE DECLARATION
// ============================================================================

procedureDeclaration
    : IDENTIFIER (DOT IDENTIFIER)? PROCEDURE parameterList? returnType? procedureAttributes?
      dataDeclarationList?
      codeSection?
    | LABEL DOT IDENTIFIER PROCEDURE parameterList? returnType? procedureAttributes?
      dataDeclarationList?
      codeSection?
    | LABEL PROCEDURE parameterList? returnType? procedureAttributes?
      dataDeclarationList?
      codeSection?
    ;

routineDeclaration
    : IDENTIFIER ROUTINE (routineDataSection routineCodeSection | statementList?)
    | LABEL ROUTINE (routineDataSection routineCodeSection | statementList?)
    ;

// Routine-specific data section (requires CODE keyword after)
routineDataSection
    : DATA dataDeclarationList
    ;

// Routine-specific code section (follows DATA section)
routineCodeSection
    : CODE statementList?
    ;

// ============================================================================
// CODE SECTION
// ============================================================================

codeSection
    : CODE
      statementList?
    ;

statementList
    : statement*
    ;

// ============================================================================
// BASIC ELEMENTS (Placeholder - will be expanded)
// ============================================================================

statement
    : assignmentStatement
    | ifStatement
    | loopStatement
    | caseStatement
    | executeStatement
    | returnStatement
    | gotoStatement
    | exitStatement
    | breakStatement
    | cycleStatement
    | doStatement
    | debugStatement
    | procedureCall
    ;

// Debug conditional: ? statement (at column 0) - only compiled in debug mode
// TODO: Column 0 check should be in lexer, not parser
debugStatement
    : QUESTION statement
    ;

assignmentStatement
    : postfixExpression (EQ | ASSIGN | DEEP_ASSIGN | PLUS_EQ | MINUS_EQ | MULT_EQ | DIV_EQ | AMP_EQ) expression
    ;

// TODO: This IF statement grammar has an ambiguity issue - FIXED with semantic predicate on terminator
ifStatement
    : IF expression THEN?
      statementList?
      elsifClause*
      elseClause?
      ifTerminator
    ;

elsifClause
    : ELSIF expression THEN? statementList?
    ;

elseClause
    : ELSE statementList?
    ;

loopStatement
    : LOOP (variable EQ expression TO expression (BY expression)?  // LOOP x = 1 TO 10 [BY 2]
           | expression TIMES                                       // LOOP n TIMES
           | TIMES expression                                       // LOOP TIMES n
           | WHILE expression                                       // LOOP WHILE condition
           | UNTIL expression)?                                     // LOOP UNTIL condition (or just LOOP)
      statementList?
      loopTerminator
    ;

// Shared terminator logic: DOT only if NOT followed by identifier/keyword (to avoid matching member access)
ifTerminator
    : END
    | {(()=>{ const ty = this.tokenStream.LA(2); return !ty || ty===-1 || ty===5 || !(ty === 301 || ty === 295 || (ty >= 8 && ty <= 294)); })()}? DOT
    ;

// Loop terminator: END or DOT (but DOT only if NOT followed by identifier/keyword for member access)
loopTerminator
    : END
    | {(()=>{ const ty = this.tokenStream.LA(2); return !ty || ty===-1 || ty===5 || !(ty === 301 || ty === 295 || (ty >= 8 && ty <= 294)); })()}? DOT
    ;

caseStatement
    : CASE expression
      (OF expression statementList? (OROF expression statementList?)*)*
      (ELSE statementList?)?
      caseTerminator
    ;

executeStatement
    : EXECUTE expression
      statement+           // One or more statements (one per possible value)
      (ELSE statement)?    // Optional ELSE clause
      executeTerminator
    ;

// Terminators for different structures - all use same logic
caseTerminator
    : END
    | {(()=>{ const ty = this.tokenStream.LA(2); return !ty || ty===-1 || ty===5 || !(ty === 301 || ty === 295 || (ty >= 8 && ty <= 294)); })()}? DOT
    ;

executeTerminator
    : END
    | {(()=>{ const ty = this.tokenStream.LA(2); return !ty || ty===-1 || ty===5 || !(ty === 301 || ty === 295 || (ty >= 8 && ty <= 294)); })()}? DOT
    ;

returnStatement
    : RETURN expression?
    ;

gotoStatement
    : GOTO label
    ;

exitStatement
    : EXIT
    ;

breakStatement
    : BREAK
    ;

cycleStatement
    : CYCLE
    ;

// DO statement - calls a routine or procedure
doStatement
    : DO IDENTIFIER  // DO RoutineName (calls a ROUTINE)
    | DO IDENTIFIER LPAREN argumentList? RPAREN  // DO ProcedureName(...) - rare but valid
    ;

procedureCall
    : postfixExpression  // Handles func(), obj.method(), obj{prop}(), etc. via postfix operators
    | DISPOSE LPAREN argumentList? RPAREN  // DISPOSE(reference) - built-in procedure for deallocation
    | DISABLE LPAREN argumentList? RPAREN  // DISABLE(control) - built-in procedure to disable a control
    | ASSERT LPAREN argumentList? RPAREN   // ASSERT(condition, message) - debug assertion
    | bareIdentifierCall  // Procedure call without parentheses
    ;

// Procedure call without parentheses (PARENT.Ask, SELF.Save, Relate:File.Open, etc.)
bareIdentifierCall
    : SELF (DOT IDENTIFIER)+  // SELF.method (no parens) - at least one DOT required
    | PARENT (DOT IDENTIFIER)+  // PARENT.method (no parens)
    | QUALIFIED_IDENTIFIER (DOT IDENTIFIER)+  // Relate:File.Open (no parens)
    | IDENTIFIER (DOT IDENTIFIER)+  // obj.method (no parens)
    ;

// ============================================================================
// STRUCTURE DECLARATIONS (Placeholder)
// ============================================================================

structureDeclaration
    : fileDeclaration
    | groupDeclaration
    | queueDeclaration
    | classDeclaration
    | viewDeclaration
    | windowDeclaration
    | applicationDeclaration
    | reportDeclaration
    ;

fileDeclaration
    : label FILE fileAttributes?
      recordDeclaration?
      keyDeclarations?
      (END | DOT)
    ;

recordDeclaration
    : RECORD
      dataDeclarationList
    ;

keyDeclarations
    : (keyDeclaration)*
    ;

keyDeclaration
    : label KEY keyAttributes? componentList
    ;

groupDeclaration
    : label? GROUP (LPAREN IDENTIFIER? RPAREN)? (COMMA groupAttributes)?
      dataDeclarationList
      (END | DOT)
    ;

queueDeclaration
    : label? QUEUE (LPAREN IDENTIFIER? RPAREN)? (COMMA queueAttributes)?
      dataDeclarationList
      (END | DOT)
    ;

classDeclaration
    : label? CLASS (LPAREN IDENTIFIER? RPAREN)? (COMMA classAttributes)?
      classBody
      (END | DOT)
    ;

classBody
    : (methodDeclaration | variableDeclaration)*
    ;

methodDeclaration
    : label PROCEDURE parameterList? returnType? methodAttributes?
    ;

viewDeclaration
    : label VIEW (LPAREN IDENTIFIER? RPAREN)? (COMMA viewAttributes)?
      projectList
      (END | DOT)
    ;

projectList
    : (projectDeclaration)*
    ;

projectDeclaration
    : PROJECT LPAREN expression (COMMA expression)* RPAREN
    ;

viewAttributes
    : attribute (COMMA attribute)*
    ;

windowDeclaration
    : IDENTIFIER WINDOW LPAREN STRING_LITERAL? RPAREN (COMMA attribute)* windowControls END
    | LABEL WINDOW LPAREN STRING_LITERAL? RPAREN (COMMA attribute)* windowControls END
    | IDENTIFIER WINDOW LPAREN STRING_LITERAL? RPAREN (COMMA attribute)* END
    | LABEL WINDOW LPAREN STRING_LITERAL? RPAREN (COMMA attribute)* END
    ;

applicationDeclaration
    : label APPLICATION LPAREN expression RPAREN (COMMA windowAttributes)?
      windowControls?
      END
    ;

windowControls
    : controlDeclaration+
    ;

// Control declaration - dispatches to specialized rules
controlDeclaration
    : sheetControl
    | optionControl
    | groupControl
    | oleControl
    | tabControl
    | genericControl
    ;

// Specialized control: SHEET (MUST have TABs)
sheetControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? SHEET (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)?
      tabControl+
      END
    ;

// Specialized control: TAB (inside SHEET)
tabControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? TAB (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)?
      controlDeclaration*
      END
    ;

// Specialized control: OPTION (has child controls, typically RADIO)
optionControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? OPTION (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)?
      genericControl+
      END
    ;

// Specialized control: GROUP (has nested controls)
groupControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? GROUP (COMMA controlAttributes)?
      controlDeclaration*
      END
    ;

// Specialized control: OLE (optional MENUBAR)
oleControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? OLE (COMMA controlAttributes)?
      menubarDeclaration?
      END
    ;

// MENUBAR within OLE
menubarDeclaration
    : MENUBAR (COMMA controlAttributes)?
      menuDeclaration*
      END
    ;

// MENU within MENUBAR
menuDeclaration
    : label? MENU (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)?
      menuItemDeclaration*
      END
    ;

// ITEM within MENU
menuItemDeclaration
    : label? ITEM (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)?
    ;

// Generic control (all others)
genericControl
    : label? genericControlType (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)?
    ;

genericControlType
    : BUTTON | ENTRY | TEXT | LIST | COMBO
    | CHECK | RADIO | IMAGE | LINE
    | BOX | ELLIPSE | PANEL | PROGRESS | REGION
    | PROMPT | SPIN | STRING | MENU | MENUBAR | TOOLBAR
    ;

reportDeclaration
    : label REPORT reportAttributes?
      reportStructure?
      END
    ;

reportStructure
    : (reportBand)*
    ;

reportBand
    : (DETAIL | HEADER | FOOTER | BREAK | FORM) reportBandAttributes?
      controlDeclaration*
    ;

// ============================================================================
// EXPRESSIONS (with precedence)
// ============================================================================

expression
    : orExpression
    ;

orExpression
    : andExpression (OR andExpression)*
    ;

andExpression
    : xorExpression (AND xorExpression)*
    ;

xorExpression
    : equalityExpression (XOR equalityExpression)*
    ;

equalityExpression
    : relationalExpression ((EQ | NE | NE_ALT | AMP_EQ) relationalExpression)*
    ;

relationalExpression
    : additiveExpression ((LT | GT | LE | GE) additiveExpression)*
    ;

additiveExpression
    : multiplicativeExpression ((PLUS | MINUS | AMPERSAND) multiplicativeExpression)*
    ;

multiplicativeExpression
    : exponentiationExpression ((MULTIPLY | DIVIDE | MODULO) exponentiationExpression)*
    ;

exponentiationExpression
    : unaryExpression (POWER unaryExpression)*
    ;

unaryExpression
    : (MINUS | NOT | AMPERSAND | TILDE) unaryExpression
    | postfixExpression
    ;

// Postfix operators bind tighter than any infix operator
// Property access {prop:xxx}, array subscripting [index], member access .member, and function calls () are all postfix
// IMPORTANT: Use greedy matching for member access to prevent DOT from being interpreted as structure terminator
postfixExpression
    : primaryExpression postfixOperator*
    ;

postfixOperator
    : LBRACE argumentList RBRACE  // Property access: var{PROP:Text} or 0{prop:hlp}
    | LBRACKET expression (COLON expression)? RBRACKET     // Array subscripting or slicing: array[index] or array[start:end]
    | DOT (anyIdentifier | QUALIFIED_IDENTIFIER)  // Member access: obj.member - revert to no predicate, let loop terminator handle it
    | LPAREN argumentList? RPAREN  // Function call: func() or obj.method()
    ;

primaryExpression
    : literal           // Literals (numbers, strings, QUESTION, etc.)
    | newExpression     // NEW expression
    | chooseExpression  // CHOOSE expression
    | variable          // Simple variables (no postfix operators - those are in postfixExpression)
    | LPAREN expression RPAREN
    ;

newExpression
    : NEW LPAREN dataType RPAREN  // NEW(Type)
    | NEW (anyIdentifier | QUALIFIED_IDENTIFIER)  // NEW Type (parentheses optional per ClarionDocs)
    ;

chooseExpression
    : CHOOSE LPAREN expression (COMMA expression)+ RPAREN  // CHOOSE(expr, val1, val2[, val3...]) or CHOOSE(cond[, true, false])
    ;

functionCall
    : SELF LPAREN argumentList? RPAREN  // SELF() - treat as function call
    | PARENT LPAREN argumentList? RPAREN  // PARENT() - treat as function call
    | IDENTIFIER LPAREN argumentList? RPAREN  // Simple function call
    | QUALIFIED_IDENTIFIER LPAREN argumentList? RPAREN  // Qualified function call
    ;

argumentList
    : argument (COMMA argument)*
    ;

argument
    : expression    // Regular argument with expression
    |               // OR empty argument (for omitted parameters like func(a,,c))
    ;

variable
    : SELF          // SELF reference
    | PARENT        // PARENT reference
    | anyIdentifier // Regular identifier
    | QUALIFIED_IDENTIFIER  // Qualified identifier (e.g., PRE:Variable)
    | IMPLICIT_NUMERIC   // Implicit LONG with # (e.g., Counter#)
    | IMPLICIT_STRING    // Implicit REAL with $ (e.g., Percent$)
    | IMPLICIT_QUOTE     // Implicit STRING(32) with " (e.g., Address")
    | FIELD_EQUATE       // Field equate (e.g., ?FieldName)
    ;

// ============================================================================
// SOFT KEYWORDS (can be used as identifiers per ClarionDocs)
// ============================================================================
// These keywords may be used as labels of data structures or executable
// statements. They may NOT be the label of any PROCEDURE statement.
// They may appear as parameter labels in prototypes if data type is specified.
//
// Per ClarionDocs/reserved_words.htm:
// APPLICATION, CLASS, DETAIL, FILE, FOOTER, FORM, GROUP, HEADER, ITEM,
// ITEMIZE, JOIN, MAP, MENU, MENUBAR, MODULE, OLE, OPTION, PARENT, QUEUE,
// RECORD, REPORT, SELF, SHEET, TAB, TOOLBAR, VIEW, WINDOW
// ============================================================================

softKeyword
    : APPLICATION
    | CLASS
    | DETAIL
    | FILE
    | FOOTER
    | FORM
    | GROUP
    | HEADER
    | ITEM
    | ITEMIZE
    | JOIN
    | MAP
    | MENU
    | MENUBAR
    | MODULE
    | OLE
    | OPTION
    | PARENT
    | QUEUE
    | RECORD
    | REPORT
    | SELF
    | SHEET
    | TAB
    | TOOLBAR
    | VIEW
    | WINDOW
    // Additional soft keywords from control types (not in ClarionDocs but behave as soft)
    | BUTTON
    | ENTRY
    | TEXT
    | LIST
    | IMAGE
    | STRING      // Data type but used as identifier
    | PRIMARY     // Attribute but used as identifier
    | LINE        // Control type but used as field name
    | BOX | ELLIPSE | PANEL | PROGRESS | REGION | PROMPT | SPIN | CHECK | RADIO | COMBO
    // Common attribute keywords that can be used as parameter names
    | MSG | HLP | TIP | KEY | NAME | TYPE | AUTO | OVER | DIM | PRE
    | RAW | PASCAL | PROC | DLL | EXTERNAL | PRIVATE | PROTECTED | STATIC | THREAD
    | AT | USE | FROM | HIDE | DISABLE | READONLY | REQ | DEFAULT | CENTER | CENTERED
    | ICON | FONT | COLOR | TRN | IMM | ALRT | TIMER | CURSOR
    | CREATE | RECLAIM | OWNER | ENCRYPT | DRIVER | BINARY
    | INDEX | OPT | DUP | NOCASE | PRIMARY | INNER | OUTER | FILTER | ORDER
    | REPLACE  // String method that can be used as identifier
    ;

// Allow keywords to be used as identifiers (Clarion allows this in many contexts)
// This includes IDENTIFIER plus all soft keywords
anyIdentifier
    : IDENTIFIER
    | softKeyword
    ;

literal
    : STRING_LITERAL
    | DECIMAL_LITERAL
    | HEX_LITERAL
    | BINARY_LITERAL
    | OCTAL_LITERAL
    | PICTURE_NUMERIC
    | PICTURE_SCIENTIFIC
    | PICTURE_SHORT
    | PICTURE_DATE
    | PICTURE_TIME
    | PICTURE_PATTERN
    | PICTURE_KEY
    | PICTURE_FORMAT
    | PICTURE_NUMBER
    | TRUE
    | FALSE
    | NULL
    | QUESTION  // Standalone ? means "current field with focus"
    ;

// ============================================================================
// ATTRIBUTES AND MODIFIERS (Placeholder - simplified)
// ============================================================================

programAttributes
    : attribute*
    ;

procedureAttributes
    : (COMMA attribute)*  // Procedure attributes preceded by commas
    ;

methodAttributes
    : (COMMA attribute)*
    ;

dataAttributes
    : dataAttribute (COMMA dataAttribute)*
    ;

fileAttributes
    : fileAttribute (COMMA fileAttribute)*
    ;

groupAttributes
    : structureAttribute (COMMA structureAttribute)*
    ;

queueAttributes
    : structureAttribute (COMMA structureAttribute)*
    ;

classAttributes
    : classAttribute (COMMA classAttribute)*
    ;

windowAttributes
    : windowAttribute (COMMA windowAttribute)*
    ;

controlAttributes
    : controlAttribute (COMMA controlAttribute)*
    ;

reportAttributes
    : attribute*
    ;

reportBandAttributes
    : attribute*
    ;

keyAttributes
    : attribute*
    ;

// ============================================================================
// CONTEXT-SPECIFIC ATTRIBUTES
// ============================================================================

// Shared attributes (used across multiple contexts)
sharedPositionAttribute
    : AT (LPAREN expression? (COMMA expression?)* RPAREN)?
    ;

sharedDisplayAttribute
    : COLOR (LPAREN expression? (COMMA expression?)* RPAREN)?
    | FONT (LPAREN expression? (COMMA expression?)* RPAREN)?
    | ICON (LPAREN expression? (COMMA expression?)* RPAREN)?
    | GRAY
    | TRN
    ;

sharedScrollAttribute
    : HSCROLL
    | VSCROLL  
    | HVSCROLL
    | SCROLL
    ;

// Window-specific attributes
windowAttribute
    : sharedPositionAttribute
    | sharedDisplayAttribute
    | sharedScrollAttribute
    | USE (LPAREN expression? (COMMA expression?)* RPAREN)?
    | HLP (LPAREN expression? (COMMA expression?)* RPAREN)?
    | MSG (LPAREN expression? (COMMA expression?)* RPAREN)?
    | STATUS (LPAREN expression? (COMMA expression?)* RPAREN)?
    | TIMER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | ALRT (LPAREN expression? (COMMA expression?)* RPAREN)?
    | CENTER | CENTERED
    | MODAL
    | MDI
    | RESIZE
    | DOUBLE
    | NOFRAME
    | WALLPAPER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | MAXIMIZE
    | ICONIZE
    | FULL
    | TOOLBOX
    | DOCK (LPAREN expression? (COMMA expression?)* RPAREN)?
    | DOCKED (LPAREN expression? (COMMA expression?)* RPAREN)?
    | TILED
    | SYSTEM
    | MASK
    | MAX
    | PALETTE (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER
    ;

// Control-specific attributes
controlAttribute
    : sharedPositionAttribute
    | sharedDisplayAttribute
    | sharedScrollAttribute
    | USE (LPAREN expression? (COMMA expression?)* RPAREN)?
    | HLP (LPAREN expression? (COMMA expression?)* RPAREN)?
    | MSG (LPAREN expression? (COMMA expression?)* RPAREN)?
    | KEY (LPAREN expression? (COMMA expression?)* RPAREN)?
    | TIP (LPAREN expression? (COMMA expression?)* RPAREN)?
    | FROM (LPAREN expression? (COMMA expression?)* RPAREN)?
    | HIDE
    | DISABLE
    | IMM
    | READONLY
    | REQ
    | AUTO
    | SKIP
    | RANGE (LPAREN expression? (COMMA expression?)* RPAREN)?
    | DEFAULT (LPAREN expression? (COMMA expression?)* RPAREN)?
    | FORMAT (LPAREN expression? (COMMA expression?)* RPAREN)?
    | LEFT (LPAREN expression? (COMMA expression?)* RPAREN)?
    | RIGHT (LPAREN expression? (COMMA expression?)* RPAREN)?
    | CENTER
    | DECIMAL (LPAREN expression? (COMMA expression?)* RPAREN)?
    | FLAT
    | BOXED
    | DROP (LPAREN expression? (COMMA expression?)* RPAREN)?
    | STD (LPAREN expression? (COMMA expression?)* RPAREN)?
    | STD
    | INS
    | OVR
    | UPR
    | CAP
    | PASSWORD
    | MARK (LPAREN expression? (COMMA expression?)* RPAREN)?
    | NOBAR
    | VCR (LPAREN expression? (COMMA expression?)* RPAREN)?
    | SEPARATOR
    | FILL (LPAREN expression? (COMMA expression?)* RPAREN)?
    | BEVEL (LPAREN expression? (COMMA expression?)* RPAREN)?
    | GRID (LPAREN expression? (COMMA expression?)* RPAREN)?
    | COLUMN (LPAREN expression? (COMMA expression?)* RPAREN)?
    | VALUE (LPAREN expression? (COMMA expression?)* RPAREN)?
    | CHECK
    | RADIO
    | IDENTIFIER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER
    ;

// Data/variable attributes
dataAttribute
    : DIM (LPAREN expression (COMMA expression)* RPAREN)?
    | OVER (LPAREN expression RPAREN)?
    | PRE (LPAREN expression RPAREN)?
    | NAME (LPAREN expression RPAREN)?
    | EXTERNAL
    | STATIC
    | THREAD
    | AUTO
    | PRIVATE
    | PROTECTED
    | DLL (LPAREN expression? (COMMA expression?)* RPAREN)?
    | BINDABLE
    | LIKE (LPAREN expression RPAREN)?
    | IDENTIFIER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER
    ;

// Structure attributes (GROUP, QUEUE, CLASS, FILE)
structureAttribute
    : PRE (LPAREN expression? RPAREN)?
    | DIM (LPAREN expression (COMMA expression)* RPAREN)?
    | OVER (LPAREN expression? RPAREN)?
    | STATIC
    | THREAD
    | TYPE
    | BINDABLE
    | EXTERNAL
    | AUTO
    | DLL (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER
    ;

// FILE-specific attributes
fileAttribute
    : structureAttribute
    | CREATE (LPAREN expression? RPAREN)?
    | RECLAIM
    | OWNER (LPAREN expression RPAREN)?
    | ENCRYPT (LPAREN expression? RPAREN)?
    | DRIVER (LPAREN expression (COMMA expression?)* RPAREN)?
    | NAME (LPAREN expression RPAREN)?
    ;

// CLASS-specific attributes
classAttribute
    : structureAttribute
    | IMPLEMENTS (LPAREN expression RPAREN)?
    | MODULE (LPAREN expression RPAREN)?
    | LINK (LPAREN expression RPAREN)?
    | DERIVED (LPAREN expression RPAREN)?
    | VIRTUAL
    ;

// Generic attribute (fallback for unknown attributes and legacy support)
attribute
    : (IDENTIFIER | ALRT | AT | AUTO | BEVEL | BINDABLE | BOXED | CAP | CENTER | CENTERED | CHECK | COLOR | COLUMN | CREATE | DECIMAL | DEFAULT 
      | DERIVED | DIM | DISABLE | DLL | DOCK | DOCKED | DOUBLE | DRIVER | DROP | ENCRYPT | EXTERNAL | FILL | FLAT | FONT | FORMAT 
      | FROM | FULL | GRAY | GRID | HIDE | HLP | HSCROLL | HVSCROLL | ICON | ICONIZE | IMM | IMPLEMENTS | INS | KEY | LEFT | LINK | MARK 
      | MASK | MAX | MAXIMIZE | MDI | MODAL | MODULE | MSG | NAME | NOBAR | NOFRAME | ONCE | OVR | OVER | OWNER | PASCAL | PASSWORD 
      | PRE | PRIVATE | PROC | PROTECTED | RADIO | RANGE | RAW | READONLY | RECLAIM | REPLACE | REQ | RESIZE | RIGHT | SCROLL | SEPARATOR 
      | SINGLE | SKIP | STATIC | STATUS | STD | SYSTEM | THREAD | TILED | TIMER | TIP | TRN | TOOLBOX | TYPE | UPR | USE | VALUE | VIRTUAL 
      | VSCROLL | WALLPAPER | INDEX | VCR | PALETTE) 
      (LPAREN expression? (COMMA expression?)* RPAREN)?
    ;

// ============================================================================
// COMMON ELEMENTS
// ============================================================================

label
    : LABEL 
    | QUALIFIED_IDENTIFIER 
    | IDENTIFIER
    // Clarion allows many keywords as labels when at column 0
    // This includes structure types and control types
    | WINDOW | APPLICATION | REPORT
    | BUTTON | ENTRY | STRING | LIST | COMBO | CHECK | RADIO | TEXT
    | GROUP | QUEUE | CLASS | FILE | VIEW
    | MENU | MENUBAR | TOOLBAR | SHEET | TAB
    | OPTION | IMAGE | LINE | BOX | ELLIPSE | PANEL | PROGRESS | REGION
    | PROMPT | SPIN | ITEM | OLE
    // Data types that can be labels
    | BYTE | SHORT | USHORT | LONG | ULONG | REAL | SREAL
    | DECIMAL | PDECIMAL | CSTRING | PSTRING | ASTRING | BSTRING
    | DATE | TIME | MEMO | BLOB | ANY
    // Other common keywords that can be labels
    | AUTO | TYPE | NAME | OVER | DIM | PRE
    ;

dataType
    : ASTERISK? baseType
    | ANY
    | LIKE LPAREN (IDENTIFIER | QUALIFIED_IDENTIFIER) RPAREN  // Inherited data type
    | GROUP | QUEUE | CLASS
    ;

baseType
    : BYTE (LPAREN expression RPAREN)?
    | SHORT (LPAREN expression RPAREN)?
    | USHORT (LPAREN expression RPAREN)?
    | LONG (LPAREN expression RPAREN)?
    | ULONG (LPAREN expression RPAREN)?
    | UNSIGNED (LPAREN expression RPAREN)?
    | REAL (LPAREN expression RPAREN)?
    | SREAL (LPAREN expression RPAREN)?
    | DECIMAL (LPAREN expression (COMMA expression)* RPAREN)?
    | PDECIMAL (LPAREN expression (COMMA expression)* RPAREN)?
    | STRING (LPAREN expression RPAREN)?
    | CSTRING (LPAREN expression RPAREN)?
    | PSTRING (LPAREN expression RPAREN)?
    | ASTRING (LPAREN expression RPAREN)?
    | BSTRING (LPAREN expression RPAREN)?
    | DATE (LPAREN expression RPAREN)?
    | TIME (LPAREN expression RPAREN)?
    | MEMO (LPAREN expression RPAREN)?
    | BLOB (LPAREN expression RPAREN)?
    | IDENTIFIER  // User-defined types (e.g., PersonType)
    ;

controlType
    : BUTTON | ENTRY | TEXT | LIST | COMBO
    | CHECK | RADIO | OPTION | IMAGE | LINE
    | BOX | ELLIPSE | PANEL | PROGRESS | REGION
    | PROMPT | SPIN | ITEM
    | MENU | MENUBAR | TOOLBAR | SHEET | TAB
    | OLE | STRING  // STRING can be a control or data type
    ;

parameterList
    : LPAREN RPAREN                             // Empty parameter list
    | LPAREN parameter (COMMA parameter)* RPAREN
    ;

parameter
    : LT dataType anyIdentifier? GT                  // Omittable parameter: <STRING pSep>
    | dataType anyIdentifier? (EQ expression)?       // Optional documentary parameter name (can be keyword) and default value
    | POINTER_VAR anyIdentifier? (EQ expression)?    // Pointer variable with optional parameter name and default
    | AMPERSAND (anyIdentifier | QUALIFIED_IDENTIFIER)  // Reference parameter (e.g., &QueueType)
    ;

returnType
    : COMMA dataType
    ;

componentList
    : LPAREN variable (COMMA variable)* RPAREN
    ;

// ============================================================================
// DIRECTIVES
// ============================================================================

includeDirective
    : INCLUDE LPAREN STRING_LITERAL RPAREN (COMMA attribute)*
    ;

compileDirective
    : COMPILE LPAREN STRING_LITERAL (COMMA omitCondition)? RPAREN
    | OMIT LPAREN STRING_LITERAL (COMMA omitCondition)? RPAREN
    | PRAGMA LPAREN STRING_LITERAL RPAREN
    ;

// OMIT has a restricted expression syntax: equate, equate=value, equate<>value, etc.
omitCondition
    : omitEquate
    | omitEquate EQ literal
    | omitEquate NE literal  
    | omitEquate NE_ALT literal
    | omitEquate GT literal
    | omitEquate LT literal
    | omitEquate GE literal
    | omitEquate LE literal
    ;

// Equate in OMIT can be IDENTIFIER or QUALIFIED_IDENTIFIER (e.g., WE::Variable)
// Note: :: is lexed as two COLON tokens, not as a single token
omitEquate
    : IDENTIFIER (COLON COLON IDENTIFIER)*  // Support WE::Variable syntax
    | QUALIFIED_IDENTIFIER
    ;

