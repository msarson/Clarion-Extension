# Clarion Grammar Design Notes

## Overview

This document captures design decisions and observations while building the Clarion ANTLR grammar.

**IMPORTANT: This grammar targets Clarion Win32 only, NOT Clarion.NET**

Features excluded (Clarion.NET only):
- Exception handling (TRY/CATCH/FINALLY/THROW)
- NAMESPACE
- USING
- FOREACH
- GETTER/SETTER
- REF/OUT parameters
- PARAMS
- SYNCLOCK
- TRYAS
- CHECKED/UNCHECKED

## Key Language Characteristics

### Case Insensitivity
- Clarion keywords are case-insensitive
- Variable names are case-insensitive
- Use ANTLR's case-insensitive options

### Label-Based Structure
- Labels start at column 0
- Code is typically indented
- Labels can contain colons (e.g., `Class:Method`)

### Comments
- Single-line comments start with `!` or `|`
- No multi-line comments in standard Clarion

### Line Continuation
- Use `|` at end of line (with optional `&` prefix)
- Continues to next line

### String Literals
- Single quotes: `'Hello World'`
- Embedded quotes: `''` (doubled)
- No multi-line strings

### Implicit Typing
- Variables can have type suffixes: `$`, `#`, `"`
- Example: `MyVar$` for string, `Counter#` for numeric

### Picture Formats
- Special format specifiers: `@N10.2`, `@D10`, `@T5`, etc.
- Used for data formatting

## Structure Keywords

From `STRUCTURE_PATTERNS` in TokenPatterns.ts:

### Container Structures
- `APPLICATION` - Top-level application window
- `CLASS` - Object-oriented class definition
- `FILE` - File structure declaration
- `GROUP` - Compound data structure
- `INTERFACE` - Interface definition
- `MAP` - Procedure map/prototype section
- `MENU` / `MENUBAR` - Menu structures
- `QUEUE` - Dynamic array structure
- `RECORD` - File record layout
- `REPORT` - Report structure
- `SHEET` / `TAB` - Tabbed interface
- `TOOLBAR` - Toolbar definition
- `VIEW` - SQL view/join definition
- `WINDOW` - Window structure

### Control Flow Structures
- `ACCEPT` - Event processing loop
- `BEGIN` - Begin block
- `BREAK` - Report break group
- `CASE` - Case/switch statement
- `EXECUTE` - Execute statement
- `IF` - Conditional statement
- `LOOP` - Iteration loop
- `OPTION` / `ITEMIZE` - Option groups

### Report Structures
- `FORM` - Report form
- `DETAIL` - Detail band
- `HEADER` - Header band
- `FOOTER` - Footer band

## Reserved Words

From `LexEnum.ts` and documentation:

### Document Level
- `PROGRAM` - Main program
- `MEMBER` - Module member
- `MODULE` - Compiled module

### Procedure Declaration
- `PROCEDURE` - Procedure definition
- `FUNCTION` - Function (returns value)
- `ROUTINE` - Local routine

### Data Sections
- `DATA` - Data declaration section
- `CODE` - Executable code section

### Control Flow
- `IF`, `ELSIF`, `ELSE`, `END`
- `CASE`, `OF`, `OROF`
- `LOOP`, `WHILE`, `UNTIL`, `TIMES`, `TO`, `BY`
- `BREAK`, `CYCLE`, `EXIT`
- `GOTO`, `RETURN`
- `CHOOSE`, `EXECUTE`, `DO`
- `ACCEPT`, `THEN`

### OOP Keywords
- `CLASS`, `INTERFACE`
- `NEW`, `DISPOSE`
- `SELF`, `PARENT`
- `PROPERTY`, `INDEXER`
- `DERIVED`, `REPLACE`
- `PRIVATE`, `PROTECTED`
- `VIRTUAL`, `IMPLEMENTS`

### Logical Operators
- `AND`, `OR`, `NOT`, `XOR`

### Preprocessor
- `COMPILE`, `OMIT`
- `INCLUDE`, `SECTION`, `ENDSECTION`
- `PRAGMA`

### Special
- `CONST` - Constant declaration
- `EQUATE` - Equate definition
- `ITEMIZE` - Enumeration
- `ONCE` - Include once

## Data Types

From `tokenPatterns` Type pattern:

### Integer Types
- `BYTE` - 1 byte unsigned (0-255)
- `SHORT` - 2 bytes signed (-32768 to 32767)
- `USHORT` - 2 bytes unsigned (0-65535)
- `LONG` - 4 bytes signed
- `ULONG` - 4 bytes unsigned
- `SIGNED` - Signed integer
- `UNSIGNED` - Unsigned integer

### Floating Point
- `REAL` - 8 bytes (double precision)
- `SREAL` - 4 bytes (single precision)

### Decimal
- `DECIMAL` - Packed decimal
- `PDECIMAL` - Packed decimal (alias)

### String Types
- `STRING` - Fixed-length string
- `CSTRING` - Null-terminated string
- `PSTRING` - Pascal-style string (length prefix)
- `ASTRING` - Atomic string

### Date/Time
- `DATE` - Date value
- `TIME` - Time value

### Special
- `MEMO` - Large text field
- `BLOB` - Binary large object
- `BSTRING` - Binary string
- `ANY` - Variant type

## Attributes

Common attributes from `tokenPatterns`:

### Data Attributes
- `STATIC` - Static allocation
- `THREAD` - Thread-local storage
- `AUTO` - Automatic variable
- `CONST` - Constant
- `DIM` - Array dimensions
- `OVER` - Overlay on another variable
- `PRE` - Prefix for structure fields
- `NAME` - External name
- `BINDABLE` - Runtime binding
- `TYPE` - Type casting

### Procedure Attributes
- `PASCAL` - Pascal calling convention
- `C` - C calling convention
- `RAW` - Raw parameter passing
- `DLL` - External DLL procedure
- `PROC` - Procedure attribute
- `VIRTUAL` - Virtual method
- `PRIVATE` - Private access
- `PROTECTED` - Protected access
- `EXTERNAL` - External definition

### Control/File Attributes
- Many attributes (see TokenPatterns.ts line 83-85)
- Examples: `ALONE`, `AUTO`, `BINARY`, `CENTERED`, `CREATE`, etc.

## Operators

From `tokenPatterns` Operator pattern:

### Arithmetic
- `+` - Addition
- `-` - Subtraction / Negation
- `*` - Multiplication
- `/` - Division
- `%` - Modulo
- `**` - Power (likely)

### Comparison
- `=` - Equal / Assignment
- `<>` or `!=` - Not equal
- `<` - Less than
- `>` - Greater than
- `<=` - Less than or equal
- `>=` - Greater than or equal

### Logical
- `&` - Concatenation (string)
- `|` - Line continuation / Comment
- `~` - Bitwise NOT (likely)

### Bitwise
- `BAND` - Bitwise AND
- `BOR` - Bitwise OR
- `BXOR` - Bitwise XOR
- `BSHIFT` - Bit shift

### Special
- `:` - Label separator / Prefix notation
- `.` - Structure member access / Statement terminator
- `?` - Field equate prefix
- `&` - Reference operator
- `*` - Pointer dereference

## Delimiters

- `(` `)` - Parentheses (grouping, parameters)
- `[` `]` - Brackets (arrays)
- `{` `}` - Braces (rare in Clarion?)
- `,` - Comma (separators)
- `:` - Colon (labels, prefixes)
- `;` - Semicolon (rare)

## Constants

From tokenPatterns:
- `TRUE`, `FALSE` - Boolean
- `NULL` - Null value
- `LEVEL:BENIGN`, `LEVEL:NOTIFY`, `LEVEL:FATAL` - Error levels
- Icon/Button constants: `ICON:Asterisk`, `BUTTON:YES`, etc.
- Alignment: `CENTER`, `LEFT`, `RIGHT`

## Ambiguities and Edge Cases

### Structure Keywords as Identifiers
- Keywords like `FILE`, `QUEUE`, `RECORD` can be:
  - Structure declarations: `MyFile FILE`
  - Field names when qualified: `Invoice:Record`
- Solution: Use context-sensitive parsing

### Dot as Terminator vs Member Access
- `.` can be:
  - Statement terminator (standalone or after END)
  - Member access: `Object.Method`
- Solution: Check context and whitespace

### PROCEDURE Variants
From TokenTypes.ts:
- `GlobalProcedure` - Top-level with CODE
- `MethodDeclaration` - Inside CLASS/MAP (no CODE)
- `MethodImplementation` - `Class.Method PROCEDURE` with CODE
- `MapProcedure` - Inside MAP structure
- `InterfaceMethod` - Inside INTERFACE

### Picture Formats
- Complex syntax: `@N10.2`, `@D10`, `@T5`, `@P###-##-####P`, etc.
- Need careful regex extraction

### Label vs Variable
- Both start with letter/underscore
- Labels: Column 0, can have colons
- Variables: After whitespace, no leading colon

## Next Steps

1. Complete lexer rules (literals, operators)
2. Start with simple parser rules (program, procedure)
3. Add structure rules (CLASS, FILE, GROUP, etc.)
4. Add statement rules (IF, LOOP, CASE, etc.)
5. Add expression rules
6. Test with real Clarion code
