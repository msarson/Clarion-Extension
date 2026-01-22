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

// A Clarion source file (allow leading blank lines/comments)
compilationUnit
    : NEWLINE* programDeclaration EOF
    | NEWLINE* memberDeclaration EOF
    | NEWLINE* includeFile EOF  // Include files (.INC) without PROGRAM/MEMBER
    ;

// ============================================================================
// INCLUDE FILE (no PROGRAM/MEMBER header)
// ============================================================================

includeFile
    : (NEWLINE | mapSection | moduleReference | dataDeclaration | structureDeclaration | moduleContent)*
    ;

// ============================================================================
// PROGRAM DECLARATION
// ============================================================================

programDeclaration
    : IDENTIFIER? PROGRAM programAttributes? NEWLINE
      (NEWLINE | mapSection | dataDeclaration | codeSection)*
      procedureList?
    ;

// ============================================================================
// MEMBER DECLARATION
// ============================================================================

memberDeclaration
    : IDENTIFIER? MEMBER (LPAREN STRING_LITERAL? RPAREN)? programAttributes? NEWLINE
      (NEWLINE | mapSection | dataDeclaration | codeSection)*
      procedureList?
    ;

// ============================================================================
// MAP SECTION
// ============================================================================

mapSection
    : MAP NEWLINE+
      (NEWLINE* mapEntry)*
      END NEWLINE*
    ;

mapEntry
    : procedurePrototype NEWLINE
    | procedurePrototypeShort NEWLINE
    | moduleReference
    | includeDirective NEWLINE
    | compileDirective NEWLINE
    ;

// Full procedure prototype: label at column 0 with PROCEDURE keyword
procedurePrototype
    : procedureName PROCEDURE parameterList? procedureModifiers?
    ;

// Short procedure prototype: indented, no PROCEDURE keyword
procedurePrototypeShort
    : procedureName parameterList? procedureModifiers?
    ;

// Common procedure name pattern: supports multi-dot names
procedureName
    : anyIdentifier (DOT anyIdentifier)*
    | LABEL (DOT anyIdentifier)*
    | QUALIFIED_IDENTIFIER (DOT anyIdentifier)*  // Handles qualified names at column 0 like NYS950:GlobalObjectsWindow
    ;

moduleReference
    : MODULE LPAREN STRING_LITERAL RPAREN NEWLINE (NEWLINE* moduleContent)* (END | DOT) NEWLINE*
    ;

moduleContent
    : procedurePrototype NEWLINE
    | procedurePrototypeShort NEWLINE
    | compileDirective NEWLINE
    | NEWLINE  // Allow blank lines and comment lines
    ;

// Procedure modifiers: comma-separated list of return types and attributes
// Return type is just a dataType without a keyword prefix
procedureModifiers
    : (COMMA? (dataType | attribute))+  // Modifiers with optional commas between them
    ;

// ============================================================================
// DATA SECTION
// ============================================================================

globalDataSection
    : dataDeclarationList
    ;

// Note: localDataSection was for routines, removed. Procedures have data directly, routines use routineDataSection

dataDeclarationList
    : (statementSeparator | dataDeclaration)*  // Allow blank lines, semicolons, and comments between declarations
    ;

dataDeclaration
    : structureDeclaration
    | variableDeclaration (statementSeparator | DOT)+  // Variable declarations can end with NEWLINE, semicolon, or DOT
    | includeDirective statementSeparator
    | compileDirective statementSeparator
    ;

// Simple variable declaration
// NOTE: Using anyIdentifier to allow keywords as variable names (e.g., "left Long,auto")
// Real-world Clarion code (StringTheory.clw) uses keywords liberally as identifiers
// The compiler is more permissive than documentation suggests, so we match actual behavior
// This is acceptable for folding/parsing - strict validation is the compiler's job
// If stricter validation is needed later, revert to: (IDENTIFIER | LABEL | QUALIFIED_IDENTIFIER)
// Anonymous fields: In GROUP/QUEUE structures, fields can be unnamed (e.g., string('\') for padding)
variableDeclaration
    : (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER)? nonStructureDataType (LPAREN expression RPAREN)? (COMMA dataAttributes)?  // With optional initialization: hr HRESULT(value)
    | (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER) AMPERSAND (baseType | FILE | GROUP | QUEUE | KEY | REPORT | WINDOW | anyIdentifier | QUALIFIED_IDENTIFIER) (COMMA dataAttributes)?  // Reference variable: Q &QueueType, f &File, b &byte, or allowedChars &string,Auto
    | (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER) EQUATE (LPAREN expression RPAREN)?  // EQUATE declarations: with or without value (for ITEMIZE)
    | (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER) (CLASS | anyIdentifier | QUALIFIED_IDENTIFIER) LPAREN (anyIdentifier | QUALIFIED_IDENTIFIER)? RPAREN DOT?  // Class instantiation: name CLASS(type), name CLASS(type)., or loc:class StringTheory()
    ;

// ============================================================================
// PROCEDURE LIST
// ============================================================================

procedureList
    : (procedureImplementation | routineDeclaration)*
    ;

// ============================================================================
// PROCEDURE IMPLEMENTATIONS (in MEMBER sections)
// ============================================================================
// Implementations have NO attributes/modifiers (end with ) then NEWLINE)
// Three forms:
//   Label PROCEDURE(...) - standalone procedure implementation
//   Label.Method PROCEDURE(...) - method implementation (1 dot)
//   Label.Interface.Method PROCEDURE(...) - interface method implementation (2+ dots)

procedureImplementation
    : anyIdentifier (DOT anyIdentifier)* DOT (QUALIFIED_IDENTIFIER | anyIdentifier) (PROCEDURE | FUNCTION) parameterList? returnType? NEWLINE+
      NEWLINE* dataDeclarationList NEWLINE* codeSection?
    | anyIdentifier (DOT anyIdentifier)* DOT (QUALIFIED_IDENTIFIER | anyIdentifier) (PROCEDURE | FUNCTION) parameterList? returnType? NEWLINE+
      NEWLINE* codeSection
    | (QUALIFIED_IDENTIFIER | LABEL | anyIdentifier) (PROCEDURE | FUNCTION) parameterList? returnType? NEWLINE+
      NEWLINE* dataDeclarationList NEWLINE* codeSection?
    | (QUALIFIED_IDENTIFIER | LABEL | anyIdentifier) (PROCEDURE | FUNCTION) parameterList? returnType? NEWLINE+
      NEWLINE* codeSection
    ;

routineDeclaration
    : (QUALIFIED_IDENTIFIER | IDENTIFIER) ROUTINE NEWLINE+ (routineDataSection routineCodeSection | statementList?)
    | LABEL ROUTINE NEWLINE+ (routineDataSection routineCodeSection | statementList?)
    ;

// Routine-specific data section (requires CODE keyword after)
routineDataSection
    : DATA NEWLINE dataDeclarationList
    ;

// Routine-specific code section (follows DATA section)
routineCodeSection
    : CODE NEWLINE statementList?
    ;

// ============================================================================
// CODE SECTION
// ============================================================================

codeSection
    : CODE NEWLINE
      statementList?
    ;

statementList
    : statement*
    ;

// ============================================================================
// STATEMENT SEPARATION
// ============================================================================
// Semicolon and NEWLINE are equivalent statement separators
statementSeparator
    : NEWLINE
    | STATEMENT_SEPARATOR
    ;

// QUESTION may prefix any core statement (DEBUG-mode marker)
// Blank lines are just separators
statement
    : QUESTION? coreStatement
    | statementSeparator
    ;

nonEmptyStatement
    : QUESTION? coreStatement (ELSE coreStatement)?  // Allow inline else: stmt else stmt
    ;

statementBlock
    : (nonEmptyStatement statementSeparator+)*
    ;

coreStatement
    : simpleStatement
    | structureStatement
    ;

simpleStatement
    : assignmentStatement
    | returnStatement
    | gotoStatement
    | exitStatement
    | breakStatement
    | cycleStatement
    | doStatement
    | procedureCall
    | compileDirective
    ;

structureStatement
    : LABEL? ifStatement
    | LABEL? loopStatement
    | LABEL? acceptStatement
    | LABEL? caseStatement
    | LABEL? executeStatement
    ;

assignmentStatement
    : postfixExpression (EQ | ASSIGN | DEEP_ASSIGN | PLUS_EQ | MINUS_EQ | MULT_EQ | DIV_EQ | MODULO_EQ | AMP_EQ) expression
    ;
    
// Note: We use postfixExpression (not just fieldRef) because Clarion allows:
//   - array[i] = value (subscript)
//   - field{PROP:Text} = value (property)
//   - obj.method() = value (rare but possible)
// And compound assignments: x += 5, count *= 2, etc.

// ============================================================================
// IF STATEMENT
// ============================================================================
// Clarion IF supports multiple forms:
// 1. THEN with ELSIF (single-line THEN stmt followed by multiline ELSIF/ELSE)
// 2. THEN with optional inline ELSE (single-line: if x then a else b.)
// 3. Multiline form (no THEN or THEN with newline, then statementBlock)
// 4. Empty THEN (if x then . - do nothing if true)
// Order matters: ELSIF variant must come before simple ELSE variant
ifStatement
    : IF expression DOT  // Single-line IF with just condition: if x.
    | IF expression THEN DOT  // Single-line IF with THEN but no statement: if x then .
    | IF expression THEN singleLineStatements statementSeparator+ elsifClause+ elseClause? statementTerminator
    | IF expression THEN singleLineStatements ELSE singleLineStatements statementTerminator  // Inline else without separator: stmt else stmt
    | IF expression THEN singleLineStatements statementSeparator* (ELSE statementSeparator* singleLineStatements)? statementTerminator
    | IF expression THEN? statementSeparator+ statementBlock nonEmptyStatement DOT  // Multi-line with last statement ending in DOT
    | IF expression THEN? statementSeparator+ statementBlock elsifClause* elseClause? statementTerminator
    ;

// Common termination pattern for structured statements
statementTerminator
    : DOT
    | QUESTION? END
    ;

singleLineStatements
    : nonEmptyStatement (statementSeparator nonEmptyStatement)*
    ;

elsifClause
    : QUESTION? ELSIF expression THEN singleLineStatements statementSeparator+  // Single-line: elsif x then stmt
    | QUESTION? ELSIF expression THEN? statementSeparator+ statementBlock       // Multi-line: elsif x\n stmts
    ;

elseClause
    : QUESTION? ELSE singleLineStatements statementSeparator+  // Single-line: else stmt
    | QUESTION? ELSE statementSeparator+ statementBlock        // Multi-line: else\n stmts
    ;


// ============================================================================
// LOOP STATEMENT
// ============================================================================
// LOOP STATEMENT
// ============================================================================
// Clarion supports both pre-condition and post-condition WHILE/UNTIL
// Pre-condition: LOOP WHILE x > 0 ... END
// Post-condition: LOOP ... UNTIL x > 10
loopStatement
    : LOOP (WHILE | UNTIL) expression DOT  // Single-line LOOP with just condition: loop until x.
    | LOOP (fieldRef EQ expression TO expression (BY expression)?
           | expression TIMES
           | TIMES expression
           | WHILE expression
           | UNTIL expression)?
      statementSeparator+
      statementBlock
      endLoopStatement
    ;

endLoopStatement
    : QUESTION? UNTIL expression    // Post-condition: loop executes at least once, then tests
    | QUESTION? WHILE expression    // Post-condition (rare but valid)
    | QUESTION? DOT                 // Standard terminator
    | QUESTION? END                 // Standard terminator
    ;

// ============================================================================
// ACCEPT STATEMENT
// ============================================================================
// ACCEPT is an event-driven loop structure used for processing UI events
// Syntax: ACCEPT ... END or ACCEPT ... END. (with DOT)
acceptStatement
    : ACCEPT statementSeparator+
      statementBlock
      (END | DOT)
    ;

// ============================================================================
// CASE STATEMENT
// ============================================================================
caseStatement
    : CASE expression statementSeparator+
      (ofClause | orofClause)* 
      elseCaseClause?
      (QUESTION? END | DOT)
    ;

ofClause
    : QUESTION? OF ofExpression (OROF ofExpression)* statementSeparator+ statementBlock
    ;

orofClause
    : QUESTION? OROF ofExpression (OROF ofExpression)* statementSeparator+ statementBlock
    ;

// OF expression can be a single value or a range (e.g., OF 1 TO 10)
ofExpression
    : expression (TO expression)?
    ;

elseCaseClause
    : ELSE statementSeparator+ statementBlock
    ;

// ============================================================================
// EXECUTE STATEMENT
// ============================================================================
executeStatement
    : EXECUTE expression statementSeparator+
      statementBlock
      (ELSE statementSeparator+ statementBlock)?
      (END | DOT)
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
    : BREAK IDENTIFIER?  // BREAK optionally takes a label to specify which loop to exit
    ;

cycleStatement
    : CYCLE IDENTIFIER?  // CYCLE optionally takes a label to specify which loop to cycle
    ;

// DO statement - calls a routine or procedure
doStatement
    : DO (QUALIFIED_IDENTIFIER | anyIdentifier)  // DO RoutineName (calls a ROUTINE) - supports r:AddItem and keywords like Header, Footer
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
    | interfaceDeclaration
    | viewDeclaration
    | windowDeclaration
    | applicationDeclaration
    | reportDeclaration
    | itemizeDeclaration
    ;

fileDeclaration
    : label FILE (COMMA fileAttributes)? NEWLINE+
      NEWLINE* keyDeclarations?
      NEWLINE* blobDeclarations?
      NEWLINE* recordDeclaration?
      (END | DOT) NEWLINE
    ;

blobDeclarations
    : (blobDeclaration NEWLINE+)+
    ;

blobDeclaration
    : (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER) (BLOB | MEMO) (LPAREN expression RPAREN)? (COMMA dataAttributes)?
    ;

recordDeclaration
    : label? RECORD (COMMA (structureAttribute (COMMA structureAttribute)*))?  NEWLINE+
      dataDeclarationList
      (END | DOT) NEWLINE
    ;

keyDeclarations
    : (keyDeclaration)*
    ;

keyDeclaration
    : label KEY componentList (COMMA keyAttributes)? NEWLINE
    ;

groupDeclaration
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? GROUP (LPAREN ((IDENTIFIER | QUALIFIED_IDENTIFIER | SELF) (DOT (IDENTIFIER | QUALIFIED_IDENTIFIER))*)? RPAREN)? (COMMA groupAttributes)? (DOT | NEWLINE NEWLINE* dataDeclarationList (END | DOT) NEWLINE?)
    ;

queueDeclaration
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? QUEUE (LPAREN ((IDENTIFIER | QUALIFIED_IDENTIFIER | SELF) (DOT (IDENTIFIER | QUALIFIED_IDENTIFIER))*)? RPAREN)? (COMMA queueAttributes)? (DOT | NEWLINE NEWLINE* dataDeclarationList (END | DOT) NEWLINE)
    ;

itemizeDeclaration
    : label? ITEMIZE (LPAREN expression? RPAREN)? (COMMA itemizeAttributes)? NEWLINE+
      NEWLINE* (variableDeclaration (statementSeparator | DOT)+)*  // EQUATE declarations
      END NEWLINE
    ;

classDeclaration
    : label? CLASS (LPAREN ((IDENTIFIER | QUALIFIED_IDENTIFIER | SELF) (DOT (IDENTIFIER | QUALIFIED_IDENTIFIER))*)? RPAREN)? (COMMA? classAttributes)? NEWLINE+
      NEWLINE* classBody
      (END | DOT) NEWLINE
    ;

interfaceDeclaration
    : label? INTERFACE (LPAREN (IDENTIFIER | QUALIFIED_IDENTIFIER)? RPAREN)? (COMMA interfaceAttributes)? NEWLINE+
      NEWLINE* interfaceBody
      (END | DOT) NEWLINE
    ;

classBody
    : (classBodyElement | NEWLINE)*
    ;

classBodyElement
    :  (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER) (PROCEDURE | FUNCTION) parameterList? procedureModifiers? NEWLINE  // Method declaration
    | groupDeclaration  // Group declaration
    | variableDeclaration NEWLINE  // Field/property declaration
    ;

interfaceBody
    : (NEWLINE* interfaceBodyElement)*
    ;

interfaceBodyElement
    : (anyIdentifier | LABEL | QUALIFIED_IDENTIFIER) (PROCEDURE | FUNCTION) parameterList? procedureModifiers? NEWLINE  // Method prototype only - no properties allowed
    ;

viewDeclaration
    : label VIEW (LPAREN IDENTIFIER? RPAREN)? (COMMA viewAttributes)? NEWLINE
      NEWLINE* projectList
      (END | DOT) NEWLINE
    ;

projectList
    : (projectDeclaration)*
    ;

projectDeclaration
    : PROJECT LPAREN expression (COMMA expression)* RPAREN NEWLINE
    ;

viewAttributes
    : attribute (COMMA attribute)*
    ;

windowDeclaration
    : IDENTIFIER WINDOW (LPAREN STRING_LITERAL? RPAREN)? (COMMA attribute)* NEWLINE+ windowControls END NEWLINE
    | LABEL WINDOW (LPAREN STRING_LITERAL? RPAREN)? (COMMA attribute)* NEWLINE+ windowControls END NEWLINE
    | IDENTIFIER WINDOW (LPAREN STRING_LITERAL? RPAREN)? (COMMA attribute)* NEWLINE+ END NEWLINE
    | LABEL WINDOW (LPAREN STRING_LITERAL? RPAREN)? (COMMA attribute)* NEWLINE+ END NEWLINE
    ;

applicationDeclaration
    : label APPLICATION (LPAREN expression RPAREN)? (COMMA windowAttributes)? NEWLINE+
      NEWLINE* windowControls?
      END NEWLINE
    ;

windowControls
    : (NEWLINE* controlDeclaration)+
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
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? SHEET (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE+
      NEWLINE* tabControl+
      END NEWLINE
    ;

// Specialized control: TAB (inside SHEET)
tabControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? TAB (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE+
      NEWLINE* controlDeclaration*
      END NEWLINE
    ;

// Specialized control: OPTION (has child controls, typically RADIO)
optionControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? OPTION (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE+
      NEWLINE* genericControl+
      END NEWLINE
    ;

// Specialized control: GROUP (has nested controls)
groupControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? GROUP (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE+
      NEWLINE* controlDeclaration*
      END NEWLINE
    ;

// Specialized control: OLE (optional MENUBAR)
oleControl
    : (LABEL | QUALIFIED_IDENTIFIER | IDENTIFIER)? OLE (COMMA controlAttributes)? NEWLINE
      NEWLINE* menubarDeclaration?
      END NEWLINE
    ;

// MENUBAR within OLE
menubarDeclaration
    : MENUBAR (COMMA controlAttributes)? NEWLINE
      NEWLINE* menuDeclaration*
      END NEWLINE
    ;

// MENU within MENUBAR
menuDeclaration
    : label? MENU (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE+
      NEWLINE* menuItemDeclaration*
      END NEWLINE
    ;

// ITEM within MENU
menuItemDeclaration
    : label? ITEM (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE
    ;

// Generic control (all others)
genericControl
    : label? genericControlType (LPAREN expression? (COMMA expression?)* RPAREN)? (COMMA controlAttributes)? NEWLINE
    ;

genericControlType
    : BUTTON | ENTRY | TEXT | LIST | COMBO
    | CHECK | RADIO | IMAGE | LINE
    | BOX | ELLIPSE | PANEL | PROGRESS | REGION
    | PROMPT | SPIN | STRING | MENU | MENUBAR | TOOLBAR
    ;

reportDeclaration
    : label REPORT (LPAREN expression? RPAREN)? reportAttributes? NEWLINE+
      NEWLINE* reportStructure?
      END NEWLINE
    ;

reportStructure
    : (NEWLINE* reportBand)*
    ;

reportBand
    : label? (DETAIL | HEADER | FOOTER | FORM) reportBandAttributes? NEWLINE
      NEWLINE* controlDeclaration*
      END NEWLINE
    | label? BREAK (LPAREN expression? (COMMA expression?)* RPAREN)? reportBandAttributes? NEWLINE
      NEWLINE* reportBand*
      END NEWLINE
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
    : relationalExpression ((EQ | NE | NE_ALT | PATTERN_MATCH | AMP_EQ) relationalExpression)*
    ;

relationalExpression
    : additiveExpression ((LT | GT | LE | GE | EQ LT | LT EQ | EQ GT | GT EQ | GT LT | LT GT) additiveExpression)*
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
    : (PLUS | MINUS | NOT | AMPERSAND | TILDE) unaryExpression
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
    | LBRACKET expression (COLON expression)? (COMMA expression (COLON expression)?)* RBRACKET     // Array subscripting: array[index], array[start:end], array[dim1,dim2], or array[dim1, start:end]
    | LPAREN argumentList? RPAREN  // Function call: func() or obj.method()
    | DOT (QUALIFIED_IDENTIFIER | anyIdentifier)    // Member access: obj.field or obj.Free:qLegend
    ;

primaryExpression
    : literal           // Literals (numbers, strings, QUESTION, etc.)
    | LPAREN expression RPAREN  // Parenthesized expression (before fieldRef to avoid ambiguity)
    | newExpression     // NEW expression
    | chooseExpression  // CHOOSE expression
    | fieldRef          // Field reference with optional DOT chains (self.member, obj.prop.field)
    ;

// Field reference - handles all DOT-chained member access
// This rule greedily consumes all DOT+ID sequences before postfix operators
fieldRef
    : ( SELF
      | PARENT
      | anyIdentifier
      | QUALIFIED_IDENTIFIER
      | IMPLICIT_NUMERIC   // Implicit LONG with # (e.g., Counter#)
      | IMPLICIT_STRING    // Implicit REAL with $ (e.g., Percent$)
      | IMPLICIT_QUOTE     // Implicit STRING(32) with " (e.g., Address")
      | FIELD_EQUATE       // Field equate (e.g., ?FieldName)
      )
      (DOT anyIdentifier)*  // Zero or more DOT+ID chains (allow keywords as field names)
    ;

newExpression
    : NEW LPAREN dataType RPAREN  // NEW(Type)
    | NEW baseType (LPAREN argumentList? RPAREN)?  // NEW cstring(size) or NEW cstring
    | NEW (anyIdentifier | QUALIFIED_IDENTIFIER) (LPAREN argumentList? RPAREN)?  // NEW Type(args) or NEW Type
    ;

chooseExpression
    : CHOOSE LPAREN expression (COMMA expression)* RPAREN
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
    // Instead of listing every possible soft keyword individually, we accept most keywords as identifiers.
    // The lexer already handles column-0 restrictions with predicates.
    // Only truly reserved keywords (control flow, structural) are excluded.
    : APPLICATION | CLASS | INTERFACE | DETAIL | FILE | FOOTER | FORM | GROUP | HEADER | ITEM | ITEMIZE
    | JOIN | MAP | MENU | MENUBAR | MODULE | OLE | OPTION | PARENT | QUEUE | RECORD | REPORT | SELF
    | SHEET | TAB | TOOLBAR | VIEW | WINDOW | PROJECT | TOOLBOX | PALETTE
    // Control types
    | BUTTON | ENTRY | TEXT | LIST | IMAGE | LINE | BOX | ELLIPSE | PANEL | PROGRESS | REGION
    | PROMPT | SPIN | CHECK | RADIO | COMBO | OCX | OLECONTROL | VBX
    // Data types  
    | STRING | CSTRING | PSTRING | ASTRING | BSTRING | USTRING
    | BYTE | SHORT | USHORT | LONG | ULONG | SIGNED | UNSIGNED
    | REAL | SREAL | DECIMAL | PDECIMAL | DATE | TIME | MEMO | BLOB | BOOL | ANY | VARIANT
    // Attributes and modifiers (all soft)
    | AT | USE | FROM | HIDE | DISABLE | READONLY | REQ | DEFAULT | CENTER | CENTERED | RESIZE
    | ICON | FONT | COLOR | TRN | IMM | INS | OVR | ALRT | TIMER | CURSOR | LINK | VCR | STD
    | MSG | HLP | TIP | KEY | NAME | TYPE | AUTO | OVER | DIM | PRE | BINDABLE
    | RAW | PASCAL | PROC | DLL | EXTERNAL | PRIVATE | PROTECTED | PUBLIC | INTERNAL | STATIC | THREAD
    | FLAT | BOXED | DROP | SCROLL | GRAY | FULL | ZOOOM | DOCK | DOCKED | NOFRAME | NOSHEET
    | MODAL | MDI | SYSTEM | MAXIMIZE | ICONIZE | WALLPAPER | PAGE | PAPER | LANDSCAPE | PREVIEW | ALONE | OEM | THOUS
    // File/database attributes
    | DRIVER | CREATE | RECLAIM | OWNER | ENCRYPT | BINARY | INDEX | OPT | DUP | NOCASE | PRIMARY
    | INNER | OUTER | FILTER | ORDER
    // Special method/field names that can conflict
    | FUNCTION | DATA | CODE | DISPOSE | REPLACE | DERIVED | VIRTUAL | IMPLEMENTS
    | LEFT | RIGHT  // Alignment/string methods
    // Structural keywords when used as identifiers
    | CONST | EQUATE | ONCE | STRUCT | ENUM | UNION | LIKE
    ;

// Allow keywords to be used as identifiers (Clarion allows this in many contexts)
// This includes IDENTIFIER plus all soft keywords
// Also include LABEL so qualified names at column 0 work
anyIdentifier
    : IDENTIFIER
    | LABEL
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

itemizeAttributes
    : structureAttribute (COMMA structureAttribute)*
    ;

classAttributes
    : classAttribute (COMMA classAttribute)*
    ;

interfaceAttributes
    : interfaceAttribute (COMMA interfaceAttribute)*
    ;

windowAttributes
    : windowAttribute (COMMA windowAttribute)*
    ;

controlAttributes
    : controlAttribute (COMMA controlAttribute)*
    ;

reportAttributes
    : (COMMA attribute)*
    ;

reportBandAttributes
    : (COMMA attribute)*
    ;

keyAttributes
    : attribute (COMMA attribute)*
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
    | ALRT (LPAREN expression? (COMMA expression?)* RPAREN)?  // Alert on keyboard/mouse events
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
    | FULL  // Full screen - can be used on SHEET controls
    | WIZARD  // Wizard-style sheet
    | NOSHEET  // No tab control appearance
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
    | BINARY
    | DLL (LPAREN expression? (COMMA expression?)* RPAREN)?
    | BINDABLE
    | TYPE  // Makes structure act as a TYPE definition for reuse
    | LIKE (LPAREN expression RPAREN)?
    | DRIVER (LPAREN expression (COMMA expression?)* RPAREN)?  // FILE-specific but allowed in variable context too
    | CREATE (LPAREN expression? RPAREN)?  // FILE-specific but allowed in variable context too
    | IDENTIFIER (LPAREN expression? (COMMA expression?)* RPAREN)?
    | IDENTIFIER
    ;

// Structure attributes (GROUP, QUEUE, CLASS, FILE)
structureAttribute
    : PRE (LPAREN expression? RPAREN)?
    | DIM (LPAREN expression (COMMA expression)* RPAREN)?
    | OVER (LPAREN expression? RPAREN)?
    | NAME (LPAREN expression RPAREN)?
    | STATIC
    | THREAD
    | TYPE (LPAREN RPAREN)?  // TYPE or TYPE() - compiler allows empty parens even though docs don't mention it
    | BINDABLE
    | EXTERNAL
    | AUTO
    | PRIVATE
    | PROTECTED
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
    | IMPLEMENTS (LPAREN argumentList? RPAREN)?
    | MODULE (LPAREN argumentList? RPAREN)?
    | LINK (LPAREN argumentList? RPAREN)?
    | DERIVED (LPAREN argumentList? RPAREN)?
    | DLL (LPAREN argumentList? RPAREN)?
    | VIRTUAL
    ;

// INTERFACE-specific attributes
interfaceAttribute
    : structureAttribute
    | TYPE
    | COM
    ;

// Generic attribute (fallback for unknown attributes and legacy support)
attribute
    : (IDENTIFIER | ALRT | AT | AUTO | BEVEL | BINARY | BINDABLE | BOXED | CAP | CENTER | CENTERED | CHECK | COLOR | COLUMN | CREATE | CURSOR | DECIMAL | DEFAULT 
      | DERIVED | DIM | DISABLE | DLL | DOCK | DOCKED | DOUBLE | DRIVER | DROP | DUP | ENCRYPT | EXTERNAL | FILL | FLAT | FONT | FORMAT 
      | FROM | FULL | GRAY | GRID | HIDE | HLP | HSCROLL | HVSCROLL | ICON | ICONIZE | IMM | IMPLEMENTS | INS | KEY | LEFT | LINK | MARK 
      | MASK | MAX | MAXIMIZE | MDI | MODAL | MODULE | MSG | NAME | NOBAR | NOCASE | NOFRAME | NOSHEET | ONCE | OPT | OVR | OVER | OWNER | PAPER | PASCAL | PASSWORD 
      | PRE | PRIMARY | PRIVATE | PROC | PROTECTED | RADIO | RANGE | RAW | READONLY | RECLAIM | REPLACE | REQ | RESIZE | RIGHT | SCROLL | SEPARATOR 
      | SINGLE | SKIP | STATIC | STATUS | STD | SYSTEM | THREAD | THOUS | TILED | TIMER | TIP | TRN | TOOLBOX | TYPE | UPR | USE | VALUE | VIRTUAL 
      | VSCROLL | WALLPAPER | WIZARD | INDEX | VCR | PALETTE) 
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
    : MULTIPLY? baseType
    | ANY
    | MULTIPLY? QUESTION  // Untyped/variant return type, with optional pointer
    | MULTIPLY? (FILE | KEY)  // Pointer to FILE or KEY
    | LIKE LPAREN ((QUALIFIED_IDENTIFIER | anyIdentifier | SELF) (DOT (QUALIFIED_IDENTIFIER | anyIdentifier))*) RPAREN  // Inherited data type - supports Type.field and SELF.field
    | (GROUP | QUEUE | CLASS) (LPAREN (IDENTIFIER | QUALIFIED_IDENTIFIER) RPAREN)?  // Structure with optional pre-defined type: GROUP(ContextType)
    ;

// Non-structure data types (excludes FILE/VIEW/RECORD which require & or are structures)
nonStructureDataType
    : MULTIPLY? nonStructureBaseType
    | ANY
    | LIKE LPAREN ((QUALIFIED_IDENTIFIER | anyIdentifier | SELF) (DOT (QUALIFIED_IDENTIFIER | anyIdentifier))*) RPAREN  // Supports Type.field and SELF.field
    | (GROUP | QUEUE | CLASS) (LPAREN (IDENTIFIER | QUALIFIED_IDENTIFIER) RPAREN)?
    ;

// Parameter types - same as baseType but WITHOUT size specifications
// In Clarion, parameters never include size: STRING pParam, not STRING(100) pParam
parameterBaseType
    : BYTE | SHORT | USHORT | LONG | ULONG | UNSIGNED | SIGNED
    | REAL | SREAL | DECIMAL | PDECIMAL
    | STRING | CSTRING | PSTRING | ASTRING | BSTRING
    | DATE | TIME | MEMO | BLOB | BOOL
    | FILE | VIEW | RECORD | KEY | REPORT | WINDOW  // Structure types that can be used as reference types
    | IDENTIFIER | QUALIFIED_IDENTIFIER  // User-defined types
    ;

parameterDataType
    : MULTIPLY? parameterBaseType
    | ANY
    | LIKE LPAREN ((QUALIFIED_IDENTIFIER | anyIdentifier | SELF) (DOT (QUALIFIED_IDENTIFIER | anyIdentifier))*) RPAREN  // Supports Type.field and SELF.field
    | (GROUP | QUEUE | CLASS) (LPAREN (IDENTIFIER | QUALIFIED_IDENTIFIER) RPAREN)?
    ;

baseType
    : BYTE (LPAREN expression RPAREN)?
    | SHORT (LPAREN expression RPAREN)?
    | USHORT (LPAREN expression RPAREN)?
    | LONG (LPAREN expression RPAREN)?
    | ULONG (LPAREN expression RPAREN)?
    | UNSIGNED (LPAREN expression RPAREN)?
    | SIGNED (LPAREN expression RPAREN)?
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
    | BOOL (LPAREN expression RPAREN)?
    | FILE  // FILE structure type (often used as reference: &FILE)
    | VIEW  // VIEW structure type (often used as reference: &VIEW)
    | RECORD  // RECORD structure type (often used as reference: &RECORD)
    | IDENTIFIER | QUALIFIED_IDENTIFIER  // User-defined types (e.g., PersonType or XF:DWORD)
    ;

// Base types excluding structure types (FILE, VIEW, RECORD)
// Used in variableDeclaration where structures need explicit declaration
nonStructureBaseType
    : BYTE (LPAREN expression RPAREN)?
    | SHORT (LPAREN expression RPAREN)?
    | USHORT (LPAREN expression RPAREN)?
    | LONG (LPAREN expression RPAREN)?
    | ULONG (LPAREN expression RPAREN)?
    | UNSIGNED (LPAREN expression RPAREN)?
    | SIGNED (LPAREN expression RPAREN)?
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
    | BOOL (LPAREN expression RPAREN)?
    | IDENTIFIER | QUALIFIED_IDENTIFIER  // User-defined types (e.g., PersonType or XF:DWORD)
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
    : LT MULTIPLY QUESTION parameterNameWithDefault? GT                        // Omittable untyped pointer: <*? pParent>
    | LT QUESTION parameterNameWithDefault? GT                                 // Omittable untyped parameter: <? pValue>
    | LT MULTIPLY? parameterDataType LBRACKET (COMMA)* RBRACKET parameterNameWithDefault? GT  // Omittable array parameter: <*String[]> or <Long[,]>
    | LT MULTIPLY? parameterDataType parameterNameWithDefault? GT              // Omittable parameter: <STRING pSep> or <*String pStr>
    | parameterDataType LBRACKET (COMMA)* RBRACKET parameterNameWithDefault?   // Array parameter: string[] or long[,] or byte[,,]
    | parameterDataType ((anyIdentifier | QUALIFIED_IDENTIFIER) (EQ expression)? | EQ expression)?      // Parameter with optional name and/or default: unsigned, unsigned pVal, unsigned=0, unsigned pVal=0, unsigned par:Name
    | MULTIPLY QUESTION parameterNameWithDefault?                              // Untyped pointer: *? pVal
    | QUESTION parameterNameWithDefault?                                       // Untyped parameter: ? pVal
    | MULTIPLY (parameterDataType | anyIdentifier) LBRACKET (COMMA)* RBRACKET parameterNameWithDefault?  // Pointer to array: *string[] or *long[,]
    | MULTIPLY (parameterDataType | anyIdentifier) parameterNameWithDefault?   // Pointer: *string pValue or *MyType pValue
    | AMPERSAND (anyIdentifier | QUALIFIED_IDENTIFIER)                         // Reference parameter (e.g., &QueueType)
    ;

// Parameter name with optional default value
parameterNameWithDefault
    : (anyIdentifier | QUALIFIED_IDENTIFIER) (EQ expression)?
    ;

returnType
    : COMMA MULTIPLY? dataType  // Support pointer return types: ,*STRING or ,STRING
    ;

componentList
    : LPAREN fieldRef (COMMA fieldRef)* RPAREN
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

