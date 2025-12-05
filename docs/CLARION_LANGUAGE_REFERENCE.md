# Clarion Language Reference

## Character Encoding and Case Sensitivity

### ANSI/ASCII Only
- **Clarion source files MUST use ANSI/ASCII characters only**
- **Unicode is strictly NOT allowed**
- All source code, comments, and string literals must be ANSI/ASCII
- This includes:
  - Variable names
  - Procedure names
  - Comments
  - String constants
  - All program text

### Case Sensitivity
- **Clarion is case-insensitive** for keywords, labels, and identifiers
- `IF`, `if`, and `If` are all equivalent
- Variable names, procedure names, labels are case-insensitive
- `MyVariable`, `myvariable`, and `MYVARIABLE` refer to the same variable
- String literals ARE case-sensitive: `'Hello'` ≠ `'hello'`

### Array Indexing and String Slicing
- **Square brackets `[]`** are used for array/string indexing and slicing
- **Syntax**: `Variable[index]` or `Variable[start : end]`
- Arrays are 1-based (first element is index 1)
- Examples:
  ```clarion
  MyArray[5]              ! Access element 5
  MyString[1 : 10]        ! Substring from position 1 to 10
  MyQueue[Index].Field    ! Access field in queue element
  MyArray[i + 1]          ! Expression as index
  ```

## Source File Structure

### Required First Statement
- Every **compilable** Clarion source file (compiled directly as part of a project) must begin with either `PROGRAM` or `MEMBER` as the first statement
- **PROGRAM or MEMBER must be on line 1 (the very first line of the file)**
- **No comments or any other content is allowed before PROGRAM/MEMBER**
- **Best practice**: Indent PROGRAM/MEMBER (not at column 0) - even the Clarion IDE formatter moves them away from column 0
- Required for compilation in a `.cwproj` file (Clarion uses MSBuild)

### Include Files
- Include files (`.inc`, `.equ`, or other extensions) do NOT require `PROGRAM` or `MEMBER` statements
- Include files are inserted into other source files using the `INCLUDE` statement
- Include files can contain:
  - Data declarations
  - Equates (constants)
  - Procedure prototypes
  - MAP structures
  - Any valid Clarion code that can be inserted at the include point

#### INCLUDE Statement
- Syntax: `INCLUDE('filename')` or `INCLUDE('filename'),ONCE`
- The `,ONCE` attribute prevents duplicate inclusion if the file is included multiple times
- Include files are processed at compile time, inserting their contents at the point of inclusion
- Example:
  ```clarion
    PROGRAM
INCLUDE('EQUATES.EQU'),ONCE
INCLUDE('PROTOTYPES.INC'),ONCE
GlobalVar LONG
    CODE
    ! Program code
  ```

#### Include File Example
```clarion
! File: CONSTANTS.EQU
! This file does NOT need PROGRAM or MEMBER
MaxRecords EQUATE(1000)
AppTitle   EQUATE('My Application')
```

```clarion
! File: MYPROCS.INC
! This file does NOT need PROGRAM or MEMBER
  MAP
MODULE('KERNEL32')
  GetTickCount PROCEDURE(),ULONG
  END
  END
```

### PROGRAM
- Indicates the source file contains the main program entry point
- Syntax: `PROGRAM`
- Only one PROGRAM file per application

### MEMBER
- Required as the first statement in any source file that is not a PROGRAM file
- Used for source modules containing procedures called by a PROGRAM
- Syntax: `MEMBER` or `MEMBER('program')`

#### MEMBER Syntax and Usage
```clarion
  MEMBER[(program)]
  [MAP
  [MODULE('library')
    ExternalProc PROCEDURE()
  END]
  LocalProc PROCEDURE()
  END]
[local data declarations]
[procedures]
```

#### MEMBER Parameters
- **program** (optional): String constant containing the filename (without extension) of the PROGRAM source file
  - If omitted, creates a "universal member module" that can be compiled in any program by adding it to the project
  - If omitted, you must have a MAP structure that prototypes the procedures it contains

#### MEMBER Structure Rules
1. **Local MAP**: May contain a local MAP structure with procedure declarations
   - Procedures declared in this MAP are available only to other procedures in the same MEMBER module
   - If source code for a procedure is in a separate file, the prototype must be in a MODULE structure within the MAP
   
2. **Local Data**: Data declared after MEMBER and before the first PROCEDURE statement is Member Local data
   - Can only be accessed by procedures within the module (unless passed as a parameter)
   - Memory allocation is Static
   
3. **Procedures**: Source code for the procedures in the MEMBER module

#### MEMBER Examples
```clarion
! Universal member module
  MEMBER
  MAP
LocalHelper PROCEDURE(LONG pValue)
  END
SharedData LONG,STATIC

LocalHelper PROCEDURE(LONG pValue)
  CODE
  RETURN pValue * 2

MainProc PROCEDURE()
  CODE
  SharedData = LocalHelper(10)
  RETURN
```

```clarion
! Member bound to specific program
  MEMBER('MyApp')
  MAP
MODULE('KERNEL32')
  GetTickCount PROCEDURE(),ULONG
  END
UtilityProc PROCEDURE()
  END

UtilityProc PROCEDURE()
  CODE
  MESSAGE('Tick count: ' & GetTickCount())
  RETURN
```

## Column Rules and Source Code Structure

### Column 0 (Column One) Rules
- **All labels must start at column 0** (first column)
- Labels include:
  - Variable definitions
  - Procedure declarations
  - Procedure implementations
  - Member implementations/definitions
  - Data structure declarations (GROUP, QUEUE, FILE, etc.)

### Keywords That Must NOT Be at Column 0
- **MAP, END, and dot (.) terminators must NOT be at column 0**
- These keywords/terminators must be indented (at least one space)
- Best practice: Follow the Clarion IDE formatter conventions for indentation
- Examples:
  ```clarion
  MyProc PROCEDURE()
LocalVar LONG
    CODE
    IF x > 0 THEN
      y = 1
    .              ! Dot terminator - indented, not at column 0
    RETURN
  
MyData GROUP
Field1 LONG
  END            ! END terminator - indented, not at column 0
  ```

### Column 0 vs Indented Elements Summary
| Must be at Column 0 | Must be Indented (NOT column 0) |
|---------------------|----------------------------------|
| Variable labels | MAP |
| Procedure names | END |
| GROUP/QUEUE/FILE labels | Dot (.) terminators |
| ROUTINE labels | Module-level: PROGRAM, MEMBER (best practice) |

### CODE Section Rule
- In PROCEDURE/MEMBER implementations, **all data definitions must appear before the CODE statement**
- **Procedures and methods never use a DATA keyword** - everything before CODE is considered a data definition
- The CODE keyword marks the beginning of executable statements
- Example:
  ```clarion
  MyProc PROCEDURE()
! Everything here is data definition (no DATA keyword needed)
LocalVar LONG
TempString STRING(100)
    CODE
    ! Executable statements go here
    LocalVar = 10
    RETURN
  ```

## Data Declaration Areas and Scope

There are four general areas where data can be declared in a Clarion program:

### 1. Global Data (PROGRAM Module)
- **Location**: In the PROGRAM module, after the keyword PROGRAM and before the CODE statement
- **Visibility**: Visible to every PROCEDURE in the PROGRAM
- **Scope**: Always in scope
- **Memory Allocation**: Static memory
- **Availability**: Available to every PROCEDURE in the PROGRAM

```clarion
  PROGRAM
GlobalCounter LONG
GlobalName STRING(100)
  CODE
  ! Program code
```

### 2. Module Data (MEMBER Module)
- **Location**: In a MEMBER module, after the keyword MEMBER and before the first PROCEDURE statement
- **Visibility**: Visible only to the set of PROCEDUREs contained in the MEMBER module
- **Scope**: Comes into scope when any PROCEDURE in the MODULE is called
- **Memory Allocation**: Static memory
- **Parameters**: May be passed as a parameter to PROCEDUREs in other MEMBER modules, if required

```clarion
  MEMBER('MyApp')
ModuleCounter LONG
ModuleData STRING(50)

MyProc PROCEDURE()
  CODE
  ModuleCounter += 1
```

### 3. Local Data (PROCEDURE)
- **Location**: In a PROCEDURE, after the keyword PROCEDURE and before the CODE statement
- **Important**: Procedures do NOT use a DATA keyword; everything before CODE is considered a data definition
- **Visibility**: Visible only within the PROCEDURE in which it is declared, or any Local Derived Methods declared within the PROCEDURE
- **Scope**: Comes into scope when the PROCEDURE is called; goes out of scope when a RETURN statement executes
- **Memory Allocation**: Dynamic memory
  - Stack allocation for variables smaller than the stack threshold (5K default)
  - Heap allocation for variables larger than the threshold
  - Can be overridden with the STATIC attribute to make values persistent between calls
  - FILE declarations are always allocated static memory (on the heap), even in Local Data sections
- **Parameters**: May be passed as a parameter to any other PROCEDURE
- **Recursion**: Allows true recursion, receiving a new copy of local variables each time called

```clarion
MyProc PROCEDURE(LONG pParam)
! Everything here is data definition (no DATA keyword)
LocalVar LONG
LocalStr STRING(100)
StaticVar LONG,STATIC        ! Persists between calls
LocalFile FILE,DRIVER('DOS') ! Always static/heap allocation
  CODE
  ! Executable statements start here
  LocalVar = pParam
  RETURN
```

### 4. Routine Local Data (ROUTINE)
- **Location**: In a ROUTINE, after the keyword DATA and before the CODE statement
- **Visibility**: Visible only within the ROUTINE in which it is declared
- **Scope**: Comes into scope when the ROUTINE is called; goes out of scope when an EXIT statement executes
- **Memory Allocation**: Dynamic memory
  - Stack allocation for variables smaller than the stack threshold (5K default)
  - Heap allocation for variables larger than the threshold
- **Parameters**: May be passed as a parameter to any PROCEDURE
- **Name Scope**: ROUTINE has its own name scope; labels may duplicate variable names used in other ROUTINEs or the containing procedure
- **Restrictions**: Variables declared in a ROUTINE may NOT have the STATIC or THREAD attributes

#### ROUTINE Syntax
```clarion
RoutineLabel ROUTINE
[DATA
[local data declarations]
CODE]
[statements]
```

#### ROUTINE Rules
- **Location**: Must be at the end of the CODE section of the PROCEDURE to which it belongs
- **Calling**: Called using `DO RoutineLabel`
- **Termination**: A ROUTINE is terminated by:
  - End of source module
  - Another ROUTINE or PROCEDURE declaration
  - Implicit EXIT at the end of the routine implementation (EXIT keyword not required)
  - Explicit EXIT statement (only needed to exit early from the routine)
- **DATA/CODE Keywords**:
  - If the ROUTINE has a DATA statement as the first entry after the label, then CODE is required before executable statements
  - If the ROUTINE does NOT have a DATA statement, CODE is not required and all statements are compiled as code
  - **Clarion#**: DATA and CODE keywords are required
- **Visibility**: All variables visible to the containing PROCEDURE are available in the ROUTINE (Procedure Local, Module Local, and Global data)

#### ROUTINE Examples
```clarion
MyProc PROCEDURE()
ProcVar LONG
  CODE
  ProcVar = 10
  DO MyRoutine
  DO SimpleRoutine
  RETURN
  
! ROUTINE with local data (requires DATA and CODE)
MyRoutine ROUTINE
DATA
RoutineVar LONG              ! Separate scope from ProcVar
ProcVar    STRING(20)        ! Legal: duplicates procedure's ProcVar name
CODE
  RoutineVar = 5
  ProcVar = 'Text'           ! This is the STRING, not the LONG
  ! Implicit EXIT here (no EXIT keyword needed)

! ROUTINE without local data (no DATA/CODE needed)
SimpleRoutine ROUTINE
  MESSAGE('Simple routine')
  ProcVar += 1               ! Access procedure's ProcVar
  ! Implicit EXIT here (no EXIT keyword needed)
  
! ROUTINE with early exit
CheckRoutine ROUTINE
  IF ProcVar = 0
    EXIT                     ! Early exit if condition met
  .
  MESSAGE('ProcVar is not zero')
  ! Implicit EXIT here
```

#### ROUTINE Efficiency Considerations
- `DO` and `EXIT` statements are very efficient
- Accessing procedure-level local data is less efficient than accessing module-level or global data
- Implicit variables used only within the ROUTINE are less efficient than using local variables
- Each `RETURN` statement within a ROUTINE incurs a 40-byte overhead

### Data Scope Summary Table

| Scope | Location | Visibility | Memory | Lifetime |
|-------|----------|------------|--------|----------|
| **Global** | PROGRAM module | All procedures | Static | Entire program |
| **Module** | MEMBER module | Procedures in same MEMBER | Static | First call to any procedure in module |
| **Local** | PROCEDURE | Within procedure only | Dynamic* | During procedure execution |
| **Routine Local** | ROUTINE | Within routine only | Dynamic | During routine execution |

*Local data: Stack (< 5K default) or Heap (≥ 5K); FILE always heap; STATIC attribute makes persistent

### Question Mark (?) Special Usage
- When `?` appears as a **single character in column 0** (column one), the following statement only executes in DEBUG mode
- `?` is also used to begin field equate labels in other contexts
- Example:
  ```clarion
  MyProc PROCEDURE()
    CODE
    x = 10
?  Message('Debug mode: x = ' & x)  ! Only executes in DEBUG mode
    RETURN
  ```

## Dot (.) as Structure Terminator

- A dot `.` is used to end structures instead of the `END` keyword
- The dot can appear on the same line as the structure or on a separate line by itself
- Any structure that normally requires `END` can use a dot instead
- Examples:
  ```clarion
  ! IF statement with dot on same line
  IF A = B THEN C = D.
  
  ! IF statement with END on same line (space separates, no semicolon needed)
  IF A = B THEN Message('Equal') END
  
  ! GROUP with dot on same line
  MyGroup GROUP(DerivedGroupType).
  
  ! GROUP with dot on separate line
  MyGroup GROUP
Field1 LONG
Field2 STRING(20)
  .
  
  ! LOOP with dot
  LOOP
    x += 1
    IF x > 10 THEN BREAK.
  .
  ```

## Semicolon (;) as Statement Separator

- A semicolon `;` separates multiple statements on the same line
- Allows writing compact code with multiple statements per line
- **Required** when multiple statements appear on the same line (space alone is not sufficient)
- Exception: `END` keyword can follow a statement with just a space separator
- Examples:
  ```clarion
  ! Multiple statements require semicolons
  a = 1; b = 2; c = 3
  
  ! END can follow with just a space (no semicolon needed)
  IF A = B THEN Message('Equal') END
  ```

## Line Breaks

- By default, line breaks act as statement terminators
- Multiple statements can appear on separate lines without explicit terminators
- Example:
  ```clarion
  x = 5
  y = 10
  z = 15
  ```

## Procedures

### PROCEDURE Declaration
- Procedures are declared with the `PROCEDURE` keyword
- **Procedures do NOT have END statements**
- A procedure is implicitly terminated when:
  - Another procedure begins
  - End of file is reached
  
### PROCEDURE Syntax
```clarion
ProcedureName PROCEDURE([parameters])[,attributes]
[local data declarations]
  CODE
  [statements]
  [ROUTINE definitions]
! Next procedure or ROUTINE or EOF implicitly ends this procedure
```

**Procedure Attributes:**
Procedures can have multiple attributes specified after the parameter list, separated by commas:
- **Return type:** Data type keyword (BYTE, SHORT, LONG, STRING, etc.)
- **NAME('exported_name'):** Specifies exported DLL function name
- **PROC:** Indicates procedure attribute
- **Other attributes:** PRIVATE, EXTERNAL, VIRTUAL, etc.

**Attribute Order:**
The return type can appear **anywhere** in the attribute list:
```clarion
! All of these are valid:
MyProc PROCEDURE(),LONG,NAME('MyProc')           ! Return type first
MyProc PROCEDURE(),NAME('MyProc'),LONG           ! Return type last  
MyProc PROCEDURE(),PROC,LONG,NAME('MyProc')     ! Return type middle
```

**IMPORTANT:**
- **PROCEDURE implementations do NOT have END statements**
- **A PROCEDURE ends when:**
  - Another PROCEDURE implementation starts
  - A ROUTINE implementation starts  
  - End of file (EOF) is reached
- **RETURN statement:**
  - Only REQUIRED if PROCEDURE has a return type (e.g., `,LONG`, `,STRING`)
  - If no return type specified, RETURN is optional (implicit return at end)
  - If return type specified, RETURN must provide a value

### Example
```clarion
TestProc PROCEDURE()
a LONG
b LONG
  CODE
  a = 1
  b = 2
  RETURN

AnotherProc PROCEDURE()
  CODE
  ! Previous procedure implicitly ended
```

## Structures That Require END

### Dot (.) as Structure Terminator
- The dot `.` is an alternative to the `END` keyword for closing structures
- **The dot terminates ONLY the immediately enclosing structure**
- Can appear inline with the last statement: `IF a = 1 THEN b = 2.`
- Or on its own line (must be indented, NOT at column 0)
- **Only the dot character itself is the terminator** - trailing whitespace and comments are separate
- Works for any structure that accepts END: IF, LOOP, GROUP, etc.

Examples:
```clarion
! Inline dot terminator
IF x > 10 THEN y = 5.

! Dot on its own line
IF a = 1
  b = 2
  c = 3
.

! Nested structures with mixed END and dot
IF condition1
  LOOP
    IF condition2 THEN BREAK.
  END
.
```

### Control Structures
The following structures **require** an `END` statement (or `.` terminator) to close them:

#### LOOP
- The LOOP structure can be terminated in three ways:
  1. `END` or `.` keyword
  2. `WHILE condition` - post-fix loop condition (evaluates at end of loop)
  3. `UNTIL condition` - post-fix loop condition (evaluates at end of loop)

```clarion
! Standard LOOP with END
LOOP
  [statements]
END

! LOOP with WHILE terminator
LOOP
  [statements]
WHILE condition

! LOOP with UNTIL terminator  
LOOP
  [statements]
UNTIL condition

! FOR-style LOOP with counter
LOOP x = 1 TO 10
  [statements]
END

! FOR-style with WHILE/UNTIL
LOOP x = 1 TO 10 BY 2
  [statements]
WHILE condition
```

**Important**: `WHILE` and `UNTIL` are loop terminators when they appear at the LOOP level, not conditions inside the loop body.

#### IF/ELSIF/ELSE
- Only the `IF` statement requires `END` or `.` to close the entire structure
- `ELSIF` and `ELSE` do NOT require their own `END` or `.`
- The single `END` or `.` closes the entire IF/ELSIF/ELSE structure
- **THEN keyword**: Optional keyword after the condition
  - Provides syntactic clarity but does NOT affect structure
  - A statement MUST follow THEN (can be on same line or next line)
  - Common patterns:
    - `IF a = 1 THEN RETURN.` - statement on same line with dot terminator
    - `IF a = 1 THEN b = 2.` - inline assignment with dot terminator
    - `IF a = 1 THEN b = 2 END` - inline with END (space separates)
    - `IF a = 1 THEN` followed by statements on next lines

```clarion
IF condition
  [statements]
ELSIF condition
  [statements]
ELSE
  [statements]
END

! Or with dot terminator
IF condition THEN [statement]
  [more statements]
.

! Inline forms
IF a = 1 THEN RETURN.
IF x > 10 THEN y = 5.
IF valid THEN process() END
```

#### CASE
```clarion
CASE expression
OF value1
  [statements]
OF value2
  [statements]
ELSE
  [statements]
END
```

#### EXECUTE
```clarion
EXECUTE index
  [statements]
  [statements]
  [statements]
END
```

#### BEGIN/END (Code Block)
```clarion
BEGIN
  [statements]
END
```

### Data Structures That Require END

#### GROUP
```clarion
GroupName GROUP
Field1 LONG
Field2 STRING(20)
END
```

#### QUEUE
```clarion
QueueName QUEUE
Field1 LONG
Field2 STRING(20)
END
```

#### FILE
```clarion
FileName FILE,DRIVER('TOPSPEED')
Record RECORD
  Field1 LONG
  Field2 STRING(20)
END
END
```

#### RECORD
```clarion
RecordName RECORD
Field1 LONG
Field2 STRING(20)
END
```

#### CLASS
```clarion
ClassName CLASS
Property1 LONG
Method1 PROCEDURE()
END
```

#### INTERFACE
```clarion
InterfaceName INTERFACE
Method1 PROCEDURE()
END
```

#### MODULE
```clarion
ModuleName MODULE('filename')
Procedure1 PROCEDURE()
END
```

#### MAP
```clarion
  MAP
MODULE('library')
  ExternalProc PROCEDURE()
  END
  END
```

## Comments

### Single Line Comments
- Use `!` for single-line comments
- Everything after `!` on that line is a comment
```clarion
! This is a comment
a = 1  ! This is also a comment
```

### Multi-line Comments (Documentation)
- Use `|` for documentation comments
- Typically used before procedures or data declarations
```clarion
|PROCEDURE: MyProc
|PURPOSE: Does something important
|PARAMETERS: None
MyProc PROCEDURE()
```

## File Extensions

- `.clw` - Clarion source files
- `.inc` - Clarion include files
- `.equ` - Clarion equate files (constants)

## Common Keywords

### Data Types
- `BYTE` - 1-byte unsigned integer (0-255)
- `SHORT` - 2-byte signed integer
- `USHORT` - 2-byte unsigned integer
- `LONG` - 4-byte signed integer
- `ULONG` - 4-byte unsigned integer
- `REAL` - 4-byte floating point
- `SREAL` - 8-byte floating point
- `DECIMAL` - Packed decimal
- `PDECIMAL` - Packed decimal
- `STRING` - Fixed-length string
- `CSTRING` - Null-terminated string
- `PSTRING` - Pascal-style string (length prefix)

### Control Flow
- `IF`, `ELSIF`, `ELSE`
- `LOOP`, `WHILE`, `UNTIL`
- `CASE`, `OF`
- `EXECUTE`
- `BREAK` - Exit loop
- `CYCLE` - Continue to next iteration
- `RETURN` - Exit procedure
- `EXIT` - Exit application

### Data Declaration
- `GROUP` - Group of related fields
- `QUEUE` - Dynamic array/table
- `FILE` - File declaration
- `RECORD` - Record structure
- `CLASS` - Object-oriented class
- `INTERFACE` - Interface definition
- `MODULE` - External module reference
- `MAP` - External procedure mapping

### Scope Modifiers
- `LOCAL` - Local variable/procedure
- `GLOBAL` - Global variable/procedure  
- `EXTERNAL` - External declaration
- `STATIC` - Static variable (retains value between calls)
- `THREAD` - Thread-local variable

### Procedure Types
- `PROCEDURE` - Standard procedure
- `FUNCTION` - Procedure that returns a value (synonym for PROCEDURE)
- `ROUTINE` - Internal labeled section within a procedure

## MAP Structures

### Purpose
- MAP structures contain prototypes which declare PROCEDUREs and external source modules
- Used in PROGRAM, MEMBER module, or PROCEDURE (but not for members of a CLASS structure)
- Declares which procedures are available for use

### MAP Scope Levels

#### 1. Global MAP (PROGRAM Module)
- Declared in the PROGRAM source module
- Prototypes are available throughout the entire program
- Example:
  ```clarion
    PROGRAM
  MAP
LoadIt PROCEDURE
SaveIt PROCEDURE(STRING pFilename)
  END
  ```

#### 2. Module MAP (MEMBER Module)
- Declared in a MEMBER module
- Prototypes are explicitly available only in that MEMBER module
- The same prototypes may be placed in multiple MEMBER modules to make them available in each
- Example:
  ```clarion
    MEMBER('Sample')
  MAP
ComputeIt PROCEDURE
HelperProc PROCEDURE(LONG pValue)
  END
  
ComputeIt PROCEDURE
LOC:Var LONG
    CODE
    ! Implementation
  ```

#### 3. Local MAP (PROCEDURE)
- Declared within a PROCEDURE
- Prototypes are available only within that PROCEDURE
- Example:
  ```clarion
  MyProc PROCEDURE()
  MAP
LocalHelper PROCEDURE(STRING pData)
  END
    CODE
    LocalHelper('test')
  ```

### MODULE Structure Within MAP
- MODULE declares an external source module that contains procedure definitions
- Used to reference procedures from external libraries or separate compilation units
- **MODULE termination rules**:
  - **Inside MAP**: MODULE must be terminated with `END`
  - **Inside CLASS**: MODULE does NOT require a terminator
- Syntax:
  ```clarion
  MAP
MODULE('library_name')
  ExternalProc PROCEDURE([parameters])
  END              ! MODULE END required inside MAP
  END              ! MAP END
  ```
  ```clarion
  MyClass CLASS
MODULE('library_name')
  ExternalProc PROCEDURE([parameters])
  ! No END for MODULE inside CLASS
  END              ! CLASS END only
  ```

### Automatic Includes
- **BUILTINS.CLW**: Automatically included in every PROGRAM's MAP structure by the compiler
  - Contains prototypes of most Clarion internal library procedures
  - Makes the compiler more efficient by not having these built-in
- **EQUATES.CLW**: Also automatically included
  - Contains constant EQUATEs used by BUILTINS.CLW
- This is why a MAP structure is mandatory for any non-trivial Clarion program

### MAP Examples

#### Global and Module MAP
```clarion
! File: sample.cla
  PROGRAM
  MAP
LoadIt PROCEDURE
  END
GlobalData LONG
  CODE
  LoadIt()
```

```clarion
! File: separate file
  MEMBER('Sample')
  MAP
ComputeIt PROCEDURE
  END

ComputeIt PROCEDURE
LOC:Var LONG
  CODE
  LOC:Var = 10
```

---

## Conditional Compilation Directives

### OMIT and COMPILE
- Control which sections of source code are included or excluded from compilation
- Use terminator strings to mark the end of a block
- Support conditional expressions based on EQUATE values
- Can be nested up to 8 levels deep (plus one additional level for omitted code)
- **IMPORTANT**: Not compatible with ABC Application Class Parser

### OMIT Directive
- Excludes a block of source code from compilation
- Syntax: `OMIT(terminator [,expression])`
- The entire line containing the terminator is included in the OMIT block
- Block executes (code is omitted) when expression evaluates to TRUE
- If expression contains undefined EQUATE, it's assumed to be 0

#### Terminator String Matching Rules
- **CASE-SENSITIVE**: The terminator string must match exactly (including case)
  - Unlike Clarion keywords (which are case-insensitive), terminator strings use **exact string comparison**
  - `'**END**'` will NOT match `**end**` or `**End**`
- **SUBSTRING SEARCH**: The terminator can appear **anywhere** on the line
  - Doesn't need to start at column 0
  - Can be in code, comments, or standalone
  - Can have other text before or after it
- **The entire terminating line is included in the OMIT/COMPILE block**
- Examples:
  ```clarion
  OMIT('**END**')
    code here
  **END**                    ! ✅ Valid - exact match
  
  OMIT('**END**')
    code here
  ! **END**                  ! ✅ Valid - in comment
  
  OMIT('**END**')
    code here
    SomeCode() **END**       ! ✅ Valid - after code
  
  OMIT('**END**')
    code here
  **end**                    ! ❌ INVALID - case mismatch
  
  OMIT('EndOfFile')
    code here
  ! EndOfFile                ! ✅ Valid - string found in comment
  ```

#### OMIT Examples
```clarion
! Unconditional OMIT (always omit the block)
OMIT('**END**')
  ! This code is never compiled
  Message('Debug Info')
**END**

! Conditional OMIT (omit only if _WIDTH32_ is true)
OMIT('***',_WIDTH32_)
  SIGNED EQUATE(SHORT)    ! Only for 16-bit
***

! Complex conditional with comparison operator
Demo EQUATE(0)
OMIT('EndDemoChk',Demo = 0)  ! Omit when Demo is off
  DO DemoCheck
! EndDemoChk

! Conditional OMIT with undefined EQUATE
OMIT('EndOfFile',OnceOnly)   ! Compiles first time (OnceOnly assumed 0)
  ! Code here compiled first pass only
OnceOnly EQUATE(1)            ! Defined after OMIT
! EndOfFile
```

### COMPILE Directive
- Includes a block of source code in compilation (opposite of OMIT)
- Syntax: `COMPILE(terminator [,expression])`
- Block executes (code is compiled) when expression evaluates to TRUE
- Without expression parameter, COMPILE is redundant (all code compiles by default)
- If expression contains undefined EQUATE, it's assumed to be 0

#### COMPILE Examples
```clarion
! Conditional COMPILE (compile only if _WIDTH32_ is true)
COMPILE('***',_WIDTH32_)
  SIGNED EQUATE(LONG)      ! Only for 32-bit
  UNSIGNED EQUATE(ULONG)
***

! Complex conditional expression
Demo EQUATE(1)
COMPILE('EndDemoChk',Demo = 1)  ! Compile when Demo is on
  DO DemoCheck
! EndDemoChk
```

### Supported Conditional Operators
Both OMIT and COMPILE support these comparison operators:
- `<equate>` - Check if EQUATE is non-zero
- `<equate> = <integer>` - Equal to
- `<equate> <> <integer>` - Not equal to
- `<equate> > <integer>` - Greater than
- `<equate> < <integer>` - Less than
- `<equate> >= <integer>` - Greater than or equal
- `<equate> <= <integer>` - Less than or equal

### Nested OMIT/COMPILE
```clarion
! Outer COMPILE for 32-bit builds
COMPILE ('**32bit**',_width32_)

  ! Inner COMPILE for debug mode
  COMPILE ('*debug*',_debug_)
    DEBUGGER::BUTTONLIST Equate('&Continue|&Halt|&Debug')
  !end- COMPILE ('*debug*',_debug_)

  ! Inner OMIT for debug mode (opposite logic)
  OMIT ('*debug*',_debug_)
    DEBUGGER::BUTTONLIST Equate('&Continue|&Halt')
  !end- OMIT ('*debug*',_debug_)

!end- COMPILE ('**32bit**',_width32_)

! Alternative OMIT for non-32-bit builds
OMIT ('**32bit**',_width32_)
  DEBUGGER::BUTTONLIST Equate('&Continue|&Halt')
!end- OMIT ('**32bit**',_width32_)
  RETURN
```

---

## CLASS and INTERFACE Structures

### Purpose
- CLASS and INTERFACE are structure declarations that group data members and method prototypes
- Similar to MAP, they contain member/method declarations, NOT implementations
- Used for object-oriented programming in Clarion
- Must be terminated with END or dot (.)

### CLASS Structure

**Definition:**
```clarion
ClassName        Class(), type, [attributes]
! Data members
Field1             Type
Field2             Type
! Method prototypes
Method1            PROCEDURE([parameters])
Method2            PROCEDURE([parameters]),ReturnType
                 End
```

**Key Rules:**
1. **Termination**: CLASS structures MUST be terminated with `END` or `.`
2. **Method Declarations**: PROCEDURE tokens inside CLASS are prototypes, NOT implementations
3. **Scope Boundary**: PROCEDURE/METHOD declarations inside CLASS do NOT start new scope boundaries
4. **MODULE Attribute**: CLASS can have MODULE attribute: `Class(), Module('file.clw')`
5. **No CODE**: CLASS structures cannot contain CODE sections - only declarations
6. **Members Before END**: All members and methods must be declared before the terminating END

### Examples

**Simple CLASS:**
```clarion
Person           Class(), type
Name               STRING(50)
Age                LONG
GetName            PROCEDURE(),STRING
SetAge             PROCEDURE(LONG pAge)
                 End
```

**CLASS with MODULE (External Implementation):**
```clarion
StringTheory     Class(), type, Module('StringTheory.clw'), Link('StringTheory.clw')
value              &string,PRIVATE
streamFileName     &string,PRIVATE
Append             PROCEDURE(STRING pValue)
GetValue           PROCEDURE(),STRING
                 End
```

**INTERFACE Structure:**
```clarion
ILogger          Interface
LogMessage         PROCEDURE(STRING pMessage)
LogError           PROCEDURE(STRING pError)
                 End
```

### Comparison with MAP

| Feature | MAP | CLASS |
|---------|-----|-------|
| Purpose | Procedure prototypes | Object definition with data + methods |
| Contains | Only PROCEDURE declarations | Data members + PROCEDURE declarations |
| Implementations | External (in MEMBER files) | Can be external (MODULE) or inline |
| Termination | Requires END | Requires END or . |
| MODULE Inside | MODULE needs END | MODULE does NOT need END |
```

#### MAP with MODULE for External Libraries
```clarion
  MAP
MODULE('KERNEL32')
  GetTickCount PROCEDURE(),ULONG,PASCAL,RAW,NAME('GetTickCount')
  Sleep PROCEDURE(ULONG dwMilliseconds),PASCAL,RAW,NAME('Sleep')
  END
MODULE('USER32')
  MessageBoxA PROCEDURE(ULONG hWnd,*CSTRING lpText,*CSTRING lpCaption,ULONG uType),LONG,PASCAL,RAW,NAME('MessageBoxA')
  END
MyLocalProc PROCEDURE(STRING pName)
  END
```

### Syntax
```clarion
  MAP
INCLUDE('filename.inc')
MODULE('library')
  ExternalProc PROCEDURE([parameters])
  END
InternalProc PROCEDURE([parameters])
  END
```

### Example
```clarion
  MAP
MODULE('KERNEL32')
  GetTickCount PROCEDURE(),ULONG,PASCAL,RAW,NAME('GetTickCount')
  END
MyLocalProc PROCEDURE(STRING pName)
  END
```

## Common Conventions

### Naming
- Variables often use mixed case: `MyVariable`, `CustomerName`
- Prefixes sometimes used: `p` for parameters, `loc:` for local variables
- Constants often use ALL_CAPS or UPPER:Lower format

### Indentation
- Typically 2 spaces per indent level
- Structures like LOOP, IF are indented
- Data declarations in structures are indented

### CODE Section
- Procedures have a `CODE` section where executable statements begin
- Data declarations appear before the `CODE` keyword
